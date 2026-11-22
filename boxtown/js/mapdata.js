// 마을 설계 데이터. 여기가 "손으로 짜는" 부분이다.
// 격자 한 칸은 12m. 칸 (cx, cz)의 중심은 월드 좌표 (cx*12, cz*12). +Z가 북쪽, 바다는 남쪽.
import { NATURE_KEYS, DISTRICT_KEYS, FURNITURE_KEYS, TRAIN_KEYS, CITY_KEYS } from './world.js';
export const CELL = 12;

// 북쪽 줄부터 적는다(화면에서 본 지도와 같은 방향).
//  # 도로   x 횡단보도   p 보도블록(상가 터)   g 잔디   q 부두   . 자연 지형
const ROWS_NORTH_FIRST = [
  '.#..........', // 8  주택가 (북쪽 길로 나가는 출구)
  '.##########.', // 7  뒷길
  '.#ppp#ggpp#.', // 6
  '.#pppxggpp#.', // 5
  '###x##x##x##', // 4  중앙로 (동서로 마을 밖 길과 이어진다)
  '.#ppp#pppp#.', // 3
  '.#pppxpppp#.', // 2
  '.##x##x####.', // 1  해안로
  '.qqqqqqqqqq.', // 0  부두
];
export const GRID = ROWS_NORTH_FIRST.slice().reverse(); // GRID[cz][cx]

// 건물. f는 정면이 바라보는 방향(N/E/S/W). cx, cz는 칸 좌표(소수 가능).
export const BUILDINGS = [
  // A 블록: 해안로와 중앙로 사이 서쪽
  { m: 'commercial/building-a', cx: 2.0, cz: 2.02, f: 'S' },
  { m: 'commercial/building-c', cx: 2.0, cz: 2.98, f: 'N' },
  // B 블록: 도심. 높은 건물이 스카이라인을 만든다.
  { m: 'commercial/building-skyscraper-b', cx: 6.3, cz: 2.5, f: 'S' },
  { m: 'commercial/building-n', cx: 8.15, cz: 2.5, f: 'S' },
  // C 블록
  { m: 'commercial/building-g', cx: 2.0, cz: 5.0, f: 'S' },
  { m: 'commercial/building-j', cx: 3.45, cz: 5.15, f: 'S' },
  { m: 'commercial/building-d', cx: 2.0, cz: 6.02, f: 'N' },
  { m: 'commercial/building-b', cx: 3.0, cz: 6.25, f: 'N' },
  { m: 'commercial/building-h', cx: 3.95, cz: 6.25, f: 'N' },
  // D 블록: 공원 옆 고층
  { m: 'commercial/building-skyscraper-d', cx: 8.05, cz: 5.5, f: 'S' },
  // 뒷길 북쪽 주택가
  { m: 'suburban/building-type-a', cx: -0.6, cz: 8.05, f: 'S' },
  { m: 'suburban/building-type-d', cx: 2.85, cz: 8.05, f: 'S' },
  { m: 'suburban/building-type-k', cx: 4.3, cz: 8.05, f: 'S' },
  { m: 'suburban/building-type-f', cx: 5.75, cz: 8.15, f: 'S' },
  { m: 'suburban/building-type-s', cx: 7.3, cz: 8.05, f: 'S' },
  { m: 'suburban/building-type-b', cx: 9.0, cz: 8.1, f: 'S' },
  { m: 'suburban/building-type-q', cx: 10.5, cz: 8.0, f: 'S' },
  // 마을 양 끝
  { m: 'suburban/building-type-m', cx: -0.1, cz: 5.6, f: 'E' },
  { m: 'suburban/building-type-o', cx: -0.05, cz: 2.6, f: 'E' },
  { m: 'suburban/building-type-t', cx: 11.2, cz: 6.0, f: 'W' },
  { m: 'suburban/building-type-e', cx: 11.2, cz: 2.4, f: 'W' },
  // 부두 창고
  { m: 'industrial/building-s', cx: 1.95, cz: 0.0, f: 'N' },
  { m: 'industrial/building-k', cx: 9.9, cz: 0.02, f: 'N' },
];

