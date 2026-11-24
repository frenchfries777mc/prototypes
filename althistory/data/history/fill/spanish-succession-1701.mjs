// 1701년 스페인 왕위 계승 전쟁 템플릿의 빈 땅 채우기. 국가 정의와 칠하기 규칙은 _c1700.mjs 공용.
import { paintFor, pick } from './_c1700.mjs';

const TEMPLATE = ['FRA', 'SPA', 'HAB', 'ENG', 'NET', 'PRU', 'BAV', 'SAV', 'POR', 'HRE', 'SWE', 'RUS', 'POL', 'DEN', 'OTT', 'VEN', 'PAP'];
const paint = paintFor(1701);

export default {
  polities: pick(paint, TEMPLATE, {
    QIN: { c: '#d4a84a' },
    MUG: { c: '#3f8f5a' },
  }),
  paint,
};
