// 큰 사건: 몇 분에 한 번 마을에 사건이 터진다. 교통사고 부상자 구조, 건물 화재, 현금 수송차 사고, 낚시 대회.
// 가고 안 가고는 자유고, 해내면 큰 보상과 그 일의 평판이 쌓인다. 방에 친구와 함께 있으면 방장이 정한 사건이 모두에게 같은 자리에 나타나고,
// 가까이서 같이 해내는 친구가 많을수록 보상이 늘어난다(친구 한 명당 +30%, 최대 +90%).
import { spark } from './jobs.js';
import { NAV } from './police.js';
import { Character, randomLook } from './character.js';
import { SEA } from './terrain.js';
import { flatMat } from './util.js';
import { stats } from './stats.js';
import { rep } from './reputation.js';
const B = window.BABYLON;
const dist = (a, x, z) => Math.hypot(a.x - x, a.z - z);
const TYPES = {
  rescue: { name: '교통사고 부상자', icon: '🚑', dur: 120, kind: 'nurse', base: 330, hint: '꾹 눌러 응급처치' },
  fire: { name: '건물 화재', icon: '🔥', dur: 140, kind: 'fire', base: 430, hint: '꾹 눌러 불 끄기 (소방차를 가까이 대면 두 배 빨라요)' },
  cash: { name: '현금 수송차 사고', icon: '💰', dur: 100, kind: '', base: 70, hint: '흩어진 현금 상자를 모두 주우세요' },
  fishing: { name: '낚시 대회', icon: '🎣', dur: 210, kind: 'fish', base: 0, hint: '잔교 끝에서 낚시 일을 하세요' },
};
const FISH_SPOT = { x: 78.2, z: -46.2 };
const NAMES = ['갈매기 선장', '낚시왕 박씨', '물고기 도사'];

export class Events {
  constructor({ scene, player, jobs, interiors, net, groundY }) {
    Object.assign(this, { scene, player, jobs, interiors, net, groundY });
    this.cur = null; this.nextT = 150 + Math.random() * 90; this.hudT = 0; this.lobby = null;
    const pm = new B.StandardMaterial('eventPillar', scene); pm.emissiveColor = new B.Color3(1, 0.35, 0.25); pm.disableLighting = true; pm.alpha = 0.32; pm.fogEnabled = false;
    this.pillar = B.MeshBuilder.CreateCylinder('eventPillar', { diameter: 2.6, height: 80, tessellation: 4 }, scene); this.pillar.material = pm; this.pillar.isPickable = false; this.pillar.setEnabled(false);
    const hud = document.createElement('div'); hud.id = 'eventHud'; hud.hidden = true; document.body.appendChild(hud); this.hud = hud;
    this.fx = []; this.parts = [];
  }

  // ----- 방장(또는 혼자)이 사건을 고른다 -----
  pickSite(type) {
    const P = this.player.feet;
    if (type === 'fishing') return { x: FISH_SPOT.x, z: FISH_SPOT.z, y: this.groundY(FISH_SPOT.x, FISH_SPOT.z) };
    if (type === 'fire') {
      const c = this.jobs.doors.filter((d) => dist(d, P.x, P.z) > 90 && dist(d, P.x, P.z) < 420);
      const d = (c.length ? c : this.jobs.doors)[Math.floor(Math.random() * (c.length || this.jobs.doors.length))];
      return { x: d.x, z: d.z, y: d.y };
    }
    const nodes = NAV.NODES.filter((n) => n.y > SEA + 1.5 && dist(n, P.x, P.z) > 90 && dist(n, P.x, P.z) < 420);
    const n = nodes.length ? nodes[Math.floor(Math.random() * nodes.length)] : NAV.NODES[Math.floor(Math.random() * NAV.NODES.length)];
    return { x: n.x, z: n.z, y: n.y };
  }
  plan() {
    const types = ['rescue', 'fire', 'cash', 'fishing'], type = types[Math.floor(Math.random() * types.length)];
    const s = this.pickSite(type);
    return { type, x: +s.x.toFixed(1), y: +s.y.toFixed(2), z: +s.z.toFixed(1), seed: Math.floor(Math.random() * 1e6) };
  }

