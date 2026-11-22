// 부팅: 엔진, 물리, 조명, 후처리, 월드 조립.
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
import { Character } from './character.js';
import { Input, Player } from './player.js';
const B = window.BABYLON;

const $ = (id) => document.getElementById(id);
const setProgress = (p, text) => { $('bar').style.width = Math.round(p * 100) + '%'; if (text) $('loadText').textContent = text; };

async function boot() {
  // 로딩 단계별 걸린 시간(ms). 콘솔에서 __game.timing 으로 볼 수 있다.
  const timing = {}, t0 = performance.now();
  let tPrev = t0;
  const mark = (k) => { const n = performance.now(); timing[k] = Math.round(n - tPrev); tPrev = n; };
  const canvas = $('game');
  const isTouch = matchMedia('(pointer: coarse)').matches;
  const params = new URLSearchParams(location.search);
  const quality = params.get('q') || (isTouch ? 'low' : 'high');
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
  const residents = new Residents(scene, groundY);
  const player = new Player(scene, input, character, spawn, garage);
  const police = new Police({ scene, assets, garage, player, jobs: null, height });
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
  interiors.init(player, jobs);
  player.onUse = () => (health && health.use()) || interiors.use() || jobs.use(); // 문 앞에서는 드나들기가 먼저다
  let health = null;
  const weapons = new Weapons({ scene, player, garage, residents, dynamics: town.dynamics, addShadow: (ms) => ms.forEach((m) => { fixedCasters.push(m); rl.push(m); }) });
  police.weapons = weapons;
  interiors.weapons = weapons;
  weapons.toast = (text, good) => jobs.toast(text, good);
  weapons.onCrime = (amount) => police.report(amount);
  health = new Health({ player, jobs, garage, residents, police, interiors, weapons });
  mark('actors');
  const map = new MapView(() => ({
    x: (interiors.where() || player.feet).x, z: (interiors.where() || player.feet).z, yaw: player.vehicle ? player.vehicle.yaw : character.heading, target: jobs.target,
    pads: [
      ...jobs.pads.map((p) => ({ x: p.s.x, z: p.s.z, color: p.color, name: p.name })),
      ...interiors.homes.filter((d) => interiors.owned.has(d.id)).map((d) => ({ x: d.x, z: d.z, color: '#57c27a', name: '내 집' })),
      ...police.marks().map((m) => ({ x: m.x, z: m.z, color: '#2f6bff', name: '' })),
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
  const tick = (dt) => {
    town.update(dt);
    cullT -= dt;
    if (cullT <= 0 || assets.activeInterior !== lastInterior) { cullT = 0.3; lastInterior = assets.activeInterior; assets.cull(scene.activeCamera.position, rl, fixedCasters); }
    garage.frame();
    const car = player.vehicle;
    residents.update(dt, { pos: player.feet, vel: car ? car.body.getLinearVelocity() : player.vel, active: !car && !player.inside, wanted: police.level }, garage.cars);
    jobs.update(dt);
    map.update(dt);
    weapons.update(dt, map.open);
    police.update(dt);
    health.update(dt);
    interiors.update(dt);
    const text = health.prompt() || interiors.prompt() || jobs.prompt() || (car ? (Math.abs(car.speed) < 6 ? '내리기' : '') : player.nearCar ? '타기' : '');
    if (text !== promptText) {
      promptText = text;
      prompt.hidden = !text;
      $('promptText').textContent = text;
      $('btnUse').textContent = text.length > 6 ? text.slice(0, 6) : text || '타기';
      $('btnUse').style.visibility = text ? 'visible' : 'hidden';
      document.body.classList.toggle('driving', !!car);
    }
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
  window.__game = { engine, scene, player, assets, height, groundY, env, csm, pipe, sim, input, garage, residents, jobs, town, map, timing, weapons, police, interiors, health };
  mark('map+fx');
  await scene.whenReadyAsync();
  mark('shaders');
  timing.total = Math.round(performance.now() - t0);
  engine.runRenderLoop(() => scene.render());
  setProgress(1, '준비 완료');
  $('loading').classList.add('done');
  $('hud').hidden = false;
  if (isTouch) document.body.classList.add('touch');
  window.__ready = true;
}

boot().catch((e) => {
  console.error(e);
  $('loadText').textContent = '실행하지 못했습니다: ' + (e.message || e);
  window.__ready = true;
});
