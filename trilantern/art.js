/* 삼원의 등불 — 벡터 아트. 이미지 파일 없이 전부 SVG 문자열로 그린다. */
(function (root) {
'use strict';

var n = 0;
var OL = ' stroke="#07080c" stroke-opacity=".55" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"';
/* 위에서 아래로 밝기가 변하는 채움. 반환: [defs, fill 속성값] */
function G(c1, c2, o) {
  var id = 'g' + (++n);
  return ['<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c1 + '"' + (o ? ' stop-opacity="' + o + '"' : '') + '/><stop offset="1" stop-color="' + c2 + '"' + (o ? ' stop-opacity=".15"' : '') + '/></linearGradient>', 'url(#' + id + ')'];
}
function R(cx, cy, r, c1, c2) {
  var id = 'r' + (++n);
  return ['<radialGradient id="' + id + '" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></radialGradient>', 'url(#' + id + ')'];
}
function defs() { var s = ''; for (var i = 0; i < arguments.length; i++) s += arguments[i][0]; return '<defs>' + s + '</defs>'; }
function mir(s) { return s + '<g transform="translate(100 0) scale(-1 1)">' + s + '</g>'; }
function eye(x, y, r, c) {
  return '<circle cx="' + x + '" cy="' + y + '" r="' + (r * 2.1) + '" fill="' + c + '" opacity=".22"/>' +
    '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + c + '"/>' +
    '<circle cx="' + (x - r * .3) + '" cy="' + (y - r * .35) + '" r="' + (r * .38) + '" fill="#fff" opacity=".95"/>';
}
function shadow(rx) { return '<ellipse cx="50" cy="93" rx="' + (rx || 30) + '" ry="4.5" fill="#000" opacity=".4"/>'; }
function path(d, fill, extra) { return '<path d="' + d + '" fill="' + fill + '"' + OL + (extra || '') + '/>'; }
function poly(pts, fill, extra) { return '<polygon points="' + pts + '" fill="' + fill + '"' + OL + (extra || '') + '/>'; }
function svg(vb, inner, cls) { return '<svg viewBox="' + vb + '" class="' + (cls || '') + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + inner + '</svg>'; }

/* ---------- 적 ---------- */
function spider(pal, lantern) {
  var g = G(pal[0], pal[1]), gl = G(pal[2], pal[3]);
  var legs = mir('<g fill="none" stroke="' + pal[3] + '" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M42 54 Q16 30 8 58"/><path d="M41 59 Q12 52 5 78"/><path d="M43 64 Q14 72 12 92"/><path d="M46 68 Q30 82 27 95"/></g>' +
    '<g fill="none" stroke="' + pal[2] + '" stroke-width="1.2" opacity=".5"><path d="M42 54 Q16 30 8 58"/><path d="M41 59 Q12 52 5 78"/></g>');
  return defs(g, gl) + legs +
    path('M28 62 Q26 38 50 38 Q74 38 72 62 Q72 90 50 90 Q28 90 28 62Z', g[1]) +
    (lantern
      ? '<circle cx="50" cy="66" r="19" fill="#ffc24a" opacity=".16"/><circle cx="50" cy="66" r="11" fill="#ffc24a" opacity=".45"/><rect x="45" y="58" width="10" height="16" rx="3" fill="#ffd877" stroke="#7a4a10" stroke-width="1.4"/><path d="M45 58 H55 M45 74 H55" stroke="#7a4a10" stroke-width="1.6"/>'
      : '<path d="M50 44 L56 60 L50 78 L44 60Z" fill="' + pal[2] + '" opacity=".55"/><path d="M36 58 L44 66 L38 78Z M64 58 L56 66 L62 78Z" fill="' + pal[2] + '" opacity=".35"/>') +
    path('M36 34 Q36 20 50 20 Q64 20 64 34 Q64 46 50 46 Q36 46 36 34Z', gl[1]) +
    eye(44, 31, 2.6, pal[4]) + eye(56, 31, 2.6, pal[4]) + eye(39.5, 37, 1.7, pal[4]) + eye(60.5, 37, 1.7, pal[4]) +
    '<path d="M45 44 L43 52 L48 46Z M55 44 L57 52 L52 46Z" fill="#e8e0d0"/>';
}
var ENEMY = {
  rat: function () {
    var g = G('#a89a92', '#5a4e4a');
    return defs(g) + shadow(26) + '<path d="M70 84 Q98 84 92 58" fill="none" stroke="#d9a3a3" stroke-width="3.4" stroke-linecap="round"/>' +
      mir('<ellipse cx="38" cy="88" rx="8" ry="3.4" fill="#cdb7b0"' + OL + '/>') +
      path('M26 72 Q24 50 50 48 Q76 50 74 72 Q74 88 50 88 Q26 88 26 72Z', g[1]) +
      mir('<circle cx="36" cy="33" r="10" fill="' + g[1] + '"' + OL + '/><circle cx="36" cy="33" r="5.4" fill="#e8a0a8"/>') +
      path('M33 48 Q32 30 50 30 Q68 30 67 48 Q66 62 50 62 Q34 62 33 48Z', g[1]) +
      '<ellipse cx="50" cy="56" rx="9" ry="6.5" fill="#dccbc4"/><circle cx="50" cy="52.5" r="2.6" fill="#e07a8a"/>' +
      '<path d="M40 56 L28 52 M40 58 L27 59 M60 56 L72 52 M60 58 L73 59" stroke="#e8dcd6" stroke-width="1" opacity=".8"/>' +
      eye(42, 44, 3.2, '#ff5a3a') + eye(58, 44, 3.2, '#ff5a3a') +
      '<circle cx="40" cy="68" r="1.8" fill="#ff9a4a"/><circle cx="60" cy="72" r="1.5" fill="#ffb347"/><circle cx="52" cy="78" r="1.3" fill="#ff9a4a"/>';
  },
  golem: function () {
    var g = G('#4a4f5a', '#1c1e24'), h = G('#5a606c', '#2a2d34');
    return defs(g, h) + shadow(34) +
      mir(poly('6,46 24,38 30,64 12,70', h[1])) +
      poly('26,92 20,58 34,34 66,34 80,58 74,92', g[1]) +
      poly('37,36 41,16 59,16 63,36', h[1]) +
      '<circle cx="50" cy="62" r="14" fill="#ff7a2a" opacity=".22"/><circle cx="50" cy="62" r="7" fill="#ff9a3a" opacity=".6"/>' +
      '<path d="M50 38 L45 54 L55 66 L48 84 M32 58 L42 62 M68 56 L58 62 M24 48 L30 56" fill="none" stroke="#ff7a2a" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M40 22 L47 25 L47 28 L40 26Z M60 22 L53 25 L53 28 L60 26Z" fill="#ff9a3a"/>' +
      mir('<circle cx="12" cy="80" r="9" fill="' + h[1] + '"' + OL + '/>');
  },
  bat: function () {
    var g = G('#5a4380', '#2a1d44'), b = G('#6a5290', '#33244f');
    return defs(g, b) + shadow(18) +
      mir('<path d="M47 50 Q32 18 4 30 Q14 38 11 50 Q22 48 25 62 Q37 54 47 64Z" fill="' + g[1] + '"' + OL + '/><path d="M47 50 L11 50 M47 56 L25 62 M47 46 L20 36" stroke="#9a7ac4" stroke-width="1" opacity=".55" fill="none"/>' +
        '<path d="M41 33 L37 14 L47 28Z" fill="' + b[1] + '"' + OL + '/>') +
      path('M39 56 Q38 40 50 40 Q62 40 61 56 Q60 74 50 76 Q40 74 39 56Z', b[1]) +
      path('M39 36 Q39 24 50 24 Q61 24 61 36 Q61 46 50 46 Q39 46 39 36Z', b[1]) +
      eye(44.5, 35, 2.6, '#ff4a5a') + eye(55.5, 35, 2.6, '#ff4a5a') +
      '<path d="M45 43 L47 50 L50 44 L53 50 L55 43" fill="#fff" stroke="#07080c" stroke-opacity=".4" stroke-width=".8"/>' +
      '<ellipse cx="50" cy="60" rx="5" ry="8" fill="#8a6ab4" opacity=".35"/>';
  },
  spore: function () {
    var c = G('#9b5cc8', '#4a2468'), s = G('#f0e6d2', '#bfae92');
    return defs(c, s) + shadow(26) +
      path('M38 90 Q36 68 41 54 L59 54 Q64 68 62 90Z', s[1]) +
      path('M8 58 Q8 14 50 12 Q92 14 92 58 Q50 68 8 58Z', c[1]) +
      '<circle cx="28" cy="36" r="7" fill="#e8c8ff" opacity=".85"/><circle cx="56" cy="26" r="5.4" fill="#e8c8ff" opacity=".85"/><circle cx="74" cy="42" r="6.4" fill="#e8c8ff" opacity=".85"/><circle cx="44" cy="46" r="3.6" fill="#e8c8ff" opacity=".7"/>' +
      '<path d="M10 58 Q50 70 90 58" fill="none" stroke="#2a1038" stroke-opacity=".5" stroke-width="3"/>' +
      eye(44, 70, 3, '#c8ff5a') + eye(56, 70, 3, '#c8ff5a') + '<path d="M45 80 Q50 84 55 80" stroke="#4a3a22" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
      '<g fill="#c8ff5a" opacity=".55"><circle cx="14" cy="22" r="2.2"/><circle cx="86" cy="18" r="1.8"/><circle cx="92" cy="40" r="1.5"/><circle cx="6" cy="44" r="1.6"/></g>';
  },
  thief: function () {
    var c = G('#52473c', '#1e1914');
    return defs(c) + shadow(28) +
      '<circle cx="20" cy="68" r="11" fill="#7a6840"' + OL + '/><circle cx="24" cy="63" r="2.2" fill="#ffd84a"/><path d="M14 58 L22 56" stroke="#5a4a28" stroke-width="2"/>' +
      path('M50 16 Q22 24 20 68 L12 92 L88 92 L80 68 Q78 24 50 16Z', c[1]) +
      '<ellipse cx="50" cy="38" rx="14" ry="16" fill="#0a0b0e"/>' + eye(44, 38, 2.6, '#ffd84a') + eye(56, 38, 2.6, '#ffd84a') +
      path('M33 56 Q50 68 67 56 L65 66 Q50 76 35 66Z', '#a8392e') +
      '<path d="M76 62 L80 40 L85 62Z" fill="#cdd6e0"' + OL + '/><rect x="75" y="62" width="11" height="3.6" rx="1" fill="#6b4a2a"/><rect x="79" y="65" width="3.4" height="9" fill="#6b4a2a"/>' +
      '<path d="M36 78 Q50 84 64 78" stroke="#07080c" stroke-opacity=".35" stroke-width="2" fill="none"/>';
  },
  turtle: function () {
    var s = G('#6a3224', '#2a1210'), h = G('#8a4a34', '#4a2418');
    return defs(s, h) + shadow(38) +
      '<ellipse cx="22" cy="86" rx="11" ry="6" fill="' + h[1] + '"' + OL + '/><ellipse cx="78" cy="86" rx="11" ry="6" fill="' + h[1] + '"' + OL + '/>' +
      '<ellipse cx="50" cy="60" rx="42" ry="30" fill="#ff6a2a" opacity=".13"/>' +
      path('M8 74 Q10 22 50 20 Q90 22 92 74Z', s[1]) +
      '<path d="M50 21 L50 74 M30 30 L36 52 L50 58 M70 30 L64 52 L50 58 M16 56 L36 54 M84 56 L64 54 M36 52 L30 72 M64 52 L70 72" fill="none" stroke="#ff6a2a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M50 21 L50 74 M30 30 L36 52 L50 58 M70 30 L64 52 L50 58" fill="none" stroke="#ffd84a" stroke-width=".9" opacity=".8"/>' +
      '<ellipse cx="50" cy="78" rx="14" ry="11" fill="' + h[1] + '"' + OL + '/>' + eye(44, 76, 2.8, '#ff9a3a') + eye(56, 76, 2.8, '#ff9a3a') +
      '<path d="M44 85 Q50 88 56 85" stroke="#2a1008" stroke-width="1.6" fill="none"/>';
  },
  wraith: function () {
    var g = G('#c4f6ea', '#2a7a70', 1);
    return defs(g) + '<circle cx="50" cy="50" r="40" fill="#6af0d8" opacity=".1"/>' +
      '<path d="M50 10 Q22 12 22 46 L22 86 Q30 78 36 88 Q43 78 50 88 Q57 78 64 88 Q70 78 78 86 L78 46 Q78 12 50 10Z" fill="' + g[1] + '"' + OL + '/>' +
      mir('<path d="M24 54 Q8 58 10 74 Q18 66 24 70" fill="#a8eadc" opacity=".6"/>') +
      '<ellipse cx="40" cy="38" rx="6" ry="8.5" fill="#0a2a28"/><ellipse cx="60" cy="38" rx="6" ry="8.5" fill="#0a2a28"/>' +
      '<circle cx="40" cy="40" r="2.4" fill="#aaffee"/><circle cx="60" cy="40" r="2.4" fill="#aaffee"/>' +
      '<ellipse cx="50" cy="58" rx="5" ry="8" fill="#0a2a28"/>';
  },
  queen: function () { return shadow(34) + spider(['#5a3470', '#1e1028', '#ffd877', '#35203f', '#ff5a5a'], true); },
  sprite: function () {
    var g = G('#c8efff', '#3a8ac8', 1);
    return defs(g) + '<circle cx="50" cy="50" r="38" fill="#5cc8ff" opacity=".12"/>' +
      mir('<polygon points="8,52 15,40 22,54 15,66" fill="#9adcff"' + OL + '/>') +
      poly('50,5 74,36 63,90 37,90 26,36', g[1]) +
      '<polygon points="50,5 50,90 37,90 26,36" fill="#fff" opacity=".28"/><polygon points="50,5 74,36 50,44" fill="#fff" opacity=".18"/>' +
      '<path d="M26 36 L50 44 L74 36 M50 44 L50 90" stroke="#fff" stroke-opacity=".5" stroke-width="1" fill="none"/>' +
      eye(43, 52, 3, '#0f4a7a') + eye(57, 52, 3, '#0f4a7a') + '<path d="M45 64 Q50 68 55 64" stroke="#0f4a7a" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      '<g fill="#fff"><circle cx="18" cy="24" r="1.8"/><circle cx="84" cy="30" r="1.4"/><circle cx="80" cy="76" r="1.6"/></g>';
  },
  wolf: function () {
    var g = G('#d6e8f4', '#7ea0ba');
    return defs(g) + shadow(34) +
      path('M12 60 L6 34 L26 44 L30 20 L42 36 L50 12 L58 36 L70 20 L74 44 L94 34 L88 60 Q88 88 50 92 Q12 88 12 60Z', g[1]) +
      mir('<polygon points="30,20 33,32 26,34" fill="#4a6a84" opacity=".7"/>') +
      path('M36 60 Q50 50 64 60 L60 80 Q50 86 40 80Z', '#eef6fb') +
      '<ellipse cx="50" cy="62" rx="5.4" ry="3.8" fill="#1a2430"/>' +
      mir('<path d="M26 44 L42 50" stroke="#1a2a3a" stroke-width="2.4" stroke-linecap="round"/>') +
      eye(37, 52, 3.2, '#5cc8ff') + eye(63, 52, 3.2, '#5cc8ff') +
      '<path d="M43 78 L45 90 L49 79 M57 78 L55 90 L51 79" fill="#fff" stroke="#07080c" stroke-opacity=".4" stroke-width="1"/>' +
      '<path d="M50 66 L50 76" stroke="#1a2430" stroke-width="1.6"/>';
  },
  owl: function () {
    var g = G('#eef4fa', '#8aa6c0'), w = G('#c4d6e6', '#6a88a4');
    return defs(g, w) + shadow(28) +
      mir('<path d="M26 42 Q2 58 10 90 Q26 80 30 62Z" fill="' + w[1] + '"' + OL + '/><path d="M20 62 Q16 74 14 84 M25 56 Q22 68 20 78" stroke="#4a6a86" stroke-opacity=".5" fill="none"/>' +
        '<polygon points="30,26 26,8 41,20" fill="' + w[1] + '"' + OL + '/>') +
      path('M24 58 Q22 24 50 24 Q78 24 76 58 Q76 90 50 90 Q24 90 24 58Z', g[1]) +
      mir('<circle cx="39" cy="44" r="11" fill="#fff"' + OL + '/><circle cx="39" cy="44" r="6.8" fill="#ffd84a"/><circle cx="39" cy="44" r="3.4" fill="#10161e"/><circle cx="37.4" cy="42.4" r="1.2" fill="#fff"/>') +
      path('M45 52 L50 64 L55 52Z', '#f0a83a') +
      '<g fill="none" stroke="#5a7894" stroke-opacity=".45" stroke-width="1.4"><path d="M38 70 Q43 74 48 70 M52 70 Q57 74 62 70 M42 80 Q47 84 52 80 M52 80 Q57 84 62 80"/></g>' +
      '<g fill="#ffd84a"><polygon points="82,20 86,28 80,28"/><polygon points="14,70 18,76 12,76"/></g>';
  },
  troll: function () {
    var g = G('#7a8c78', '#3a463e'), h = G('#90a18c', '#56665a');
    return defs(g, h) + shadow(38) +
      mir(path('M4 62 Q2 90 20 88 L26 58Z', g[1]) + '<circle cx="12" cy="82" r="10" fill="' + h[1] + '"' + OL + '/>') +
      path('M18 92 L16 58 Q18 38 34 36 L66 36 Q82 38 84 58 L82 92Z', g[1]) +
      '<path d="M24 48 L34 44 L30 56Z M70 44 L78 52 L68 56Z M40 70 L50 66 L48 80Z" fill="#e8f4fb" opacity=".8"/>' +
      path('M34 28 Q34 10 50 10 Q66 10 66 28 Q66 44 50 44 Q34 44 34 28Z', h[1]) +
      mir('<circle cx="33" cy="26" r="5" fill="' + h[1] + '"' + OL + '/><path d="M42 36 L40 50 L47 38Z" fill="#f4ecd8"' + OL + '/><path d="M36 21 L47 25" stroke="#1e261f" stroke-width="3" stroke-linecap="round"/>') +
      eye(43, 28, 2.5, '#ffd84a') + eye(57, 28, 2.5, '#ffd84a') + '<ellipse cx="50" cy="36" rx="4" ry="2.4" fill="#3a463e"/>';
  },
  spider: function () { return shadow(30) + spider(['#7aa6cc', '#24405c', '#bfe8ff', '#35566f', '#5cc8ff'], false); },
  sentinel: function () {
    var g = G('#a2e8ff', '#2a6aa8'), d = G('#4a86b8', '#1a3a5c');
    return defs(g, d) + '<circle cx="50" cy="42" r="42" fill="#5cc8ff" opacity=".1"/>' + shadow(26) +
      mir('<polygon points="8,26 17,12 23,32 15,48" fill="#7acaf0"' + OL + '/><polygon points="12,62 19,52 24,66 17,76" fill="#5aa8d8"' + OL + '/>') +
      poly('34,68 40,92 60,92 66,68', d[1]) +
      poly('50,4 76,20 76,56 50,72 24,56 24,20', g[1]) +
      '<polygon points="50,4 50,72 24,56 24,20" fill="#fff" opacity=".22"/><polygon points="50,4 76,20 50,30" fill="#fff" opacity=".2"/>' +
      '<path d="M24 20 L50 30 L76 20 M50 30 L50 72" stroke="#fff" stroke-opacity=".5" fill="none"/>' +
      '<polygon points="50,24 63,40 50,56 37,40" fill="#fff" opacity=".92"/><circle cx="50" cy="40" r="20" fill="#bfeaff" opacity=".25"/><ellipse cx="50" cy="40" rx="2.6" ry="8" fill="#0f4a7a"/>';
  },
  shaman: function () {
    var g = G('#f6f9fc', '#a8bccc');
    return defs(g) + shadow(30) +
      '<line x1="84" y1="94" x2="82" y2="24" stroke="#8a6a4a" stroke-width="3.4" stroke-linecap="round"/>' +
      '<circle cx="82" cy="19" r="14" fill="#5cc8ff" opacity=".2"/><circle cx="82" cy="19" r="7.4" fill="#5cc8ff"' + OL + '/><circle cx="80" cy="16.5" r="2.4" fill="#fff"/>' +
      path('M12 92 Q8 50 34 40 L66 40 Q92 50 88 92Z', g[1]) +
      '<path d="M24 62 L28 76 M34 54 L36 72 M64 54 L66 72 M74 62 L72 76 M44 80 L46 90 M56 80 L54 90" stroke="#7c92a6" stroke-opacity=".55" stroke-width="1.6" fill="none"/>' +
      mir('<path d="M38 22 Q30 6 18 10" fill="none" stroke="#e8dfc4" stroke-width="4" stroke-linecap="round"/>') +
      path('M33 32 Q33 14 50 14 Q67 14 67 32 Q67 48 50 48 Q33 48 33 32Z', '#e8eef4') +
      '<ellipse cx="50" cy="35" rx="12" ry="9" fill="#26364c"/>' + eye(45, 34, 2.4, '#5cc8ff') + eye(55, 34, 2.4, '#5cc8ff') +
      '<path d="M40 52 L43 58 L46 52 L50 60 L54 52 L57 58 L60 52" fill="#f4ecd8" stroke="#07080c" stroke-opacity=".4" stroke-width=".8"/>';
  },
  lord: function () {
    var c = G('#2e4f80', '#0e1a30'), s = G('#f0faff', '#b4d6ec');
    return defs(c, s) + '<circle cx="50" cy="40" r="46" fill="#5cc8ff" opacity=".1"/>' + shadow(40) +
      path('M50 20 Q12 28 6 92 L94 92 Q88 28 50 20Z', c[1]) +
      '<path d="M20 80 Q50 70 80 80 M24 66 Q50 58 76 66" stroke="#8be0ff" stroke-opacity=".3" fill="none" stroke-width="1.4"/>' +
      '<polygon points="50,56 60,70 50,84 40,70" fill="#8be0ff" opacity=".85"' + OL + '/><polygon points="50,56 50,84 40,70" fill="#fff" opacity=".3"/>' +
      path('M36 38 Q36 20 50 20 Q64 20 64 38 Q64 52 56 54 L56 58 L44 58 L44 54 Q36 52 36 38Z', s[1]) +
      mir('<ellipse cx="43" cy="38" rx="5.4" ry="6.4" fill="#07101e"/><circle cx="43" cy="39" r="2.6" fill="#7ae0ff"/><circle cx="42" cy="38" r="1" fill="#fff"/>') +
      '<path d="M48 48 L50 52 L52 48Z" fill="#07101e"/><path d="M44 56 V58 M48 56 V58 M52 56 V58 M56 56 V58" stroke="#07101e" stroke-width="1.2"/>' +
      '<polygon points="34,28 36,6 43,19 50,2 57,19 64,6 66,28" fill="#8be0ff"' + OL + '/><polygon points="50,2 57,19 50,24 43,19" fill="#fff" opacity=".4"/>' +
      '<g fill="#fff" opacity=".7"><circle cx="14" cy="30" r="1.6"/><circle cx="88" cy="22" r="1.4"/><circle cx="90" cy="62" r="1.8"/><circle cx="8" cy="64" r="1.4"/></g>';
  },
  serpent: function () {
    var g = G('#f0d24a', '#9a7a0a');
    return defs(g) + shadow(30) +
      '<path d="M66 94 Q98 76 68 58 Q36 44 58 28" fill="none" stroke="#3a2c00" stroke-width="16" stroke-linecap="round" opacity=".5"/>' +
      '<path d="M66 94 Q98 76 68 58 Q36 44 58 28" fill="none" stroke="' + g[1] + '" stroke-width="13" stroke-linecap="round"/>' +
      '<path d="M66 94 Q98 76 68 58 Q36 44 58 28" fill="none" stroke="#6a4f00" stroke-width="13" stroke-dasharray="2.4 8" opacity=".45"/>' +
      '<path d="M66 94 Q98 76 68 58 Q36 44 58 28" fill="none" stroke="#fff4b0" stroke-width="3" stroke-linecap="round" opacity=".4" transform="translate(-2 -2)"/>' +
      path('M46 22 Q46 8 62 8 Q78 8 76 22 Q74 34 62 34 Q48 34 46 22Z', '#f4da5a') +
      eye(55, 19, 2.6, '#ff3a3a') + eye(67, 19, 2.6, '#ff3a3a') +
      '<path d="M61 33 L61 41 M61 41 L56 46 M61 41 L66 46" stroke="#e03a4a" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      '<polygon points="16,26 28,26 20,44 30,44 12,70 17,52 8,52" fill="#ffe96a"' + OL + '/><polygon points="84,50 90,50 86,60 92,60 80,76 83,64 78,64" fill="#fff4b0" opacity=".9"/>';
  },
  hawk: function () {
    var w = G('#4a5c82', '#1a2236'), b = G('#f0f0f6', '#9aa0b4');
    return defs(w, b) + shadow(26) +
      mir('<path d="M46 44 Q24 18 2 28 Q14 34 12 44 Q24 40 28 52 Q38 48 42 62Z" fill="' + w[1] + '"' + OL + '/><path d="M12 44 L40 52 M28 52 L42 60 M4 30 L30 40" stroke="#ffd84a" stroke-opacity=".7" stroke-width="1.2" fill="none"/>') +
      path('M42 76 L34 96 L50 90 L66 96 L58 76Z', w[1]) +
      path('M38 52 Q36 30 50 30 Q64 30 62 52 Q62 80 50 84 Q38 80 38 52Z', b[1]) +
      '<path d="M44 52 Q50 60 56 52 M44 62 Q50 70 56 62" stroke="#6a7088" stroke-opacity=".5" fill="none"/>' +
      path('M39 30 Q39 14 50 14 Q61 14 61 30 Q61 38 50 38 Q39 38 39 30Z', w[1]) +
      mir('<path d="M38 20 L47 25" stroke="#07080c" stroke-width="2.4" stroke-linecap="round"/>') +
      eye(44.5, 26, 2.4, '#ffd84a') + eye(55.5, 26, 2.4, '#ffd84a') + path('M46 32 L50 44 L54 32Z', '#ffb830');
  },
  magma: function () {
    var g = G('#ff9a2a', '#a8200a'), f = G('#fff08a', '#ff7a1a');
    return defs(g, f) + '<circle cx="50" cy="56" r="44" fill="#ff6a2a" opacity=".14"/>' + shadow(32) +
      path('M20 92 Q4 62 26 42 Q28 22 50 18 Q72 22 74 42 Q96 62 80 92Z', g[1]) +
      poly('30,46 44,38 48,54 34,60', '#2a1410', ' opacity=".88"') + poly('58,50 74,46 72,66 60,70', '#2a1410', ' opacity=".88"') + poly('36,72 52,70 56,88 38,88', '#2a1410', ' opacity=".88"') +
      '<path d="M32 24 Q36 2 44 16 Q48 -2 56 16 Q64 4 66 26Z" fill="' + f[1] + '"' + OL + '/>' +
      '<ellipse cx="42" cy="36" rx="5.6" ry="5" fill="#2a0a04"/><ellipse cx="60" cy="36" rx="5.6" ry="5" fill="#2a0a04"/>' + eye(42, 36, 2.8, '#fff4b0') + eye(60, 36, 2.8, '#fff4b0') +
      '<path d="M40 52 L44 56 L48 51 L52 56 L56 51 L60 56" stroke="#2a0a04" stroke-width="2" fill="none" stroke-linejoin="round"/>' +
      '<g fill="#ffb347"><circle cx="12" cy="30" r="1.8"/><circle cx="88" cy="26" r="1.5"/><circle cx="92" cy="54" r="1.8"/></g>';
  },
  automaton: function () {
    var g = G('#9aa6b8', '#4a5464'), h = G('#b4bece', '#6a7688');
    return defs(g, h) + shadow(32) +
      mir('<circle cx="22" cy="50" r="8" fill="#6a7688" stroke="#6a7688" stroke-width="3" stroke-dasharray="3 3"/><circle cx="22" cy="50" r="4" fill="#2a303c"/>' +
        '<rect x="8" y="54" width="14" height="24" rx="4" fill="' + g[1] + '"' + OL + '/><circle cx="15" cy="82" r="8" fill="' + h[1] + '"' + OL + '/>') +
      path('M26 46 H74 V88 H26Z', g[1]) + '<path d="M26 56 H74 M26 78 H74" stroke="#2a303c" stroke-opacity=".5" stroke-width="1.4"/>' +
      '<circle cx="50" cy="67" r="12" fill="#ffd84a" opacity=".22"/><circle cx="50" cy="67" r="6.4" fill="#ffd84a" stroke="#6a5000" stroke-width="1.6"/><circle cx="48" cy="65" r="2" fill="#fff"/>' +
      '<line x1="50" y1="16" x2="50" y2="6" stroke="#6a7688" stroke-width="2.4"/><circle cx="50" cy="5" r="3" fill="#ff4a4a"/>' +
      path('M32 16 H68 V42 H32Z', h[1]) + '<rect x="37" y="23" width="26" height="10" rx="3" fill="#0a0c10"/><rect x="40" y="27" width="20" height="2.4" rx="1" fill="#ffd84a"/><rect x="40" y="27" width="20" height="2.4" rx="1" fill="#ffd84a" opacity=".4" transform="scale(1 2.4) translate(0 -16.4)"/>' +
      '<g fill="#2a303c"><circle cx="34" cy="19" r="1.2"/><circle cx="66" cy="19" r="1.2"/><circle cx="30" cy="50" r="1.2"/><circle cx="70" cy="50" r="1.2"/></g>';
  },
  drake: function () {
    var g = G('#6a7ac0', '#2a3470'), b = G('#4a5a9a', '#1e2650');
    return defs(g, b) + '<circle cx="50" cy="44" r="44" fill="#ffd84a" opacity=".07"/>' + shadow(36) +
      mir('<path d="M26 58 Q4 36 2 68 Q14 62 18 78 Q24 70 28 82Z" fill="' + b[1] + '"' + OL + '/><path d="M2 68 L26 62 M18 78 L26 70" stroke="#8a9ae0" stroke-opacity=".5" fill="none"/>' +
        '<path d="M35 26 Q22 16 14 2 Q28 8 40 20Z" fill="#f0e8c8"' + OL + '/>') +
      path('M24 92 Q20 60 36 46 L64 46 Q80 60 76 92Z', b[1]) +
      '<path d="M38 52 L50 58 L62 52 M36 64 L50 72 L64 64 M38 78 L50 84 L62 78" stroke="#8a9ae0" stroke-opacity=".35" fill="none" stroke-width="1.4"/>' +
      path('M28 40 Q30 14 50 12 Q70 14 72 40 Q62 54 50 54 Q38 54 28 40Z', g[1]) +
      mir('<circle cx="45" cy="52" r="1.8" fill="#12183a"/><path d="M33 26 L44 31" stroke="#12183a" stroke-width="2.6" stroke-linecap="round"/>') +
      eye(41, 33, 3.4, '#ffe96a') + eye(59, 33, 3.4, '#ffe96a') + mir('<ellipse cx="41" cy="33" rx="1" ry="2.8" fill="#12183a"/>') +
      '<path d="M43 52 L45 60 L48 53 M57 52 L55 60 L52 53" fill="#fff" stroke="#07080c" stroke-opacity=".4"/>' +
      '<polyline points="22,50 30,56 24,62 34,68" fill="none" stroke="#ffe96a" stroke-width="2.2" stroke-linejoin="round"/><polyline points="78,50 70,56 76,62 66,68" fill="none" stroke="#ffe96a" stroke-width="2.2" stroke-linejoin="round"/>';
  },
  eye: function () {
    var b = R(50, 50, 30, '#34185a', '#0a0414'), i = R(50, 50, 12, '#e08aff', '#7a1ac8');
    return defs(b, i) + '<circle cx="50" cy="50" r="46" fill="#b84aff" opacity=".1"/>' +
      mir('<path d="M34 70 Q14 72 12 94 M42 76 Q34 88 31 97 M30 60 Q8 56 6 40" fill="none" stroke="#3a1a5a" stroke-width="5.4" stroke-linecap="round"/><path d="M34 70 Q14 72 12 94" fill="none" stroke="#7a3aba" stroke-width="1.4" stroke-dasharray="1 6" stroke-linecap="round"/>') +
      '<circle cx="50" cy="50" r="31" fill="' + b[1] + '"' + OL + '/>' +
      '<path d="M26 50 Q50 24 74 50 Q50 76 26 50Z" fill="#f2eaff"' + OL + '/>' +
      '<path d="M30 48 L38 50 M32 54 L40 52 M70 48 L62 50 M68 54 L60 52" stroke="#e05a8a" stroke-width=".9" opacity=".7"/>' +
      '<circle cx="50" cy="50" r="12.4" fill="' + i[1] + '"/><circle cx="50" cy="50" r="12.4" fill="none" stroke="#2a0a4a" stroke-width="1.2"/>' +
      '<ellipse cx="50" cy="50" rx="3.6" ry="10" fill="#08020f"/><circle cx="45" cy="44" r="2.6" fill="#fff" opacity=".9"/>' +
      '<path d="M24 50 Q50 20 76 50" fill="none" stroke="#07040c" stroke-width="3" opacity=".7"/>';
  },
  storm: function () {
    var f = G('#5a6ca0', '#1a2240');
    return defs(f) + '<circle cx="50" cy="46" r="48" fill="#ffd84a" opacity=".07"/>' +
      poly('22,50 78,50 64,68 57,84 50,98 43,84 36,68', f[1]) +
      '<path d="M30 56 Q50 62 70 56 M36 68 Q50 74 64 68 M42 80 Q50 85 58 80" stroke="#cdd8f4" stroke-opacity=".55" fill="none" stroke-width="1.6"/>' +
      '<ellipse cx="26" cy="42" rx="24" ry="15" fill="#2a3250"' + OL + '/><ellipse cx="74" cy="42" rx="24" ry="15" fill="#2a3250"' + OL + '/><ellipse cx="50" cy="30" rx="28" ry="19" fill="#3a4670"' + OL + '/>' +
      '<ellipse cx="42" cy="22" rx="14" ry="7" fill="#7a8cc0" opacity=".45"/><ellipse cx="16" cy="36" rx="10" ry="5" fill="#7a8cc0" opacity=".3"/>' +
      '<circle cx="50" cy="40" r="14" fill="#ffe96a" opacity=".28"/><circle cx="50" cy="40" r="8.4" fill="#fff4b0"' + OL + '/><ellipse cx="50" cy="40" rx="2.2" ry="7" fill="#1a1a2a"/>' +
      mir('<polygon points="14,52 27,52 20,72 30,72 8,100 15,80 6,80" fill="#ffe96a"' + OL + '/><polygon points="30,24 36,24 33,34 38,34 26,48 29,38 24,38" fill="#fff4b0"/>');
  }
};
function enemy(key) {
  var f = ENEMY[key];
  return svg('0 0 100 100', f ? f() : '<circle cx="50" cy="50" r="30" fill="#888"/>', 'eart');
}

/* ---------- 카드 ---------- */
var PAL = {
  f: { a: '#ff7a3c', b: '#ffd27a', c: '#5a1a08', d: '#2a0c06' },
  i: { a: '#5cc8ff', b: '#e0f6ff', c: '#0e3a5c', d: '#071a2c' },
  s: { a: '#ffd84a', b: '#fffbd0', c: '#5a4400', d: '#241b00' },
  n: { a: '#b9a6ff', b: '#f2edff', c: '#2e2262', d: '#120d2a' }
};
var M = {
  flame: function (p, k) {
    k = k || 1;
    return '<g transform="translate(50 30) scale(' + k + ') translate(-50 -28)">' +
      '<path d="M50 4 Q64 20 60 34 Q58 46 50 52 Q42 46 40 34 Q38 24 46 16 Q46 24 50 28 Q55 18 50 4Z" fill="' + p.a + '"' + OL + '/>' +
      '<path d="M50 24 Q57 34 55 42 Q52 49 48 49 Q44 46 44 40 Q44 32 50 24Z" fill="' + p.b + '"/></g>';
  },
  flames: function (p) {
    return '<g transform="translate(26 8) scale(.62)">' + M.flame(p) + '</g><g transform="translate(46 12) scale(.62)">' + M.flame(p) + '</g><g transform="translate(66 8) scale(.62)">' + M.flame(p) + '</g>' +
      '<path d="M16 50 Q50 58 84 50" stroke="' + p.b + '" stroke-opacity=".5" stroke-width="2" fill="none"/>';
  },
  ember: function (p) {
    return '<rect x="44" y="30" width="12" height="18" rx="2" fill="#e8dcc4"' + OL + '/>' + '<g transform="translate(50 18) scale(.5) translate(-50 -28)">' +
      '<path d="M50 4 Q64 20 60 34 Q58 46 50 52 Q42 46 40 34 Q38 24 46 16 Q46 24 50 28 Q55 18 50 4Z" fill="' + p.a + '"' + OL + '/><path d="M50 24 Q57 34 55 42 Q52 49 48 49 Q44 46 44 40 Q44 32 50 24Z" fill="' + p.b + '"/></g>' +
      '<g fill="' + p.b + '"><circle cx="34" cy="20" r="1.6"/><circle cx="68" cy="14" r="1.4"/><circle cx="62" cy="38" r="1.2"/></g>';
  },
  orb: function (p, k) {
    k = k || 1;
    return '<path d="M8 50 Q30 40 58 22" stroke="' + p.a + '" stroke-opacity=".5" stroke-width="' + (14 * k) + '" stroke-linecap="round" fill="none"/>' +
      '<path d="M8 50 Q30 40 58 22" stroke="' + p.b + '" stroke-opacity=".7" stroke-width="' + (5 * k) + '" stroke-linecap="round" fill="none"/>' +
      '<circle cx="64" cy="20" r="' + (17 * k) + '" fill="' + p.a + '" opacity=".28"/><circle cx="64" cy="20" r="' + (11 * k) + '" fill="' + p.a + '"' + OL + '/><circle cx="61" cy="17" r="' + (5 * k) + '" fill="' + p.b + '"/>';
  },
  blades: function (p) {
    return '<path d="M10 48 Q40 30 90 8" stroke="' + p.b + '" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M6 36 Q40 24 94 22" stroke="' + p.a + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M14 54 Q50 44 92 34" stroke="' + p.a + '" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".7"/>';
  },
  burst: function (p) {
    var pts = [], i, r, a;
    for (i = 0; i < 16; i++) { r = i % 2 ? 11 : 27; a = i * Math.PI / 8; pts.push((50 + Math.cos(a) * r * 1.2).toFixed(1) + ',' + (28 + Math.sin(a) * r).toFixed(1)); }
    return '<polygon points="' + pts.join(' ') + '" fill="' + p.a + '"' + OL + '/><circle cx="50" cy="28" r="9" fill="' + p.b + '"/>';
  },
  tornado: function (p) {
    var s = '', i;
    for (i = 0; i < 5; i++) s += '<ellipse cx="' + (50 + (i % 2 ? 3 : -3)) + '" cy="' + (10 + i * 9.5) + '" rx="' + (26 - i * 4.4) + '" ry="3.6" fill="none" stroke="' + (i % 2 ? p.b : p.a) + '" stroke-width="3.4" stroke-linecap="round"/>';
    return s;
  },
  feather: function (p) {
    return '<path d="M20 52 Q30 10 80 6 Q70 40 30 52Z" fill="' + p.a + '"' + OL + '/><path d="M20 52 Q50 30 80 6" stroke="' + p.b + '" stroke-width="2" fill="none"/><path d="M40 36 L34 26 M52 28 L48 18 M62 22 L60 13" stroke="' + p.b + '" stroke-width="1.4"/>';
  },
  fist: function (p) {
    return '<path d="M50 6 L68 28 L56 26 L56 50 L44 50 L44 26 L32 28Z" fill="' + p.a + '"' + OL + '/><path d="M50 14 L60 26 L40 26Z" fill="' + p.b + '" opacity=".6"/>';
  },
  surge: function (p) {
    return '<path d="M26 34 L42 18 L42 28 L74 28 L74 40 L42 40 L42 50Z" fill="' + p.a + '"' + OL + '/><path d="M12 22 H30 M8 30 H24 M12 38 H30" stroke="' + p.b + '" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>';
  },
  shield: function (p) {
    return '<path d="M50 4 L78 14 Q78 40 50 54 Q22 40 22 14Z" fill="' + p.a + '"' + OL + '/><path d="M50 10 L72 17 Q72 36 50 48Z" fill="' + p.b + '" opacity=".35"/><path d="M50 12 V46 M30 22 H70" stroke="' + p.b + '" stroke-width="1.6" opacity=".6"/>';
  },
  armor: function (p) {
    return M.shield(p) + '<polygon points="50,18 58,28 50,40 42,28" fill="' + p.b + '"' + OL + '/>';
  },
  spear: function (p) {
    return '<line x1="14" y1="52" x2="62" y2="16" stroke="' + p.b + '" stroke-width="3.4" stroke-linecap="round"/><polygon points="58,6 92,2 70,34 62,22" fill="' + p.a + '"' + OL + '/><polygon points="58,6 92,2 66,20" fill="' + p.b + '" opacity=".6"/>' +
      '<g fill="' + p.b + '"><circle cx="30" cy="48" r="1.6"/><circle cx="20" cy="38" r="1.3"/></g>';
  },
  bricks: function (p) {
    var s = '', r, c, o;
    for (r = 0; r < 3; r++) for (c = 0; c < 3; c++) { o = r % 2 ? 0 : 8; s += '<rect x="' + (14 + c * 24 - o) + '" y="' + (6 + r * 16) + '" width="22" height="14" rx="2" fill="' + (r === 1 ? p.b : p.a) + '"' + OL + ' opacity="' + (.85 + .05 * c) + '"/>'; }
    return '<clipPath id="bc"><rect x="6" y="0" width="88" height="56"/></clipPath><g clip-path="url(#bc)">' + s + '</g>';
  },
  flake: function (p) {
    var s = '', i;
    for (i = 0; i < 3; i++) s += '<g transform="rotate(' + (i * 60) + ' 50 28)"><line x1="50" y1="4" x2="50" y2="52" stroke="' + p.a + '" stroke-width="3.2" stroke-linecap="round"/><path d="M50 12 L43 6 M50 12 L57 6 M50 44 L43 50 M50 44 L57 50 M50 22 L44 17 M50 22 L56 17 M50 34 L44 39 M50 34 L56 39" stroke="' + p.b + '" stroke-width="2" stroke-linecap="round"/></g>';
    return s + '<circle cx="50" cy="28" r="4" fill="' + p.b + '"/>';
  },
  mountain: function (p) {
    return '<polygon points="4,54 34,10 54,38 64,24 96,54" fill="' + p.a + '"' + OL + '/><polygon points="34,10 44,24 34,22 26,26" fill="#fff"/><polygon points="64,24 72,34 64,32 58,34" fill="#fff"/><polygon points="34,10 54,38 4,54" fill="#000" opacity=".18"/>';
  },
  hammer: function (p) {
    return '<line x1="22" y1="52" x2="62" y2="16" stroke="#a88a5a" stroke-width="5" stroke-linecap="round"/><rect x="48" y="2" width="38" height="22" rx="4" transform="rotate(38 66 14)" fill="' + p.a + '"' + OL + '/><rect x="52" y="5" width="30" height="7" rx="2" transform="rotate(38 66 14)" fill="' + p.b + '" opacity=".5"/>';
  },
  bolt: function (p, k) {
    k = k || 1;
    return '<g transform="translate(50 28) scale(' + k + ') translate(-50 -28)"><polygon points="58,2 28,32 46,32 38,54 72,22 52,22" fill="' + p.a + '"' + OL + '/><polygon points="58,2 46,22 52,22 40,44 56,24 46,24" fill="' + p.b + '" opacity=".8"/></g>';
  },
  chain: function (p) {
    return '<polyline points="6,14 30,22 22,34 52,30 44,46 76,34 70,48 94,42" fill="none" stroke="' + p.a + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><polyline points="6,14 30,22 22,34 52,30 44,46 76,34 70,48 94,42" fill="none" stroke="' + p.b + '" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<g fill="' + p.b + '"><circle cx="30" cy="22" r="3"/><circle cx="52" cy="30" r="3"/><circle cx="76" cy="34" r="3"/></g>';
  },
  battery: function (p) {
    return '<rect x="26" y="12" width="44" height="32" rx="5" fill="#2a303c"' + OL + '/><rect x="70" y="21" width="7" height="14" rx="2" fill="#6a7688"/><rect x="30" y="16" width="14" height="24" rx="2" fill="' + p.a + '"/><rect x="47" y="16" width="9" height="24" rx="2" fill="' + p.a + '" opacity=".6"/><rect x="59" y="16" width="7" height="24" rx="2" fill="' + p.a + '" opacity=".3"/>' + M.bolt(p, .35);
  },
  cloud: function (p) {
    return '<ellipse cx="34" cy="20" rx="20" ry="12" fill="#4a5678"' + OL + '/><ellipse cx="64" cy="20" rx="22" ry="13" fill="#5a6a90"' + OL + '/><ellipse cx="50" cy="14" rx="18" ry="11" fill="#6a7aa0"' + OL + '/>' +
      '<polygon points="54,26 40,42 50,42 44,56 66,36 54,36 62,26" fill="' + p.a + '"' + OL + '/>';
  },
  rod: function (p) {
    return '<path d="M50 6 L58 50 H42Z" fill="#6a7688"' + OL + '/><path d="M50 6 L50 50" stroke="#aab4c4" stroke-width="1.4"/><path d="M40 14 H60 M42 28 H58 M40 40 H60" stroke="#2a303c" stroke-width="1.4"/><polyline points="50,2 56,10 44,12 52,20" fill="none" stroke="' + p.a + '" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<path d="M24 20 Q34 24 40 18 M76 20 Q66 24 60 18" stroke="' + p.b + '" stroke-width="2" fill="none" stroke-linecap="round"/>';
  },
  star: function (p) {
    return '<polygon points="50,2 58,22 80,28 58,34 50,54 42,34 20,28 42,22" fill="' + p.a + '"' + OL + '/><circle cx="50" cy="28" r="6" fill="' + p.b + '"/>';
  },
  prism: function (p, k) {
    var rays = k ? '<path d="M64 28 L96 16 M64 28 L98 28 M64 28 L96 40" stroke="#ff7a3c" stroke-width="2.4"/><path d="M64 28 L96 22 M64 28 L96 34" stroke="#5cc8ff" stroke-width="2.4"/>' : '<path d="M62 30 L96 20" stroke="#ff7a3c" stroke-width="2.4"/><path d="M62 30 L98 30" stroke="#ffd84a" stroke-width="2.4"/><path d="M62 30 L96 40" stroke="#5cc8ff" stroke-width="2.4"/>';
    return '<path d="M4 32 L38 30" stroke="#fff" stroke-width="2.6" opacity=".9"/><polygon points="50,6 72,48 28,48" fill="' + p.a + '" fill-opacity=".55"' + OL + '/><polygon points="50,6 50,48 28,48" fill="#fff" opacity=".25"/>' + rays;
  },
  rings: function (p) {
    return '<circle cx="50" cy="28" r="9" fill="' + p.a + '"/><circle cx="50" cy="28" r="18" fill="none" stroke="' + p.a + '" stroke-width="3" opacity=".8"/><circle cx="50" cy="28" r="27" fill="none" stroke="' + p.b + '" stroke-width="2" opacity=".5"/>';
  },
  brazier: function (p) {
    return '<g transform="translate(50 10) scale(.7) translate(-50 -4)"><path d="M50 4 Q64 20 60 34 Q58 46 50 52 Q42 46 40 34 Q38 24 46 16 Q46 24 50 28 Q55 18 50 4Z" fill="' + p.a + '"' + OL + '/><path d="M50 24 Q57 34 55 42 Q52 49 48 49 Q44 46 44 40 Q44 32 50 24Z" fill="' + p.b + '"/></g>' +
      '<path d="M26 36 H74 L64 52 H36Z" fill="#3a3028"' + OL + '/><path d="M30 41 H70" stroke="#ff9a3a" stroke-width="2" opacity=".8"/>';
  },
  soot: function () {
    return '<circle cx="34" cy="30" r="13" fill="#4a4a52" opacity=".85"/><circle cx="52" cy="22" r="15" fill="#5a5a64" opacity=".85"/><circle cx="66" cy="34" r="12" fill="#3e3e46" opacity=".9"/><circle cx="48" cy="38" r="11" fill="#4a4a52" opacity=".9"/>';
  },
  crystal: function (p) {
    return '<polygon points="50,3 66,22 58,54 42,54 34,22" fill="' + p.a + '"' + OL + '/><polygon points="50,3 50,54 42,54 34,22" fill="#fff" opacity=".28"/><polygon points="20,40 26,28 32,44 26,54" fill="' + p.b + '"' + OL + '/><polygon points="80,40 74,28 68,44 74,54" fill="' + p.b + '"' + OL + '/>';
  },
  burst2: function (p) { return M.burst(p) + '<circle cx="50" cy="28" r="29" fill="none" stroke="' + p.b + '" stroke-width="1.6" stroke-dasharray="3 4"/>'; },
  fusion: function (p) {
    return '<circle cx="50" cy="28" r="22" fill="#fff" opacity=".1"/><g transform="translate(26 16) scale(.55)">' + M.flame(PAL.f) + '</g><g transform="translate(38 18) scale(.55) rotate(0)">' + M.flame(PAL.i) + '</g><g transform="translate(50 16) scale(.55)">' + M.flame(PAL.s) + '</g>';
  }
};
var MAP = {
  ember: 'ember', fireball: 'orb', blaze: ['flame', 1.15], wildfire: 'flames', combust: 'burst', firestorm: 'tornado', kindling: ['ember'], furnace: 'brazier',
  flurry: 'blades', detonate: 'burst2', feather: 'feather', fury: 'fist', cinder: ['orb', .7],
  guard: 'shield', lance: 'spear', wall: 'bricks', blizzard: 'tornado', rime: 'flake', freeze: 'flake', armor: 'armor', shatter: 'hammer', composure: 'crystal',
  permafrost: 'mountain', avalanche: 'mountain', bloom: 'flake',
  spark: 'bolt', chain: 'chain', jolt: ['bolt', 1.1], static: ['orb', .8], capacitor: 'battery', overload: 'battery', storm: 'cloud', rod: 'rod', discharge: 'burst', flash: 'star', conduct: 'chain', surge: 'surge',
  prism: 'prism', amplify: 'rings', fusion: 'fusion', soot: 'soot'
};
function card(id, el) {
  var p = PAL[el] || PAL.n, m = MAP[id] || 'star', f = Array.isArray(m) ? m[0] : m, k = Array.isArray(m) ? m[1] : undefined;
  var gid = 'ca' + (++n);
  var body = (M[f] || M.star)(p, k);
  if (f === 'prism' && id === 'fusion') body = M.fusion(p);
  return '<svg viewBox="0 0 100 56" preserveAspectRatio="xMidYMid slice" class="cartsvg" aria-hidden="true">' +
    '<defs><radialGradient id="' + gid + '" cx="50%" cy="46%" r="75%"><stop offset="0" stop-color="' + p.c + '"/><stop offset="1" stop-color="' + p.d + '"/></radialGradient></defs>' +
    '<rect width="100" height="56" fill="url(#' + gid + ')"/>' +
    '<circle cx="50" cy="28" r="26" fill="' + p.a + '" opacity=".14"/>' +
    '<g>' + body + '</g></svg>';
}

/* ---------- 등불 (플레이어) ---------- */
function lantern(el, cls) {
  var c = { f: ['#ff7a3c', '#ffd27a'], i: ['#5cc8ff', '#e0f6ff'], s: ['#ffd84a', '#fffbd0'], n: ['#ffc24a', '#fff0c0'] }[el || 'n'] || ['#ffc24a', '#fff0c0'];
  var id = 'lg' + (++n);
  return svg('0 0 60 80',
    '<defs><radialGradient id="' + id + '"><stop offset="0" stop-color="' + c[1] + '"/><stop offset=".5" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[0] + '" stop-opacity="0"/></radialGradient></defs>' +
    '<circle cx="30" cy="46" r="30" fill="url(#' + id + ')" opacity=".55"/>' +
    '<path d="M22 14 Q30 2 38 14" fill="none" stroke="#9a7a3a" stroke-width="2.6" stroke-linecap="round"/>' +
    '<path d="M18 16 H42 L46 22 H14Z" fill="#6a4a1a"' + OL + '/>' +
    '<path d="M16 22 H44 Q50 46 44 66 H16 Q10 46 16 22Z" fill="' + c[0] + '" fill-opacity=".28" stroke="#c8a258" stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M30 22 V66 M23 22 Q20 44 23 66 M37 22 Q40 44 37 66" stroke="#c8a258" stroke-width="1.2" fill="none" opacity=".7"/>' +
    '<g class="lflame"><path d="M30 28 Q40 40 37 50 Q35 58 30 61 Q25 58 23 50 Q21 42 27 36 Q27 42 30 44 Q33 38 30 28Z" fill="' + c[0] + '"/><path d="M30 42 Q35 49 33 55 Q31 59 29 58 Q26 55 26 51 Q27 46 30 42Z" fill="' + c[1] + '"/></g>' +
    '<path d="M14 66 H46 L44 74 H16Z" fill="#6a4a1a"' + OL + '/>', cls || 'lant');
}
function logo() {
  var s = '';
  for (var i = 0; i < 3; i++) s += '<g transform="translate(' + (i * 56) + ' ' + (i === 1 ? 0 : 8) + ') scale(.9)">' + lantern(['f', 'i', 's'][i], '').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + '</g>';
  return svg('0 0 164 84', s, 'logo');
}

root.ART = { enemy: enemy, card: card, lantern: lantern, logo: logo, PAL: PAL, enemyKeys: Object.keys(ENEMY) };
})(typeof window !== 'undefined' ? window : this);
