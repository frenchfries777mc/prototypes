// 오른쪽에 뜨는 고르기 창(자동차 판매장, 차고, 가구점이 함께 쓴다).
// show({ title, note, items: [{ id, label, sub, state }], pick(id), close(), detail?(id) })
// detail(id)가 있으면 항목을 누르면 먼저 '선택'되어 아래에 자세한 정보(가로 막대)와 버튼이 뜨고, 버튼을 눌러야 pick(id)가 불린다.
// detail(id) -> { name, bars: [{ label, ratio(0~1), text }], action: { label, state: 'buy' | 'on' | 'lock' } }
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
    if (cur.detail && cur.sel !== undefined && !items.some((i) => i.id === cur.sel)) cur.sel = undefined;
    const list = items.map((it) => `<button data-id="${esc(it.id)}" class="${it.state || ''}${cur.sel === it.id ? ' sel' : ''}"><b>${esc(it.label)}</b><small>${esc(it.sub || '')}</small></button>`).join('');
    let det = '';
    if (cur.detail && cur.sel !== undefined) {
      const d = cur.detail(cur.sel);
      if (d) det = `<div class="detail"><h4>${esc(d.name)}</h4>${d.bars.map((b) => `<div class="bar"><span>${esc(b.label)}</span><i><u style="width:${Math.round(Math.max(0.04, Math.min(1, b.ratio)) * 100)}%"></u></i><em>${esc(b.text)}</em></div>`).join('')}<button data-go class="${d.action.state || ''}">${esc(d.action.label)}</button></div>`;
    } else if (cur.detail) det = '<div class="detail hint">차를 눌러 성능을 보세요</div>';
    el().innerHTML = `<header><b>${esc(cur.title)}</b><span>${esc(note || '')}</span><button data-close>✕</button></header><div class="list">${list}</div>${det}`;
    const sel = el().querySelector('.list .sel'); if (sel && cur.keepScroll === undefined) sel.scrollIntoView({ block: 'nearest' });
  },
  close() { if (!cur) return; const c = cur; cur = null; el().hidden = true; if (c.close) c.close(); },
  init() {
    el().addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) return this.close();
      if (e.target.closest('[data-go]') && cur && cur.sel !== undefined) { cur.pick(cur.sel); this.render(); return; }
      const b = e.target.closest('[data-id]');
      if (!b || !cur) return;
      if (cur.detail) { cur.sel = b.dataset.id; if (cur.onSelect) cur.onSelect(cur.sel); this.render(); return; }
      cur.pick(b.dataset.id); this.render();
    });
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && cur) { e.stopImmediatePropagation(); this.close(); } }, true);
  },
};
