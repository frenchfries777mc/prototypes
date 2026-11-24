// 20세기 중반(1939 / 1947 / 1950, _wpost.mjs 바탕) 빈 땅 채우기 공용 모듈.
// 템플릿이 칠하지 않은 작은 섬·암초·보호령과, 현대 나라로 자동으로 채워지면 시대가 맞지 않는 땅을 그해의 실제 주인으로 칠한다.
// ID가 현대 나라 코드와 같은 국가(AUS, NZL, ITA 등)는 그 현대 나라 땅 전체에 해외 영토·위임통치령을 더해 칠한다.

const YEM_SOUTH = ['Hadhramaut', 'Al Mahrah', 'Lahij', "'Adan", 'Abyan', 'Shabwah', "Ad Dali'"]; // 아덴 식민지·아덴 보호령(영국)
// 스페인령 모로코(북부 보호령 테투안·라라시), 남부 보호령(타르파야·이프니), 스페인령 사하라
const MAR_SPAIN = ['Tangier', 'Guelmim', 'Boujdour', 'Oued Ed-Dahab'];
const FEZZAN = ['Ash Shati', 'Ghat', 'Murzuq', 'Sabha', 'Wadi al Hayaa', 'Ghadames']; // 1943~1951 프랑스 군정

export function wpostfill(year) {
  const y39 = year === 1939, y47 = year === 1947, y50 = year === 1950;
  const polities = {
    HOLY: { n: '교황청 (바티칸 시국)', e: 'Holy See (Vatican City)', s: [82, 6, 1, 30], a: ['교황청', '바티칸', '바티칸 시국'] },
    NHB: { n: '뉴헤브리디스 영·프 공동통치령', e: 'New Hebrides Condominium', s: [40, 3, 2, 2], a: ['뉴헤브리디스', '바누아투'] },
    BRA: { n: '브라질 합중국', e: 'United States of Brazil', s: [y39 ? 50 : 52, 38, 32, 30], a: ['브라질', ...(y39 ? ['에스타두 노부', '바르가스'] : [])] },
    CHL: { n: '칠레 공화국', e: 'Republic of Chile', s: [58, 28, 26, 20], a: ['칠레'] },
  };
  const paint = [
    ['HOLY', 'VAT'], ['NHB', 'VUT'],
    ['BRA', 'BRA', 'BRI'], // 브라질리안 섬: 브라질이 관할
    ['CHL', 'CHL', 'SPI'], // 남부 파타고니아 빙원: 칠레·아르헨티나 국경 미획정
    // 관타나모 조차지(1903~), 세라냐·바호 누에보: 미국이 구아노 섬 법으로 영유 주장(콜롬비아도 주장)
    ['USA', 'USG', 'SER', 'BJN', ...(y39 ? ['SCR'] : ['FSM', 'MHL', 'PLW'])], // 1947~ 태평양 제도 신탁통치령(미국)
    // 키프로스, 수단 쪽 비르 타윌, 몰디브·통가 보호국, 길버트·엘리스·라인 제도, 솔로몬 보호령, 남아프리카 위임통치령 남서아프리카, 아덴
    ['GBR', 'BRT', 'CNM', 'CYN', 'MDV', 'KIR', 'TUV', 'SLB', 'TON', 'NAM', { adm0: 'YEM', names: YEM_SOUTH },
      ...(y39 ? ['NRU', 'PNG', 'WSM'] : []), // 1939: 오스트레일리아·뉴질랜드 위임통치령(템플릿이 두 자치령을 영국으로 칠함)
      ...(y47 ? ['ERI', 'SOM', 'HMD'] : []), // 1947: 옛 이탈리아령 영국 군정, 허드섬은 1947.12 호주로 이관
      ...(!y39 ? ['IOA'] : [])], // 크리스마스섬(싱가포르 식민지 소속)·코코스 제도(1955년 호주로 이관)
    ['SPA', { adm0: 'MAR', names: MAR_SPAIN }],
    ['FRA', 'COM', 'MAR', ...(y47 ? [{ adm0: 'LBY', names: FEZZAN }] : []), ...(!y39 ? [{ adm0: 'IND', names: ['Puducherry'] }] : [])],
  ];
  if (y47) paint.push(['GBR', 'LBY']); // 페잔을 뺀 트리폴리타니아·키레나이카: 영국 군정
  if (y39) paint.push(['JPN', 'FSM', 'MHL', 'PLW', 'PGA']); // 남양 군도 위임통치령, 신남군도(스프래틀리, 1939.3 대만에 편입)
  if (!y39) {
    Object.assign(polities, {
      AUS: { n: '오스트레일리아 연방', e: 'Commonwealth of Australia', s: [72, 50, 30, 34], a: ['호주', '오스트레일리아'] },
      NZL: { n: '뉴질랜드', e: 'New Zealand', s: [74, 36, 16, 20], a: ['뉴질랜드'] },
      PHL: { n: '필리핀 공화국', e: 'Republic of the Philippines', s: [40, 22, 18, 16], a: ['필리핀'] },
      CZE: { n: '체코슬로바키아', e: 'Czechoslovakia', s: y47 ? [50, 40, 26, 24] : [52, 36, 34, 20], a: ['체코슬로바키아', '체코', '슬로바키아'] },
      AUT: { n: '오스트리아 (연합국 점령)', e: 'Allied-occupied Austria', s: [44, 20, 4, 10], a: ['오스트리아'] },
      FTT: { n: '트리에스테 자유 지역', e: 'Free Territory of Trieste', s: [42, 6, 1, 4], a: ['트리에스테'] }, // 1947.9.15 발족, 연합군·유고 분할 점령
    });
    paint.push(
      ['POR', { adm0: 'IND', names: ['Goa', 'Haveli'] }], // 포르투갈령 인도(고아·다만·디우·다드라 나가르 하벨리)
      ['AUS', 'AUS', 'NRU', 'PNG'], // 나우루·파푸아뉴기니: 오스트레일리아 신탁통치
      ['NZL', 'NZL', 'WSM'], // 서사모아: 뉴질랜드 신탁통치
      ['PHL', 'PHL', 'SCR'],
      ['CZE', 'CZE', 'SVK'],
      ['FTT', { adm0: 'ITA', names: ['Trieste'] }],
      ['AUT', 'AUT'],
    );
  }
  if (y47) {
    Object.assign(polities, {
      HYD: { n: '하이데라바드 번왕국', e: 'Hyderabad State', s: [40, 14, 10, 6], a: ['하이데라바드', '니잠'] }, // 1948.9 인도에 병합
      JNK: { n: '잠무 카슈미르 번왕국', e: 'Princely State of Jammu and Kashmir', s: [30, 6, 6, 4], a: ['카슈미르', '잠무 카슈미르', '하리 싱'] }, // 1947.10 인도에 귀속
    });
    paint.push(
      ['HYD', { adm0: 'IND', names: ['Telangana'] }],
      ['JNK', { adm0: 'IND', names: ['Jammu and Kashmir', 'Ladakh'] }, 'KAS'],
      ['CHN', 'PGA'], // 1946.12 중화민국이 타이핑섬 접수
    );
  }
  if (y50) {
    Object.assign(polities, {
      ITA: { n: '이탈리아 공화국', e: 'Italian Republic', s: [54, 40, 24, 30], a: ['이탈리아'] },
      JOR: { n: '요르단 하심 왕국', e: 'Hashemite Kingdom of Jordan', s: [48, 12, 22, 14], a: ['요르단', '트란스요르단'] },
      EGY: { n: '이집트 왕국', e: 'Kingdom of Egypt', s: [38, 30, 28, 34], a: ['이집트', '파루크'] },
    });
    paint.push(
      ['ITA', 'ITA', 'SOM'], // 1950.4~ 유엔 신탁통치령 소말리아(이탈리아 관리)
      ['JOR', 'JOR', { adm0: 'PSX', names: ['West Bank'] }], // 1950.4 요르단이 서안 병합
      ['EGY', 'EGY', { adm0: 'PSX', names: ['Gaza'] }], // 이집트 점령하 가자 지구(전팔레스타인 정부)
      ['NET', { adm0: 'IDN', names: ['Papua'] }], // 네덜란드령 뉴기니(1962년까지)
      ['TWN', 'PGA'], // 중화민국이 1950.5 철수했으나 영유 주장 유지
    );
  }
  return { polities, paint };
}
