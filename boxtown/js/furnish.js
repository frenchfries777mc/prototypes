// 집 꾸미기: 내 집 안에서 F(또는 🪑 버튼)로 가구를 사서 발 앞에 놓는다. 가까이 가서 E로 치우면 값의 절반을 돌려받는다.
// 놓은 가구는 집마다 브라우저에 저장된다. 좌표는 방 가운데 기준.
import { Panel } from './panel.js';
const won = (n) => n.toLocaleString('ko-KR');
const MAX = 40;
// [모델, 이름, 값]
const ITEMS = [['loungeSofa', '소파', 900], ['loungeChair', '안락의자', 600], ['bedDouble', '큰 침대', 1500], ['bedSingle', '침대', 900], ['bedBunk', '이층 침대', 1400], ['table', '식탁', 600], ['tableRound', '둥근 탁자', 600], ['tableCoffee', '낮은 탁자', 400],
  ['chair', '의자', 200], ['chairCushion', '방석 의자', 300], ['desk', '책상', 700], ['chairDesk', '책상 의자', 400], ['bookcaseOpen', '책장', 800], ['bookcaseClosedWide', '넓은 장식장', 1000], ['cabinetTelevision', 'TV 장', 700], ['televisionModern', '텔레비전', 1800],
  ['televisionVintage', '옛날 텔레비전', 900], ['computerScreen', '컴퓨터', 1500], ['kitchenFridge', '냉장고', 1400], ['kitchenStove', '가스레인지', 1000], ['kitchenSink', '싱크대', 800], ['kitchenBar', '바 탁자', 700], ['stoolBar', '바 의자', 300], ['washer', '세탁기', 1100],
  ['lampRoundFloor', '스탠드', 400], ['pottedPlant', '화분', 300], ['plantSmall1', '작은 화분', 150], ['rugRectangle', '네모 깔개', 400], ['rugRound', '둥근 깔개', 400], ['bench', '벤치', 400], ['speaker', '스피커', 800], ['radio', '라디오', 400], ['bear', '곰 인형', 1200], ['toilet', '변기', 500], ['bathroomSink', '세면대', 500], ['trashcan', '휴지통', 100], ['coatRackStanding', '옷걸이', 300]];
const PRICE = Object.fromEntries(ITEMS.map((i) => [i[0], i[2]]));

export class Furnish {
  constructor({ assets, player, jobs, interiors }) {
    Object.assign(this, { assets, player, jobs, interiors });
    this.data = {}; this.meshes = new Map(); this.shownRoom = null;
    try { this.data = JSON.parse(localStorage.getItem('boxtown.furn') || '{}') || {}; } catch (e) { /* 무시 */ }
    addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !e.repeat) this.toggle(); });
    document.getElementById('btnFurn').addEventListener('click', () => this.toggle());
  }
  home() { const d = this.interiors.inside; return d && d.house && this.interiors.owned.has(d.id) ? d : null; }
  room() { const d = this.home(); return d ? this.interiors.rooms[d.room] : null; }
  save() { try { localStorage.setItem('boxtown.furn', JSON.stringify(this.data)); } catch (e) { /* 무시 */ } }
  list(d) { return this.data[d.id] || (this.data[d.id] = []); }
  spawn(d, it) {
    const r = this.interiors.rooms[d.room];
    let m;
    try { m = this.assets.spawn('furniture/' + it[0], 'furn', false); } catch (e) { return null; }
    m.rotationQuaternion = null; m.position.set(r.cx + it[1], r.y0, r.cz + it[2]); m.rotation.y = it[3]; m.isPickable = false;
    this.meshes.get(d.id).push([it, m]);
    return m;
  }
  // 집에 들어서면 그 집 가구를 꺼내 놓고, 나가면 숨긴다.
  sync() {
    const d = this.home(), id = d ? d.id : null;
    if (id === this.shownRoom) return;
    if (this.shownRoom && this.meshes.has(this.shownRoom)) for (const [, m] of this.meshes.get(this.shownRoom)) m.setEnabled(false);
    this.shownRoom = id;
    if (!d) { if (Panel.open && this.mine) Panel.close(); return; }
    if (!this.meshes.has(id)) { this.meshes.set(id, []); for (const it of this.list(d)) this.spawn(d, it); }
    for (const [, m] of this.meshes.get(id)) m.setEnabled(true);
  }
  nearPiece() {
    const d = this.home(), r = this.room(), p = this.player.feet;
    if (!d || !this.meshes.has(d.id)) return null;
    let best = null, bd = 1.5;
    for (const e of this.meshes.get(d.id)) { const dist = Math.hypot(r.cx + e[0][1] - p.x, r.cz + e[0][2] - p.z); if (dist < bd) { bd = dist; best = e; } }
    return best;
  }
  prompt() { if (!this.home() || this.interiors.atExit()) return ''; const e = this.nearPiece(); return e ? `${(ITEMS.find((i) => i[0] === e[0][0]) || [0, '가구'])[1]} 치우기 (+${won(Math.floor(PRICE[e[0][0]] / 2))}원)` : ''; }
  use() {
    if (!this.home() || this.interiors.atExit()) return false;
    const e = this.nearPiece(), d = this.home();
    if (!e) return false;
    const L = this.list(d), k = L.indexOf(e[0]); if (k >= 0) L.splice(k, 1);
    const M = this.meshes.get(d.id), j = M.indexOf(e); if (j >= 0) M.splice(j, 1);
    e[1].dispose();
    this.jobs.money += Math.floor(PRICE[e[0][0]] / 2); this.jobs.renderMoney(); try { localStorage.setItem('boxtown.money', String(this.jobs.money)); } catch (err) { /* 무시 */ }
    this.save();
    return true;
  }
  toggle() {
    if (Panel.open) { if (this.mine) Panel.close(); return; }
    const d = this.home();
    if (!d) return;
    this.mine = true; this.note = '';
    Panel.show({
      title: '가구점', note: () => this.note || `고르면 발 앞에 놓여요 (${this.list(d).length}/${MAX}). 가까이서 E로 치워요`,
      items: () => ITEMS.map(([k, name, price]) => ({ id: k, label: name, sub: won(price) + '원', state: 'buy' })),
      pick: (k) => {
        const r = this.room(), P = this.player;
        if (!r || !PRICE[k]) return;
        if (this.list(d).length >= MAX) { this.note = '더 놓을 자리가 없어요'; return; }
        // 발 앞 1.3m, 벽 안쪽으로. 방향은 90도 단위로 맞춘다.
        const yaw = Math.round(P.chr.heading / (Math.PI / 2)) * (Math.PI / 2);
        const x = Math.max(-r.w / 2 + 0.7, Math.min(r.w / 2 - 0.7, P.feet.x + Math.sin(P.chr.heading) * 1.3 - r.cx)), z = Math.max(-r.d / 2 + 0.7, Math.min(r.d / 2 - 0.7, P.feet.z + Math.cos(P.chr.heading) * 1.3 - r.cz));
        if (Math.abs(x) < 1.6 && z < -r.d / 2 + 2.4) { this.note = '문 앞에는 놓을 수 없어요'; return; }
        if (!this.jobs.spend(PRICE[k])) { this.note = '돈이 모자라요'; return; }
        const it = [k, Math.round(x * 100) / 100, Math.round(z * 100) / 100, yaw + Math.PI];
        this.list(d).push(it); this.spawn(d, it); this.save(); this.note = '';
      },
      close: () => { this.mine = false; },
    });
  }
  update() {
    this.sync();
    const btn = document.getElementById('btnFurn'), on = !!this.home();
    if (btn.hidden === on) btn.hidden = !on;
  }
}
