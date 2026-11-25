// 서킷 레이스: 판매장 옆 접수대에서 코스를 고르면 출발선이 표시된다. 차(자전거·킥보드 포함)를 타고 출발선에 서면 카운트다운 뒤 시작한다.
// 길은 경찰이 쓰는 길 그물(NAV)로 이어 만든 순환 코스이고, 체크포인트 문을 차례로 통과해 정해진 바퀴를 돈다.
// 가장 좋은 기록은 저장되고, 그때 달린 모습이 반투명한 고스트 차로 다시 나타나 함께 달린다.
import { SITES } from './world.js';
import { NAV } from './police.js';
import { Panel } from './panel.js';
import { stats } from './stats.js';
import { flatMat } from './util.js';
const B = window.BABYLON;
const KEY = 'boxtown.race';
const $ = (id) => document.getElementById(id);
const won = (n) => Math.round(n).toLocaleString('ko-KR');

// 코스: 길 위의 기준점을 차례로 이어 한 바퀴를 만든다(좌표는 길 위 아무 곳이나 가까운 길점으로 맞춰진다).
export const COURSES = [
  { id: 'mid', name: '도심 스프린트', laps: 3, note: '넓은 6차선 도심 길을 도는 짧은 코스', anchors: [[0, 180], [120, 180], [120, 300], [0, 300]] },
  { id: 'north', name: '북부 순환', laps: 3, note: '북쪽 시가지 네 모퉁이를 도는 코스', anchors: [[110, 350], [230, 350], [230, 470], [110, 470]] },
  { id: 'east', name: '동부 순환', laps: 3, note: '동쪽 시가지의 빠른 직선과 급한 모퉁이', anchors: [[330, 260], [450, 260], [450, 380], [330, 380]] },
  { id: 'grand', name: '대순환 하이웨이', laps: 2, note: '도심, 동부, 항구 길을 잇는 긴 순환 도로', anchors: [[156, 240], [299, 320], [390, 320], [390, 229], [290, 222], [268, 76], [135, 48], [12, 99], [60, 144], [60, 240]] },
];
const AVG = { gold: 22, silver: 17, bronze: 13 }; // 메달 기준 평균 속도(m/s)
const fmt = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 저장소를 못 쓰는 환경 */ } };
const valid = (v) => !!v && !v.isBoat && !v.isHeli && !v.dead;

// 기준점을 길 그물로 이어 점 목록(x, y, z)으로 만든다. 길이 끊기면 null.
function buildLine(c) {
  const N = NAV.NODES, ids = c.anchors.map(([x, z]) => NAV.nearestNode(x, z)), pts = [];
  for (let i = 0; i < ids.length; i++) {
    const r = NAV.route(ids[i], ids[(i + 1) % ids.length]);
    if (!r) return null;
    for (let k = pts.length ? 1 : 0; k < r.length; k++) pts.push({ x: N[r[k]].x, y: N[r[k]].y, z: N[r[k]].z });
  }
  // 3m 간격으로 다시 찍는다.
  const out = [pts[0]]; let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d < 1e-3) continue;
    let t = 3 - acc;
    for (; t < d; t += 3) out.push({ x: a.x + ((b.x - a.x) * t) / d, y: a.y + ((b.y - a.y) * t) / d, z: a.z + ((b.z - a.z) * t) / d });
    acc = d - (t - 3);
  }
  return out;
}

