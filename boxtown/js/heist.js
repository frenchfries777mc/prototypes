// 큰 사건: 은행 털기. 은행 금고 앞에서 E를 누르고 버티면 돈 자루를 챙기고, 그 순간 별 셋이 된다.
// 훔친 돈은 경찰을 따돌려야 내 것이 되고, 붙잡히면 전부 빼앗긴다. 금고는 5분 뒤에 다시 찬다.
const won = (n) => n.toLocaleString('ko-KR');
const VAULT = [0, 4.0], OPEN_TIME = 5, REFILL = 300;

export class Heist {
  constructor({ player, jobs, police, interiors, input, weapons }) {
    Object.assign(this, { player, jobs, police, interiors, input, weapons });
    this.loot = 0; this.hold = 0; this.cool = 0; this.wasWanted = false;
    this.el = document.getElementById('loot');
  }
  atVault() {
    const I = this.interiors, r = I.inside && I.inside.id === 'bank' ? I.rooms.bank : null, p = this.player.feet;
    return !!r && Math.hypot(r.cx + VAULT[0] - p.x, r.cz + VAULT[1] - p.z) < 2.4;
  }
  prompt() {
    if (!this.atVault()) return '';
    if (this.cool > 0) return `금고가 비었어요 (${Math.floor(this.cool / 60)}:${String(Math.floor(this.cool % 60)).padStart(2, '0')})`;
    return this.hold > 0 ? `금고 여는 중… ${Math.ceil(OPEN_TIME - this.hold)}` : '금고 털기 (누르고 있기)';
  }
  use() { return this.atVault(); } // 금고 앞에서는 E가 다른 데로 새지 않게
  update(dt) {
    const P = this.player;
    if (this.cool > 0) this.cool -= dt;
    if (this.atVault() && this.cool <= 0 && this.input.useHeld) {
      if (this.hold === 0) this.police.report(60, true); // 손대는 순간 경보
      this.hold += dt; this.police.hotT = 30; // 은행 안에 숨어 있어도 식지 않는다
      if (this.hold >= OPEN_TIME) {
        this.hold = 0; this.cool = REFILL;
        this.loot += 6000 + Math.floor(Math.random() * 40) * 100;
        this.police.report(260, true);
        if (this.weapons.sfx.ctx) this.weapons.sfx.play('pop');
      }
    } else this.hold = 0;
    // 결말: 붙잡히면 빼앗기고, 따돌리면 내 돈이 된다.
    if (this.loot > 0) {
      if (P.jailed) this.loot = 0;
      else if (this.wasWanted && this.police.level === 0) { this.jobs.money += this.loot; try { localStorage.setItem('boxtown.money', String(this.jobs.money)); } catch (e) { /* 무시 */ } this.jobs.renderMoney(); this.loot = 0; if (this.weapons.sfx.ctx) this.weapons.sfx.play('pop'); }
    }
    this.wasWanted = this.police.level > 0;
    const show = this.loot > 0;
    if (this.el.hidden === show) this.el.hidden = !show;
    if (show) { const t = `💰 훔친 돈 ${won(this.loot)}원 · 경찰을 따돌리면 내 것`; if (t !== this.shown) { this.shown = t; this.el.textContent = t; } }
  }
}
