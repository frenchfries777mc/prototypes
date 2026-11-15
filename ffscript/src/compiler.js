(function (global) {
'use strict';
const ID = '[\\p{L}_][\\p{L}\\p{N}_]*';
const reID = new RegExp('^' + ID + '$', 'u');
class FFError extends Error { constructor(line, msg) { super(msg); this.line = line; } }
const fail = (n, m) => { throw new FFError(n, m); };

const BUILTIN_LOOKS = ['ship', 'rock', 'coin', 'star', 'enemy', 'bullet', 'heart', 'ball', 'box', 'hero', 'slime', 'platform', 'spike', 'flag', 'gem', 'bomb', 'ghost', 'fish', 'cloud', 'tree', 'block'];
const BACKS = ['space', 'night', 'sky', 'sea', 'sunset', 'forest', 'lava', 'snow', 'grid'];
const MAP_CHARS = '.# =CGSHB^FEP';
const ART_CHARS = '.# kwrogybpcnmd';
const PROP_OK = /^(x|y|vx|vy|size|angle|alive|name|hp|maxHp|age|text|color|speed|gravity|onGround|down|left|right|up|space|enter|shift|escape|[a-z0-9])$/;
const COLOR_WORDS = ['red', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple', 'pink', 'white', 'black', 'gray', 'grey', 'gold', 'cyan', 'sky', 'brown'];
const CONTROLS = ['arrows', 'wasd', 'leftright', 'mouse', 'platformer'];
const MUSICS = ['chill', 'happy', 'action', 'off'];
const SOUNDS = ['boom', 'coin', 'shoot', 'hit', 'jump', 'power', 'start', 'over', 'win', 'pop', 'laser', 'click', 'magic', 'hurt', 'whoosh'];
const DIRS = ['up', 'down', 'left', 'right'];
const WAVES = ['sine', 'square', 'triangle', 'saw'];
const WEATHERS = ['rain', 'snow', 'leaves', 'petals', 'off'];
const NOTE_RE = /^(?:(?:[A-Ga-g]|도|레|미|파|솔|라|시)[#b]?\d?|[-._])$/u;
const POS_WORDS = ['left', 'center', 'right', 'top', 'middle', 'bottom', 'random'];
const SIDES = ['top', 'bottom', 'left', 'right'];
const MATH = ['sin', 'cos', 'tan', 'abs', 'floor', 'ceil', 'round', 'min', 'max', 'sqrt', 'pow', 'atan2', 'sign'];
const CMDS = Object.assign(Object.create(null), {
  move: 'move', toward: 'toward', stop: 'stop', control: 'control', speed: 'setSpeed', size: 'setSize', color: 'setColor',
  spin: 'spin', bounce: 'setBounce', look: 'setLook', gravity: 'setGravity', jump: 'jump', solid: 'setSolid',
  health: 'setHealth', hurt: 'hurt', heal: 'heal', fade: 'setAlpha', hide: 'hide', show: 'show', glow: 'setGlow', trail: 'setTrail', wrap: 'setWrap',
  stay: 'setStay', life: 'setLife', flip: 'flip', patrol: 'setPatrol', wander: 'setWander', chase: 'setChase', flee: 'setFlee', explode: 'explode', sparkle: 'sparkle', remove: 'remove', say: 'say'
});
const STATEMENTS = ['title', 'background', 'lives', 'score', 'make', 'every', 'after', 'when', 'always', 'if', 'else', 'repeat', 'win', 'gameover', 'shake', 'sound', 'label', 'level', 'music', 'add', 'remove', 'set', 'loop', 'spawn', 'create', 'burst', 'confetti', 'flash', 'slowmo', 'banner', 'to', 'do', 'map', 'art', 'scene', 'go', 'save', 'load', 'forget', 'talk', 'camera', 'tone', 'play', 'weather'];
const BUILTIN = ['score', 'lives', 'level', 'time', 'scene', 'choose', 'chance', 'distance', 'mouse', 'key', 'width', 'height', 'count', 'random', 'PI', ...MATH];
const WORDS = ['and', 'or', 'not', 'is', 'true', 'false', 'null', 'at', 'from', 'hits', 'touches', 'leaves', 'sec', 'elif', 'when', 'to', 'times', 'follow', 'off', 'ends', 'topdown'];
const JS_RESERVED = ['break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'enum', 'export', 'extends', 'finally', 'for', 'function', 'import', 'in', 'instanceof', 'let', 'new', 'return', 'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'await', 'async', 'static', 'undefined', 'G', 'Math', '_o', 'window', 'document', 'eval'];
const NOT_VARS = new Set([...STATEMENTS, ...BUILTIN.filter(w => w !== 'score' && w !== 'lives' && w !== 'level'), ...WORDS, ...JS_RESERVED]);

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function hint(word, list) {
  let best = null, bd = 99;
  for (const w of list) { const d = lev(String(word).toLowerCase(), w); if (d < bd) { bd = d; best = w; } }
  return best && bd <= (best.length >= 4 ? 2 : 1) ? ` 혹시 '${best}'를 말한 건가요?` : '';
}
const quoteList = a => a.map(x => `'${x}'`).join(', ');

function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '/' && s[i + 1] === '/') return s.slice(0, i);
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1])) && (i + 1 >= s.length || /\s/.test(s[i + 1]))) return s.slice(0, i);
  }
  return s;
}
function splitTerms(s) {
  const out = []; let cur = '', d = 0, q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === '\\') cur += s[++i] || ''; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if ('([{'.includes(c)) d++;
    if (')]}'.includes(c)) d--;
    if (/\s/.test(c) && d === 0) { if (cur) { out.push(cur); cur = ''; } continue; }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}
const TOK = new RegExp('\\s+|"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|\\d+\\.?\\d*|\\.\\d+|' + ID + '|==|!=|<=|>=|&&|\\|\\||\\*\\*|[^]', 'gu');
const q = JSON.stringify;

