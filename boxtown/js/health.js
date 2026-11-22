// 플레이어 체력, 다치는 일들(차에 치임, 주먹, 폭발, 물), 병원과 감옥.
import { SEA } from './terrain.js';
import { clamp } from './util.js';
import { Character, randomLook } from './character.js';
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
    this.jailed = true; this.hp = 100; this.labor = 0; this.esc = 0; this.waterT = 0; this.spotted = false;
    this.weapons.confiscate(); // 무기는 압수된다
    this.jobs.toast('감옥에 갇혔어요. 무기는 압수됐어요');
  }
  release(text, good = true) {
    this.jailed = false; this.interiors.locked = false;
    this.interiors.leave();
    this.jobs.toast(text, good);
    if (this.spotted) { this.spotted = false; this.police.report(200); } // 탈옥하다 들켰으면 나가서도 쫓긴다
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
    if (this.at(ESCAPE, 'jail')) return this.watching ? '간수가 보고 있어요… 기다리세요' : `지금! 꾹 눌러 문 따기 (${Math.round((this.esc / 4) * 100)}%)`;
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

  // 간수: 감방 앞을 지키며 몇 초마다 감방 쪽을 봤다가 등을 돌린다.
  guardStep(dt) {
    const r = this.interiors.rooms.jail;
    if (!this.guard) {
      this.guard = new Character(this.player.scene, { ...randomLook(4242), shirt: '#2f4fa8', pants: '#1f2a4a', shoes: '#22202b', head: 'cap', hat: '#1f2a4a', brim: '#ffd84a' });
      this.guardPos = new B.Vector3(r.cx + 2.6, r.y0, r.cz - 0.2);
      this.guard.heading = 0.8; this.watching = true; this.guardT = 3;
    }
    this.guardT -= dt;
    if (this.guardT <= 0) { this.watching = !this.watching; this.guardT = this.watching ? 2.2 + Math.random() * 2 : 2.6 + Math.random() * 2.4; }
    // 볼 때는 탈옥 문 쪽(북동), 안 볼 때는 반대쪽
    this.guard.update(dt, { pos: this.guardPos, vel: B.Vector3.Zero(), grounded: true, wishHeading: this.watching ? 0.9 : 0.9 + Math.PI, landed: 0, jumped: false });
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
      // 탈옥: 간수가 등을 돌린 동안에만 문을 딴다. 보는 중에 건드리면 들킨다(진행은 남는다).
      this.guardStep(dt);
      if (held && this.at(ESCAPE, 'jail')) {
        if (this.watching) {
          if (!this.caughtCd || this.caughtCd <= 0) { this.caughtCd = 2.5; this.spotted = true; this.fine += 600; this.esc = Math.max(0, this.esc - 1.5); this.jobs.toast('들켰어요! 벌금이 오르고, 나가면 경찰이 쫓아와요'); }
        } else { this.esc += dt; if (this.esc >= 4) { this.spotted = false; this.release('탈옥했어요! 경찰이 눈에 불을 켜고 찾아요', false); this.police.report(200); } }
      }
      this.caughtCd = (this.caughtCd || 0) - dt;
    }
    const w = Math.round(this.hp);
    if (w !== this.shown) { this.shown = w; $('hpFill').style.width = w + '%'; $('hpFill').classList.toggle('low', w <= 30); }
  }
}
