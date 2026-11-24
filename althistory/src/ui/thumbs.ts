import type { Scenario } from '../data/types';
import type { World } from '../data/world';

type Geo = { type: string; coordinates: unknown } | null;
const merc = (lat: number): number => { const c = Math.max(-85, Math.min(85, lat)); return (Math.log(Math.tan(Math.PI / 4 + (c * Math.PI) / 360)) * 180) / Math.PI; };
const WORLD: [number, number, number, number] = [-170, -56, 190, 76];

/** 템플릿마다 "시작 시점의 정치 지도"를 작은 그림으로 그린다(메르카토르, 지도와 같은 색). 한 번 그린 것은 캐시한다. */
export class Thumbs {
  private paths: (Path2D | null)[];
  private cache = new Map<string, string>();
  private queue: (() => void)[] = [];
  private busy = false;

  constructor(private world: World, geoms: Geo[]) {
    this.paths = geoms.map((g) => {
      if (!g) return null;
      const p = new Path2D();
      const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][];
      for (const poly of polys) for (const ring of poly) {
        ring.forEach(([x, y], i) => { const yy = -merc(y); if (i === 0) p.moveTo(x, yy); else p.lineTo(x, yy); });
        p.closePath();
      }
      return p;
    });
  }

  private colors(sc: Scenario): string[] {
    const w = this.world;
    if (sc.polities && sc.owners) return sc.owners.map((o) => sc.polities![o]?.color ?? '#5b6577');
    return w.provinces.map((p) => (p.owner === 'ATA' ? '#5b6577' : w.modernCountry(p.owner)?.color ?? '#5b6577'));
  }

  private draw(sc: Scenario, W: number, H: number): string {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    const b = sc.focus ?? WORLD;
    const x0 = b[0], x1 = b[2], y0 = -merc(b[3]), y1 = -merc(b[1]);
    const k = Math.max((W * dpr) / (x1 - x0), (H * dpr) / (y1 - y0));
    const tx = (W * dpr) / 2 - ((x0 + x1) / 2) * k, ty = (H * dpr) / 2 - ((y0 + y1) / 2) * k;
    ctx.fillStyle = '#0e1b2e'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(k, 0, 0, k, tx, ty);
    const cols = this.colors(sc);
    ctx.lineWidth = 0.7 / k; ctx.strokeStyle = 'rgba(8, 16, 30, 0.55)';
    this.paths.forEach((p, i) => { if (!p) return; ctx.fillStyle = cols[i]; ctx.fill(p, 'evenodd'); });
    this.paths.forEach((p) => { if (p) ctx.stroke(p); });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // 아래쪽을 살짝 어둡게(글자가 얹히는 자리)
    const g = ctx.createLinearGradient(0, c.height * 0.55, 0, c.height);
    g.addColorStop(0, 'rgba(8,14,26,0)'); g.addColorStop(1, 'rgba(8,14,26,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  cached(sc: Scenario, W: number, H: number): string | undefined { return this.cache.get(`${sc.id}:${W}x${H}`); }

  /** 비어 있는 썸네일을 하나씩 차례로 그린다(화면이 멈추지 않게). */
  request(sc: Scenario, W: number, H: number, done: (url: string) => void): void {
    const key = `${sc.id}:${W}x${H}`;
    const hit = this.cache.get(key);
    if (hit) { done(hit); return; }
    this.queue.push(() => { const url = this.cache.get(key) ?? this.draw(sc, W, H); this.cache.set(key, url); done(url); });
    this.pump();
  }
  /** 템플릿 내용이 바뀌었을 때(스튜디오 저장 등) 그 템플릿의 그림을 지운다. */
  forget(id: string): void { for (const k of [...this.cache.keys()]) if (k.startsWith(`${id}:`)) this.cache.delete(k); }
  private pump(): void {
    if (this.busy) return;
    const job = this.queue.shift();
    if (!job) return;
    this.busy = true;
    window.setTimeout(() => { try { job(); } finally { this.busy = false; this.pump(); } }, 0);
  }
}
