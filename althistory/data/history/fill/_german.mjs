// 독일 땅을 시대별 실제 나라로 나눈다(1592·1618·1701·1756·1853·1859·1866 채우기 모듈이 함께 쓴다).
// 지도의 독일은 현대 주(州) 16개 단위라서, 주 하나를 그 땅의 대표 나라에 준다. 이름 부분 일치("Saxony"가 Lower Saxony까지 잡는 문제)를 피하려고 주 ID로 고른다.
const S = { 작센: 'DEU-1601', 바이에른: 'DEU-1591', 니더바이에른: 'DEU-1591-ndb', 오버팔츠: 'DEU-1591-opf', 프랑켄: 'DEU-1591-fra', 슈바벤: 'DEU-1591-sch', 라인란트팔츠: 'DEU-1580', 자를란트: 'DEU-1581', 슐레스비히홀슈타인: 'DEU-1579', 니더작센: 'DEU-1576', 노르트라인베스트팔렌: 'DEU-1572',
  바덴뷔르템베르크: 'DEU-1573', 브란덴부르크: 'DEU-3487', 메클렌부르크: 'DEU-3488', 브레멘: 'DEU-1575', 함부르크: 'DEU-1578', 헤센: 'DEU-1574', 튀링겐: 'DEU-1577', 작센안할트: 'DEU-1600', 베를린: 'DEU-1599' };
const ids = (...names) => ({ ids: names.map((n) => S[n]), soft: true }); // soft: 템플릿이 이미 칠한 주라서 비어 있지 않아도 경고하지 않는다

// 나라 정의: [이름, 영어, [안정, 경제, 군사, 영향력], 별칭]
const D = {
  SAX: ['작센 선제후국', 'Electorate of Saxony', [54, 60, 48, 38], ['작센', '드레스덴']],
  WUE: ['뷔르츠부르크 주교령', 'Prince-Bishopric of Würzburg', [48, 44, 26, 20], ['프랑켄', '뷔르츠부르크', '밤베르크', '뉘른베르크']],
  AUG: ['아우크스부르크 주교령', 'Prince-Bishopric of Augsburg', [50, 44, 22, 18], ['슈바벤', '아우크스부르크', '울름']],
  BAV: ['바이에른 선제후국', 'Electorate of Bavaria', [58, 52, 56, 40], ['바이에른', '뮌헨']],
  PFZ: ['팔츠 선제후국', 'Electoral Palatinate', [46, 50, 40, 30], ['팔츠', '하이델베르크', '만하임']],
  LOR: ['로렌 공국', 'Duchy of Lorraine', [54, 48, 30, 24], ['로렌', '로트링겐']],
  HOG: ['홀슈타인 공국', 'Duchy of Holstein', [48, 38, 28, 20], ['홀슈타인', '고토르프', '슐레스비히']],
  BSL: ['브라운슈바이크-뤼네부르크 공국', 'Brunswick-Lüneburg', [52, 48, 38, 26], ['브라운슈바이크', '뤼네부르크', '하노버']],
  HAN: ['하노버 선제후국', 'Electorate of Hanover', [58, 60, 54, 44], ['하노버', '브라운슈바이크']],
  JCB: ['율리히-클레베-베르크 공국', 'Jülich-Cleves-Berg', [48, 54, 36, 28], ['율리히', '클레베', '베르크', '뒤셀도르프']],
  KOL: ['쾰른 선제후국', 'Electorate of Cologne', [48, 46, 34, 26], ['쾰른', '뮌스터', '베스트팔렌']],
  WUR: ['뷔르템베르크 공국', 'Duchy of Württemberg', [52, 48, 38, 24], ['뷔르템베르크', '슈투트가르트', '바덴']],
  MEK: ['메클렌부르크 공국', 'Duchy of Mecklenburg', [52, 40, 28, 16], ['메클렌부르크', '슈베린']],
  BRE: ['브레멘 자유시', 'Free City of Bremen', [60, 44, 14, 16], ['브레멘', '한자']],
  HAM: ['함부르크 자유시', 'Free City of Hamburg', [60, 52, 16, 22], ['함부르크', '한자']],
  HES: ['헤센-카셀 방백령', 'Landgraviate of Hesse-Kassel', [54, 44, 42, 26], ['헤센', '카셀', '다름슈타트']],
  SWM: ['작센-바이마르 공국', 'Saxe-Weimar', [52, 38, 26, 18], ['튀링겐', '바이마르', '에르푸르트', '작센-바이마르']],
  ANH: ['안할트 공국', 'Principality of Anhalt', [52, 34, 24, 12], ['안할트', '데사우', '마그데부르크']],
  BRA: ['브란덴부르크 선제후국', 'Electorate of Brandenburg', [56, 50, 50, 38], ['브란덴부르크', '베를린']],
  POM: ['포메른 공국', 'Duchy of Pomerania', [48, 38, 28, 18], ['포메른', '슈테틴', '슈체친']],
  LIE: ['리히텐슈타인', 'Liechtenstein', [60, 10, 4, 4], ['리히텐슈타인', '파두츠']],
  LUX: ['룩셈부르크 대공국', 'Grand Duchy of Luxembourg', [62, 30, 6, 10], ['룩셈부르크']],
};

