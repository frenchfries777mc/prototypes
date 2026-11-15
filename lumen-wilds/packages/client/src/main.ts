import { ATTACK_COOLDOWN_TICKS, C, DIR_NONE, DT, MAX_NAME, Recipe } from '@lw/shared';
import { Hud } from './hud';
import { Net } from './net';
import { Renderer } from './render';
import { ClientState } from './state';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const TOKEN_KEY = 'lw.token', NAME_KEY = 'lw.name';

/** localStorage는 사생활 보호 모드 등에서 예외를 던질 수 있으므로 없어도 동작하게 감싼다. */
const storage = {
  get(k: string): string { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } },
  set(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 게임은 된다 */ } },
};

const login = $<HTMLFormElement>('login'), nameInput = $<HTMLInputElement>('name'), status = $('status');
nameInput.value = storage.get(NAME_KEY);
nameInput.focus();
login.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const name = nameInput.value.trim().slice(0, MAX_NAME) || '모험가';
  status.textContent = '접속 중…';
  start(name).catch((e: Error) => { status.textContent = e.message; });
});

async function start(name: string): Promise<void> {
  const net = new Net();
  const state = new ClientState(net, name);
  net.onMessage = (m) => state.handle(m, performance.now());
  await net.connect();
  net.send({ t: C.Join, name, token: storage.get(TOKEN_KEY) });
  await new Promise<void>((ok, fail) => {
    state.onWelcome = (token) => { storage.set(TOKEN_KEY, token); storage.set(NAME_KEY, name); ok(); };
    setTimeout(() => fail(new Error('서버 응답이 없습니다.')), 5000);
  });
  login.classList.add('hidden');

  const renderer = new Renderer($<HTMLCanvasElement>('game'));
  const hud = new Hud(state, renderer, (recipe) => net.send({ t: C.Craft, recipe }));
  state.onStats = () => hud.refreshStats();
  state.onChat = (_id, who, text) => hud.chat(who, text);
  state.onHit = (x, y, amount, targetId) => hud.floater(x, y, amount, targetId === state.me.id, performance.now());
  state.onRemove = (e) => renderer.removeEntity(e, performance.now());
  net.onClose = () => { status.textContent = '서버와의 연결이 끊겼습니다. 새로고침해 주세요.'; login.classList.remove('hidden'); };
  if (import.meta.env.DEV) Object.assign(window, { __lw: { state, renderer } });

  // ───────── 입력 ─────────
  const keys = new Set<string>();
  const chatInput = $<HTMLInputElement>('chatinput');
  const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };
  addEventListener('keydown', (ev) => {
    if (document.activeElement === chatInput) {
      if (ev.key === 'Enter') {
        const text = chatInput.value.trim();
        if (text) net.send({ t: C.Chat, text });
        chatInput.value = '';
        chatInput.blur();
      } else if (ev.key === 'Escape') chatInput.blur();
      return;
    }
    if (ev.key === 'Enter') { chatInput.focus(); keys.clear(); ev.preventDefault(); return; }
    if (ev.code === 'Digit1') net.send({ t: C.Craft, recipe: Recipe.Weapon });
    else if (ev.code === 'Digit2') net.send({ t: C.Craft, recipe: Recipe.Armor });
    else if (ev.code === 'Digit3') net.send({ t: C.Craft, recipe: Recipe.Potion });
    keys.add(ev.code);
    if (ev.code === 'Space' || ev.code.startsWith('Arrow')) ev.preventDefault();
  });
  addEventListener('keyup', (ev) => keys.delete(ev.code));
  addEventListener('blur', () => { keys.clear(); mouse.down = false; });
  const canvas = $('game');
  canvas.addEventListener('mousedown', (ev) => { if (ev.button === 0) mouse.down = true; });
  addEventListener('mouseup', () => { mouse.down = false; });
  addEventListener('mousemove', (ev) => { mouse.x = ev.clientX; mouse.y = ev.clientY; });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  /** 화면 기준 입력을 월드 8방향으로 바꾼다. 화면 위쪽은 월드 (-1,-1), 오른쪽은 (1,-1)이다. */
  const readDir = (): number => {
    const sx = +(keys.has('KeyD') || keys.has('ArrowRight')) - +(keys.has('KeyA') || keys.has('ArrowLeft'));
    const sy = +(keys.has('KeyW') || keys.has('ArrowUp')) - +(keys.has('KeyS') || keys.has('ArrowDown'));
    if (!sx && !sy) return DIR_NONE;
    return (Math.round(Math.atan2(-sx - sy, sx - sy) / (Math.PI / 4)) + 8) % 8;
  };

  // ───────── 루프 ─────────
  let last = performance.now(), acc = 0, nextAttack = 0;
  setInterval(() => net.send({ t: C.Ping, time: performance.now() }), 2000);
  const frame = (now: number) => {
    const dt = Math.min(0.25, (now - last) / 1000); // 탭이 멈췄다 돌아왔을 때 한꺼번에 몰아치지 않게
    last = now;
    acc += dt;
    while (acc >= DT) {
      state.tick(readDir(), now);
      if ((mouse.down || keys.has('Space')) && now >= nextAttack) {
        const aim = renderer.screenToWorld(mouse.x, mouse.y);
        state.attack(Math.atan2(aim.y - state.me.y, aim.x - state.me.x), now);
        nextAttack = now + ATTACK_COOLDOWN_TICKS * DT * 1000 + 30;
      }
      acc -= DT;
    }
    state.interpolate(now);
    renderer.render(state, acc / DT, now, dt);
    hud.update(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
