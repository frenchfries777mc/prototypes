/** 한국어 조사 자동 선택: P('일본', '은/는') -> '일본은', P('브라질', '이/가') -> '브라질이'. */
export type Josa = '은/는' | '이/가' | '을/를' | '와/과' | '으로/로';

function finalConsonant(word: string): { has: boolean; rieul: boolean } {
  const trimmed = word.replace(/[)\]」』"'\s]+$/g, '');
  const ch = trimmed.slice(-1);
  if (!ch) return { has: false, rieul: false };
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) { const f = (code - 0xac00) % 28; return { has: f !== 0, rieul: f === 8 }; }
  if (/[0-9]/.test(ch)) return { has: '013678'.includes(ch), rieul: ch === '1' || ch === '8' };
  if (/[a-z]/i.test(ch)) return { has: /[lmnr]/i.test(ch), rieul: /l/i.test(ch) };
  return { has: false, rieul: false };
}

export function P(word: string, kind: Josa): string {
  const { has, rieul } = finalConsonant(word);
  switch (kind) {
    case '은/는': return word + (has ? '은' : '는');
    case '이/가': return word + (has ? '이' : '가');
    case '을/를': return word + (has ? '을' : '를');
    case '와/과': return word + (has ? '과' : '와');
    case '으로/로': return word + (has && !rieul ? '으로' : '로');
  }
}
