// 19세기 중반(1853~1866) 세계 공통 바탕. italy: 'split'(1853~1859) | 'unified'(1866)
import { BOX } from './_common.mjs';

export const LATAM = ['MEX', 'GTM', 'HND', 'SLV', 'NIC', 'CRI', 'COL', 'VEN', 'ECU', 'PER', 'BOL', 'CHL', 'ARG', 'URY', 'PRY', 'BRA', 'HTI', 'DOM'];

export function w19({ italy = 'split', year = 1853 } = {}) {
  const polities = {
    RUS: { n: '러시아 제국', e: 'Russian Empire', c: '#6fa8c7', s: [56, 50, 76, 68], a: ['러시아'] },
    OTT: { n: '오스만 제국', e: 'Ottoman Empire', c: '#4cae6b', s: [42, 52, 56, 52], a: ['오스만', '터키', '튀르키예'] },
    GBR: { n: '대영제국', e: 'British Empire', c: '#c0443a', s: [68, 92, 80, 92], a: ['영국', '대영제국', '브리튼'] },
    FRA: { n: '프랑스 제2제국', e: 'Second French Empire', c: '#4a78c2', s: [58, 82, 82, 84], a: ['프랑스', '프랑스 제국'] },
    HAB: { n: '오스트리아 제국', e: 'Austrian Empire', c: '#d9a441', s: [50, 66, 70, 66], a: ['오스트리아', '합스부르크'] },
    PRU: { n: '프로이센 왕국', e: 'Prussia', c: '#7da13a', s: [64, 62, 78, 58], a: ['프로이센'] },
    NET: { n: '네덜란드 왕국', e: 'Netherlands', c: '#e0b84f', s: [58, 62, 38, 40], a: ['네덜란드'] },
    BEL: { n: '벨기에 왕국', e: 'Belgium', c: '#e8c26a', s: [62, 66, 30, 28], a: ['벨기에'] },
    SWE: { n: '스웨덴-노르웨이', e: 'Sweden-Norway', c: '#2e9d8f', s: [60, 42, 44, 32], a: ['스웨덴', '노르웨이'] },
    DEN: { n: '덴마크 왕국', e: 'Denmark', c: '#d6697c', s: [58, 44, 36, 26], a: ['덴마크'] },
    SPA: { n: '스페인 왕국', e: 'Spain', c: '#c46a3a', s: [40, 48, 44, 42], a: ['스페인'] },
    POR: { n: '포르투갈 왕국', e: 'Portugal', c: '#5f8f3a', s: [50, 40, 30, 30], a: ['포르투갈'] },
    USA: { n: '미국', e: 'United States', c: '#5b9bd5', s: [56, 66, 40, 54], a: ['미국'] },
    QNG: { n: '청나라', e: 'Qing China', c: '#d9825b', s: [38, 80, 44, 62], a: ['청', '중국', '청나라'] },
    JPN: { n: '일본', e: 'Tokugawa Shogunate', c: '#b88f6a', s: [56, 44, 36, 26], a: ['일본', '막부', '도쿠가와', '에도'] },
    KOR: { n: '조선', e: 'Joseon', c: '#3b7dd8', s: [46, 40, 28, 26], a: ['조선', '한국'] },
    GRE: { n: '그리스 왕국', e: 'Greece', c: '#8a7fd1', s: [46, 28, 30, 20], a: ['그리스'] },
  };
  const paint = [
    ['USA', 'USA'],
    ['SPA', 'ESP', 'CUB', 'PRI'],
    ['POR', 'PRT', 'AGO', 'MOZ', 'CPV', 'GNB', 'STP', 'TLS'],
    ['NET', 'NLD', 'SUR'],
    ['BEL', 'BEL'],
    ['SWE', 'SWE', 'NOR'],
    ['DEN', 'DNK', 'ISL'],
    ['GBR', 'GBR', 'IRL', 'IND', 'PAK', 'BGD', 'LKA', 'MYS', 'SGP', 'CAN', 'AUS', 'NZL', 'MLT', 'BLZ', 'GUY', 'JAM', 'BHS', 'TTO', 'BRB', { adm0: 'ZAF', box: [16, -35, 31, -27] }],
    ['FRA', 'FRA', 'DZA', 'SEN'],
    ['OTT', ['TUR', 'BGR', 'SRB', 'BIH', 'MKD', 'ALB', 'MNE', 'KOS', 'ROU', 'CYP', 'EGY', 'SYR', 'LBN', 'ISR', 'PSX', 'JOR', 'IRQ', 'LBY', 'TUN', 'GRC']],
    ['RUS', 'RUS', 'FIN', 'EST', 'LVA', 'LTU', 'BLR', 'UKR', 'MDA', 'GEO', 'ARM', 'AZE', 'KAZ', { adm0: 'POL', box: [18, 49.5, 25, 54.5] }, { adm0: 'USA', names: ['Alaska'] }],
    ['PRU', { adm0: 'DEU', names: ['Brandenburg', 'Berlin', 'Saxony-Anhalt', 'North Rhine', 'Saarland'] }, { adm0: 'POL', box: [14, 49.9, 20, 54.9] }, { adm0: 'POL', box: [19, 53.4, 23, 54.5] }, { adm0: 'RUS', box: [19, 54, 23, 55.5] }],
    ['HAB', 'AUT', 'CZE', 'HUN', 'SVK', 'SVN', 'HRV', { adm0: 'ROU', box: BOX.TRANSYLVANIA }, { adm0: 'SRB', box: [18.8, 44.8, 21.5, 46.2] }, { adm0: 'POL', box: [19, 49, 25, 50.6] }, { adm0: 'UKR', box: [22, 48.5, 26, 50.4] }],
    ['GRE', { adm0: 'GRC', box: [19.3, 36.3, 25, 39.2] }],
    ['QNG', 'CHN', 'MNG', 'TWN'],
    ['JPN', 'JPN'],
    ['KOR', 'KOR', 'PRK'],
  ];
  if (year < 1864) {
    paint.push(['GBR', { adm0: 'GRC', names: ['Ionian'] }]);
    paint.push(['DEN', { adm0: 'DEU', names: ['Schleswig'] }]);
  }
  if (italy === 'split') {
    Object.assign(polities, {
      SAR: { n: '사르데냐 왕국', e: 'Kingdom of Sardinia', c: '#d46a9a', s: [60, 46, 58, 38], a: ['사르데냐', '피에몬테', '사보이'] },
      TWO: { n: '양시칠리아 왕국', e: 'Kingdom of the Two Sicilies', c: '#c9a227', s: [44, 40, 44, 28], a: ['나폴리', '시칠리아', '양시칠리아'] },
      PAP: { n: '교황령', e: 'Papal States', c: '#e8e0c8', s: [50, 32, 16, 52], a: ['교황', '교황령'] },
      ITM: { n: '중부 이탈리아 공국들', e: 'Central Italian duchies', c: '#a3a55a', s: [48, 36, 22, 18], a: ['토스카나', '파르마', '모데나'] },
    });
    paint.push(
      ['SAR', { adm0: 'ITA', box: [6.6, 43.8, 9.1, 46] }, { adm0: 'ITA', box: BOX.SARDINIA }, { adm0: 'FRA', box: BOX.SAVOY_NICE }],
      ['HAB', { adm0: 'ITA', box: [8.7, 44.9, 13.9, 46.8] }],
      ['ITM', { adm0: 'ITA', box: [9.5, 42.3, 12.3, 44.9] }],
      ['PAP', { adm0: 'ITA', box: [11.7, 41.3, 14, 44.4] }],
      ['TWO', { adm0: 'ITA', box: [13.2, 36.5, 18.6, 42.9] }, { adm0: 'ITA', box: BOX.SICILY }],
    );
  } else {
    Object.assign(polities, {
      ITA: { n: '이탈리아 왕국', e: 'Kingdom of Italy', c: '#d46a9a', s: [56, 48, 58, 42], a: ['이탈리아'] },
      PAP: { n: '로마 교황령', e: 'Papal States', c: '#e8e0c8', s: [50, 28, 12, 50], a: ['교황', '교황령'] },
    });
    paint.push(
      ['ITA', 'ITA'],
      ['HAB', { adm0: 'ITA', box: [10.4, 45, 13.9, 46.8] }],
      ['PAP', { adm0: 'ITA', box: [11.7, 41.3, 13.7, 42.7] }],
    );
  }
  const self = [...LATAM, 'CHE', 'MAR', 'LBR', 'IRN', 'AFG', 'THA', 'ETH', 'NPL'];
  return { polities, paint, self, rest: 'unc', restScale: 0.6 };
}
