// 배경 음악: 상황에 따라 한 곡만 튼다(겹치지 않게 서서히 바꾼다).
// 곡은 모두 Kevin MacLeod (incompetech.com), CC BY 4.0. 전체 표기는 assets/music/CREDITS.txt.
const TRACKS = {
  wanted: { file: 'dentaneosuchus-hunt-1.mp3', title: 'Dentaneosuchus Hunt 1' }, // 수배 중
  land: { file: 'morning.mp3', title: 'Morning' }, // 시작 대륙
  indoor: { file: 'night-in-venice.mp3', title: 'Night in Venice' }, // 건물 안
  island: { file: 'zazie.mp3', title: 'Zazie' }, // 다른 섬
  home: { file: 'divertimento-k131.mp3', title: 'Divertimento K131' }, // 내 집
};
const VOL = 0.4;

export class Music {
  // pick(): 지금 틀어야 할 곡의 이름(위 TRACKS의 키)
  constructor(pick) {
    this.pick = pick; this.cur = null; this.audio = {}; this.unlocked = false; this.creditT = 0; this.hold = 0;
    this.muted = false;
    try { this.muted = localStorage.getItem('boxtown.mute') === '1'; } catch (e) { /* 무시 */ }
    // 브라우저는 사용자가 한 번 누르기 전에는 소리를 못 낸다.
    const unlock = () => { this.unlocked = true; };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, unlock, { once: true, passive: true });
    addEventListener('keydown', (e) => { if (e.code === 'KeyN') this.toggle(); });
    this.el = document.getElementById('music');
    this.el.addEventListener('click', () => this.toggle());
  }
  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem('boxtown.mute', this.muted ? '1' : '0'); } catch (e) { /* 무시 */ }
    this.credit();
  }
  get(name) {
    if (!this.audio[name]) { const a = new Audio('assets/music/' + TRACKS[name].file); a.loop = true; a.volume = 0; a.preload = 'none'; this.audio[name] = a; }
    return this.audio[name];
  }
  credit() {
    const t = TRACKS[this.cur];
    if (!t) return;
    this.el.textContent = this.muted ? '♪ 음악 꺼짐 (N)' : `♪ "${t.title}" Kevin MacLeod (incompetech.com) · CC BY 4.0`;
    this.el.classList.add('show');
    this.creditT = 7;
  }
  update(dt) {
    if (!this.unlocked) return;
    // 곡이 너무 자주 바뀌지 않게, 바꿀 상황이 1초 넘게 이어질 때만 바꾼다.
    const want = this.pick();
    if (want !== this.cur) { this.hold += dt; if (this.hold > (this.cur ? 1 : 0)) { this.cur = want; this.hold = 0; this.credit(); } } else this.hold = 0;
    for (const name in TRACKS) {
      const on = name === this.cur && !this.muted;
      if (!on && !this.audio[name]) continue;
      const a = this.get(name), target = on ? VOL : 0;
      a.volume = Math.max(0, Math.min(1, a.volume + Math.sign(target - a.volume) * Math.min(Math.abs(target - a.volume), dt * 0.5)));
      if (on && a.paused) a.play().catch(() => {});
      if (!on && !a.paused && a.volume <= 0.001) a.pause(); // 멈춘 자리에서 다음에 이어 튼다
    }
    if (this.creditT > 0) { this.creditT -= dt; if (this.creditT <= 0) this.el.classList.remove('show'); }
  }
}
