import {
  C, CHUNK, DIRS, DIR_NONE, DT, EntityKind, FLAG_ATTACK, FLAG_HURT, PLAYER_SPEED, S, World, moveDir,
  type ServerMsg,
} from '@lw/shared';
import type { Net } from './net';

/** 원격 엔티티를 이만큼 과거 시점으로 그린다. 10Hz 스냅샷 두 개 사이를 항상 보간할 수 있는 여유다. */
const INTERP_DELAY = 150;
const SNAP_DISTANCE = 8;

interface Sample { t: number; x: number; y: number; f: number; }

export interface RemoteEnt {
  id: number; kind: number; name: string; level: number; hp: number; maxHp: number;
  samples: Sample[]; x: number; y: number; facing: number; moving: boolean;
  attackAt: number; hurtAt: number; touched: number;
}

export interface Me {
  id: number; name: string; x: number; y: number; px: number; py: number;
  hp: number; maxHp: number; facing: number; moving: boolean; attackAt: number; hurtAt: number;
}

export interface Stats { level: number; xp: number; xpNext: number; weapon: number; armor: number; inv: number[]; }

function lerpAngle(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

export class ClientState {
  world!: World;
  me!: Me;
  ents = new Map<number, RemoteEnt>();
  stats: Stats = { level: 1, xp: 0, xpNext: 20, weapon: 0, armor: 0, inv: [0, 0, 0, 0, 0] };
  /** 노드 고갈 상태가 바뀔 때마다 증가한다. 렌더러가 인스턴스를 다시 만들 신호로 쓴다. */
  nodeVersion = 0;
  ready = false;
  rtt = 0;

  private seq = 0;
  private pending: { seq: number; dir: number }[] = [];
  private reset = 0;
  private snapCount = 0;

  onHit: (x: number, y: number, amount: number, targetId: number) => void = () => {};
  onChat: (id: number, name: string, text: string) => void = () => {};
  onStats: () => void = () => {};
  onWelcome: (token: string) => void = () => {};
  onRemove: (e: RemoteEnt) => void = () => {};

  constructor(private net: Net, private myName: string) {}

  handle(m: ServerMsg, now: number): void {
    switch (m.t) {
      case S.Welcome:
        this.world = new World(m.seed);
        this.me = { id: m.id, name: this.myName, x: m.x, y: m.y, px: m.x, py: m.y, hp: 1, maxHp: 1, facing: Math.PI / 2, moving: false, attackAt: -1e9, hurtAt: -1e9 };
        this.ready = true;
        this.onWelcome(m.token);
        break;
      case S.Snapshot: this.snapshot(m, now); break;
      case S.NodeChunks:
        for (const c of m.chunks) {
          // 서버가 보낸 것이 그 청크의 전체 상태다. 예전 값은 모두 지우고 덮어쓴다.
          const gone = new Set(c.depleted);
          for (let i = 0; i < CHUNK * CHUNK; i++)
            this.world.setDepleted(c.cx * CHUNK + (i % CHUNK), c.cy * CHUNK + Math.floor(i / CHUNK), gone.has(i));
        }
        this.nodeVersion++;
        break;
      case S.NodeSet: this.world.setDepleted(m.x, m.y, m.depleted); this.nodeVersion++; break;
      case S.Hit:
        if (m.targetId === this.me?.id) this.me.hurtAt = now;
        this.onHit(m.x, m.y, m.amount, m.targetId);
        break;
      case S.Stats: this.stats = m; this.onStats(); break;
      case S.Chat: this.onChat(m.id, m.name, m.text); break;
      case S.Pong: this.rtt = now - m.time; break;
    }
  }

  private snapshot(m: Extract<ServerMsg, { t: typeof S.Snapshot }>, now: number): void {
    const me = this.me;
    me.hp = m.hp; me.maxHp = m.maxHp;
    // 서버 위치를 기준으로 삼고, 아직 확인받지 못한 입력을 다시 적용해 예측 위치를 복원한다.
    me.x = m.x; me.y = m.y;
    if (m.reset !== this.reset) {
      this.reset = m.reset;
      this.pending.length = 0;
      me.px = m.x; me.py = m.y;
    } else {
      this.pending = this.pending.filter((i) => i.seq > m.ack);
      for (const i of this.pending) moveDir(this.world, me, i.dir, PLAYER_SPEED * DT);
    }

    const stamp = ++this.snapCount;
    for (const e of m.enters) {
      this.ents.set(e.id, {
        id: e.id, kind: e.kind, name: e.name, level: e.level, hp: e.hp, maxHp: e.maxHp,
        samples: [{ t: now, x: e.x, y: e.y, f: e.facing }], x: e.x, y: e.y, facing: e.facing, moving: false,
        attackAt: -1e9, hurtAt: -1e9, touched: stamp,
      });
    }
    for (const u of m.updates) {
      const e = this.ents.get(u.id);
      if (!e) continue;
      e.samples.push({ t: now, x: u.x, y: u.y, f: u.facing });
      e.hp = u.hp;
      e.touched = stamp;
      if (u.flags & FLAG_ATTACK) e.attackAt = now;
      if (u.flags & FLAG_HURT) e.hurtAt = now;
    }
    for (const id of m.leaves) {
      const e = this.ents.get(id);
      if (e) { this.ents.delete(id); this.onRemove(e); }
    }
    // 변화가 없어 갱신이 오지 않은 엔티티는 "그 자리에 그대로 있었다"는 표본을 넣어 둔다.
    // 이게 없으면 오래 서 있다가 움직일 때 옛 표본부터 느리게 미끄러진다.
    for (const e of this.ents.values()) {
      if (e.touched !== stamp) { const l = e.samples[e.samples.length - 1]!; e.samples.push({ t: now, x: l.x, y: l.y, f: l.f }); }
      if (e.samples.length > 8) e.samples.splice(0, e.samples.length - 8);
    }
  }

  /** 고정 시간 간격의 예측 한 스텝. 서버와 같은 이동 코드를 돌리고 입력을 보낸다. */
  tick(dir: number, now: number): void {
    const me = this.me;
    me.px = me.x; me.py = me.y;
    const input = { seq: ++this.seq, dir };
    this.net.send({ t: C.Input, ...input });
    this.pending.push(input);
    if (this.pending.length > 60) this.pending.shift(); // 서버가 한동안 응답이 없을 때 무한히 쌓이지 않게
    me.moving = dir !== DIR_NONE;
    if (me.moving) {
      moveDir(this.world, me, dir, PLAYER_SPEED * DT);
      if (now - me.attackAt > 400) me.facing = Math.atan2(DIRS[dir]![1], DIRS[dir]![0]);
    }
  }

  attack(angle: number, now: number): void {
    this.me.facing = angle;
    this.me.attackAt = now;
    this.net.send({ t: C.Attack, angle });
  }

  /** 원격 엔티티의 표시 위치를 보간으로 갱신한다. */
  interpolate(now: number): void {
    const rt = now - INTERP_DELAY;
    for (const e of this.ents.values()) {
      const s = e.samples;
      let i = s.length - 1;
      while (i > 0 && s[i]!.t > rt) i--;
      const a = s[i]!, b = s[Math.min(i + 1, s.length - 1)]!;
      const far = Math.hypot(b.x - a.x, b.y - a.y) > SNAP_DISTANCE; // 순간이동(부활)은 미끄러지지 않고 바로 옮긴다
      const t = b.t > a.t && !far ? Math.min(1, Math.max(0, (rt - a.t) / (b.t - a.t))) : 1;
      const nx = a.x + (b.x - a.x) * t, ny = a.y + (b.y - a.y) * t;
      e.moving = Math.hypot(nx - e.x, ny - e.y) > 0.002;
      e.x = nx; e.y = ny;
      e.facing = lerpAngle(a.f, b.f, t);
    }
  }

  isPlayer(e: { kind: number }): boolean { return e.kind === EntityKind.Player; }
}
