// 오른쪽에 뜨는 고르기 창(자동차 판매장, 차고, 가구점이 함께 쓴다).
// open({ title, note, items: [{ id, label, sub, state: 'on' | 'buy' | 'lock' | '' }], pick(id), close() })
const el = () => document.getElementById('shop');
let cur = null;
export const Panel = {
  get open() { return !!cur; },
  show(o) {
    cur = o;
    if (document.pointerLockElement) document.exitPointerLock();
    el().hidden = false; this.render();
  },
  render() {
    if (!cur) return;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const items = typeof cur.items === 'function' ? cur.items() : cur.items, note = typeof cur.note === 'function' ? cur.note() : cur.note;
    el().innerHTML = `<header><b>${esc(cur.title)}</b><span>${esc(note || '')}</span><button data-close>✕</button></header><div class="list">`
      + items.map((it) => `<button data-id="${esc(it.id)}" class="${it.state || ''}"><b>${esc(it.label)}</b><small>${esc(it.sub || '')}</small></button>`).join('') + '</div>';
  },
  close() { if (!cur) return; const c = cur; cur = null; el().hidden = true; if (c.close) c.close(); },
  init() {
    el().addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) return this.close();
      const b = e.target.closest('[data-id]');
      if (b && cur) { cur.pick(b.dataset.id); this.render(); }
    });
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && cur) { e.stopImmediatePropagation(); this.close(); } }, true);
  },
};
