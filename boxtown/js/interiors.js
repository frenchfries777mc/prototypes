// 건물 내부와 내 집 마련.
// 건물 모델은 속이 막혀 있어서, 문 앞에서 E를 누르면 하늘 높이 따로 지어 둔 방으로 옮겨 간다(나올 때는 들어간 문 앞으로).
// 방은 상자로 짓는다: 바닥·벽·천장 + 가구 목록.
import { flatMat } from './util.js';
import { Character, randomLook } from './character.js';
const B = window.BABYLON;

const FACE = { S: 0, W: Math.PI / 2, N: Math.PI, E: (3 * Math.PI) / 2 };
// 가구 한 줄: [색, 가로, 높이, 세로, x, z, 바닥에서 띄운 높이=0, 충돌=1]. 색 앞의 *는 스스로 빛나는 것.
// 방 좌표: 문은 남쪽 벽 가운데, +z가 안쪽.
const ROOMS = {
  pizza: { w: 14, d: 11, floor: '#e9d2a0', wall: '#fbe9c6', clerk: [-1, 3.6], items: [
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
  cafe: { name: '카페', w: 13, d: 10, floor: '#c79a5b', wall: '#f3e3cf', clerk: [3.6, 3.2], items: [
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
    buy: [['bat', 900, -4.6], ['pistol', 2800, -1.6], ['smg', 6500, 1.6], ['rocket', 15000, 4.6]] },
  home: { w: 13, d: 10, floor: '#d8b98a', wall: '#f3ead6', items: [
    ['#4f6fb0', 3.6, 0.7, 1.4, -3.6, -1.6], ['#4f6fb0', 3.6, 1.3, 0.4, -3.6, -2.4, 0, 0], ['#e5553f', 4.4, 0.04, 3, -3.6, 0.2, 0, 0], ['#8b5d3a', 1.6, 0.5, 1, -3.6, 0.4], ['#2c2c36', 3, 0.9, 0.5, -3.6, 2.6], ['#22202b', 2.6, 1.5, 0.14, -3.6, 2.6, 1.0, 0], ['*#7fb8e0', 2.3, 1.2, 0.04, -3.6, 2.52, 1.15, 0],
    ['#f4f1ea', 4.4, 1, 0.9, 4, 4.4], ['#8f95a8', 4.6, 0.1, 1, 4, 4.4, 1, 0], ['#d8dcec', 1.1, 2.3, 0.9, 1.2, 4.4], ['#b9814f', 1.8, 0.9, 1.2, 3.2, 1.4], ['#c79a5b', 0.5, 0.5, 0.5, 3.2, 0.3], ['#c79a5b', 0.5, 0.5, 0.5, 3.2, 2.5],
    ['#8b5d3a', 2.2, 0.5, 3.4, 5.2, -2.6], ['#f4f1ea', 2, 0.3, 3, 5.2, -2.6, 0.5, 0], ['#57c27a', 2, 0.32, 1.9, 5.2, -3.1, 0.52, 0], ['#f4f1ea', 1.4, 0.24, 0.5, 5.2, -1.3, 0.8, 0], ['#8b5d3a', 0.6, 2.4, 2.6, -6.1, 3.2], ['#e5553f', 0.2, 0.5, 0.4, -5.9, 2.6, 1.2, 0], ['#3fa868', 0.2, 0.5, 0.4, -5.9, 3.4, 1.2, 0], ['#4f9bea', 0.2, 0.5, 0.4, -5.9, 3.8, 0.5, 0], ['#3fa868', 0.6, 1.4, 0.6, -5.8, -4.2]] },
};
const PRICE = { town: 5200, lake: 3400, gull: 4200, farm: 2800, mill: 3000, twin: 3600, woods: 2600, wind: 2400 };
const AREA_NAME = { town: '항구 마을', lake: '호수 마을', gull: '갈매기섬', farm: '서쪽 농장', mill: '풍차섬', twin: '쌍둥이섬', woods: '고요숲 섬', wind: '풍차 언덕' };
const $ = (id) => document.getElementById(id);
const won = (n) => n.toLocaleString('ko-KR');

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
    R.items.forEach(([c, bw, bh, bd, x, z, lift = 0, col = 1], i) => put('f' + i, bw, bh, bd, x, lift + bh / 2, z, c, !!col));
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
    { id: 'arms', key: 'commercial/building-c', x: 24, z: 2.98 * 12, yaw: FACE.N, bg: '#55693f' },
  ];
  for (const s of SHOPS) {
    const f = frontOf(s.key, s.x, s.z, s.yaw, 1.1), y = h.groundY(f.x, f.z);
    buildRoom(s.id, s.id, f.x, f.z);
    doors.push({ id: s.id, room: s.id, x: f.x, y, z: f.z, yaw: s.yaw, gem: marker(f.x, y, f.z) });
    signPlane(ROOMS[s.id].name, f.x + Math.sin(s.yaw) * 0.9, y + 3.5, f.z + Math.cos(s.yaw) * 0.9, s.yaw, s.bg);
  }
  // 살 수 있는 집: 안은 모두 같은 방을 쓴다.
  buildRoom('home', 'home', 66, 48);
  const forSale = M('#d9473c'), mine = M('*#57c27a'), post = M('#f4f1ea');
  const count = {};
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
    const d = { id, house: true, room: 'home', x: f.x, y, z: f.z, yaw: hs.yaw, price, board, name: (AREA_NAME[area] || '외딴') + ' 집' };
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
      const NAME = { bat: '방망이', pistol: '권총', smg: '기관단총', rocket: '로켓 발사기' };
      for (const b of buy) if (Math.hypot(r.cx + b[2] - p.x, r.cz - 1 - p.z) < 1.9) return [b[0], b[1], b[2], NAME[b[0]]];
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
    fade() { const f = $('fade'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 220); },
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
        const d = this.inside;
        this.inside = null; P.inside = false; P.dist = 6.8;
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
      const r = rooms[d.room];
      this.inside = d; P.inside = true; P.dist = 4.6;
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
