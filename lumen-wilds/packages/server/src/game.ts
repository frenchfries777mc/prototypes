import { randomBytes } from 'node:crypto';
import {
  AOI_ENTER, AOI_LEAVE, ATTACK_ARC, ATTACK_COOLDOWN_TICKS, ATTACK_RANGE, C, CHUNK, DIRS, DIR_NONE, DT,
  EntityKind, FLAG_ATTACK, FLAG_HURT, ITEM_COUNT, Item, MAX_CHAT, MAX_NAME, MOBS, NODE_SYNC_RADIUS, NodeType,
  PLAYER_SPEED, POTION_HEAL, Recipe, S, SAFE_ZONE, SNAPSHOT_EVERY, TICK_RATE, World, angleToByte, chunkOf,
  encodeServer, keyX, keyY, maxHpForLevel, mobForBiome, moveBy, moveDir, mulberry32, nodeHits, playerDamage,
  recipeCost, tileKey, xpForLevel,
  type ClientMsg, type EntityFull, type EntityUpdate, type MobDef, type NodeChunk, type ServerMsg,
} from '@lw/shared';
import type { PlayerSave, Store } from './store';

/** 전송 계층과 게임 로직을 분리하기 위한 최소 연결 인터페이스. */
export interface Conn {
  send(data: Uint8Array): void;
  close(): void;
  /** 아직 소켓으로 나가지 못하고 쌓여 있는 바이트 수. */
  buffered(): number;
}

interface Ent {
  id: number; kind: number; x: number; y: number; facing: number;
  hp: number; maxHp: number; flags: number; level: number; name: string;
  cell: number;
}

interface Known { x: number; y: number; f: number; hp: number; stamp: number; }

interface Player extends Ent {
  conn: Conn; token: string;
  queue: { seq: number; dir: number }[];
  budget: number; lastSeq: number; reset: number;
  attackReady: number; lastHurt: number; lastChat: number;
  xp: number; weapon: number; armor: number; inv: number[];
  statsDirty: boolean;
  known: Map<number, Known>;
  nodeChunks: Set<number>; lastChunk: number;
}

interface Mob extends Ent {
  def: MobDef; homeX: number; homeY: number; chunk: number;
  target: number; attackReady: number;
  wanderX: number; wanderY: number; wanderUntil: number; returning: boolean;
}

const CELL = 8;
const cellOf = (x: number, y: number) => tileKey(Math.floor(x / CELL), Math.floor(y / CELL));
const SPAWN = { x: 0.5, y: 0.5 };
const MOB_CAP_PER_CHUNK = 2;
const MOB_LEASH = 14;
const NODE_RESPAWN_TICKS = 60 * TICK_RATE;
const CHAT_RANGE = 40;
const MAX_QUEUE = 12;
const MAX_BUDGET = 6;
const BACKPRESSURE_SKIP = 256 * 1024;
const BACKPRESSURE_KICK = 4 * 1024 * 1024;

export class Game {
  readonly world: World;
  tick = 0;
  private nextId = 1;
  private players = new Map<Conn, Player>();
  private byToken = new Map<string, Player>();
  private ents = new Map<number, Ent>();
  private mobs = new Map<number, Mob>();
  private grid = new Map<number, Set<Ent>>();
  private mobChunks = new Map<number, { count: number; next: number }>();
  /** 고갈된 노드: 타일 키 → 되살아날 틱. */
  private depleted = new Map<number, number>();
  private depletedByChunk = new Map<number, Set<number>>();
  private nodeDamage = new Map<number, { hits: number; tick: number }>();
  private dying: Mob[] = [];
  private rng: () => number;
  private stamp = 0;

  constructor(readonly seed: number, private store: Store) {
    this.world = new World(seed);
    this.rng = mulberry32(seed ^ 0x9e3779b9);
  }

  get playerCount(): number { return this.players.size; }
  get mobCount(): number { return this.mobs.size; }

  // ───────── 공간 격자 ─────────

