// 플레이어 체력, 다치는 일들(차에 치임, 주먹, 폭발, 물), 병원과 감옥.
import { SEA } from './terrain.js';
import { clamp } from './util.js';
const B = window.BABYLON;
const $ = (id) => document.getElementById(id);
const won = (n) => n.toLocaleString('ko-KR');
const HEAL = [5.6, -2.6], PAY = [-1.6, -3.2], LABOR = [4.6, -1.6], ESCAPE = [6.8, 3]; // 방 안의 발판 위치

export class Health {
  constructor({ player, jobs, garage, residents, police, interiors, weapons }) {
    Object.assign(this, { player, jobs, garage, residents, police, interiors, weapons });
    this.hp = 100; this.calm = 0; this.waterT = 0; this.hitCd = 0; this.jailed = false; this.fine = 0; this.labor = 0; this.esc = 0; this.shown = -1;
    residents.onPunch = (n, dx, dz) => this.hurt(n.kind === 'cop' ? 14 : 11, dx, dz, n.kind, 3);
    residents.onCarHit = (c, n) => { c.hp -= 6; if (c === player.vehicle) police.report(n.kind === 'cop' ? 80 : 40); }; // 차로 사람을 치면 경찰이 온다
    weapons.onBlast = (amount) => this.hurt(amount, 0, 0, 'blast');
    police.onArrest = () => this.jail();
  }

