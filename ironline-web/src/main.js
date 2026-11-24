// Ironline (web): 게임 루프, 입력, 카메라, 이벤트 → 효과 연결.
import * as THREE from 'three';
import { Sim, TICK, WEAPONS, EYE } from './sim.js';
import { TRENCH_X } from './world.js';
import { makeSky, buildTerrain, makeBoxProps, makeHouses, textureLoader, sandbagTexture, HAZE } from './gfx.js';
import { Models, Batch, scatter, modelNames, setDecorStyle } from './decor.js';
import { UnitViews, PointViews, makeViewmodel } from './units.js';
import { Fx } from './fx.js';
import { Audio } from './audio.js';
import { Hud } from './hud.js';

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
const sim = new Sim(SEED, 16, TS !== 'block');
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
WEAPONS.forEach((w, i) => {
  const b = document.createElement('button'); b.className = 'wp' + (i === 0 ? ' on' : ''); b.type = 'button';
  b.innerHTML = `<b>${i + 1}. ${w.name}</b><small>피해 ${w.dmg} · 탄창 ${w.mag}발 · ${w.auto ? '연사' : '단발'}<br>사거리 ${w.range}m</small>`;
  b.onclick = () => { S.loadout = i; [...wps.children].forEach((c, k) => c.classList.toggle('on', k === i)); };
  wps.appendChild(b);
});
function show(id) { for (const k of ['menu', 'pause', 'res']) $(k).style.display = k === id ? '' : 'none'; $('overlay').classList.toggle('on', !!id); }

function start() {
  audio.mute = $('snd').value === '0'; audio.init();
  S.sens = +$('sens').value; setQuality(+$('qual').value);
  const per = +$('per').value;
  sim.reset(per);
  scene.remove(unitViews.group);
  unitViews = new UnitViews(scene, sim);
  me = sim.units[0]; sim.claim(0, S.loadout, '나');
  Object.assign(S, { running: true, paused: false, accum: 0, prev: null, kick: 0, adsT: 0, over: false, shake: 0 });
  S.stats = { k0: 0 };
  setViewmodel(me.weapon);
  show(null); hud.show(true); hud.message('거점 B 를 점령하며 전진하세요', 3000);
  requestLock();
}
function requestLock() { lockWanted = true; try { const p = canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch (e) { /* 헤드리스 등 */ } }
$('go').onclick = start; $('again').onclick = start;
$('resume').onclick = () => { S.paused = false; show(null); requestLock(); };
$('quit').onclick = $('tomenu').onclick = () => { S.running = false; hud.show(false); show('menu'); try { document.exitPointerLock(); } catch (e) { /* */ } };
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked && S.running && !S.over && lockWanted && !q.get('auto')) { S.paused = true; show('pause'); }
});