export class Race {
  constructor({ scene, assets, player, jobs, garage, groundY, lazyCollider }) {
    Object.assign(this, { scene, assets, player, jobs, garage, groundY });
    this.state = 'idle'; this.course = null; this.data = load(); this.lobby = null;
    // ----- 코스 만들기 -----
    this.courses = [];
    for (const c of COURSES) {
      const line = buildLine(c);
      if (!line || line.length < 30) continue;
      let len = 0; for (let i = 1; i < line.length; i++) len += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z);
      const n = Math.max(4, Math.round(len / 85)), cps = [];
      for (let k = 1; k <= n; k++) {
        const i = k === n ? 0 : Math.round((k / n) * (line.length - 1)), p = line[i], q = line[(i + 3) % line.length], o = line[(i + line.length - 3) % line.length];
        cps.push({ x: p.x, y: p.y, z: p.z, yaw: Math.atan2(q.x - o.x, q.z - o.z) });
      }
      const dist = len * c.laps;
      this.courses.push({ ...c, line, len, cps, dist, gold: dist / AVG.gold + 4, silver: dist / AVG.silver + 4, bronze: dist / AVG.bronze + 4 });
    }
    // ----- 접수대(판매장 서쪽 풀밭) -----
    const S = SITES.dealer, kx = S.x - 21, kz = S.z + 6, ky = groundY(kx, kz);
    this.kiosk = { x: kx, z: kz, y: ky };
    const col = lazyCollider ? lazyCollider() : null;
    const part = (w, h, d, x, y, z, hex, solid, o) => {
      const m = B.MeshBuilder.CreateBox('raceKiosk', { width: w, height: h, depth: d }, scene);
      m.position.set(kx + x, ky + y, kz + z); m.material = flatMat('raceKiosk_' + hex + (o ? 'e' : ''), hex, scene, o); m.isPickable = false;
      if (solid && col) col.add(kx + x, ky + y, kz + z, w, h, d);
      return m;
    };
    part(5.4, 0.3, 4.2, 0, -0.13, 0, '#c9cede', false); // 바닥
    part(3.6, 2.2, 2.4, 0, 1.0, -0.3, '#f4f1ea', true); part(4.0, 0.3, 2.8, 0, 2.25, -0.3, '#e5553f', false); part(3.0, 0.9, 0.12, 0, 1.45, 0.95, '#bfe6ff', false, { emissive: '#4f86a8' });
    part(0.14, 4.6, 0.14, 2.3, 2.3, 1.6, '#34456f', true);
    const flag = B.MeshBuilder.CreatePlane('raceFlag', { width: 2.2, height: 1.4 }, scene);
    const ft = new B.DynamicTexture('raceFlagTex', { width: 256, height: 160 }, scene, true), fx = ft.getContext();
    for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) { fx.fillStyle = (x + y) % 2 ? '#111' : '#fff'; fx.fillRect(x * 32, y * 32, 32, 32); }
    ft.update();
    const fm = new B.StandardMaterial('raceFlagMat', scene); fm.diffuseTexture = ft; fm.emissiveTexture = ft; fm.specularColor = B.Color3.Black(); fm.backFaceCulling = false;
    flag.material = fm; flag.position.set(kx + 3.4, ky + 3.9, kz + 1.6); flag.isPickable = false;
    const sg = B.MeshBuilder.CreatePlane('raceSign', { width: 5.2, height: 0.9 }, scene);
    const st = new B.DynamicTexture('raceSignTex', { width: 1024, height: 180 }, scene, true), sx = st.getContext();
    sx.fillStyle = '#16223a'; sx.fillRect(0, 0, 1024, 180); sx.fillStyle = '#ffd84a'; sx.textAlign = 'center'; sx.textBaseline = 'middle';
    sx.font = '900 100px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif'; sx.fillText('🏁 서킷 레이스', 512, 96); st.update();
    const sm = new B.StandardMaterial('raceSignMat', scene); sm.diffuseTexture = st; sm.emissiveTexture = st; sm.specularColor = B.Color3.Black(); sm.backFaceCulling = false;
    sg.material = sm; sg.position.set(kx, ky + 2.95, kz + 0.98); sg.isPickable = false;
    if (col) col.done();
    // ----- 문(체크포인트): 지금 문과 다음 두 문만 보인다 -----
    this.gates = [0, 1, 2].map((k) => {
      const node = new B.TransformNode('raceGate' + k, scene), hex = ['#ffd84a', '#7fd3ff', '#cfe3ff'][k], em = ['#8a6a00', '#2a5a78', '#3a4a60'][k];
      const mat = flatMat('raceGateMat' + k, hex, scene, { emissive: em });
      for (const sd of [-1, 1]) { const p = B.MeshBuilder.CreateBox('gatePost', { width: 0.6, height: 5.5, depth: 0.6 }, scene); p.parent = node; p.position.set(sd * 8.6, 2.75, 0); p.material = mat; p.isPickable = false; }
      const bar = B.MeshBuilder.CreateBox('gateBar', { width: 17.8, height: 0.7, depth: 0.5 }, scene); bar.parent = node; bar.position.y = 5.4; bar.material = mat; bar.isPickable = false;
      node.setEnabled(false);
      return node;
    });
    const pm = new B.StandardMaterial('racePillarMat', scene); pm.emissiveColor = new B.Color3(1, 0.85, 0.25); pm.disableLighting = true; pm.alpha = 0.3; pm.fogEnabled = false;
    this.pillar = B.MeshBuilder.CreateCylinder('racePillar', { diameter: 2.4, height: 70, tessellation: 4 }, scene); this.pillar.material = pm; this.pillar.isPickable = false; this.pillar.setEnabled(false);
    this.ghost = null;
    // ----- 화면 표시 -----
    const hud = document.createElement('div'); hud.id = 'raceHud'; hud.hidden = true; document.body.appendChild(hud); this.hud = hud;
    const big = document.createElement('div'); big.id = 'raceBig'; big.hidden = true; document.body.appendChild(big); this.big = big;
    hud.addEventListener('click', (e) => { if (e.target.closest('[data-quit]')) this.cancel('레이스를 그만뒀어요'); });
    addEventListener('keydown', (e) => { if (e.code === 'KeyQ' && this.state !== 'idle' && !e.repeat) this.cancel('레이스를 그만뒀어요'); });
    this.hudT = 0;
  }

  // ----- 접수대와 코스 고르기 -----
  nearKiosk() { const p = this.player.feet; return !this.player.vehicle && !this.player.inside && Math.hypot(p.x - this.kiosk.x, p.z - this.kiosk.z) < 4.2 && Math.abs(p.y - this.kiosk.y) < 3; }
  prompt() { return this.nearKiosk() && !Panel.open ? (this.state === 'idle' ? '레이스 접수' : '레이스 다시 고르기') : ''; }
  use() { if (!this.nearKiosk()) return false; if (Panel.open) Panel.close(); else this.open(); return true; }
  medalOf(c, t) { return t <= c.gold ? 'gold' : t <= c.silver ? 'silver' : t <= c.bronze ? 'bronze' : ''; }
  open() {
    Panel.show({
      title: '서킷 레이스', sel: this.course ? this.course.id : undefined,
      note: () => '코스를 고르면 출발선이 지도에 표시돼요. 차를 타고 출발선에 서세요',
      items: () => this.courses.map((c) => { const b = this.data[c.id]; return { id: c.id, label: c.name, sub: b ? fmt(b.t) : `${c.laps}바퀴` }; }),
      detail: (id) => {
        const c = this.courses.find((x) => x.id === id); if (!c) return null;
        const b = this.data[id];
        return {
          name: `${c.name} · ${c.laps}바퀴 · ${(c.dist / 1000).toFixed(1)}km`,
          bars: [
            { label: '내 최고', ratio: b ? Math.min(1, c.gold / b.t) : 0, text: b ? `${fmt(b.t)} ${{ gold: '🥇', silver: '🥈', bronze: '🥉', '': '' }[this.medalOf(c, b.t)]}` : '기록 없음' },
            { label: '🥇 금메달', ratio: 1, text: fmt(c.gold) }, { label: '🥈 은메달', ratio: c.gold / c.silver, text: fmt(c.silver) }, { label: '🥉 동메달', ratio: c.gold / c.bronze, text: fmt(c.bronze) },
          ],
          action: { label: this.course && this.course.id === id && this.state !== 'idle' ? '선택됨' : '이 코스로 달리기', state: 'buy' },
        };
      },
      pick: (id) => { const c = this.courses.find((x) => x.id === id); if (c) { Panel.close(); this.select(c); } },
    });
  }
  select(c) {
    this.cancel('', true);
    this.course = c; this.state = 'toStart'; this.idx = 0; this.lap = 0; this.t = 0;
    this.showGates(0);
    const s = c.cps[c.cps.length - 1];
    this.pillar.position.set(s.x, s.y + 35, s.z); this.pillar.setEnabled(true);
    this.jobs.toast(`${c.name}: 출발선(빛기둥)으로 가서 차를 세우세요`);
    this.paint();
  }
  cancel(msg, silent) {
    if (this.state === 'idle') return;
    if (this.state === 'count') this.player.input.blocked = false; // 카운트다운 중에 걸어 둔 브레이크를 푼다
    this.state = 'idle'; this.hide();
    if (msg && !silent) this.jobs.toast(msg);
  }
  hide() {
    this.pillar.setEnabled(false); for (const g of this.gates) g.setEnabled(false);
    this.hud.hidden = true; this.big.hidden = true;
    if (this.ghost) { this.ghost.root.dispose(false, false); this.ghost = null; }
  }
  // 지금 문(0)과 다음 두 문을 놓는다. n: 지금 문의 번호(cps 안에서)
  showGates(n) {
    const c = this.course;
    this.gates.forEach((g, k) => {
      const i = n + k;
      if (this.state === 'toStart' || i >= c.cps.length) { g.setEnabled(this.state === 'toStart' && k === 0); if (this.state === 'toStart' && k === 0) this.placeGate(g, c.cps[c.cps.length - 1]); return; }
      this.placeGate(g, c.cps[i]); g.setEnabled(true);
    });
  }
  placeGate(g, p) { g.position.set(p.x, p.y + 0.1, p.z); g.rotation.y = p.yaw; }

  // ----- 달리기 -----
  begin() {
    const c = this.course, v = this.player.vehicle;
    this.state = 'count'; this.cd = 3.4; this.lap = 0; this.idx = 0; this.t = 0; this.lapT = 0; this.bestLap = 0; this.rec = []; this.recT = 0; this.off = 0;
    this.carKey = v.key;
    this.player.input.blocked = true; // 카운트다운 동안은 브레이크가 걸려 있다
    this.pillar.setEnabled(false);
    this.showGates(0); this.state = 'count';
    const rec = this.data[c.id];
    if (rec && rec.g && rec.g.length > 4) this.makeGhost(rec);
  }
  makeGhost(rec) {
    try {
      const parts = this.assets.spawnCar(rec.k || 'cars/sedan'), root = new B.TransformNode('raceGhost', this.scene);
      parts.body.parent = root; parts.body.visibility = 0.42;
      for (const w of parts.wheels) { w.mesh.parent = root; w.mesh.position.copyFrom(w.pos); w.mesh.visibility = 0.42; }
      this.ghost = { root, rec: rec.g };
    } catch (e) { this.ghost = null; }
  }
  stepGhost() {
    const g = this.ghost; if (!g) return;
    const f = Math.max(0, this.t) / 0.2, i = Math.floor(f), a = g.rec[Math.min(i, g.rec.length - 1)], b = g.rec[Math.min(i + 1, g.rec.length - 1)], k = f - i;
    if (!a) return;
    g.root.setEnabled(i < g.rec.length - 1);
    g.root.position.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k + 0.05, a[2] + (b[2] - a[2]) * k);
    let d = b[3] - a[3]; if (d > 314) d -= 628; if (d < -314) d += 628;
    g.root.rotation.y = (a[3] + d * k) / 100;
  }
  update(dt) {
    if (this.state === 'idle') return;
    const P = this.player, v = P.vehicle, c = this.course;
    if (this.lobby && this.lobby.open) return this.cancel('', true);
    if (P.jailed) return this.cancel('레이스가 취소됐어요');
    if (this.state === 'toStart') {
      const s = c.cps[c.cps.length - 1];
      if (valid(v) && Math.hypot(v.pos.x - s.x, v.pos.z - s.z) < 12 && Math.abs(v.pos.y - s.y) < 6) this.begin();
      this.hudT -= dt; if (this.hudT <= 0) { this.hudT = 0.2; this.paint(); }
      return;
    }
    // 차에서 내리거나 다른 탈것을 타면 잠시 뒤 중단된다.
    if (valid(v)) this.off = 0; else { this.off += dt; if (this.off > 6) return this.cancel('차에서 내려서 레이스가 끝났어요'); }
    if (this.state === 'count') {
      this.cd -= dt;
      const n = Math.ceil(this.cd);
      this.big.hidden = false; this.big.textContent = this.cd > 0 ? String(Math.min(3, n)) : 'GO!';
      this.big.className = this.cd > 0 ? '' : 'go';
      if (this.cd <= -0.5) { this.big.hidden = true; }
      if (this.cd <= 0 && this.state === 'count') { this.state = 'run'; P.input.blocked = false; this.t = 0; this.idx = 0; this.showGates(0); this.lastCp = c.cps[c.cps.length - 1]; }
      this.stepGhost(); this.paint();
      return;
    }
    // run
    this.t += dt; this.lapT += dt;
    if (this.cd > -0.5) { this.cd -= dt; if (this.cd <= -0.5) this.big.hidden = true; }
    this.recT += dt;
    if (this.recT >= 0.2 && v) { this.recT -= 0.2; this.rec.push([+v.pos.x.toFixed(1), +v.pos.y.toFixed(2), +v.pos.z.toFixed(1), Math.round(v.yaw * 100)]); }
    this.stepGhost();
    const cp = c.cps[this.idx];
    if (valid(v) && Math.hypot(v.pos.x - cp.x, v.pos.z - cp.z) < 14 && Math.abs(v.pos.y - cp.y) < 8) {
      this.idx++;
      if (this.idx >= c.cps.length) {
        this.lap++;
        const lt = this.lapT; this.lapT = 0; if (!this.bestLap || lt < this.bestLap) this.bestLap = lt;
        if (this.lap >= c.laps) return this.finish();
        this.idx = 0; this.jobs.toast(`${this.lap}바퀴 완료 ${fmt(lt)}`);
      }
      this.showGates(this.idx);
    }
    this.hudT -= dt; if (this.hudT <= 0) { this.hudT = 0.1; this.paint(); }
  }
  finish() {
    const c = this.course, t = this.t, prev = this.data[c.id], first = !prev, best = !prev || t < prev.t, medal = this.medalOf(c, t);
    if (best) { this.data[c.id] = { t: +t.toFixed(2), k: this.carKey, g: this.rec, lap: +this.bestLap.toFixed(2) }; save(this.data); }
    stats.bump('races'); if (medal === 'gold') stats.bump('golds');
    const mult = { gold: 1.6, silver: 1.1, bronze: 0.7, '': 0.25 }[medal], pay = Math.round((c.dist * 0.35 * mult) / 10) * 10;
    this.jobs.pay(pay, `${c.name} 완주 ${fmt(t)}${medal ? ' ' + { gold: '🥇', silver: '🥈', bronze: '🥉' }[medal] : ''}`, 'race');
    this.state = 'idle'; this.hide();
    this.big.hidden = false; this.big.className = 'done';
    this.big.innerHTML = `<b>${medal ? { gold: '🥇 금메달', silver: '🥈 은메달', bronze: '🥉 동메달' }[medal] : '완주!'}</b><span>${fmt(t)}${best && !first ? ' · 신기록!' : first ? ' · 첫 기록' : ''}</span>`;
    clearTimeout(this.bigT); this.bigT = setTimeout(() => { if (this.state === 'idle') this.big.hidden = true; }, 4200);
  }
  paint() {
    const c = this.course; if (!c) return;
    this.hud.hidden = false;
    if (this.state === 'toStart') { this.hud.innerHTML = `<b>🏁 ${c.name}</b><span>출발선(빛기둥)에 차를 세우세요 · ${c.laps}바퀴</span><button data-quit>그만두기</button>`; return; }
    const b = this.data[c.id];
    const ghost = this.ghost ? ' · 👻 고스트' : '';
    this.hud.innerHTML = `<b>🏁 ${c.name}</b><span>${Math.min(this.lap + 1, c.laps)}/${c.laps}바퀴 · ${fmt(Math.max(0, this.t))}</span><small>문 ${Math.min(this.idx + 1, c.cps.length)}/${c.cps.length}${b ? ' · 최고 ' + fmt(b.t) : ''}${ghost}</small><button data-quit>그만두기</button>`;
  }
  marks() {
    const out = [{ x: this.kiosk.x, z: this.kiosk.z, color: '#ffd84a', name: '레이스' }];
    if (this.course && this.state !== 'idle') { const p = this.state === 'toStart' ? this.course.cps[this.course.cps.length - 1] : this.course.cps[Math.min(this.idx, this.course.cps.length - 1)]; out.push({ x: p.x, z: p.z, color: '#7fd3ff', name: this.state === 'toStart' ? '출발선' : '다음 문' }); }
    return out;
  }
}
