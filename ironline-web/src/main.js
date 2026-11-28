// Ironline (web): 게임 루프, 입력, 카메라, 이벤트 → 효과 연결.
import * as THREE from 'three';
import { Sim, TICK, WEAPONS, CLASSES, EYE } from './sim.js';
import { TRENCH_X } from './world.js';
import { makeSky, buildTerrain, makeBoxProps, makeHouses, textureLoader, sandbagTexture, boxGeo, HAZE } from './gfx.js';
import { Models, Batch, scatter, modelNames, setDecorStyle } from './decor.js';
import { UnitViews, PointViews, makeViewmodel, COL_A, COL_B } from './units.js';
import { Fx } from './fx.js';
import { Audio } from './audio.js';
import { Hud } from './hud.js';
import { Net, makeSnap, makeScore, applySnap } from './net.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const SEED = 20260101;
const TS = q.get('terrain') || 'toon';   // block · lowpoly · toon · paint · real · ps1
setDecorStyle(TS === 'block');
const QUAL = [
  { pr: 1, shadow: 0, size: 1024, far: 700 },
  { pr: 1.25, shadow: 1, size: 2048, far: 1000 },
  { pr: 2, shadow: 1, size: 4096, far: 1400 },
];

const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.autoClear = false;
if (q.get('norender')) { renderer.render = () => {}; }   // 네트워크·시뮬레이션 시험용(그리지 않음)
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(HAZE, TS === 'ps1' ? 0.0075 : 0.0034);
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 1500); camera.rotation.order = 'YXZ';
const vmScene = new THREE.Scene(), vmCam = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
const vmSun = new THREE.DirectionalLight(0xffd8a8, 2.2); vmSun.position.set(-1, 1.5, 1);
vmScene.add(new THREE.HemisphereLight(0xdde4ff, 0x8a7a66, 2.2), vmSun);

// ---- 조명 ----
scene.add(new THREE.HemisphereLight(0xb4c0e6, 0x6e5e4a, 1.9), new THREE.AmbientLight(0xffe8d0, 0.35));
const SUN = new THREE.Vector3(-0.62, 0.34, -0.7).normalize();
const _R = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN).normalize(), _U = new THREE.Vector3().crossVectors(SUN, _R).normalize();
// 그림자 카메라 중심을 텍셀 격자에 맞춰 옮겨, 움직일 때 그림자 가장자리가 아른거리지 않게 한다
function setSun(x, z) {
  const t = 110 / sun.shadow.mapSize.x, p = new THREE.Vector3(x, 0, z);
  const a = p.dot(_R), b = p.dot(_U);
  p.addScaledVector(_R, Math.round(a / t) * t - a).addScaledVector(_U, Math.round(b / t) * t - b);
  sun.target.position.copy(p); sun.position.copy(p).addScaledVector(SUN, 120); sun.target.updateMatrixWorld();
}
const sun = new THREE.DirectionalLight(0xffc88f, 2.8); scene.add(sun, sun.target);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 260 });

