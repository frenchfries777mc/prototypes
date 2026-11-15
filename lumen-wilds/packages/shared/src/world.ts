import { CHUNK, WORLD_LIMIT } from './constants';
import { fbm, rand2, smoothstep } from './noise';

export const Biome = { Water: 0, Sand: 1, Grass: 2, Forest: 3, Rock: 4, Snow: 5 } as const;
export const NodeType = { None: 0, Tree: 1, Rock: 2 } as const;

export interface Chunk {
  cx: number;
  cy: number;
  h: Uint8Array;
  biome: Uint8Array;
  node: Uint8Array;
}

const OFFSET = 32768;
/** 타일(또는 청크) 좌표를 하나의 숫자 키로 묶는다. 좌표는 ±32768 안이어야 한다. */
export const tileKey = (x: number, y: number) => (x + OFFSET) * 65536 + (y + OFFSET);
export const keyX = (k: number) => Math.floor(k / 65536) - OFFSET;
export const keyY = (k: number) => (k % 65536) - OFFSET;
export const chunkOf = (v: number) => Math.floor(v / CHUNK);

const MAX_CACHED_CHUNKS = 4096;

/**
 * 시드에서 결정적으로 만들어지는 무한 월드.
 * 서버와 클라이언트가 같은 코드를 돌리므로 지형은 전송하지 않고,
 * 채집으로 사라진 노드(depleted)만 동기화한다.
 */
export class World {
  private chunks = new Map<number, Chunk>();
  private depleted = new Set<number>();

  constructor(readonly seed: number) {}

  private elevation(x: number, y: number): number {
    const s = this.seed;
    const e = fbm(s, x / 44, y / 44, 4) * 0.6 + fbm(s + 71, x / 130, y / 130, 3) * 0.4;
    // 원점 주변은 항상 평탄한 육지가 되도록 섞어, 시작 지점을 보장한다.
    const t = smoothstep(8, 30, Math.hypot(x, y));
    return 0.5 * (1 - t) + e * t;
  }

  private generate(cx: number, cy: number): Chunk {
    const n = CHUNK * CHUNK;
    const c: Chunk = { cx, cy, h: new Uint8Array(n), biome: new Uint8Array(n), node: new Uint8Array(n) };
    const s = this.seed;
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = cx * CHUNK + lx, y = cy * CHUNK + ly, i = ly * CHUNK + lx;
        if (Math.abs(x) > WORLD_LIMIT || Math.abs(y) > WORLD_LIMIT) continue; // 바다
        const e = this.elevation(x, y);
        if (e < 0.42) continue; // 바다: h=0, biome=Water
        let h = 1, b: number = Biome.Sand;
        if (e >= 0.45) {
          h = 1 + Math.floor((e - 0.45) * 20);
          if (e > 0.58) h += Math.floor((e - 0.58) * 34); // 고지대는 가파르게 만들어 절벽이 생기게 한다
          const moist = fbm(s + 313, x / 36, y / 36, 3);
          b = h >= 9 ? Biome.Snow : h >= 6 ? Biome.Rock : moist > 0.52 ? Biome.Forest : Biome.Grass;
        }
        c.h[i] = Math.min(h, 15);
        c.biome[i] = b;
        if (Math.hypot(x, y) < 7) continue; // 시작 지점에는 장애물을 두지 않는다
        const r = rand2(s + 977, x, y);
        if (b === Biome.Forest) c.node[i] = r < 0.13 ? NodeType.Tree : r > 0.99 ? NodeType.Rock : 0;
        else if (b === Biome.Grass) c.node[i] = r < 0.03 ? NodeType.Tree : r > 0.99 ? NodeType.Rock : 0;
        else if (b === Biome.Rock) c.node[i] = r < 0.1 ? NodeType.Rock : 0;
        else if (b === Biome.Snow) c.node[i] = r < 0.05 ? NodeType.Rock : 0;
        else if (b === Biome.Sand) c.node[i] = r < 0.012 ? NodeType.Rock : 0;
      }
    }
    return c;
  }

  getChunk(cx: number, cy: number): Chunk {
    const k = tileKey(cx, cy);
    let c = this.chunks.get(k);
    if (!c) {
      if (this.chunks.size >= MAX_CACHED_CHUNKS) {
        // 삽입 순서대로 오래된 것부터 버린다. 다시 필요하면 결정적으로 재생성된다.
        let drop = MAX_CACHED_CHUNKS / 8;
        for (const old of this.chunks.keys()) {
          this.chunks.delete(old);
          if (--drop <= 0) break;
        }
      }
      c = this.generate(cx, cy);
      this.chunks.set(k, c);
    }
    return c;
  }

  private idx(x: number, y: number): [Chunk, number] {
    const cx = chunkOf(x), cy = chunkOf(y);
    return [this.getChunk(cx, cy), (y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)];
  }

  tileH(x: number, y: number): number { const [c, i] = this.idx(x, y); return c.h[i]!; }
  tileBiome(x: number, y: number): number { const [c, i] = this.idx(x, y); return c.biome[i]!; }
  /** 고갈 여부와 무관한, 지형에 원래 놓인 노드 종류. */
  nodeType(x: number, y: number): number { const [c, i] = this.idx(x, y); return c.node[i]!; }

  isDepleted(x: number, y: number): boolean { return this.depleted.has(tileKey(x, y)); }
  setDepleted(x: number, y: number, v: boolean): void {
    if (v) this.depleted.add(tileKey(x, y)); else this.depleted.delete(tileKey(x, y));
  }
  /** 살아 있는(채집 가능한) 노드 종류. 없으면 0. */
  liveNode(x: number, y: number): number {
    const t = this.nodeType(x, y);
    return t !== 0 && !this.isDepleted(x, y) ? t : 0;
  }

  walkable(x: number, y: number): boolean {
    const [c, i] = this.idx(x, y);
    if (c.biome[i] === Biome.Water) return false;
    return c.node[i] === 0 || this.isDepleted(x, y);
  }
  /** 높이 fromH인 타일에서 (x, y) 타일로 발을 디딜 수 있는지. 2단 이상 차이는 절벽이다. */
  canStep(fromH: number, x: number, y: number): boolean {
    return this.walkable(x, y) && Math.abs(this.tileH(x, y) - fromH) <= 1;
  }
}