// 시대별 이름·능력치 변형
const D19 = {
  SAX: ['작센 왕국', 'Kingdom of Saxony', [58, 58, 40, 26], ['작센', '드레스덴']],
  BAV: ['바이에른 왕국', 'Kingdom of Bavaria', [58, 52, 56, 36], ['바이에른', '뮌헨', '팔츠']],
  HAN: ['하노버 왕국', 'Kingdom of Hanover', [56, 54, 42, 30], ['하노버']],
  WUR: ['뷔르템베르크 왕국', 'Kingdom of Württemberg', [56, 52, 40, 24], ['뷔르템베르크', '슈투트가르트', '바덴']],
  MEK: ['메클렌부르크 대공국', 'Grand Duchy of Mecklenburg', [54, 40, 24, 14], ['메클렌부르크', '슈베린']],
  HES: ['헤센 대공국', 'Grand Duchy of Hesse', [54, 46, 34, 22], ['헤센', '다름슈타트', '카셀']],
  SWM: ['작센-바이마르-아이제나흐 대공국', 'Saxe-Weimar-Eisenach', [54, 36, 22, 16], ['튀링겐', '바이마르', '에르푸르트']],
};
const DEARLY = { BAV: ['바이에른 공국', 'Duchy of Bavaria', [60, 52, 62, 44], ['바이에른', '뮌헨', '가톨릭 동맹']] };

/** year 시점의 독일 칠하기. 반환: { defs: {ID: [이름, 영어, 능력치, 별칭]}, rows: [[ID, 선택자…]] } — 선택자는 "아직 빈 땅"에만 적용된다. */
export function germanStates(year, skip = []) {
  const early = year < 1650, c1700 = year >= 1650 && year < 1800, nineteenth = year >= 1800;
  let rows;
  if (early) rows = [
    ['SAX', ids('작센')], ['BAV', ids('바이에른', '니더바이에른', '오버팔츠')], ['WUE', ids('프랑켄')], ['AUG', ids('슈바벤')], ['PFZ', ids('라인란트팔츠')], ['LOR', ids('자를란트')], ['DEN', ids('슐레스비히홀슈타인')], ['BSL', ids('니더작센')],
    ['JCB', ids('노르트라인베스트팔렌')], ['WUR', ids('바덴뷔르템베르크')], ['BRA', ids('브란덴부르크', '베를린', '작센안할트')], ['MEK', ids('메클렌부르크')],
    ['BRE', ids('브레멘')], ['HAM', ids('함부르크')], ['HES', ids('헤센')], ['SWM', ids('튀링겐')],
  ];
  else if (c1700) rows = [
    ['SAX', ids('작센')], ['BAV', ids('바이에른', '니더바이에른', '오버팔츠')], ['WUE', ids('프랑켄')], ['AUG', ids('슈바벤')], ['PFZ', ids('라인란트팔츠')], ['LOR', ids('자를란트')], ['HOG', ids('슐레스비히홀슈타인')], ['HAN', ids('니더작센')],
    ...(year < 1740 ? [['KOL', ids('노르트라인베스트팔렌')]] : []), ['WUR', ids('바덴뷔르템베르크')], ['PRU', ids('브란덴부르크', '베를린', '작센안할트')], ['MEK', ids('메클렌부르크')],
    ['BRE', ids('브레멘')], ['HAM', ids('함부르크')], ['HES', ids('헤센')], ['SWM', ids('튀링겐')],
  ];
  else rows = [
    ['SAX', ids('작센')], ['BAV', ids('바이에른', '니더바이에른', '오버팔츠', '프랑켄', '슈바벤', '라인란트팔츠')], ['HAN', ids('니더작센')], ['WUR', ids('바덴뷔르템베르크')], ['MEK', ids('메클렌부르크')],
    ['BRE', ids('브레멘')], ['HAM', ids('함부르크')], ['HES', ids('헤센')], ['SWM', ids('튀링겐')],
  ];
  rows.push(['LIE', { ids: ['LIE-4893'], soft: true }]);
  if (nineteenth) rows.push(['LUX', { adm0: 'LUX' }]);
  if (early) rows.push(['POM', { adm0: 'POL', names: ['West Pomeranian'] }]);
  rows = rows.filter(([id]) => !skip.includes(id));
  const defs = {};
  for (const [id] of rows) { const base = D[id]; if (!base) continue; defs[id] = (nineteenth && D19[id]) || (early && DEARLY[id]) || base; }
  return { defs, rows };
}
