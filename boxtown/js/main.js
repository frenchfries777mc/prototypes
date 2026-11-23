// 부팅: 엔진, 물리, 조명, 후처리, 월드 조립.
import { SITES } from './world.js';
import { Assets } from './assets.js';
import { buildTerrain, buildWater, buildSky, height, initGrid } from './terrain.js';
import { buildTown, groundY, ROAD_Y } from './town.js';
import { modelKeys, carKeys, SPAWN, PARKED, CELL } from './mapdata.js';
import { Garage } from './vehicles.js';
import { Residents } from './npc.js';
import { Jobs } from './jobs.js';
import { MapView } from './map.js';
import { Weapons } from './weapons.js';
import { Police } from './police.js';
import { Health } from './health.js';
import { Train } from './train.js';
import { Traffic } from './traffic.js';
import { Music } from './music.js';
import { Wardrobe } from './cosmetics.js';
import { Lobby } from './lobby.js';
import { Net } from './net.js';
import { stats } from './stats.js';
import { islandAt } from './terrain.js';
import { Character } from './character.js';
import { Input, Player } from './player.js';
const B = window.BABYLON;

const $ = (id) => document.getElementById(id);
// 글자를 입력하는 칸에서 누른 키는 게임 단축키(E, C, M, N…)로 새지 않게 막고, 그 칸에만 따로 알려 준다.
addEventListener('keydown', (e) => {
  const t = e.target;
  if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
  e.stopPropagation();
  t.dispatchEvent(new CustomEvent('inputkey', { detail: e.key, bubbles: true }));
}, true);
const setProgress = (p, text) => { $('bar').style.width = Math.round(p * 100) + '%'; if (text) $('loadText').textContent = text; };

