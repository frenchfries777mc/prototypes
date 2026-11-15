import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { C, DT, PLAYER_SPEED, S, decodeServer, encodeClient, type ClientMsg, type ServerMsg } from '@lw/shared';
import { startServer, type RunningServer } from '../src/server';
import { MemoryStore } from '../src/store';

class Client {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  constructor(port: number) {
    this.ws = new WebSocket(`ws://localhost:${port}/ws`);
    this.ws.on('message', (d: Buffer) => this.msgs.push(decodeServer(new Uint8Array(d.buffer, d.byteOffset, d.byteLength))));
  }
  open() { return new Promise<void>((ok, fail) => { this.ws.once('open', () => ok()); this.ws.once('error', fail); }); }
  send(m: ClientMsg) { this.ws.send(encodeClient(m)); }
  /** 조건에 맞는 메시지가 올 때까지 기다린다. */
  async until<T extends ServerMsg>(pred: (m: ServerMsg) => m is T, ms = 3000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const hit = this.msgs.find(pred);
      if (hit) return hit;
      if (Date.now() > end) throw new Error('timed out waiting for message');
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  closed() { return new Promise<void>((ok) => (this.ws.readyState === WebSocket.CLOSED ? ok() : this.ws.once('close', () => ok()))); }
}

const isWelcome = (m: ServerMsg): m is Extract<ServerMsg, { t: typeof S.Welcome }> => m.t === S.Welcome;
const isSnap = (m: ServerMsg): m is Extract<ServerMsg, { t: typeof S.Snapshot }> => m.t === S.Snapshot;

describe('game server', () => {
  let server: RunningServer;
  const store = new MemoryStore();
  beforeAll(async () => { server = await startServer({ port: 0, seed: 20261115, store }); });
  afterAll(async () => { await server.close(); });

  it('welcomes a player, applies inputs authoritatively and acknowledges them', async () => {
    const c = new Client(server.port);
    await c.open();
    c.send({ t: C.Join, name: '  시험\u0007자  ', token: '' });
    const w = await c.until(isWelcome);
    expect(w.token).toMatch(/^[0-9a-f]{32}$/);
    for (let seq = 1; seq <= 10; seq++) { c.send({ t: C.Input, seq, dir: 0 }); await new Promise((r) => setTimeout(r, 50)); }
    const snap = await c.until((m): m is Extract<ServerMsg, { t: typeof S.Snapshot }> => m.t === S.Snapshot && m.ack === 10);
    expect(snap.x).toBeCloseTo(w.x + PLAYER_SPEED * DT * 10, 3);
    expect(snap.y).toBeCloseTo(w.y, 5);
    c.ws.close();
    await c.closed();
  });

  it('does not let a client move faster by flooding inputs', async () => {
    const c = new Client(server.port);
    await c.open();
    c.send({ t: C.Join, name: 'speeder', token: '' });
    const w = await c.until(isWelcome);
    for (let seq = 1; seq <= 100; seq++) c.send({ t: C.Input, seq, dir: 2 });
    await new Promise((r) => setTimeout(r, 1000));
    const last = c.msgs.filter(isSnap).at(-1)!;
    // 1초 동안 정상 속도로 갈 수 있는 거리(+지터 여유분)를 넘지 못한다.
    expect(last.y - w.y).toBeLessThanOrEqual(PLAYER_SPEED * DT * (20 + 12) + 1e-3);
    c.ws.close();
    await c.closed();
  });

  it('shows nearby players to each other and reports them leaving', async () => {
    const a = new Client(server.port), b = new Client(server.port);
    await Promise.all([a.open(), b.open()]);
    a.send({ t: C.Join, name: 'A', token: '' });
    const wa = await a.until(isWelcome);
    b.send({ t: C.Join, name: 'B', token: '' });
    const wb = await b.until(isWelcome);
    const seen = await a.until((m): m is Extract<ServerMsg, { t: typeof S.Snapshot }> => m.t === S.Snapshot && m.enters.some((e) => e.id === wb.id));
    expect(seen.enters.find((e) => e.id === wb.id)!.name).toBe('B');
    await b.until((m): m is Extract<ServerMsg, { t: typeof S.Snapshot }> => m.t === S.Snapshot && m.enters.some((e) => e.id === wa.id));

    b.send({ t: C.Chat, text: '안녕' });
    const chat = await a.until((m): m is Extract<ServerMsg, { t: typeof S.Chat }> => m.t === S.Chat && m.id === wb.id);
    expect(chat.text).toBe('안녕');

    b.ws.close();
    await a.until((m): m is Extract<ServerMsg, { t: typeof S.Snapshot }> => m.t === S.Snapshot && m.leaves.includes(wb.id));
    a.ws.close();
    await a.closed();
  });

  it('restores a returning player from their token', async () => {
    const c = new Client(server.port);
    await c.open();
    c.send({ t: C.Join, name: 'keeper', token: '' });
    const w = await c.until(isWelcome);
    for (let seq = 1; seq <= 6; seq++) { c.send({ t: C.Input, seq, dir: 4 }); await new Promise((r) => setTimeout(r, 50)); }
    const moved = await c.until((m): m is Extract<ServerMsg, { t: typeof S.Snapshot }> => m.t === S.Snapshot && m.ack === 6);
    c.ws.close();
    await c.closed();
    await new Promise((r) => setTimeout(r, 50));

    const d = new Client(server.port);
    await d.open();
    d.send({ t: C.Join, name: 'keeper', token: w.token });
    const w2 = await d.until(isWelcome);
    expect(w2.token).toBe(w.token);
    expect(w2.x).toBeCloseTo(moved.x, 4);
    d.ws.close();
    await d.closed();
  });

  it('disconnects clients that send garbage', async () => {
    const c = new Client(server.port);
    await c.open();
    c.ws.send(new Uint8Array([250, 1, 2, 3]));
    await c.closed();
    const t = new Client(server.port);
    await t.open();
    t.ws.send('{"hello":1}');
    await t.closed();
  });
});