// 직업 건물(js/jobsites.js에서 상자로 짓는다). 가게 앞 표시에서 E로 일을 시작한다.
export const JOB_SITES = [
  { id: 'pizza', cx: 3.45, cz: 2.0, f: 'S' },
  { id: 'fire', cx: 3.4, cz: 3.05, f: 'N', pad: 1.0 },
  { id: 'taxi', cx: 9.1, cz: 5.02, f: 'S' },
  { id: 'clean', cx: 9.1, cz: 6.0, f: 'N' },
  { id: 'fish', cx: 6.95, cz: -0.1, f: 'N' },
];

// 고정 소품. r은 도(°), s는 배율.
export const PROPS = [
  // 부두: 컨테이너 더미
  { m: 'industrial/shipping-container-a', cx: 3.55, cz: -0.2, r: 0 },
  { m: 'industrial/shipping-container-b', cx: 3.95, cz: -0.2, r: 0 },
  { m: 'industrial/shipping-container-c', cx: 3.75, cz: -0.2, r: 0, y: 4.2 },
  { m: 'industrial/shipping-container-b', cx: 4.5, cz: 0.1, r: 90 },
  { m: 'industrial/shipping-container-a', cx: 8.4, cz: -0.15, r: 90 },
  { m: 'industrial/shipping-container-c', cx: 8.4, cz: 0.25, r: 90 },
  { m: 'industrial/detail-tank', cx: 0.95, cz: 0.3, r: 90 },
  { m: 'watercraft/cargo-pile-a', cx: 5.1, cz: 0.15, r: 20 },
  { m: 'watercraft/cargo-pile-b', cx: 7.35, cz: 0.2, r: -30 },
  { m: 'roads/dumpster', cx: 2.95, cz: 0.3, r: 90 },
  { m: 'roads/dumpster', cx: 9.1, cz: 0.3, r: 90 },
  // 부두 파라솔 노점
  { m: 'commercial/detail-parasol-a', cx: 6.55, cz: 0.2, r: 0 },
  // 공원(cx 6..7, cz 5..6)
  { m: 'commercial/detail-parasol-a', cx: 6.2, cz: 5.2, r: 15 },
  { m: 'commercial/detail-parasol-b', cx: 7.2, cz: 6.25, r: 70 },
  { m: 'suburban/planter', cx: 6.02, cz: 4.72, r: 0 },
  { m: 'suburban/planter', cx: 6.98, cz: 4.72, r: 0 },
  { m: 'suburban/planter', cx: 6.02, cz: 6.3, r: 0 },
  { m: 'suburban/planter', cx: 6.98, cz: 6.3, r: 0 },
  // 주택가 울타리
  { m: 'suburban/fence-1x4', cx: 2.0, cz: 8.55, r: 180 },
  { m: 'suburban/fence-1x3', cx: 6.55, cz: 8.6, r: 180 },
  { m: 'suburban/fence-1x4', cx: 8.15, cz: 8.6, r: 180 },
  // 표지판
];

// 길가에 세워 둔 차(전부 탈 수 있다). r은 도(°): 0이면 북쪽(+Z)을 본다. 우측통행 기준으로 차선을 잡았다.
export const PARKED = [
  { m: 'cars/taxi', cx: 8.45, cz: 4.30, r: -90 },
  { m: 'cars/taxi', cx: 9.3, cz: 4.30, r: -90 },
  { m: 'cars/garbage-truck', cx: 9.2, cz: 6.70, r: 90 },
  { m: 'cars/delivery', cx: 3.6, cz: 0.70, r: 90 },
  { m: 'cars/sedan', cx: 2.4, cz: 1.30, r: -90 },
  { m: 'cars/hatchback-sports', cx: 8.6, cz: 3.70, r: 90 },
  { m: 'cars/suv', cx: 4.70, cz: 6.2, r: 180 },
  { m: 'cars/van', cx: 1.30, cz: 2.5, r: 0 },
  { m: 'cars/police', cx: 6.6, cz: 7.30, r: -90 },
  { m: 'cars/truck', cx: 9.70, cz: 5.4, r: 0 },
  { m: 'cars/sedan-sports', cx: 3.2, cz: 6.70, r: 90 },
  { m: 'cars/firetruck', cx: 3.3, cz: 3.70, r: 90 },
];

