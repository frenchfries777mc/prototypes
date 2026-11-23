// 세계 설계 데이터: 섬, 산, 강과 호수, 길, 터(평평하게 다지는 곳), 지명.
// 좌표는 미터. +X 동쪽, +Z 북쪽. 항구 마을(기존 격자)은 x 6..138, z -6..102 그대로다.

// 지형 격자의 범위. 격자선이 마을 도로 바닥판 가장자리와 겹치도록 원점을 잡았다(4m 칸, 192m 구역 12×12).
export const WORLD = { x0: -1062, x1: 1242, z0: -870, z1: 1434, cell: 4, chunk: 48 };

// 섬: 타원 + 해안선 굴곡(warp). base는 내륙 기본 높이, hills는 언덕 높이, forest는 숲 밀도 배율.
export const ISLANDS = [
  { id: 'main', cx: 100, cz: 430, rx: 620, rz: 470, rot: 0, warp: 0.3, base: 4, hills: 52, forest: 1 },
  // 본토: 북쪽으로 지도 밖까지 이어지는 큰 땅. 시작 지역은 섬이 아니라 이 대륙의 남쪽 끝이다.
  { id: 'mainland', cx: 150, cz: 2400, rx: 700, rz: 1560, rot: 0, warp: 0.12, base: 8, hills: 46, forest: 1.3 },
  { id: 'gull', cx: 360, cz: -300, rx: 170, rz: 128, rot: 0.2, warp: 0.22, base: 3, hills: 20, forest: 0.7 },
  { id: 'fort', cx: 770, cz: -390, rx: 150, rz: 118, rot: -0.3, warp: 0.25, base: 4, hills: 30, forest: 0.6 },
  { id: 'woods', cx: -700, cz: -120, rx: 235, rz: 180, rot: 0.35, warp: 0.3, base: 4, hills: 34, forest: 2.6 },
  { id: 'spire', cx: 900, cz: 960, rx: 135, rz: 135, rot: 0, warp: 0.2, base: 6, hills: 30, forest: 0.5 },
  { id: 'mill', cx: -570, cz: 1010, rx: 200, rz: 150, rot: -0.2, warp: 0.25, base: 5, hills: 26, forest: 0.5 },
  { id: 'twinA', cx: 985, cz: 300, rx: 110, rz: 150, rot: 0.15, warp: 0.25, base: 3, hills: 28, forest: 1.4 },
  { id: 'twinB', cx: 1065, cz: 540, rx: 80, rz: 92, rot: 0, warp: 0.25, base: 3, hills: 22, forest: 1.2 },
  { id: 'palm', cx: 600, cz: -660, rx: 92, rz: 62, rot: 0.5, warp: 0.2, base: 1.5, hills: 6, forest: 0 },
  { id: 'sandA', cx: 120, cz: -330, rx: 62, rz: 42, rot: -0.4, warp: 0.2, base: 1, hills: 3, forest: 0 },
  { id: 'sandB', cx: -150, cz: -310, rx: 48, rz: 36, rot: 0.6, warp: 0.2, base: 1, hills: 3, forest: 0 },
  { id: 'sandC', cx: -390, cz: -450, rx: 72, rz: 46, rot: 0.1, warp: 0.2, base: 1.2, hills: 4, forest: 0 },
  { id: 'sandD', cx: -30, cz: -620, rx: 80, rz: 54, rot: -0.2, warp: 0.25, base: 2, hills: 10, forest: 0.8 },
];

// 산: 중심에서 r까지 서서히 낮아지는 봉우리 무리. h는 대략의 최고 높이.
export const MOUNTAINS = [
  { x: 150, z: 1340, r: 520, h: 190, s: 12.4 }, // 북쪽 산맥: 지도 끝을 가린다
  { x: 240, z: 730, r: 310, h: 118, s: 1.7 },
  { x: -330, z: 640, r: 190, h: 52, s: 5.1 },
  { x: 900, z: 960, r: 120, h: 150, s: 9.3 }, // 뾰족섬
  { x: -700, z: -120, r: 150, h: 30, s: 3.3 },
  { x: 520, z: 600, r: 170, h: 60, s: 7.7 },
];

