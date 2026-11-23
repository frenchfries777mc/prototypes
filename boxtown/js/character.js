// 네모 캐릭터: 둥근 상자로 조립한 몸과, 물리가 아니라 스프링으로 만드는 흐느적거림.
// 플레이어와 주민이 같은 부품(지오메트리)을 공유하고 색만 인스턴스별로 다르게 넣는다.
import { roundedBox, damp, clamp, lerp, rng } from './util.js';
const B = window.BABYLON;

// 감쇠 스프링. 목표를 지나쳤다가 돌아오는 출렁임을 만든다.
class Spring {
  constructor(freq, damping) { this.x = 0; this.v = 0; this.f = freq; this.d = damping; }
  step(target, dt) {
    const w = this.f * 2 * Math.PI;
    this.v += (-2 * this.d * w * this.v - w * w * (this.x - target)) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

export const LOOKS = {
  courier: { skin: '#ffd3a8', shirt: '#f2644b', pants: '#34456f', shoes: '#f5f1e8', head: 'cap', hat: '#f2644b', brim: '#fff7e6' },
};
const SKINS = ['#ffd3a8', '#f6c193', '#e0a878', '#c68a5c', '#9c6843', '#ffe0c2'];
const SHIRTS = ['#4f9bea', '#57c27a', '#f4c542', '#b072e0', '#f08fb0', '#3fc1c9', '#f28b3c', '#e8e4dc', '#6b7a99', '#d9534f'];
const PANTS = ['#34456f', '#4a4f5e', '#7a5b45', '#2f6b5a', '#8a8fa3', '#3b3b4d'];
const HAIRS = ['#3a2a22', '#6b4226', '#d8a657', '#1f1f28', '#b5482e', '#8d8d99'];
export function randomLook(seed) {
  const r = rng(seed);
  const head = r.pick(['hair', 'hair', 'cap', 'beanie', 'hair', 'long', 'pigtails', 'bun', 'afro', 'bald', 'straw', 'headphones']);
  const hairy = ['hair', 'long', 'pigtails', 'bun', 'afro', 'headphones'].includes(head);
  return { skin: r.pick(SKINS), shirt: r.pick(SHIRTS), pants: r.pick(PANTS), shoes: r.pick(['#f5f1e8', '#2c2c36', '#b55b3c']), head, hat: hairy ? r.pick(HAIRS) : r.pick(SHIRTS), brim: '#fff7e6',
    face: r() < 0.22 ? r.pick(['glasses', 'sunglasses', 'mustache', 'beard', 'mask']) : 'none', neck: r() < 0.2 ? r.pick(['scarf', 'tie', 'necklace', 'belt']) : 'none', back: r() < 0.15 ? r.pick(['backpack', 'guitar']) : 'none' };
}

// ----- 치장품: 둥근 상자 몇 개로 만든다 -----
// 한 줄: [가로, 높이, 세로, 모서리, 색, x, y, z, 기울기 x, 기울기 z]. 색 'H'는 머리(모자) 색, 'B'는 챙 색.
// 머리 부품은 목 기준(머리는 x ±0.47, y 0~0.82, z ±0.44), 몸 부품은 몸통 기준(x ±0.33, y 0~0.58, z ±0.22).
const TOP = [0.98, 0.3, 0.92, 0.12, 'H', 0, 0.74, -0.02];
const GOLD = '#ffd84a', INK = '#22202b', WHITE = '#ffffff', RED = '#d9473c', STEEL = '#8f95a8';
const pair = (p) => [p, [...p.slice(0, 5), -p[5], ...p.slice(6)]];
export const PARTS = {
  head: {
    hair: [TOP, [0.8, 0.07, 0.36, 0.03, 'H', 0, 0.55, -0.42, Math.PI / 2]],
    cap: [[0.98, 0.3, 0.92, 0.12, 'H', 0, 0.74, -0.01], [0.8, 0.07, 0.36, 0.03, 'B', 0, 0.63, 0.55]],
    beanie: [[0.98, 0.3, 0.92, 0.12, 'H', 0, 0.74, 0], [0.21, 0.2, 0.23, 0.08, 'B', 0, 0.95, 0]],
    bald: [],
    long: [TOP, [0.92, 0.66, 0.12, 0.05, 'H', 0, 0.36, -0.47], ...pair([0.1, 0.52, 0.5, 0.04, 'H', 0.5, 0.42, -0.14])],
    pigtails: [TOP, ...pair([0.22, 0.42, 0.22, 0.08, 'H', 0.6, 0.38, -0.1])],
    bun: [TOP, [0.36, 0.3, 0.36, 0.12, 'H', 0, 1.0, -0.2]],
    afro: [[1.22, 0.64, 1.16, 0.25, 'H', 0, 0.86, -0.04]],
    mohawk: [[0.16, 0.36, 0.84, 0.06, 'H', 0, 0.96, -0.02]],
    spiky: [TOP, [0.2, 0.28, 0.2, 0.05, 'H', 0, 0.98, 0.2, 0.3], [0.2, 0.3, 0.2, 0.05, 'H', 0, 1.0, -0.1, -0.2], ...pair([0.2, 0.26, 0.2, 0.05, 'H', 0.3, 0.96, 0, 0, -0.4])],
    tophat: [[1.2, 0.07, 1.14, 0.03, 'H', 0, 0.84, 0], [0.72, 0.56, 0.68, 0.08, 'H', 0, 1.14, 0], [0.75, 0.12, 0.71, 0.03, 'B', 0, 0.93, 0]],
    cowboy: [[1.42, 0.07, 1.2, 0.03, 'H', 0, 0.84, 0], [0.72, 0.36, 0.68, 0.14, 'H', 0, 1.03, 0], [0.75, 0.09, 0.71, 0.03, 'B', 0, 0.92, 0]],
    straw: [[1.5, 0.06, 1.44, 0.03, '#e8cf7a', 0, 0.84, 0], [0.8, 0.26, 0.76, 0.1, '#e8cf7a', 0, 0.97, 0], [0.83, 0.08, 0.79, 0.03, RED, 0, 0.9, 0]],
    crown: [TOP, [0.8, 0.16, 0.76, 0.03, GOLD, 0, 0.94, 0], ...pair([0.14, 0.2, 0.14, 0.04, GOLD, 0.3, 1.08, 0.28]), ...pair([0.14, 0.2, 0.14, 0.04, GOLD, 0.3, 1.08, -0.28]), [0.12, 0.12, 0.06, 0.03, '#e5553f', 0, 0.94, 0.39]],
    helmet: [[1.04, 0.5, 0.98, 0.22, 'H', 0, 0.72, 0], [0.2, 0.52, 1.0, 0.1, 'B', 0, 0.73, 0]],
    chef: [[0.86, 0.2, 0.8, 0.05, WHITE, 0, 0.9, 0], [1.04, 0.4, 0.98, 0.18, WHITE, 0, 1.16, 0]],
    wizard: [[1.3, 0.07, 1.24, 0.03, 'H', 0, 0.84, 0], [0.76, 0.3, 0.72, 0.08, 'H', 0, 1.0, 0], [0.5, 0.3, 0.48, 0.08, 'H', 0, 1.28, -0.03], [0.26, 0.3, 0.26, 0.07, 'H', 0, 1.54, -0.08], [0.16, 0.16, 0.05, 0.03, GOLD, 0, 1.0, 0.37]],
    bunny: [TOP, ...pair([0.16, 0.6, 0.1, 0.05, WHITE, 0.24, 1.18, 0]), ...pair([0.08, 0.44, 0.04, 0.02, '#f6a5c0', 0.24, 1.18, 0.05])],
    cat: [TOP, ...pair([0.26, 0.24, 0.14, 0.06, 'H', 0.3, 0.98, 0]), ...pair([0.12, 0.12, 0.04, 0.03, '#f6a5c0', 0.3, 0.97, 0.07])],
    horns: [TOP, ...pair([0.14, 0.3, 0.14, 0.05, RED, 0.3, 1.0, 0, 0, -0.3])],
    headphones: [TOP, [1.06, 0.08, 0.14, 0.03, '#2c2c36', 0, 0.93, 0], ...pair([0.14, 0.36, 0.34, 0.07, '#e5553f', 0.53, 0.45, 0])],
    party: [TOP, [0.5, 0.2, 0.5, 0.06, '#f08fb0', 0, 0.96, 0], [0.36, 0.2, 0.36, 0.06, '#3fc1c9', 0, 1.14, 0], [0.22, 0.2, 0.22, 0.06, '#f08fb0', 0, 1.32, 0], [0.14, 0.14, 0.14, 0.05, GOLD, 0, 1.48, 0]],
    pirate: [[0.99, 0.16, 0.93, 0.05, RED, 0, 0.7, 0], [1.26, 0.36, 0.5, 0.1, INK, 0, 0.94, 0], [0.2, 0.16, 0.04, 0.03, WHITE, 0, 0.95, 0.26]],
    police: [[0.98, 0.3, 0.92, 0.12, '#1f2a4a', 0, 0.74, -0.01], [0.8, 0.07, 0.36, 0.03, INK, 0, 0.63, 0.55], [0.16, 0.14, 0.05, 0.03, GOLD, 0, 0.78, 0.45]],
    santa: [[1.02, 0.16, 0.96, 0.06, WHITE, 0, 0.68, 0], [0.9, 0.34, 0.84, 0.14, RED, 0, 0.9, 0], [0.5, 0.3, 0.5, 0.1, RED, 0.2, 1.14, -0.1], [0.22, 0.22, 0.22, 0.09, WHITE, 0.42, 1.2, -0.2]],
    hardhat: [[1.02, 0.34, 0.96, 0.16, '#f4c542', 0, 0.76, 0], [0.86, 0.07, 0.3, 0.03, '#f4c542', 0, 0.64, 0.5], [0.14, 0.36, 0.9, 0.05, '#f4c542', 0, 0.78, 0]],
    viking: [[1.02, 0.36, 0.96, 0.16, STEEL, 0, 0.76, 0], ...pair([0.14, 0.36, 0.14, 0.05, '#f5f1e8', 0.56, 0.94, 0, 0, -0.35])],
    halo: [TOP, [0.7, 0.06, 0.7, 0.03, GOLD, 0, 1.24, 0]],
    propeller: [[0.98, 0.3, 0.92, 0.12, 'H', 0, 0.74, -0.01], [0.8, 0.07, 0.36, 0.03, 'B', 0, 0.63, 0.55], [0.06, 0.16, 0.06, 0.02, '#2c2c36', 0, 0.96, 0], [0.62, 0.04, 0.12, 0.02, '#e5553f', 0, 1.05, 0]],
    flower: [TOP, [0.22, 0.22, 0.08, 0.05, '#f08fb0', 0.32, 0.74, 0.45], [0.09, 0.09, 0.05, 0.03, GOLD, 0.32, 0.74, 0.5]],
    bow: [TOP, ...pair([0.26, 0.24, 0.12, 0.06, '#e5553f', 0.17, 0.98, 0]), [0.12, 0.14, 0.14, 0.04, '#b8322a', 0, 0.98, 0]],
    antenna: [TOP, ...pair([0.04, 0.36, 0.04, 0.015, '#3fa868', 0.2, 1.05, 0]), ...pair([0.14, 0.14, 0.14, 0.06, '#57c27a', 0.2, 1.26, 0])],
    // ----- 병맛 -----
    box: [[1.12, 1.0, 1.06, 0.03, '#c9a36a', 0, 0.43, 0], ...pair([0.2, 0.2, 0.04, 0.02, INK, 0.22, 0.42, 0.53]), [0.5, 0.06, 0.04, 0.02, '#8a6a3a', 0, 0.8, 0.53], [0.3, 0.1, 0.04, 0.02, RED, -0.3, 0.12, 0.53]],
    poop: [[0.9, 0.24, 0.86, 0.11, '#7a4a22', 0, 0.9, 0], [0.64, 0.22, 0.6, 0.1, '#7a4a22', 0.04, 1.1, 0], [0.4, 0.2, 0.38, 0.09, '#7a4a22', -0.03, 1.28, 0], [0.2, 0.18, 0.2, 0.07, '#7a4a22', 0.03, 1.44, 0], ...pair([0.1, 0.12, 0.04, 0.03, WHITE, 0.14, 0.92, 0.43])],
    banana: [[0.26, 0.5, 0.26, 0.1, '#ffd84a', 0, 1.0, 0], [0.26, 0.4, 0.26, 0.1, '#ffd84a', 0.14, 1.36, 0, 0, -0.5], [0.12, 0.14, 0.12, 0.04, '#7a5b45', 0.36, 1.58, 0], ...pair([0.3, 0.1, 0.5, 0.04, '#ffe98a', 0.3, 0.86, 0, 0, -0.5])],
    chicken: [[0.98, 0.3, 0.92, 0.12, WHITE, 0, 0.74, 0], [0.12, 0.26, 0.5, 0.05, RED, 0, 1.0, 0.05], [0.12, 0.16, 0.2, 0.05, RED, 0, 1.1, -0.2], [0.2, 0.12, 0.26, 0.05, '#f4c542', 0, 0.3, 0.56], [0.1, 0.16, 0.06, 0.03, RED, 0, 0.14, 0.5]],
    watermelon: [[1.06, 0.52, 1.0, 0.24, '#3fa868', 0, 0.72, 0], ...pair([0.12, 0.54, 1.02, 0.06, '#2f6b5a', 0.3, 0.72, 0]), [0.12, 0.54, 1.02, 0.06, '#2f6b5a', 0, 0.72, 0], [0.9, 0.06, 0.06, 0.03, '#e5553f', 0, 0.48, 0.48]],
    pot: [[1.04, 0.5, 0.98, 0.1, STEEL, 0, 0.78, 0], [1.1, 0.06, 1.04, 0.03, '#c9cede', 0, 0.54, 0], ...pair([0.26, 0.08, 0.14, 0.03, INK, 0.64, 0.8, 0])],
    cone: [[0.9, 0.08, 0.86, 0.03, '#f28b3c', 0, 0.86, 0], [0.56, 0.3, 0.54, 0.08, '#f28b3c', 0, 1.04, 0], [0.42, 0.14, 0.4, 0.04, WHITE, 0, 1.24, 0], [0.3, 0.3, 0.28, 0.07, '#f28b3c', 0, 1.44, 0], [0.16, 0.2, 0.16, 0.05, '#f28b3c', 0, 1.66, 0]],
    tv: [[1.2, 1.0, 1.0, 0.1, '#3a3d4d', 0, 0.44, 0], [0.9, 0.7, 0.06, 0.08, '#8fd3ff', 0, 0.46, 0.5], ...pair([0.12, 0.2, 0.04, 0.03, INK, 0.2, 0.52, 0.54]), [0.3, 0.06, 0.04, 0.02, INK, 0, 0.3, 0.54], ...pair([0.04, 0.4, 0.04, 0.015, STEEL, 0.2, 1.1, 0, 0, -0.4])],
    egg: [[1.3, 0.08, 1.2, 0.04, WHITE, 0.06, 0.86, 0.02], [0.5, 0.2, 0.5, 0.1, '#ffc93c', -0.1, 0.94, 0.05]],
    plunger: [[0.5, 0.2, 0.5, 0.1, '#b8322a', 0, 0.9, 0], [0.09, 0.7, 0.09, 0.03, '#c9a36a', 0, 1.3, 0]],
    duck: [[0.5, 0.3, 0.6, 0.12, '#ffd84a', 0, 0.98, -0.05], [0.3, 0.28, 0.3, 0.11, '#ffd84a', 0, 1.22, 0.14], [0.16, 0.07, 0.16, 0.03, '#f28b3c', 0, 1.18, 0.34], ...pair([0.05, 0.06, 0.04, 0.02, INK, 0.08, 1.28, 0.3])],
    cheese: [[1.0, 0.4, 0.96, 0.06, '#ffc93c', 0, 0.9, 0], [0.2, 0.2, 0.04, 0.08, '#e0a020', -0.25, 0.92, 0.48], [0.14, 0.14, 0.04, 0.06, '#e0a020', 0.2, 0.84, 0.48], [0.18, 0.18, 0.18, 0.08, '#e0a020', 0.25, 1.06, 0.1]],
    cactus: [[0.36, 0.7, 0.36, 0.14, '#3fa868', 0, 1.2, 0], [0.34, 0.14, 0.14, 0.06, '#3fa868', 0.3, 1.2, 0], [0.14, 0.3, 0.14, 0.06, '#3fa868', 0.44, 1.32, 0], [0.34, 0.14, 0.14, 0.06, '#3fa868', -0.3, 1.34, 0], [0.14, 0.24, 0.14, 0.06, '#3fa868', -0.44, 1.44, 0], [0.5, 0.14, 0.5, 0.05, '#b5713c', 0, 0.88, 0], [0.12, 0.12, 0.12, 0.05, '#f08fb0', 0, 1.6, 0]],
    toast: [[1.2, 1.2, 0.3, 0.14, '#e9c98a', 0, 0.5, -0.36], [1.3, 0.16, 0.34, 0.06, '#b5713c', 0, 1.1, -0.36], ...pair([0.16, 1.2, 0.34, 0.06, '#b5713c', 0.6, 0.5, -0.36])],
    arrow: [TOP, [0.07, 0.07, 1.6, 0.02, '#c9a36a', 0, 0.62, 0], [0.2, 0.2, 0.2, 0.03, STEEL, 0, 0.62, 0.86], [0.26, 0.26, 0.1, 0.02, RED, 0, 0.62, -0.8]],
    fishhat: [TOP, [0.3, 0.3, 0.8, 0.12, '#6fb6d9', 0, 1.0, 0, 0, 0], [0.08, 0.34, 0.26, 0.03, '#4f86a8', 0, 1.0, -0.5], ...pair([0.06, 0.08, 0.06, 0.02, INK, 0.14, 1.04, 0.28])],
  },
  face: {
    none: [],
    glasses: [[0.74, 0.05, 0.05, 0.02, INK, 0, 0.51, 0.47], ...pair([0.3, 0.04, 0.05, 0.015, INK, 0.2, 0.23, 0.47]), ...pair([0.04, 0.3, 0.05, 0.015, INK, 0.35, 0.37, 0.47]), ...pair([0.04, 0.3, 0.05, 0.015, INK, 0.06, 0.37, 0.47])],
    sunglasses: [...pair([0.34, 0.2, 0.06, 0.04, '#16161d', 0.21, 0.38, 0.47]), [0.14, 0.05, 0.05, 0.02, '#16161d', 0, 0.43, 0.47]],
    eyepatch: [[0.26, 0.26, 0.06, 0.04, '#16161d', 0.2, 0.37, 0.47], [0.97, 0.05, 0.91, 0.02, '#16161d', 0, 0.5, 0]],
    mustache: [[0.42, 0.09, 0.06, 0.03, '#3a2a22', 0, 0.25, 0.47]],
    beard: [[0.72, 0.3, 0.1, 0.06, '#3a2a22', 0, 0.06, 0.43], ...pair([0.1, 0.34, 0.5, 0.04, '#3a2a22', 0.47, 0.12, 0.18])],
    whitebeard: [[0.76, 0.5, 0.14, 0.07, '#f5f1e8', 0, -0.04, 0.44], [0.46, 0.09, 0.06, 0.03, '#f5f1e8', 0, 0.25, 0.47]],
    mask: [[0.76, 0.3, 0.08, 0.05, '#e8f1f4', 0, 0.14, 0.46]],
    ninja: [[0.98, 0.4, 0.92, 0.1, INK, 0, 0.14, 0]],
    bandana: [[0.98, 0.34, 0.92, 0.1, RED, 0, 0.12, 0]],
    clown: [[0.17, 0.17, 0.14, 0.07, '#e5553f', 0, 0.28, 0.5]],
    lollipop: [[0.04, 0.04, 0.24, 0.015, WHITE, 0.12, 0.17, 0.56], [0.17, 0.17, 0.06, 0.06, '#f08fb0', 0.12, 0.17, 0.7]],
    visor: [[0.86, 0.2, 0.08, 0.05, '#3fc1c9', 0, 0.38, 0.47]],
    robot: [[0.86, 0.2, 0.08, 0.05, '#e5553f', 0, 0.38, 0.47], [0.5, 0.06, 0.06, 0.02, STEEL, 0, 0.16, 0.47]],
    // ----- 병맛 -----
    bigeyes: [...pair([0.36, 0.4, 0.08, 0.14, WHITE, 0.22, 0.42, 0.47]), ...pair([0.14, 0.16, 0.06, 0.06, INK, 0.18, 0.36, 0.52])],
    groucho: [[0.74, 0.05, 0.05, 0.02, INK, 0, 0.51, 0.47], ...pair([0.3, 0.26, 0.04, 0.03, INK, 0.2, 0.37, 0.455]), [0.2, 0.26, 0.24, 0.09, '#f6c193', 0, 0.26, 0.56], [0.46, 0.1, 0.08, 0.04, INK, 0, 0.1, 0.48], ...pair([0.3, 0.07, 0.05, 0.02, INK, 0.2, 0.56, 0.47, 0, -0.25])],
    pinocchio: [[0.12, 0.12, 0.9, 0.04, '#f6c193', 0, 0.3, 0.86]],
    teeth: [[0.36, 0.2, 0.06, 0.03, WHITE, 0, 0.08, 0.47], [0.02, 0.2, 0.07, 0.005, '#c9cede', 0, 0.08, 0.47]],
    tongue: [[0.16, 0.3, 0.05, 0.05, '#ff6b8a', 0, 0.02, 0.47]],
    snot: [[0.07, 0.3, 0.06, 0.03, '#b7e36a', 0.08, 0.14, 0.47], [0.12, 0.12, 0.08, 0.05, '#b7e36a', 0.08, -0.02, 0.47]],
    unibrow: [[0.7, 0.1, 0.06, 0.03, INK, 0, 0.58, 0.47]],
    blush: [...pair([0.26, 0.16, 0.05, 0.06, '#ff5f7a', 0.33, 0.2, 0.455]), [0.24, 0.1, 0.05, 0.04, '#e5553f', 0, 0.16, 0.47]],
  },
  neck: {
    none: [],
    scarf: [[0.74, 0.14, 0.52, 0.06, '#e5553f', 0, 0.55, 0], [0.16, 0.34, 0.08, 0.04, '#e5553f', 0.18, 0.36, 0.25]],
    scarfblue: [[0.74, 0.14, 0.52, 0.06, '#4f9bea', 0, 0.55, 0], [0.16, 0.34, 0.08, 0.04, '#4f9bea', 0.18, 0.36, 0.25]],
    tie: [[0.1, 0.08, 0.05, 0.02, '#b8322a', 0, 0.5, 0.23], [0.1, 0.32, 0.04, 0.02, '#b8322a', 0, 0.3, 0.23]],
    bowtie: [[0.28, 0.12, 0.05, 0.03, INK, 0, 0.5, 0.23]],
    necklace: [[0.36, 0.05, 0.04, 0.02, GOLD, 0, 0.46, 0.23], [0.1, 0.1, 0.05, 0.03, GOLD, 0, 0.38, 0.23]],
    medal: [[0.08, 0.2, 0.04, 0.02, '#4f9bea', 0, 0.44, 0.23], [0.16, 0.16, 0.05, 0.05, GOLD, 0, 0.3, 0.24]],
    badge: [[0.13, 0.13, 0.04, 0.03, GOLD, -0.18, 0.42, 0.23]],
    belt: [[0.7, 0.08, 0.48, 0.03, '#3a2a22', 0, 0.04, 0], [0.12, 0.1, 0.04, 0.02, GOLD, 0, 0.04, 0.24]],
    apron: [[0.5, 0.46, 0.04, 0.02, WHITE, 0, 0.24, 0.23], [0.2, 0.14, 0.03, 0.02, '#d8dcec', 0, 0.16, 0.25]],
    vest: [[0.72, 0.4, 0.5, 0.1, '#f28b3c', 0, 0.32, 0], ...pair([0.08, 0.4, 0.04, 0.02, '#f5f1e8', 0.16, 0.32, 0.25])],
    suspenders: [...pair([0.08, 0.56, 0.47, 0.02, RED, 0.2, 0.29, 0])],
    armor: [[0.74, 0.44, 0.52, 0.1, STEEL, 0, 0.34, 0], [0.2, 0.2, 0.04, 0.03, GOLD, 0, 0.36, 0.26]],
    hawaii: [[0.4, 0.07, 0.04, 0.03, '#f08fb0', 0, 0.5, 0.23], ...pair([0.09, 0.09, 0.05, 0.03, GOLD, 0.12, 0.44, 0.23]), ...pair([0.09, 0.09, 0.05, 0.03, '#57c27a', 0.2, 0.5, 0.23])],
    // ----- 병맛 -----
    tube: [[1.1, 0.26, 0.9, 0.12, '#ffd84a', 0, 0.06, 0], [0.26, 0.3, 0.26, 0.11, '#ffd84a', 0, 0.3, 0.5], [0.16, 0.07, 0.14, 0.03, '#f28b3c', 0, 0.28, 0.68]],
    diaper: [[0.72, 0.26, 0.5, 0.1, WHITE, 0, 0.0, 0], [0.12, 0.12, 0.04, 0.05, '#c9cede', 0, 0.06, 0.25]],
    tutu: [[1.1, 0.1, 0.9, 0.04, '#f08fb0', 0, 0.06, 0], [0.9, 0.1, 0.7, 0.04, '#ff9fc6', 0, 0.14, 0]],
    sandwich: [[0.8, 0.8, 0.06, 0.03, WHITE, 0, 0.26, 0.28], [0.8, 0.8, 0.06, 0.03, WHITE, 0, 0.26, -0.28], [0.5, 0.12, 0.04, 0.02, RED, 0, 0.44, 0.32], [0.5, 0.12, 0.04, 0.02, INK, 0, 0.24, 0.32], ...pair([0.06, 0.1, 0.5, 0.02, INK, 0.3, 0.62, 0])],
    barrel: [[0.9, 0.7, 0.7, 0.14, '#b5713c', 0, 0.26, 0], [0.92, 0.07, 0.72, 0.03, STEEL, 0, 0.46, 0], [0.92, 0.07, 0.72, 0.03, STEEL, 0, 0.06, 0]],
  },
  back: {
    none: [],
    backpack: [[0.5, 0.5, 0.24, 0.1, '#4f9bea', 0, 0.3, -0.33], [0.34, 0.2, 0.06, 0.04, '#34456f', 0, 0.2, -0.46]],
    schoolbag: [[0.5, 0.5, 0.24, 0.1, '#e5553f', 0, 0.3, -0.33], [0.5, 0.2, 0.26, 0.06, '#b8322a', 0, 0.48, -0.33]],
    cape: [[0.7, 0.92, 0.06, 0.03, RED, 0, 0.1, -0.3, 0.14]],
    capeblack: [[0.7, 0.92, 0.06, 0.03, INK, 0, 0.1, -0.3, 0.14]],
    wings: [...pair([0.5, 0.3, 0.06, 0.05, WHITE, 0.5, 0.5, -0.28, 0, 0.3]), ...pair([0.34, 0.24, 0.06, 0.04, WHITE, 0.42, 0.28, -0.28, 0, 0.2])],
    batwings: [...pair([0.54, 0.3, 0.06, 0.05, '#2c2c36', 0.52, 0.5, -0.28, 0, 0.3]), ...pair([0.3, 0.2, 0.06, 0.04, '#b072e0', 0.44, 0.3, -0.28, 0, 0.2])],
    butterfly: [...pair([0.46, 0.4, 0.05, 0.1, '#f08fb0', 0.44, 0.52, -0.28, 0, 0.3]), ...pair([0.32, 0.3, 0.05, 0.08, '#b072e0', 0.38, 0.2, -0.28, 0, -0.2])],
    jetpack: [...pair([0.2, 0.5, 0.2, 0.08, STEEL, 0.16, 0.3, -0.34]), ...pair([0.12, 0.1, 0.12, 0.04, '#f28b3c', 0.16, 0.02, -0.34])],
    shell: [[0.66, 0.62, 0.22, 0.1, '#3fa868', 0, 0.3, -0.31], [0.4, 0.36, 0.05, 0.05, '#2f6b5a', 0, 0.3, -0.42]],
    guitar: [[0.36, 0.36, 0.1, 0.1, '#b5713c', -0.08, 0.18, -0.3], [0.08, 0.56, 0.06, 0.02, '#3a2a22', 0.1, 0.56, -0.3, 0, -0.45]],
    sword: [[0.08, 0.84, 0.05, 0.02, '#c9cede', 0, 0.36, -0.28, 0, 0.5], [0.3, 0.07, 0.07, 0.02, GOLD, 0.27, 0.62, -0.28, 0, 0.5]],
    surfboard: [[0.42, 1.36, 0.08, 0.04, '#3fc1c9', 0, 0.4, -0.3], [0.1, 1.36, 0.09, 0.03, WHITE, 0, 0.4, -0.3]],
    balloon: [[0.025, 0.9, 0.025, 0.01, WHITE, -0.34, 1.1, -0.26], [0.38, 0.44, 0.38, 0.15, '#e5553f', -0.34, 1.76, -0.26]],
    tail: [[0.2, 0.2, 0.42, 0.08, '#f28b3c', 0, 0.06, -0.42, -0.5], [0.16, 0.16, 0.16, 0.07, WHITE, 0, 0.18, -0.62]],
    tank: [[0.26, 0.56, 0.26, 0.11, '#f4c542', 0, 0.32, -0.36], [0.1, 0.1, 0.1, 0.03, STEEL, 0, 0.64, -0.36]],
    quiver: [[0.2, 0.5, 0.16, 0.06, '#7a5b45', 0.1, 0.34, -0.31, 0, -0.3], [0.04, 0.2, 0.04, 0.015, RED, 0.22, 0.66, -0.31, 0, -0.3], [0.04, 0.2, 0.04, 0.015, WHITE, 0.14, 0.68, -0.31, 0, -0.3]],
    // ----- 병맛 -----
    fin: [[0.08, 0.5, 0.4, 0.03, '#6b7a99', 0, 0.5, -0.36, -0.4]],
    fishback: [[0.3, 0.9, 0.16, 0.08, '#6fb6d9', 0, 0.3, -0.32, 0, 0.3], [0.34, 0.2, 0.06, 0.03, '#4f86a8', 0.2, 0.82, -0.32, 0, 0.3]],
    pan: [[0.5, 0.5, 0.06, 0.2, '#2c2c36', 0, 0.34, -0.28], [0.08, 0.44, 0.06, 0.02, '#7a5b45', 0, -0.08, -0.28]],
    toilet: [[0.6, 0.7, 0.1, 0.2, WHITE, 0, 0.34, -0.29], [0.34, 0.44, 0.04, 0.14, '#c9cede', 0, 0.34, -0.35]],
    drumstick: [[0.3, 0.4, 0.26, 0.12, '#b5713c', 0, 0.5, -0.34, 0, 0.5], [0.08, 0.34, 0.08, 0.03, WHITE, 0.2, 0.14, -0.34, 0, 0.5]],
    rocket: [[0.3, 0.9, 0.3, 0.12, WHITE, 0, 0.4, -0.38], [0.2, 0.2, 0.2, 0.08, RED, 0, 0.92, -0.38], ...pair([0.16, 0.26, 0.06, 0.03, RED, 0.2, 0.06, -0.38]), [0.16, 0.2, 0.16, 0.05, '#f28b3c', 0, -0.12, -0.38]],
    ladder: [...pair([0.06, 1.2, 0.06, 0.02, '#c9a36a', 0.2, 0.4, -0.28]), [0.4, 0.05, 0.05, 0.02, '#c9a36a', 0, 0.1, -0.28], [0.4, 0.05, 0.05, 0.02, '#c9a36a', 0, 0.4, -0.28], [0.4, 0.05, 0.05, 0.02, '#c9a36a', 0, 0.7, -0.28]],
  },
};

// 같은 크기의 부품은 원본 메시 하나를 공유한다.
const masters = new Map();
let partMat = null;
function master(scene, w, h, d, r) {
  const key = [w, h, d, r].join('_');
  let m = masters.get(key);
  if (!m) {
    m = roundedBox('part_' + key, w, h, d, r, scene);
    if (!partMat) {
      partMat = new B.StandardMaterial('characterMat', scene);
      partMat.specularColor = new B.Color3(0.05, 0.05, 0.05);
      partMat.ambientColor = new B.Color3(1, 1, 1);
    }
    m.material = partMat;
    m.registerInstancedBuffer('color', 4);
    m.instancedBuffers.color = new B.Color4(1, 1, 1, 1);
    m.receiveShadows = true;
    m.isPickable = false;
    m.isVisible = false; // 원본은 그리지 않고 인스턴스만 그린다
    masters.set(key, m);
  }
  return m;
}

export class Character {
  constructor(scene, look = LOOKS.courier) {
    this.scene = scene;
    this.meshes = [];
    const part = (name, w, h, d, r, hex, parent, x, y, z) => {
      const p = master(scene, w, h, d, r).createInstance(name);
      const c = B.Color3.FromHexString(hex);
      p.instancedBuffers.color = new B.Color4(c.r, c.g, c.b, 1);
      p.parent = parent;
      p.position.set(x, y, z);
      p.isPickable = false;
      this.meshes.push(p);
      return p;
    };
    const node = (name, parent, x, y, z) => {
      const n = new B.TransformNode(name, scene);
      n.parent = parent;
      n.position.set(x, y, z);
      return n;
    };

    this.root = new B.TransformNode('character', scene); // 발바닥 위치, 몸의 방향
    this.tilt = node('tilt', this.root, 0, 0, 0); // 기울기와 찌그러짐
    const LEG = 0.42, TORSO = 0.58;
    this.hips = node('hips', this.tilt, 0, LEG, 0);
    this.torso = node('torso', this.hips, 0, 0, 0);
    const torsoMesh = part('torsoMesh', 0.66, TORSO, 0.44, 0.12, look.shirt, this.torso, 0, TORSO / 2, 0);

    this.neck = node('neck', this.torso, 0, TORSO - 0.02, 0);
    this.base = { skin: [], shirt: [], pants: [], shoes: [] };
    this.part = part;
    this.base.skin.push(part('head', 0.94, 0.82, 0.88, 0.2, look.skin, this.neck, 0, 0.41, 0));
    this.eyeL = part('eyeL', 0.13, 0.24, 0.06, 0.03, '#22202b', this.neck, -0.2, 0.36, 0.43);
    this.eyeR = part('eyeR', 0.13, 0.24, 0.06, 0.03, '#22202b', this.neck, 0.2, 0.36, 0.43);
    part('cheekL', 0.14, 0.08, 0.04, 0.02, '#ff9d8a', this.neck, -0.33, 0.2, 0.43);
    part('cheekR', 0.14, 0.08, 0.04, 0.02, '#ff9d8a', this.neck, 0.33, 0.2, 0.43);
    part('mouth', 0.14, 0.08, 0.04, 0.02, '#22202b', this.neck, 0, 0.17, 0.44).scaling.y = 0.6;

    const arm = (side) => {
      const sh = node('shoulder' + side, this.torso, side * 0.42, TORSO - 0.1, 0);
      this.base.shirt.push(part('arm', 0.2, 0.34, 0.22, 0.07, look.shirt, sh, 0, -0.14, 0));
      this.base.skin.push(part('hand', 0.21, 0.2, 0.23, 0.08, look.skin, sh, 0, -0.39, 0));
      return sh;
    };
    this.armL = arm(-1);
    this.armR = arm(1);
    const leg = (side) => {
      const hip = node('hip' + side, this.hips, side * 0.17, 0.04, 0);
      this.base.pants.push(part('leg', 0.25, 0.3, 0.28, 0.07, look.pants, hip, 0, -0.15, 0));
      this.base.shoes.push(part('shoe', 0.27, 0.16, 0.38, 0.06, look.shoes, hip, 0, -0.36, 0.05));
      return hip;
    };
    this.legL = leg(-1);
    this.legR = leg(1);
    this.base.shirt.push(torsoMesh);
    this.extras = [];
    this.setLook(look);

    this.heading = 0;
    this.phase = Math.random() * 6;
    this.sPitch = new Spring(2.6, 0.32);
    this.sRoll = new Spring(2.6, 0.32);
    this.sSquash = new Spring(4.2, 0.3);
    this.sHeadP = new Spring(3.2, 0.3);
    this.sHeadR = new Spring(3.2, 0.3);
    this.sArm = new Spring(3.0, 0.35);
    this.blinkT = 1 + Math.random() * 3;
    this.air = 0;
    this.amp = 0;
    this.idleT = Math.random() * 10;
    this.wave = 0; // 0..1, 손 흔들기
    this.aim = 0; this.swing = 0; // 무기 자세
    this.prevVel = new B.Vector3();
  }

  // 옷차림을 바꾼다: 몸 색을 다시 칠하고, 머리·얼굴·목·등의 치장품을 새로 단다.
  setLook(look) {
    this.look = look;
    for (const k in this.base) { const c = B.Color3.FromHexString(look[k]); for (const m of this.base[k]) m.instancedBuffers.color = new B.Color4(c.r, c.g, c.b, 1); }
    const old = this.extras;
    for (const m of old) { const i = this.meshes.indexOf(m); if (i >= 0) this.meshes.splice(i, 1); m.dispose(); }
    this.extras = [];
    const col = (c) => (c === 'H' ? look.hat : c === 'B' ? look.brim || '#fff7e6' : c);
    const add = (slot, parent) => {
      for (const p of (PARTS[slot][look[slot]] || PARTS[slot][slot === 'head' ? 'hair' : 'none'])) {
        const m = this.part(slot, p[0], p[1], p[2], p[3], col(p[4]), parent, p[5], p[6], p[7]);
        if (p[8]) m.rotation.x = p[8];
        if (p[9]) m.rotation.z = p[9] * Math.sign(p[5] || 1);
        this.extras.push(m);
      }
    };
    add('head', this.neck); add('face', this.neck); add('neck', this.torso); add('back', this.torso);
    if (this.onMeshes) this.onMeshes(old, this.extras);
  }
  setVisible(v) { this.root.setEnabled(v); }
  // 부딪혔을 때 몸을 출렁이게 한다. (fx, fz)는 월드 기준 밀린 방향.
  bump(fx, fz, power = 1) {
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    this.sPitch.v += (fx * sh + fz * ch) * 2.4 * power;
    this.sRoll.v -= (fx * ch - fz * sh) * 2.4 * power;
    this.sSquash.v -= 1.2 * power;
  }

  // state: { pos(발바닥), vel, grounded, wishHeading|null, landed(충격 속도), jumped }
  update(dt, st) {
    const speed = Math.hypot(st.vel.x, st.vel.z);
    // 몸 방향은 가려는 쪽으로 부드럽게 돈다.
    let turn = 0;
    if (st.wishHeading !== null && st.wishHeading !== undefined) {
      let d = (st.wishHeading - this.heading) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      const step = d * (1 - Math.exp(-13 * dt));
      this.heading += step;
      turn = step / Math.max(dt, 1e-4);
    }
    this.root.position.copyFrom(st.pos);
    this.root.rotation.y = this.heading;

    // 가속도를 몸 기준으로 바꿔서 반대쪽으로 기울인다. 스프링이라 멈출 때 앞뒤로 출렁인다.
    const ax = (st.vel.x - this.prevVel.x) / Math.max(dt, 1e-4), az = (st.vel.z - this.prevVel.z) / Math.max(dt, 1e-4);
    this.prevVel.copyFrom(st.vel);
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    const aF = clamp(ax * sh + az * ch, -40, 40), aR = clamp(ax * ch - az * sh, -40, 40);
    const pitch = this.sPitch.step(aF * 0.011 + speed * 0.012, dt);
    const roll = this.sRoll.step(-aR * 0.011 - clamp(turn, -8, 8) * 0.018 * Math.min(speed / 6, 1), dt);

    if (st.jumped) this.sSquash.v += 3.2;
    if (st.landed > 0) this.sSquash.v -= clamp(st.landed * 0.55, 1.2, 6.5);
    const sq = clamp(this.sSquash.step(0, dt), -0.38, 0.4);
    this.tilt.scaling.set(1 - sq * 0.45, 1 + sq, 1 - sq * 0.45);
    this.tilt.rotation.x = pitch + (st.lie || 0);
    this.tilt.rotation.z = roll;

    this.air = damp(this.air, st.grounded ? 0 : 1, 14, dt);
    const moving = st.grounded && speed > 0.4;
    this.phase += dt * (moving ? 6.5 + speed * 0.95 : 0);
    const amp = moving ? clamp(speed / 6.5, 0.25, 1.15) : 0;
    this.amp = damp(this.amp, amp, 12, dt);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    this.idleT += dt;
    const breath = Math.sin(this.idleT * 2.1) * 0.012 * (1 - this.amp);

    // 다리: 걷기 흔들기 / 공중에서는 벌리고 버둥거린다.
    const kick = Math.sin(this.idleT * 13) * 0.35 * this.air;
    this.legL.rotation.x = lerp(s * 0.95 * this.amp, -0.35 + kick, this.air);
    this.legR.rotation.x = lerp(-s * 0.95 * this.amp, 0.3 - kick, this.air);
    this.legL.rotation.z = -0.12 * this.air;
    this.legR.rotation.z = 0.12 * this.air;
    this.hips.position.y = 0.42 + Math.abs(c) * 0.07 * this.amp + breath;
    this.torso.rotation.y = s * 0.16 * this.amp;
    this.torso.rotation.z = c * 0.05 * this.amp;

    // 팔: 다리와 반대로 흔들고, 스프링으로 한 박자 늦게 따라온다. 공중에서는 번쩍 든다.
    const armLag = this.sArm.step(pitch * 1.6, dt);
    const up = this.air * 2.5;
    this.armL.rotation.x = -s * 1.05 * this.amp - armLag - up * 0.25;
    this.armR.rotation.x = s * 1.05 * this.amp - armLag - up * 0.25;
    this.armL.rotation.z = -0.1 - up + Math.sin(this.idleT * 11) * 0.25 * this.air - roll * 1.2;
    const wv = this.wave * (2.6 + Math.sin(this.idleT * 12) * 0.35);
    this.armR.rotation.z = 0.1 + up - Math.sin(this.idleT * 11 + 1) * 0.25 * this.air - roll * 1.2 + wv;

    // 머리는 몸보다 늦게, 더 크게 흔들린다.
    this.neck.rotation.x = this.sHeadP.step(-pitch * 0.9, dt) + breath * 2;
    this.neck.rotation.z = this.sHeadR.step(-roll * 0.9, dt) + s * 0.04 * this.amp;
    this.neck.rotation.y = clamp(turn * 0.03, -0.5, 0.5) + (st.lookYaw || 0);

    // 주먹 쥐어 보이기: 오른 주먹을 얼굴 앞으로 들어 올려 흔든다.
    this.fistK = damp(this.fistK || 0, this.fist || 0, 10, dt);
    if (this.fistK > 0.01) {
      this.armR.rotation.x = lerp(this.armR.rotation.x, -2.3 + Math.sin(this.idleT * 10) * 0.16, this.fistK);
      this.armR.rotation.z = lerp(this.armR.rotation.z, -0.35, this.fistK);
      this.armL.rotation.z = lerp(this.armL.rotation.z, -0.45, this.fistK);
    }
    // 무기: 겨누기(오른팔을 앞으로)와 휘두르기
    this.aimK = damp(this.aimK || 0, this.aim || 0, 16, dt);
    if (this.aimK > 0.01) {
      this.armR.rotation.x = lerp(this.armR.rotation.x, -1.5 - (this.aimPitch || 0) + (this.recoil || 0), this.aimK);
      this.armR.rotation.z = lerp(this.armR.rotation.z, 0, this.aimK);
    }
    this.recoil = damp(this.recoil || 0, 0, 14, dt);
    if (this.swing > 0) {
      const k = 1 - this.swing; // 0 -> 1
      this.armR.rotation.x = k < 0.3 ? lerp(-0.3, -3.0, k / 0.3) : lerp(-3.0, 0.5, (k - 0.3) / 0.7);
      this.armR.rotation.z = 0.15;
      this.torso.rotation.y = lerp(0.5, -0.5, k);
      this.swing = Math.max(0, this.swing - dt / (this.swingTime || 0.3));
    }

    this.blinkT -= dt;
    const blink = this.blinkT < 0.11 ? 0.12 : 1;
    if (this.blinkT < 0) this.blinkT = 1.8 + Math.random() * 3.5;
    this.eyeL.scaling.y = this.eyeR.scaling.y = blink;
  }
}
