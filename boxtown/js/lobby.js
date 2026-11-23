// 로비: 게임을 켜면 먼저 보이는 화면. 마을을 배경으로 내 캐릭터가 서 있고, 왼쪽에 차림표, 오른쪽에 쪽지(오늘의 일거리, 내 기록), 아래에 속보 자막.
import { stats } from './stats.js';
const B = window.BABYLON;
const $ = (id) => document.getElementById(id);
const won = (n) => Math.round(n).toLocaleString('ko-KR');
const NEWS = ['불량배, 오늘도 주먹 쥐어 보여', '기차는 멈추지 않는다… 건널목에서는 꼭 서세요', '간호사 월급 삭감 충격', '똥 모자 5,000원 절찬 판매 중', '경찰 "길 따라 운전하는 법 배웠다"', '항구 갈매기, 피자 노린다는 제보',
  '옷가게 사장 "변기 뚜껑은 등에 메는 것"', '오늘의 날씨: 네모나게 맑음', '택시 손님 "기사님 여기 바다인데요"', '교도소 탈옥범 "간수 눈만 피하면 돼요"'];

export class Lobby {
  constructor({ player, jobs, wardrobe, music, interiors, input, quality }) {
    Object.assign(this, { player, jobs, wardrobe, music, interiors, input, quality });
    this.open = false; this.t = 0; this.panel = null;
    this.el = $('lobby');
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.act(b.dataset.act);
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && !this.open && !wardrobe.open) this.show();
      else if (e.code === 'Enter' && this.open && !this.panel) this.act('start');
    });
    $('btnLobby').addEventListener('click', () => this.show());
  }
  show() {
    if (this.open) return;
    this.open = true; this.panel = null; this.t = 0;
    if (document.pointerLockElement) document.exitPointerLock();
    document.body.classList.add('lobby');
    this.input.blocked = true;
    this.render();
    this.el.hidden = false;
  }
  hide() {
    this.open = false; this.el.hidden = true; this.wardrobe.close();
    document.body.classList.remove('lobby');
    this.input.blocked = false;
    this.player.freeCam = null; this.player.snap = true;
    this.player.chr.wave = 0; // 로비에서 흔들던 손은 내린다
  }
  act(a) {
    if (a === 'start') return this.hide();
    if (a === 'closet') { this.panel = null; this.render(); return this.wardrobe.toggle(false); }
    if (a === 'music') this.music.toggle();
    else if (a === 'view') this.player.nextView();
    else if (a === 'quality') { const q = this.quality === 'low' ? 'high' : 'low'; try { localStorage.setItem('boxtown.quality', q); } catch (e) { /* 무시 */ } location.reload(); return; }
    else if (a === 'wipe') { if (this.wipeArmed) { try { Object.keys(localStorage).filter((k) => k.startsWith('boxtown.')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* 무시 */ } location.reload(); return; } this.wipeArmed = true; }
    else if (a === 'back') this.panel = null;
    else { this.wardrobe.close(); this.panel = this.panel === a ? null : a; this.wipeArmed = false; }
    this.render();
  }
  render() {
    const q = stats.quests(), s = (k) => stats.get(k), view = ['3인칭', '1인칭', '2인칭'][this.player.view];
    const quest = q.map((x) => `<li class="${x.done ? 'done' : ''}">${x.done ? '✅' : '▫️'} ${x.text} <em>(${won(x.now)}/${won(x.goal)})</em> <b>+${won(x.reward)}원</b></li>`).join('');
    let panel = '';
    if (this.panel === 'settings') panel = `<div class="sheet"><h3>⚙ 설정</h3>
      <button data-act="music">음악 <b>${this.music.muted ? '꺼짐' : '켜짐'}</b></button>
      <button data-act="view">시점 <b>${view}</b></button>
      <button data-act="quality">그래픽 <b>${this.quality === 'low' ? '가볍게' : '좋게'}</b><small>바꾸면 다시 불러와요</small></button>
      <button data-act="wipe" class="danger">${this.wipeArmed ? '정말요? 한 번 더 누르면 전부 지워져요' : '저장 지우고 처음부터'}</button>
      <button data-act="back" class="back">닫기</button></div>`;
    else if (this.panel === 'credits') panel = `<div class="sheet"><h3>🎵 크레딧</h3><div class="text">
      <b>음악</b>"Dentaneosuchus Hunt"<br>"Morning"<br>"Night in Venice"<br>"Zazie"<br>"Divertimento K131"<br>"Galway"<br>Kevin MacLeod (incompetech.com)<br>Licensed under Creative Commons: By Attribution 4.0 License<br>http://creativecommons.org/licenses/by/4.0/
      <b>3D 모델</b>Kenney (kenney.nl) · CC0
      <b>엔진</b>Babylon.js · Havok Physics</div><button data-act="back" class="back">닫기</button></div>`;
    else if (this.panel === 'records') panel = `<div class="sheet"><h3>🏆 내 기록</h3><div class="text rec">
      <span>지금까지 번 돈</span><b>${won(s('earned'))}원</b><span>해낸 일</span><b>${won(s('jobs'))}번</b><span>혼내 준 불량배</span><b>${won(s('kos'))}명</b>
      <span>경찰 따돌리기</span><b>${won(s('escapes'))}번</b><span>붙잡힘</span><b>${won(s('arrests'))}번</b><span>병원 신세</span><b>${won(s('downs'))}번</b>
      <span>기차 탄 횟수</span><b>${won(s('rides'))}번</b><span>가진 치장품</span><b>${this.wardrobe.owned.size}개</b><span>내 집</span><b>${this.interiors.owned.size}채</b></div>
      <button data-act="back" class="back">닫기</button></div>`;
    const news = NEWS.slice().sort(() => Math.random() - 0.5).map((n) => '📢 ' + n).join('　·　');
    this.el.innerHTML = `<div class="shade"></div>
      <div class="left"><h1>박스타운</h1><p class="sub">★ 오늘도 평화로운(?) 네모 마을 ★</p>
        <nav><button data-act="start" class="go">▶ 게임 시작</button><button data-act="closet">👕 옷장</button><button data-act="records">🏆 내 기록</button><button data-act="settings">⚙ 설정</button><button data-act="credits">🎵 크레딧</button></nav></div>
      <div class="money">💰 ${won(this.jobs.money)}원</div>
      <div class="note n1"><h3>📌 오늘의 일거리</h3><ul>${quest}</ul></div>
      <div class="note n2"><h3>🏠 내 살림</h3>집 ${this.interiors.owned.size}채 · 치장품 ${this.wardrobe.owned.size}개<br>해낸 일 ${won(s('jobs'))}번</div>
      ${panel}<div class="ticker"><span>${news}　·　${news}</span></div>`;
  }
  // 로비 카메라: 캐릭터 앞에서 마을을 등지게 잡고 천천히 좌우로 흔들린다. 캐릭터는 화면 오른쪽에 선다.
  update(dt) {
    if (!this.open) return;
    this.t += dt;
    this.el.classList.toggle('closet', this.wardrobe.open);
    const P = this.player, f = P.vehicle ? P.vehicle.pos : P.feet;
    const a = Math.PI + 0.35 + Math.sin(this.t * 0.22) * 0.22, dist = P.vehicle ? 9 : 5.4;
    const cx = f.x + Math.sin(a) * dist, cz = f.z + Math.cos(a) * dist;
    const lx = Math.cos(a), lz = -Math.sin(a); // 카메라에서 본 옆 방향
    const side = this.wardrobe.open ? -1.3 : 1.5;
    if (!P.freeCam) P.freeCam = { pos: new B.Vector3(), target: new B.Vector3() };
    P.freeCam.pos.set(cx + lx * side, f.y + 1.9, cz + lz * side);
    P.freeCam.target.set(f.x + lx * side, f.y + 1.15, f.z + lz * side);
    if (!P.vehicle) { P.chr.heading = a + Math.sin(this.t * 0.5) * 0.15; P.chr.wave = Math.sin(this.t * 0.7) > 0.6 ? 1 : 0; }
    this.input.attackQueued = false; this.input.attackHeld = false; this.input.useQueued = false; this.input.jumpQueued = false; this.input.viewNext = false;
  }
}
