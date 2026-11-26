// 20세기 초(1900~1914) 세계 공통 바탕. 식민지는 현대 국가 코드 목록으로 칠하고, 나머지 독립국은 현대 국가를 축소 능력치로 그대로 쓴다.
import { BOX, COL } from './_common.mjs';

export function w20({ year = 1900 } = {}) {
  const late = year >= 1912; // 1912년 이후: 리비아 이탈리아령, 모로코 분할, 조선 병합
  const y1914 = year >= 1913; // 발칸 전쟁 이후 지도
  const polities = {
    GBR: { n: '대영제국', e: 'British Empire', c: '#c0443a', s: [68, 92, 84, 96], a: ['영국', '대영제국', '브리튼'] },
    FRA: { n: '프랑스 제3공화국', e: 'French Third Republic', c: '#4a78c2', s: [58, 84, 82, 84], a: ['프랑스'] },
    GER: { n: '독일 제국', e: 'German Empire', c: '#7d8590', s: [68, 88, 92, 84], a: ['독일'] },
    RUS: { n: '러시아 제국', e: 'Russian Empire', c: '#6fa8c7', s: [44, 62, 82, 74], a: ['러시아'] },
    HAB: { n: '오스트리아-헝가리 제국', e: 'Austria-Hungary', c: '#d9a441', s: [50, 64, 70, 62], a: ['오스트리아', '헝가리'] },
    ITA: { n: '이탈리아 왕국', e: 'Kingdom of Italy', c: '#d46a9a', s: [50, 54, 58, 52], a: ['이탈리아'] },
    OTT: { n: '오스만 제국', e: 'Ottoman Empire', c: '#4cae6b', s: [32, 40, 54, 46], a: ['오스만', '터키', '튀르키예'] },
    USA: { n: '미국', e: 'United States', c: '#5b9bd5', s: [66, 90, 56, 76], a: ['미국'] },
    JPN: { n: '일본 제국', e: 'Empire of Japan', c: '#b88f6a', s: [66, 58, 72, 56], a: ['일본'] },
    CHN: { n: late ? '중화민국' : '청나라', e: late ? 'Republic of China' : 'Qing China', c: '#d9825b', s: [30, 70, 40, 48], a: ['중국', '청', '중화민국'] },
    NET: { n: '네덜란드 왕국', e: 'Netherlands', c: '#e0b84f', s: [64, 66, 36, 40], a: ['네덜란드'] },
    BEL: { n: '벨기에 왕국', e: 'Belgium', c: '#e8c26a', s: [62, 68, 30, 34], a: ['벨기에'] },
    POR: { n: year < 1910 ? '포르투갈 왕국' : '포르투갈 공화국', e: 'Portugal', c: '#5f8f3a', s: [44, 40, 30, 30], a: ['포르투갈'] },
    SPA: { n: '스페인 왕국', e: 'Spain', c: '#c46a3a', s: [38, 46, 38, 34], a: ['스페인'] },
    SWE: { n: year < 1905 ? '스웨덴-노르웨이' : '스웨덴 왕국', e: 'Sweden', c: '#2e9d8f', s: [64, 48, 44, 32], a: ['스웨덴'] },
    DEN: { n: '덴마크 왕국', e: 'Denmark', c: '#d6697c', s: [64, 50, 34, 28], a: ['덴마크'] },
    SER: { n: '세르비아 왕국', e: 'Serbia', c: '#8a63d2', s: [46, 28, 46, 22], a: ['세르비아'] },
    BUL: { n: year < 1908 ? '불가리아 공국' : '불가리아 왕국', e: 'Bulgaria', c: '#7da13a', s: [52, 28, 54, 22], a: ['불가리아'] },
    GRE: { n: '그리스 왕국', e: 'Greece', c: '#8a7fd1', s: [50, 30, 38, 24], a: ['그리스'] },
    ROM: { n: '루마니아 왕국', e: 'Romania', c: '#a3a55a', s: [52, 34, 48, 24], a: ['루마니아'] },
    MNE: { n: '몬테네그로 왕국', e: 'Montenegro', c: '#c872b4', s: [56, 12, 36, 10], a: ['몬테네그로'] },
  };
  if (year < 1910) polities.KOR = { n: '대한제국', e: 'Korean Empire', c: '#3b7dd8', s: [38, 30, 24, 22], a: ['한국', '대한제국', '조선'] };
  if (year < 1902) polities.BOE = { n: '보어 공화국', e: 'Boer Republics', c: '#7da13a', s: [58, 34, 58, 30], a: ['보어', '트란스발'] };
  if (y1914) polities.ALB = { n: '알바니아 공국', e: 'Albania', c: '#d46a8a', s: [32, 14, 20, 10], a: ['알바니아'] };

  const paint = [
    ['GBR', 'GBR', ...COL.BRIT_ASIA, ...COL.BRIT_AFRICA, ...COL.BRIT_GULF, ...COL.BRIT_DOMINIONS, ...COL.BRIT_AMERICAS, 'MLT', 'CYP', 'MUS', 'SYC', 'FJI'],
    ['FRA', 'FRA', ...COL.FRENCH_AFRICA, ...COL.FRENCH_INDOCHINA],
    ['NET', 'NLD', ...COL.DUTCH],
    ['BEL', 'BEL', 'COD'],
    ['POR', 'PRT', ...COL.PORTUGUESE],
    ['SPA', 'ESP', 'GNQ', 'SAH'],
    ['SWE', 'SWE', ...(year < 1905 ? ['NOR'] : [])],
    ['DEN', 'DNK', 'ISL'],
    ['USA', 'USA', 'PRI', 'PHL'],
    ['RUS', 'RUS', ...COL.RUSSIA_WEST, ...COL.RUSSIA_CENTRAL_ASIA, ...COL.RUSSIA_CAUCASUS, { adm0: 'POL', box: [18, 49.5, 25, 54.5] }, { adm0: 'USA', names: ['Alaska'] }],
    ['OTT', ['TUR', 'SYR', 'LBN', 'ISR', 'PSX', 'JOR', 'IRQ'], { adm0: 'SAU', box: [34, 16, 45, 31] }, ...(late ? [] : ['LBY']), ...(y1914 ? [] : ['ALB', 'MKD', 'KOS', { adm0: 'GRC' }])],
    ['GER', 'DEU', { adm0: 'POL', box: [14, 49.9, 19.6, 54.9] }, { adm0: 'FRA', box: BOX.ALSACE_LORRAINE }, { adm0: 'POL', box: [19, 53.4, 23, 54.5] }, { adm0: 'RUS', box: [19, 54, 23, 55.5] }, ...COL.GERMAN_COLONIES, 'LUX'],
    ['HAB', ...COL.A_H_CORE, { adm0: 'ROU', box: BOX.TRANSYLVANIA }, { adm0: 'SRB', box: [18.8, 44.8, 21.5, 46.2] }, { adm0: 'POL', box: [19, 49, 25, 50.6] }, { adm0: 'UKR', box: [22, 48.5, 26, 50.4] }],
    ['ITA', 'ITA', 'ERI', 'SOM', ...(late ? ['LBY', { adm0: 'GRC', box: [26, 35.8, 28.5, 37.8] }] : [])],
    ['ROM', 'ROU'], ['BUL', 'BGR'], ['MNE', 'MNE'], ['SER', 'SRB'], ['HAB', { adm0: 'ROU', box: BOX.TRANSYLVANIA }, { adm0: 'SRB', box: [18.8, 44.8, 21.5, 46.2] }],
    ['GRE', { adm0: 'GRC', box: [19.3, 34.8, 26.5, 39.6] }],
    ['JPN', 'JPN', 'TWN', ...(late ? ['KOR', 'PRK'] : [])],
    ['CHN', 'CHN', ...(late ? [] : ['MNG'])],
  ];
  if (year < 1910) paint.push(['KOR', 'KOR', 'PRK']);
  if (year < 1902) paint.push(['BOE', { adm0: 'ZAF', box: [24, -30.8, 32, -22] }]);
  if (late) paint.push(['FRA', 'MAR'], ['SPA', { adm0: 'MAR', box: [-6.2, 34.6, -1.5, 36.1] }]);
  if (y1914) paint.push(['SER', 'MKD', 'KOS'], ['GRE', 'GRC'], ['ALB', 'ALB'], ['BUL', { adm0: 'BGR' }]);
  return { polities, paint, rest: 'modern', restScale: 0.62 };
}