// 밀고 다닐 수 있는 물리 소품(무게 kg).
export const DYNAMIC = [
  { m: 'pirate/barrel', cx: 5.6, cz: -0.25, mass: 9 },
  { m: 'pirate/barrel', cx: 5.78, cz: -0.22, mass: 9 },
  { m: 'pirate/barrel', cx: 5.7, cz: -0.08, mass: 9 },
  { m: 'pirate/crate', cx: 6.2, cz: -0.3, mass: 6 },
  { m: 'pirate/crate', cx: 6.36, cz: -0.3, mass: 6 },
  { m: 'pirate/crate', cx: 6.28, cz: -0.3, mass: 6, y: 1.4 },
  { m: 'pirate/crate-bottles', cx: 7.6, cz: -0.3, mass: 6 },
  { m: 'pirate/crate', cx: 4.9, cz: -0.3, mass: 6 },
  { m: 'cars/box', cx: 5.3, cz: 1.38, mass: 3 },
  { m: 'cars/box', cx: 5.42, cz: 1.38, mass: 3 },
  { m: 'cars/box', cx: 5.36, cz: 1.38, mass: 3, y: 1.2 },
  { m: 'cars/cone', cx: 4.3, cz: 1.3, mass: 1.5 },
  { m: 'cars/cone', cx: 4.6, cz: 1.3, mass: 1.5 },
  { m: 'cars/cone', cx: 4.9, cz: 1.3, mass: 1.5 },
  { m: 'cars/box', cx: 6.5, cz: 4.6, mass: 3 },
  { m: 'pirate/barrel', cx: 9.3, cz: 0.2, mass: 9 },
  { m: 'pirate/crate', cx: 6.02, cz: -2.2, mass: 6 },
  { m: 'pirate/barrel', cx: 5.98, cz: -3.3, mass: 9 },
];

// 정박한 배. 파도에 맞춰 흔들린다.
export const BOATS = [
  { m: 'watercraft/boat-fishing-small', x: 66.0, z: -17, r: 0 },
  { m: 'watercraft/boat-sail-a', x: 65.8, z: -33, r: 5 },
  { m: 'watercraft/boat-row-small', x: 30, z: -11, r: 80 },
  { m: 'watercraft/boat-sail-b', x: 118, z: -46, r: 120 },
  { m: 'watercraft/ship-cargo-a', x: 20, z: -62, r: 100, s: 2.1 },
  { m: 'watercraft/buoy', x: 96, z: -58, r: 0 },
  { m: 'watercraft/buoy-flag', x: 48, z: -52, r: 0 },
  { m: 'watercraft/boat-speed-a', x: 170, z: -70, r: 60 },
];

export const PIER = { x: 72, z0: -6, z1: -44, w: 5 };
export const LIGHTHOUSE = { x: 156, z: -14 };
export const SPAWN = { x: 60, z: 10, yaw: 2.6 };

export function modelKeys() {
  const keys = new Set();
  for (const list of [BUILDINGS, PROPS, DYNAMIC, BOATS]) for (const o of list) keys.add(o.m);
  [
    'roads/road-straight', 'roads/road-bend', 'roads/road-intersection', 'roads/road-crossroad', 'roads/road-end',
    'roads/road-crossing', 'roads/tile-low', 'roads/light-square', 'roads/light-curved', 'roads/traffic-light',
    'suburban/tree-large', 'suburban/tree-small', ...NATURE_KEYS, ...DISTRICT_KEYS, ...FURNITURE_KEYS, ...TRAIN_KEYS, ...CITY_KEYS,
  ].forEach((k) => keys.add(k));
  return [...keys];
}

// 마을 밖에 세워 둔 차(월드 좌표). 높이는 지형에서 읽는다.
PARKED.push(
  { m: 'cars/tractor', x: -322, z: 180, r: 200 },
  { m: 'cars/truck', x: 322, z: 240, r: 180 },
  { m: 'cars/suv-luxury', x: 475, z: 148, r: 180 },
  { m: 'cars/race', x: 480.5, z: 148, r: 180 },
  { m: 'cars/suv', x: 132, z: 514, r: 20 },
  { m: 'cars/van', x: 366, z: -262, r: 200 },
  { m: 'cars/hatchback-sports', x: -76, z: 62, r: 250 },
);

export const carKeys = () => [...new Set(PARKED.map((p) => p.m))];