// ---- 불러오기 ----
const loadBar = (t) => { const b = $('go'); b.textContent = t; };
$('go').disabled = true; loadBar('불러오는 중…');
const load = textureLoader();
const names = ['forrest_ground_01', 'forest_ground_04', 'brown_mud_03', 'mossy_rock', 'red_brick_03', 'plaster_grey_04', 'ceramic_roof_01', 'weathered_planks'];
const [grass, dirt, mud, rock, brick, plaster, roof, plank] = await Promise.all(names.map((n) => load(`assets/textures/${n}_diff.jpg`)));
const tex = { grass, dirt, mud, rock, brick, plaster, roof, plank, sand: sandbagTexture() };
const sim = new Sim(SEED, 32, TS !== 'block');
const world = sim.world;
const sky = makeSky(); scene.add(sky);
scene.add(buildTerrain(world, tex, TS), makeBoxProps(world, tex), makeHouses(world, tex));
const fx = new Fx(scene, camera);
const models = new Models();
await models.load(modelNames());
const batch = new Batch(models); scatter(world, batch);
scene.add(batch.build());
console.log('decor instances', batch.count);
for (const b of world.boxes) if (b.kind === 6) { /* 천막 옆 모닥불 연기 */ }
for (let i = 0; i < 0; i++) fx.emitter('smoke', 0, 0, 0);
const pointViews = new PointViews(scene, sim);
let unitViews = new UnitViews(scene, sim);
const audio = new Audio(), hud = new Hud();
// 온라인(PeerJS). 개발·시험용으로 ?peerhost=localhost:9000&secure=0 처럼 시그널 서버를 바꿀 수 있다. 기본은 PeerJS 공용 서버.
const peerCfg = {};
if (q.get('peerhost')) { const [h, pt] = q.get('peerhost').split(':'); peerCfg.host = h; peerCfg.port = +pt || 443; peerCfg.secure = q.get('secure') !== '0'; }
const net = new Net(peerCfg);
const PER = 32;                       // 온라인은 팀당 32명 고정(사람 자리는 봇 자리를 넘겨받는다)
// frenchfries777 계정이 로그인되어 있으면 그 닉네임을 쓴다. 로그인하지 않았다면 임시 이름.
const guestName = '병사' + (100 + Math.floor(Math.random() * 900));
function accountName() {
  try { if (window.FFAuth && FFAuth.user()) { const n = String(FFAuth.nickname() || '').replace(/[<>&"'`]/g, '').trim(); if (n) return n.slice(0, 10); } } catch (e) { /* 로그인 스크립트를 못 불러온 경우 */ }
  return null;
}
function refreshAcct() {
  const a = $('acct'); if (!a) return; const n = accountName();
  if (n) a.innerHTML = `<span>👤 <b></b></span>`, a.querySelector('b').textContent = n;
  else { a.innerHTML = '<span>게스트</span><button type="button">로그인</button>'; a.querySelector('button').onclick = () => { try { FFAuth.openLogin(); } catch (e) { /* */ } }; }
}
refreshAcct();
// 로그인 스크립트는 늦게 올 수 있으니 잠깐 기다렸다가 연결한다
{
  let tries = 0;
  const t = setInterval(() => {
    if (window.FFAuth || ++tries > 40) { clearInterval(t); if (window.FFAuth) { try { FFAuth.ready.then(refreshAcct); FFAuth.onChange(refreshAcct); } catch (e) { /* */ } refreshAcct(); } }
  }, 250);
}
let role = 'solo', snapT = 0, tickN = 0, endT = 0, orphanScan = 0, myName = guestName, hubHumans = 1;
let vm = null, vmW = -1;

// ---- 상태 ----
const S = { running: false, paused: false, loadout: 0, sens: 5, thirdPerson: false, accum: 0, prev: null, kick: 0, adsT: 0, bob: 0, shake: 0, flash: 0, stepD: 0, lastFootX: 0, over: false, stats: null, quality: 1 };
const keys = new Set();
let lockWanted = false, me = null;

function setQuality(qn) {
  S.quality = qn; const Q = QUAL[qn];
  renderer.setPixelRatio(TS === 'ps1' ? 0.4 : Math.min(devicePixelRatio, Q.pr));
  canvas.style.imageRendering = TS === 'ps1' ? 'pixelated' : 'auto';
  renderer.shadowMap.enabled = !!Q.shadow;
  sun.castShadow = !!Q.shadow; sun.shadow.mapSize.set(Q.size, Q.size);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  camera.far = Q.far; camera.updateProjectionMatrix();
  scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => { x.needsUpdate = true; }); } });
  resize();
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = vmCam.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
  fx.setScale(renderer.domElement.height, camera.fov);
}
addEventListener('resize', resize);

// ---- 메뉴 ----
$('tstyle').value = TS; $('tstyle').onchange = () => { location.search = '?terrain=' + $('tstyle').value; };
const wps = $('wps');
const SIL = [
  '<path d="M10 28h40l6-4h60l4 3h28v6h-28l-3 2H88l-4 14h-9l1-14H56l-6 5-4-5H10z"/>',                                                         // 돌격병: 기관단총
  '<path d="M4 30h58l6-4h70l6 3h36v6h-36l-4 2H70l-8 6-4-6H4z"/><rect x="40" y="26" width="26" height="5"/>',                                    // 소총수: 볼트액션 소총
  '<path d="M4 28h50l6-5h74l4 3h36v6h-36l-4 2H86l-14 10h-5l6-10H54l-6 5-4-5H4z"/><path d="M104 36l-10 14M112 36l10 14" stroke="#1a1208" stroke-width="3" fill="none"/>', // 기관총수: 경기관총
  '<path d="M8 30h50l6-4h58l5 3h30v6h-30l-4 2H76l-8 6-4-6H8z"/><path d="M150 6h14v8h8v14h-8v8h-14v-8h-8V14h8z" fill="#d8402e" transform="translate(-8 -2) scale(.9)"/>',   // 의무병: 카빈 + 적십자
  '<path d="M4 32h60l6-5h64l5 3h30v7h-30l-4 2H72l-8 6-4-6H4z"/><rect x="150" y="26" width="26" height="4"/><rect x="150" y="34" width="26" height="4"/>',          // 공병: 산탄총
];
const bar = (v) => `<i><b style="width:${Math.round(Math.max(0.06, Math.min(1, v)) * 100)}%"></b></i>`;
CLASSES.forEach((c, i) => {
  const w = WEAPONS[c.weapon];
  const b = document.createElement('button'); b.className = 'wp' + (i === 0 ? ' on' : ''); b.type = 'button';
  b.innerHTML = `<svg viewBox="0 0 190 56" fill="#1a1208">${SIL[i]}</svg><b>${i + 1}. ${c.name}</b><div class="wd">${w.name} · ${c.desc}</div>
    <div class="st"><span>위력</span>${bar(w.dmg * (w.pellets ? w.pellets * 0.5 : 1) / 70)}<span>연사</span>${bar((1 / w.cd) / 12)}<span>사거리</span>${bar(w.range / 240)}</div>`;
  b.onclick = () => selectWeapon(i);
  wps.appendChild(b);
});
function selectWeapon(i) { S.loadout = i; [...wps.children].forEach((c, k) => c.classList.toggle('on', k === i)); }
addEventListener('keydown', (e) => { if (S.running) return; if (/^Digit[1-5]$/.test(e.code)) selectWeapon(+e.code[5] - 1); if (e.code === 'Enter' && !$('go').disabled) start(); });
function show(id) { for (const k of ['menu', 'pause', 'res']) $(k).style.display = k === id ? '' : 'none'; $('overlay').classList.toggle('on', !!id); canvas.classList.toggle('lobbyfx', id === 'menu'); }

