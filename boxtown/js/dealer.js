// 자동차 판매장과 내 차. 판매장에서 차를 사면 내 차가 되고, V(또는 🚗 버튼)로 가까운 길 위로 불러온다.
// 판매장 옆 착륙장에는 누구나 탈 수 있는 헬리콥터가 있다.
import { SITES } from './world.js';
import { Vehicle, SPECS } from './vehicles.js';
import { Heli } from './heli.js';
import { NAV } from './police.js';
import { Panel } from './panel.js';
import { flatMat } from './util.js';
const B = window.BABYLON;
const won = (n) => n.toLocaleString('ko-KR');

// [모델, 이름, 값]
export const CARS = [
  ['cars/tractor', '트랙터', 1500], ['cars/kart-oobi', '카트', 2500], ['cars/sedan', '승용차', 3000], ['cars/taxi', '택시', 3500], ['cars/van', '승합차', 4000],
  ['cars/suv', 'SUV', 5000], ['cars/truck', '트럭', 5000], ['cars/truck-flat', '짐칸 트럭', 5500], ['cars/tractor-shovel', '삽 트랙터', 6000], ['cars/ambulance', '구급차', 7000],
  ['cars/sedan-sports', '스포츠 세단', 8000], ['cars/hatchback-sports', '스포츠 해치백', 9000], ['cars/suv-luxury', '고급 SUV', 12000], ['cars/firetruck', '소방차', 15000],
  ['cars/race', '경주차', 25000], ['cars/race-future', '미래 경주차', 40000],
];