// 강과 호수는 해수면 높이로 파낸 물길이다(바다 물이 그대로 들어온다).
export const LAKES = [{ x: 60, z: 615, r: 78 }, { x: -720, z: -110, r: 42 }];
export const RIVERS = [
  { half: 15, pts: [[60, 615], [5, 548], [-65, 472], [-128, 392], [-172, 300], [-203, 200], [-224, 100], [-246, 10], [-270, -80]] },
  { half: 9, pts: [[60, 615], [130, 660], [170, 720]] }, // 호수로 흘러드는 계곡
];

// 길. type: road(아스팔트 8m) / dirt(흙길 5m). pin은 마을 격자 도로와 맞닿는 끝의 높이.
// 물 위를 지나는 구간은 자동으로 다리가 된다.
export const ROADS = [
  // 서쪽: 마을 -> 강 다리 -> 농장 -> 풍차 언덕
  { type: 'road', pin: 0.03, pts: [[-3, 48], [-70, 50], [-140, 78], [-186, 118], [-232, 158], [-285, 190], [-340, 205]] },
  { type: 'dirt', pts: [[-340, 205], [-334, 222], [-330, 239]] }, // 서쪽 마을 남쪽 끝으로
  // 동쪽: 마을 -> 갈림길 -> 해변 리조트 -> 동해 야영장
  { type: 'road', pin: 0.03, pts: [[135, 48], [205, 54], [268, 76], [332, 78], [400, 100], [468, 128], [530, 150]] },
  { type: 'dirt', pts: [[530, 150], [575, 250], [578, 360], [562, 432]] },
  // 공단 가는 길
  { type: 'road', pts: [[268, 76], [278, 150], [290, 222]] },
  // 바다 다리 -> 갈매기섬
  { type: 'road', pts: [[332, 78], [352, 30], [360, -40], [362, -130], [360, -205], [352, -258]] },
  // 북쪽: 마을 -> 호수 마을 -> 산 전망대
  { type: 'road', pin: 0.03, pts: [[12, 99], [14, 118], [34, 128], [60, 144]] }, // 중심가 남쪽 끝으로
  { type: 'dirt', pts: [[212, 562], [256, 588], [312, 640], [318, 700], [282, 742], [248, 748]] },
  // 철도: 항구역 -> 공단역 -> 해변역 -> 야영장역 (맨 끝에 둔다: 앞의 길 번호가 바뀌지 않게)
  { type: 'rail', pts: [[158, 100], [215, 128], [262, 118], [330, 150], [400, 190], [470, 215], [530, 270], [548, 350], [530, 420]] },
];

// 터: 건물이 설 자리를 평평하게 다진다. r 안쪽은 평지, blend만큼 주변과 이어진다.
export const SITES = {
  prison: { x: 240, z: 28, r: 30, name: '교도소' },
  farm: { x: -320, z: 172, r: 76, name: '서쪽 농장' },
  wind: { x: -318, z: 590, r: 46, name: '풍차 언덕' },
  works: { x: 300, z: 262, r: 84, name: '공단' },
  resort: { x: 470, z: 142, r: 44, name: '동쪽 해변' },
  camp: { x: 560, z: 452, r: 40, name: '동해 야영장' },
  lake: { x: 168, z: 548, r: 46, name: '호수 마을' },
  lookout: { x: 236, z: 758, r: 26, name: '산 전망대' },
  gull: { x: 338, z: -322, r: 74, name: '갈매기섬 마을' },
  fort: { x: 770, z: -385, r: 62, name: '옛 요새' },
  woods: { x: -640, z: -150, r: 30, name: '고요숲 오두막' },
  ruins: { x: -770, z: -60, r: 30, name: '돌기둥 터' },
  mill: { x: -570, z: 1010, r: 80, name: '풍차섬' },
  twin: { x: 985, z: 290, r: 34, name: '쌍둥이섬 선착장' },
  cabinA: { x: -80, z: 300, r: 22 },
  cabinB: { x: 420, z: 420, r: 22 },
  cabinC: { x: -150, z: 700, r: 22 },
  cabinD: { x: 330, z: 520, r: 20 },
  park: { x: -90, z: 110, r: 44, name: '강변 공원' },
};