async function start() {
  audio.mute = $('snd').value === '0'; audio.init();
  S.sens = +$('sens').value; setQuality(+$('qual').value);
  myName = accountName() || guestName;
  const go = $('go'); go.disabled = true; go.textContent = '접속 중…'; $('lbnote').textContent = '전장을 찾는 중…';
  // 한 번 더 누른 경우(결과 화면의 다시 출격)에는 이전 접속을 정리한다
  net.close(); role = 'solo';
  let mode = 'solo', why = '';
  if (TS === 'toon' && !q.get('solo')) {
    net.cb = netCallbacks();
    try { mode = await net.connect(-1, myName, S.loadout); } catch (e) { mode = 'solo'; why = (e && e.type) || String(e); console.warn('온라인 접속 실패', e); }
  }
  go.disabled = false; go.textContent = '출격'; $('lbnote').textContent = '누르면 자동으로 전장에 합류합니다';
  role = mode;
  scene.remove(unitViews.group);
  clearBuildMeshes();
  if (mode === 'client') {
    sim.reset(PER);
    unitViews = new UnitViews(scene, sim);
    applySnap(sim, pendingWel.snap, -1, true); applyScore(pendingWel.sc);
    me = sim.units[pendingWel.id]; me.isBot = false; me.label = myName; me.loadout = S.loadout; me.remote = false; applyBuilds(pendingWel.builds);
    S.sn = me.spawnN; S.rlT = 0; S.lastSnapAt = performance.now(); S.snapGap = 66;
  } else {
    sim.reset(PER);
    unitViews = new UnitViews(scene, sim);
    const id = pickSlot(-1); me = sim.units[id]; me.remote = false; sim.claim(id, S.loadout, myName);
    if (mode === 'hub') net.cb = netCallbacks();
  }
  Object.assign(S, { running: true, paused: false, accum: 0, prev: null, kick: 0, adsT: 0, over: false, shake: 0, camY: undefined });
  S.stats = { k0: 0 };
  setViewmodel(me.weapon);
  show(null); hud.show(true);
  hud.message(mode === 'solo' ? (why ? '온라인에 연결할 수 없어 오프라인(봇전)으로 시작합니다' : '거점 B 를 점령하며 전진하세요') : '거점 B 를 점령하며 전진하세요', 3500);
  hud.feed('WASD 이동 · Shift 달리기 · 클릭 사격 · 우클릭 정조준 · R 장전 · 1 2 3 무기 · Tab 점수판', '', false);
  $('again').style.display = mode === 'solo' ? '' : 'none';
  requestLock();
}

// ---- 공병이 놓은 모래주머니 ----
const buildMeshes = new Map();
const sandMat = new THREE.MeshStandardMaterial({ map: tex.sand, roughness: 0.95 });
function addBuildMesh(i) {
  if (buildMeshes.has(i)) return;
  const b = world.boxes[i]; if (!b || b.dead) return;
  const m = new THREE.Mesh(boxGeo(b.mn, b.mx, 1.0), sandMat); m.castShadow = m.receiveShadow = true; scene.add(m); buildMeshes.set(i, m);
}
function removeBuildMesh(i) { const m = buildMeshes.get(i); if (m) { scene.remove(m); m.geometry.dispose(); buildMeshes.delete(i); } }
function clearBuildMeshes() { for (const i of [...buildMeshes.keys()]) removeBuildMesh(i); }
function applyBuilds(list) {
  clearBuildMeshes();
  for (const b of list || []) { world.addDynamic(b.x, b.z, b.sx, b.sz, b.h, 1, b.i); addBuildMesh(b.i); }
}

