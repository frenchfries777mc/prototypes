// 군사 기지: 정문을 지나 담장 안에 들어서면 경보가 울리고 별 셋이 된다.
// 안에서는 군인들이 쏘고, 무기고(앞이 트인 창고)의 상자에서 무기를 훔칠 수 있다. 헬기장에는 군용 헬리콥터가 서 있다.
import { SITES } from './world.js';
import { Heli, HELI_PAL } from './heli.js';
import { flatMat } from './util.js';
const B = window.BABYLON;

// 상자 앞에 서서 E: [무기 id, 이름, 상자 색]
const CRATES = [['pistol', '권총', '#8f95a8'], ['smg', '기관단총', '#4f9bea'], ['shotgun', '산탄총', '#c9a36a'], ['rifle', '돌격소총', '#57c27a'], ['sniper', '저격소총', '#b072e0'], ['rocket', '로켓 발사기', '#d9473c']];

export class Base {
  constructor({ scene, assets, player, residents, police, weapons, garage, groundY, addShadow }) {
    Object.assign(this, { scene, player, residents, police, weapons, groundY });
    const S = (this.S = SITES.base);
    this.alarm = false; this.beepT = 0; this.outT = 0; this.cool = 0;
    // 무기 상자: 상자 몸통과 색 뚜껑, 위에 이름표
    const mat = (hex) => flatMat('baseCrate_' + hex, hex, scene);
    this.crates = CRATES.map(([id, name, hex], i) => {
      const x = S.x + 16 + i * 3.2, z = S.z - 7.4, y = groundY(x, z);
      const box = B.MeshBuilder.CreateBox('weaponCrate', { width: 1.7, height: 0.95, depth: 1.1 }, scene);
      box.position.set(x, y + 0.47, z); box.material = mat('#4a5240'); box.isPickable = false; box.receiveShadows = true;
      const lid = B.MeshBuilder.CreateBox('weaponCrateLid', { width: 1.78, height: 0.14, depth: 1.18 }, scene);
      lid.position.set(x, y + 1.0, z); lid.material = mat(hex); lid.isPickable = false;
      const tex = new B.DynamicTexture('crateTag' + id, { width: 384, height: 128 }, scene, true), c = tex.getContext();
      c.fillStyle = 'rgba(22,34,58,.92)'; c.beginPath(); c.roundRect(4, 14, 376, 100, 22); c.fill();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 56px "Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif'; c.fillText(name, 192, 66); tex.update();
      const sm = new B.StandardMaterial('crateTagMat' + id, scene); sm.diffuseTexture = tex; sm.emissiveTexture = tex; sm.opacityTexture = tex; sm.disableLighting = true; sm.backFaceCulling = false;
      const tag = B.MeshBuilder.CreatePlane('crateTag', { width: 2.3, height: 0.77 }, scene);
      tag.position.set(x, y + 2.15, z); tag.billboardMode = B.Mesh.BILLBOARDMODE_Y; tag.material = sm; tag.isPickable = false;
      addShadow([box]);
      return { id, name, x, z, y };
    });
    // 경고 표지판(정문 양옆 담장 바깥쪽)
    const stex = new B.DynamicTexture('baseSign', { width: 512, height: 256 }, scene, true), sc = stex.getContext();
    sc.fillStyle = '#d9473c'; sc.fillRect(0, 0, 512, 256); sc.fillStyle = '#fff'; sc.fillRect(14, 14, 484, 228); sc.fillStyle = '#d9473c'; sc.textAlign = 'center'; sc.textBaseline = 'middle';
    sc.font = '900 76px "Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif'; sc.fillText('군사 시설', 256, 84); sc.font = '900 62px "Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif'; sc.fillText('출입 금지', 256, 160);
    sc.font = '700 30px "Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif'; sc.fillStyle = '#22202b'; sc.fillText('경보가 울립니다', 256, 214); stex.update();
    const sgm = new B.StandardMaterial('baseSignMat', scene); sgm.diffuseTexture = stex; sgm.emissiveTexture = stex; sgm.emissiveColor = new B.Color3(0.45, 0.45, 0.45); sgm.specularColor = B.Color3.Black(); sgm.backFaceCulling = false;
    for (const sx of [-15, 15]) { const p = B.MeshBuilder.CreatePlane('baseSign', { width: 4.4, height: 2.2 }, scene); p.position.set(S.x + sx, groundY(S.x + sx, S.z - 33) + 2.2, S.z - 32.55); p.rotation.y = Math.PI; p.material = sgm; p.isPickable = false; }
    // 군인들
    const ring = { x0: S.x - 8, x1: S.x + 11, z0: S.z - 24, z1: S.z + 3 };
    residents.spawnSoldiers(scene, { ring, posts: [[S.x - 4.5, S.z - 29, Math.PI], [S.x + 4.5, S.z - 29, Math.PI], [S.x + 24, S.z - 17, Math.PI]] }).forEach(() => {});
    // 군용 헬리콥터(헬기장). 훔쳐 탈 수 있다.
    const gy = groundY(S.x + 24, S.z + 18);
    this.heli = new Heli(scene, S.x + 24, gy + 0.3, S.z + 18, Math.PI, addShadow, HELI_PAL.army);
    garage.cars.push(this.heli); weapons.byBody.set(this.heli.body, this.heli);
    this.el = document.getElementById('alarm');
  }
  // 담장 안(차를 타고 있으면 차 위치 기준)인가
  inside() {
    const P = this.player, p = P.vehicle ? P.vehicle.pos : P.feet, S = this.S;
    return !P.inside && Math.abs(p.x - S.x) < 43.5 && Math.abs(p.z - S.z) < 33.5 && p.y < S.y + 40;
  }
  nearCrate() {
    const P = this.player, p = P.feet;
    if (P.vehicle || P.inside) return null;
    return this.crates.find((c) => Math.hypot(c.x - p.x, c.z - p.z) < 2.6 && Math.abs(c.y - p.y) < 3) || null;
  }
  prompt() { const c = this.nearCrate(); return c ? (this.weapons.owned.has(c.id) ? `${c.name} (이미 들고 있어요)` : `${c.name} 훔치기`) : ''; }
  use() {
    const c = this.nearCrate();
    if (!c) return false;
    if (!this.weapons.owned.has(c.id)) { this.weapons.unlock(c.id, '군사 기지에서', '훔쳤어요'); this.police.report(60, true); this.weapons.emit('star', c.x, c.y + 1.4, c.z, 18); }
    return true;
  }
  update(dt) {
    const P = this.player;
    this.cool -= dt;
    const inside = this.inside();
    if (inside && !this.alarm && this.cool <= 0) { this.alarm = true; this.residents.alert = true; this.outT = 0; this.police.report(260, true); }
    if (this.alarm) {
      // 담장 밖으로 나가 10초가 지나고 경찰도 따돌렸으면 경보를 끈다.
      this.outT = inside ? 0 : this.outT + dt;
      if (this.outT > 10 && this.police.level === 0) { this.alarm = false; this.residents.alert = false; this.cool = 20; }
      this.beepT -= dt;
      if (this.beepT <= 0 && this.weapons.sfx.ctx) { this.beepT = 0.75; this.weapons.sfx.tone(this.beepT > 0.4 ? 900 : 640, 620, 0.32, 0.05, 'square'); }
    }
    if (this.el && this.el.hidden === this.alarm) this.el.hidden = !this.alarm;
  }
}
