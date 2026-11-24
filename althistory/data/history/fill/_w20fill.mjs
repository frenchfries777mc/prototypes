// 20세기 초(1900 / 1912 / 1914, _w20.mjs 바탕) 빈 땅 채우기 공용 모듈.
// 템플릿이 칠하지 않은 작은 섬·암초·보호령과, 현대 나라로 자동으로 채워지면 시대가 맞지 않는 땅을 그해의 실제 주인으로 칠한다.

const YEM_SOUTH = ['Hadhramaut', 'Al Mahrah', 'Lahij', "'Adan", 'Abyan', 'Shabwah', "Ad Dali'"]; // 아덴 식민지·아덴 보호령(영국)
// 영국령 뉴기니(1906년부터 오스트레일리아령 파푸아). 나머지 북동부와 비스마르크 제도·부건빌은 독일령 뉴기니.
const PNG_BRITISH = ['Western', 'Gulf', 'Central', 'Port Moresby', 'Milne Bay', 'Highlands', 'Chimbu', 'Enga'];

export function w20fill(year) {
  const y1912 = year >= 1912, y1914 = year >= 1913;
  const polities = {
    NHB: y1912
      ? { n: '뉴헤브리디스 영·프 공동통치령', e: 'New Hebrides Condominium', s: [40, 3, 2, 2], a: ['뉴헤브리디스', '바누아투'] }
      : { n: '뉴헤브리디스 (영·프 공동 해군위원회 관리)', e: 'New Hebrides (Anglo-French Joint Naval Commission)', s: [36, 3, 1, 2], a: ['뉴헤브리디스', '바누아투'] },
    BRA: { n: '브라질 합중국', e: 'United States of Brazil', s: [46, 30, 22, 24], a: ['브라질', '브라질 제1공화국'] },
    CHL: { n: '칠레 공화국', e: 'Republic of Chile', s: [58, 24, 30, 18], a: ['칠레'] },
    IRN: { n: '페르시아 (카자르 왕조)', e: 'Qajar Persia', s: [y1912 ? 22 : 30, 14, 14, 14], a: ['페르시아', '이란', '카자르'] },
    THA: { n: '시암 왕국', e: 'Kingdom of Siam', s: [56, 16, 16, 12], a: ['시암', '태국', '짜끄리 왕조'] },
  };
  const paint = [
    // 과니토 암초·세라냐 뱅크·바호 누에보: 미국이 구아노 섬 법으로 영유를 주장(콜롬비아도 주장). 스카버러 암초: 미국령 필리핀
    ['USA', 'SER', 'BJN', 'SCR', 'USG', ...(year < 1902 ? ['CUB'] : [])], // 1898~1902 쿠바는 미군정. 관타나모는 1903년부터 미국 조차지
    ['GBR', 'BRT', 'CNM', 'CYN', 'MDV', 'KIR', 'TUV', 'SLB', 'PGA', { adm0: 'YEM', names: YEM_SOUTH }, { adm0: 'PNG', names: PNG_BRITISH }, { adm0: 'PNG', names: ['Oro'], box: [147, -10.5, 150, -8] }, ...(year >= 1901 ? ['TON'] : [])],
    // 캐롤라인·마리아나(1899 스페인에서 매입), 마셜, 나우루, 팔라우, 서사모아(1900), 독일령 뉴기니
    ['GER', 'FSM', 'MHL', 'PLW', 'NRU', 'WSM', { adm0: 'PNG' }],
    ['FRA', 'COM'],
    ['ITA', 'VAT'], // 1929 라테란 조약 이전: 이탈리아 왕국이 로마를 병합(교황은 "바티칸의 수인")
    ['NHB', 'VUT'],
    // 예멘 주(州)와 아시르·나지란, 1913년까지의 하사(동부)는 오스만 영토
    ['OTT', { adm0: 'YEM' }, { adm0: 'SAU', names: ['Najran', ...(y1914 ? [] : ['Eastern'])] }],
    ['BRA', 'BRA', 'BRI'],
    ['CHL', 'CHL', 'SPI'],
    ['IRN', 'IRN'], ['THA', 'THA'],
  ];
  if (year < 1902) {
    polities.JSH = { n: '자발 샴마르 토후국', e: 'Emirate of Jabal Shammar', s: [48, 6, 20, 10], a: ['라시드 왕조', '하일 토후국', '샴마르'] };
    polities.COL = { n: '콜롬비아 공화국', e: 'Republic of Colombia', s: [22, 16, 18, 10], a: ['콜롬비아', '천일 전쟁'] }; // 파나마는 1903년까지 콜롬비아의 주
    paint.push(['JSH', { adm0: 'SAU', names: ['Riyadh'] }], ['COL', 'COL', 'PAN'], ['SPA', { adm0: 'MAR', names: ['Oued Ed-Dahab'] }]); // 리오데오로(1884~ 스페인)
  } else {
    polities.NEJ = y1914
      ? { n: '네지드-하사 토후국', e: 'Emirate of Nejd and Hasa', s: [56, 8, 26, 12], a: ['네지드', '이븐 사우드', '사우드 가문'] }
      : { n: '네지드 토후국', e: 'Emirate of Nejd', s: [52, 6, 22, 10], a: ['네지드', '이븐 사우드', '사우드 가문'] };
    paint.push(['NEJ', { adm0: 'SAU', names: ['Riyadh', 'Eastern'] }]);
  }
  if (y1912) {
    polities.MNG = { n: '몽골 복드 칸국', e: 'Bogd Khanate of Mongolia', s: [38, 4, 10, 4], a: ['몽골', '외몽골', '복드 칸'] }; // 1911.12 청에서 독립 선언
    paint.push(['MNG', 'MNG']);
  }
  return { polities, paint };
}