// ---- 온라인: 자리 배정과 네트워크 콜백 ----
let pendingWel = null;
function pickSlot(want) {
  const u0 = want >= 0 ? sim.units[want] : null;
  if (u0 && (u0.isBot || (u0.orphan > 0 && u0.remote))) return want;   // 같은 자리로 복귀(판 인계 직후 포함)
  const humans = [0, 0]; for (const u of sim.units) if (!u.isBot) humans[u.team]++;
  const team = humans[0] <= humans[1] ? 0 : 1;
  const cand = sim.units.filter((u) => u.team === team && u.isBot);
  const dead = cand.filter((u) => !u.alive);
  return (dead.length ? dead : cand)[0].id;
}
function applyScore(m) {
  if (!m) return;
  m.k.forEach((v, i) => { sim.units[i].kills = v; }); m.d.forEach((v, i) => { sim.units[i].deaths = v; });
  for (const id in m.names) sim.units[id].label = m.names[id];
}
function netCallbacks() {
  return {
    role: () => { /* 판을 도는 쪽이 됨 */ },
    // 판을 도는 쪽: 새 참가자에게 자리를 내주고 현재 상태를 통째로 보낸다
    hello: (pid, m) => {
      const id = pickSlot(m.want);
      const u = sim.units[id];
      u.isBot = false; u.remote = true; u.inp = null; u.label = m.name || u.label; u.orphan = 0;
      const c = Math.max(0, Math.min(CLASSES.length - 1, m.w | 0));
      u.loadout = u.cls = c; u.weapon = CLASSES[c].weapon; u.maxHp = CLASSES[c].hp; u.hp = Math.min(u.hp, u.maxHp); u.ammo = WEAPONS[u.weapon].mag; u.reloadT = 0;
      if (!u.alive && u.deaths === 0) { u.respawnT = 0.2; }
      return { id, snap: makeSnap(sim, tickN, net.humans), sc: makeScore(sim), you: u.spawnN, builds: sim.builds };
    },
    input: (id, m) => { const u = sim.units[id]; if (u && u.remote) u.inp = m; },
    leave: (id) => { const u = sim.units[id]; u.remote = false; u.isBot = true; u.inp = null; u.label = (u.team === 0 ? 'A' : 'B') + u.id; },
    // 들어가는 쪽
    welcome: (w) => { pendingWel = w; },
    snap: (m) => {
      if (!me) return;
      const adopt = applySnap(sim, m, me.id);
      if (adopt) { S.prev = null; S.camY = undefined; me.vx = me.vy = me.vz = 0; S.sn = me.spawnN; }
      if (S.wSwitchT > 0) { /* 방금 무기를 바꿨다면 탄약 표시는 잠깐 로컬 값 유지 */ }
      hubHumans = m.hc; const now = performance.now(); S.snapGap = Math.min(150, Math.max(30, now - (S.lastSnapAt || now))); S.lastSnapAt = now;
    },
    events: (ev) => {
      for (const e of ev) {
        if (e.t === 'kill') {
          const v = sim.units[e.v], k = sim.units[e.k];
          if (v === me) { me.killer = e.k; me.killW = e.w; me.killDist = e.d; me.respawnT = 5; me.deaths++; }
          if (k) k.kills++; if (v) v.deaths++;
        } else if (e.t === 'new') { S.over = false; me.killer = -1; show(null); hud.show(true); hud.message('새 경기 시작', 2500); }
        sim.events.push(e);
      }
    },
    score: (m) => applyScore(m),
    lost: () => reconnect(),
  };
}
async function reconnect() {
  role = 'connecting';
  hud.message('연결이 끊겨 다시 연결하는 중…', 60000);
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 1500));
  net.cb = netCallbacks();
  try {
    const mode = await net.connect(me.id, myName, S.loadout);
    if (mode === 'hub') {
      // 남은 사람 중 먼저 자리를 잡은 내가 판을 이어받는다. 다른 사람은 곧 다시 들어오고, 안 들어오면 봇으로 바꾼다.
      role = 'hub'; me.remote = false;
      for (const u of sim.units) if (u !== me && !u.isBot) { u.remote = true; u.inp = null; u.orphan = 9; }
      hud.message('연결 복구', 1800);
    } else {
      role = 'client'; applySnap(sim, pendingWel.snap, -1, true); applyScore(pendingWel.sc);
      me = sim.units[pendingWel.id]; me.isBot = false; me.remote = false; me.label = myName; me.loadout = S.loadout; applyBuilds(pendingWel.builds); S.sn = me.spawnN; S.prev = null; S.camY = undefined; S.lastSnapAt = performance.now();
      hud.message('연결 복구', 1800);
    }
  } catch (e) { role = 'solo'; hud.message('온라인 연결이 끊어졌습니다. 오프라인으로 계속합니다', 4000); }
}
function requestLock() { lockWanted = true; try { const p = canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch (e) { /* 헤드리스 등 */ } }
$('go').onclick = start; $('again').onclick = start;
$('resume').onclick = () => { S.paused = false; show(null); requestLock(); };
$('quit').onclick = $('tomenu').onclick = () => { net.close(); role = 'solo'; S.running = false; hud.show(false); sim.reset(PER); clearBuildMeshes(); scene.remove(unitViews.group); unitViews = new UnitViews(scene, sim); show('menu'); try { document.exitPointerLock(); } catch (e) { /* */ } };
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked && S.running && !S.over && lockWanted && !q.get('auto')) { S.paused = true; keys.clear(); down.l = down.r = false; show('pause'); }
});

// ---- 입력 ----
const down = { l: false, r: false };
addEventListener('keydown', (e) => {
  if (!S.running || S.paused) return;
  keys.add(e.code);
  if (e.code === 'Tab') { e.preventDefault(); }
  if (/^Digit[1-5]$/.test(e.code)) {   // 병과는 다음 출격부터 바뀐다
    const c = +e.code[5] - 1; me.loadout = S.loadout = c;
    hud.message(`다음 출격: ${CLASSES[c].name}`, 1600);
  }
  if (e.code === 'KeyF' && me.alive) { if (role === 'client') S.abT = 3; else me.abil = true; }
  if (e.code === 'KeyR') me.reload = true;
  if (role === 'client' && e.code === 'KeyR') S.rlT = 3;
  if (e.code === 'KeyV') S.thirdPerson = !S.thirdPerson;
  if (e.code === 'Backquote') $('dbg').style.display = $('dbg').style.display === 'block' ? 'none' : 'block';
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('mousemove', (e) => {
  if (!S.running || S.paused || !me?.alive) return;
  if (document.pointerLockElement !== canvas && !q.get('auto')) return;
  const k = 0.00045 * S.sens * (down.r ? 0.5 : 1);
  me.yaw -= e.movementX * k; me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - e.movementY * k));
});
canvas.addEventListener('mousedown', (e) => { if (e.button === 0) down.l = true; if (e.button === 2) down.r = true; if (S.running && !S.paused && document.pointerLockElement !== canvas) requestLock(); });
addEventListener('mouseup', (e) => { if (e.button === 0) down.l = false; if (e.button === 2) down.r = false; });
addEventListener('contextmenu', (e) => e.preventDefault());

