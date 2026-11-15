import { ITEM_COUNT } from './content';

/**
 * 바이너리 와이어 프로토콜.
 * 첫 바이트가 메시지 종류이고, 이후는 리틀 엔디언 고정 필드다.
 * 디코더는 신뢰할 수 없는 입력을 받으므로 범위를 벗어나면 예외를 던지고,
 * 호출부(서버)가 그 연결을 끊는다.
 */

export const C = { Join: 1, Input: 2, Attack: 3, Chat: 4, Ping: 5, Craft: 6 } as const;
export const S = { Welcome: 16, Snapshot: 17, NodeChunks: 18, NodeSet: 19, Hit: 20, Stats: 21, Chat: 22, Pong: 23 } as const;

const enc = new TextEncoder();
const dec = new TextDecoder();

export class Writer {
  private buf = new ArrayBuffer(256);
  private view = new DataView(this.buf);
  private pos = 0;

  private need(n: number): void {
    if (this.pos + n <= this.buf.byteLength) return;
    let size = this.buf.byteLength * 2;
    while (size < this.pos + n) size *= 2;
    const next = new ArrayBuffer(size);
    new Uint8Array(next).set(new Uint8Array(this.buf, 0, this.pos));
    this.buf = next;
    this.view = new DataView(next);
  }
  u8(v: number): this { this.need(1); this.view.setUint8(this.pos, v); this.pos += 1; return this; }
  u16(v: number): this { this.need(2); this.view.setUint16(this.pos, v, true); this.pos += 2; return this; }
  u32(v: number): this { this.need(4); this.view.setUint32(this.pos, v, true); this.pos += 4; return this; }
  i32(v: number): this { this.need(4); this.view.setInt32(this.pos, v, true); this.pos += 4; return this; }
  f32(v: number): this { this.need(4); this.view.setFloat32(this.pos, v, true); this.pos += 4; return this; }
  f64(v: number): this { this.need(8); this.view.setFloat64(this.pos, v, true); this.pos += 8; return this; }
  str(s: string): this {
    const b = enc.encode(s);
    if (b.length > 65535) throw new RangeError('string too long');
    this.u16(b.length);
    this.need(b.length);
    new Uint8Array(this.buf, this.pos, b.length).set(b);
    this.pos += b.length;
    return this;
  }
  finish(): Uint8Array { return new Uint8Array(this.buf.slice(0, this.pos)); }
}

export class Reader {
  private view: DataView;
  private pos = 0;
  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  private take(n: number): number {
    const p = this.pos;
    if (p + n > this.bytes.byteLength) throw new RangeError('message truncated');
    this.pos += n;
    return p;
  }
  u8(): number { return this.view.getUint8(this.take(1)); }
  u16(): number { return this.view.getUint16(this.take(2), true); }
  u32(): number { return this.view.getUint32(this.take(4), true); }
  i32(): number { return this.view.getInt32(this.take(4), true); }
  f32(): number { return this.view.getFloat32(this.take(4), true); }
  f64(): number { return this.view.getFloat64(this.take(8), true); }
  str(): string {
    const n = this.u16();
    const p = this.take(n);
    return dec.decode(this.bytes.subarray(p, p + n));
  }
}

export const angleToByte = (a: number) => Math.round((a / (Math.PI * 2)) * 256) & 255;
export const byteToAngle = (b: number) => (b / 256) * Math.PI * 2;

// ───────── 클라이언트 → 서버 ─────────

export type ClientMsg =
  | { t: typeof C.Join; name: string; token: string }
  | { t: typeof C.Input; seq: number; dir: number }
  | { t: typeof C.Attack; angle: number }
  | { t: typeof C.Chat; text: string }
  | { t: typeof C.Ping; time: number }
  | { t: typeof C.Craft; recipe: number };

export function encodeClient(m: ClientMsg): Uint8Array {
  const w = new Writer().u8(m.t);
  switch (m.t) {
    case C.Join: w.str(m.name).str(m.token); break;
    case C.Input: w.u32(m.seq).u8(m.dir); break;
    case C.Attack: w.u8(angleToByte(m.angle)); break;
    case C.Chat: w.str(m.text); break;
    case C.Ping: w.f64(m.time); break;
    case C.Craft: w.u8(m.recipe); break;
  }
  return w.finish();
}

export function decodeClient(bytes: Uint8Array): ClientMsg {
  const r = new Reader(bytes);
  const t = r.u8();
  switch (t) {
    case C.Join: return { t, name: r.str(), token: r.str() };
    case C.Input: return { t, seq: r.u32(), dir: r.u8() };
    case C.Attack: return { t, angle: byteToAngle(r.u8()) };
    case C.Chat: return { t, text: r.str() };
    case C.Ping: return { t, time: r.f64() };
    case C.Craft: return { t, recipe: r.u8() };
    default: throw new RangeError(`unknown client message ${t}`);
  }
}

// ───────── 서버 → 클라이언트 ─────────

export const FLAG_ATTACK = 1;
export const FLAG_HURT = 2;

export interface EntityFull {
  id: number; kind: number; x: number; y: number; facing: number;
  hp: number; maxHp: number; level: number; name: string;
}
export interface EntityUpdate { id: number; x: number; y: number; facing: number; hp: number; flags: number; }
export interface NodeChunk { cx: number; cy: number; /** 청크 안 로컬 인덱스(ly * CHUNK + lx) */ depleted: number[]; }