  private gridAdd(e: Ent): void {
    e.cell = cellOf(e.x, e.y);
    let s = this.grid.get(e.cell);
    if (!s) this.grid.set(e.cell, (s = new Set()));
    s.add(e);
  }
  private gridRemove(e: Ent): void {
    const s = this.grid.get(e.cell);
    if (!s) return;
    s.delete(e);
    if (s.size === 0) this.grid.delete(e.cell);
  }
  private gridMove(e: Ent): void {
    if (cellOf(e.x, e.y) !== e.cell) { this.gridRemove(e); this.gridAdd(e); }
  }
  /** 반경 r 안에 걸칠 수 있는 격자 칸의 엔티티를 모두 넘긴다(정확한 거리 판정은 호출부 몫). */
  private near(x: number, y: number, r: number, fn: (e: Ent) => void): void {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const s = this.grid.get(tileKey(cx, cy));
        if (s) for (const e of s) fn(e);
      }
  }
  private playersNear(x: number, y: number, r: number, fn: (p: Player) => void): void {
    const r2 = r * r;
    this.near(x, y, r, (e) => {
      if (e.kind === EntityKind.Player && (e.x - x) ** 2 + (e.y - y) ** 2 <= r2) fn(e as Player);
    });
  }

  private send(p: Player, m: ServerMsg): void { p.conn.send(encodeServer(m)); }
  private system(p: Player, text: string): void { this.send(p, { t: S.Chat, id: 0, name: '', text }); }

  // ───────── 접속 / 종료 ─────────

  private join(conn: Conn, rawName: string, rawToken: string): void {
    if (this.players.has(conn)) return;
    // eslint-disable-next-line no-control-regex
    const name = rawName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME) || '모험가';
    let token = rawToken;
    let save: PlayerSave | undefined;
    if (/^[0-9a-f]{32}$/.test(token)) save = this.store.load(token);
    if (!save) token = randomBytes(16).toString('hex');

    // 같은 계정이 이미 접속 중이면 기존 연결을 끊고 그 상태를 이어받는다.
    const old = this.byToken.get(token);
    if (old) { save = this.toSave(old); this.leave(old.conn); old.conn.close(); }

    const level = save?.level ?? 1;
    const p: Player = {
      id: this.nextId++, kind: EntityKind.Player, x: save?.x ?? SPAWN.x, y: save?.y ?? SPAWN.y, facing: Math.PI / 2,
      hp: maxHpForLevel(level), maxHp: maxHpForLevel(level), flags: 0, level, name, cell: 0,
      conn, token, queue: [], budget: MAX_BUDGET, lastSeq: 0, reset: 0,
      attackReady: 0, lastHurt: -1000, lastChat: -1000,
      xp: save?.xp ?? 0, weapon: save?.weapon ?? 0, armor: save?.armor ?? 0,
      inv: Array.from({ length: ITEM_COUNT }, (_, i) => save?.inv[i] ?? 0),
      statsDirty: true, known: new Map(), nodeChunks: new Set(), lastChunk: NaN,
    };
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !this.world.walkable(Math.floor(p.x), Math.floor(p.y))) {
      p.x = SPAWN.x; p.y = SPAWN.y;
    }
    this.players.set(conn, p);
    this.byToken.set(token, p);
    this.ents.set(p.id, p);
    this.gridAdd(p);
    this.send(p, { t: S.Welcome, id: p.id, seed: this.seed, x: p.x, y: p.y, token });
    this.syncNodeChunks(p);
    this.system(p, `${name} 님, 환영합니다. WASD 이동 · 마우스/스페이스 공격 · Enter 채팅`);
  }

  private toSave(p: Player): PlayerSave {
    return { name: p.name, x: p.x, y: p.y, level: p.level, xp: p.xp, weapon: p.weapon, armor: p.armor, inv: p.inv.slice() };
  }

  leave(conn: Conn): void {
    const p = this.players.get(conn);
    if (!p) return;
    this.store.save(p.token, this.toSave(p));
    this.players.delete(conn);
    this.byToken.delete(p.token);
    this.ents.delete(p.id);
    this.gridRemove(p);
  }

  saveAll(): void {
    for (const p of this.players.values()) this.store.save(p.token, this.toSave(p));
  }

  // ───────── 메시지 처리 ─────────

  onMessage(conn: Conn, m: ClientMsg): void {
    if (m.t === C.Join) { this.join(conn, m.name, m.token); return; }
    const p = this.players.get(conn);
    if (!p) return; // 입장 전의 다른 메시지는 무시
    switch (m.t) {
      case C.Input:
        if (m.seq > p.lastSeq && (m.dir < 8 || m.dir === DIR_NONE) && p.queue.length < MAX_QUEUE) p.queue.push(m);
        break;
      case C.Attack: this.playerAttack(p, m.angle); break;
      case C.Chat: {
        const text = m.text.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_CHAT); // eslint-disable-line no-control-regex
        if (!text || this.tick - p.lastChat < TICK_RATE / 2) break;
        p.lastChat = this.tick;
        const msg = encodeServer({ t: S.Chat, id: p.id, name: p.name, text });
        this.playersNear(p.x, p.y, CHAT_RANGE, (q) => q.conn.send(msg));
        break;
      }
      case C.Ping: this.send(p, { t: S.Pong, time: m.time }); break;
      case C.Craft: this.craft(p, m.recipe); break;
    }
  }

  private craft(p: Player, recipe: number): void {
    const cost = recipeCost(recipe, p.weapon, p.armor);
    if (!cost) return;
    if (recipe === Recipe.Potion && p.hp >= p.maxHp) return;
    for (let i = 0; i < ITEM_COUNT; i++) if (p.inv[i]! < cost[i]!) return;
    for (let i = 0; i < ITEM_COUNT; i++) p.inv[i]! -= cost[i]!;
    if (recipe === Recipe.Weapon) { p.weapon++; this.system(p, `무기를 ${p.weapon}단계로 강화했습니다.`); }
    else if (recipe === Recipe.Armor) { p.armor++; this.system(p, `갑옷을 ${p.armor}단계로 강화했습니다.`); }
    else p.hp = Math.min(p.maxHp, p.hp + POTION_HEAL);
    p.statsDirty = true;
  }

  private hitEvent(x: number, y: number, amount: number, targetId: number): void {
    const msg = encodeServer({ t: S.Hit, x, y, amount, targetId });
    this.playersNear(x, y, AOI_ENTER, (q) => q.conn.send(msg));
  }

  private playerAttack(p: Player, angle: number): void {
    if (this.tick < p.attackReady || !Number.isFinite(angle)) return;
    p.attackReady = this.tick + ATTACK_COOLDOWN_TICKS;
    p.facing = angle;
    p.flags |= FLAG_ATTACK;
    const inArc = (dx: number, dy: number) => {
      let d = Math.atan2(dy, dx) - angle;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return Math.abs(d) <= ATTACK_ARC;
    };
    const damage = playerDamage(p.weapon, p.level);
    let hitAny = false;
    const victims: Mob[] = [];
    this.near(p.x, p.y, ATTACK_RANGE + 1, (e) => {
      if (e.kind === EntityKind.Player || e.hp <= 0) return;
      const m = e as Mob, dx = m.x - p.x, dy = m.y - p.y;
      if (Math.hypot(dx, dy) <= ATTACK_RANGE + m.def.radius && inArc(dx, dy)) victims.push(m);
    });
    for (const m of victims) {
      hitAny = true;
      const dealt = Math.min(m.hp, damage + Math.floor(this.rng() * 3));
      m.hp -= dealt;
      m.flags |= FLAG_HURT;
      m.target = p.id;
      m.returning = false;
      this.hitEvent(m.x, m.y, dealt, m.id);
      if (m.hp <= 0) this.killMob(m, p);
    }
    if (hitAny) return;

    // 몬스터를 맞히지 못했다면 범위 안에서 가장 가까운 자원 노드를 채집한다.
    let best = -1, bestD = Infinity, bx = 0, by = 0;
    const r = Math.ceil(ATTACK_RANGE);
    for (let ty = Math.floor(p.y) - r; ty <= Math.floor(p.y) + r; ty++)
      for (let tx = Math.floor(p.x) - r; tx <= Math.floor(p.x) + r; tx++) {
        const type = this.world.liveNode(tx, ty);
        if (!type) continue;
        const dx = tx + 0.5 - p.x, dy = ty + 0.5 - p.y, d = Math.hypot(dx, dy);
        if (d <= ATTACK_RANGE + 0.4 && d < bestD && inArc(dx, dy)) { best = type; bestD = d; bx = tx; by = ty; }
      }
    if (best < 0) return;
    const key = tileKey(bx, by);
    const dmg = this.nodeDamage.get(key) ?? { hits: 0, tick: 0 };
    dmg.hits += 1 + Math.floor(p.weapon / 2);
    dmg.tick = this.tick;
    this.nodeDamage.set(key, dmg);
    this.hitEvent(bx + 0.5, by + 0.5, 1, 0);
    if (dmg.hits >= nodeHits(best)) {
      this.nodeDamage.delete(key);
      this.setNode(bx, by, true);
      p.inv[best === NodeType.Tree ? Item.Wood : Item.Stone]! += 2 + Math.floor(this.rng() * 2);
      this.gainXp(p, 2);
      p.statsDirty = true;
    }
  }

  private setNode(x: number, y: number, depleted: boolean): void {
    const key = tileKey(x, y), ck = tileKey(chunkOf(x), chunkOf(y));
    this.world.setDepleted(x, y, depleted);
    if (depleted) {
      this.depleted.set(key, this.tick + NODE_RESPAWN_TICKS);
      let s = this.depletedByChunk.get(ck);
      if (!s) this.depletedByChunk.set(ck, (s = new Set()));
      s.add(key);
    } else {
      this.depleted.delete(key);
      const s = this.depletedByChunk.get(ck);
      if (s) { s.delete(key); if (s.size === 0) this.depletedByChunk.delete(ck); }
    }
    const msg = encodeServer({ t: S.NodeSet, x, y, depleted });
    this.playersNear(x + 0.5, y + 0.5, (NODE_SYNC_RADIUS + 2) * CHUNK * 1.5, (q) => {
      if (q.nodeChunks.has(ck)) q.conn.send(msg);
    });
  }

  private gainXp(p: Player, amount: number): void {
    p.xp += amount;
    while (p.xp >= xpForLevel(p.level) && p.level < 99) {
      p.xp -= xpForLevel(p.level);
      p.level++;
      p.maxHp = maxHpForLevel(p.level);
      p.hp = p.maxHp;
      this.system(p, `레벨 ${p.level} 달성!`);
    }
    p.statsDirty = true;
  }

  private killMob(m: Mob, killer: Player): void {
    m.hp = 0;
    for (const [item, lo, hi] of m.def.drops) killer.inv[item]! += lo + Math.floor(this.rng() * (hi - lo + 1));
    this.gainXp(killer, m.def.xp);
    const c = this.mobChunks.get(m.chunk);
    if (c) { c.count--; c.next = this.tick + 20 * TICK_RATE; }
    // hp 0 상태를 한 번은 스냅샷으로 내보낸 뒤에 제거해, 클라이언트가 사망 연출을 할 수 있게 한다.
    this.dying.push(m);
  }

  private removeMob(m: Mob): void {
    this.mobs.delete(m.id);
    this.ents.delete(m.id);
    this.gridRemove(m);
  }

  // ───────── 틱 ─────────

  step(): void {
    this.tick++;
    for (const p of this.players.values()) this.stepPlayer(p);
    for (const m of this.mobs.values()) if (m.hp > 0) this.stepMob(m);
    if (this.tick % TICK_RATE === 0) this.everySecond();
    if (this.tick % SNAPSHOT_EVERY === 0) {
      for (const p of this.players.values()) this.snapshot(p);
      for (const e of this.ents.values()) e.flags = 0;
      for (const m of this.dying) this.removeMob(m);
      this.dying.length = 0;
    }
  }

  private stepPlayer(p: Player): void {
    // 입력 예산: 틱당 1개씩 쌓이고, 지터로 밀린 입력을 따라잡을 만큼만 여유를 둔다.
    // 장기적으로는 초당 TICK_RATE개를 넘길 수 없으므로 입력을 몰아 보내는 속도 조작이 통하지 않는다.
    p.budget = Math.min(MAX_BUDGET, p.budget + 1);
    let n = Math.min(p.queue.length, p.budget, 3);
    p.budget -= n;
    while (n-- > 0) {
      const input = p.queue.shift()!;
      p.lastSeq = input.seq;
      if (input.dir !== DIR_NONE) {
        moveDir(this.world, p, input.dir, PLAYER_SPEED * DT);
        // 공격 직후에는 조준 방향을 유지해 휘두르는 모습이 이동 방향으로 꺾이지 않게 한다.
        if (this.tick >= p.attackReady) p.facing = Math.atan2(DIRS[input.dir]![1], DIRS[input.dir]![0]);
      }
    }
    this.gridMove(p);
    const ck = tileKey(chunkOf(Math.floor(p.x)), chunkOf(Math.floor(p.y)));
    if (ck !== p.lastChunk) this.syncNodeChunks(p);
  }

  private syncNodeChunks(p: Player): void {
    const pcx = chunkOf(Math.floor(p.x)), pcy = chunkOf(Math.floor(p.y));
    p.lastChunk = tileKey(pcx, pcy);
    for (const k of p.nodeChunks) {
      if (Math.max(Math.abs(keyX(k) - pcx), Math.abs(keyY(k) - pcy)) > NODE_SYNC_RADIUS + 1) p.nodeChunks.delete(k);
    }
    const fresh: NodeChunk[] = [];
    for (let cy = pcy - NODE_SYNC_RADIUS; cy <= pcy + NODE_SYNC_RADIUS; cy++)
      for (let cx = pcx - NODE_SYNC_RADIUS; cx <= pcx + NODE_SYNC_RADIUS; cx++) {
        const k = tileKey(cx, cy);
        if (p.nodeChunks.has(k)) continue;
        p.nodeChunks.add(k);
        // 비어 있어도 보낸다. 클라이언트가 예전에 받아 둔 낡은 상태를 덮어써야 하기 때문이다.
        const depleted: number[] = [];
        for (const t of this.depletedByChunk.get(k) ?? [])
          depleted.push((keyY(t) - cy * CHUNK) * CHUNK + (keyX(t) - cx * CHUNK));
        fresh.push({ cx, cy, depleted });
      }
    if (fresh.length) this.send(p, { t: S.NodeChunks, chunks: fresh });
  }

  private stepMob(m: Mob): void {
    const def = m.def;
    const homeD = Math.hypot(m.x - m.homeX, m.y - m.homeY);
    if (homeD > MOB_LEASH) { m.target = 0; m.returning = true; }
    if (m.returning) {
      if (homeD < 1.5) { m.returning = false; m.hp = m.maxHp; }
      else this.mobMove(m, m.homeX - m.x, m.homeY - m.y, def.speed * 1.5);
      return;
    }
    let target = m.target ? (this.ents.get(m.target) as Player | undefined) : undefined;
    if (target && Math.hypot(target.x - m.x, target.y - m.y) > def.aggro * 2) target = undefined;
    // 대상 탐색은 비싸므로 몬스터마다 틱을 엇갈리게 해 0.5초에 한 번만 한다.
    if (!target && (this.tick + m.id) % 10 === 0) {
      let best = def.aggro;
      this.playersNear(m.x, m.y, def.aggro, (q) => {
        const d = Math.hypot(q.x - m.x, q.y - m.y);
        if (d < best && Math.hypot(q.x, q.y) > SAFE_ZONE) { best = d; target = q; }
      });
    }
    m.target = target?.id ?? 0;
    if (target) {
      const dx = target.x - m.x, dy = target.y - m.y, d = Math.hypot(dx, dy);
      m.facing = Math.atan2(dy, dx);
      if (d > def.radius + 0.6) this.mobMove(m, dx, dy, def.speed);
      else if (this.tick >= m.attackReady) {
        m.attackReady = this.tick + def.cooldownTicks;
        m.flags |= FLAG_ATTACK;
        this.hurtPlayer(target, Math.max(1, def.damage - target.armor * 2));
      }
      return;
    }
    if (this.tick >= m.wanderUntil) {
      m.wanderUntil = this.tick + 20 + Math.floor(this.rng() * 60);
      if (this.rng() < 0.5) { m.wanderX = 0; m.wanderY = 0; }
      else {
        // 집에서 멀어질수록 집 쪽으로 돌아가는 방향을 고르게 한다.
        const a = homeD > 5 ? Math.atan2(m.homeY - m.y, m.homeX - m.x) : this.rng() * Math.PI * 2;
        m.wanderX = Math.cos(a); m.wanderY = Math.sin(a);
      }
    }
    if (m.wanderX || m.wanderY) {
      m.facing = Math.atan2(m.wanderY, m.wanderX);
      this.mobMove(m, m.wanderX, m.wanderY, def.speed * 0.4);
    }
  }

  private mobMove(m: Mob, dx: number, dy: number, speed: number): void {
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return;
    m.facing = Math.atan2(dy, dx);
    moveBy(this.world, m, (dx / d) * speed * DT, (dy / d) * speed * DT);
    this.gridMove(m);
  }

  private hurtPlayer(p: Player, amount: number): void {
    p.hp -= amount;
    p.flags |= FLAG_HURT;
    p.lastHurt = this.tick;
    this.hitEvent(p.x, p.y, amount, p.id);
    if (p.hp > 0) return;
    p.x = SPAWN.x; p.y = SPAWN.y;
    p.hp = p.maxHp;
    p.queue.length = 0;
    p.reset = (p.reset + 1) & 255;
    this.gridMove(p);
    this.system(p, '쓰러졌습니다. 시작 지점에서 다시 깨어납니다.');
  }

  private everySecond(): void {
    // 체력 자연 회복: 5초 동안 맞지 않았을 때만.
    for (const p of this.players.values()) {
      if (p.hp < p.maxHp && this.tick - p.lastHurt > 5 * TICK_RATE) p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.04));
      if (p.statsDirty) {
        p.statsDirty = false;
        this.send(p, { t: S.Stats, level: p.level, xp: p.xp, xpNext: xpForLevel(p.level), weapon: p.weapon, armor: p.armor, inv: p.inv });
      }
    }
    // 노드 재생성.
    for (const [key, at] of this.depleted) {
      if (this.tick < at) continue;
      const x = keyX(key), y = keyY(key);
      let occupied = false;
      this.near(x + 0.5, y + 0.5, 1.5, (e) => { if (Math.abs(e.x - x - 0.5) < 1 && Math.abs(e.y - y - 0.5) < 1) occupied = true; });
      if (occupied) this.depleted.set(key, this.tick + 5 * TICK_RATE);
      else this.setNode(x, y, false);
    }
    for (const [key, d] of this.nodeDamage) if (this.tick - d.tick > 30 * TICK_RATE) this.nodeDamage.delete(key);
    this.spawnMobs();
    if (this.tick % (5 * TICK_RATE) === 0) this.despawnMobs();
  }

  private spawnMobs(): void {
    for (const p of this.players.values()) {
      const pcx = chunkOf(Math.floor(p.x)), pcy = chunkOf(Math.floor(p.y));
      for (let cy = pcy - 2; cy <= pcy + 2; cy++)
        for (let cx = pcx - 2; cx <= pcx + 2; cx++) {
          const k = tileKey(cx, cy);
          let c = this.mobChunks.get(k);
          if (!c) this.mobChunks.set(k, (c = { count: 0, next: 0 }));
          if (c.count >= MOB_CAP_PER_CHUNK || this.tick < c.next) continue;
          c.next = this.tick + 4 * TICK_RATE;
          for (let attempt = 0; attempt < 4; attempt++) {
            const x = cx * CHUNK + Math.floor(this.rng() * CHUNK), y = cy * CHUNK + Math.floor(this.rng() * CHUNK);
            if (!this.world.walkable(x, y) || Math.hypot(x, y) < SAFE_ZONE + 4) continue;
            const kind = mobForBiome(this.world.tileBiome(x, y), this.rng(), Math.hypot(x, y));
            if (!kind) continue;
            let seen = false;
            this.playersNear(x, y, 9, () => { seen = true; });
            if (seen) continue;
            this.spawnMob(kind, x + 0.5, y + 0.5, k);
            c.count++;
            break;
          }
        }
    }
  }

  private spawnMob(kind: number, x: number, y: number, chunk: number): void {
    const def = MOBS[kind]!;
    const m: Mob = {
      id: this.nextId++, kind, x, y, facing: this.rng() * Math.PI * 2, hp: def.hp, maxHp: def.hp, flags: 0, level: 1,
      name: '', cell: 0, def, homeX: x, homeY: y, chunk, target: 0, attackReady: 0,
      wanderX: 0, wanderY: 0, wanderUntil: 0, returning: false,
    };
    this.mobs.set(m.id, m);
    this.ents.set(m.id, m);
    this.gridAdd(m);
  }

  private despawnMobs(): void {
    for (const m of this.mobs.values()) {
      if (m.hp <= 0) continue;
      let seen = false;
      this.playersNear(m.x, m.y, 56, () => { seen = true; });
      if (seen) continue;
      const c = this.mobChunks.get(m.chunk);
      if (c) c.count--;
      this.removeMob(m);
    }
    for (const [k, c] of this.mobChunks) if (c.count <= 0 && this.tick - c.next > 60 * TICK_RATE) this.mobChunks.delete(k);
  }

  // ───────── 스냅샷(관심 영역 + 델타) ─────────

  private snapshot(p: Player): void {
    const backlog = p.conn.buffered();
    if (backlog > BACKPRESSURE_KICK) { p.conn.close(); return; }
    if (backlog > BACKPRESSURE_SKIP) return; // 느린 연결은 이번 스냅샷을 건너뛴다. 다음 것이 최신 상태를 담는다.
    const stamp = ++this.stamp;
    const enters: EntityFull[] = [], updates: EntityUpdate[] = [], leaves: number[] = [];
    const enter2 = AOI_ENTER * AOI_ENTER, leave2 = AOI_LEAVE * AOI_LEAVE;
    this.near(p.x, p.y, AOI_LEAVE, (e) => {
      if (e === p) return;
      const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      const k = p.known.get(e.id);
      const f = angleToByte(e.facing);
      if (k) {
        if (d2 > leave2) return; // stamp를 갱신하지 않으므로 아래에서 leave 처리된다
        k.stamp = stamp;
        if (e.flags || k.x !== e.x || k.y !== e.y || k.f !== f || k.hp !== e.hp) {
          k.x = e.x; k.y = e.y; k.f = f; k.hp = e.hp;
          updates.push({ id: e.id, x: e.x, y: e.y, facing: e.facing, hp: Math.max(0, e.hp), flags: e.flags });
        }
      } else if (d2 <= enter2 && e.hp > 0) {
        p.known.set(e.id, { x: e.x, y: e.y, f, hp: e.hp, stamp });
        enters.push({ id: e.id, kind: e.kind, x: e.x, y: e.y, facing: e.facing, hp: e.hp, maxHp: e.maxHp, level: e.level, name: e.name });
      }
    });
    for (const [id, k] of p.known) if (k.stamp !== stamp) { p.known.delete(id); leaves.push(id); }
    this.send(p, {
      t: S.Snapshot, tick: this.tick, ack: p.lastSeq, x: p.x, y: p.y,
      hp: Math.max(0, p.hp), maxHp: p.maxHp, reset: p.reset, enters, updates, leaves,
    });
  }
}
