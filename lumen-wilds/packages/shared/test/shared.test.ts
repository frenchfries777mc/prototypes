import { describe, expect, it } from 'vitest';
import {
  Biome, C, DIR_NONE, DT, PLAYER_SPEED, S, World, decodeClient, decodeServer, encodeClient, encodeServer,
  moveDir, recipeCost, Recipe, type ServerMsg,
} from '../src/index';

describe('world', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = new World(1234), b = new World(1234), c = new World(99);
    let same = true, differs = false;
    for (let y = -40; y < 40; y += 3)
      for (let x = 60; x < 140; x += 3) {
        if (a.tileH(x, y) !== b.tileH(x, y) || a.nodeType(x, y) !== b.nodeType(x, y)) same = false;
        if (a.tileH(x, y) !== c.tileH(x, y)) differs = true;
      }
    expect(same).toBe(true);
    expect(differs).toBe(true);
  });

  it('always has clear, walkable land at the spawn point', () => {
    for (const seed of [1, 2, 3, 20261115, 0xffffffff]) {
      const w = new World(seed);
      for (let y = -4; y <= 4; y++)
        for (let x = -4; x <= 4; x++) expect(w.walkable(x, y)).toBe(true);
    }
  });

  it('produces a varied world (water, land and nodes all occur)', () => {
    const w = new World(20261115);
    const seen = new Set<number>();
    let nodes = 0;
    for (let y = -200; y < 200; y += 2)
      for (let x = -200; x < 200; x += 2) { seen.add(w.tileBiome(x, y)); if (w.nodeType(x, y)) nodes++; }
    expect(seen.has(Biome.Water)).toBe(true);
    expect(seen.has(Biome.Grass)).toBe(true);
    expect(seen.has(Biome.Forest)).toBe(true);
    expect(seen.has(Biome.Rock)).toBe(true);
    expect(nodes).toBeGreaterThan(100);
  });

  it('depleting a node makes its tile walkable', () => {
    const w = new World(20261115);
    let found: [number, number] | undefined;
    for (let x = 6; x < 300 && !found; x++) for (let y = 6; y < 60; y++) if (w.nodeType(x, y)) { found = [x, y]; break; }
    expect(found).toBeDefined();
    const [x, y] = found!;
    expect(w.walkable(x, y)).toBe(false);
    w.setDepleted(x, y, true);
    expect(w.walkable(x, y)).toBe(true);
    expect(w.liveNode(x, y)).toBe(0);
  });
});

describe('movement', () => {
  it('moves at the configured speed on open ground', () => {
    const w = new World(20261115), p = { x: 0.5, y: 0.5 };
    for (let i = 0; i < 10; i++) moveDir(w, p, 0, PLAYER_SPEED * DT);
    expect(p.x).toBeCloseTo(0.5 + PLAYER_SPEED * DT * 10, 6);
    expect(p.y).toBe(0.5);
    moveDir(w, p, DIR_NONE, 1);
    expect(p.y).toBe(0.5);
  });

  it('never enters water or a live node, whichever way it walks', () => {
    const w = new World(20261115);
    for (let dir = 0; dir < 8; dir++) {
      const p = { x: 0.5, y: 0.5 };
      for (let i = 0; i < 4000; i++) {
        moveDir(w, p, dir, PLAYER_SPEED * DT);
        expect(w.walkable(Math.floor(p.x), Math.floor(p.y))).toBe(true);
      }
    }
  });
});

describe('protocol', () => {
  it('round-trips client messages', () => {
    expect(decodeClient(encodeClient({ t: C.Join, name: '모험가', token: 'ab' }))).toEqual({ t: C.Join, name: '모험가', token: 'ab' });
    expect(decodeClient(encodeClient({ t: C.Input, seq: 4000000000, dir: 7 }))).toEqual({ t: C.Input, seq: 4000000000, dir: 7 });
    expect(decodeClient(encodeClient({ t: C.Ping, time: 1234.5678 }))).toEqual({ t: C.Ping, time: 1234.5678 });
    const a = decodeClient(encodeClient({ t: C.Attack, angle: Math.PI / 2 }));
    expect(a.t === C.Attack && a.angle).toBeCloseTo(Math.PI / 2, 5);
  });

  it('round-trips a snapshot', () => {
    const m: ServerMsg = {
      t: S.Snapshot, tick: 77, ack: 12, x: 1.5, y: -2.25, hp: 40, maxHp: 50, reset: 3,
      enters: [{ id: 9, kind: 2, x: 3, y: 4, facing: Math.PI, hp: 20, maxHp: 20, level: 1, name: '이름' }],
      updates: [{ id: 5, x: -8.5, y: 100.25, facing: 0, hp: 7, flags: 3 }],
      leaves: [1, 2, 3],
    };
    expect(decodeServer(encodeServer(m))).toEqual(m);
  });

  it('round-trips node and stats messages', () => {
    const n: ServerMsg = { t: S.NodeChunks, chunks: [{ cx: -3, cy: 9, depleted: [0, 17, 255] }, { cx: 0, cy: 0, depleted: [] }] };
    expect(decodeServer(encodeServer(n))).toEqual(n);
    const s: ServerMsg = { t: S.Stats, level: 4, xp: 10, xpNext: 160, weapon: 1, armor: 2, inv: [1, 2, 3, 4, 5] };
    expect(decodeServer(encodeServer(s))).toEqual(s);
  });

  it('rejects truncated and unknown messages instead of misreading them', () => {
    const full = encodeClient({ t: C.Join, name: 'abc', token: 'def' });
    expect(() => decodeClient(full.subarray(0, full.length - 2))).toThrow();
    expect(() => decodeClient(new Uint8Array([200]))).toThrow();
    expect(() => decodeClient(new Uint8Array([]))).toThrow();
  });
});

describe('content', () => {
  it('scales costs with tier and stops at the cap', () => {
    const t0 = recipeCost(Recipe.Weapon, 0, 0)!, t3 = recipeCost(Recipe.Weapon, 3, 0)!;
    expect(t3[0]).toBeGreaterThan(t0[0]!);
    expect(recipeCost(Recipe.Weapon, 5, 0)).toBeNull();
    expect(recipeCost(99, 0, 0)).toBeNull();
  });
});
