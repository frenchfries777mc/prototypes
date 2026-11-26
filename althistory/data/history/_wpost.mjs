// 20세기 중반(1939 / 1947 / 1950) 세계 공통 바탕.
import { BOX, COL } from './_common.mjs';

const BRIT_AF = COL.BRIT_AFRICA.filter((c) => c !== 'EGY');

export function wpost(year) {
  const y39 = year === 1939, y47 = year === 1947, y50 = year === 1950;
  const polities = {
    USA: { n: '미국', e: 'United States', c: '#5b9bd5', s: [66, 96, 62, 84], a: ['미국'] },
    GBR: { n: y39 ? '대영제국' : '영국', e: 'United Kingdom', c: '#c0443a', s: [y39 ? 68 : 52, y39 ? 88 : 58, y39 ? 80 : 66, y39 ? 92 : 78], a: ['영국', '대영제국', '브리튼'] },
    FRA: { n: y39 ? '프랑스 제3공화국' : '프랑스 제4공화국', e: 'France', c: '#4a78c2', s: [y39 ? 52 : 42, y39 ? 76 : 50, y39 ? 76 : 50, y39 ? 78 : 60], a: ['프랑스'] },
    SOV: { n: '소련', e: 'Soviet Union', c: '#a83232', s: [58, 66, 90, 82], a: ['소련', '소비에트', '러시아'] },
    JPN: { n: y39 ? '일본 제국' : '일본', e: 'Japan', c: '#b88f6a', s: y39 ? [70, 70, 86, 66] : [38, 28, 6, 10], a: ['일본'] },
    CHN: { n: y50 ? '중화인민공화국' : '중화민국', e: y50 ? "People's Republic of China" : 'Republic of China', c: '#d9825b', s: y50 ? [56, 40, 62, 50] : [30, 44, 56, 46], a: ['중국', y50 ? '중공' : '국민당'] },
    BEL: { n: '벨기에 왕국', e: 'Belgium', c: '#e8c26a', s: [60, 52, 30, 30], a: ['벨기에'] },
    NET: { n: '네덜란드 왕국', e: 'Netherlands', c: '#e0b84f', s: [60, 52, 28, 32], a: ['네덜란드'] },
    POR: { n: '포르투갈 공화국', e: 'Portugal', c: '#5f8f3a', s: [58, 36, 26, 26], a: ['포르투갈'] },
    SPA: { n: '스페인', e: 'Spain', c: '#c46a3a', s: [44, 34, 40, 26], a: ['스페인'] },
    YUG: { n: y39 ? '유고슬라비아 왕국' : '유고슬라비아', e: 'Yugoslavia', c: '#8a63d2', s: [48, 34, 48, 28], a: ['유고슬라비아', '유고'] },
    ROM: { n: y50 ? '루마니아 인민공화국' : '루마니아 왕국', e: 'Romania', c: '#a3a55a', s: [46, 36, 44, 24], a: ['루마니아'] },
    KOR: { n: y39 ? '조선' : y47 ? '남한' : '대한민국', e: 'South Korea', c: '#3b7dd8', s: [36, 24, 16, 16], a: ['한국', '대한민국', '남한', '남조선'] },
    PRK: { n: '북한', e: 'North Korea', c: '#6b7bd8', s: [42, 20, 28, 12], a: ['북한', '북조선', '조선인민'] },
  };
  const paint = [];
  const rest = { rest: 'modern', restScale: 0.7 };

  if (y39) {
    Object.assign(polities, {
      GER: { n: '나치 독일', e: 'Nazi Germany', c: '#7d8590', s: [72, 84, 96, 86], a: ['독일', '나치'] },
      ITA: { n: '이탈리아 왕국', e: 'Kingdom of Italy', c: '#d46a9a', s: [58, 60, 66, 58], a: ['이탈리아'] },
      POL: { n: '폴란드 제2공화국', e: 'Poland', c: '#c872b4', s: [58, 38, 52, 34], a: ['폴란드'] },
    });
    delete polities.KOR; delete polities.PRK;
    paint.push(
      ['GBR', 'GBR', ...COL.BRIT_ASIA, ...BRIT_AF, 'TZA', 'PSX', 'ISR', 'JOR', ...COL.BRIT_GULF, 'CAN', 'AUS', 'NZL', 'MLT', 'CYP', ...COL.BRIT_AMERICAS, 'MUS', 'SYC', 'FJI'],
      ['FRA', 'FRA', ...COL.FRENCH_AFRICA, ...COL.FRENCH_MANDATES, 'SYR', 'LBN', ...COL.FRENCH_INDOCHINA],
      ['BEL', 'BEL', ...COL.BELGIAN], ['NET', 'NLD', ...COL.DUTCH],
      ['POR', 'PRT', ...COL.PORTUGUESE], ['SPA', 'ESP', ...COL.SPANISH_AFRICA],
      ['USA', 'USA', 'PHL', 'PRI'],
      ['SOV', 'RUS', 'UKR', 'BLR', 'GEO', 'ARM', 'AZE', ...COL.RUSSIA_CENTRAL_ASIA],
      ['ROM', 'ROU', 'MDA'],
      ['YUG', 'SRB', 'HRV', 'SVN', 'BIH', 'MNE', 'MKD', 'KOS'],
      ['CHN', 'CHN'],
      ['ITA', 'ITA', 'LBY', 'ERI', 'SOM', 'ETH', 'ALB', { adm0: 'GRC', box: [26, 35.8, 28.5, 37.8] }],
      ['GER', 'DEU', 'AUT', 'CZE', { adm0: 'POL', names: ['Lower Silesian', 'Lubusz', 'Opole', 'West Pomeranian', 'Warmian'] }, { adm0: 'RUS', box: [19, 54, 23, 55.5] }],
      ['POL', 'POL', { adm0: 'BLR', box: [23, 51.5, 28.5, 54.5] }, { adm0: 'UKR', box: [22, 49, 28.5, 51.5] }, { adm0: 'LTU', box: [24.5, 54.2, 26.5, 55.2] }, { adm0: 'POL', names: ['Lower Silesian', 'Lubusz', 'Opole', 'West Pomeranian', 'Warmian'], box: [0, 0, 1, 1] }],
      ['JPN', 'JPN', 'KOR', 'PRK', 'TWN', { adm0: 'CHN', box: BOX.MANCHURIA }, { adm0: 'CHN', box: [112, 30, 123, 41] }],
    );
    // 위 POL 마지막 항목은 상자가 비어 있어 의도적으로 아무 것도 잡지 않는다(독일령으로 남김) → 제거
    paint[paint.length - 2].pop();
  }

  if (y47 || y50) {
    delete polities.ROM; // 전후에는 현대 루마니아를 그대로 쓴다
    polities.PAK = { n: '파키스탄', e: 'Pakistan', c: '#3a9d6b', s: [38, 26, 30, 28], a: ['파키스탄'] };
    paint.push(
      ['GBR', 'GBR', ...(y47 ? ['LKA', 'MMR', 'PSX', 'ISR', ...COL.BRIT_GULF] : []), 'MYS', 'SGP', 'BRN', ...BRIT_AF.filter((c) => c !== 'SDS' || true), 'TZA', 'MLT', 'CYP', ...COL.BRIT_AMERICAS, 'MUS', 'SYC', 'FJI', ...(y50 ? ['LBY', 'ERI', 'KWT', 'QAT', 'BHR', 'ARE'] : [])],
      ['FRA', 'FRA', ...COL.FRENCH_AFRICA, ...COL.FRENCH_MANDATES, ...(y47 ? ['SYR', 'LBN'] : []), 'LAO', 'KHM', { adm0: 'VNM', box: [102, 8, 110, 17.2] }],
      ['BEL', 'BEL', ...COL.BELGIAN], ['NET', 'NLD', 'SUR', ...(y47 ? [] : [])],
      ['POR', 'PRT', ...COL.PORTUGUESE], ['SPA', 'ESP', ...COL.SPANISH_AFRICA],
      ['USA', 'USA', 'PRI'],
      ['SOV', 'RUS', 'UKR', 'BLR', 'GEO', 'ARM', 'AZE', 'MDA', ...COL.RUSSIA_CENTRAL_ASIA, ...(y47 || y50 ? ['EST', 'LVA', 'LTU'] : [])],
      ['YUG', 'SRB', 'HRV', 'SVN', 'BIH', 'MNE', 'MKD', 'KOS'],
      ['KOR', 'KOR'], ['PRK', 'PRK'],
      ['JPN', 'JPN'],
      ['CHN', 'CHN', 'TWN'],
    );
    if (y47) {
      Object.assign(polities, {
        CCP: { n: '중국 공산당', e: 'Chinese Communists', c: '#e8574a', s: [58, 22, 54, 24], a: ['공산당', '마오쩌둥', '중공'] },
        WGE: { n: '서독', e: 'Western Germany (occupied)', c: '#9a6b3d', s: [34, 34, 8, 14], a: ['서독'] },
        EGE: { n: '동독', e: 'Eastern Germany (occupied)', c: '#b8795a', s: [32, 24, 8, 8], a: ['동독'] },
        DRV: { n: '베트남 민주공화국', e: 'Viet Minh', c: '#d6a03a', s: [56, 14, 40, 14], a: ['베트남', '베트민', '호찌민'] },
        IDN: { n: '인도네시아 공화국', e: 'Indonesia', c: '#c96a4a', s: [48, 16, 30, 12], a: ['인도네시아'] },
      });
      paint.push(
        ['CCP', { adm0: 'CHN', box: [118, 41, 135, 50] }, { adm0: 'CHN', names: ['Shaanxi', 'Shanxi', 'Ningxia', 'Heilongjiang'] }],
        ['WGE', 'DEU'], ['EGE', { adm0: 'DEU', names: ['Saxony', 'Brandenburg', 'Berlin', 'Mecklenburg', 'Thuringia'] }], ['WGE', { adm0: 'DEU', names: ['Lower Saxony'] }],
        ['DRV', { adm0: 'VNM', box: [102, 17.2, 110, 24] }],
        ['PAK', 'PAK', 'BGD'], ['IDN', 'IDN'],
        ['NET', 'NLD'],
        ['NET', { adm0: 'IDN', names: ['Papua'] }], // 서뉴기니는 1962년까지 네덜란드령
      );
    }
    if (y50) {
      Object.assign(polities, {
        TWN: { n: '중화민국', e: 'Republic of China (Taiwan)', c: '#2e9d8f', s: [40, 36, 40, 24], a: ['대만', '타이완', '중화민국', '국민당'] },
        TIB: { n: '티베트', e: 'Tibet', c: '#e8d28a', s: [50, 8, 10, 6], a: ['티베트'] },
        DRV: { n: '베트남 민주공화국', e: 'Viet Minh', c: '#d6a03a', s: [56, 14, 44, 16], a: ['베트남', '베트민', '호찌민'] },
        FRG: { n: '서독', e: 'West Germany', c: '#9a6b3d', s: [46, 54, 14, 28], a: ['서독'] },
        GDR: { n: '동독', e: 'East Germany', c: '#b8795a', s: [42, 38, 24, 16], a: ['동독'] },
      });
      paint.push(
        ['TWN', 'TWN'],
        ['TIB', { adm0: 'CHN', names: ['Xizang', 'Tibet'] }],
        ['DRV', { adm0: 'VNM', box: [102, 17.2, 110, 24] }],
        ['FRG', 'DEU'], ['GDR', { adm0: 'DEU', names: ['Saxony', 'Brandenburg', 'Berlin', 'Mecklenburg', 'Thuringia'] }], ['FRG', { adm0: 'DEU', names: ['Lower Saxony'] }],
        ['NET', 'NLD', 'SUR'], ['PAK', 'PAK', 'BGD'],
      );
    }
  }
  if (y39) paint.push(['POR', { adm0: 'IND', names: ['Goa', 'Daman', 'Dadra'] }], ['FRA', { adm0: 'IND', names: ['Puducherry'] }]); // 영국령 인도 안의 포르투갈·프랑스 식민지
  paint.push(['GBR', 'HKG'], ['POR', 'MAC']); // 홍콩(영국령), 마카오(포르투갈령): 중국 규칙에 덮이지 않게 마지막에
  return { polities, paint, ...rest };
}
