// 건물 내부와 내 집 마련.
// 건물 모델은 속이 막혀 있어서, 문 앞에서 E를 누르면 하늘 높이 따로 지어 둔 방으로 옮겨 간다(나올 때는 들어간 문 앞으로).
// 방은 상자로 짓는다: 바닥·벽·천장 + 가구 목록.
import { flatMat, rng } from './util.js';
import { Character, randomLook } from './character.js';
const B = window.BABYLON;

const FACE = { S: 0, W: Math.PI / 2, N: Math.PI, E: (3 * Math.PI) / 2 };
// 가구 한 줄: [색, 가로, 높이, 세로, x, z, 바닥에서 띄운 높이=0, 충돌=1]. 색 앞의 *는 스스로 빛나는 것.
// 방 좌표: 문은 남쪽 벽 가운데, +z가 안쪽.
const ROOMS = {
  pizza: { w: 14, d: 11, floor: '#b8564a', wall: '#fbe9c6', clerk: [-1, 3.6], items: [
    ['#c8442f', 6, 1.1, 1, -1, 2.2], ['#fff7e6', 6.3, 0.12, 1.3, -1, 2.2, 1.1, 0], ['#8a4b3a', 3, 2.7, 1.6, 4.8, 4.5], ['*#ffb03a', 1.7, 0.9, 0.1, 4.8, 3.66, 0.9, 0],
    ['#d8dcec', 1.4, 2.4, 1.2, -5.4, 4.6], ['#2c2c36', 4.2, 1.2, 0.1, -1, 5.42, 2.7, 0], ['#fff3d6', 0.8, 0.12, 0.8, 0.6, 2.2, 1.18, 0], ['#fff3d6', 0.8, 0.12, 0.8, 0.6, 2.2, 1.32, 0],
    ['#b9814f', 1.7, 0.85, 1.7, -4.6, -1], ['#b9814f', 1.7, 0.85, 1.7, -4.6, -3.9], ['#b9814f', 1.7, 0.85, 1.7, 4.6, -1.2], ['#b9814f', 1.7, 0.85, 1.7, 4.6, -3.9],
    ['#e5553f', 0.6, 0.5, 0.6, -3.2, -1], ['#e5553f', 0.6, 0.5, 0.6, -6, -1], ['#e5553f', 0.6, 0.5, 0.6, 3.2, -1.2], ['#e5553f', 0.6, 0.5, 0.6, 6, -3.9], ['#e5553f', 0.6, 0.5, 0.6, -3.2, -3.9],
    ['#ffd35a', 0.9, 0.08, 0.9, -4.6, -1, 0.86, 0], ['#3fa868', 0.5, 1.3, 0.5, 6.3, 0.6]] },
  fire: { w: 16, d: 12, floor: '#b9bfd0', wall: '#f4d6d2', clerk: [5, 3], items: [
    ['#d9473c', 0.35, 5.2, 0.35, -2, 1.5], ['#8f95a8', 2.4, 0.1, 2.4, -2, 1.5, 0, 0], ['#d9473c', 6.4, 2.3, 0.7, -4.2, 5.5], ['#f4f1ea', 0.1, 1.9, 0.72, -5.8, 5.5, 0.2, 0], ['#f4f1ea', 0.1, 1.9, 0.72, -4.2, 5.5, 0.2, 0], ['#f4f1ea', 0.1, 1.9, 0.72, -2.6, 5.5, 0.2, 0],
    ['#b9814f', 4, 0.5, 0.9, -4.2, 3.6], ['#ffd84a', 1.2, 1.2, 0.5, 7.4, -2, 1.2], ['#d9473c', 1.3, 1.3, 0.4, 7.5, 1.5, 1.4], ['#2c2c36', 0.9, 0.9, 0.42, 7.5, 1.5, 1.6, 0],
    ['#b9814f', 3, 1, 1.4, 5, 4.6], ['#2c2c36', 0.9, 0.6, 0.1, 5, 4.6, 1.0, 0], ['#3a3d4d', 0.9, 1.1, 0.9, 5, 2.8], ['#d9473c', 0.8, 0.9, 0.8, -7, -3], ['#d9473c', 0.8, 0.9, 0.8, -7, -1.8], ['#f4f1ea', 5, 2.2, 0.1, 2.5, 5.92, 2, 0]] },
  taxi: { w: 12, d: 10, floor: '#d8dcec', wall: '#fff3c2', clerk: [-3, 3], items: [
    ['#b9814f', 3.4, 1, 1.3, -3, 2], ['#2c2c36', 0.9, 0.6, 0.1, -3, 2, 1.0, 0], ['#2c2c36', 5, 2.4, 0.1, 2, 4.92, 1.6, 0], ['*#ffd84a', 0.3, 0.3, 0.12, 1, 4.86, 2.6, 0], ['*#f2644b', 0.3, 0.3, 0.12, 3, 4.86, 2.2, 0], ['*#57c27a', 0.3, 0.3, 0.12, 2.2, 4.86, 3, 0],
    ['#ffd84a', 3.6, 0.6, 1.2, 4, -2.5], ['#ffd84a', 3.6, 1.2, 0.4, 4, -1.9, 0, 0], ['#3f8fe8', 1.2, 2.2, 1, -5.2, -1], ['*#bfe6ff', 0.9, 0.8, 0.1, -5.2, -1.52, 1.1, 0], ['#3fa868', 0.5, 1.4, 0.5, 5.3, 4.2], ['#2c2c36', 2.2, 0.06, 2.2, 0, -1, 0, 0]] },
  clean: { w: 12, d: 10, floor: '#cfe6c8', wall: '#eaf7ec', clerk: [3.4, 3], items: [
    ['#3fa868', 1.4, 1.8, 1.4, -4.8, 3.8], ['#4f9bea', 1.4, 1.8, 1.4, -3.2, 3.8], ['#f4c542', 1.4, 1.8, 1.4, -1.6, 3.8], ['#2c2c36', 1.5, 0.2, 1.5, -4.8, 3.8, 1.8, 0], ['#2c2c36', 1.5, 0.2, 1.5, -3.2, 3.8, 1.8, 0], ['#2c2c36', 1.5, 0.2, 1.5, -1.6, 3.8, 1.8, 0],
    ['#b9814f', 3, 1, 1.2, 3.4, 2], ['#8f95a8', 4.4, 2.2, 0.6, 3.4, 4.6], ['#3f4654', 0.8, 0.8, 0.7, -5, -2.4], ['#3f4654', 0.8, 0.8, 0.7, -4, -3], ['#3f4654', 0.8, 0.8, 0.7, -5, -3.4, 0.8],
    ['#c79a5b', 0.12, 2, 0.12, 5.6, -1], ['#c79a5b', 0.12, 2, 0.12, 5.6, -1.6], ['#f4c542', 0.5, 0.25, 0.5, 5.6, -1, 0, 0]] },
  fish: { w: 11, d: 9, floor: '#b9d9e6', wall: '#e3f1f7', clerk: [-2.6, 2.6], items: [
    ['#6fb6d9', 4, 1, 1.1, -2.6, 1.4], ['#2f4a5e', 3.2, 1.3, 1.2, 3, 3.8], ['*#4fb3e8', 3, 1.0, 1.0, 3, 3.8, 1.3, 0], ['#ff9d4a', 0.5, 0.25, 0.14, 2.4, 3.8, 1.7, 0], ['#f2644b', 0.4, 0.2, 0.14, 3.6, 3.9, 1.5, 0],
    ['#c79a5b', 0.1, 2.6, 0.1, -4.9, 3.9], ['#c79a5b', 0.1, 2.6, 0.1, -4.4, 3.9], ['#c79a5b', 0.1, 2.6, 0.1, -3.9, 3.9], ['#8b5d3a', 1.6, 0.3, 0.4, -4.4, 3.9, 0, 0],
    ['#f4f1ea', 1.4, 1, 1, 4.4, -1.5], ['#e5553f', 1.45, 0.14, 1.05, 4.4, -1.5, 1, 0], ['#3a3d4d', 0.9, 0.9, 0.9, -4.6, -2.4], ['#ffd84a', 0.6, 0.6, 0.6, -4.6, -2.4, 0.9]] },
  farmer: { w: 10, d: 8, floor: '#d8b98a', wall: '#f6e7b8', clerk: [2.6, 2.4], items: [
    ['#e3c55a', 1.9, 1.4, 2.4, -3.6, 2.4], ['#e3c55a', 1.9, 1.4, 2.4, -3.6, -0.2], ['#e3c55a', 1.9, 1.4, 2.4, -3.6, 1.1, 1.4], ['#8a5a2b', 3, 1, 1.1, 2.6, 1], ['#e58a2e', 0.7, 0.6, 0.7, 4.2, 3.2], ['#e58a2e', 0.7, 0.6, 0.7, 3.4, 3.3], ['#4fae4a', 0.7, 0.5, 0.7, 2.6, 3.3], ['#8b5d3a', 0.1, 2, 0.1, 4.5, -2.6], ['#8f95a8', 0.5, 0.3, 0.1, 4.5, -2.6, 2, 0]] },
  cargo: { w: 10, d: 8, floor: '#aeb3c2', wall: '#c9d2e6', clerk: [-2.6, 2.4], items: [
    ['#b9814f', 1.6, 1.6, 1.6, 3.6, 2.8], ['#b9814f', 1.6, 1.6, 1.6, 3.6, 1.1], ['#c79a5b', 1.6, 1.6, 1.6, 3.6, 2, 1.6], ['#4f6fb0', 2.6, 2.6, 1.4, 1, 3.2], ['#34456f', 3, 1, 1.1, -2.6, 1], ['#c79a5b', 2, 0.2, 2, 3.4, -2], ['#b9814f', 1.2, 1.1, 1.2, 3.4, -2, 0.2], ['#f4c542', 1.2, 1.2, 1.8, -3.8, -2.2]] },
  mail: { w: 10, d: 8, floor: '#e6d9b8', wall: '#fbe3df', clerk: [0, 2.4], items: [
    ['#b8322a', 5, 1.1, 1, 0, 1.2], ['#fff7e6', 5.2, 0.1, 1.2, 0, 1.2, 1.1, 0], ['#8b5d3a', 8, 2.6, 0.6, 0, 3.6], ['#fff7e6', 1.2, 0.4, 0.62, -2.6, 3.58, 0.6, 0], ['#fff7e6', 1.2, 0.4, 0.62, 0.2, 3.58, 1.3, 0], ['#fff7e6', 1.2, 0.4, 0.62, 2.4, 3.58, 2, 0], ['#c79a5b', 0.9, 0.7, 0.9, -3.8, -2.2], ['#c79a5b', 0.9, 0.7, 0.9, -3, -2.6], ['#e5553f', 0.7, 1.2, 0.7, 4, -2.4]] },
  ferry: { w: 10, d: 8, floor: '#b9d9e6', wall: '#cfeaf7', clerk: [-2.4, 2.4], items: [
    ['#1f6f95', 3.2, 1.1, 1, -2.4, 1.1], ['#f4f1ea', 1.5, 1.5, 0.3, 3.6, 3.7, 1.4], ['#e5553f', 0.9, 0.9, 0.34, 3.6, 3.7, 1.7, 0], ['#8b5d3a', 4, 0.5, 1, 3, -2.4], ['#c79a5b', 1.1, 0.6, 1.1, -3.8, -2.4], ['#c79a5b', 1.1, 0.6, 1.1, -3.8, -2.4, 0.6], ['#2c2c36', 4, 1.8, 0.1, -1.6, 3.92, 1.6, 0], ['*#4fb3e8', 1, 0.5, 0.12, -2.4, 3.86, 2.2, 0]] },
  race: { w: 10, d: 8, floor: '#3a3d4d', wall: '#2c2c36', clerk: [2.6, 2.4], items: [
    ['#f2644b', 3, 1, 1.1, 2.6, 1], ['#8b5d3a', 4, 0.2, 0.7, -2.6, 3.6, 1.6, 0], ['*#ffd84a', 0.5, 0.9, 0.5, -3.6, 3.6, 1.8, 0], ['*#ffd84a', 0.5, 0.6, 0.5, -2.6, 3.6, 1.8, 0], ['#d8dcec', 0.5, 0.5, 0.5, -1.6, 3.6, 1.8, 0],
    ['#22202b', 1.3, 0.5, 1.3, -3.8, -2.2], ['#22202b', 1.3, 0.5, 1.3, -3.8, -2.2, 0.5], ['#22202b', 1.3, 0.5, 1.3, -3.8, -2.2, 1.0], ['#f4f1ea', 1.2, 0.04, 1.2, 0, -1, 0, 0], ['#f4f1ea', 1.2, 0.04, 1.2, 1.2, 0.2, 0, 0], ['#f4f1ea', 1.2, 0.04, 1.2, -1.2, 0.2, 0, 0]] },
  guard: { w: 10, d: 8, floor: '#f0e2b6', wall: '#fff7e6', clerk: [-2.6, 2.4], items: [
    ['#d9473c', 3, 1, 1.1, -2.6, 1], ['#f4f1ea', 1.4, 1.4, 0.3, 3.4, 3.7, 1.4], ['#d9473c', 0.8, 0.8, 0.34, 3.4, 3.7, 1.7, 0], ['#ffd84a', 0.6, 2.6, 0.2, 4.4, -1.6], ['#3f9fd0', 0.6, 2.6, 0.2, 4.4, -2.4], ['#f4f1ea', 1.2, 1.2, 0.5, -4.4, -2.2, 1.2], ['#d9473c', 0.7, 0.2, 0.52, -4.4, -2.2, 1.7, 0], ['#d9473c', 0.2, 0.7, 0.52, -4.4, -2.2, 1.45, 0], ['#b9814f', 3.4, 0.5, 0.9, 1, 3.4]] },
  treasure: { w: 10, d: 8, floor: '#b9814f', wall: '#e9d2a0', clerk: [2.6, 2.4], items: [
    ['#8a5a2b', 3.4, 1, 1.6, -1.6, 0.6], ['#f6e7b8', 2.4, 0.06, 1.2, -1.6, 0.6, 1, 0], ['#d9473c', 0.5, 0.08, 0.14, -1.2, 0.8, 1.05, 0], ['#8a5a2b', 1.4, 1, 1, 3.6, 3.2], ['#c99a3a', 1.5, 0.3, 1.1, 3.6, 3.2, 1, 0],
    ['*#ffd84a', 1.2, 0.5, 1.2, -3.6, 3.2], ['*#ffd84a', 0.7, 0.4, 0.7, -3.6, 3.2, 0.5, 0], ['#5a3d24', 3, 1, 1, 2.6, 1], ['#8b5d3a', 0.14, 1.6, 0.14, 4.4, -2.4], ['#8f95a8', 0.5, 0.5, 0.1, 4.4, -2.4, 1.6, 0]] },
  ranger: { w: 10, d: 8, floor: '#b9814f', wall: '#cfe6c8', clerk: [-2.6, 2.4], items: [
    ['#2f6b3a', 3, 1, 1.1, -2.6, 1], ['#8b5d3a', 2.2, 0.6, 4, 3.8, 1.6], ['#f4f1ea', 2, 0.3, 3.6, 3.8, 1.6, 0.6, 0], ['#d9473c', 2, 0.32, 1.2, 3.8, 0.4, 0.62, 0], ['#3a3d4d', 1.1, 1.3, 1.1, -4.2, 3.2], ['*#ffb03a', 0.6, 0.4, 0.1, -4.2, 2.62, 0.4, 0], ['#3a3d4d', 0.4, 3, 0.4, -4.2, 3.2, 1.3], ['#f6e7b8', 3, 1.8, 0.1, 0, 3.92, 1.6, 0]] },
  store: { name: '편의점', w: 14, d: 10, floor: '#eef1f7', wall: '#dff3e6', clerk: [-4.6, -2.2, 0], items: [
    ['#3fa868', 3, 1.1, 1.2, -4.6, -1], ['#8f95a8', 1.2, 2, 5, -1, 1.6], ['#8f95a8', 1.2, 2, 5, 2.4, 1.6], ['#e5553f', 1.24, 0.4, 4.6, -1, 1.6, 0.5, 0], ['#ffd84a', 1.24, 0.4, 4.6, -1, 1.6, 1.2, 0], ['#4f9bea', 1.24, 0.4, 4.6, 2.4, 1.6, 0.5, 0], ['#f08fb0', 1.24, 0.4, 4.6, 2.4, 1.6, 1.2, 0],
    ['#d8dcec', 5.4, 2.4, 1, 3.8, 4.4], ['*#bfe6ff', 5, 1.8, 0.1, 3.8, 3.88, 0.4, 0], ['#3f8fe8', 1.2, 2.2, 1, -6, 4.2], ['#e5553f', 1.2, 2.2, 1, -4.6, 4.2]] },
  cafe: { name: '카페', w: 13, d: 10, floor: '#6f8f86', wall: '#f3e3cf', clerk: [3.6, 3.2], items: [
    ['#5a3d24', 5, 1.1, 1, 3.6, 2], ['#f4f1ea', 5.2, 0.1, 1.2, 3.6, 2, 1.1, 0], ['#3a3d4d', 0.8, 0.9, 0.7, 5, 2, 1.2, 0], ['#8b5d3a', 5, 2.4, 0.5, 3.6, 4.6], ['#f4f1ea', 0.4, 0.4, 0.4, 2.4, 4.5, 1.4, 0], ['#e5553f', 0.4, 0.4, 0.4, 3.6, 4.5, 1.4, 0], ['#3fa868', 0.4, 0.4, 0.4, 4.8, 4.5, 1.4, 0],
    ['#8b5d3a', 1.3, 0.85, 1.3, -4, 2.6], ['#8b5d3a', 1.3, 0.85, 1.3, -4, -0.4], ['#8b5d3a', 1.3, 0.85, 1.3, -4, -3.2], ['#f4c542', 0.6, 0.5, 0.6, -5.3, 2.6], ['#f4c542', 0.6, 0.5, 0.6, -2.7, -0.4], ['#f4c542', 0.6, 0.5, 0.6, -5.3, -3.2], ['#3fa868', 0.6, 1.5, 0.6, 5.6, -3.6], ['#e5553f', 3, 0.04, 2, 2, -2, 0, 0]] },
  hotel: { name: '호텔', w: 16, d: 12, floor: '#e6d9b8', wall: '#f7f0e0', clerk: [0, 4.2], items: [
    ['#8b5d3a', 7, 1.2, 1.2, 0, 2.8], ['#f4f1ea', 7.2, 0.1, 1.4, 0, 2.8, 1.2, 0], ['*#ffd84a', 0.4, 0.3, 0.4, 2.6, 2.8, 1.3, 0], ['#b8322a', 3.4, 0.04, 9, 0, -1.6, 0, 0], ['#4f6fb0', 3.4, 0.7, 1.3, -5.6, -1], ['#4f6fb0', 3.4, 1.3, 0.4, -5.6, -0.4, 0, 0], ['#4f6fb0', 3.4, 0.7, 1.3, 5.6, -1], ['#4f6fb0', 3.4, 1.3, 0.4, 5.6, -0.4, 0, 0],
    ['#8b5d3a', 1.4, 0.6, 1.4, -5.6, -3], ['#8b5d3a', 1.4, 0.6, 1.4, 5.6, -3], ['#3fa868', 0.7, 1.8, 0.7, -7.2, 5], ['#3fa868', 0.7, 1.8, 0.7, 7.2, 5], ['#d8dcec', 2, 2.8, 0.3, -5, 5.8], ['#d8dcec', 2, 2.8, 0.3, 5, 5.8], ['*#ffe9a8', 1.2, 0.3, 1.2, 0, 0, 4.7, 0]] },
  arms: { name: '무기 상점', w: 13, d: 10, floor: '#3a3d4d', wall: '#55693f', clerk: [0, 3.4], items: [
    ['#2c2c36', 8, 1.1, 1, 0, 2.2], ['#8f95a8', 8.2, 0.1, 1.2, 0, 2.2, 1.1, 0], ['#8b5d3a', 10, 2.6, 0.5, 0, 4.7],
    ['#c79a5b', 0.16, 1.0, 0.16, -4.6, -1, 0.9, 0], ['#8b5d3a', 1.2, 0.9, 1.2, -4.6, -1], ['#2a2c36', 0.5, 0.2, 0.16, -1.6, -1, 0.9, 0], ['#8b5d3a', 1.2, 0.9, 1.2, -1.6, -1],
    ['#2a2c36', 0.9, 0.22, 0.18, 1.6, -1, 0.9, 0], ['#8b5d3a', 1.2, 0.9, 1.2, 1.6, -1], ['#55693f', 1.3, 0.3, 0.3, 4.6, -1, 0.9, 0], ['#d9473c', 0.3, 0.22, 0.22, 5.3, -1, 0.94, 0], ['#8b5d3a', 1.2, 0.9, 1.2, 4.6, -1],
    ['#2a2c36', 0.5, 0.2, 0.1, -3, 4.4, 1.6, 0], ['#2a2c36', 0.9, 0.2, 0.1, 0, 4.4, 1.9, 0], ['#55693f', 1.3, 0.3, 0.1, 3, 4.4, 1.5, 0]],
    buy: [['bat', 900, -4.6], ['pistol', 2800, -1.6], ['smg', 6500, 1.6], ['rocket', 15000, 4.6], ['rifle', 9500, 0, 4.2]] },
  hospital: { name: '병원', w: 16, d: 12, floor: '#e8f1f4', wall: '#f7fbfc', clerk: [-4.5, -2.4, 0], items: [
    ['#f4f1ea', 4, 1.1, 1.1, -4.5, -1.2], ['#d9473c', 0.9, 0.3, 0.06, -4.5, -1.78, 0.5, 0], ['#d9473c', 0.3, 0.9, 0.06, -4.5, -1.78, 0.2, 0],
    ['#8f95a8', 2.2, 0.5, 3.6, -6.2, 3.6], ['#f4f1ea', 2, 0.3, 3.4, -6.2, 3.6, 0.5, 0], ['#6fb6d9', 2.04, 0.32, 2, -6.2, 3.1, 0.52, 0],
    ['#8f95a8', 2.2, 0.5, 3.6, -2.6, 3.6], ['#f4f1ea', 2, 0.3, 3.4, -2.6, 3.6, 0.5, 0], ['#6fb6d9', 2.04, 0.32, 2, -2.6, 3.1, 0.52, 0], ['#bfe6c4', 0.1, 2.4, 3.8, -4.4, 3.6],
    ['#f4f1ea', 5.4, 2.4, 0.7, 4.6, 5.5], ['*#e5553f', 1.1, 0.9, 0.9, 2.8, 4.4, 0.9], ['*#4f9bea', 1.1, 0.9, 0.9, 4.6, 4.4, 0.9], ['*#57c27a', 1.1, 0.9, 0.9, 6.4, 4.4, 0.9],
    ['#b9bfd0', 1.2, 0.9, 1, 2.8, 4.4], ['#b9bfd0', 1.2, 0.9, 1, 4.6, 4.4], ['#b9bfd0', 1.2, 0.9, 1, 6.4, 4.4],
    ['*#57c27a', 1.8, 0.05, 1.8, 5.6, -2.6, 0, 0], ['#f4f1ea', 0.5, 1.8, 0.5, 7, -3.4], ['*#57c27a', 0.3, 0.3, 0.3, 7, -3.4, 1.8, 0], ['#4f6fb0', 3.2, 0.6, 1, 1, -4.6], ['#3fa868', 0.6, 1.5, 0.6, 7.2, 1]] },
  jail: { name: '경찰서', w: 16, d: 11, floor: '#9aa1b3', wall: '#c9cede', clerk: [-5, -2.6, 0], items: [
    ['#34456f', 4, 1.1, 1.1, -5, -1.4], ['*#ffd84a', 0.5, 0.3, 0.06, -5, -1.98, 0.5, 0],
    ...[-1, 0, 1, 2, 3, 4, 5, 6, 7].map((i) => ['#3a3d4d', 0.14, 4.4, 0.14, 0.5 + i * 0.85, 1.2, 0, 0]), ['#3a3d4d', 7.4, 0.16, 0.16, 3.6, 1.2, 4.3, 0], ['#3a3d4d', 7.4, 0.16, 0.16, 3.6, 1.2, 0.2, 0],
    ['#8f95a8', 3, 0.5, 1, 5.6, 4.6], ['#f4f1ea', 2.8, 0.2, 0.9, 5.6, 4.6, 0.5, 0], ['#8f95a8', 0.7, 0.6, 0.7, 1.2, 4.6],
    ['#6b7a99', 1.4, 0.9, 1.2, 4.5, -3], ['#6b7a99', 1, 0.7, 1, 5.7, -3.2], ['#3a3d4d', 0.12, 1.3, 0.12, 3.4, -2.6], ['#8f95a8', 0.5, 0.2, 0.2, 3.4, -2.6, 1.3, 0],
    ['*#ffd84a', 1.6, 0.05, 1.6, -1.6, -3.2, 0, 0], ['*#f28b3c', 1.6, 0.05, 1.6, 4.6, -1.6, 0, 0], ['#5a4636', 0.12, 2.6, 1.5, 7.9, 3], ['*#d9473c', 1.6, 0.05, 1.6, 6.8, 3, 0, 0]] },
  home: { w: 13, d: 10, items: [] }, // 집 내부는 buildHome이 집마다 따로 만든다
};
// 가게마다 놓는 가구 모델과, 그 자리에 있던 상자 가구를 빼는 규칙
const set4 = (x, z, t = 'table') => [[t, x, z], ['chair', x, z - 1.25, 180, 0, 0], ['chair', x, z + 1.25, 0, 0, 0]];
const DRESS = {
  pizza: [...set4(-4.6, -1), ...set4(-4.6, -3.9), ...set4(4.6, -1.2), ...set4(4.6, -3.9), ['plantSmall1', -4.6, -1, 0, 0.98, 0], ['plantSmall1', 4.6, -3.9, 0, 0.98, 0]],
  cafe: [...set4(-4, 2.6, 'tableRound'), ...set4(-4, -0.9, 'tableRound'), ['loungeSofa', -4.6, -4.2, 180], ['tableCoffee', -4.6, -2.9, 0], ['loungeChair', 3.2, -3.9, 180], ['kitchenCoffeeMachine', 2.2, 2, 0, 1.2, 0], ['bookcaseOpen', -6, 4.4, 0]],
  hotel: [['loungeSofa', -5.6, -0.4, 0], ['tableCoffee', -5.6, -2.2, 0], ['loungeChair', -7.2, -2.2, -90], ['loungeSofa', 5.6, -0.4, 0], ['tableCoffee', 5.6, -2.2, 0], ['loungeChair', 7.2, -2.2, 90], ['lampRoundFloor', -7.3, -0.3, 0], ['lampRoundFloor', 7.3, -0.3, 0], ['pottedPlant', -7.2, 5, 0], ['pottedPlant', 7.2, 5, 0], ['rugRectangle', -5.6, -1.8, 0, 0, 0], ['rugRectangle', 5.6, -1.8, 0, 0, 0], ['bench', -3, -5.2, 180], ['bench', 3, -5.2, 180]],
  hospital: [['bedSingle', -6.2, 3.9, 0], ['bedSingle', -2.6, 3.9, 0], ['cabinetBedDrawerTable', -7.5, 5.4, 0], ['cabinetBedDrawerTable', -1.3, 5.4, 0], ['chairDesk', -4.5, -2.4, 0, 0, 0], ['computerScreen', -5.4, -1.2, 180, 1.1, 0], ['benchCushion', 0.2, -4.9, 180], ['benchCushion', 1.8, -4.9, 180], ['bathroomSink', 7.4, 1, 90]],
  jail: [['bedSingle', 6.6, 3.9, 0], ['toilet', 1.2, 4.6, 0], ['desk', -5, 1.2, 180], ['chairDesk', -5, 2.4, 180, 0, 0], ['computerScreen', -5, 1.2, 0, 1.16, 0], ['bench', -7.3, -3, -90], ['bookcaseClosedWide', -2, 5, 0]],
  store: [['kitchenFridge', 6.2, -1, 90], ['kitchenFridge', 6.2, 0.4, 90], ['stoolBar', -4.6, 0.4, 180, 0, 0]],
  taxi: [['chairDesk', -3, 3.2, 0, 0, 0], ['computerScreen', -3.6, 2, 180, 1.0, 0], ['benchCushion', 2, -3.9, 180], ['benchCushion', 3.6, -3.9, 180], ['bookcaseClosedWide', -4.6, 4.5, 0], ['tableCoffee', 3, -2.4, 0]],
  fire: [['chairDesk', 5, 3.2, 180, 0, 0], ['computerScreen', 5, 4.6, 0, 1.0, 0], ['bench', -4.9, 2.9, 180], ['bench', -3.5, 2.9, 180], ['bedSingle', 6.8, -3.4, 90], ['bedSingle', 3.6, -3.4, 90]],
  clean: [['washer', 5.3, 2.2, 90], ['washer', 5.3, 3.4, 90], ['chairDesk', 3.4, 3.2, 0, 0, 0], ['bench', 0, -3.9, 180]],
  fish: [['bench', 0.6, -3.6, 180], ['sideTable', -4.4, -0.4, -90], ['radio', -4.4, -0.4, -90, 1.16, 0]],
  arms: [['chairDesk', 0, 3.6, 0, 0, 0], ['bench', -5.6, 2.4, -90], ['bench', 5.6, 2.4, 90]],
  farmer: [['chairDesk', 2.6, 2.4, 0, 0, 0], ['bench', 0, -3, 180]], cargo: [['chairDesk', -2.6, 2.4, 0, 0, 0], ['computerScreen', -2.6, 1, 180, 1.0, 0]],
  mail: [['bench', 3, -3.2, 180], ['sideTable', -3.6, -0.6, -90]], ferry: [['benchCushion', 0, -3.2, 180], ['radio', -2.4, 1.1, 180, 1.1, 0]],
  race: [['loungeSofa', 0, -3.2, 180], ['televisionModern', 2.6, 3.7, 0, 1.6, 0]], guard: [['chairDesk', -2.6, 2.4, 0, 0, 0], ['bedSingle', 1, 3.1, 90]],
  treasure: [['chair', -1.6, -0.9, 180, 0, 0], ['bookcaseOpen', 0.6, 3.6, 0]], ranger: [['chairDesk', -2.6, 2.4, 0, 0, 0], ['radio', -2.6, 1, 180, 1.0, 0], ['bear', 3.8, 1.6, 0, 0.92, 0]],
};
const DROP = {
  pizza: (c, w) => (c === '#b9814f' && w === 1.7) || (c === '#e5553f' && w === 0.6) || c === '#ffd35a' || (c === '#3fa868' && w === 0.5),
  cafe: (c, w) => (c === '#8b5d3a' && w === 1.3) || (c === '#f4c542' && w === 0.6) || (c === '#3fa868' && w === 0.6),
  hotel: (c, w) => c === '#4f6fb0' || (c === '#8b5d3a' && w === 1.4) || (c === '#3fa868' && w === 0.7),
  hospital: (c, w) => (c === '#8f95a8' && w === 2.2) || (c === '#f4f1ea' && w === 2) || c === '#6fb6d9' || (c === '#3fa868' && w === 0.6) || (c === '#4f6fb0' && w === 3.2),
  jail: (c, w) => (c === '#8f95a8' && (w === 3 || w === 0.7)) || (c === '#f4f1ea' && w === 2.8),
  taxi: (c, w) => c === '#ffd84a' && w === 3.6, fire: (c, w) => c === '#b9814f' && w === 4,
};
const PRICE = { midtown: 6000, north: 3800, east: 3400, west: 3000, town: 5200, lake: 3400, gull: 4200, farm: 2800, mill: 3000, twin: 3600, woods: 2600, wind: 2400 };
const AREA_NAME = { midtown: '중심가', north: '북쪽 주택가', east: '동쪽 시가지', west: '서쪽 마을', town: '항구 마을', lake: '호수 마을', gull: '갈매기섬', farm: '서쪽 농장', mill: '풍차섬', twin: '쌍둥이섬', woods: '고요숲 섬', wind: '풍차 언덕' };
const $ = (id) => document.getElementById(id);
const won = (n) => n.toLocaleString('ko-KR');