function applyInput() {
  if (!me.alive) { me.moveX = me.moveY = 0; me.fire = me.jump = me.sprint = me.ads = false; return; }
  const k = (c) => keys.has(c) ? 1 : 0;
  me.moveX = k('KeyD') - k('KeyA'); me.moveY = k('KeyW') - k('KeyS');
  me.jump = keys.has('Space'); me.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  me.fire = down.l; me.ads = down.r;
}

const flashTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, '#fff'); r.addColorStop(0.25, '#ffe9a0'); r.addColorStop(0.6, 'rgba(255,150,40,.5)'); r.addColorStop(1, 'rgba(255,120,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
let vmFlash = null;
function setViewmodel(w) {
  if (vm) vmScene.remove(vm);
  vm = makeViewmodel(w); vmW = w; vmScene.add(vm);
  vmFlash = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  vmFlash.position.set(0, 0.035, [-1.0, -0.68, -1.08, -0.85, -0.92][w] || -1); vmFlash.visible = false; vm.add(vmFlash);
}

// ---- 이벤트 → 효과 ----
function onEvents() {
  const cp = camera.position;
  for (const e of sim.events) {
    if (e.t === 'shot') {
      const mine = e.id === me.id, d = Math.hypot(e.a.x - cp.x, e.a.z - cp.z);
      const local = mine && role === 'client';   // 내 사격은 눌렀을 때 이미 연출함
      if (d < 220 && !local) audio.shot(e.weapon, d, 0);
      if (!mine || S.thirdPerson) { fx.muzzle(e.a.x, e.a.y, e.a.z, 1.0); if (d < 240) fx.tracer(e.a, e.b); }
      else if (!local) { fx.tracer({ x: cp.x + 0.18, y: cp.y - 0.22, z: cp.z }, e.b); }
      if (e.surface === 'body') fx.burst('blood', e.b.x, e.b.y, e.b.z); else if (e.surface === 'world') fx.burst('wall', e.b.x, e.b.y, e.b.z);
      if (mine && !local) { S.kick = 1; S.shake = Math.max(S.shake, e.weapon === 0 ? 0.6 : 0.25); S.flash = 0.07; }
    } else if (e.t === 'hit') {
      if (e.a === me.id) { hud.hitMarker(e.head); e.head ? audio.head() : audio.hit(); }
      if (e.v === me.id) { hud.damage(); audio.hurt(); S.shake = Math.max(S.shake, 0.5); }
    } else if (e.t === 'kill') {
      const k = sim.units[e.k], v = sim.units[e.v];
      hud.feed(`<b class="${k.team ? 'b' : 'a'}">${k.label}</b> ▸ ${WEAPONS[e.w].name}${e.head ? ' ◎' : ''} ▸ <b class="${v.team ? 'b' : 'a'}">${v.label}</b>`, '', k === me || v === me);
      if (k === me) { audio.kill(); hud.message('처치', 900); S.stats.k0++; }
    } else if (e.t === 'cap') {
      const mine = e.o === 0, L = 'ABCDE'[e.i], p = sim.pts[e.i];
      if (e.o >= 0) {   // 점령 연출: 큰 글자 + 충격파 + 종이조각
        const col = e.o === 0 ? COL_A : COL_B;
        hud.banner(mine ? `거점 ${L} 점령!` : `거점 ${L} 빼앗김!`, mine ? '#8fb4ff' : '#ff8a5a'); audio.cap(mine);
        pointViews.pulse(e.i, col); fx.confetti(p.x, p.y + 0.4, p.z, col);
      } else if (e.prev === 0) { hud.banner(`거점 ${L} 위험!`, '#ffd36a'); }
    } else if (e.t === 'heal') {
      fx.healBurst(e.x, e.y, e.z); if (Math.hypot(e.x - camera.position.x, e.z - camera.position.z) < 30) audio.heal();
      if (e.id === me.id) hud.message('치료 팩 사용', 1200);
    } else if (e.t === 'build') {
      if (role === 'client') world.addDynamic(e.x, e.z, e.sx, e.sz, e.h, 1, e.i);
      addBuildMesh(e.i); if (Math.hypot(e.x - camera.position.x, e.z - camera.position.z) < 40) audio.build();
    } else if (e.t === 'unbuild') {
      if (role === 'client') world.killBox(e.i);
      removeBuildMesh(e.i);
    } else if (e.t === 'reload' && e.id === me.id) audio.reload();
    else if (e.t === 'end') endMatch(e);
    else if (e.t === 'new') { S.over = false; if (me) me.killer = -1; show(null); hud.show(true); hud.message('새 경기 시작', 2500); }
  }
  sim.events.length = 0;
}

function endMatch(e) {
  S.over = true; lockWanted = false; try { document.exitPointerLock(); } catch (x) { /* */ }
  const win = e.w === 0, draw = e.w === 2;
  audio.end(win);
  $('resh').textContent = draw ? '무승부' : win ? '승리' : '패배'; $('resh').style.color = draw ? '#ddd' : win ? 'var(--ok)' : 'var(--bad)';
  $('resp').textContent = e.reason;
  $('resst').innerHTML = [['처치', me.kills], ['사망', me.deaths], ['아군 병력', sim.tickets[0]], ['적 병력', sim.tickets[1]], ['점령 거점', sim.owned(0)]].map(([a, b]) => `<div><b class="num">${b}</b><small>${a}</small></div>`).join('');
  endT = 0;
  setTimeout(() => { if (S.over) { show('res'); hud.show(false); } }, 1800);
}

// ---- 카메라 ----
const tmpV = new THREE.Vector3();
function placeCamera(alpha, dt) {
  const u = me;
  let x = u.x, y = u.y, z = u.z;
  if (S.prev && u.alive) { x = S.prev.x + (u.x - S.prev.x) * alpha; y = S.prev.y + (u.y - S.prev.y) * alpha; z = S.prev.z + (u.z - S.prev.z) * alpha; }
  // 계단을 오를 때 시점이 툭툭 튀지 않게 높이를 부드럽게 따라간다
  if (S.camY === undefined || !u.alive || Math.abs(S.camY - y) > 2) S.camY = y; else S.camY += (y - S.camY) * Math.min(1, dt * 16);
  y = Math.max(S.camY, u.alive ? y - 0.5 : y);
  const speed = u.alive ? u.speedNow : 0;
  if (u.onGround) S.bob += speed * dt * 1.7;
  const bobY = u.onGround ? Math.sin(S.bob * 2) * 0.018 * Math.min(speed / 4.8, 1.2) : 0;
  S.shake = Math.max(0, S.shake - dt * 4);
  S.adsT += ((me.ads && me.alive ? 1 : 0) - S.adsT) * Math.min(1, dt * 12);
  S.kick = Math.max(0, S.kick - dt * 9);
  let fov = 75 - S.adsT * (me.weapon === 0 ? 38 : 24);
  if (u.sprint && speed > 5) fov += 4;
  if (!u.alive && u.killer >= 0 && sim.winner < 0) {
    const k = sim.units[u.killer];
    const dx = k.x - u.x, dz = k.z - u.z;
    camera.position.set(u.x, u.y + 0.45 + Math.min(u.deathAge, 1) * 0.5, u.z);
    camera.rotation.set(-0.15, Math.atan2(-dx, -dz), 0);
    fov = 70;
  } else if (S.thirdPerson) {
    const bx = Math.sin(u.yaw) * 3.2, bz = Math.cos(u.yaw) * 3.2;
    camera.position.set(x + bx, y + 2.1, z + bz); camera.rotation.set(u.pitch - 0.15, u.yaw, 0);
  } else {
    camera.position.set(x, y + EYE + bobY, z);
    const sh = S.shake * 0.012 * (Math.random() - 0.5);
    camera.rotation.set(u.pitch + S.kick * (me.weapon === 0 ? 0.03 : 0.006) + sh, u.yaw + sh, Math.sin(S.bob) * 0.0025 * Math.min(speed, 6) / 5);
  }
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); fx.setScale(renderer.domElement.height, fov); }
  sky.position.copy(camera.position);
  setSun(camera.position.x, camera.position.z);
  // 1인칭 무기
  if (vm) {
    const a = S.adsT, kick = S.kick;
    vm.visible = u.alive && !S.thirdPerson;
    const sway = Math.sin(S.bob) * 0.006 * (1 - a);
    vm.position.set(0.16 * (1 - a) + sway, -0.15 + 0.06 * a + bobY * 0.8, -0.32 - 0.02 + kick * 0.06);
    vm.rotation.set(kick * 0.05 + (u.reloadT > 0 ? -0.5 * Math.sin(Math.min(1, (WEAPONS[u.weapon].reload - u.reloadT) / WEAPONS[u.weapon].reload) * Math.PI) : 0), 0, -0.02 * (1 - a));
    if (u.sprint && speed > 5 && !u.ads) vm.rotation.y = 0.25;
    vmCam.fov = 55 - a * 8; vmCam.updateProjectionMatrix();
    if (vmFlash) { S.flash = Math.max(0, S.flash - dt); vmFlash.visible = S.flash > 0 && u.alive; if (vmFlash.visible) { vmFlash.rotation.z = Math.random() * 6.28; const k = 0.8 + Math.random() * 0.7; vmFlash.scale.set(k, k, 1); } }
  }
}

