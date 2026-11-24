// 로비: 게임을 켜면 먼저 보이는 화면. 마을을 배경으로 내 캐릭터가 서 있고, 왼쪽에 차림표, 오른쪽에 쪽지(오늘의 일거리, 내 기록), 아래에 속보 자막.
import { Panel } from './panel.js';
import { stats } from './stats.js';
const B = window.BABYLON;
const $ = (id) => document.getElementById(id);
const won = (n) => Math.round(n).toLocaleString('ko-KR');
const NEWS = ['불량배, 오늘도 주먹 쥐어 보여', '기차는 멈추지 않는다… 건널목에서는 꼭 서세요', '간호사 월급 삭감 충격', '똥 모자 5,000원 절찬 판매 중', '경찰 "길 따라 운전하는 법 배웠다"', '항구 갈매기, 피자 노린다는 제보',
  '옷가게 사장 "변기 뚜껑은 등에 메는 것"', '오늘의 날씨: 네모나게 맑음', '택시 손님 "기사님 여기 바다인데요"', '교도소 탈옥범 "간수 눈만 피하면 돼요"'];

export class Lobby {
  constructor({ player, jobs, wardrobe, music, interiors, input, quality, net, dealer }) {
    Object.assign(this, { player, jobs, wardrobe, music, interiors, input, quality, net, dealer });
    net.onChange = () => { if (this.open && this.panel === 'multi') this.render(); };
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
    this.el.addEventListener('inputkey', (e) => { if (e.detail === 'Enter' && e.target.id === 'mpCode') this.act('mjoin'); });
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
    Panel.close(); // 차고 창이 열린 채 게임으로 나가지 않게
    this.open = false; this.el.hidden = true; this.wardrobe.close();
    document.body.classList.remove('lobby');
    this.input.blocked = false;
    this.player.freeCam = null; this.player.snap = true;
    this.player.chr.wave = 0; // 로비에서 흔들던 손은 내린다
  }
  act(a) {
    if (a === 'start') return this.hide();
    if (a === 'garage') { this.panel = null; this.wardrobe.close(); this.render(); return this.dealer.open(false); }
    if (a === 'closet') { this.panel = null; this.render(); return this.wardrobe.toggle(false); }
    // 같이 하기: 이름과 코드는 다시 그리기 전에 입력칸에서 읽어 둔다.
    const nameEl = document.getElementById('mpName'), codeEl = document.getElementById('mpCode');
    if (nameEl) this.net.setName(nameEl.value);
    if (codeEl) this.codeDraft = codeEl.value;
    if (a === 'mhost') { this.net.host(); return this.render(); }
    if (a === 'mjoin') { this.net.join(this.codeDraft); return this.render(); }
    if (a === 'mleave') { this.net.leave(); return this.render(); }
    if (a === 'mcopy') { try { navigator.clipboard.writeText(this.net.code); this.copied = true; } catch (e) { /* 무시 */ } return this.render(); }
    if (a === 'music') this.music.toggle();
    else if (a === 'view') this.player.nextView();
    else if (a === 'quality') { const q = { high: 'low', low: 'lite', lite: 'high' }[this.quality] || 'low'; try { localStorage.setItem('boxtown.quality', q); } catch (e) { /* 무시 */ } location.reload(); return; }
    else if (a === 'wipe') { if (this.wipeArmed) { try { Object.keys(localStorage).filter((k) => k.startsWith('boxtown.')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* 무시 */ } location.reload(); return; } this.wipeArmed = true; }
    else if (a === 'back') this.panel = null;
    else { this.wardrobe.close(); this.panel = this.panel === a ? null : a; this.wipeArmed = false; this.copied = false; }
    this.render();
  }
  render() {
    const q = stats.quests(), s = (k) => stats.get(k), view = ['3인칭', '1인칭', '2인칭'][this.player.view];
    const quest = q.map((x) => `<li class="${x.done ? 'done' : ''}">${x.done ? '✅' : '▫️'} ${x.text} <em>(${won(x.now)}/${won(x.goal)})</em> <b>+${won(x.reward)}원</b></li>`).join('');
    let panel = '';
    if (this.panel === 'settings') panel = `<div class="sheet"><h3>⚙ 설정</h3>
      <button data-act="music">음악 <b>${this.music.muted ? '꺼짐' : '켜짐'}</b></button>
      <button data-act="view">시점 <b>${view}</b></button>
      <button data-act="quality">그래픽 <b>${{ high: '좋게', low: '가볍게', lite: '아주 가볍게' }[this.quality] || '가볍게'}</b><small>바꾸면 다시 불러와요</small></button>
      <button data-act="wipe" class="danger">${this.wipeArmed ? '정말요? 한 번 더 누르면 전부 지워져요' : '저장 지우고 처음부터'}</button>
      <button data-act="back" class="back">닫기</button></div>`;
    else if (this.panel === 'multi') {
      const N = this.net, esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const who = N.list().map((p) => `<li>${p.host ? '👑' : '🙂'} ${esc(p.name)}${p.me ? ' <em>(나)</em>' : ''}</li>`).join('');
      panel = `<div class="sheet multi"><h3>👥 같이 하기</h3>
        <label>내 이름<input id="mpName" maxlength="12" value="${esc(N.name)}" ${N.mode ? 'disabled' : ''}></label>
        ${N.on ? `<div class="code"><small>방 코드 (친구에게 알려 주세요)</small><b>${N.code}</b><button data-act="mcopy">${this.copied ? '복사됨!' : '복사'}</button></div><ul class="who">${who}</ul>
          <p class="tip">게임 중 T 또는 Enter로 채팅해요. 주민·경찰·일거리는 각자 따로 돌아가요.</p><button data-act="mleave" class="danger">방 나가기</button>`
        : N.mode ? `<p class="tip">${esc(N.status || '연결하는 중…')}</p><button data-act="mleave" class="danger">그만두기</button>`
        : `<button data-act="mhost" class="primary">방 만들기</button>
          <div class="join"><input id="mpCode" maxlength="5" placeholder="방 코드" value="${esc(this.codeDraft || '')}" autocapitalize="characters" autocomplete="off"><button data-act="mjoin" class="primary">들어가기</button></div>
          ${N.status ? `<p class="tip warn">${esc(N.status)}</p>` : '<p class="tip">한 사람이 방을 만들고, 나머지는 코드로 들어와요. 최대 8명.</p>'}`}
        <button data-act="back" class="back">닫기</button></div>`;
    }
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
        <nav><button data-act="start" class="go">▶ 게임 시작</button><button data-act="multi">👥 같이 하기${this.net.on ? ` <em>${this.net.count}명</em>` : ''}</button><button data-act="closet">👕 옷장</button><button data-act="garage">🚗 차고</button><button data-act="records">🏆 내 기록</button><button data-act="settings">⚙ 설정</button><button data-act="credits">🎵 크레딧</button></nav></div>
      <div class="money">💰 ${won(this.jobs.money)}원</div>
      <div class="note n1"><h3>📌 오늘의 일거리</h3><ul>${quest}</ul></div>
      <div class="note n2"><h3>🏠 내 살림</h3>집 ${this.interiors.owned.size}채 · 치장품 ${this.wardrobe.owned.size}개<br>해낸 일 ${won(s('jobs'))}번</div>
      ${panel}<div class="ticker"><span>${news}</span></div>`;
  }
  // 로비 카메라: 캐릭터 앞에서 마을을 등지게 잡고 천천히 좌우로 흔들린다. 캐릭터는 화면 오른쪽에 선다.
  update(dt) {
    if (!this.open) return;
    this.t += dt;
    this.el.classList.toggle('closet', this.wardrobe.open);
    const P = this.player, f = P.vehicle ? P.vehicle.pos : P.feet;
    const cvs = document.getElementById('game'), aspect = cvs.clientWidth / Math.max(1, cvs.clientHeight);
    const a = (this.baseAngle !== undefined ? this.baseAngle : Math.PI / 2) + Math.sin(this.t * 0.22) * 0.22, dist = (P.vehicle ? 9 : 5.4) * (aspect < 1 ? 1.35 : 1);
    const cx = f.x + Math.sin(a) * dist, cz = f.z + Math.cos(a) * dist;
    const lx = Math.cos(a), lz = -Math.sin(a); // 카메라에서 본 옆 방향
    // 캐릭터가 화면의 오른쪽 가운데쯤 오도록, 화면 폭(가로세로 비율)에 맞춰 옆으로 옮긴다(세로 화면에서 잘리던 것).
    const half = Math.tan(0.475) * aspect * dist, side = (this.wardrobe.open || Panel.open ? -0.36 : 0.36) * half;
    if (!P.freeCam) P.freeCam = { pos: new B.Vector3(), target: new B.Vector3() };
    P.freeCam.pos.set(cx + lx * side, f.y + 1.9, cz + lz * side);
    P.freeCam.target.set(f.x + lx * side, f.y + 1.15, f.z + lz * side);
    if (!P.vehicle) { P.chr.heading = a + Math.sin(this.t * 0.5) * 0.15; P.chr.wave = Math.sin(this.t * 0.7) > 0.6 ? 1 : 0; }
    this.input.attackQueued = false; this.input.attackHeld = false; this.input.useQueued = false; this.input.jumpQueued = false; this.input.viewNext = false;
  }
}
