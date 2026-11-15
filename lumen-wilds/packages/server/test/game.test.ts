import { describe, expect, it } from 'vitest';
import {
  C, DIR_NONE, EntityKind, Item, NodeType, S, World, decodeServer,
  type ClientMsg, type EntityFull, type ServerMsg,
} from '@lw/shared';
import { Game, type Conn } from '../src/game';
import { MemoryStore } from '../src/store';

const SEED = 20261115;
const TOKEN = 'a'.repeat(32);

/** 소켓 없이 Game을 직접 구동하는 가짜 연결. 받은 메시지를 모두 기록한다. */
class Fake implements Conn {
  msgs: ServerMsg[] = [];
  closed = false;
  send(d: Uint8Array) { this.msgs.push(decodeServer(d)); }
  close() { this.closed = true; }
  buffered() { return 0; }
  last<T extends ServerMsg['t']>(t: T) { return this.msgs.filter((m): m is Extract<ServerMsg, { t: T }> => m.t === t).at(-1); }
}

function setup(x: number, y: number) {
  const store = new MemoryStore();
  store.save(TOKEN, { name: 'p', x, y, level: 1, xp: 0, weapon: 0, armor: 0, inv: [0, 0, 0, 0, 0] });
  const game = new Game(SEED, store), conn = new Fake();
  game.onMessage(conn, { t: C.Join, name: 'p', token: TOKEN });
  return { game, conn, send: (m: ClientMsg) => game.onMessage(conn, m) };
}

/** 왼쪽 칸이 같은 높이로 비어 있는 나무를 찾는다. 그 칸에 서서 +x 방향으로 치면 닿는다. */
function findTree(): [number, number] {
  const w = new World(SEED);
  for (let x = 10; x < 200; x++)
    for (let y = -40; y < 40; y++)
      if (w.nodeType(x, y) === NodeType.Tree && w.walkable(x - 1, y) && w.tileH(x - 1, y) === w.tileH(x, y)) return [x, y];
  throw new Error('no tree found');
}

describe('gathering', () => {
  it('depletes a tree after enough hits, grants wood and tells the client', () => {
    const [tx, ty] = findTree();
    const { game, conn, send } = setup(tx - 0.5, ty + 0.5);

    for (let i = 0; i < 3; i++) {
      send({ t: C.Attack, angle: 0 });
      for (let k = 0; k < 10; k++) game.step(); // 공격 대기 시간이 지나가게
    }
    for (let k = 0; k < 20; k++) game.step();
    expect(conn.msgs).toContainEqual({ t: S.NodeSet, x: tx, y: ty, depleted: true });
    expect(game.world.walkable(tx, ty)).toBe(true);
    expect(conn.last(S.Stats)!.inv[Item.Wood]).toBeGreaterThanOrEqual(2);
  });

  it('ignores attacks sent faster than the cooldown', () => {
    const [tx, ty] = findTree();
    const { game, conn, send } = setup(tx - 0.5, ty + 0.5);
    // 한 틱 안에 30번을 보내도 실제로 들어가는 것은 한 번뿐이라 나무(3타)는 쓰러지지 않는다.
    for (let i = 0; i < 30; i++) send({ t: C.Attack, angle: 0 });
    for (let k = 0; k < 40; k++) game.step();
    expect(conn.msgs.filter((m) => m.t === S.Hit)).toHaveLength(1);
    expect(conn.msgs.some((m) => m.t === S.NodeSet)).toBe(false);
    expect(game.world.walkable(tx, ty)).toBe(false);
  });
});

describe('combat', () => {
  it('lets a player hunt a mob for xp and loot, entirely through the protocol', () => {
    const { game, conn, send } = setup(40.5, 0.5);
    const known = new Map<number, EntityFull>();
    let seq = 0, me = { x: 40.5, y: 0.5 }, read = 0;
    const pump = () => {
      for (; read < conn.msgs.length; read++) {
        const m = conn.msgs[read]!;
        if (m.t !== S.Snapshot) continue;
        me = { x: m.x, y: m.y };
        for (const e of m.enters) if (e.kind !== EntityKind.Player) known.set(e.id, { ...e });
        for (const u of m.updates) { const e = known.get(u.id); if (e) { e.x = u.x; e.y = u.y; e.hp = u.hp; } }
        for (const id of m.leaves) known.delete(id);
      }
    };
    let gained = false;
    for (let tick = 0; tick < 20 * 240 && !gained; tick++) {
      pump();
      // 가장 가까운 몬스터를 향해 걷고, 닿으면 그쪽으로 공격한다.
      let target: EntityFull | undefined, best = Infinity;
      for (const e of known.values()) { const d = Math.hypot(e.x - me.x, e.y - me.y); if (d < best) { best = d; target = e; } }
      let dir = tick % 400 < 200 ? 0 : 2; // 아직 아무것도 못 봤으면 돌아다닌다
      if (target) {
        const a = Math.atan2(target.y - me.y, target.x - me.x);
        dir = best > 1 ? (Math.round(a / (Math.PI / 4)) + 8) % 8 : DIR_NONE;
        if (best < 1.8) send({ t: C.Attack, angle: a });
      }
      send({ t: C.Input, seq: ++seq, dir });
      game.step();
      const stats = conn.last(S.Stats);
      gained = !!stats && (stats.xp > 0 || stats.level > 1) && stats.inv.some((n) => n > 0);
    }
    expect(gained).toBe(true);
    expect(game.mobCount).toBeGreaterThan(0);
  });

  it('never spawns mobs inside the safe zone', () => {
    const { game, conn } = setup(0.5, 0.5);
    let closest = Infinity;
    for (let tick = 0; tick < 20 * 30; tick++) {
      game.step();
      for (const m of conn.msgs) if (m.t === S.Snapshot) for (const e of m.enters) closest = Math.min(closest, Math.hypot(e.x, e.y));
      conn.msgs.length = 0;
    }
    expect(closest).toBeGreaterThan(10);
  });
});