  // ----- 사건 시작 -----
  start(spec) {
    if (this.cur) return;
    const T = TYPES[spec.type]; if (!T) return;
    const c = this.cur = { ...spec, T, left: T.dur, prog: 0, done: false, friends: 0, score: 0, rivals: null, n: 0 };
    this.pillar.position.set(spec.x, spec.y + 40, spec.z); this.pillar.setEnabled(true);
    const r = this.rng(spec.seed);
    if (spec.type === 'rescue') {
      const chr = new Character(this.scene, randomLook(spec.seed)); chr.wave = 1; chr.setVisible(true);
      const wreck = B.MeshBuilder.CreateBox('wreck', { width: 2, height: 0.9, depth: 4 }, this.scene); wreck.position.set(spec.x + 3.2, spec.y + 0.5, spec.z + 1); wreck.rotation.y = r() * 3; wreck.rotation.z = 0.35; wreck.material = flatMat('wreckMat', '#6b7080', this.scene); wreck.isPickable = false;
      const cross = this.crossMark(spec.x, spec.y + 3.4, spec.z);
      this.parts.push(chr, wreck, cross); c.chr = chr; c.mark = cross;
      for (let i = 0; i < 3; i++) { const k = B.MeshBuilder.CreateCylinder('evCone', { diameterTop: 0.05, diameterBottom: 0.5, height: 0.7, tessellation: 6 }, this.scene); k.position.set(spec.x - 2 + i * 1.3, spec.y + 0.35, spec.z - 2.4); k.material = flatMat('evConeMat', '#ff7a3c', this.scene); k.isPickable = false; this.parts.push(k); }
    } else if (spec.type === 'fire') {
      c.flames = [];
      for (let i = 0; i < 3; i++) { const p = this.flame(spec.x + (i - 1) * 1.7, spec.y + 0.4, spec.z + (i % 2) * 1.2); c.flames.push(p); }
    } else if (spec.type === 'cash') {
      const truck = B.MeshBuilder.CreateBox('armored', { width: 2.4, height: 1.8, depth: 5 }, this.scene); truck.position.set(spec.x, spec.y + 0.95, spec.z); truck.rotation.y = r() * 3; truck.rotation.z = 0.22; truck.material = flatMat('armoredMat', '#4a5568', this.scene); truck.isPickable = false;
      this.parts.push(truck);
      c.crates = [];
      for (let i = 0; i < 8; i++) {
        const a = r() * 6.28, d = 4 + r() * 8, x = spec.x + Math.cos(a) * d, z = spec.z + Math.sin(a) * d, y = this.groundY(x, z);
        const m = B.MeshBuilder.CreateBox('cashCrate', { width: 0.7, height: 0.5, depth: 0.5 }, this.scene); m.position.set(x, y + 0.5, z); m.rotation.y = r() * 3;
        m.material = flatMat('cashMat', '#ffd84a', this.scene, { emissive: '#7a5a00' }); m.isPickable = false;
        c.crates.push({ m, x, z, y }); this.parts.push(m);
      }
    } else if (spec.type === 'fishing') {
      c.rivals = NAMES.map((name, i) => ({ name, score: 0, rate: 70 + r() * 95 + i * 8 }));
    }
    this.jobs.notice(`${T.icon} 큰 사건! ${T.name} — 지도의 표시를 따라가 보세요`, 'alert');
    this.paint();
  }
  rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  crossMark(x, y, z) {
    const n = new B.TransformNode('evCross', this.scene), mat = flatMat('evCrossMat', '#e5322d', this.scene, { emissive: '#7a1410' });
    for (const [w, h] of [[0.9, 0.3], [0.3, 0.9]]) { const b = B.MeshBuilder.CreateBox('evCrossBar', { width: w, height: h, depth: 0.2 }, this.scene); b.parent = n; b.material = mat; b.isPickable = false; }
    n.position.set(x, y, z); n.billboardMode = B.Mesh.BILLBOARDMODE_Y; n.getChildMeshes().forEach((m) => { m.billboardMode = 0; });
    return n;
  }
  flame(x, y, z) {
    const mk = (cap) => { const p = new B.ParticleSystem('evFx', cap, this.scene); p.particleTexture = spark(this.scene); p.emitter = new B.Vector3(x, y, z); p.updateSpeed = 0.016; p.start(); return p; };
    const fire = mk(160), smoke = mk(90);
    fire.minEmitBox = new B.Vector3(-0.6, 0, -0.6); fire.maxEmitBox = new B.Vector3(0.6, 0.3, 0.6); fire.color1 = new B.Color4(1, 0.75, 0.2, 1); fire.color2 = new B.Color4(1, 0.35, 0.08, 1); fire.colorDead = new B.Color4(0.4, 0.05, 0, 0);
    fire.minSize = 0.8; fire.maxSize = 2.0; fire.minLifeTime = 0.35; fire.maxLifeTime = 0.9; fire.blendMode = B.ParticleSystem.BLENDMODE_ADD; fire.gravity = new B.Vector3(0, 6, 0); fire.direction1 = new B.Vector3(-0.4, 2, -0.4); fire.direction2 = new B.Vector3(0.4, 5, 0.4); fire.emitRate = 90;
    smoke.minEmitBox = new B.Vector3(-0.5, 1.5, -0.5); smoke.maxEmitBox = new B.Vector3(0.5, 2, 0.5); smoke.color1 = new B.Color4(0.15, 0.15, 0.17, 0.7); smoke.color2 = new B.Color4(0.25, 0.25, 0.27, 0.5); smoke.colorDead = new B.Color4(0.3, 0.3, 0.32, 0);
    smoke.minSize = 1.4; smoke.maxSize = 3.4; smoke.minLifeTime = 1.4; smoke.maxLifeTime = 3; smoke.gravity = new B.Vector3(0.6, 2.2, 0); smoke.direction1 = new B.Vector3(-0.3, 1.5, -0.3); smoke.direction2 = new B.Vector3(0.3, 2.5, 0.3); smoke.emitRate = 40;
    this.fx.push(fire, smoke);
    return { fire, smoke };
  }
  clear() {
    const c = this.cur;
    for (const p of this.parts) { try { if (p.dispose) p.dispose(); else if (p.root) p.root.dispose(); } catch (e) { /* 무시 */ } }
    this.parts = [];
    for (const p of this.fx) { try { p.stop(); p.dispose(false); } catch (e) { /* 무시 */ } }
    this.fx = [];
    this.pillar.setEnabled(false); this.hud.hidden = true;
    if (c) this.cur = null;
  }