// 지도에 적는 지명
// ---------- 시가지: 둥근 터에 바둑판 길을 깔고 건물로 채운다 ----------
// kind에 따라 건물 종류가 달라진다(js/city.js). 길은 60m 간격의 4차선.
export const CITY = [
  { id: 'midtown', x: 60, z: 240, r: 100, kind: 'downtown', name: '중심가' },
  { id: 'north', x: 170, z: 410, r: 95, kind: 'homes', name: '북쪽 주택가' },
  { id: 'east', x: 390, z: 320, r: 95, kind: 'mixed', name: '동쪽 시가지' },
  { id: 'west', x: -330, z: 330, r: 95, kind: 'homes', name: '서쪽 마을' },
];
export const CITY_STEP = 60;
export const JUNCTIONS = []; // 시가지 네거리: { x, z, city }
for (const c of CITY) {
  SITES[c.id] = { x: c.x, z: c.z, r: c.r + 6, name: c.name };
  const n = Math.floor((c.r - 31) / CITY_STEP), half = (o) => Math.sqrt(c.r * c.r - o * o) - 4;
  c.offsets = []; for (let k = -n; k <= n; k++) c.offsets.push(k * CITY_STEP);
  c.half = half;
  for (const o of c.offsets) {
    const h = half(o), line = (f) => { const pts = []; for (let t = -h; t < h - 1; t += 30) pts.push(f(t)); pts.push(f(h)); return pts; };
    ROADS.push({ type: 'road', city: c.id, ns: false, pts: line((t) => [c.x + t, c.z + o]) });
    ROADS.push({ type: 'road', city: c.id, ns: true, pts: line((t) => [c.x + o, c.z + t]) });
    for (const o2 of c.offsets) if (Math.abs(o2) <= half(o) && Math.abs(o) <= half(o2)) JUNCTIONS.push({ x: c.x + o2, z: c.z + o, city: c.id });
  }
}
// 시가지와 기존 길을 잇는 길
ROADS.push(
  { type: 'road', pts: [[60, 336], [66, 372], [79, 410]] }, // 중심가 -> 북쪽 주택가
  { type: 'road', pts: [[170, 501], [150, 514], [120, 520]] }, // 북쪽 주택가 -> 호수 마을
  { type: 'road', pts: [[400, 100], [408, 160], [390, 229]] }, // 동쪽 도로 -> 동쪽 시가지
  { type: 'dirt', pts: [[-330, 421], [-332, 480], [-318, 560]] }, // 서쪽 마을 -> 풍차 언덕
);

export const PLACES = [
  { name: '항구 마을', x: 66, z: 48, big: true },
  { name: '본토', x: 60, z: 380, big: true },
  { name: '북쪽 산맥', x: 150, z: 1290 },
  { name: '큰 호수', x: 60, z: 615 },
  { name: '눈산', x: 250, z: 800 },
  { name: '갈매기섬', x: 360, z: -360, big: true },
  { name: '요새섬', x: 770, z: -450, big: true },
  { name: '고요숲 섬', x: -700, z: -200, big: true },
  { name: '뾰족섬', x: 900, z: 1040, big: true },
  { name: '풍차섬', x: -570, z: 1090, big: true },
  { name: '쌍둥이섬', x: 1010, z: 400, big: true },
  { name: '야자섬', x: 600, z: -700 },
  ...Object.values(SITES).filter((s) => s.name).map((s) => ({ name: s.name, x: s.x, z: s.z })),
];

