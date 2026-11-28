// 효과음: 전부 WebAudio 로 합성한다(샘플 파일 없음). 사용자 입력 뒤에야 켜진다.
export class Audio {
  constructor() { this.ctx = null; this.master = null; this.mute = false; this.noiseBuf = null; this.last = {}; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      this.ctx = new C(); this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ctx.destination);
      const n = this.ctx.sampleRate * 0.6, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = b;
    } catch (e) { this.ctx = null; }
  }
  ok(key, gap = 0.02) { const t = performance.now() / 1000; if ((this.last[key] || 0) + gap > t) return false; this.last[key] = t; return !this.mute && !!this.ctx; }
  noise(dur, freq, q, vol, vol2 = 0.001, pan = 0, type = 'lowpass') {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(vol2, c.currentTime + dur);
    const p = c.createStereoPanner ? c.createStereoPanner() : null; if (p) p.pan.value = pan;
    s.connect(f); f.connect(g); (p ? (g.connect(p), p.connect(this.master)) : g.connect(this.master)); s.start(); s.stop(c.currentTime + dur + 0.05);
  }
  tone(freq, dur, type, vol, slide = 0, delay = 0) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  // 거리·방향에 따라 작아지는 총성. weapon: 0 소총 1 기관단총 2 경기관총
  shot(weapon, dist = 0, pan = 0) {
    if (!this.ok('shot' + weapon + Math.round(dist / 30), 0.03)) return;
    const v = Math.max(0.03, 1 / (1 + dist / 18)) * 0.9;
    if (weapon === 0) { this.noise(0.45, 1100, 0.7, v, 0.001, pan); this.tone(120, 0.18, 'sine', v * 0.6, 50); }
    else if (weapon === 1) { this.noise(0.14, 2400, 0.8, v * 0.7, 0.001, pan); this.tone(180, 0.07, 'square', v * 0.2, 90); }
    else if (weapon === 3) { this.noise(0.3, 1400, 0.8, v * 0.8, 0.001, pan); this.tone(140, 0.12, 'sine', v * 0.5, 60); }
    else if (weapon === 4) { this.noise(0.5, 800, 0.7, v * 1.0, 0.001, pan); this.tone(70, 0.25, 'sine', v * 0.8, 35); }
    else { this.noise(0.2, 1500, 0.8, v * 0.85, 0.001, pan); this.tone(95, 0.12, 'sine', v * 0.5, 45); }
  }
  heal() { if (this.ok('heal', 0.3)) { [660, 880, 1100].forEach((x, i) => this.tone(x, 0.14, 'sine', 0.16, 0, i * 0.07)); } }
  build() { if (this.ok('build', 0.2)) { this.noise(0.18, 600, 0.9, 0.35); this.tone(110, 0.12, 'square', 0.1, 70); } }
  hit() { if (this.ok('hit', 0.04)) this.tone(1500, 0.05, 'triangle', 0.18, 700); }
  head() { if (this.ok('head', 0.04)) { this.tone(2200, 0.08, 'triangle', 0.22, 1200); } }
  hurt() { if (this.ok('hurt', 0.1)) { this.noise(0.18, 400, 0.7, 0.5); this.tone(90, 0.2, 'sawtooth', 0.3, 45); } }
  kill() { if (this.ok('kill', 0.1)) { this.tone(880, 0.1, 'triangle', 0.2); this.tone(1320, 0.14, 'triangle', 0.2, 0, 0.08); } }
  cap(mine) { if (this.ok('cap', 0.3)) { const f = mine ? [523, 659, 784] : [392, 330, 262]; f.forEach((x, i) => this.tone(x, 0.18, 'triangle', 0.2, 0, i * 0.1)); } }
  reload() { if (this.ok('rel', 0.2)) { this.noise(0.05, 3000, 2, 0.3); this.tone(240, 0.06, 'square', 0.08, 0, 0.35); } }
  step() { if (this.ok('step', 0.12)) this.noise(0.07, 500, 0.8, 0.08); }
  end(win) { if (this.ok('end', 1)) (win ? [523, 659, 784, 1047] : [392, 330, 262, 196]).forEach((x, i) => this.tone(x, 0.26, 'triangle', 0.22, 0, i * 0.14)); }
}
