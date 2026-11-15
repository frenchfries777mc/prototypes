import { Biome, EntityKind, ITEM_COUNT, ITEM_NAMES, MAX_TIER, Recipe, recipeCost } from '@lw/shared';
import type { Renderer } from './render';
import type { ClientState } from './state';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const MAP_COLORS = ['#3f86d8', '#e4d294', '#74b64e', '#4f9641', '#92959f', '#f0f4f8'];

interface Floater { el: HTMLElement; x: number; y: number; h: number; born: number; }

export class Hud {
  private labels = new Map<number, { el: HTMLElement; bar?: HTMLElement }>();
  private floaters: Floater[] = [];
  private layer = $('labels');
  private map = $<HTMLCanvasElement>('minimap').getContext('2d')!;
  private lastMap = 0;
  private pos = { x: 0, y: 0 };
  private craftButtons: HTMLButtonElement[] = [];
  private invCells: HTMLElement[] = [];

  constructor(private state: ClientState, private renderer: Renderer, onCraft: (recipe: number) => void) {
    for (const id of ['hud', 'chat', 'mapwrap', 'net']) $(id).classList.remove('hidden');
    $('who').textContent = state.me.name;
    const inv = $('inv');
    for (let i = 0; i < ITEM_COUNT; i++) {
      const d = document.createElement('div');
      d.innerHTML = `<b>0</b><small>${ITEM_NAMES[i]}</small>`;
      inv.append(d);
      this.invCells.push(d.firstElementChild as HTMLElement);
    }
    const craft = $('craft');
    for (const recipe of [Recipe.Weapon, Recipe.Armor, Recipe.Potion]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.addEventListener('click', () => { onCraft(recipe); b.blur(); });
      craft.append(b);
      this.craftButtons.push(b);
    }
    this.refreshStats();
  }

  refreshStats(): void {
    const s = this.state.stats;
    $('level').textContent = String(s.level);
    const xp = $('xp');
    (xp.firstElementChild as HTMLElement).style.width = `${Math.min(100, (s.xp / s.xpNext) * 100)}%`;
    xp.lastElementChild!.textContent = `경험치 ${s.xp} / ${s.xpNext}`;
    s.inv.forEach((n, i) => { this.invCells[i]!.textContent = String(n); });
    const titles = [`[1] 무기 강화 (${s.weapon}/${MAX_TIER})`, `[2] 갑옷 강화 (${s.armor}/${MAX_TIER})`, '[3] 물약 마시기'];
    this.craftButtons.forEach((b, recipe) => {
      const cost = recipeCost(recipe, s.weapon, s.armor);
      const text = cost ? cost.map((n, i) => (n ? `${ITEM_NAMES[i]} ${n}` : '')).filter(Boolean).join(' · ') : '최대 단계';
      b.innerHTML = `${titles[recipe]}<br><small>${text}</small>`;
      b.disabled = !cost || cost.some((n, i) => s.inv[i]! < n);
    });
  }

  chat(name: string, text: string): void {
    const log = $('chatlog'), line = document.createElement('div');
    if (name) { const b = document.createElement('b'); b.textContent = `${name}: `; line.append(b); } else line.className = 'sys';
    line.append(text); // textContent 경로로만 넣어 다른 플레이어의 입력이 HTML로 해석되지 않게 한다
    log.append(line);
    while (log.childElementCount > 40) log.firstElementChild!.remove();
  }

  floater(x: number, y: number, amount: number, onMe: boolean, now: number): void {
    const el = document.createElement('div');
    el.className = onMe ? 'dmg me' : 'dmg';
    el.textContent = String(amount);
    this.layer.append(el);
    this.floaters.push({ el, x, y, h: this.renderer.groundAt(this.state.world, x, y) + 1, born: now });
  }

  update(now: number): void {
    const { state, renderer, pos } = this;
    const me = state.me;
    const hp = $('hp');
    (hp.firstElementChild as HTMLElement).style.width = `${(me.hp / me.maxHp) * 100}%`;
    hp.lastElementChild!.textContent = `체력 ${me.hp} / ${me.maxHp}`;
    $('net').textContent = `지연 ${Math.round(state.rtt)}ms · 주변 ${state.ents.size}`;

    // 이름표: 다른 플레이어는 항상, 몬스터는 다쳤을 때만 체력 막대를 보인다.
    for (const e of state.ents.values()) {
      const isPlayer = e.kind === EntityKind.Player;
      const show = isPlayer || e.hp < e.maxHp;
      let l = this.labels.get(e.id);
      if (!show) { if (l) { l.el.remove(); this.labels.delete(e.id); } continue; }
      if (!l) {
        const el = document.createElement('div');
        el.className = 'label';
        if (isPlayer) el.textContent = `${e.name} Lv.${e.level}`;
        const mini = document.createElement('div');
        mini.className = 'mini';
        const bar = document.createElement('i');
        mini.append(bar);
        el.append(mini);
        this.layer.append(el);
        this.labels.set(e.id, (l = { el, bar }));
      }
      renderer.toScreen(e.x, renderer.groundAt(state.world, e.x, e.y) + renderer.viewHeight(e.id) + 0.15, e.y, pos);
      l.el.style.left = `${pos.x}px`; l.el.style.top = `${pos.y}px`;
      l.bar!.style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;
    }
    for (const [id, l] of this.labels) if (!state.ents.has(id)) { l.el.remove(); this.labels.delete(id); }

    this.floaters = this.floaters.filter((f) => {
      const t = (now - f.born) / 700;
      if (t >= 1) { f.el.remove(); return false; }
      renderer.toScreen(f.x, f.h + t * 0.9, f.y, pos);
      f.el.style.left = `${pos.x}px`; f.el.style.top = `${pos.y}px`;
      f.el.style.opacity = String(1 - t * t);
      return true;
    });

    if (now - this.lastMap > 400) { this.lastMap = now; this.drawMap(); }
  }

  private drawMap(): void {
    const { map, state } = this, size = 90, half = size / 2, step = 2;
    const px = Math.floor(state.me.x), py = Math.floor(state.me.y);
    // 한 픽셀이 2×2 타일. 캔버스는 CSS에서 45° 돌려 화면 방향과 맞춘다.
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        const x = px + (i - half) * step, y = py + (j - half) * step;
        const b = state.world.tileBiome(x, y);
        map.fillStyle = b !== Biome.Water && state.world.liveNode(x, y) ? '#2f6a2c' : MAP_COLORS[b]!;
        map.fillRect(i, j, 1, 1);
      }
    for (const e of state.ents.values()) {
      const i = half + (e.x - px) / step, j = half + (e.y - py) / step;
      if (i < 0 || j < 0 || i >= size || j >= size) continue;
      map.fillStyle = e.kind === EntityKind.Player ? '#ffffff' : '#e5484d';
      map.fillRect(Math.round(i) - 1, Math.round(j) - 1, 2, 2);
    }
    map.fillStyle = '#ffd166';
    map.fillRect(half - 1, half - 1, 3, 3);
  }
}