async function boot() {
  // 로딩 단계별 걸린 시간(ms). 콘솔에서 __game.timing 으로 볼 수 있다.
  const timing = {}, t0 = performance.now();
  let tPrev = t0;
  const mark = (k) => { const n = performance.now(); timing[k] = Math.round(n - tPrev); tPrev = n; };
  const canvas = $('game');
  const isTouch = matchMedia('(pointer: coarse)').matches;
  const params = new URLSearchParams(location.search);
  let savedQ = null; try { savedQ = localStorage.getItem('boxtown.quality'); } catch (e) { /* 무시 */ }
  const quality = params.get('q') || savedQ || (isTouch ? 'low' : 'high');
  const engine = new B.Engine(canvas, false, { stencil: false, powerPreference: 'high-performance' });
  engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio || 1, quality === 'low' ? 1.25 : 1.5));
  B.Scene.MaxDeltaTime = 50; // 프레임이 심하게 끊겨도 물리 한 스텝은 0.05초를 넘지 않는다
  const scene = new B.Scene(engine);
  scene.skipPointerMovePicking = true;
  scene.autoClear = true;

  // 분위기의 기준이 되는 값들. 하늘·안개·물이 같은 색을 공유해야 화면이 한 덩어리로 보인다.
  const env = {
    sunDir: new B.Vector3(0.48, 0.62, -0.62).normalize(), // 태양이 있는 방향
    zenith: B.Color3.FromHexString('#3f8fe8'),
    horizon: B.Color3.FromHexString('#cfeaf7'),
    fog: B.Color3.FromHexString('#c3e2f2'),
    fogDensity: 0.00135,
  };
  scene.clearColor = new B.Color4(env.fog.r, env.fog.g, env.fog.b, 1);
  scene.ambientColor = new B.Color3(0.1, 0.12, 0.17);
  scene.fogMode = B.Scene.FOGMODE_EXP2;
  scene.fogColor = env.fog;
  scene.fogDensity = env.fogDensity;

  setProgress(0.03, '물리 엔진 준비 중');
  const hk = await window.HavokPhysics();
  scene.enablePhysics(new B.Vector3(0, -24, 0), new B.HavokPlugin(true, hk));

  const hemi = new B.HemisphericLight('hemi', new B.Vector3(0.1, 1, -0.1), scene);
  hemi.intensity = 0.62;
  hemi.diffuse = B.Color3.FromHexString('#eaf3ff');
  hemi.groundColor = B.Color3.FromHexString('#8c9bb3');
  hemi.specular = B.Color3.Black();
  const sun = new B.DirectionalLight('sun', env.sunDir.scale(-1), scene);
  sun.intensity = 0.92;
  sun.diffuse = B.Color3.FromHexString('#fff1d6');
  sun.specular = B.Color3.FromHexString('#fff1d6');

  mark('engine');
  setProgress(0.06, '에셋 불러오는 중');
  const assets = new Assets(scene);
  await assets.load(modelKeys(), (p) => setProgress(0.06 + p * 0.55));
  await Promise.all(carKeys().map((k) => assets.loadCar(k)));
  setProgress(0.66);

  mark('assets');
  setProgress(0.68, '섬과 바다 만드는 중');
  await new Promise((r) => setTimeout(r, 0));
  initGrid();
  mark('heightGrid');
  const chunks = buildTerrain(scene);
  mark('terrainMesh');
  for (const chunk of chunks) new B.PhysicsAggregate(chunk, B.PhysicsShapeType.MESH, { mass: 0, friction: 0.8 }, scene);
  mark('terrainPhysics');
  buildSky(scene, env);
  buildWater(scene, env);

  setProgress(0.82, '마을 세우는 중');
  await new Promise((r) => setTimeout(r, 0));
  const town = buildTown(scene, assets, mark);
  mark('town.rest');

  const character = new Character(scene);
  const input = new Input(canvas);
  const spawn = { ...SPAWN, y: groundY(SPAWN.x, SPAWN.z) };
  const garage = new Garage(scene, assets, PARKED, CELL, ROAD_Y, height);
  garage.addBoats(scene, assets, town.boatSpots);
  const residents = new Residents(scene, groundY, 24);
  const player = new Player(scene, input, character, spawn, garage);
  const police = new Police({ scene, assets, garage, player, jobs: null, height, groundY });
  const interiors = town.interiors;
  scene.activeCamera = player.cam;

  // 그림자: 가까운 곳은 선명하게, 먼 곳은 넓게 덮는 단계별 그림자.
  const csm = new B.CascadedShadowGenerator(quality === 'low' ? 1024 : 2048, sun);
  csm.numCascades = quality === 'low' ? 3 : 4;
  csm.shadowMaxZ = quality === 'low' ? 150 : 240;
  csm.lambda = 0.82;
  csm.stabilizeCascades = true;
  csm.cascadeBlendPercentage = 0.05;
  csm.bias = 0.003;
  csm.normalBias = 0.012;
  csm.filteringQuality = B.ShadowGenerator.QUALITY_MEDIUM;
  csm.usePercentageCloserFiltering = true;
  csm.setDarkness(0.32);
  const rl = csm.getShadowMap().renderList;
  // 그림자를 드리우는 것: 늘 있는 것(캐릭터, 차, 움직이는 소품) + 카메라 근처 구역의 건물과 나무
  assets.shadowRange = quality === 'low' ? 110 : 185;
  const fixedCasters = [...assets.shadowCasters, ...town.casters, ...character.meshes, ...residents.meshes];
  assets.cull(player.cam.position, rl, fixedCasters);
  let cullT = 0, lastInterior = null;

  // 간호사 일은 병원 안에서 시작한다.
  { const r = interiors.rooms.hospital; town.jobSites.nurse = { x: r.cx + 1.5, z: r.cz + 0.3, y: r.y0, room: r }; }
  const jobs = new Jobs({ scene, player, garage, assets, groundY, sites: town.jobSites, docks: town.docks, addShadow: (ms) => ms.forEach((m) => { fixedCasters.push(m); rl.push(m); }) });
  police.jobs = jobs;
  // 치장품: 새로 단 부품도 그림자를 드리우게 목록을 고쳐 준다.
  character.onMeshes = (old, added) => {
    for (const o of old) for (const list of [fixedCasters, rl]) { const k = list.indexOf(o); if (k >= 0) list.splice(k, 1); }
    for (const a of added) { fixedCasters.push(a); rl.push(a); }
  };
  const wardrobe = new Wardrobe({ character, player, jobs });
  interiors.wardrobe = wardrobe;
  interiors.init(player, jobs);
  let train0 = null, traffic0 = null;
  player.onUse = () => (train0 && train0.use()) || (health && health.use()) || interiors.use() || jobs.use() || (traffic0 && traffic0.use()); // 문 앞에서는 드나들기가 먼저다
  let health = null;
  const weapons = new Weapons({ scene, player, garage, residents, dynamics: town.dynamics, addShadow: (ms) => ms.forEach((m) => { fixedCasters.push(m); rl.push(m); }) });
  police.weapons = weapons;
  interiors.weapons = weapons;
  weapons.toast = (text, good) => jobs.toast(text, good);
  weapons.onCrime = (amount) => police.report(amount);
  health = new Health({ player, jobs, garage, residents, police, interiors, weapons });
  const train = new Train({ scene, player, jobs, assets, garage, sfx: weapons.sfx, lazyCollider: town.lazyCollider, addShadow: (ms) => ms.forEach((m) => { fixedCasters.push(m); rl.push(m); }) });
  train0 = train;
  const traffic = new Traffic({ scene, assets, player, garage, residents, police, jobs, weapons, health, addShadow: (ms) => ms.forEach((m) => { fixedCasters.push(m); rl.push(m); }) });
  weapons.traffic = traffic; traffic0 = traffic;
  // 배경 음악: 수배 > 내 집 > 건물 안 > 배 위 > 시골 지역 > 다른 섬 > 시작 대륙
  const RURAL = ['farm', 'wind', 'camp', 'lake', 'lookout', 'mill', 'cabinA', 'cabinB', 'cabinC', 'cabinD', 'woods'].map((k) => SITES[k]).filter(Boolean);
  const music = new Music(() => {
    if (police.level > 0) return 'wanted';
    if (interiors.inside) return interiors.inside.house ? 'home' : 'indoor';
    if (player.vehicle && player.vehicle.isBoat) return 'folk';
    const fx = player.feet.x, fz = player.feet.z;
    if (RURAL.some((s) => Math.hypot(s.x - fx, s.z - fz) < s.r + 70)) return 'folk';
    const id = islandAt(player.feet.x, player.feet.z).id;
    return id === 'main' || id === 'mainland' ? 'land' : 'island';
  });
  train.onHit = (vx, vz, side) => { player.kick = new B.Vector3(vx * 0.6 + Math.sign(side || 1) * 6, 8, vz * 0.6); health.hurt(9999, vx, vz, 'train'); };
  train.onCarHit = (c) => { if (c === player.vehicle) player.shake = 1; };
  mark('actors');
  let netRef = null;
  const map = new MapView(() => ({
    x: (interiors.where() || player.feet).x, z: (interiors.where() || player.feet).z, yaw: player.vehicle ? player.vehicle.yaw : character.heading, target: jobs.target,
    pads: [
      ...jobs.pads.map((p) => ({ x: p.s.x, z: p.s.z, color: p.color, name: p.name })),
      ...interiors.homes.filter((d) => interiors.owned.has(d.id)).map((d) => ({ x: d.x, z: d.z, color: '#57c27a', name: '내 집' })),
      ...police.marks().map((m) => ({ x: m.x, z: m.z, color: '#2f6bff', name: '' })),
      ...(netRef ? netRef.marks().map((m) => ({ x: m.x, z: m.z, color: '#ff5fa2', name: m.name })) : []),
    ],
  }));

  // 후처리: 구석 그늘(SSAO), 밝은 곳 번짐, 대비와 색감.
  let ssao = null;
  if (quality !== 'low' && params.get('ssao') !== '0') {
    ssao = new B.SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.5, blurRatio: 1 }, [player.cam]);
    ssao.radius = 1.6; ssao.totalStrength = 1.15; ssao.base = 0.1; ssao.samples = 16; ssao.maxZ = 220; ssao.minZAspect = 0.4;
    ssao.expensiveBlur = true;
  }
  const pipe = new B.DefaultRenderingPipeline('pipe', true, scene, [player.cam]);
  pipe.fxaaEnabled = true;
  pipe.bloomEnabled = quality !== 'low';
  pipe.bloomThreshold = 0.86; pipe.bloomWeight = 0.28; pipe.bloomKernel = 48; pipe.bloomScale = 0.5;
  pipe.imageProcessingEnabled = true;
  const ip = pipe.imageProcessing;
  ip.contrast = 1.22; ip.exposure = 1.04;
  ip.vignetteEnabled = true; ip.vignetteWeight = 1.1; ip.vignetteStretch = 0.3; ip.vignetteColor = new B.Color4(0.05, 0.1, 0.2, 0);

  // 매 프레임: 마을 장식, 주민, 바퀴, 화면 안내
  const prompt = $('prompt'), speedo = $('speed');
  let promptText = '';
  // 멀티플레이
  const net = new Net({ scene, assets, player, character, wardrobe, weapons, health, train, traffic, local: params.get('net') === 'local',
    addShadow: (ms) => ms.forEach((m) => { fixedCasters.push(m); rl.push(m); }),
    dropShadow: (ms) => { for (const o of ms) for (const list of [fixedCasters, rl]) { const k = list.indexOf(o); if (k >= 0) list.splice(k, 1); } } });
  weapons.net = net; netRef = net;
  wardrobe.onChange = () => net.sendLook();
  const lobby = new Lobby({ player, jobs, wardrobe, music, interiors, input, quality, net });
  setupChat(net, input, lobby);
  stats.onReward = (n) => { jobs.money += n; try { localStorage.setItem('boxtown.money', String(jobs.money)); } catch (e) { /* 무시 */ } jobs.renderMoney(); };
  let useLabel = '', quitT = 0, carShown = -1;
  const carHp = $('carHp');
  $('btnView').addEventListener('click', () => player.nextView());
  const tick = (dt) => {
    town.update(dt);
    cullT -= dt;
    if (cullT <= 0 || assets.activeInterior !== lastInterior) { cullT = 0.3; lastInterior = assets.activeInterior; assets.cull(scene.activeCamera.position, rl, fixedCasters); }
    garage.frame();
    const car = player.vehicle;
    residents.update(dt, { pos: player.feet, vel: car ? car.body.getLinearVelocity() : player.vel, active: !car && !player.inside, car: car && !car.isBoat && !player.inside ? car : null, wanted: police.level }, garage.cars);
    jobs.update(dt);
    map.update(dt);
    weapons.update(dt, map.open || !!player.riding);
    police.update(dt);
    health.update(dt);
    train.update(dt);
    traffic.blocked = train.closed;
    traffic.update(dt);
    music.update(dt);
    interiors.update(dt);
    lobby.update(dt);
    net.update(dt);
    const text = train.prompt() || health.prompt() || interiors.prompt() || jobs.prompt() || (car ? (Math.abs(car.speed) < 6 ? '내리기' : '') : player.nearCar ? '타기' : traffic.prompt());
    if (text !== promptText) {
      promptText = text;
      prompt.hidden = !text;
      $('promptText').textContent = text;
      useLabel = '';
      document.body.classList.toggle('driving', !!car);
    }
    // 모바일 상호작용 버튼: 할 일이 있으면 그 이름을, 일하는 중에 달리 할 게 없으면 '일 끝내기(길게)'를 보여 준다.
    const quitable = !text && !!jobs.active && !car;
    const label = text ? (text.length > 7 ? text.slice(0, 7) : text) : quitable ? '일 끝내기' : '상호작용';
    if (label !== useLabel) { useLabel = label; $('btnUse').textContent = label; $('btnUse').classList.toggle('idle', !text && !quitable); }
    quitT = quitable && input.touchUse ? quitT + dt : 0;
    if (quitT > 0.7) { quitT = 0; jobs.quit(); }
    // 차 내구도
    const showCar = !!car && !car.isBoat;
    if (carHp.hidden === showCar) carHp.hidden = !showCar;
    if (showCar) { const w = Math.max(0, Math.round(car.hp)); if (w !== carShown) { carShown = w; $('carHpFill').style.width = w + '%'; $('carHpFill').classList.toggle('low', w <= 35); } }
    speedo.hidden = !car;
    if (car) speedo.firstChild.textContent = Math.round(Math.abs(car.speed) * 3.6);
  };
  scene.onBeforeRenderObservable.add(() => tick(Math.min(engine.getDeltaTime() / 1000, 0.05)));

  // 성능이 모자라면 무거운 효과부터 끈다.
  let slow = 0, checked = 0;
  const perf = setInterval(() => {
    if (document.hidden) return;
    checked++;
    if (engine.getFps() < 28) slow++; else slow = 0;
    if (slow >= 3) {
      slow = 0;
      if (ssao) { ssao.dispose(); ssao = null; }
      else if (pipe.bloomEnabled) pipe.bloomEnabled = false;
      else if (engine.getHardwareScalingLevel() < 1.4) engine.setHardwareScalingLevel(engine.getHardwareScalingLevel() * 1.25);
      else clearInterval(perf);
    }
    if (checked > 40) clearInterval(perf);
  }, 2000);

  addEventListener('resize', () => engine.resize());
  addEventListener('keydown', (e) => { if (e.code === 'KeyP') $('fps').hidden = !$('fps').hidden; });
  setInterval(() => { if (!$('fps').hidden) $('fps').textContent = engine.getFps().toFixed(0) + ' fps'; }, 500);

  // 디버그·자동 시험용: 화면을 그리지 않고 seconds초만큼 게임을 진행한다.
  const sim = (seconds, keys = [], jumpAt = -1) => {
    const pe = scene.getPhysicsEngine(), real = engine.getDeltaTime;
    engine.getDeltaTime = () => 1000 / 60;
    keys.forEach((k) => input.keys.add(k));
    const n = Math.round(seconds * 60);
    let maxY = -1e9;
    for (let i = 0; i < n; i++) {
      if (i === Math.round(jumpAt * 60)) input.jumpQueued = true;
      player.fixed();
      pe._step(1 / 60);
      player.step();
      player.frame();
      tick(1 / 60);
      maxY = Math.max(maxY, player.feet.y);
    }
    keys.forEach((k) => input.keys.delete(k));
    engine.getDeltaTime = real;
    return { feet: player.feet.asArray().map((v) => +v.toFixed(2)), maxY: +maxY.toFixed(2), grounded: player.grounded };
  };
  window.__game = { engine, scene, player, assets, height, groundY, env, csm, pipe, sim, input, garage, residents, jobs, town, map, timing, weapons, police, interiors, health, train, traffic, music, wardrobe, lobby, stats, net };
  mark('map+fx');
  await scene.whenReadyAsync();
  mark('shaders');
  timing.total = Math.round(performance.now() - t0);
  engine.runRenderLoop(() => scene.render());
  setProgress(1, '준비 완료');
  $('loading').classList.add('done');
  $('hud').hidden = false;
  if (params.get('lobby') !== '0') lobby.show();
  if (isTouch) document.body.classList.add('touch');
  window.__ready = true;
  try { sessionStorage.removeItem('boxtown.retry'); } catch (e) { /* 무시 */ }
}