// ---------- 집 내부 생성기: 집마다 크기·색·배치·가구가 다르다 ----------
const THEMES = [
  { wall: '#f3ead6', floor: '#c99a66', line: '#b58450', wood: '#8b5d3a', a: '#4f6fb0', b: '#e5553f', kit: '#f4f1ea' },
  { wall: '#e6efe6', floor: '#b9814f', line: '#a26f41', wood: '#6b4a30', a: '#3fa868', b: '#f4c542', kit: '#dfe7df' },
  { wall: '#f7e3df', floor: '#d8b98a', line: '#c4a373', wood: '#a0703f', a: '#e58a8a', b: '#6fb6d9', kit: '#fff7f0' },
  { wall: '#e3e8f3', floor: '#9c7a5a', line: '#876749', wood: '#5a3d24', a: '#34456f', b: '#ffd84a', kit: '#d8dcec' },
  { wall: '#f6efc9', floor: '#c79a5b', line: '#b0864a', wood: '#8a5a2b', a: '#f28b3c', b: '#3fc1c9', kit: '#fff7e6' },
  { wall: '#ece3f3', floor: '#b08a6a', line: '#987556', wood: '#70503a', a: '#b072e0', b: '#57c27a', kit: '#f2edf7' },
  { wall: '#dfeef2', floor: '#d2c3a6', line: '#bcae92', wood: '#9a8466', a: '#3f9fd0', b: '#f08fb0', kit: '#f4f9fb' },
  { wall: '#efe6dc', floor: '#7d5a40', line: '#6a4a33', wood: '#4a3323', a: '#b8322a', b: '#e9d2a0', kit: '#e8ded2' },
];
const BOOKS = ['#e5553f', '#3fa868', '#4f9bea', '#f4c542', '#b072e0', '#f28b3c', '#3fc1c9', '#f4f1ea'];

