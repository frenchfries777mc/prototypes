(function (global) {
'use strict';
const MATH = ['sin', 'cos', 'tan', 'abs', 'floor', 'ceil', 'round', 'min', 'max', 'sqrt', 'pow', 'atan2', 'sign'];
const PROP_OK = /^(x|y|vx|vy|size|angle|alive|name|hp|maxHp|age|text|color|speed|gravity|onGround|inWater|score|length)$/;
const KEYNAME = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', ' ': 'space', Space: 'space', Spacebar: 'space', Enter: 'enter', NumpadEnter: 'enter', Shift: 'shift', ShiftLeft: 'shift', ShiftRight: 'shift' };
const KEYCODE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 32: 'space', 13: 'enter', 16: 'shift' };
const BAD_IDS = new Set(['new', 'this', 'typeof', 'instanceof', 'in', 'of', 'void', 'delete', 'function', 'class', 'await', 'yield', 'async', 'arguments', 'super', 'import', 'export', 'return', 'var', 'let', 'const']);
const OPS = ['>>>=', '===', '!==', '**=', '<<=', '>>=', '>>>', '...', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];
class Fallback extends Error { }
const FB = () => { const e = new Fallback(); if (globalThis.FF_CONV_DEBUG) console.log(e.stack.split("\n").slice(2,4).join(" | ")); throw e; };

/* ---------- tokens ---------- */
function tokenize(src) {
  const toks = []; let i = 0, nl = true;
  const regexOk = () => { const p = toks[toks.length - 1]; return !p || (p.type === 'op' && p.t !== '++' && p.t !== '--') || (p.type === 'p' && '([{,;:?'.includes(p.t)) || (p.type === 'id' && /^(return|typeof|case|do|else|in|of|new|delete|void|throw)$/.test(p.t)); };
  while (i < src.length) {
    const c = src[i], s = i;
    if (c === '\n') { nl = true; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); if (src.slice(i, e < 0 ? src.length : e).includes('\n')) nl = true; i = e < 0 ? src.length : e + 2; continue; }
    let type, t;
    if (c === '"' || c === "'") { i++; while (i < src.length && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1; i++; type = 'str'; }
    else if (c === '`') {
      i++; let d = 0;
      while (i < src.length) { if (src[i] === '\\') { i += 2; continue; } if (!d && src[i] === '`') break; if (src[i] === '$' && src[i + 1] === '{') { d++; i += 2; continue; } if (d && src[i] === '}') d--; i++; }
      i++; type = 'tpl';
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) { const m = src.slice(i).match(/^(0[xX][0-9a-fA-F]+|(\d[\d_]*\.?\d*|\.\d+)([eE][+-]?\d+)?)/); i += m[0].length; type = 'num'; }
    else if (/[\p{L}_$]/u.test(c)) { const m = src.slice(i).match(/^[\p{L}\p{N}_$]+/u); i += m[0].length; type = 'id'; }
    else if (c === '/' && regexOk()) { i++; let cls = false; while (i < src.length && src[i] !== '\n') { if (src[i] === '\\') { i += 2; continue; } if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; else if (src[i] === '/' && !cls) break; i++; } i++; while (/[a-z]/.test(src[i] || '')) i++; type = 're'; }
    else { const op = OPS.find(o => src.startsWith(o, i)); if (op) { i += op.length; type = 'op'; } else { i++; type = '()[]{},;:?.'.includes(c) ? 'p' : 'op'; } }
    t = src.slice(s, i);
    toks.push({ t, type, s, e: i, nl, i: toks.length }); nl = false;
  }
  return toks;
}
const isP = (tk, t) => tk && tk.type === 'p' && tk.t === t;
const isId = (tk, t) => tk && tk.type === 'id' && (t == null || tk.t === t);
function matchClose(toks, i) {
  const open = toks[i].t, close = { '(': ')', '[': ']', '{': '}' }[open]; let d = 0;
  for (let j = i; j < toks.length; j++) { if (toks[j].type !== 'p') continue; if ('([{'.includes(toks[j].t)) d++; else if (')]}'.includes(toks[j].t)) { d--; if (!d) return toks[j].t === close ? j : -1; } }
  return -1;
}

/* ---------- statements ---------- */
function parse(toks, from, to) {
  const out = []; let p = from;
  const CONT = new Set(['.', '?.', '=', '+', '-', '*', '/', '%', '&&', '||', '??', '==', '===', '!=', '!==', '<', '>', '<=', '>=', ',', '?', ':', '=>', '+=', '-=', '*=', '/=', '(', '[', '{', '**', '&', '|', '^']);
  function stmt() {
    const s = p, tk = toks[p];
    const done = (o) => Object.assign(o, { from: s, to: p });
    if (isP(tk, ';')) { p++; return done({ k: 'empty' }); }
    if (isP(tk, '{')) { const e = matchClose(toks, p); if (e < 0 || e >= to) FB(); const body = parse(toks, p + 1, e); p = e + 1; return done({ k: 'block', body }); }
    if (isId(tk, 'function') && isId(toks[p + 1])) {
      const name = toks[p + 1].t; if (!isP(toks[p + 2], '(')) FB();
      const pe = matchClose(toks, p + 2); if (pe < 0 || !isP(toks[pe + 1], '{')) FB();
      const be = matchClose(toks, pe + 1); if (be < 0 || be >= to) FB();
      const params = toks.slice(p + 3, pe);
      const node = { k: 'func', name, params, bodyFrom: pe + 2, bodyTo: be };
      p = be + 1; return done(node);
    }
    if (isId(tk, 'if') && isP(toks[p + 1], '(')) {
      const ce = matchClose(toks, p + 1); if (ce < 0) FB();
      const cond = toks.slice(p + 2, ce); p = ce + 1;
      const then = stmt(); let alt = null;
      if (isId(toks[p], 'else')) { p++; alt = stmt(); }
      return done({ k: 'if', cond, then, alt });
    }
    if ((isId(tk, 'for') || isId(tk, 'while') || isId(tk, 'with') || isId(tk, 'switch')) && isP(toks[p + 1], '(')) {
      const ce = matchClose(toks, p + 1); if (ce < 0) FB();
      const head = toks.slice(p + 2, ce); p = ce + 1;
      const body = stmt();
      return done({ k: tk.t, head, body });
    }
    if (isId(tk, 'do')) { p++; stmt(); if (isId(toks[p], 'while') && isP(toks[p + 1], '(')) { p = matchClose(toks, p + 1) + 1; if (isP(toks[p], ';')) p++; } return done({ k: 'raw' }); }
    if (isId(tk, 'try')) {
      p++; const blk = () => { if (!isP(toks[p], '{')) FB(); p = matchClose(toks, p) + 1; };
      blk(); if (isId(toks[p], 'catch')) { p++; if (isP(toks[p], '(')) p = matchClose(toks, p) + 1; blk(); } if (isId(toks[p], 'finally')) { p++; blk(); }
      return done({ k: 'raw' });
    }
    if (isId(tk, 'class')) { while (p < to && !isP(toks[p], '{')) p++; p = matchClose(toks, p) + 1; if (p <= 0) FB(); return done({ k: 'raw' }); }
    let d = 0;
    while (p < to) {
      const t = toks[p];
      if (t.type === 'p') {
        if ('([{'.includes(t.t)) d++;
        else if (')]}'.includes(t.t)) { if (!d) break; d--; }
        else if (t.t === ';' && !d) { p++; break; }
      }
      p++;
      if (!d && p < to && toks[p].nl) {
        const prev = toks[p - 1], nx = toks[p];
        if (!CONT.has(prev.t) && !(nx.type === 'op' && CONT.has(nx.t) && nx.t !== '++' && nx.t !== '--') && !isP(nx, '.') && !isP(nx, '?') && !isP(nx, ':') && !isP(nx, ',') && !isP(nx, '?.')) break;
      }
    }
    if (p === s) p++;
    return done({ k: 'expr' });
  }
  while (p < to) out.push(stmt());
  return out;
}

/* ---------- expressions ---------- */
function unquote(t) {
  const q0 = t[0], body = t.slice(1, -1);
  if (t[t.length - 1] !== q0) FB();
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, e) => {
    if (e[0] === 'u' && e.length > 1) return String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ''), 16));
    if (e[0] === 'x' && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: '\n', t: '\t', r: '', b: '', f: '', v: '', 0: '' }[e] != null ? { n: '\n', t: '\t', r: '', b: '', f: '', v: '', 0: '' }[e] : e;
  });
}
const jsq = raw => { const b = raw.replace(/\\/g, '\\\\'); return !raw.includes('"') ? '"' + b + '"' : !raw.includes("'") ? "'" + b + "'" : '"' + b.replace(/"/g, '\\"') + '"'; };
const ffStr = v => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"';
function splitTop(toks, sep) {
  const parts = [[]]; let d = 0;
  for (const t of toks) {
    if (t.type === 'p' && '([{'.includes(t.t)) d++;
    if (t.type === 'p' && ')]}'.includes(t.t)) d--;
    if (!d && t.t === sep && (t.type === 'p' || t.type === 'op')) { parts.push([]); continue; }
    parts[parts.length - 1].push(t);
  }
  return parts;
}
function tplParts(t, cx) {
  const body = t.slice(1, -1), out = []; let i = 0, lit = '';
  while (i < body.length) {
    if (body[i] === '\\') { lit += unquote('"' + body.slice(i, i + 2) + '"'); i += 2; continue; }
    if (body[i] === '$' && body[i + 1] === '{') {
      let d = 1, j = i + 2; while (j < body.length && d) { if (body[j] === '{') d++; else if (body[j] === '}') d--; j++; }
      if (/[{}"]/.test(lit)) FB();
      out.push(lit.replace(/\n/g, ' ')); lit = '';
      out.push('{' + expr(tokenize(body.slice(i + 2, j - 1)), cx) + '}'); i = j; continue;
    }
    lit += body[i++];
  }
  if (/[{}"]/.test(lit)) FB();
  out.push(lit.replace(/\n/g, ' '));
  return '"' + out.join('') + '"';
}
function textArg(toks, cx) {
  if (toks.length === 1 && toks[0].type === 'str') { const v = unquote(toks[0].t); if (/[{}]/.test(v)) FB(); return ffStr(v); }
  if (toks.length === 1 && toks[0].type === 'tpl') return tplParts(toks[0].t, cx);
  const plus = splitTop(toks, '+');
  if (plus.length > 1 && plus.some(p => p.length === 1 && p[0].type === 'str') && plus.every(p => p.length)) {
    const firstStr = plus.findIndex(p => p.length === 1 && p[0].type === 'str');
    if (firstStr <= 1) {
      let out = '';
      for (const p of plus) {
        if (p.length === 1 && p[0].type === 'str') { const v = unquote(p[0].t); if (/[{}"]/.test(v)) FB(); out += v.replace(/\n/g, ' '); }
        else if (p.length === 1 && p[0].type === 'tpl') out += tplParts(p[0].t, cx).slice(1, -1);
        else { const e = expr(p, cx); if (/["{}]/.test(e)) FB(); out += '{' + e + '}'; }
      }
      return '"' + out + '"';
    }
  }
  const e = expr(toks, cx); return '"{' + e + '}"';
}
function expr(toks, cx) {
  if (!toks.length) FB();
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], nx = toks[i + 1];
    if (cx.banned && t.type === 'id' && cx.banned.has(t.t) && !isP(toks[i - 1], '.') && !(cx.rename && cx.rename[t.t])) FB();
    if (t.type === 'num') { const v = Number(t.t.replace(/_/g, '')); if (!isFinite(v)) FB(); out.push(String(v)); continue; }
    if (t.type === 'str') { const v = unquote(t.t); out.push(JSON.stringify(v)); continue; }
    if (t.type === 'tpl' || t.type === 're') FB();
    if (t.type === 'id') {
      if (BAD_IDS.has(t.t)) FB();
      if (t.t === 'undefined') { out.push('null'); continue; }
      if (t.t === 'Math' && isP(nx, '.') && isId(toks[i + 2])) {
        const m = toks[i + 2].t;
        if (m === 'PI') { out.push('PI'); i += 2; continue; }
        if (m === 'random' && isP(toks[i + 3], '(') && isP(toks[i + 4], ')')) { out.push('(random(0, 1000000) / 1000000)'); i += 4; continue; }
        if (m === 'floor' && isP(toks[i + 3], '(')) {
          const ce = matchClose(toks, i + 3), inner = toks.slice(i + 4, ce);
          if (ce > 0 && inner.length === 7 && isId(inner[0], 'Math') && isId(inner[2], 'random') && isP(inner[3], '(') && isP(inner[4], ')') && inner[5].t === '*' && inner[6].type === 'num') {
            out.push(`random(0, ${Number(inner[6].t) - 1})`); i = ce; continue;
          }
        }
        if (MATH.includes(m) && isP(toks[i + 3], '(')) { out.push(m); i += 2; continue; }
        FB();
      }
      if (isP(nx, '.') && isId(toks[i + 2], 'includes') && isP(toks[i + 3], '(') && !isP(toks[i - 1], '.')) {
        const ce = matchClose(toks, i + 3), args = ce > 0 ? splitTop(toks.slice(i + 4, ce), ',') : [];
        if (args.length !== 1 || !args[0].length || (cx.banned && cx.banned.has(t.t))) FB();
        out.push('contains(' + (cx.rename && cx.rename[t.t] ? cx.rename[t.t] : t.t) + ', ' + expr(args[0], cx) + ')'); i = ce; continue;
      }
      if (isP(nx, '(') && !(cx.calls && cx.calls.has(t.t))) FB();
      const nm = cx.rename && cx.rename[t.t] ? cx.rename[t.t] : t.t;
      if (isP(toks[i - 1], '.')) { if (!PROP_OK.test(t.t) || isP(nx, '(')) FB(); out.push(t.t); continue; }
      out.push(nm); continue;
    }
    if (t.type === 'op') {
      const map = { '===': '==', '!==': '!=', '&&': 'and', '||': 'or', '!': 'not' };
      if (map[t.t]) { out.push(map[t.t]); continue; }
      if (['+', '-', '*', '/', '%', '<', '>', '<=', '>=', '==', '!=', '**'].includes(t.t)) { out.push(t.t); continue; }
      FB();
    }
    if (t.type === 'p') {
      if (t.t === '.') { if (!isId(nx) || !out.length) FB(); out.push('.'); continue; }
      if ('(),?:[]'.includes(t.t)) { out.push(t.t); continue; }
      FB();
    }
  }
  return out.join(' ').replace(/ \. /g, '.').replace(/\( /g, '(').replace(/ \)/g, ')').replace(/ ,/g, ',').replace(/([\p{L}\p{N}_]) \(/gu, (m, a) => a + '(').replace(/\b(and|or|not)\(/g, '$1 (').replace(/([\p{L}\p{N}_\]]) \[ /gu, '$1[').replace(/\[ /g, '[').replace(/ \]/g, ']');
}
const term = (s) => /\s/.test(s) && !/^\(.*\)$/.test(s) ? '(' + s + ')' : s;

/* ---------- converter ---------- */
function convertJS(src, opts) {
  opts = opts || {};
  const toks = tokenize(src), memo = new Map(), all = [];
  const reg = st => { all.push(st); if (st.k === 'block') st.body.forEach(reg); if (st.k === 'if') { reg(st.then); if (st.alt) reg(st.alt); } if (st.k === 'for' || st.k === 'while' || st.k === 'with' || st.k === 'switch') reg(st.body); };
  const P = (a, b) => { const key = a + ':' + b; if (!memo.has(key)) { let r; try { r = parse(toks, a, b); } catch (e) { r = [{ k: 'raw', from: a, to: b }]; } r.forEach(reg); memo.set(key, r); } return memo.get(key); };
  const X = (a, b) => { const key = 'x' + a + ':' + b; if (!memo.has(key)) { const r = { k: 'expr', from: a, to: b }; reg(r); memo.set(key, r); } return memo.get(key); };
  const tree = P(0, toks.length);
  const parentOf = t => { let best = null; for (const s of all) if (s !== t && s.from <= t.from && t.to <= s.to && (s.to - s.from > t.to - t.from || s.k === 'block' || s.k === 'if' || s.k === 'for' || s.k === 'func') && (!best || s.to - s.from <= best.to - best.from)) { if (best && s.to - s.from === best.to - best.from && all.indexOf(s) < all.indexOf(best)) continue; best = s; } return best; };
  const rawOf = (st) => {
    const a = toks[st.from], b = toks[st.to - 1];
    if (!a) return '';
    let txt = src.slice(lineStart(a.s), b.e);
    const lines = txt.split('\n'), first = src.slice(lineStart(a.s), a.s);
    if (first.trim()) lines[0] = lines[0].slice(first.length);
    const ind = Math.min(...lines.filter(l => l.trim()).slice(1).map(l => l.match(/^\s*/)[0].length), lines[0] ? a.s - lineStart(a.s) : 99);
    return lines.map((l, i) => i === 0 ? l.trim() : l.slice(Math.min(ind, l.match(/^\s*/)[0].length))).join('\n').replace(/\s+$/, '');
  };
  function lineStart(pos) { return src.lastIndexOf('\n', pos - 1) + 1; }
  const funcs = new Set(), listVars = new Set();
  for (const st of tree) {
    if (st.k === 'func') funcs.add(st.name);
    if (st.k === 'expr' && /^(let|const|var)$/.test(toks[st.from].t) && isId(toks[st.from + 1]) && toks[st.from + 2] && toks[st.from + 2].t === '=' && isP(toks[st.from + 3], '[')) listVars.add(toks[st.from + 1].t);
    if (st.k === 'expr' && /^(let|const|var)$/.test(toks[st.from].t) && isId(toks[st.from + 1]) && toks[st.from + 2] && toks[st.from + 2].t === '=' && (isId(toks[st.from + 3], 'function') || toks.slice(st.from + 3, st.to).some(t => t.t === '=>'))) funcs.add(toks[st.from + 1].t);
  }

  function emit(lines, st, ind) {
    return { lines, st, ind };
  }
  function jsLines(st, ind, cx) {
    const tk = toks.slice(st.from, st.to);
    if (cx.banned && tk.some((t, i) => t.type === 'id' && cx.banned.has(t.t) && !isP(tk[i - 1], '.'))) FB();
    const raw = rawOf(st); if (!raw) return [];
    cx.stats.js++;
    if (!raw.includes('\n')) return [[ind, 'JS ' + jsq(raw), st, raw]];
    return [[ind, 'JS', st, raw], ...raw.split('\n').filter(l => l.trim()).map(l => [ind + 2, l, st, null, true])];
  }
  function body(st, ind, cx) {
    const list = st.k === 'block' ? st.body : [st];
    const out = [];
    for (const s of list) out.push(...conv(s, ind, cx));
    if (!out.length) FB();
    return out;
  }
  function fnExpr(tk, cx) {
    let i = 0, params = [];
    if (isId(tk[0], 'async')) FB();
    if (isId(tk[0], 'function')) { i = 1; if (isId(tk[1])) i = 2; if (!isP(tk[i], '(')) FB(); const e = matchClose(tk, i); params = tk.slice(i + 1, e); i = e + 1; if (!isP(tk[i], '{')) FB(); }
    else if (isP(tk[0], '(')) { const e = matchClose(tk, 0); params = tk.slice(1, e); i = e + 1; if (!(tk[i] && tk[i].t === '=>')) FB(); i++; }
    else if (isId(tk[0]) && tk[1] && tk[1].t === '=>') { params = [tk[0]]; i = 2; }
    else FB();
    const names = params.filter(t => !isP(t, ','));
    if (names.some(t => t.type !== 'id')) FB();
    const base = tk[0].i;
    if (isP(tk[i], '{')) { const e = matchClose(tk, i); if (e !== tk.length - 1) FB(); return { params: names.map(t => t.t), stmts: P(base + i + 1, base + e) }; }
    return { params: names.map(t => t.t), stmts: [X(base + i, base + tk.length)] };
  }
  function hasReturn(stmts) { return stmts.some(s => toks.slice(s.from, s.to).some(t => isId(t, 'return') || isId(t, 'this') || isId(t, 'arguments'))); }
  function convFunc(name, params, stmts, ind, cx, st) {
    if (!cx.top || hasReturn(stmts) || !stmts.length) FB();
    const sub = Object.assign({}, cx, { top: false, fn: true });
    const out = []; for (const s of stmts) out.push(...conv(s, ind + 2, sub));
    if (!out.length) FB();
    return [[ind, 'to ' + name + (params.length ? ' ' + params.join(' ') : ''), st], ...out];
  }
  function secs(tk, cx) {
    if (tk.length === 1 && tk[0].type === 'num') return String(Math.max(0.05, Number(tk[0].t) / 1000));
    return '(' + expr(tk, cx) + ') / 1000';
  }
  function keyConds(cond, ev) {
    const keys = [];
    for (const part of splitTop(cond, '||')) {
      let tk = part;
      if (isP(tk[0], '(') && matchClose(tk, 0) === tk.length - 1) tk = tk.slice(1, -1);
      if (tk.length !== 5 || !isId(tk[0], ev) || !isP(tk[1], '.') || !['===', '=='].includes(tk[3].t)) return null;
      const prop = tk[2].t, v = tk[4];
      let k = null;
      if ((prop === 'key' || prop === 'code') && v.type === 'str') { const s = unquote(v.t); k = KEYNAME[s] || (s.length === 1 ? s.toLowerCase() : /^Key[A-Z]$/.test(s) ? s.slice(3).toLowerCase() : /^Digit\d$/.test(s) ? s.slice(5) : null); }
      else if ((prop === 'keyCode' || prop === 'which') && v.type === 'num') { const n = Number(v.t); k = KEYCODE[n] || (n >= 65 && n <= 90 ? String.fromCharCode(n + 32) : n >= 48 && n <= 57 ? String(n - 48) : null); }
      if (!k || !/^[\w]+$/.test(k)) return null;
      keys.push(k);
    }
    return keys;
  }
  function convListener(type, fn, ind, cx, st) {
    if (!cx.top) FB();
    const { params, stmts } = fn;
    const sub = Object.assign({}, cx, { top: false, banned: new Set([...(cx.banned || []), ...params]) });
    if (/^(click|mousedown|pointerdown|touchstart)$/.test(type)) {
      const out = []; for (const s of stmts) out.push(...conv(s, ind + 2, sub));
      if (!out.length) FB();
      return [[ind, 'if click', st], ...out];
    }
    if (!/^(keydown|keypress)$/.test(type)) FB();
    const ev = params[0], out = [];
    if (!ev) FB();
    const skip = s => s.k === 'empty' || (s.k === 'expr' && toks.slice(s.from, s.to).map(t => t.t).join('').replace(/;$/, '') === ev + '.preventDefault()');
    const walk = (s) => {
      if (skip(s)) return;
      if (s.k === 'block') { s.body.forEach(walk); return; }
      if (s.k !== 'if') FB();
      const ks = keyConds(s.cond, ev); if (!ks) FB();
      const inner = body(s.then, ind + 2, sub);
      for (const k of ks) out.push([ind, 'if key ' + k, s], ...inner);
      if (s.alt) { if (s.alt.k !== 'if') FB(); walk(s.alt); }
    };
    stmts.forEach(walk);
    if (!out.length) FB();
    return out;
  }
  function callParts(tk) {
    let i = 0;
    while (i < tk.length && !isP(tk[i], '(')) i++;
    if (i >= tk.length || i === 0) return null;
    const e = matchClose(tk, i);
    if (e !== tk.length - 1 && !(e === tk.length - 2 && isP(tk[tk.length - 1], ';'))) return null;
    const callee = tk.slice(0, i).map(t => t.t).join('');
    const args = tk.slice(i + 1, e).length ? splitTop(tk.slice(i + 1, e), ',') : [];
    return { callee, args };
  }
  function conv(st, ind, cx) {
    if (st.fb) return jsLines(st, ind, cx);
    try { return conv1(st, ind, cx); }
    catch (e) { if (!(e instanceof Fallback)) throw e; st.fb = true; return jsLines(st, ind, cx); }
  }
  function conv1(st, ind, cx) {
    let tk = toks.slice(st.from, st.to);
    if (tk.length && isP(tk[tk.length - 1], ';')) tk = tk.slice(0, -1);
    switch (st.k) {
      case 'empty': return [];
      case 'block': { const out = []; for (const s of st.body) out.push(...conv(s, ind, cx)); return out; }
      case 'func': {
        const params = st.params.filter(t => !isP(t, ','));
        if (params.some(t => t.type !== 'id')) FB();
        return convFunc(st.name, params.map(t => t.t), P(st.bodyFrom, st.bodyTo), ind, cx, st);
      }
      case 'if': {
        const top = cx.top, i0 = top ? ind + 2 : ind, sub = top ? Object.assign({}, cx, { top: false }) : cx;
        const lines = [[i0, 'if ' + expr(st.cond, sub), st], ...body(st.then, i0 + 2, sub)];
        let a = st.alt;
        while (a) {
          if (a.k === 'if' && !a.fb) { lines.push([i0, 'else if ' + expr(a.cond, sub), a], ...body(a.then, i0 + 2, sub)); a = a.alt; }
          else { lines.push([i0, 'else', a], ...body(a, i0 + 2, sub)); a = null; }
        }
        return top ? [[ind, 'after 0 sec', st], ...lines] : lines;
      }
      case 'for': {
        if (st.head.some(t => isId(t, 'of')) && !st.head.some(t => t.t === ';')) {
          let h = st.head; if (/^(let|const|var)$/.test(h[0].t)) h = h.slice(1);
          if (h.length < 3 || !isId(h[0]) || !isId(h[1], 'of') || (cx.banned && cx.banned.has(h[0].t))) FB();
          const v = h[0].t, sub0 = Object.assign({}, cx, { top: false });
          return [[ind, 'loop each ' + v + ' in ' + expr(h.slice(2), sub0), st], ...body(st.body, ind + 2, sub0)];
        }
        const h = splitTop(st.head, ';');
        if (h.length !== 3) FB();
        let [ini, cond, upd] = h;
        if (ini.length && /^(let|var)$/.test(ini[0].t)) ini = ini.slice(1);
        if (ini.length !== 3 || !isId(ini[0]) || ini[1].t !== '=' || ini[2].t !== '0') FB();
        const v = ini[0].t;
        if (cond.length < 3 || !isId(cond[0], v) || !['<', '<='].includes(cond[1].t)) FB();
        const u = upd.map(t => t.t).join('');
        if (![v + '++', '++' + v, v + '+=1'].includes(u)) FB();
        const btoks = toks.slice(st.body.from, st.body.to);
        if (v !== 'i' && btoks.some(t => isId(t, 'i'))) FB();
        const sub = Object.assign({}, cx, { top: false, rename: Object.assign({}, cx.rename, { [v]: 'i' }), banned: v !== 'i' ? new Set([...(cx.banned || []), v]) : cx.banned });
        let n = expr(cond.slice(2), sub);
        if (cond[1].t === '<=') n = /^\d+$/.test(n) ? String(+n + 1) : '(' + n + ') + 1';
        return [[ind, 'loop ' + n + ' times', st], ...body(st.body, ind + 2, sub)];
      }
      case 'expr': break;
      default: FB();
    }
    if (!tk.length) return [];
    const T = tk.map(t => t.t);
    if (/^(let|const|var)$/.test(T[0])) {
      const decls = splitTop(tk.slice(1), ','), out = [];
      for (const d of decls) {
        if (!isId(d[0])) FB();
        if (d.length === 1) { out.push([ind, d[0].t + ' = 0', st]); continue; }
        if (d[1].t !== '=') FB();
        const rhs = d.slice(2);
        if (funcs.has(d[0].t) && decls.length === 1) { const f = fnExpr(rhs, cx); return convFunc(d[0].t, f.params, f.stmts, ind, cx, st); }
        out.push([ind, d[0].t + ' = ' + expr(rhs, cx), st]);
      }
      return out;
    }
    if (tk.length === 2 && isId(tk[0]) && (T[1] === '++' || T[1] === '--')) { if (cx.banned && cx.banned.has(T[0])) FB(); return [[ind, `${cx.rename && cx.rename[T[0]] || T[0]} ${T[1] === '++' ? '+=' : '-='} 1`, st]]; }
    if (tk.length === 2 && isId(tk[1]) && (T[0] === '++' || T[0] === '--')) { if (cx.banned && cx.banned.has(T[1])) FB(); return [[ind, `${T[1]} ${T[0] === '++' ? '+=' : '-='} 1`, st]]; }
    let ai = -1;
    for (let i = 0, d = 0; i < tk.length; i++) { const t = tk[i]; if (t.type === 'p' && '([{'.includes(t.t)) d++; else if (t.type === 'p' && ')]}'.includes(t.t)) d--; else if (!d && t.type === 'op' && ['=', '+=', '-=', '*=', '/=', '%=', '**=', '&&=', '||=', '??='].includes(t.t)) { ai = i; break; } }
    if (ai > 0 && !['=', '+=', '-=', '*=', '/='].includes(T[ai])) FB();
    if (ai > 0) {
      const lhs = T.slice(0, ai).join(''), rhs = tk.slice(ai + 1), op = T[ai];
      if (lhs === 'document.title' && op === '=') { if (rhs.length !== 1 || rhs[0].type !== 'str') FB(); return [[ind, 'title ' + ffStr(unquote(rhs[0].t)), st]]; }
      if (/^document\.body\.style\.(background|backgroundColor)$/.test(lhs) && op === '=') {
        if (rhs.length !== 1 || rhs[0].type !== 'str') FB();
        const c = colorWord(unquote(rhs[0].t)); if (!c) FB();
        return [[ind, 'background ' + c, st]];
      }
      if (isId(tk[0]) && isP(tk[1], '[') && matchClose(tk, 1) === ai - 1 && listVars.has(T[0]) && !(cx.banned && cx.banned.has(T[0]))) return [[ind, `${expr(tk.slice(0, ai), cx)} ${op} ${expr(rhs, cx)}`, st]];
      if (!/^[\p{L}_$][\p{L}\p{N}_$]*(\.[\p{L}_$][\p{L}\p{N}_$]*)?$/u.test(lhs)) FB();
      const parts = lhs.split('.');
      if (parts.length === 2 && !PROP_OK.test(parts[1])) FB();
      if (cx.banned && cx.banned.has(parts[0])) FB();
      if (parts[0].includes('$')) FB();
      return [[ind, `${expr(tk.slice(0, ai), cx)} ${op} ${expr(rhs, cx)}`, st]];
    }
    const call = callParts(tk);
    if (call) {
      const { callee, args } = call;
      if (callee === 'alert' && args.length === 1) return [[ind, 'talk ' + textArg(args[0], cx), st]];
      if ((callee === 'setInterval' || callee === 'setTimeout') && args.length === 2) {
        if (callee === 'setInterval' && !cx.top) FB();
        let stmts;
        if (args[0].length === 1 && isId(args[0][0]) && funcs.has(args[0][0].t)) stmts = null;
        else { const f = fnExpr(args[0], cx); if (f.params.length) FB(); stmts = f.stmts; }
        const head = [ind, (callee === 'setInterval' ? 'every ' : 'after ') + secs(args[1], cx) + ' sec', st];
        const sub = Object.assign({}, cx, { top: false });
        if (!stmts) return [head, [ind + 2, args[0][0].t, st]];
        const out = []; for (const s of stmts) out.push(...conv(s, ind + 2, sub));
        if (!out.length) FB();
        return [head, ...out];
      }
      const lm = callee.match(/^(?:(?:window|document|document\.body|canvas|[\p{L}_$][\p{L}\p{N}_$]*)\.)?addEventListener$/u);
      if (lm && args.length >= 2 && args[0].length === 1 && args[0][0].type === 'str') return convListener(unquote(args[0][0].t), fnExpr(args[1], cx), ind, cx, st);
      const pm = callee.match(/^([\p{L}_][\p{L}\p{N}_]*)\.push$/u);
      if (pm && listVars.has(pm[1]) && args.length === 1 && args[0].length && !(cx.banned && cx.banned.has(pm[1]))) return [[ind, 'add ' + expr(args[0], cx) + ' to ' + (cx.rename && cx.rename[pm[1]] || pm[1]), st]];
      if (funcs.has(callee)) return [[ind, callee + args.map(a => ' ' + term(expr(a, cx))).join(''), st]];
    }
    FB();
  }
  function colorWord(v) {
    const W = (global.FFScript && global.FFScript.COLOR_WORDS) || [];
    v = v.trim().toLowerCase();
    if (W.includes(v)) return v;
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(v)) return v;
    return null;
  }

  const stats = { js: 0 };
  const buildOf = (list) => {
    const cx = { top: true, stats, rename: null, banned: null, calls: null };
    const lines = [];
    for (const st of list) for (const l of conv(st, 0, cx)) lines.push(l);
    return lines;
  };
  const build = () => { stats.js = 0; return buildOf(tree); };
  return { build, buildOf, tree, stats, rawOf, toks, parentOf };
}

function htmlDecode(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos|nbsp);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[e] || (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : m));
}
const BLOCKS = /^(h[1-6]|p|div|section|article|header|footer|main|li|ul|ol|span|b|strong|i|em|label|center|small|br|nav|aside|figure|figcaption|blockquote|pre|code|font|u|s|mark)$/i;
const DROP = /^(meta|link|base|noscript|template)$/i;
const lc = s => s.replace(/[A-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + 32));
function findBlocks(html, low, name) {
  const out = []; let i = 0;
  while ((i = low.indexOf('<' + name, i)) >= 0) {
    const c = low[i + name.length + 1];
    if (c && !/[\s>\/]/.test(c)) { i += name.length + 1; continue; }
    const oe = html.indexOf('>', i); if (oe < 0) break;
    let ce = low.indexOf('</' + name, oe + 1), end;
    if (ce < 0) { ce = html.length; end = html.length; } else { const g = html.indexOf('>', ce); end = g < 0 ? html.length : g + 1; }
    out.push({ start: i, attrs: html.slice(i + name.length + 1, oe), from: oe + 1, to: ce, end });
    i = end;
  }
  return out;
}
function cutRanges(s, ranges) {
  if (!ranges.length) return s;
  ranges.sort((a, b) => a[0] - b[0]);
  let out = '', last = 0;
  for (const [a, b] of ranges) { if (a < last) continue; out += s.slice(last, a); last = b; }
  return out + s.slice(last);
}
function findComments(s) {
  const out = []; let i = 0;
  while ((i = s.indexOf('<!--', i)) >= 0) { const e = s.indexOf('-->', i + 4); const end = e < 0 ? s.length : e + 3; out.push([i, end]); i = end; }
  return out;
}
function convertHTML(html, pre) {
  const out = { lines: [], scripts: [] };
  const low = lc(html), titles = findBlocks(html, low, 'title'), styleBs = findBlocks(html, low, 'style'), scriptBs = findBlocks(html, low, 'script');
  if (titles.length) { const tt = htmlDecode(html.slice(titles[0].from, Math.min(titles[0].to, titles[0].from + 400))).trim(); if (tt) pre.push('title ' + ffStr(tt)); }
  const styles = styleBs.map(b => html.slice(b.from, b.to)).join('\n').slice(0, 300000);
  const bm = styles.match(/(?:^|[}\s,])(?:html\s*,\s*)?body\s*(?:,\s*html\s*)?\{[^}]*?background(?:-color)?\s*:\s*([^;}]+)/i) || (html.match(/<body[^>]*style\s*=\s*["'][^"']*background(?:-color)?\s*:\s*([^;"']+)/i));
  if (bm) { const v = bm[1].trim().toLowerCase(), W = (global.FFScript && global.FFScript.COLOR_WORDS) || []; if (W.includes(v) || /^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(v)) pre.push('background ' + v); }
  for (const b of scriptBs) {
    const code = html.slice(b.from, b.to), sm = b.attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (sm) out.scripts.push({ src: sm[1] }); else if (/module/i.test(b.attrs)) out.scripts.push({ module: code }); else if (code.trim()) out.scripts.push({ code });
  }
  let body;
  { const bs = low.indexOf('<body'), be = bs < 0 ? -1 : html.indexOf('>', bs), ce = low.lastIndexOf('</body');
    if (be >= 0 && ce > be) body = html.slice(be + 1, ce);
    else { const hb = findBlocks(html, low, 'head')[0]; body = hb ? html.slice(0, hb.start) + html.slice(hb.end) : html; } }
  { const bl = lc(body); body = cutRanges(body, [...findBlocks(body, bl, 'script'), ...findBlocks(body, bl, 'style'), ...findBlocks(body, bl, 'title')].map(b => [b.start, b.end])); }
  body = cutRanges(body, findComments(body)).replace(/<\/?(html|head|body|!doctype)[^>]*>/gi, '');
  const texts = [], raws = [];
  let cur = '';
  const flush = () => { const t = htmlDecode(cur).replace(/\s+/g, ' ').trim(); if (t) texts.push(t); cur = ''; };
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g; let m;
  while ((m = re.exec(body))) {
    if (m[4] != null) { cur += m[4]; continue; }
    const tag = m[2].toLowerCase();
    if (DROP.test(tag)) continue;
    if (BLOCKS.test(tag) && !/\bid\s*=/i.test(m[3])) { if (/^(h[1-6]|p|div|li|br|section|article|header|footer|main|center|pre|blockquote)$/.test(tag)) flush(); continue; }
    if (m[1]) continue;
    flush();
    let raw = m[0];
    if (!/^(img|input|br|hr|source|track|wbr|area|col|embed|param)$/.test(tag) && !/\/>$/.test(raw)) {
      let d = 1; const r2 = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi'); r2.lastIndex = re.lastIndex; let m2, end = body.length;
      while ((m2 = r2.exec(body))) { if (m2[1]) d--; else d++; if (!d) { end = r2.lastIndex; break; } }
      raw = body.slice(m.index, end); re.lastIndex = end;
    }
    raws.push(raw.replace(/\s+/g, ' ').trim());
  }
  flush();
  texts.slice(0, 8).forEach((t, i) => out.lines.push('label ' + ffStr(t.replace(/[{}]/g, '')) + ' at center ' + (60 + i * 46)));
  raws.forEach(r => out.lines.push('G.addHTML(`' + r.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`)'));
  return out;
}

function renameClashes(code) {
  const L = global.FFScript && global.FFScript.lists; if (!L) return code;
  const NATIVE = new Set(['window', 'document', 'Math', 'console', 'alert']);
  const R = new Set([...L.statements, ...L.builtin, ...L.words, 'score', 'lives', 'level', 'time', 'G', '_o', 'i'].filter(w => !NATIVE.has(w)));
  let toks; try { toks = tokenize(code); } catch (e) { return code; }
  const D = new Set();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type === 'id' && /^(let|const|var)$/.test(t.t)) {
      let d = 0;
      for (let j = i + 1; j < toks.length; j++) {
        const u = toks[j];
        if (j > i + 1 && !d && (isP(u, ';') || (u.nl && !isP(toks[j - 1], ',')))) break;
        if (u.type === 'p' && '([{'.includes(u.t)) d++; else if (u.type === 'p' && ')]}'.includes(u.t)) { if (!d) break; d--; }
        if (!d && u.type === 'id' && (j === i + 1 || isP(toks[j - 1], ','))) D.add(u.t);
      }
    }
    if (isId(t, 'function') && isId(toks[i + 1])) D.add(toks[i + 1].t);
    if (t.t === '=>') {
      if (isId(toks[i - 1])) D.add(toks[i - 1].t);
      else if (isP(toks[i - 1], ')')) { let d = 0; for (let j = i - 1; j >= 0; j--) { if (isP(toks[j], ')')) d++; else if (isP(toks[j], '(')) { if (!--d) break; } else if (d === 1 && isId(toks[j])) D.add(toks[j].t); } }
    }
    if (isId(t, 'function')) { let j = i + 1; if (isId(toks[j])) j++; if (isP(toks[j], '(')) { const e = matchClose(toks, j); for (let k = j + 1; k < e; k++) if (isId(toks[k]) && (isP(toks[k - 1], '(') || isP(toks[k - 1], ','))) D.add(toks[k].t); } }
  }
  const hit = [...D].filter(n => R.has(n));
  if (!hit.length) return code;
  const all = new Set(toks.filter(t => t.type === 'id').map(t => t.t));
  const to = Object.create(null); for (const n of hit) { let m = n + '_'; while (all.has(m)) m += '_'; to[n] = m; }
  const fixTpl = txt => {
    let r = '', k = 0;
    while (k < txt.length) {
      if (txt[k] === '\\') { r += txt.slice(k, k + 2); k += 2; continue; }
      if (txt[k] === '$' && txt[k + 1] === '{') {
        let d = 1, e = k + 2;
        while (e < txt.length && d) { if (txt[e] === '{') d++; else if (txt[e] === '}') d--; e++; }
        r += '${' + rn(txt.slice(k + 2, e - 1)) + '}'; k = e; continue;
      }
      r += txt[k++];
    }
    return r;
  };
  function rn(text, tk) {
    if (!tk) { try { tk = tokenize(text); } catch (e) { return text; } }
    let out = '', last = 0;
    tk.forEach((t, i) => {
      if (t.type === 'tpl' && t.t.includes('${')) { out += text.slice(last, t.s) + fixTpl(t.t); last = t.e; return; }
      if (t.type !== 'id' || !to[t.t] || isP(tk[i - 1], '.') || isP(tk[i - 1], '?.')) return;
      if (isP(tk[i + 1], ':') && (isP(tk[i - 1], '{') || isP(tk[i - 1], ','))) return;
      out += text.slice(last, t.s) + to[t.t]; last = t.e;
    });
    return out + text.slice(last);
  }
  return rn(code, toks);
}

const MAXSIZE = 3 * 1024 * 1024;
function detectOther(s) {
  if (/^\s*(?:package\s+[\w.]+\s*;|import\s+(?:static\s+)?javax?\.[\w.*]+\s*;)/m.test(s) || /\b(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:class|interface|enum|void|int|long|double|boolean|String)\b/.test(s) || /System\.out\.print/.test(s)) return 'Java';
  if (/^\s*using\s+System\b/m.test(s) || /Console\.Write(?:Line)?\s*\(/.test(s)) return 'C#';
  if (/^\s*#include\s*[<"]/m.test(s)) return 'C/C++';
  if (/^\s*def\s+\w+\s*\([^)]*\)\s*:/m.test(s) || /^\s*(?:elif\b.*|else)\s*:\s*$/m.test(s) || /^\s*from\s+\w+\s+import\s+/m.test(s)) return 'Python';
  return null;
}
const jsBlock = (code) => ['JS', ...code.split('\n').filter(l => l.trim()).map(l => '  ' + l)];
function jsShare(text) {
  let js = 0, all = 0, base = -1;
  for (const l of text.split('\n')) {
    if (!l.trim()) continue;
    const ind = l.match(/^ */)[0].length, n = l.trim().length;
    all += n;
    if (base >= 0 && ind > base) { js += n; continue; }
    base = -1;
    if (/^JS(\s|$)/.test(l.trim())) { js += n; if (l.trim() === 'JS') base = ind; } else if (/^G\.addHTML/.test(l.trim())) js += n;
  }
  return all ? js / all : 0;
}
function convert(input, opts) {
  opts = opts || {};
  const t0 = Date.now(), budget = opts.budgetMs || 20000, over = () => Date.now() - t0 > budget;
  let lastP = 0;
  const prog = (stage, done, total, force) => { if (!opts.onProgress) return; const n = Date.now(); if (!force && n - lastP < 80) return; lastP = n; opts.onProgress({ stage, done, total }); };
  const src = String(input || '').replace(/\r\n?/g, '\n');
  if (src.length > MAXSIZE) return { code: '', ok: false, error: '붙여 넣은 코드가 너무 커요 (' + (src.length / 1048576).toFixed(1) + 'MB). 3MB 이하로 줄여서 다시 해 주세요.', js: 0 };
  prog('읽는 중', 0, 1, true);
  const pre = [], htmlLines = [];
  let code = src, scripts = null;
  const looksHTML = /<\s*(html|head|body|script|div|p|h[1-6]|canvas|title|style|button|img|span|!doctype)\b/i.test(src);
  if (looksHTML) { const h = convertHTML(src, pre); htmlLines.push(...h.lines); scripts = h.scripts; code = h.scripts.filter(s => s.code).map(s => s.code).join('\n'); }
  const extJS = [];
  if (scripts) for (const s of scripts) {
    if (s.src) extJS.push(`(function(){const s=document.createElement('script');s.src=${JSON.stringify(s.src)};document.head.appendChild(s);})()`);
    if (s.module) extJS.push(s.module);
  }
  if (code.trim()) {
    let synErr = null; try { new Function(code); } catch (e) { synErr = e.message; }
    if (synErr) {
      const lang = looksHTML ? null : detectOther(src);
      return { code: '', ok: false, js: 0, error: lang ? lang + ' 코드는 바꿀 수 없어요. 이 변환기는 HTML과 JavaScript만 FF Script로 바꿔요.' : '붙여 넣은 코드에 자바스크립트 문법 오류가 있어서 바꿀 수 없어요. (' + synErr + ')' };
    }
  }
  code = renameClashes(code);
  const FF = global.FFScript;
  const headOf = () => [...pre, ...htmlLines.map(l => /^G\.addHTML/.test(l) ? 'JS ' + jsq(l) : l), ...extJS.map(c => c.includes('\n') ? 'JS\n' + c.split('\n').filter(l => l.trim()).map(l => '  ' + l).join('\n') : 'JS ' + jsq(c))];
  const wholeJS = (why) => {
    const head = headOf(), body = code.trim() ? jsBlock(code) : [];
    const text = [...head, ...(head.length && body.length ? [''] : []), ...body].join('\n') + '\n';
    const r = FF ? FF.compileSafe(text) : { ok: true };
    return { code: text, ok: r.ok, error: r.ok ? '' : '바꾸지 못했어요: ' + (r.message || ''), js: 1, whole: why, share: 1 };
  };
  try {
  const C = convertJS(code);
  let lines, text = '', okRun = false, timedOut = false;
  const lift0 = ls => { const lift = ls.filter(([i, t]) => !i && /^(title|background) /.test(t)); return [...lift, ...ls.filter(l => !lift.includes(l))]; };
  const markUp = (owner) => { if (owner.fb) { let par = C.parentOf(owner); while (par && par.fb) par = C.parentOf(par); if (!par) return false; par.fb = true; } else owner.fb = true; return true; };

  /* 1단계: 문장 묶음(chunk)마다 따로 검사해서 고친다 (전체를 매번 다시 컴파일하지 않음) */
  if (FF && C.tree.length) {
    const chunks = []; let cur = [], w = 0;
    for (const st of C.tree) { cur.push(st); w += st.to - st.from; if (cur.length >= 40 || w >= 1500) { chunks.push(cur); cur = []; w = 0; } }
    if (cur.length) chunks.push(cur);
    const stubs = new Map();
    const learn = (ls) => {
      for (const e of ls) {
        if (e[4]) continue;
        const t = e[1].trim();
        if (e[3] != null) { if (e[0] === 0 && FF.jsTopNames) for (const nm of FF.jsTopNames(e[3])) if (!stubs.has(nm)) stubs.set(nm, [nm + ' = 0']); continue; }
        let m;
        if (e[0] === 0 && (m = t.match(/^to\s+([\p{L}_][\p{L}\p{N}_]*)((?:\s+[\p{L}_][\p{L}\p{N}_]*)*)$/u))) { stubs.set(m[1], ['to ' + m[1] + m[2], '  shake']); continue; }
        if ((m = t.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*(?:=(?!=)|\+=|-=|\*=|\/=)/u)) && !/^(score|lives|level)$/.test(m[1]) && !stubs.has(m[1])) stubs.set(m[1], [m[1] + ' = 0']);
      }
    };
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      prog('고치는 중', ci, chunks.length);
      if (over()) { timedOut = true; for (const c of chunks.slice(ci)) for (const st of c) st.fb = true; break; }
      let ls, guard = 0;
      const ids = new Set(); for (let k = chunk[0].from; k < chunk[chunk.length - 1].to; k++) if (C.toks[k].type === 'id') ids.add(C.toks[k].t);
      let used = [...stubs].filter(([k]) => ids.has(k)), preLines = used.flatMap(([, v]) => v);
      for (;;) {
        ls = C.buildOf(chunk);
        const r = FF.compileSafe([...preLines, ...ls.map(([i, t]) => ' '.repeat(i) + t)].join('\n') + '\n');
        if (r.ok) break;
        const idx = r.line - 1 - preLines.length;
        if (idx < 0) { let acc = 0; for (const [k, v] of used) { acc += v.length; if (r.line - 1 < acc) { stubs.delete(k); break; } } used = [...stubs].filter(([k]) => ids.has(k)); preLines = used.flatMap(([, v]) => v); if (guard++ > 5000) break; continue; }
        const owner = ls[idx] && ls[idx][2];
        if (!owner || guard++ > 400 || over() || !markUp(owner)) { for (const st of chunk) st.fb = true; ls = C.buildOf(chunk); break; }
      }
      learn(ls);
    }
  }

  /* 2단계: 전체를 한 번 컴파일해서 확인, 남은 문제는 시간 안에서만 고친다 */
  let guard = 0;
  while (true) {
    prog('마무리하는 중', 0, 1);
    lines = lift0(C.build());
    const body = lines.map(([i, t]) => ' '.repeat(i) + t), head = headOf();
    text = [...head, ...(head.length && body.length ? [''] : []), ...body].join('\n') + '\n';
    if (!FF) break;
    const r = FF.compileSafe(text);
    if (r.ok) { okRun = true; break; }
    if (guard++ > 400 || over()) { timedOut = true; break; }
    const idx = r.line - 1 - head.length - (head.length && body.length ? 1 : 0);
    const owner = lines[idx] && lines[idx][2];
    if (!owner || !markUp(owner)) break;
  }
  if (!okRun && timedOut) return wholeJS('timeout');
  if (okRun) {
    const js = [...htmlLines.filter(l => /^G\.addHTML/.test(l)), ...extJS];
    const headPlain = [...pre, ...htmlLines.filter(l => !/^G\.addHTML/.test(l))];
    const merged = [], L = lines;
    for (let i = 0; i < L.length;) {
      const e = L[i];
      if (e[3] != null) {
        const ind = e[0], codes = [];
        while (i < L.length && L[i][3] != null && L[i][0] === ind) { codes.push(L[i][3]); i++; while (i < L.length && L[i][4]) i++; }
        if (codes.length === 1 && !codes[0].includes('\n')) merged.push(' '.repeat(ind) + 'JS ' + jsq(codes[0]));
        else { merged.push(' '.repeat(ind) + 'JS'); for (const c of codes) for (const l of c.split('\n')) if (l.trim()) merged.push(' '.repeat(ind + 2) + l); }
        continue;
      }
      merged.push(' '.repeat(e[0]) + e[1]); i++;
    }
    const jsHead = js.length ? (js.length === 1 && !js[0].includes('\n') ? ['JS ' + jsq(js[0])] : ['JS', ...js.flatMap(c => c.split('\n').filter(l => l.trim()).map(l => '  ' + l))]) : [];
    const head2 = [...headPlain, ...jsHead];
    const t2 = [...head2, ...(head2.length && merged.length ? [''] : []), ...merged].join('\n') + '\n';
    if (!over() && FF.compileSafe(t2).ok) text = t2;
  }
  let error = '';
  if (!okRun && FF) { const r = FF.compileSafe(text); error = /문법 오류/.test(r.message || '') ? '붙여 넣은 코드에 자바스크립트 문법 오류가 있어서 바꿀 수 없어요. (' + String(r.message).replace(/^.*문법 오류가 있어요: /, '') + ')' : '바꾸지 못했어요: ' + (r.message || ''); }
  return { code: text, ok: okRun, error, js: C.stats.js + extJS.length + htmlLines.filter(l => /^G\.addHTML/.test(l)).length, timedOut, share: jsShare(text) };
  } catch (e) {
    const w = wholeJS('error'); w.note = String(e && e.message || e).slice(0, 80); return w;
  }
}

global.FFConvert = { convert, tokenize };
})(typeof window !== 'undefined' ? window : globalThis);