export type ServerMsg =
  | { t: typeof S.Welcome; id: number; seed: number; x: number; y: number; token: string }
  | {
      t: typeof S.Snapshot; tick: number; ack: number; x: number; y: number; hp: number; maxHp: number;
      /** 서버가 위치를 강제로 옮길 때마다(사망 후 부활 등) 증가한다. 바뀌면 예측을 버려야 한다. */
      reset: number;
      enters: EntityFull[]; updates: EntityUpdate[]; leaves: number[];
    }
  | { t: typeof S.NodeChunks; chunks: NodeChunk[] }
  | { t: typeof S.NodeSet; x: number; y: number; depleted: boolean }
  | { t: typeof S.Hit; x: number; y: number; amount: number; targetId: number }
  | { t: typeof S.Stats; level: number; xp: number; xpNext: number; weapon: number; armor: number; inv: number[] }
  | { t: typeof S.Chat; id: number; name: string; text: string }
  | { t: typeof S.Pong; time: number };

export function encodeServer(m: ServerMsg): Uint8Array {
  const w = new Writer().u8(m.t);
  switch (m.t) {
    case S.Welcome: w.u32(m.id).u32(m.seed).f32(m.x).f32(m.y).str(m.token); break;
    case S.Snapshot:
      w.u32(m.tick).u32(m.ack).f32(m.x).f32(m.y).u16(m.hp).u16(m.maxHp).u8(m.reset);
      w.u16(m.enters.length);
      for (const e of m.enters)
        w.u32(e.id).u8(e.kind).f32(e.x).f32(e.y).u8(angleToByte(e.facing)).u16(e.hp).u16(e.maxHp).u8(e.level).str(e.name);
      w.u16(m.updates.length);
      for (const e of m.updates) w.u32(e.id).f32(e.x).f32(e.y).u8(angleToByte(e.facing)).u16(e.hp).u8(e.flags);
      w.u16(m.leaves.length);
      for (const id of m.leaves) w.u32(id);
      break;
    case S.NodeChunks:
      w.u16(m.chunks.length);
      for (const c of m.chunks) {
        w.i32(c.cx).i32(c.cy).u16(c.depleted.length);
        for (const i of c.depleted) w.u8(i);
      }
      break;
    case S.NodeSet: w.i32(m.x).i32(m.y).u8(m.depleted ? 1 : 0); break;
    case S.Hit: w.f32(m.x).f32(m.y).u16(m.amount).u32(m.targetId); break;
    case S.Stats:
      w.u8(m.level).u32(m.xp).u32(m.xpNext).u8(m.weapon).u8(m.armor);
      for (let i = 0; i < ITEM_COUNT; i++) w.u32(m.inv[i] ?? 0);
      break;
    case S.Chat: w.u32(m.id).str(m.name).str(m.text); break;
    case S.Pong: w.f64(m.time); break;
  }
  return w.finish();
}

export function decodeServer(bytes: Uint8Array): ServerMsg {
  const r = new Reader(bytes);
  const t = r.u8();
  switch (t) {
    case S.Welcome: return { t, id: r.u32(), seed: r.u32(), x: r.f32(), y: r.f32(), token: r.str() };
    case S.Snapshot: {
      const tick = r.u32(), ack = r.u32(), x = r.f32(), y = r.f32(), hp = r.u16(), maxHp = r.u16(), reset = r.u8();
      const enters: EntityFull[] = [];
      for (let n = r.u16(); n > 0; n--)
        enters.push({ id: r.u32(), kind: r.u8(), x: r.f32(), y: r.f32(), facing: byteToAngle(r.u8()), hp: r.u16(), maxHp: r.u16(), level: r.u8(), name: r.str() });
      const updates: EntityUpdate[] = [];
      for (let n = r.u16(); n > 0; n--)
        updates.push({ id: r.u32(), x: r.f32(), y: r.f32(), facing: byteToAngle(r.u8()), hp: r.u16(), flags: r.u8() });
      const leaves: number[] = [];
      for (let n = r.u16(); n > 0; n--) leaves.push(r.u32());
      return { t, tick, ack, x, y, hp, maxHp, reset, enters, updates, leaves };
    }
    case S.NodeChunks: {
      const chunks: NodeChunk[] = [];
      for (let n = r.u16(); n > 0; n--) {
        const cx = r.i32(), cy = r.i32(), depleted: number[] = [];
        for (let k = r.u16(); k > 0; k--) depleted.push(r.u8());
        chunks.push({ cx, cy, depleted });
      }
      return { t, chunks };
    }
    case S.NodeSet: return { t, x: r.i32(), y: r.i32(), depleted: r.u8() === 1 };
    case S.Hit: return { t, x: r.f32(), y: r.f32(), amount: r.u16(), targetId: r.u32() };
    case S.Stats: {
      const level = r.u8(), xp = r.u32(), xpNext = r.u32(), weapon = r.u8(), armor = r.u8();
      const inv: number[] = [];
      for (let i = 0; i < ITEM_COUNT; i++) inv.push(r.u32());
      return { t, level, xp, xpNext, weapon, armor, inv };
    }
    case S.Chat: return { t, id: r.u32(), name: r.str(), text: r.str() };
    case S.Pong: return { t, time: r.f64() };
    default: throw new RangeError(`unknown server message ${t}`);
  }
}