// 자연물 모델(나무, 바위, 풀)
export const NATURE_KEYS = [
  'nature/tree_blocks', 'nature/tree_blocks_dark', 'nature/tree_blocks_fall', 'nature/tree_default', 'nature/tree_default_fall', 'nature/tree_oak', 'nature/tree_oak_dark',
  'nature/tree_fat', 'nature/tree_detailed', 'nature/tree_detailed_fall', 'nature/tree_plateau', 'nature/tree_simple',
  'nature/tree_pineRoundA', 'nature/tree_pineRoundC', 'nature/tree_pineTallA_detailed', 'nature/tree_pineTallB_detailed', 'nature/tree_pineDefaultA',
  'nature/tree_palmTall', 'nature/tree_palmDetailedTall', 'nature/tree_palmBend',
  'nature/stone_largeA', 'nature/stone_largeB', 'nature/stone_largeD', 'nature/stone_largeF', 'nature/stone_tallA', 'nature/stone_tallC',
  'nature/plant_bush', 'nature/plant_bushDetailed', 'nature/plant_bushLarge', 'nature/grass', 'nature/grass_large',
  'nature/flower_redA', 'nature/flower_yellowA', 'nature/flower_purpleA',
  'pirate/palm-detailed-bend', 'pirate/palm-detailed-straight', 'pirate/palm-straight', 'pirate/rocks-a', 'pirate/rocks-b', 'pirate/rocks-c',
  'pirate/rocks-sand-a', 'pirate/rocks-sand-b',
];
// 마을 밖 지구에서 쓰는 모델
export const DISTRICT_KEYS = [
  ...'abcdefghijkmnoqst'.split('').map((c) => 'suburban/building-type-' + c),
  ...'abcefglmqrsk'.split('').map((c) => 'industrial/building-' + c),
  'industrial/chimney-large', 'industrial/chimney-medium', 'industrial/detail-tank-large', 'industrial/water-tower', 'industrial/windmill',
  'industrial/solar-panel-landscape-group', 'industrial/shipping-container-a', 'industrial/shipping-container-b', 'industrial/shipping-container-c',
  'commercial/building-n', 'commercial/building-skyscraper-a', 'commercial/building-e', 'commercial/building-c', 'commercial/building-h',
  'commercial/detail-parasol-a', 'commercial/detail-parasol-b',
  'nature/tent_detailedOpen', 'nature/tent_smallOpen', 'nature/tent_detailedClosed', 'nature/campfire_stones', 'nature/log_stack', 'nature/log_stackLarge',
  'nature/crops_cornStageD', 'nature/crops_wheatStageB', 'nature/crop_pumpkin', 'nature/crop_melon', 'nature/fence_simple', 'nature/sign', 'nature/canoe',
  'nature/statue_column', 'nature/statue_columnDamaged', 'nature/statue_obelisk', 'nature/statue_head', 'nature/statue_ring', 'nature/statue_block', 'nature/stump_round',
  'pirate/castle-wall', 'pirate/castle-gate', 'pirate/tower-complete-large', 'pirate/tower-complete-small', 'pirate/tower-watch', 'pirate/cannon', 'pirate/cannon-mobile',
  'pirate/flag-pirate-high', 'pirate/flag-high', 'pirate/chest', 'pirate/ship-wreck', 'pirate/structure', 'pirate/structure-roof', 'pirate/barrel', 'pirate/crate',
  'watercraft/boat-row-small', 'watercraft/boat-row-large', 'watercraft/boat-fishing-small', 'watercraft/boat-sail-a', 'watercraft/boat-sail-b', 'watercraft/boat-speed-a', 'watercraft/boat-tug-a',
];

// 철도역: 노선 위의 위치(0~1)와 이름
export const STATIONS = [[0.02, '항구역'], [0.33, '공단역'], [0.6, '해변역'], [0.98, '야영장역']];

// 실내 가구(Kenney Furniture Kit)와 기차(Train Kit) 모델
export const FURNITURE_KEYS = ['bedDouble', 'bedSingle', 'bedBunk', 'loungeSofa', 'loungeChair', 'table', 'tableRound', 'tableCoffee', 'chair', 'chairCushion', 'chairDesk', 'desk',
  'kitchenFridge', 'kitchenCabinet', 'kitchenSink', 'kitchenStove', 'kitchenCabinetUpper', 'kitchenBar', 'stoolBar', 'bookcaseOpen', 'bookcaseClosedWide', 'cabinetTelevision',
  'televisionModern', 'televisionVintage', 'lampRoundFloor', 'lampRoundTable', 'lampSquareCeiling', 'pottedPlant', 'plantSmall1', 'rugRectangle', 'rugRound', 'sideTable',
  'cabinetBedDrawerTable', 'bench', 'benchCushion', 'toilet', 'computerScreen', 'computerKeyboard', 'trashcan', 'speaker', 'radio', 'books', 'coatRackStanding', 'bear', 'laptop',
  'kitchenCoffeeMachine', 'kitchenMicrowave', 'washer', 'bathroomSink'].map((k) => 'furniture/' + k);
export const TRAIN_KEYS = ['train/train-electric-subway-a', 'train/train-electric-subway-b', 'train/train-electric-subway-c'];

// 시가지 건물 모델
export const CITY_KEYS = [
  ...'abcdefghijklmn'.split('').map((c) => 'commercial/building-' + c), ...'abcde'.split('').map((c) => 'commercial/building-skyscraper-' + c),
  ...'abcdefghijklmnopqrstu'.split('').map((c) => 'suburban/building-type-' + c), ...'abegmr'.split('').map((c) => 'industrial/building-' + c),
];