// ---- 루프 ----
let lastT = performance.now(), stepSnd = 0, fps = 60, demoAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  if (!S.running) {
    demoAcc += dt; let k = 0;
    while (demoAcc >= TICK && k++ < 3) { sim.step(TICK); demoAcc -= TICK; if (sim.winner >= 0) sim.reset(32); }
    sim.events.length = 0;
    demoView(now / 1000, dt);
    unitViews.update(dt, -1, false, demoAcc / TICK); pointViews.update(now / 1000, dt); fx.update(dt);
    renderer.clear(); renderer.render(scene, camera); return;
  }
  if (S.paused && role === 'solo') { renderer.clear(); renderer.render(scene, camera); return; }   // 온라인에서는 멈추지 않는다(다른 사람의 판이 같이 흐른다)
  if (role === 'connecting') { placeCamera(1, dt); unitViews.update(dt, me.id, S.thirdPerson, 1); pointViews.update(now / 1000, dt); fx.update(dt); renderer.clear(); renderer.render(scene, camera); return; }
  if (vmW !== me.weapon) setViewmodel(me.weapon);
  S.accum += dt;
  let n = 0;
  while (S.accum >= TICK && n++ < 5) {
    S.prev = { x: me.x, y: me.y, z: me.z };
    applyInput();
    if (role === 'client') clientStep(); else hostStep();
    S.accum -= TICK;
    onEvents();
  }
  if (S.accum > TICK) S.accum = 0;
  if (role === 'client' && n === 0) for (const u of sim.units) if (!u.alive) u.deathAge += 0;   // (자리 표시)
  if (role === 'client' && performance.now() % 1000 < 20) net.watch();
  placeCamera(S.accum / TICK, dt);
  // 발소리
  if (me.alive && me.onGround && me.speedNow > 1.5) { stepSnd += me.speedNow * dt; if (stepSnd > 2.3) { stepSnd = 0; audio.step(); } }
  const t = performance.now() / 1000;
  sky.material.uniforms.time.value = t;
  unitViews.update(dt, me.id, S.thirdPerson, role === 'client' ? Math.min(1, (performance.now() - S.lastSnapAt) / S.snapGap) : S.accum / TICK); pointViews.update(t, dt); fx.update(dt);
  hud.net(role === 'solo' ? '오프라인' : `온라인 · ${role === 'hub' ? net.humans : hubHumans}명 접속`);
  hud.update(dt, sim, me, { world, trenchX: TRENCH_X });
  hud.death(sim, me, me.killer >= 0 ? sim.units[me.killer] : null);
  hud.scoreboard(keys.has('Tab') && !S.over, sim, me);
  const sp = Math.min(me.speedNow, 6) * 4 + 12 + (me.ads ? -8 : 0);
  hud.el.cross.style.transform = `scale(${sp / 20})`; hud.el.cross.style.opacity = me.alive && S.adsT < 0.6 ? '1' : '0';
  if ($('dbg').style.display === 'block') $('dbg').textContent = `${fps.toFixed(0)}fps  draw ${renderer.info.render.calls}  tri ${renderer.info.render.triangles}  pos ${me.x.toFixed(1)},${me.y.toFixed(1)},${me.z.toFixed(1)}`;
  renderer.clear(); renderer.render(scene, camera);
  if (vm?.visible) { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
}