// 채팅과 방 표시: T나 Enter로 입력창을 열고, 방에 있을 때만 보인다.
function setupChat(net, input, lobby) {
  const box = $('netBox'), log = $('chatLog'), form = $('chatForm'), field = $('chatInput'), btn = $('btnChat');
  let fadeT = 0;
  const paint = () => {
    box.hidden = btn.hidden = !net.on;
    if (net.on) box.textContent = `👥 ${net.code} · ${net.count}명`;
    if (!net.on) close();
  };
  const lines = () => {
    log.innerHTML = '';
    for (const l of net.log.slice(-6)) { const p = document.createElement('p'); if (l.who) { const b = document.createElement('b'); b.textContent = l.who + ' '; p.appendChild(b); } else p.className = 'sys'; p.appendChild(document.createTextNode(l.text)); log.appendChild(p); }
    log.classList.add('show'); clearTimeout(fadeT); fadeT = setTimeout(() => { if (form.hidden) log.classList.remove('show'); }, 9000);
  };
  const open = () => { if (!net.on || lobby.open) return; form.hidden = false; input.blocked = true; input.keys.clear(); if (document.pointerLockElement) document.exitPointerLock(); log.classList.add('show'); setTimeout(() => field.focus(), 0); };
  function close() { if (form.hidden) return; form.hidden = true; field.value = ''; field.blur(); if (!lobby.open) input.blocked = false; lines(); }
  net.onChat = lines;
  const prev = net.onChange; net.onChange = () => { paint(); if (prev) prev(); };
  // 입력창에서 누른 키가 게임 단축키(E, C, M…)로 새지 않게 막는다.
  field.addEventListener('inputkey', (e) => { if (e.detail === 'Escape') close(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); net.chat(field.value); close(); });
  addEventListener('keydown', (e) => { if ((e.code === 'KeyT' || e.code === 'Enter') && form.hidden && net.on && !lobby.open) { e.preventDefault(); open(); } });
  btn.addEventListener('click', () => (form.hidden ? open() : close()));
  box.addEventListener('click', () => { lobby.show(); lobby.act('multi'); });
  paint();
}

boot().catch((e) => {
  console.error(e);
  // 업데이트 직후에는 브라우저에 남은 옛 화면 파일과 새 스크립트가 섞여 실패할 수 있다. 한 번은 새 주소로 다시 불러와 본다.
  let tried = false;
  try { tried = sessionStorage.getItem('boxtown.retry') === '1'; sessionStorage.setItem('boxtown.retry', '1'); } catch (err) { tried = true; }
  if (!tried) { $('loadText').textContent = '새 버전을 불러오는 중…'; location.replace(location.pathname + '?fresh=' + Date.now()); return; }
  $('loadText').textContent = '실행하지 못했습니다: ' + (e.message || e);
  window.__ready = true;
});