function parseTree(src) {
  const root = { n: 0, indent: -1, children: [] }, stack = [root];
  let rawOf = null;
  src.split('\n').forEach((line, i) => {
    const expanded = line.replace(/\t/g, '  ');
    if (rawOf) {
      if (!expanded.trim()) return;
      if (expanded.match(/^ */)[0].length > rawOf.indent) { rawOf.rowsRaw.push({ n: i + 1, text: expanded.replace(/\s+$/, '') }); return; }
      rawOf = null;
    }
    const text = stripComment(expanded).replace(/\s+$/, '').replace(/\s*:$/, '');
    if (!text.trim()) return;
    const node = { n: i + 1, indent: text.match(/^ */)[0].length, text: text.trim(), children: [] };
    while (stack[stack.length - 1].indent >= node.indent) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
    if (/^(map(\s+\S+)?|art\s+\S.*)$/.test(node.text)) { node.rowsRaw = []; rawOf = node; }
  });
  return root.children;
}
function rawRows(nd) {
  const rows = nd.rowsRaw.map(r => r.text), min = Math.min(...rows.map(r => r.match(/^ */)[0].length));
  return { rows: rows.map(r => r.slice(min)), lines: nd.rowsRaw.map(r => r.n) };
}

function compile(src) {
  const tree = parseTree(src);
  const LOOKS = [...BUILTIN_LOOKS];
  const vars = new Set(), funcs = new Set(), scenes = new Set();
  let hasLives = false, firstLivesAdd = 0, usesLevel = false;

  const assignRe = new RegExp('^(' + ID + ')\\s*(?:=(?!=)|\\+=|-=|\\*=|/=)', 'u');
  (function collect(nodes, top, inScene) {
    for (const nd of nodes) {
      let tm;
      if (top && !inScene && (tm = nd.text.match(new RegExp('^scene\\s+(' + ID + ')$', 'u')))) {
        if (scenes.has(tm[1])) fail(nd.n, `'${tm[1]}' 장면이 두 번 만들어졌어요. 장면 이름은 하나씩만 쓸 수 있어요.`);
        scenes.add(tm[1]); collect(nd.children, true, true); continue;
      }
      if (top && !inScene && (tm = nd.text.match(new RegExp('^to\\s+(' + ID + ')(?:\\s+.*)?$', 'u')))) {
        if (NOT_VARS.has(tm[1]) || BUILTIN_LOOKS.includes(tm[1])) fail(nd.n, `'${tm[1]}'는 FF Script가 이미 쓰는 단어라서 함수 이름으로 쓸 수 없어요.`);
        funcs.add(tm[1]);
      }
      if (top && !inScene && (tm = nd.text.match(new RegExp('^art\\s+(' + ID + ')(?:\\s+\\S+)?$', 'u')))) {
        if (NOT_VARS.has(tm[1]) || BUILTIN_LOOKS.includes(tm[1]) || tm[1] in Object.prototype) fail(nd.n, `'${tm[1]}'는 이미 있는 이름이라서 그림 이름으로 쓸 수 없어요.`);
        LOOKS.push(tm[1]);
      }
      if (top && /^map\b/.test(nd.text) && nd.rowsRaw && nd.rowsRaw.some(r => r.text.includes('P'))) vars.add('player');
      const sm = nd.text.match(new RegExp('^set\\s+(' + ID + ')\\s+to\\b', 'u'));
      const m = nd.text.match(assignRe) || (sm && [null, sm[1]]);
      if (m && m[1] !== 'score' && m[1] !== 'lives' && m[1] !== 'level') {
        if (NOT_VARS.has(m[1])) fail(nd.n, `'${m[1]}'는 FF Script가 이미 쓰는 단어라서 변수 이름으로 쓸 수 없어요. 다른 이름을 골라 주세요.`);
        vars.add(m[1]);
      }
      collect(nd.children, false, inScene);
    }
  })(tree, true, false);

  function ex(s, n, ctx) {
    const toks = (s || '').match(TOK) || [], out = [];
    const nextTok = i => { for (let j = i + 1; j < toks.length; j++) if (!/^\s+$/.test(toks[j])) return j; return -1; };
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (/^\s+$/.test(t)) continue;
      const prev = out.length ? out[out.length - 1] : '';
      if (t === '"' || t === "'") fail(n, '따옴표가 닫히지 않았어요. 글자는 "이렇게" 양쪽을 닫아 주세요.');
      if (/^["']/.test(t) || /^[\d.]/.test(t)) { out.push(t); continue; }
      if (';{}`\\[]'.includes(t)) fail(n, `'${t}' 기호는 FF Script에서 쓰지 않아요. 한 줄에 한 가지 일만 적어 주세요.`);
      if (t === '=') fail(n, "여기서는 '='로 비교할 수 없어요. 같은지 물어볼 땐 '==' 또는 'is'를 써요. (예: if score == 10)");
      if (!reID.test(t)) { out.push(t); continue; }
      if (prev === '.') {
        if (!PROP_OK.test(t)) fail(n, `'.${t}'는 쓸 수 없어요. 쓸 수 있는 것: x, y, vx, vy, size, hp, speed, name 같은 값이나 key.left, mouse.x 같은 입력이에요.`);
        out.push(t); continue;
      }
      switch (t) {
        case 'and': out.push('&&'); continue;
        case 'or': out.push('||'); continue;
        case 'not': out.push('!'); continue;
        case 'true': case 'false': case 'null': out.push(t); continue;
        case 'is': {
          const j = nextTok(i);
          if (j > 0 && toks[j] === 'not') { out.push('!=='); i = j; } else out.push('===');
          continue;
        }
        case 'random': out.push('G.rand'); continue;
        case 'choose': out.push('G.choose'); continue;
        case 'chance': out.push('G.chance'); continue;
        case 'distance': out.push('G.dist'); continue;
        case 'level': usesLevel = true; out.push('G.level'); continue;
        case 'score': case 'lives': case 'time': out.push('G.' + t); continue;
        case 'scene': out.push('G.sceneName'); continue;
        case 'mouse': out.push('G.mouse'); continue;
        case 'key': out.push('G.keys'); continue;
        case 'width': out.push('G.W'); continue;
        case 'height': out.push('G.H'); continue;
        case 'PI': out.push('Math.PI'); continue;
        case 'count': {
          const a = nextTok(i), b = a > 0 ? nextTok(a) : -1, c = b > 0 ? nextTok(b) : -1;
          if (a > 0 && toks[a] === '(' && b > 0 && reID.test(toks[b]) && c > 0 && toks[c] === ')') {
            const nm = toks[b];
            if (!LOOKS.includes(nm) && !vars.has(nm) && !(ctx && ctx.bound.has(nm))) fail(n, `count 안에는 모양 이름(rock 같은)이나 만든 이름을 써야 해요. '${nm}'는 찾을 수 없어요.${hint(nm, [...LOOKS, ...vars])}`);
            out.push(`G.count(${q(nm)})`); i = c; continue;
          }
          fail(n, "count는 count(rock) 처럼 괄호 안에 모양 이름을 써서 개수를 세요.");
        }
      }
      if (MATH.includes(t)) { out.push('Math.' + t); continue; }
      if (vars.has(t) || LOOKS.includes(t) || (ctx && ctx.bound.has(t))) { out.push(t); continue; }
      const known = [...vars, ...(ctx ? ctx.bound : []), ...LOOKS, ...BUILTIN];
      fail(n, `'${t}'가 뭔지 모르겠어요.${hint(t, known)} 새 변수를 쓰려면 먼저 ${t} = 0 처럼 값을 정해 줘야 해요.`);
    }
    return out.join(' ');
  }
  function tpl(token, n, ctx) {
    const m = token.trim();
    if (!/^["'].*["']$/s.test(m) || !m.includes('{')) return ex(m, n, ctx);
    const parts = m.slice(1, -1).split(/\{([^}]*)\}/);
    return '(' + parts.map((p, i) => i % 2 ? `String(${ex(p, n, ctx)})` : q(p.replace(/\\(["'])/g, '$1'))).join('+') + ')';
  }
  const isTpl = t => /^["'].*\{.*["']$/s.test(t.trim());
  function colorArg(rest, n, ctx, cmd) {
    const w = (rest || '').trim();
    if (/^["']/.test(w)) return ex(w, n, ctx);
    if (COLOR_WORDS.includes(w) || /^#[0-9a-fA-F]{3,8}$/.test(w)) return q(w);
    fail(n, `'${w}'는 모르는 색이에요.${hint(w, COLOR_WORDS)}\n쓸 수 있는 색: ${quoteList(COLOR_WORDS)} 또는 #ff8800 같은 색 코드`);
  }
  const need = (s, n, what) => { if (!s || !s.trim()) fail(n, what); };
  const look = (w, n) => {
    if (!LOOKS.includes(w)) fail(n, `'${w}'라는 모양은 없어요.${hint(w, LOOKS)}\n쓸 수 있는 모양: ${quoteList(LOOKS)}`);
    return q(w);
  };
  const posTerm = (t, n, ctx) => POS_WORDS.includes(t) ? q(t) : ex(t, n, ctx);

  function cmdArgs(name, rest, n, ctx) {
    const terms = splitTerms(rest || '');
    switch (name) {
      case 'move': {
        if (!terms.length || !DIRS.includes(terms[0])) fail(n, `move 뒤에는 방향이 와야 해요: ${quoteList(DIRS)}.${terms[0] ? hint(terms[0], DIRS) : ''} (예: move down 200)`);
        const a = [q(terms[0])];
        if (terms.length > 1) a.push(ex(terms.slice(1).join(' '), n, ctx));
        return a.join(',');
      }
      case 'toward': {
        const follow = terms[terms.length - 1] === 'follow';
        const t = follow ? terms.slice(0, -1) : terms;
        if (!t.length) fail(n, 'toward 뒤에는 향할 대상이 필요해요. (예: toward player 150, toward mouse 200 follow)');
        const a = [ex(t[0], n, ctx)];
        if (t.length > 1) a.push(ex(t.slice(1).join(' '), n, ctx)); else if (follow) a.push('undefined');
        if (follow) a.push('true');
        return a.join(',');
      }
      case 'control':
        if (terms.length !== 1 || !CONTROLS.includes(terms[0])) fail(n, `control 뒤에는 ${quoteList(CONTROLS)} 중 하나가 와야 해요.${terms[0] ? hint(terms[0], CONTROLS) : ''}`);
        return q(terms[0]);
      case 'speed': case 'size': case 'spin':
        need(rest, n, `${name} 뒤에는 숫자가 필요해요. (예: ${name} 300)`);
        return ex(rest, n, ctx);
      case 'color': need(rest, n, `color 뒤에는 색 이름이 필요해요. (예: color red)`); return colorArg(rest, n, ctx);
      case 'glow': case 'trail': return rest && rest.trim() ? colorArg(rest, n, ctx) : '';
      case 'health': case 'fade': need(rest, n, `${name} 뒤에는 숫자가 필요해요. (예: ${name} ${name === 'health' ? 5 : 0.5})`); return ex(rest, n, ctx);
      case 'hurt': case 'heal': case 'wander': case 'bounce': return rest && rest.trim() ? ex(rest, n, ctx) : '';
      case 'life': {
        const c = (rest || '').replace(/\s*(?:sec|secs|seconds?|s)$/i, '');
        need(c, n, 'life 뒤에는 남아 있을 시간(초)이 필요해요. (예: life 2 sec)'); return ex(c, n, ctx);
      }
      case 'patrol': {
        const vert = terms[0] === 'up' || terms[0] === 'down', t = vert ? terms.slice(1) : terms;
        if (!t.length) fail(n, 'patrol 뒤에는 왕복할 거리가 필요해요. (예: patrol 100, patrol 100 80, 위아래는 patrol up 100)');
        const a = [ex(t[0], n, ctx), t.length > 1 ? ex(t.slice(1).join(' '), n, ctx) : 'undefined'];
        if (vert) a.push('true');
        return a.join(',');
      }
      case 'chase': case 'flee': {
        if (!terms.length) fail(n, `${name} 뒤에는 대상이 필요해요. (예: ${name} player 120 300  → 속도 120, 300 거리 안에서만)`);
        if (terms.length > 3) fail(n, `${name}는 '${name} 대상 속도 거리' 까지만 써요. 수식은 괄호로 묶어 주세요.`);
        return terms.map(x => ex(x, n, ctx)).join(',');
      }
      case 'look': need(rest, n, 'look 뒤에는 모양 이름이나 "🐸" 같은 이모지가 필요해요.'); return /^["']/.test(rest.trim()) ? ex(rest, n, ctx) : look(rest.trim(), n);
      case 'gravity': case 'jump': return rest && rest.trim() ? ex(rest, n, ctx) : '';
      case 'say': need(rest, n, 'say 뒤에는 말할 내용이 필요해요. (예: say "안녕!")'); return tpl(rest, n, ctx);
      default:
        if (rest && rest.trim()) fail(n, `${name} 뒤에는 아무것도 쓰지 않아요.`);
        return '';
    }
  }
  const cmdCall = (target, name, rest, n, ctx) => `G.ln=${n};${target}.${CMDS[name]}(${cmdArgs(name, rest, n, ctx)});`;

  function makeStmt(nd, ctx, varName, rest) {
    const n = nd.n, terms = splitTerms(rest || '');
    if (['a', 'an', 'the'].includes(terms[0])) terms.shift();
    if (!terms.length) fail(n, `make 뒤에는 모양 이름이 필요해요. (예: make rock from top)\n쓸 수 있는 모양: ${quoteList(LOOKS)}`);
    const isText = /^["']/.test(terms[0]);
    const L = isText ? q('text') : look(terms[0], n);
    const K = isText ? ex(terms[0], n, ctx) : L;
    let pos = [], from = 'null';
    for (let i = 1; i < terms.length;) {
      if (terms[i] === 'at') {
        i++;
        while (i < terms.length && terms[i] !== 'from') { pos.push(posTerm(terms[i], n, ctx)); i++; }
        if (!pos.length || pos.length > 2) fail(n, "at 뒤에는 위치를 1~2개 써요. (예: at center bottom, at 100 200, at player)\n수식은 괄호로 묶어요: at (x + 20) 100");
      } else if (terms[i] === 'from') {
        if (!SIDES.includes(terms[i + 1])) fail(n, `from 뒤에는 ${quoteList(SIDES)} 중 하나가 와야 해요.${terms[i + 1] ? hint(terms[i + 1], SIDES) : ''}`);
        from = q(terms[i + 1]); i += 2;
      } else fail(n, `make 줄에서 '${terms[i]}'가 무슨 뜻인지 모르겠어요. 'at 위치' 또는 'from 방향'을 써 주세요.`);
    }
    let js = `G.ln=${n};{const _o=G.make(${K},${L},[${pos.join(',')}],${from});`;
    if (varName) js += `_o.name=${q(varName)};${varName}=_o;`;
    for (const c of nd.children) {
      const m = c.text.match(new RegExp('^(' + ID + ')(?:\\s+(.*))?$', 'u'));
      if (!m || !CMDS[m[1]]) fail(c.n, `make 아래에는 move, speed, size, color, control 같은 명령만 쓸 수 있어요.${m ? hint(m[1], Object.keys(CMDS)) : ''}`);
      if (c.children.length) fail(c.children[0].n, '이 줄 아래에는 더 들여쓸 수 없어요.');
      js += cmdCall('_o', m[1], m[2], c.n, ctx);
    }
    nd.usedKids = true;
    return js + '}';
  }

  function sub(ctx, extra) {
    return { bound: new Set([...ctx.bound, ...(extra || [])]), top: false, inScene: ctx.inScene };
  }
  function body(nd, ctx, extra, what) {
    if (!nd.children.length) fail(nd.n, `${what} 아래에 한 칸 들여쓴 내용이 필요해요.`);
    nd.usedKids = true;
    return block(nd.children, sub(ctx, extra));
  }
  function topOnly(nd, ctx, w) {
    if (!ctx.top) fail(nd.n, `${w}은(는) 맨 왼쪽 줄(들여쓰기 없는 곳)에서만 쓸 수 있어요.`);
  }

  const EVENT_RE = [new RegExp('^' + ID + '\\s+(?:hits|touches)\\s+' + ID + '$', 'u'), /^key\s+\S+$/, /^click$/, new RegExp('^' + ID + '\\s+leaves$', 'u'), /^talk\s+ends$/];
  function eventStmt(nd, ctx, rest, w) {
    const n = nd.n;
    let mm;
    rest = rest.trim();
    if ((mm = rest.match(new RegExp('^(' + ID + ')\\s+(?:hits|touches)\\s+(' + ID + ')$', 'u')))) {
      for (const nm of [mm[1], mm[2]]) if (!LOOKS.includes(nm) && !vars.has(nm)) fail(n, `'${nm}'는 모양 이름도, 만든 이름도 아니에요.${hint(nm, [...LOOKS, ...vars])}`);
      const b = mm[1] === mm[2] ? 'other' : mm[2];
      return `G.ln=${n};G.onHit(${q(mm[1])},${q(mm[2])},(${mm[1]},${b})=>{${body(nd, ctx, [mm[1], b], w)}});`;
    }
    if ((mm = rest.match(/^key\s+(\S+)$/))) return `G.ln=${n};G.onKey(${q(mm[1].toLowerCase())},()=>{${body(nd, ctx, null, w)}});`;
    if (/^click$/.test(rest)) return `G.ln=${n};G.onKey("click",()=>{${body(nd, ctx, null, w)}});`;
    if (/^talk\s+ends$/.test(rest)) return `G.ln=${n};G.onTalkEnd(()=>{${body(nd, ctx, null, w)}});`;
    if ((mm = rest.match(new RegExp('^(' + ID + ')\\s+leaves$', 'u')))) {
      if (!LOOKS.includes(mm[1]) && !vars.has(mm[1])) fail(n, `'${mm[1]}'는 모양 이름도, 만든 이름도 아니에요.${hint(mm[1], [...LOOKS, ...vars])}`);
      return `G.ln=${n};G.onLeave(${q(mm[1])},(${mm[1]})=>{${body(nd, ctx, [mm[1]], w)}});`;
    }
    return null;
  }

  function stmt(nd, ctx) {
    const t = nd.text, n = nd.n;
    let m;
    if ((m = t.match(new RegExp('^(' + ID + ')\\s*=\\s*(?:make|spawn|create)(?:\\s+(.*))?$', 'u'))) && m[1] !== 'score') return makeStmt(nd, ctx, m[1], m[2]);
    if ((m = t.match(/^(?:make|spawn|create)(?:\s+(.*))?$/))) return makeStmt(nd, ctx, null, m[1]);

    if ((m = t.match(new RegExp('^(' + ID + '(?:\\.' + ID + ')*)\\s*(\\+=|-=|\\*=|/=|=(?!=))\\s*(.*)$', 'u')))) {
      need(m[3], n, `${m[2]} 뒤에 값이 필요해요.`);
      if (m[1] === 'lives') hasLives = true;
      if (m[1] === 'time') fail(n, 'time은 읽기만 할 수 있어요.');
      if (m[1] === 'level') usesLevel = true;
      nd.usedKids = false;
      return `G.ln=${n};${ex(m[1], n, ctx)}${m[2]}${ex(m[3], n, ctx)};`;
    }
    if ((m = t.match(new RegExp('^(' + ID + '(?:\\.' + ID + ')*)\\.(' + ID + ')(?:\\s+(.*))?$', 'u')))) {
      if (!CMDS[m[2]]) fail(n, `'${m[2]}'라는 명령은 없어요.${hint(m[2], Object.keys(CMDS))}\n쓸 수 있는 명령: ${quoteList(Object.keys(CMDS))}`);
      return cmdCall(ex(m[1], n, ctx), m[2], m[3], n, ctx);
    }
    m = t.match(new RegExp('^(' + ID + ')(?:\\s+(.*))?$', 'u'));
    if (!m) fail(n, `이 줄을 이해하지 못했어요: ${t}`);
    const w = m[1], rest = m[2] || '';
    switch (w) {
      case 'title': need(rest, n, 'title 뒤에는 "제목"을 따옴표로 감싸서 써 주세요.'); if (!/^["']/.test(rest)) fail(n, 'title 뒤의 제목은 따옴표로 감싸 주세요. (예: title "나의 게임")'); return `G.ln=${n};G.title(${ex(rest, n, ctx)});`;
      case 'background': {
        need(rest, n, `background 뒤에는 배경 이름이나 색이 필요해요: ${quoteList(BACKS)} 또는 색 이름`);
        const v = rest.trim();
        if (/^["']/.test(v)) return `G.ln=${n};G.background(${ex(v, n, ctx)});`;
        if (BACKS.includes(v) || COLOR_WORDS.includes(v) || /^#[0-9a-fA-F]{3,8}$/.test(v)) return `G.ln=${n};G.background(${q(v)});`;
        fail(n, `'${v}'는 모르는 배경이에요.${hint(v, [...BACKS, ...COLOR_WORDS])}\n쓸 수 있는 배경: ${quoteList(BACKS)} 또는 색 이름`);
      }
      case 'lives': {
        need(rest, n, 'lives 뒤에 숫자가 필요해요. (예: lives 3, lives -1)');
        if (/^[+-]/.test(rest.trim())) { if (!firstLivesAdd) firstLivesAdd = n; return `G.ln=${n};G.addLives(${ex(rest, n, ctx)});`; }
        hasLives = true; return `G.ln=${n};G.setLives(${ex(rest, n, ctx)});`;
      }
      case 'score':
        need(rest, n, 'score 뒤에 +10 처럼 늘릴 점수를 써 주세요.');
        if (!/^[+-]/.test(rest.trim())) fail(n, "score 뒤에는 부호를 붙여 주세요. (예: score +10, score -5)");
        return `G.ln=${n};G.addScore(${ex(rest, n, ctx)});`;
      case 'every': case 'after': {
        if (w === 'every') topOnly(nd, ctx, w);
        need(rest, n, `${w} 뒤에 시간이 필요해요. (예: ${w} 1 sec)`);
        const mm = rest.match(/^(.+?)\s*(?:sec|secs|second|seconds|s)?$/i);
        return `G.ln=${n};G.${w}(${ex(mm[1], n, ctx)},()=>{${body(nd, ctx, null, w)}});`;
      }
      case 'always': topOnly(nd, ctx, w); if (rest) fail(n, 'always 뒤에는 아무것도 쓰지 않아요.'); return `G.ln=${n};G.onAlways(()=>{${body(nd, ctx, null, w)}});`;
      case 'when': {
        topOnly(nd, ctx, w);
        const ev = eventStmt(nd, ctx, rest, w);
        if (ev) return ev;
        fail(n, `${w} 뒤의 모양을 모르겠어요. 이렇게 써요:\n  if player hits rock\n  if key space\n  if click\n  if rock leaves`);
      }
      case 'if': {
        need(rest, n, 'if 뒤에 조건이 필요해요. (예: if score >= 10, if player hits rock)');
        const ev = EVENT_RE.some(r => r.test(rest.trim())) ? eventStmt(nd, ctx, rest, w) : null;
        if (ev) { if (!ctx.top) fail(n, "'if 누가 hits 무엇' 같은 이벤트 줄은 맨 왼쪽 줄에서만 쓸 수 있어요."); nd.isTrigger = true; return ev; }
        if (ctx.top) { nd.isTrigger = true; return `G.ln=${n};G.onCond(()=>(${ex(rest, n, ctx)}),()=>{${body(nd, ctx, null, 'if')}});`; }
        return `G.ln=${n};if(${ex(rest, n, ctx)}){${body(nd, ctx, null, 'if')}}`;
      }
      case 'add': case 'remove': {
        const mm = rest.match(w === 'add' ? /^(.+?)\s+to\s+(.+)$/ : /^(.+?)\s+from\s+(.+)$/);
        if (!mm) fail(n, w === 'add' ? 'add는 이렇게 써요: add 10 to score' : 'remove는 이렇게 써요: remove 1 from lives  (모양을 없애려면 rock.remove)');
        const sign = w === 'add' ? '' : '-', tg = mm[2].trim(), amt = `${sign}(${ex(mm[1], n, ctx)})`;
        if (tg === 'score') return `G.ln=${n};G.addScore(${amt});`;
        if (tg === 'lives') { if (!firstLivesAdd) firstLivesAdd = n; return `G.ln=${n};G.addLives(${amt});`; }
        if (tg === 'level') usesLevel = true;
        return `G.ln=${n};${ex(tg, n, ctx)}${w === 'add' ? '+=' : '-='}${ex(mm[1], n, ctx)};`;
      }
      case 'set': {
        const mm = rest.match(/^(.+?)\s+to\s+(.+)$/);
        if (!mm) fail(n, 'set은 이렇게 써요: set score to 0');
        const tg = mm[1].trim();
        if (tg === 'lives') { hasLives = true; return `G.ln=${n};G.setLives(${ex(mm[2], n, ctx)});`; }
        if (tg === 'level') usesLevel = true;
        if (tg === 'time') fail(n, 'time은 읽기만 할 수 있어요.');
        return `G.ln=${n};${ex(tg, n, ctx)}=${ex(mm[2], n, ctx)};`;
      }
      case 'else': case 'elif': fail(n, `${w} 앞에는 같은 칸에 if 줄이 있어야 해요.`);
      case 'repeat': case 'loop': {
        const cnt = rest.replace(/\s+times?$/i, '');
        need(cnt, n, `${w} 뒤에 횟수가 필요해요. (예: ${w} 5 times)`);
        return `G.ln=${n};for(let i=0;i<${ex(cnt, n, ctx)};i++){${body(nd, ctx, ['i'], w)}}`;
      }
      case 'confetti': if (rest) fail(n, 'confetti 뒤에는 아무것도 쓰지 않아요.'); return `G.ln=${n};G.confetti();`;
      case 'flash': return `G.ln=${n};G.flashScreen(${rest ? colorArg(rest, n, ctx) : ''});`;
      case 'slowmo': return `G.ln=${n};G.slowmo(${rest ? ex(rest.replace(/\s*(?:sec|secs|seconds?|s)$/i, ''), n, ctx) : ''});`;
      case 'banner': {
        need(rest, n, 'banner 뒤에는 "글자"가 필요해요. (예: banner "준비!" 2 sec)');
        const terms = splitTerms(rest), sec = terms.slice(1).join(' ').replace(/\s*(?:sec|secs|seconds?|s)$/i, '');
        return `G.ln=${n};G.banner(${tpl(terms[0], n, ctx)}${sec ? ',' + ex(sec, n, ctx) : ''});`;
      }
      case 'burst': {
        const terms = splitTerms(rest), at = terms.indexOf('at'), pre = at < 0 ? terms : terms.slice(0, at);
        let num = '30', col = '';
        for (const t of pre) { if (/^[\d(]/.test(t) || vars.has(t)) num = ex(t, n, ctx); else col = colorArg(t, n, ctx); }
        const pos = at < 0 ? [] : terms.slice(at + 1).map(x => posTerm(x, n, ctx));
        return `G.ln=${n};G.burst(${num},${col || 'null'},[${pos.join(',')}]);`;
      }
      case 'to': {
        topOnly(nd, ctx, 'to');
        if (ctx.inScene) fail(n, '함수(to)는 scene 밖, 맨 왼쪽 줄에서 만들어 주세요. 그러면 모든 장면에서 쓸 수 있어요.');
        const mm = rest.match(new RegExp('^(' + ID + ')((?:\\s+' + ID + ')*)$', 'u'));
        if (!mm) fail(n, '함수는 이렇게 만들어요: to boom  또는  to hurt amount  (아래 줄에 내용을 들여써요)');
        const params = mm[2].trim() ? mm[2].trim().split(/\s+/) : [];
        return `function ${mm[1]}(${params.join(',')}){${body(nd, ctx, params, 'to')}}`;
      }
      case 'do': {
        const mm = rest.match(new RegExp('^(' + ID + ')(?:\\s+(.*))?$', 'u'));
        if (!mm || !funcs.has(mm[1])) fail(n, `do 뒤에는 to 로 만든 함수 이름이 필요해요.${mm ? hint(mm[1], [...funcs]) : ''}`);
        return `G.ln=${n};${mm[1]}(${splitTerms(mm[2] || '').map(a => ex(a, n, ctx)).join(',')});`;
      }
      case 'map': {
        topOnly(nd, ctx, 'map');
        if (rest && rest.trim() !== 'topdown') fail(n, `map 뒤에는 아무것도 안 쓰거나 topdown(위에서 내려다보기)만 써요.${hint(rest.trim(), ['topdown'])}`);
        if (!nd.rowsRaw || !nd.rowsRaw.length) fail(n, 'map 아래에 지도를 그려 주세요. (# 땅, C 코인, P 플레이어, F 깃발 …)');
        const { rows, lines } = rawRows(nd);
        rows.forEach((r, i) => { for (const ch of r) if (!MAP_CHARS.includes(ch)) fail(lines[i], `지도에서 '${ch}'는 쓸 수 없어요. 쓸 수 있는 글자: # = C G S H B ^ F E P 그리고 빈칸은 .`); });
        nd.usedKids = true;
        return `G.ln=${n};${rows.some(r => r.includes('P')) ? 'player=' : ''}G.buildMap(${JSON.stringify(rows)}${rest.trim() === 'topdown' ? ',"topdown"' : ''});`;
      }
      case 'art': fail(n, 'art는 맨 왼쪽 줄에서만 쓸 수 있어요. (scene 안이 아니라 바깥에서 만들어 주세요)');
      case 'scene': {
        if (!ctx.top || ctx.inScene) fail(n, 'scene은 맨 왼쪽 줄에서만 만들 수 있어요. 장면 안에 장면을 넣을 수는 없어요.');
        const mm = rest.match(new RegExp('^(' + ID + ')$', 'u'));
        if (!mm) fail(n, 'scene은 이렇게 써요: scene menu  (아래 줄에 그 장면의 내용을 들여써요)');
        if (!nd.children.length) fail(n, 'scene 아래에 한 칸 들여쓴 내용이 필요해요.');
        nd.usedKids = true;
        return `G.ln=${n};G.defScene(${q(mm[1])},()=>{${block(nd.children, { bound: new Set(ctx.bound), top: true, inScene: true })}});`;
      }
      case 'go': {
        const mm = rest.match(new RegExp('^to\\s+(?:scene\\s+)?(' + ID + ')$', 'u'));
        if (!mm) fail(n, `go는 이렇게 써요: go to menu${scenes.size ? '\n만든 장면: ' + quoteList([...scenes]) : '  (먼저 scene menu 로 장면을 만들어요)'}`);
        if (!scenes.has(mm[1])) fail(n, `'${mm[1]}'라는 장면은 없어요.${hint(mm[1], [...scenes])}${scenes.size ? '\n만든 장면: ' + quoteList([...scenes]) : '\n먼저 scene ' + mm[1] + ' 으로 장면을 만들어 주세요.'}`);
        return `G.ln=${n};G.goScene(${q(mm[1])});`;
      }
      case 'save': case 'load': case 'forget': {
        need(rest, n, `${w} 뒤에는 변수 이름이 필요해요. (예: ${w} coins, ${w} coins and best)`);
        const names = rest.trim().split(/\s*(?:,|\band\b)\s*/).filter(Boolean);
        return names.map(nm => {
          if (!reID.test(nm)) fail(n, `${w} 뒤에는 변수 이름만 써요. '${nm}'는 이름이 아니에요.`);
          if (!['score', 'lives', 'level'].includes(nm) && !vars.has(nm)) fail(n, `'${nm}' 변수가 없어요.${hint(nm, [...vars])} 먼저 ${nm} = 0 처럼 만들어 주세요.`);
          if (nm === 'level') usesLevel = true;
          if (nm === 'lives') hasLives = true;
          const tg = ex(nm, n, ctx);
          if (w === 'save') return `G.ln=${n};G.saveVar(${q(nm)},${tg});`;
          if (w === 'load') return `G.ln=${n};${tg}=G.loadVar(${q(nm)},${tg});`;
          return `G.ln=${n};G.forgetVar(${q(nm)});`;
        }).join('');
      }
      case 'talk': {
        need(rest, n, 'talk 뒤에는 "대사"가 필요해요. (예: talk "안녕!"  또는  talk "할아버지" "어서 오너라")');
        const terms = splitTerms(rest);
        if (terms.length > 2 || terms.some(x => !/^["']/.test(x) && !reID.test(x))) fail(n, 'talk는 이렇게 써요: talk "대사"  또는  talk "이름" "대사"');
        return `G.ln=${n};G.talk(${terms.length === 2 ? tpl(terms[0], n, ctx) : 'null'},${tpl(terms[terms.length - 1], n, ctx)});`;
      }
      case 'camera': {
        const v = rest.trim(), mm = v.match(new RegExp('^follow\\s+(' + ID + ')$', 'u'));
        if (mm) return `G.ln=${n};G.camFollow(${ex(mm[1], n, ctx)});`;
        if (v === 'off' || v === 'stop') return `G.ln=${n};G.camFollow(null);`;
        fail(n, 'camera는 이렇게 써요: camera follow player  (멈추려면 camera off)');
      }
      case 'tone': {
        const terms = splitTerms(rest), wv = terms.filter(x => WAVES.includes(x)), num = terms.filter(x => !WAVES.includes(x));
        if (wv.length > 1) fail(n, `소리 종류는 하나만 써요: ${quoteList(WAVES)}`);
        let f1 = 'null', rest2 = num;
        const ti = num.indexOf('to');
        if (ti === 0) fail(n, 'tone 맨 앞에는 높이(숫자)가 와야 해요. (예: tone 440, tone 300 to 900 0.3)');
        if (ti > 0) { f1 = ex(num[ti + 1], n, ctx); rest2 = [...num.slice(0, ti), ...num.slice(ti + 2)]; }
        if (!rest2.length || rest2.length > 2 || (ti > 0 && !num[ti + 1])) fail(n, `tone은 이렇게 써요: tone 440  /  tone 440 0.3  /  tone 300 to 900 0.3 saw\n소리 종류: ${quoteList(WAVES)}`);
        return `G.ln=${n};G.tone(${ex(rest2[0], n, ctx)},${f1},${rest2[1] ? ex(rest2[1], n, ctx) : 'null'},${q(wv[0] || 'square')});`;
      }
      case 'play': {
        const terms = splitTerms(rest), wv = terms.filter(x => WAVES.includes(x)), other = terms.filter(x => !WAVES.includes(x));
        if (!other.length || !/^["']/.test(other[0]) || other.length > 2) fail(n, `play는 이렇게 써요: play "C E G C5"  또는  play "도 레 미" 0.2\n음 이름: C D E F G A B (또는 도 레 미 파 솔 라 시), 뒤에 숫자는 옥타브, - 는 쉼표`);
        if (!isTpl(other[0])) {
          const notes = JSON.parse(other[0][0] === "'" ? '"' + other[0].slice(1, -1).replace(/"/g, '\\"') + '"' : other[0]).trim().split(/\s+/).filter(Boolean);
          const bad = notes.find(x => !NOTE_RE.test(x));
          if (!notes.length) fail(n, 'play 안에 음이 없어요. (예: play "C E G")');
          if (bad) fail(n, `'${bad}'는 음 이름이 아니에요. C D E F G A B (또는 도 레 미 파 솔 라 시), C5 처럼 옥타브, C# 처럼 반음, - 는 쉼표예요.`);
        }
        return `G.ln=${n};G.playNotes(${tpl(other[0], n, ctx)},${other[1] ? ex(other[1], n, ctx) : 'null'},${q(wv[0] || 'triangle')});`;
      }
      case 'weather':
        if (!WEATHERS.includes(rest.trim())) fail(n, `weather 뒤에는 ${quoteList(WEATHERS)} 중 하나가 와야 해요.${rest ? hint(rest.trim(), WEATHERS) : ''}`);
        return `G.ln=${n};G.setWeather(${q(rest.trim())});`;
      case 'level':
        if (rest.trim() !== 'up') fail(n, "level 뒤에는 up만 쓸 수 있어요. (예: level up) 현재 레벨 숫자는 level 이라고만 쓰면 돼요.");
        usesLevel = true; return `G.ln=${n};G.levelUp();`;
      case 'music':
        if (!MUSICS.includes(rest.trim())) fail(n, `music 뒤에는 ${quoteList(MUSICS)} 중 하나가 와야 해요.${rest ? hint(rest.trim(), MUSICS) : ''}`);
        return `G.ln=${n};G.music(${q(rest.trim())});`;
      case 'win': if (rest) fail(n, 'win 뒤에는 아무것도 쓰지 않아요.'); return `G.ln=${n};G.win();`;
      case 'gameover': if (rest) fail(n, 'gameover 뒤에는 아무것도 쓰지 않아요.'); return `G.ln=${n};G.gameOver();`;
      case 'shake': return `G.ln=${n};G.shake(${rest ? ex(rest, n, ctx) : ''});`;
      case 'sound':
        if (!SOUNDS.includes(rest.trim())) fail(n, `sound 뒤에는 소리 이름이 필요해요: ${quoteList(SOUNDS)}.${rest ? hint(rest.trim(), SOUNDS) : ''}`);
        return `G.ln=${n};G.sound(${q(rest.trim())});`;
      case 'label': {
        const terms = splitTerms(rest);
        need(rest, n, 'label 뒤에는 "글자"가 필요해요. (예: label "안녕" at center top)');
        const at = terms.indexOf('at');
        const text = at < 0 ? terms : terms.slice(0, at);
        const pos = at < 0 ? [] : terms.slice(at + 1).map(x => posTerm(x, n, ctx));
        const tt = text.join(' ');
        return `G.ln=${n};G.label(${isTpl(tt) ? '()=>' : ''}${tpl(tt, n, ctx)},[${pos.join(',')}]);`;
      }
    }
    if (funcs.has(w)) return `G.ln=${n};${w}(${splitTerms(rest).map(a => ex(a, n, ctx)).join(',')});`;
    if (CMDS[w]) fail(n, `'${w}'는 누구에게 시킬지가 필요해요. 이렇게 점(.)으로 이어 써요: rock.${w}`);
    if ((vars.has(w) || LOOKS.includes(w)) && /^\S+/.test(rest) && CMDS[rest.split(/\s+/)[0]]) fail(n, `'${w} ${rest.split(/\s+/)[0]}' 처럼 띄우지 말고 점(.)으로 이어 주세요: ${w}.${rest.split(/\s+/)[0]}`);
    fail(n, `'${w}'는 알 수 없는 명령이에요.${hint(w, [...STATEMENTS, ...Object.keys(CMDS)])}\n쓸 수 있는 명령: ${quoteList(STATEMENTS)}`);
  }

  function block(nodes, ctx) {
    let out = '';
    for (let i = 0; i < nodes.length; i++) {
      const nd = nodes[i];
      let js = stmt(nd, ctx);
      if (nd.isTrigger && i + 1 < nodes.length && /^(else|elif)\b/.test(nodes[i + 1].text)) fail(nodes[i + 1].n, "맨 왼쪽 줄의 if(이벤트·조건 트리거)에는 else를 붙일 수 없어요. else는 다른 블록 안쪽의 if에서만 쓸 수 있어요.");
      if (/^if\b/.test(nd.text) && !nd.isTrigger) {
        while (i + 1 < nodes.length) {
          const nx = nodes[i + 1], m = nx.text.match(/^(?:else\s+if|elif)\s+(.+)$/);
          if (m) { js += `else if(${ex(m[1], nx.n, ctx)}){${body(nx, ctx, null, 'else if')}}`; i++; continue; }
          if (/^else$/.test(nx.text)) { js += `else{${body(nx, ctx, null, 'else')}}`; i++; }
          break;
        }
      }
      if (nd.children.length && !nd.usedKids) fail(nd.children[0].n, '이 줄은 위 줄의 안쪽이 아니에요. 들여쓰기를 줄이거나, 위 줄 끝에 빠진 게 없는지 확인해 보세요.');
      out += js;
    }
    return out;
  }

  const artNodes = tree.filter(nd => /^art\s/.test(nd.text)), rest0 = tree.filter(nd => !artNodes.includes(nd));
  const artCode = artNodes.map(nd => {
    const mm = nd.text.match(new RegExp('^art\\s+(' + ID + ')(?:\\s+(\\S+))?$', 'u'));
    if (!mm) fail(nd.n, 'art는 이렇게 써요: art ghost white  (아래 줄에 글자로 그림을 그려요)');
    if (!nd.rowsRaw.length) fail(nd.n, 'art 아래에 글자로 그림을 그려 주세요. (# 는 기본 색, k w r o y g b p c n m d 는 색깔)');
    const { rows, lines } = rawRows(nd);
    if (rows.length > 32 || rows.some(r => r.length > 32)) fail(nd.n, '그림은 가로세로 32칸까지 가능해요.');
    rows.forEach((r, i) => { for (const ch of r) if (!ART_CHARS.includes(ch)) fail(lines[i], `그림에서 '${ch}'는 쓸 수 없어요. 쓸 수 있는 글자: # . k w r o y g b p c n m d`); });
    const col = mm[2] ? colorArg(mm[2], nd.n, null) : q('white');
    return `G.defineArt(${q(mm[1])},${JSON.stringify(rows)},${col});`;
  }).join('');
  const code = artCode + block(rest0, { bound: new Set(), top: true, inScene: false });
  if (firstLivesAdd && !hasLives) fail(firstLivesAdd, "목숨을 늘리고 줄이려면 먼저 맨 위에서 목숨 수를 정해 주세요. (예: lives 3)");
  const declared = [...vars];
  const head = (usesLevel ? 'G.useLevel();' : '') + (declared.length ? `let ${declared.join(',')};` : '') +
    LOOKS.filter(l => !vars.has(l)).map(l => `const ${l}=G.group(${q(l)});`).join('');
  return head + code;
}

function compileSafe(src) {
  try { return { ok: true, code: compile(src) }; }
  catch (e) {
    if (e instanceof FFError) return { ok: false, line: e.line, message: e.message };
    return { ok: false, line: 0, message: '알 수 없는 문제가 생겼어요: ' + e.message };
  }
}
function explain(e) {
  const m = String(e && e.message || e);
  if (/undefined|null/.test(m) && /Cannot (read|set)/.test(m)) return '아직 만들지 않은 것을 쓰려고 했어요. make로 먼저 만들었는지, 이름이 맞는지 확인해 보세요.';
  if (/is not defined/.test(m)) return '모르는 이름을 썼어요: ' + m.replace(/ is not defined/, '');
  return m;
}
function toFunction(code) { return new Function('G', code); }

const lists = { waves: WAVES, weathers: WEATHERS, statements: STATEMENTS, cmds: Object.keys(CMDS), looks: BUILTIN_LOOKS, backs: BACKS, colors: COLOR_WORDS, controls: CONTROLS, sounds: SOUNDS, dirs: DIRS, musics: MUSICS, pos: POS_WORDS, sides: SIDES, words: WORDS, builtin: BUILTIN };
global.FFScript = { compile, compileSafe, explain, toFunction, FFError, LOOKS: BUILTIN_LOOKS, BACKS, COLOR_WORDS, lists };
})(typeof window !== 'undefined' ? window : globalThis);