// ---- 한 틱 진행: 판을 돌리는 쪽(혼자 하기 포함) ----
function hostStep() {
  sim.step(TICK); tickN++;
  if (role !== 'hub') return;
  if (sim.winner >= 0) { endT += TICK; if (endT > 10) { endT = 0; sim.rematch(); } }
  if (sim.events.length) net.bcast('r', { t: 'e', ev: sim.events });
  if (tickN % 2 === 0) net.bcast('u', makeSnap(sim, tickN, net.humans));
  if (tickN % 30 === 0) {
    net.bcast('r', makeScore(sim)); net.hubTick();
    for (const u of sim.units) if (u.orphan > 0 && --u.orphan <= 0 && u.remote && !u.inp) { u.remote = false; u.isBot = true; u.label = (u.team === 0 ? 'A' : 'B') + u.id; }
  }
}
// ---- 한 틱 진행: 다른 사람이 판을 돌릴 때(내 움직임만 계산해 보낸다) ----
function clientStep() {
  const dt = TICK, w = WEAPONS[me.weapon];
  for (const u of sim.units) if (!u.alive) u.deathAge += dt;
  me.fireCd = Math.max(0, me.fireCd - dt);
  if (!me.alive) me.respawnT = Math.max(0, me.respawnT - dt);
  else {
    sim.integrate(me, dt);
    if (me.fire && me.fireCd <= 0 && me.reloadT <= 0 && me.ammo > 0 && (w.auto || !me.trigger)) { me.fireCd = w.cd; me.ammo--; localShotFx(w); }
  }
  me.trigger = me.fire;
  if (me.reload) { S.rlT = 3; me.reload = false; }
  const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
  net.sendInput({ t: 'in', x: r2(me.x), y: r2(me.y), z: r2(me.z), yaw: r3(me.yaw), pitch: r3(me.pitch), fire: me.fire ? 1 : 0, ads: me.ads ? 1 : 0, sp: me.sprint && me.moveY > 0 ? 1 : 0, og: me.onGround ? 1 : 0, c: me.loadout, ab: S.abT-- > 0 ? 1 : 0, rl: S.rlT-- > 0 ? 1 : 0, sn: S.sn });
}
// 내 사격은 누르는 순간 바로 보이고 들리게 한다(판정은 판을 돌리는 쪽이 한다)
function localShotFx(w) {
  const cp = camera.position, cy = Math.cos(me.pitch);
  const dx = -Math.sin(me.yaw) * cy, dy = Math.sin(me.pitch), dz = -Math.cos(me.yaw) * cy;
  const R = w.range, f = world.rayBlock(cp.x, cp.y, cp.z, cp.x + dx * R, cp.y + dy * R, cp.z + dz * R) * R;
  fx.tracer({ x: cp.x + dx * 0.9 + Math.cos(me.yaw) * 0.18, y: cp.y + dy * 0.9 - 0.22, z: cp.z + dz * 0.9 - Math.sin(me.yaw) * 0.18 }, { x: cp.x + dx * f, y: cp.y + dy * f, z: cp.z + dz * f });
  if (S.thirdPerson) fx.muzzle(cp.x + dx, cp.y + dy - 0.2, cp.z + dz, 1);
  audio.shot(me.weapon, 0, 0); S.kick = 1; S.shake = Math.max(S.shake, me.weapon === 0 ? 0.6 : 0.25); S.flash = 0.07;
}