// ---- 입력 ----
const down = { l: false, r: false };
addEventListener('keydown', (e) => {
  if (!S.running || S.paused) return;
  keys.add(e.code);
  if (e.code === 'Tab') { e.preventDefault(); }
  if (/^Digit[123]$/.test(e.code) && me.alive) { const w = +e.code[5] - 1; me.weapon = w; me.loadout = w; me.ammo = WEAPONS[w].mag; me.reloadT = 0; me.fireCd = 0.35; setViewmodel(w); }
  if (e.code === 'KeyR') me.reload = true;
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
addEventListener('wheel', (e) => { if (!S.running || !me?.alive) return; const w = (me.weapon + (e.deltaY > 0 ? 1 : 2)) % 3; keys.add('Digit' + (w + 1)); dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit' + (w + 1) })); keys.delete('Digit' + (w + 1)); });

function applyInput() {
  if (!me.alive) { me.moveX = me.moveY = 0; me.fire = me.jump = me.sprint = me.ads = false; return; }
  const k = (c) => keys.has(c) ? 1 : 0;
  me.moveX = k('KeyD') - k('KeyA'); me.moveY = k('KeyW') - k('KeyS');
  me.jump = keys.has('Space'); me.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  me.fire = down.l; me.ads = down.r;
}

function setViewmodel(w) {
  if (vm) vmScene.remove(vm);
  vm = makeViewmodel(w); vmW = w; vmScene.add(vm);
}

// ---- 이벤트 → 효과 ----
function onEvents() {
  const cp = camera.position;
  for (const e of sim.events) {
    if (e.t === 'shot') {
      const mine = e.id === me.id, d = Math.hypot(e.a.x - cp.x, e.a.z - cp.z);
      if (d < 220) audio.shot(e.weapon, d, 0);
      if (!mine || S.thirdPerson) { fx.muzzle(e.a.x, e.a.y, e.a.z, 0.8); if (d < 160) fx.tracer(e.a, e.b); }
      else { fx.tracer({ x: cp.x + 0.2, y: cp.y - 0.25, z: cp.z }, e.b); }
      if (e.surface === 'body') fx.burst('blood', e.b.x, e.b.y, e.b.z); else if (e.surface === 'world') fx.burst('wall', e.b.x, e.b.y, e.b.z);
      if (mine) { S.kick = 1; S.shake = Math.max(S.shake, e.weapon === 0 ? 0.6 : 0.25); S.flash = 0.06; }
    } else if (e.t === 'hit') {
      if (e.a === me.id) { hud.hitMarker(e.head); e.head ? audio.head() : audio.hit(); }
      if (e.v === me.id) { hud.damage(); audio.hurt(); S.shake = Math.max(S.shake, 0.5); }
    } else if (e.t === 'kill') {
      const k = sim.units[e.k], v = sim.units[e.v];
      hud.feed(`<b class="${k.team ? 'b' : 'a'}">${k.label}</b> ▸ ${WEAPONS[e.w].name}${e.head ? ' ◎' : ''} ▸ <b class="${v.team ? 'b' : 'a'}">${v.label}</b>`, '', k === me || v === me);
      if (k === me) { audio.kill(); hud.message('처치', 900); S.stats.k0++; }
    } else if (e.t === 'cap') {
      const mine = e.o === 0;
      if (e.o >= 0) { hud.message(`거점 ${'ABCDE'[e.i]} ${mine ? '점령' : '상실'}`, 2400); audio.cap(mine); }
    } else if (e.t === 'reload' && e.id === me.id) audio.reload();
    else if (e.t === 'end') endMatch(e);
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
  setTimeout(() => { show('res'); hud.show(false); }, 1800);
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
  sun.target.position.set(camera.position.x, 0, camera.position.z);
  sun.position.copy(sun.target.position).addScaledVector(SUN, 120);
  // 1인칭 무기
  if (vm) {
    const a = S.adsT, kick = S.kick;
    vm.visible = u.alive && !S.thirdPerson;
    const sway = Math.sin(S.bob) * 0.006 * (1 - a);
    vm.position.set(0.16 * (1 - a) + sway, -0.15 + 0.06 * a + bobY * 0.8, -0.32 - 0.02 + kick * 0.06);
    vm.rotation.set(kick * 0.05 + (u.reloadT > 0 ? -0.5 * Math.sin(Math.min(1, (WEAPONS[u.weapon].reload - u.reloadT) / WEAPONS[u.weapon].reload) * Math.PI) : 0), 0, -0.02 * (1 - a));
    if (u.sprint && speed > 5 && !u.ads) vm.rotation.y = 0.25;
    vmCam.fov = 55 - a * 8; vmCam.updateProjectionMatrix();
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
    while (demoAcc >= TICK && k++ < 3) { sim.step(TICK); demoAcc -= TICK; if (sim.winner >= 0) sim.reset(16); }
    sim.events.length = 0;
    demoView(now / 1000);
    unitViews.update(dt, -1, false); pointViews.update(now / 1000); fx.update(dt);
    renderer.clear(); renderer.render(scene, camera); return;
  }
  if (S.paused) { renderer.clear(); renderer.render(scene, camera); return; }
  if (vmW !== me.weapon) setViewmodel(me.weapon);
  S.accum += dt;
  let n = 0;
  while (S.accum >= TICK && n++ < 5) {
    S.prev = { x: me.x, y: me.y, z: me.z };
    applyInput(); sim.step(TICK); S.accum -= TICK;
    onEvents();
  }
  if (S.accum > TICK) S.accum = 0;
  placeCamera(S.accum / TICK, dt);
  // 발소리
  if (me.alive && me.onGround && me.speedNow > 1.5) { stepSnd += me.speedNow * dt; if (stepSnd > 2.3) { stepSnd = 0; audio.step(); } }
  const t = performance.now() / 1000;
  sky.material.uniforms.time.value = t;
  unitViews.update(dt, me.id, S.thirdPerson); pointViews.update(t); fx.update(dt);
  hud.update(dt, sim, me, { world, trenchX: TRENCH_X });
  hud.death(sim, me, me.killer >= 0 ? sim.units[me.killer] : null);
  hud.scoreboard(keys.has('Tab') && !S.over, sim, me);
  const sp = Math.min(me.speedNow, 6) * 4 + 12 + (me.ads ? -8 : 0);
  hud.el.cross.style.transform = `scale(${sp / 20})`; hud.el.cross.style.opacity = me.alive && S.adsT < 0.6 ? '1' : '0';
  if ($('dbg').style.display === 'block') $('dbg').textContent = `${fps.toFixed(0)}fps  draw ${renderer.info.render.calls}  tri ${renderer.info.render.triangles}  pos ${me.x.toFixed(1)},${me.y.toFixed(1)},${me.z.toFixed(1)}`;
  renderer.clear(); renderer.render(scene, camera);
  if (vm?.visible) { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
}

// 메뉴 뒤 배경: 전장 위를 천천히 도는 카메라
const demoC = { x: 0, z: 8 };
function demoView(t) {
  // 교전이 가장 많은 쪽(살아 있는 병사들의 중심)을 천천히 돌며 보여 준다
  let sx = 0, sz = 0, n = 0;
  for (const u of sim.units) if (u.alive) { sx += u.x; sz += u.z; n++; }
  if (n) { demoC.x += (sx / n - demoC.x) * 0.02; demoC.z += (sz / n - demoC.z) * 0.02; }
  const a = t * 0.07, r = 24;
  const x = demoC.x + Math.sin(a) * r, z = demoC.z + Math.cos(a) * r * 0.7;
  camera.position.set(x, world.heightAt(x, z) + 6, z);
  camera.lookAt(demoC.x, world.heightAt(demoC.x, demoC.z) + 1.2, demoC.z);
  sky.position.copy(camera.position); sun.target.position.set(x, 0, z); sun.position.copy(sun.target.position).addScaledVector(SUN, 120);
}

setQuality(1);
$('go').disabled = false; loadBar('출격');
window.__game = { sim, scene, camera, renderer, S, hud, fx, keys, get me() { return me; }, start, setView(x, z, yaw = 0, pitch = 0) { me.x = x; me.z = z; me.y = world.heightAt(x, z); me.yaw = yaw; me.pitch = pitch; S.prev = null; } };
window.__ready = true;
requestAnimationFrame(frame);
show('menu');
if (q.get('auto')) { if (q.get('qual')) $('qual').value = q.get('qual'); if (q.get('weapon')) S.loadout = +q.get('weapon'); if (q.get('bots')) $('per').value = q.get('bots'); start(); }