  // ----- 매 프레임 -----
  update(dt) {
    if (this.lobby && this.lobby.open) return;
    const guest = this.net && this.net.on && this.net.mode !== 'host';
    if (!this.cur) {
      if (guest || this.player.jailed) return;
      this.nextT -= dt;
      if (this.nextT <= 0) {
        this.nextT = 300 + Math.random() * 180;
        const spec = this.plan(); this.start(spec);
        if (this.net && this.net.on) this.net.send({ t: 'g', k: 'evs', ...spec, i: 'host' });
      }
      return;
    }
    const c = this.cur, P = this.player, f = P.feet;
    c.left -= dt;
    // 사건 현장 장식 갱신
    if (c.mark) c.mark.rotation.y += dt * 1.6;
    if (c.chr) c.chr.update(dt, { pos: new B.Vector3(c.x, c.y, c.z), vel: B.Vector3.Zero(), grounded: true, wishHeading: Math.atan2(f.x - c.x, f.z - c.z), landed: 0, jumped: false });
    const here = !P.vehicle && !P.inside && !P.riding;
    if (c.type === 'rescue' && here && dist(f, c.x, c.z) < 3.4 && P.input.useHeld) c.prog += dt / 2.6;
    else if (c.type === 'fire' && here && dist(f, c.x, c.z) < 7 && P.input.useHeld) {
      const truck = this.jobs.garage.cars.some((v) => v.key === 'cars/firetruck' && dist(v.pos, c.x, c.z) < 14);
      c.prog += dt / (truck ? 3 : 6);
      if (Math.random() < dt * 8) P.chr.sSquash.v -= 1.2;
    } else if (c.type === 'cash') {
      for (let i = c.crates.length - 1; i >= 0; i--) {
        const k = c.crates[i];
        if (here ? dist(f, k.x, k.z) < 1.6 : P.vehicle && dist(P.vehicle.pos, k.x, k.z) < 2.6) { k.m.dispose(); this.parts = this.parts.filter((p) => p !== k.m); c.crates.splice(i, 1); c.n++; this.jobs.pay(c.T.base * (1 + 0.3 * this.friendsNear(c)), '현금 상자', ''); }
        else k.m.rotation.y += dt * 2;
      }
      c.prog = c.n / 8;
    } else if (c.type === 'fishing') {
      for (const r of c.rivals) r.score += (r.rate / 60) * dt * (0.6 + Math.random() * 0.8);
    }
    if (c.flames) for (const fl of c.flames) { fl.fire.emitRate = 90 * (1 - Math.min(1, c.prog)); fl.smoke.emitRate = 40 * (1 - Math.min(1, c.prog) * 0.7); }
    if (c.prog >= 1 && !c.done) return this.complete(true);
    if (c.left <= 0) return this.complete(false);
    this.hudT -= dt; if (this.hudT <= 0) { this.hudT = 0.25; this.paint(); }
  }
  friendsNear(c) {
    const n = this.net; if (!n || !n.on) return 0;
    let k = 0; for (const r of n.remotes.values()) { const p = r.car ? r.car.root.position : r.pos; if (r.seen && dist(p, c.x, c.z) < 30) k++; }
    return Math.min(3, k);
  }
  complete(ok) {
    const c = this.cur; c.done = true;
    const J = this.jobs, bonus = 1 + 0.3 * this.friendsNear(c);
    if (c.type === 'cash') {
      if (c.n > 0) J.notice(`💰 현금 상자 ${c.n}/8개 회수${c.n === 8 ? ' · 전부!' : ''}`, 'good');
      if (c.n === 8) J.pay(c.T.base * 2.3 * bonus, '현금 수송차 사고 해결', '');
      else if (c.n === 0) J.notice('😢 현금 수송차 사건을 놓쳤어요');
    } else if (c.type === 'fishing') {
      const all = [{ me: true, score: c.score }, ...c.rivals].sort((a, b) => b.score - a.score), place = all.findIndex((x) => x.me) + 1;
      if (c.score <= 0) J.notice('🎣 낚시 대회가 끝났어요. 낚시를 안 해서 순위가 없어요');
      else {
        const pay = [800, 480, 260, 90][place - 1] * bonus;
        J.notice(`🎣 낚시 대회 ${place}등! 내 점수 ${Math.round(c.score)}점`, place === 1 ? 'good' : '');
        J.pay(pay, `낚시 대회 ${place}등`, 'fish');
        if (place === 1) { const lv = rep.add('fish', 2); if (lv) setTimeout(() => J.levelUp('fish', lv), 1300); }
      }
    } else if (ok) {
      J.notice(`${c.T.icon} ${c.T.name} 해결!`, 'good');
      J.pay(c.T.base * bonus, `${c.T.name} 해결`, c.T.kind);
      const lv = rep.add(c.T.kind, 2); if (lv) setTimeout(() => J.levelUp(c.T.kind, lv), 1300);
    } else J.notice(`${c.T.icon} ${c.T.name}을(를) 놓쳤어요`);
    stats.bump('events', ok || c.n === 8 ? 1 : 0);
    this.clear();
  }
  // 낚시 대회 중에 낚은 것의 값(Jobs.pay가 알려 준다)
  onFish(n) { const c = this.cur; if (c && c.type === 'fishing') c.score += n; }
  prompt() {
    const c = this.cur, P = this.player; if (!c || P.vehicle || P.inside) return '';
    const f = P.feet;
    if (c.type === 'rescue' && dist(f, c.x, c.z) < 3.4) return c.T.hint;
    if (c.type === 'fire' && dist(f, c.x, c.z) < 7) return '꾹 눌러 불 끄기';
    return '';
  }
  use() { const c = this.cur; if (!c) return false; const f = this.player.feet; return (c.type === 'rescue' && dist(f, c.x, c.z) < 3.4) || (c.type === 'fire' && dist(f, c.x, c.z) < 7); }
  onNet(m) {
    if (m.k !== 'evs' || this.cur || !this.net || this.net.mode === 'host') return;
    if (!TYPES[m.type] || ![m.x, m.y, m.z, m.seed].every((v) => typeof v === 'number' && isFinite(v))) return;
    this.start({ type: m.type, x: m.x, y: m.y, z: m.z, seed: m.seed });
  }
  paint() {
    const c = this.cur; if (!c) return;
    const f = this.player.feet, d = Math.round(dist(f, c.x, c.z)), sec = Math.max(0, Math.ceil(c.left)), t = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    let line = `${d}m`;
    if (c.type === 'rescue' || c.type === 'fire') line += ` · 진행 ${Math.round(Math.min(1, c.prog) * 100)}%`;
    else if (c.type === 'cash') line += ` · 상자 ${c.n}/8`;
    else if (c.type === 'fishing') {
      const all = [{ me: true, score: c.score }, ...c.rivals].sort((a, b) => b.score - a.score);
      line = `내 ${Math.round(c.score)}점 · ${all.findIndex((x) => x.me) + 1}등 · 1등 ${Math.round(all[0].score)}점`;
    }
    this.hud.hidden = false;
    this.hud.innerHTML = `<b>${c.T.icon} ${c.T.name}</b><span>${t}</span><small>${line}</small>`;
  }
  marks() { const c = this.cur; return c ? [{ x: c.x, z: c.z, color: '#ff5a4a', name: c.T.name }] : []; }
}