export class Dealer {
  constructor({ scene, assets, player, jobs, garage, weapons, groundY, lazyCollider, addShadow }) {
    Object.assign(this, { scene, assets, player, jobs, garage, weapons, groundY });
    const S = SITES.dealer, y = groundY(S.x, S.z);
    this.x = S.x; this.z = S.z; this.y = y; this.car = null; this.cd = 0;
    this.owned = new Set(); this.active = '';
    try { this.owned = new Set(JSON.parse(localStorage.getItem('boxtown.cars') || '[]')); this.active = localStorage.getItem('boxtown.car') || ''; } catch (e) { /* 무시 */ }
    if (!this.owned.has(this.active)) this.active = [...this.owned][0] || '';
    // ----- 판매장: 바닥, 사무실, 전시차, 간판, 착륙장 -----
    const col = lazyCollider();
    const put = (w, h, d, x, yy, z, hex, solid, o) => { const b = B.MeshBuilder.CreateBox('dealer', { width: w, height: h, depth: d }, scene); b.position.set(S.x + x, y + yy, S.z + z); b.material = flatMat('dealer_' + hex + (o ? 'e' : ''), hex, scene, o); b.isPickable = false; b.receiveShadows = true; b.freezeWorldMatrix(); if (solid) { col.add(S.x + x, y + yy, S.z + z, w, h, d); addShadow([b]); } return b; };
    put(30, 0.3, 26, 0, -0.13, 0, '#c9cede', true); put(30.4, 0.06, 0.5, 0, 0.05, -13, '#ffd84a'); // 바닥(윗면이 땅 위 2cm)과 길 쪽 띠
    put(9, 4, 6, -8, 2.1, 9, '#f4f1ea', true); put(9.4, 0.4, 6.4, -8, 4.3, 9, '#e5553f'); put(6, 2.2, 0.12, -8, 1.6, 5.95, '#bfe6ff', false, { emissive: '#4f86a8' }); // 사무실
    for (const px of [-13, 13]) put(0.3, 5.2, 0.3, px, 2.6, -12.4, '#34456f', true);
    const tex = new B.DynamicTexture('dealerSign', { width: 1024, height: 160 }, scene, true), ctx = tex.getContext();
    ctx.fillStyle = '#e5553f'; ctx.fillRect(0, 0, 1024, 160); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 100px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif'; ctx.fillText('🚗 박스 자동차 🚁', 512, 86); tex.update();
    const sm = new B.StandardMaterial('dealerSignMat', scene); sm.diffuseTexture = tex; sm.emissiveTexture = tex; sm.emissiveColor = new B.Color3(0.6, 0.6, 0.6); sm.specularColor = B.Color3.Black(); sm.backFaceCulling = false;
    const sign = B.MeshBuilder.CreatePlane('dealerSign', { width: 26, height: 4 }, scene); sign.position.set(S.x, y + 6.4, S.z - 12.4); sign.material = sm; sign.isPickable = false;
    // 전시차(구경용): 값이 고른 차 여섯 대
    ['cars/kart-oobi', 'cars/sedan', 'cars/suv-luxury', 'cars/ambulance', 'cars/race', 'cars/race-future'].forEach((k, i) => {
      const parts = assets.spawnCar(k), root = new B.TransformNode('showCar', scene), x = S.x - 10 + (i % 3) * 6.5 + (i > 2 ? 2 : 0), z = S.z - 8 + Math.floor(i / 3) * 7;
      put(3.4, 0.2, 5.6, x - S.x, 0.04, z - S.z, '#34456f', true); // 전시대(윗면 땅 위 14cm: 걸어 올라갈 수 있다)
      root.position.set(x, y + 0.14, z); root.rotation.y = Math.PI + 0.35;
      parts.body.parent = root; for (const w of parts.wheels) { w.mesh.parent = root; w.mesh.position.copyFrom(w.pos); }
    });
    // 착륙장과 헬리콥터
    put(11, 0.3, 11, 9, -0.13, 6, '#3a3d4d', true); put(6, 0.02, 1, 9, 0.04, 6, '#ffd84a'); put(1, 0.02, 6, 9, 0.045, 6, '#ffd84a');
    col.done();
    this.heli = new Heli(scene, S.x + 9, y + 0.3, S.z + 6, Math.PI, addShadow);
    garage.cars.push(this.heli);
    this.desk = { x: S.x - 8, z: S.z + 4.6 };
    addEventListener('keydown', (e) => { if (e.code === 'KeyV' && !e.repeat) this.summon(); });
    document.getElementById('btnCar').addEventListener('click', () => this.summon());
    this.paintBtn();
  }
  save() { try { localStorage.setItem('boxtown.cars', JSON.stringify([...this.owned])); localStorage.setItem('boxtown.car', this.active); } catch (e) { /* 무시 */ } this.paintBtn(); }
  paintBtn() { document.getElementById('btnCar').hidden = !this.active; }
  nearDesk() { const p = this.player.feet; return !this.player.vehicle && Math.hypot(p.x - this.desk.x, p.z - this.desk.z) < 4.5 && Math.abs(p.y - this.y) < 3; }
  prompt() { return this.nearDesk() && !Panel.open ? '자동차 구경하기' : ''; }
  use() { if (!this.nearDesk()) return false; if (Panel.open) Panel.close(); else this.open(true); return true; }
  // 차의 성능을 가로 막대로: 최고 속도, 가속, 핸들링, 묵직함. 값은 실제 물리 수치에서 가져온다.
  stats(k) {
    const S = SPECS[k] || SPECS.default, all = Object.values(SPECS), mx = (f) => Math.max(...all.map(f));
    const handling = (s) => (s.steer || 0.5) * 0.5 + (s.grip || 12) / 40 + (800 / (s.mass + 400)) * 0.2;
    return [
      { label: '최고 속도', ratio: S.vmax / mx((s) => s.vmax), text: `${Math.round(S.vmax * 3.6)} km/h` },
      { label: '가속', ratio: S.engine / mx((s) => s.engine), text: `${(S.engine / 2.2).toFixed(1)}` },
      { label: '핸들링', ratio: handling(S) / Math.max(...all.map(handling)), text: `${Math.round((handling(S) / Math.max(...all.map(handling))) * 100)}` },
      { label: '묵직함', ratio: S.mass / mx((s) => s.mass), text: `${S.mass} kg` },
    ];
  }
  // shop: 판매장(살 수 있다) / 차고(가진 차 중에서 고른다)
  open(shop) {
    this.note = '';
    const first = shop ? undefined : this.active || undefined;
    Panel.show({
      title: shop ? '박스 자동차' : '내 차고', sel: first,
      note: () => this.note || (shop ? '차를 눌러 성능을 보고 사세요. 어디서든 V로 불러요' : this.owned.size ? '탈 차를 고르세요. V로 불러와요' : '아직 차가 없어요. 항구 동쪽 판매장에서 사세요'),
      items: () => CARS.filter(([k]) => shop || this.owned.has(k)).map(([k, name, price]) => ({ id: k, label: name, sub: this.active === k ? '타는 중' : this.owned.has(k) ? '보유' : won(price) + '원', state: this.active === k ? 'on' : this.owned.has(k) ? '' : 'buy' })),
      detail: (k) => {
        const item = CARS.find((c) => c[0] === k);
        if (!item) return null;
        const own = this.owned.has(k);
        return { name: `${item[1]}${own ? '' : ' · ' + won(item[2]) + '원'}`, bars: this.stats(k), action: { label: this.active === k ? '타는 중' : own ? '이 차로 정하기' : `${won(item[2])}원에 사기`, state: this.active === k ? 'on' : own ? '' : 'buy' } };
      },
      pick: (k) => {
        const item = CARS.find((c) => c[0] === k);
        if (!item || this.active === k) return;
        if (!this.owned.has(k)) { if (!shop) return; if (!this.jobs.spend(item[2])) { this.note = '돈이 모자라요'; return; } this.owned.add(k); }
        this.note = ''; this.active = k; this.save();
        if (shop) this.place(this.x + 4, this.y + 0.7, this.z - 17, Math.PI / 2); else if (this.car && this.car !== this.player.vehicle) this.drop();
      },
    });
  }
  // 내 차를 치운다(다른 차로 바꿀 때).
  drop() {
    const v = this.car;
    if (!v) return;
    this.car = null;
    if (this.player.vehicle === v) this.player.exit();
    const k = this.garage.cars.indexOf(v); if (k >= 0) this.garage.cars.splice(k, 1);
    this.weapons.byBody.delete(v.body);
    const fx = this.weapons.carFx.get(v); if (fx) { fx.smoke.dispose(false); fx.fire.dispose(false); this.weapons.carFx.delete(v); }
    v.body.dispose(); v.root.getChildMeshes().forEach((m) => m.dispose()); v.root.dispose();
  }
  place(x, y, z, yaw) {
    if (!this.active) return;
    if (this.car && this.car.key !== this.active) this.drop();
    if (!this.car) {
      const v = (this.car = new Vehicle(this.scene, this.assets, this.active, x, y, z, yaw));
      v.mine = true; this.garage.cars.push(v); this.weapons.byBody.set(v.body, v);
    } else { this.car.hp = 100; this.car.reset(x, y, z, yaw); }
  }
  // 가장 가까운 길 위로 내 차를 불러온다.
  summon() {
    const P = this.player;
    if (!this.active || this.cd > 0 || P.inside || P.riding || (this.car && P.vehicle === this.car) || (this.car && this.car.dead)) return false;
    const f = P.feet, n = NAV.NODES[NAV.nearestNode(f.x, f.z)], d = Math.hypot(n.x - f.x, n.z - f.z);
    if (d > 120) return false;
    this.cd = 6;
    const yaw = Math.atan2(f.x - n.x, f.z - n.z) + Math.PI / 2;
    // 발밑이 길이면 바로 옆에, 아니면 길 위의 가장 가까운 점에 놓는다.
    const x = d < 5 ? f.x + Math.sin(P.yaw) * 4.5 : n.x, z = d < 5 ? f.z + Math.cos(P.yaw) * 4.5 : n.z;
    this.place(x, Math.max(n.y, this.groundY(x, z)) + 0.8, z, d < 5 ? P.yaw : yaw);
    if (this.weapons.sfx.ctx) this.weapons.sfx.play('pop');
    return true;
  }
  marks() { return this.car && !this.car.dead && this.car !== this.player.vehicle ? [{ x: this.car.pos.x, z: this.car.pos.z, color: '#ffd84a', name: '내 차' }] : []; }
  update(dt) { if (this.cd > 0) this.cd -= dt; }
}