function buildHome(h, M, id, cx, cz, y0, seed, big) {
  const r = rng(seed), T = THEMES[seed % THEMES.length];
  const w = (big ? 15 : 12.5) + Math.floor(r() * 3) * 0.5, d = (big ? 11.5 : 10) + Math.floor(r() * 3) * 0.5, HH = 4.6;
  const sx = r() < 0.5 ? 1 : -1; // 좌우를 뒤집은 집도 있다
  const acc = r() < 0.5 ? [T.a, T.b] : [T.b, T.a];
  h.bucket('in_' + id, cx, cz);
  const col = h.lazyCollider();
  let k = 0;
  // 가구 조각 하나: (색, 가로, 높이, 세로, x, z, 바닥에서 띄운 높이, 충돌 여부). x는 집의 좌우 뒤집기를 따른다.
  const P = (c, bw, bh, bd, x, z, lift = 0, solid = 0) => {
    if (solid) col.add(cx + sx * x, y0 + lift + bh / 2, cz + z, bw, bh, bd);
    return h.box(`in_${id}_${k++}`, bw, bh, bd, cx + sx * x, y0 + lift + bh / 2, cz + z, M(c), { noShadow: true });
  };
  const W2 = w / 2, D2 = d / 2;
  // 뼈대: 바닥(널빤지 줄무늬), 벽, 걸레받이, 천장, 문
  P(T.floor, w + 0.8, 0.4, d + 0.8, 0, 0, -0.4, 1);
  for (let z = -D2 + 1.1; z < D2; z += 1.1) P(T.line, w, 0.02, 0.05, 0, z, 0);
  P('#f4f1ea', w + 0.8, 0.4, d + 0.8, 0, 0, HH, 1);
  P(T.wall, w + 0.8, HH, 0.4, 0, D2 + 0.2, 0, 1); P(T.wall, w + 0.8, HH, 0.4, 0, -D2 - 0.2, 0, 1);
  P(T.wall, 0.4, HH, d, W2 + 0.2, 0, 0, 1); P(T.wall, 0.4, HH, d, -W2 - 0.2, 0, 0, 1);
  P('#f4f1ea', w, 0.22, 0.06, 0, D2 - 0.03, 0); P('#f4f1ea', 0.06, 0.22, d, W2 - 0.03, 0, 0); P('#f4f1ea', 0.06, 0.22, d, -W2 + 0.03, 0, 0);
  P(T.wood, 1.9, 2.9, 0.1, 0, -D2 + 0.05, 0); P('#5a4636', 1.5, 2.6, 0.12, 0, -D2 + 0.07, 0); P('*#ffd84a', 0.12, 0.12, 0.08, 0.5 * sx, -D2 + 0.16, 1.2);
  P('*#3fc1c9', 2.2, 0.05, 1.3, 0, -D2 + 0.95, 0);
  P(acc[0], 1.6, 0.03, 0.9, 0, -D2 + 2.2, 0); // 현관 깔개
  // 창문: 틀, 밝은 유리, 양쪽 커튼
  const win = (x, z, alongZ) => {
    const a = alongZ ? [0.12, 2.2] : [2.2, 0.12], g = alongZ ? [0.1, 1.9] : [1.9, 0.1], c = alongZ ? [0.14, 0.5] : [0.5, 0.14];
    P('#f4f1ea', a[0], 1.9, a[1], x, z, 1.3); P('*#cfeaff', g[0], 1.6, g[1], x, z, 1.45); P('#f4f1ea', alongZ ? 0.13 : 0.06, 1.6, alongZ ? 0.06 : 0.13, x, z, 1.45);
    for (const o of [-1.3, 1.3]) P(acc[1], c[0], 2.2, c[1], x + (alongZ ? 0 : o), z + (alongZ ? o : 0), 1.15);
  };
  win(-W2 + 0.06, -D2 + 2.8, true); win(W2 - 0.06, D2 - 3, true); win(-W2 * 0.45, D2 - 0.06, false);
  // 액자
  const pic = (x, z, alongZ, col) => { P(T.wood, alongZ ? 0.08 : 1.3, 1, alongZ ? 1.3 : 0.08, x, z, 2.1); P(col, alongZ ? 0.1 : 1.05, 0.76, alongZ ? 1.05 : 0.1, x, z, 2.22); };
  // 천장등
  for (const [x, z] of [[-W2 * 0.5, -D2 * 0.3], [W2 * 0.5, D2 * 0.3], [-W2 * 0.5, D2 * 0.55]]) { P('#f4f1ea', 0.1, 0.5, 0.1, x, z, HH - 0.5); P('*#fff2c2', 0.9, 0.3, 0.9, x, z, HH - 0.8); }
  const plant = (x, z, tall) => { P('#c9703f', 0.55, 0.5, 0.55, x, z, 0, 1); P('#3fa868', 0.7, tall ? 1.1 : 0.6, 0.7, x, z, 0.5); P('#57c27a', 0.45, 0.5, 0.45, x, z, tall ? 1.5 : 1.0); };

  // 가구 모델 하나를 놓는다. rot(도): 0이면 정면이 남쪽(-z), -90이면 동쪽(+x). solid면 부딪힌다.
  const assets = h.assets, DEG = Math.PI / 180;
  const F = (name, x, z, rot = 0, lift = 0, solid = 1, scale = 1) => {
    const key = 'furniture/' + name, yaw = (sx > 0 ? rot : -rot) * DEG;
    assets.place(key, cx + sx * x, y0 + lift, cz + z, yaw, scale, 'in_' + id);
    if (solid) { const bb = assets.bounds(key), q = Math.abs(rot) === 90, bw = (bb.max.x - bb.min.x) * scale, bd = (bb.max.z - bb.min.z) * scale, bh = (bb.max.y - bb.min.y) * scale; col.add(cx + sx * x, y0 + lift + bh / 2, cz + z, q ? bd : bw, bh, q ? bw : bd); }
  };
  // ----- 거실(서쪽 앞): 소파, 깔개, 탁자, TV -----
  const sofaX = -W2 + 0.75, lz = -D2 + 3.2, tvX = -1.5;
  P(acc[0], 3.4, 0.03, 4.8, sofaX + 2.2, lz, 0); P(T.wall, 3, 0.035, 4.4, sofaX + 2.2, lz, 0); // 깔개
  F('loungeSofa', sofaX, lz, -90);
  F('tableCoffee', sofaX + 2.2, lz, 90);
  F(r() < 0.5 ? 'books' : 'plantSmall1', sofaX + 2.2, lz + 0.4, 30, 0.69, 0);
  if (r() < 0.7) F('loungeChair', sofaX + 1.6, lz + 2.9 > D2 - 4.2 ? lz - 2.6 : lz + 2.9, lz + 2.9 > D2 - 4.2 ? 180 : 0);
  // TV는 현관과 거실을 나누는 낮은 벽 앞에 둔다.
  P(T.wall, 0.24, 2.9, 4.6, tvX, lz, 0, 1); P(T.wood, 0.34, 0.1, 4.7, tvX, lz, 2.9);
  F('cabinetTelevision', tvX - 0.52, lz, 90);
  F(seed % 4 === 1 ? 'televisionVintage' : 'televisionModern', tvX - 0.52, lz, 90, 0.93, 0);
  F('speaker', tvX - 0.45, lz - 1.75, 90); F('pottedPlant', tvX - 0.5, lz + 1.9, 0);
  F('lampRoundFloor', sofaX + 0.1, lz - 2.1 < -D2 + 0.6 ? lz + 2.2 : lz - 2.1, 0);
  pic(-W2 + 0.05, D2 - 5.2, true, acc[1]);

  // ----- 부엌(북쪽 벽 서쪽) -----
  const px = 1.6; // 침실 칸막이벽의 x
  const kz = D2 - 0.7, U = 1.29; // 장 하나의 너비
  let kx = -W2 + 0.7;
  F('kitchenFridge', kx, D2 - 0.46, 0); kx += U;
  const line = ['kitchenCabinet', 'kitchenSink', 'kitchenStove', 'kitchenCabinet'];
  const fit = Math.max(2, Math.min(4, Math.floor((px - 0.5 - kx) / U) + 1)); // 칸막이벽 앞까지 들어가는 만큼
  for (let i = 0; i < fit; i++) { F(line[i], kx, kz, 0); if (line[i] !== 'kitchenStove') F('kitchenCabinetUpper', kx, D2 - 0.36, 0, 2.15, 0); else P('#d8dcec', 1.2, 0.5, 0.7, kx, D2 - 0.36, 2.3); kx += U; }
  F(r() < 0.5 ? 'kitchenCoffeeMachine' : 'kitchenMicrowave', -W2 + 0.7 + U, kz + 0.1, 0, 1.36, 0);
  // ----- 식탁 -----
  const tz = D2 - 3.9, tx = -W2 * 0.52, round = r() < 0.4, four = big || r() < 0.5, ch = r() < 0.5 ? 'chair' : 'chairCushion';
  F(round ? 'tableRound' : 'table', tx, tz, 0);
  F(ch, tx, tz - 1.25, 180, 0, 0); F(ch, tx, tz + 1.25, 0, 0, 0);
  if (four) { F(ch, tx - (round ? 1.55 : 1.75), tz, -90, 0, 0); F(ch, tx + (round ? 1.55 : 1.75), tz, 90, 0, 0); }
  F('plantSmall1', tx, tz, 0, round ? 1.1 : 0.98, 0, 1.6);

  // ----- 침실(동쪽 안쪽): 칸막이벽, 침대, 협탁, 옷장 -----
  P(T.wall, 0.24, HH, d * 0.5, px, D2 - d * 0.25, 0, 1);
  const bunk = !big && r() < 0.3, bedX = W2 - (bunk ? 1.0 : 1.55), bedZ = D2 - 1.75;
  F(bunk ? 'bedBunk' : big ? 'bedDouble' : r() < 0.5 ? 'bedDouble' : 'bedSingle', bedX, bedZ, 0);
  F('cabinetBedDrawerTable', bedX - (bunk ? 1.4 : 2.0), D2 - 0.4, 0); F('lampRoundTable', bedX - (bunk ? 1.4 : 2.0), D2 - 0.4, 0, 0.8, 0);
  P(acc[1], 2.8, 0.03, 1.7, bedX - 1.2, bedZ - 2.3, 0);
  F('bookcaseClosedWide', px + 1.4, D2 - 0.4, 0); // 옷장
  if (r() < 0.6) F('bear', bedX, bedZ - 0.4, 20, 1.13, 0, 0.8);
  pic(W2 - 0.05, -D2 + 4.4, true, acc[0]);

  // ----- 동쪽 앞: 집마다 다른 공간 -----
  const hx = W2 - 0.7, hz = -D2 + 2.6, hobby = seed % 5;
  if (hobby === 0) { // 컴퓨터 책상
    F('desk', hx, hz, 90); F('computerScreen', hx + 0.15, hz, 90, 1.16, 0); F('computerKeyboard', hx - 0.3, hz, 90, 1.16, 0); F('chairDesk', hx - 1.3, hz, -90, 0, 0);
  } else if (hobby === 1) { // 책 읽는 자리
    F('bookcaseOpen', hx + 0.3, hz - 0.7, 90); F('bookcaseOpen', hx + 0.3, hz + 0.6, 90); F('loungeChair', hx - 1.6, hz, 60); F('lampRoundFloor', hx - 0.1, hz + 1.6, 0);
    F('books', hx + 0.3, hz - 0.7, 90, 1.0, 0); F('books', hx + 0.3, hz + 0.6, 60, 1.52, 0);
  } else if (hobby === 2) { // 음악 듣는 자리
    F('sideTable', hx + 0.25, hz, 90); F('radio', hx + 0.25, hz, 90, 1.16, 0); F('speaker', hx + 0.2, hz - 1.3, 90); F('speaker', hx + 0.2, hz + 1.3, 90); F('benchCushion', hx - 1.7, hz, -90);
  } else if (hobby === 3) { // 작은 바
    F('kitchenBar', hx - 0.6, hz - 0.65, 90); F('kitchenBar', hx - 0.6, hz + 0.64, 90); F('stoolBar', hx - 1.6, hz - 0.65, -90, 0, 0); F('stoolBar', hx - 1.6, hz + 0.64, -90, 0, 0); F('kitchenCoffeeMachine', hx - 0.6, hz + 0.6, 90, 1.26, 0);
  } else { // 벽난로와 안락의자
    P('#b9654a', 0.9, 2.2, 2.4, hx + 0.1, hz, 0, 1); P('#22202b', 0.3, 1, 1.3, hx - 0.25, hz, 0.15); P('*#ffb03a', 0.2, 0.5, 0.9, hx - 0.28, hz, 0.2); P(T.wood, 1.1, 0.14, 2.7, hx + 0.05, hz, 2.2); P('#b9654a', 0.7, HH - 2.3, 1.2, hx + 0.2, hz, 2.3);
    F('loungeChair', hx - 2.3, hz, -90); F('rugRound', hx - 1.6, hz, 0, 0, 0);
  }
  // 책장과 화분, 옷걸이, 천장등
  F('bookcaseOpen', px + 0.45, D2 - d * 0.36, -90); F('books', px + 0.45, D2 - d * 0.36, 0, 1.0, 0);
  F('coatRackStanding', 1.7, -D2 + 0.6, 0); F('pottedPlant', -W2 + 0.55, -D2 + 0.6, 0);
  if (r() < 0.6) F('pottedPlant', px - 0.6, -D2 + 0.6, 0);
  if (r() < 0.5) F('trashcan', -W2 + 0.5, D2 - 2.3 - U, 0);
  assets.flush();
  col.done();
  h.mergeBuckets('in_' + id);
  return { id, key: 'home', cx, cz, y0, w, d, in: new B.Vector3(cx, y0, cz - D2 + 2.2), out: { x: cx, z: cz - D2 + 1.0 } };
}

