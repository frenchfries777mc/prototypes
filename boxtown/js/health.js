// 플레이어 체력, 다치는 일들(차에 치임, 주먹, 폭발, 물), 병원과 감옥.
import { SEA } from './terrain.js';
import { clamp, angDiff } from './util.js';
import { Character, randomLook } from './character.js';
const B = window.BABYLON;
const $ = (id) => document.getElementById(id);
const won = (n) => n.toLocaleString('ko-KR');
const HEAL = [5.6, -2.6], PAY = [-9, -6], LABOR = [-10.5, 1], ESCAPE = [13.8, 5]; // 방 안의 발판 위치
const CELL = [-2.5, 8.6]; // 갇히는 감방

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
    if (this.hp <= 0 || (this.jailed && !this.alarm)) return; // 갇혀 있을 때는 탈옥 경보 중에만 다친다
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
    const P = this.player;
    this.fine = 800 + this.police.level * 400;
    P.jailed = true; P.jailAlarm = false; this.alarm = false;
    this.police.clear();
    if (this.jobs.active) this.jobs.quit(true);
    this.interiors.send('jail', CELL[0], CELL[1]);
    this.interiors.locked = true;
    this.jailed = true; this.hp = 100; this.labor = 0; this.esc = 0; this.waterT = 0;
    this.weapons.confiscate(); // 무기는 압수된다
    this.setupJail();
    this.jobs.toast('교도소에 갇혔어요. 무기는 압수됐어요');
  }
  // chase: 나가자마자 쫓기는지(탈옥)
  release(text, good = true, chase = false) {
    const P = this.player;
    this.jailed = false; this.interiors.locked = false; P.jailed = false; P.jailAlarm = false; this.alarm = false;
    this.interiors.leave();
    this.jobs.toast(text, good);
    if (chase) this.police.report(200);
  }

  // 교도소 사람들: 간수 둘(하나는 출입 금지 복도를 오간다)과 죄수 여섯.
  setupJail() {
    const r = this.interiors.rooms.jail, scene = this.player.scene;
    if (!this.guards) {
      const cop = (seed) => new Character(scene, { ...randomLook(seed), shirt: '#2f4fa8', pants: '#1f2a4a', shoes: '#22202b', head: 'cap', hat: '#1f2a4a', brim: '#ffd84a' });
      const con = (seed) => new Character(scene, { ...randomLook(seed), shirt: '#f28b3c', pants: '#f28b3c', shoes: '#22202b', head: 'hair' });
      this.guards = [
        { chr: cop(4242), strip: true, path: [[12.5, 8.6], [12.5, -4]], wait: [2.8, 1.0] }, // 복도 간수: 북쪽 끝에서 잠깐 서 있는다
        { chr: cop(4343), strip: false, path: [[-12, 3.6], [8, 3.6]], wait: [1.5, 1.5] },
      ];
      this.inmates = [[-3, -4.4], [4.5, -4.2], [-6, 2.5], [1, 2.2], [-12.5, 8.4], [7.5, 8.4]].map((h, i) => ({ chr: con(5100 + i * 17), home: h, celled: i >= 4 }));
      for (const m of [...this.guards, ...this.inmates]) { m.pos = new B.Vector3(); m.vel = new B.Vector3(); m.t = 0; }
    }
    for (const g of this.guards) { g.i = 0; g.pause = 0; g.hitT = 0; g.pos.set(r.cx + g.path[1][0], r.y0, r.cz + g.path[1][1]); g.chr.heading = 0; }
    for (const m of this.inmates) { m.pos.set(r.cx + m.home[0], r.y0, r.cz + m.home[1]); m.goal = null; m.t = Math.random() * 3; }
  }
  jailStep(dt) {
    const r = this.interiors.rooms.jail, P = this.player, me = P.feet, px = me.x - r.cx, pz = me.z - r.cz;
    const walk = (m, tx, tz, speed) => {
      const dx = tx - m.pos.x, dz = tz - m.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.15) { m.vel.set(0, 0, 0); return true; }
      m.vel.set((dx / d) * speed, 0, (dz / d) * speed);
      m.pos.x += m.vel.x * dt; m.pos.z += m.vel.z * dt;
      return false;
    };
    for (const g of this.guards) {
      let wish = null;
      const dx = me.x - g.pos.x, dz = me.z - g.pos.z, dist = Math.hypot(dx, dz);
      if (this.alarm) {
        // 경보: 쫓아와서 때린다.
        g.hitT -= dt;
        if (dist > 1.5) walk(g, me.x, me.z, 5.2); else g.vel.set(0, 0, 0);
        wish = Math.atan2(dx, dz);
        if (dist < 1.9 && g.hitT <= 0) { g.hitT = 0.9; g.chr.swing = 1; g.chr.swingTime = 0.3; this.hurt(18, dx / (dist || 1), dz / (dist || 1), 'cop', 2); }
      } else {
        if (g.pause > 0) { g.pause -= dt; g.vel.set(0, 0, 0); }
        else {
          const t = g.path[g.i];
          wish = Math.atan2(r.cx + t[0] - g.pos.x, r.cz + t[1] - g.pos.z);
          if (walk(g, r.cx + t[0], r.cz + t[1], 1.7)) { g.pause = g.wait[g.i]; g.i = (g.i + 1) % g.path.length; wish = null; }
        }
        // 출입 금지 복도에 들어온 것을 간수가 보면 경보가 울린다(등 뒤는 보지 못한다).
        if (g.strip && px > 10.3 && pz > -6.2 && dist < 13 && Math.abs(angDiff(g.chr.heading, Math.atan2(dx, dz))) < 1.05) {
          this.alarm = true; P.jailAlarm = true;
          this.police.report(200, true);
          this.jobs.toast('들켰어요! 간수들이 쫓아와요');
        }
      }
      g.chr.update(dt, { pos: g.pos, vel: g.vel, grounded: true, wishHeading: wish, landed: 0, jumped: false });
    }
    // 죄수들은 제자리 근처를 어슬렁거린다.
    for (const m of this.inmates) {
      m.t -= dt;
      if (m.t <= 0) { m.t = 2 + Math.random() * 5; const k = m.celled ? 1.2 : 3; m.goal = Math.random() < 0.7 ? [m.home[0] + (Math.random() - 0.5) * 2 * k, m.home[1] + (Math.random() - 0.5) * (m.celled ? 2.4 : 2 * k)] : null; }
      let wish = null;
      if (m.goal) { wish = Math.atan2(r.cx + m.goal[0] - m.pos.x, r.cz + m.goal[1] - m.pos.z); if (walk(m, r.cx + m.goal[0], r.cz + m.goal[1], 1.3)) m.goal = null; } else m.vel.set(0, 0, 0);
      const dx = me.x - m.pos.x, dz = me.z - m.pos.z, near = Math.hypot(dx, dz) < 3.5;
      m.chr.wave = near && !m.goal ? 1 : 0;
      m.chr.update(dt, { pos: m.pos, vel: m.vel, grounded: true, wishHeading: wish === null && near ? Math.atan2(dx, dz) : wish, landed: 0, jumped: false });
    }
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
    if (this.at(ESCAPE, 'jail')) return `꾹 눌러 뒷문 따기 (${Math.round((this.esc / 2.5) * 100)}%)`;
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
      if (this.alarm) { this.jobs.toast('경보가 울리는 중에는 받아 주지 않아요'); return true; }
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
      // 노동과 문 따기는 꾹 누르고 있어야 한다.
      const held = P.input.useHeld;
      if (held && this.at(LABOR, 'jail') && !this.alarm) { this.labor += dt; P.chr.sSquash.v -= dt * 9; if (this.labor >= 20) this.release('일을 마치고 풀려났어요'); }
      if (this.jailed && held && this.at(ESCAPE, 'jail')) { this.esc += dt; if (this.esc >= 2.5) this.release('탈옥했어요! 경찰이 눈에 불을 켜고 찾아요', false, true); } else this.esc = Math.max(0, this.esc - dt);
      if (this.jailed) this.jailStep(dt);
    }
    const w = Math.round(this.hp);
    if (w !== this.shown) { this.shown = w; $('hpFill').style.width = w + '%'; $('hpFill').classList.toggle('low', w <= 30); }
  }
}