// 메뉴 뒤 배경: 병사들이 가장 모여 싸우는 곳을 천천히 돌며 보여 준다. 대상은 자주 바꾸지 않고, 카메라는 시간 기준으로 부드럽게 따라간다.
const demo = { lead: -1, since: -99, init: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), cx: 0, cz: 0 };
function demoView(t, dt) {
  const al = sim.units.filter((u) => u.alive);
  const dens = (u) => { let n = 0; for (const v of al) if (Math.hypot(v.x - u.x, v.z - u.z) < 11) n++; return n; };
  const cur = demo.lead >= 0 && sim.units[demo.lead].alive ? sim.units[demo.lead] : null;
  if (!cur || t - demo.since > 14) {
    let best = null, bn = -1; for (const u of al) { const n = dens(u); if (n > bn) { bn = n; best = u; } }
    if (best && (!cur || bn > dens(cur) * 1.3 + 1)) { demo.lead = best.id; demo.since = t; }
    else demo.since = t;
  }
  const L = demo.lead >= 0 ? sim.units[demo.lead] : null;
  if (L && L.alive) {
    let cx = 0, cz = 0, n = 0; for (const v of al) if (Math.hypot(v.x - L.x, v.z - L.z) < 11) { cx += v.x; cz += v.z; n++; }
    const kc = 1 - Math.exp(-Math.min(dt, 0.1) * 1.2);
    demo.cx += ((cx / n) - demo.cx) * (demo.init ? kc : 1); demo.cz += ((cz / n) - demo.cz) * (demo.init ? kc : 1);
  }
  const a = t * 0.06;
  const tx = demo.cx + Math.sin(a) * 12, tz = demo.cz + Math.cos(a) * 10, ty = world.heightAt(tx, tz) + 3.0;
  // 피사체가 화면 오른쪽에 오도록(글자 영역을 피해) 살짝 비껴 본다
  const tgt = new THREE.Vector3(tx, ty, tz), lk = new THREE.Vector3(demo.cx + Math.cos(a) * 4.5, world.heightAt(demo.cx, demo.cz) + 1.2, demo.cz - Math.sin(a) * 4.5);
  if (!demo.init) { demo.pos.copy(tgt); demo.look.copy(lk); demo.init = true; }
  else { const k = 1 - Math.exp(-Math.min(dt, 0.1) * 2.2); demo.pos.lerp(tgt, k); demo.look.lerp(lk, k); }
  if (camera.fov !== 58) { camera.fov = 58; camera.updateProjectionMatrix(); fx.setScale(renderer.domElement.height, 58); }
  camera.position.copy(demo.pos); camera.lookAt(demo.look);
  sky.position.copy(camera.position); setSun(demo.pos.x, demo.pos.z);
}

setQuality(1);
$('go').disabled = false; loadBar('출격');
window.__game = { net: () => ({ role, humans: role === 'hub' ? net.humans : hubHumans, me: me && me.id, alive: me && me.alive, tickN, time: sim.time, units: sim.units.filter((u) => !u.isBot).map((u) => [u.id, u.label, u.remote ? 1 : 0]) }), sim, scene, camera, renderer, S, hud, fx, keys, get me() { return me; }, start, setView(x, z, yaw = 0, pitch = 0) { me.x = x; me.z = z; me.y = world.heightAt(x, z); me.yaw = yaw; me.pitch = pitch; S.prev = null; } };
window.__ready = true;
for (let i = 0; i < 30 * 25; i++) sim.step(TICK);   // 로비 배경: 이미 교전이 벌어진 상태에서 시작
sim.events.length = 0;
requestAnimationFrame(frame);
show('menu');
if (q.get('auto')) { if (q.get('qual')) $('qual').value = q.get('qual'); if (q.get('weapon')) S.loadout = +q.get('weapon'); if (q.get('bots')) $('per').value = q.get('bots'); start(); }

addEventListener('pagehide', () => net.close());