// h: { scene, assets, box, addBox, bucket, groundY, jobSites, houses }
export function buildInteriors(h) {
  const { scene, assets } = h;
  const mats = new Map();
  const M = (c) => { if (!mats.has(c)) mats.set(c, c[0] === '*' ? flatMat('in_' + c, c.slice(1), scene, { emissive: c.slice(1) }) : flatMat('in_' + c, c, scene)); return mats.get(c); };
  const rooms = {}, doors = [], clerks = [];
  let level = 0;
  const HH = 5.2;

  const buildRoom = (id, key, cx, cz) => {
    const R = ROOMS[key], y0 = 600 + 14 * level++, w = R.w, d = R.d;
    h.bucket('in_' + id, cx, cz);
    const put = (name, bw, bh, bd, x, y, z, color, collide = true) => h.box(`in_${id}_${name}`, bw, bh, bd, cx + x, y0 + y, cz + z, M(color), { noShadow: true, collide });
    put('floor', w + 0.8, 0.4, d + 0.8, 0, -0.2, 0, R.floor);
    put('ceil', w + 0.8, 0.4, d + 0.8, 0, HH + 0.2, 0, '#f4f1ea');
    put('wallN', w + 0.8, HH, 0.4, 0, HH / 2, d / 2 + 0.2, R.wall); put('wallS', w + 0.8, HH, 0.4, 0, HH / 2, -d / 2 - 0.2, R.wall);
    put('wallE', 0.4, HH, d, w / 2 + 0.2, HH / 2, 0, R.wall); put('wallW', 0.4, HH, d, -w / 2 - 0.2, HH / 2, 0, R.wall);
    put('door', 1.7, 2.7, 0.1, 0, 1.35, -d / 2 + 0.05, '#5a4636', false); put('mat', 2.2, 0.05, 1.3, 0, 0.03, -d / 2 + 0.95, '*#3fc1c9', false);
    for (const sx of [-1, 1]) { put('win' + sx, 0.1, 1.7, d * 0.36, sx * (w / 2 - 0.05), 2.5, d * 0.12, '*#bfe6ff', false); put('lamp' + sx, 1.6, 0.14, 1.6, sx * w * 0.22, HH - 0.08, 0, '*#fff2c2', false); }
    const drop = DROP[key];
    R.items.forEach(([c, bw, bh, bd, x, z, lift = 0, col = 1], i) => { if (drop && drop(c, bw)) return; put('f' + i, bw, bh, bd, x, lift + bh / 2, z, c, !!col); });
    // 가구 모델: [이름, x, z, 방향(도), 띄운 높이, 부딪힘]
    for (const [name, x, z, rot = 0, lift = 0, solid = 1] of [...(DRESS[key] || []), ['pottedPlant', -w / 2 + 0.6, -d / 2 + 0.6], ['trashcan', w / 2 - 0.6, -d / 2 + 0.6], ['lampSquareCeiling', 0, -1, 0, HH - 0.7, 0], ['lampSquareCeiling', 0, 2.2, 0, HH - 0.7, 0]]) {
      const k = 'furniture/' + name;
      assets.place(k, cx + x, y0 + lift, cz + z, (rot * Math.PI) / 180, 1, 'in_' + id);
      if (solid) { const bb = assets.bounds(k), q = Math.abs(rot) === 90; h.addBox(cx + x, y0 + lift + (bb.max.y - bb.min.y) / 2, cz + z, q ? bb.max.z - bb.min.z : bb.max.x - bb.min.x, bb.max.y - bb.min.y, q ? bb.max.x - bb.min.x : bb.max.z - bb.min.z); }
    }
    if (R.clerk) {
      const chr = new Character(scene, randomLook(7000 + level * 31));
      const pos = new B.Vector3(cx + R.clerk[0], y0, cz + R.clerk[1]), yaw = R.clerk[2] === undefined ? Math.PI : R.clerk[2];
      chr.heading = yaw;
      chr.update(0.016, { pos, vel: B.Vector3.Zero(), grounded: true, wishHeading: yaw, landed: 0, jumped: false });
      clerks.push({ chr, pos, yaw, room: id });
    }
    return (rooms[id] = { id, key, cx, cz, y0, w, d, in: new B.Vector3(cx, y0, cz - d / 2 + 2.2), out: { x: cx, z: cz - d / 2 + 1.0 } });
  };

  // 문 표시: 바닥의 빛나는 판과 떠 있는 표식
  const glow = M('*#3fc1c9');
  const marker = (x, y, z) => {
    const pad = B.MeshBuilder.CreateBox('doorPad', { width: 1.9, height: 0.08, depth: 1.9 }, scene);
    pad.position.set(x, y + 0.05, z); pad.material = glow; pad.isPickable = false;
    const gem = B.MeshBuilder.CreateBox('doorGem', { width: 0.34, height: 0.5, depth: 0.34 }, scene);
    gem.position.set(x, y + 2.3, z); gem.material = glow; gem.isPickable = false;
    return gem;
  };
  const signPlane = (text, x, y, z, yaw, bg) => {
    const tex = new B.DynamicTexture('inSign_' + text + x, { width: 512, height: 160 }, scene, true), ctx = tex.getContext();
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 160); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 96px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif'; ctx.fillText(text, 256, 86); tex.update();
    const m = new B.StandardMaterial('inSignMat_' + text + x, scene); m.diffuseTexture = tex; m.emissiveTexture = tex; m.emissiveColor = new B.Color3(0.5, 0.5, 0.5); m.specularColor = B.Color3.Black(); m.backFaceCulling = false;
    const p = B.MeshBuilder.CreatePlane('inSign', { width: 3.2, height: 1 }, scene);
    p.position.set(x, y, z); p.rotation.y = yaw; p.material = m; p.isPickable = false; p.freezeWorldMatrix();
  };
  const frontOf = (key, x, z, yaw, gap) => { const bb = assets.bounds(key), half = (bb.max.z - bb.min.z) / 2; return { x: x - Math.sin(yaw) * (half + gap), z: z - Math.cos(yaw) * (half + gap) }; };

  // 직업 건물 전부
  for (const [id, s] of Object.entries(h.jobSites)) {
    if (!s.door || !ROOMS[id]) continue;
    buildRoom(id, id, s.door.x, s.door.z);
    doors.push({ id, room: id, x: s.door.x, y: s.door.y, z: s.door.z, yaw: s.door.yaw, gem: marker(s.door.x, s.door.y, s.door.z) });
  }
  // 그 밖의 가게들
  const SHOPS = [
    { id: 'store', key: 'commercial/building-a', x: 24, z: 2.02 * 12, yaw: FACE.S, bg: '#2f7d4f' },
    { id: 'cafe', key: 'commercial/building-d', x: 24, z: 6.02 * 12, yaw: FACE.N, bg: '#8a5a2b' },
    { id: 'hotel', key: 'commercial/building-n', x: 456, z: 154, yaw: 0, bg: '#34456f' },
    { id: 'hospital', key: 'commercial/building-n', x: 8.15 * 12, z: 2.5 * 12, yaw: FACE.S, bg: '#d9473c' },
    { id: 'jail', key: 'commercial/building-j', x: 3.45 * 12, z: 5.15 * 12, yaw: FACE.S, bg: '#34456f' },
    { id: 'arms', key: 'commercial/building-c', x: 24, z: 2.98 * 12, yaw: FACE.N, bg: '#55693f' },
  ];
  for (const s of SHOPS) {
    const f = frontOf(s.key, s.x, s.z, s.yaw, 1.1), y = h.groundY(f.x, f.z);
    buildRoom(s.id, s.id, f.x, f.z);
    doors.push({ id: s.id, room: s.id, x: f.x, y, z: f.z, yaw: s.yaw, gem: marker(f.x, y, f.z) });
    signPlane(ROOMS[s.id].name, f.x + Math.sin(s.yaw) * 0.9, y + 3.5, f.z + Math.cos(s.yaw) * 0.9, s.yaw, s.bg);
  }
  // 살 수 있는 집: 안은 모두 같은 방을 쓴다.
  const forSale = M('#d9473c'), mine = M('*#57c27a'), post = M('#f4f1ea');
  const count = {};
  let homeSeed = 0;
  const homes = h.houses.map((hs) => {
    const area = hs.area.startsWith('cabin') ? 'cabin' : hs.area;
    count[hs.area] = (count[hs.area] || 0) + 1;
    const id = hs.area + '#' + count[hs.area];
    const f = frontOf(hs.key, hs.x, hs.z, hs.yaw, 1.2), y = h.groundY(f.x, f.z);
    const bb = assets.bounds(hs.key), size = (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z);
    const price = Math.round(((PRICE[area] || 2000) * (0.7 + size / 500)) / 100) * 100;
    // 팻말: 팔 집은 빨강, 내 집은 초록
    const sx = f.x + Math.cos(hs.yaw) * 1.7, sz = f.z - Math.sin(hs.yaw) * 1.7;
    const pole = B.MeshBuilder.CreateBox('housePost', { width: 0.12, height: 1.5, depth: 0.12 }, scene);
    pole.position.set(sx, y + 0.75, sz); pole.material = post; pole.isPickable = false;
    const board = B.MeshBuilder.CreateBox('houseBoard', { width: 0.9, height: 0.55, depth: 0.1 }, scene);
    board.position.set(sx, y + 1.5, sz); board.rotation.y = hs.yaw; board.material = forSale; board.isPickable = false;
    // 집마다 제 내부가 따로 있다(씨앗은 집 번호). 42채를 미리 다 지으면 로딩이 길어져서, 처음 들어갈 때 짓는다.
    const plan = [f.x, f.z, 600 + 14 * level++, homeSeed++ * 7 + 3, size > 330];
    const d = { id, house: true, room: 'home_' + id, x: f.x, y, z: f.z, yaw: hs.yaw, price, board, plan, name: (AREA_NAME[area] || '외딴') + ' 집' };
    doors.push(d);
    return d;
  });

  let owned = new Set();
  try { owned = new Set(JSON.parse(localStorage.getItem('boxtown.houses') || '[]')); } catch (e) { /* 저장소를 못 쓰는 환경 */ }
  const paint = () => homes.forEach((d) => { d.board.material = owned.has(d.id) ? mine : forSale; });
  paint();
  const save = (key, v) => { try { localStorage.setItem(key, v); } catch (e) { /* 무시 */ } };

  const I = {
    rooms, doors, homes, owned, inside: null, player: null, jobs: null, t: 0,
    init(player, jobs) {
      this.player = player; this.jobs = jobs;
      // 내 집이 있으면 마지막으로 드나든 집 앞에서 시작한다.
      let last = null;
      try { last = localStorage.getItem('boxtown.home'); } catch (e) { /* 무시 */ }
      const d = homes.find((x) => x.id === last && owned.has(x.id));
      if (d) { player.teleport(d.x, d.y, d.z); player.yaw = d.yaw + Math.PI; player.chr.heading = d.yaw + Math.PI; }
    },
    near() {
      const p = this.player.feet;
      let best = null, bd = 1.5;
      for (const d of doors) { const dist = Math.hypot(d.x - p.x, d.z - p.z); if (dist < bd && Math.abs(d.y - p.y) < 2) { bd = dist; best = d; } }
      return best;
    },
    // 무기 상점 안에서 가까이 선 진열대: [무기, 값, x, 이름]
    atStand() {
      const r = this.inside && rooms[this.inside.room], buy = r && ROOMS[r.key].buy, p = this.player.feet;
      if (!buy) return null;
      const NAME = { bat: '방망이', pistol: '권총', smg: '기관단총', rifle: '돌격소총', rocket: '로켓 발사기' };
      for (const b of buy) if (Math.hypot(r.cx + b[2] - p.x, r.cz + (b[3] === undefined ? -1 : b[3] - 3.2) - p.z) < 1.9) return [b[0], b[1], b[2], NAME[b[0]]];
      return null;
    },
    atExit() { const r = this.inside && rooms[this.inside.room], p = this.player.feet; return r && Math.hypot(r.out.x - p.x, r.out.z - p.z) < 1.7; },
    prompt() {
      if (this.player.vehicle) return '';
      if (this.inside) { const b = this.atStand(); return this.atExit() ? '나가기' : b ? (this.weapons.owned.has(b[0]) ? `${b[3]} (이미 있음)` : `${b[3]} 사기 (${won(b[1])}원)`) : ''; }
      const d = this.near();
      if (!d) return '';
      if (d.house && !owned.has(d.id)) return `${d.name} 사기 (${won(d.price)}원)`;
      return d.house ? '내 집 들어가기' : '들어가기';
    },
    fade() { const f = $('fade'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 320); },
    // 방으로 바로 데려간다(병원에서 깨어나기, 감옥에 갇히기).
    send(id, x = 0, z = 0) {
      const P = this.player, d = doors.find((q) => q.id === id), r = rooms[id];
      if (P.vehicle) P.exit();
      this.inside = d; P.inside = true; P.dist = 4.6; assets.activeInterior = 'in_' + id;
      this.fade();
      P.teleport(r.cx + x, r.y0, r.cz + z); P.yaw = 0; P.pitch = 0.32;
    },
    leave() {
      const P = this.player, d = this.inside;
      if (!d) return;
      this.inside = null; P.inside = false; P.dist = 6.8; assets.activeInterior = null;
      this.fade();
      P.teleport(d.x, d.y, d.z); P.yaw = d.yaw + Math.PI; P.chr.heading = d.yaw + Math.PI;
    },
    use() {
      const P = this.player;
      if (this.inside) {
        const b = this.atStand();
        if (b && !this.atExit()) {
          // 무기 상점 진열대
          if (this.weapons.owned.has(b[0])) return true;
          if (!this.jobs.spend(b[1])) { this.jobs.toast(`돈이 모자라요 (${won(b[1])}원 필요)`); return true; }
          this.weapons.unlock(b[0], '', '샀어요');
          return true;
        }
        if (!this.atExit()) return false;
        if (this.locked) { this.jobs.toast('갇혀 있어요. 벌금을 내거나, 일을 하거나, 몰래 빠져나가세요'); return true; }
        const d = this.inside;
        this.inside = null; P.inside = false; P.dist = 6.8;
        assets.activeInterior = null;
        this.fade();
        P.teleport(d.x, d.y, d.z); P.yaw = d.yaw + Math.PI; P.chr.heading = d.yaw + Math.PI;
        return true;
      }
      const d = this.near();
      if (!d) return false;
      if (d.house && !owned.has(d.id)) {
        if (!this.jobs.spend(d.price)) { this.jobs.toast(`돈이 모자라요 (${won(d.price)}원 필요)`); return true; }
        owned.add(d.id); save('boxtown.houses', JSON.stringify([...owned])); save('boxtown.home', d.id); paint();
        this.jobs.toast(`${d.name}을 샀어요! 이제 내 집이에요`, true);
        return true;
      }
      if (d.house) save('boxtown.home', d.id);
      if (!rooms[d.room]) { rooms[d.room] = buildHome(h, M, d.room, ...d.plan); h.bucket('town', 66, 48); }
      const r = rooms[d.room];
      this.inside = d; P.inside = true; P.dist = 4.6;
      assets.activeInterior = 'in_' + d.room; // 들어간 방만 그린다
      this.fade();
      P.teleport(r.in.x, r.in.y, r.in.z); P.yaw = 0; P.pitch = 0.32; P.chr.heading = 0;
      return true;
    },
    // 지도에 찍을 위치(안에 있으면 들어간 문의 위치)
    where() { return this.inside ? { x: this.inside.x, z: this.inside.z } : null; },
    update(dt) {
      this.t += dt;
      const p = this.player.feet;
      for (const d of doors) if (d.gem) { d.gem.rotation.y += dt * 1.6; d.gem.position.y = d.y + 2.3 + Math.sin(this.t * 2 + d.x) * 0.12; }
      if (!this.inside) return;
      // 점원은 손님이 다가오면 돌아보고 손을 흔든다.
      for (const c of clerks) {
        if (c.room !== this.inside.room) continue;
        const dx = p.x - c.pos.x, dz = p.z - c.pos.z, dist = Math.hypot(dx, dz);
        c.chr.wave = dist < 4.5 ? 1 : 0;
        c.chr.update(dt, { pos: c.pos, vel: B.Vector3.Zero(), grounded: true, wishHeading: dist < 6 ? Math.atan2(dx, dz) : c.yaw, landed: 0, jumped: false });
      }
    },
  };
  return I;
}
