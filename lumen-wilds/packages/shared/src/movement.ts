import { BODY_RADIUS, DIRS } from './constants';
import type { World } from './world';

export interface Vec2 { x: number; y: number; }

function free(world: World, x: number, y: number, fromH: number): boolean {
  const x0 = Math.floor(x - BODY_RADIUS), x1 = Math.floor(x + BODY_RADIUS);
  const y0 = Math.floor(y - BODY_RADIUS), y1 = Math.floor(y + BODY_RADIUS);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (!world.canStep(fromH, tx, ty)) return false;
  return true;
}

/**
 * 축을 분리해 이동시켜 벽을 따라 미끄러지게 한다.
 * 클라이언트 예측과 서버 시뮬레이션이 이 함수를 그대로 공유하므로 순수하고 결정적이어야 한다.
 */
export function moveBy(world: World, p: Vec2, dx: number, dy: number): void {
  const h = world.tileH(Math.floor(p.x), Math.floor(p.y));
  // 이미 막힌 곳에 끼어 있다면(예: 발밑에 노드가 되살아남) 충돌을 무시하고 빠져나오게 한다.
  if (!free(world, p.x, p.y, h)) { p.x += dx; p.y += dy; return; }
  if (dx !== 0 && free(world, p.x + dx, p.y, h)) p.x += dx;
  if (dy !== 0 && free(world, p.x, p.y + dy, h)) p.y += dy;
}

export function moveDir(world: World, p: Vec2, dir: number, dist: number): void {
  const d = DIRS[dir];
  if (d) moveBy(world, p, d[0] * dist, d[1] * dist);
}