  hurt(amount, dx = 0, dz = 0, cause = '', kick = 0) {
    if (this.hp <= 0 || this.jailed) return;
    this.hp = Math.max(0, this.hp - amount);
    this.calm = 0;
    const P = this.player;
    P.chr.bump(dx, dz, 1.5); P.shake = Math.max(P.shake, 0.35);
    if (kick && !P.vehicle) P.kick = new B.Vector3(dx * kick, 3, dz * kick);
    const el = $('hurt'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    this.weapons.sfx.play('hit');
    if (this.hp <= 0) this.die(cause);
  }

  // 쓰러지면: 경찰에게 당했거나 수배 중이면 감옥, 아니면 병원에서 깨어난다.
  die(cause) {
    if (cause === 'cop' || cause === 'police' || this.police.level > 0) return this.jail();
    const fee = Math.min(this.jobs.money, 150);
    this.jobs.spend(fee);
    if (this.jobs.active) this.jobs.quit(true);
    this.interiors.send('hospital', -2.6, 1.2);
    this.hp = 100; this.waterT = 0;
    this.jobs.toast(cause === 'water' ? `물에 빠져 병원에 실려 왔어요${fee ? ` (치료비 ${won(fee)}원)` : ''}` : `병원에서 깨어났어요${fee ? ` (치료비 ${won(fee)}원)` : ''}`);
  }
  jail() {
    this.fine = 800 + this.police.level * 400;
    this.police.clear();
    if (this.jobs.active) this.jobs.quit(true);
    this.interiors.send('jail', 4, 3.4);
    this.interiors.locked = true;
    this.jailed = true; this.hp = 100; this.labor = 0; this.esc = 0; this.waterT = 0;
    this.jobs.toast('감옥에 갇혔어요. 벌금, 노동, 탈옥 중 하나로 나갈 수 있어요');
  }
  release(text, good = true) {
    this.jailed = false; this.interiors.locked = false;
    this.interiors.leave();
    this.jobs.toast(text, good);
  }

  // 지금 서 있는 발판: 방 좌표 [x, z]에서 1.5m 안
  at(spot, room) {
    const I = this.interiors, r = I.inside && I.inside.id === room && I.rooms[room], p = this.player.feet;
    return !!r && Math.hypot(r.cx + spot[0] - p.x, r.cz + spot[1] - p.z) < 1.6;
  }
  healCost() { return Math.ceil((100 - this.hp) * 4 / 10) * 10; }
  prompt() {
    if (this.at(HEAL, 'hospital')) return this.hp >= 100 ? '아픈 데가 없어요' : `치료받기 (${won(this.healCost())}원)`;
    if (!this.jailed) return '';
    if (this.at(PAY, 'jail')) return `벌금 내고 나가기 (${won(this.fine)}원)`;
    if (this.at(LABOR, 'jail')) return `꾹 눌러 돌 깨기 (${Math.round((this.labor / 20) * 100)}%)`;
    if (this.at(ESCAPE, 'jail')) return '꾹 눌러 몰래 빠져나가기';
    return '';
  }
  use() {
    if (this.at(HEAL, 'hospital')) {
      if (this.hp >= 100) return true;
      if (!this.jobs.spend(this.healCost())) { this.jobs.toast(`돈이 모자라요 (${won(this.healCost())}원 필요)`); return true; }
      this.hp = 100; this.jobs.toast('말끔히 나았어요!', true);
      return true;
    }
    if (!this.jailed) return false;
    if (this.at(PAY, 'jail')) {
      if (!this.jobs.spend(this.fine)) this.jobs.toast(`돈이 모자라요 (${won(this.fine)}원 필요)`); else this.release('벌금을 내고 풀려났어요');
      return true;
    }
    return this.at(LABOR, 'jail') || this.at(ESCAPE, 'jail');
  }

  update(dt) {
    const P = this.player, me = P.feet, onFoot = !P.vehicle;
    this.hitCd -= dt; this.calm += dt;
    if (this.calm > 10 && this.hp > 0 && this.hp < 100) this.hp = Math.min(100, this.hp + dt * 1.5); // 한동안 안 다치면 천천히 낫는다
    // 달리는 차에 치이면 크게 다치고 날아간다.
    if (onFoot && !P.inside && this.hitCd <= 0) {
      for (const c of this.garage.cars) {
        const dx = me.x - c.pos.x, dz = me.z - c.pos.z;
        if (Math.abs(dx) > 6 || Math.abs(dz) > 6 || Math.abs(me.y - c.pos.y) > 2.5) continue;
        const v = c.body.getLinearVelocity(), sp = Math.hypot(v.x, v.z);
        if (sp < 4) continue;
        const lx = dx * c.right.x + dz * c.right.z, lz = dx * c.fwd.x + dz * c.fwd.z - c.zc;
        if (Math.abs(lx) > c.width / 2 + 0.45 || Math.abs(lz) > c.length / 2 + 0.45) continue;
        this.hitCd = 0.9;
        P.kick = new B.Vector3(v.x * 0.9, 6 + sp * 0.2, v.z * 0.9);
        c.hp -= 5;
        this.hurt(clamp(sp * 4.2, 15, 75), v.x / sp, v.z / sp, c.police ? 'police' : 'car');
        break;
      }
    }
    // 물에 빠진 채 3초가 지나면 쓰러진다.
    if (onFoot && !P.inside && me.y < SEA - 0.9) {
      const before = Math.ceil(3 - this.waterT);
      this.waterT += dt;
      const left = Math.ceil(3 - this.waterT);
      if (left !== before || this.waterT === dt) this.jobs.toast(`물에 빠졌어요! ${Math.max(left, 1)}…`);
      if (this.waterT >= 3) { this.hp = 0; this.die('water'); }
    } else this.waterT = 0;
    // 감옥: 노동과 탈옥은 꾹 누르고 있어야 한다.
    if (this.jailed) {
      const held = P.input.useHeld;
      if (held && this.at(LABOR, 'jail')) { this.labor += dt; P.chr.sSquash.v -= dt * 9; if (this.labor >= 20) this.release('일을 마치고 풀려났어요'); }
      if (held && this.at(ESCAPE, 'jail')) { this.esc += dt; if (this.esc >= 3) { this.release('탈옥했어요! 경찰이 눈에 불을 켜고 찾아요', false); this.police.report(200); } } else this.esc = 0;
    }
    const w = Math.round(this.hp);
    if (w !== this.shown) { this.shown = w; $('hpFill').style.width = w + '%'; $('hpFill').classList.toggle('low', w <= 30); }
  }
}
