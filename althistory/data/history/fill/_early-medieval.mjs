// 초기·중기 중세(527년, 1096년) 채우기에서 두 시대 모두 같은 민족·문화권으로 볼 수 있는 곳.
// 오스트레일리아 원주민, 뉴기니·멜라네시아, 시베리아 북극권, 남아메리카 저지·남단, 남부 아프리카 코이산, 북아메리카 일부.
// (fill/<id>.mjs 에서 polities/paint 에 펼쳐 쓴다. 시대마다 다른 곳은 각 파일에서 칠한다.)

const HG = [50, 8, 8, 3]; // 수렵채집민
const FARM = [50, 14, 12, 6]; // 소규모 농경 부족

export const SHARED_POLITIES = {
  // 오스트레일리아·뉴기니·멜라네시아
  AWD: { n: '서부 사막 원주민', e: 'Western Desert Aboriginal peoples', s: HG, a: ['피찬차차라 조상', '서부 사막 문화권'] },
  ANR: { n: '아렌테·욜릉우 원주민', e: 'Arrernte and Yolngu peoples', s: HG, a: ['아렌테', '욜릉우'] },
  ANE: { n: '북동부 원주민 (구구 이미티르·칼카둔)', e: 'Northeastern Aboriginal peoples', s: HG, a: ['구구 이미티르', '칼카둔', '토레스 해협 주민'] },
  ASE: { n: '쿨린·위라주리 등 남동부 원주민', e: 'Kulin and Wiradjuri peoples', s: HG, a: ['쿨린', '위라주리', '카밀라로이'] },
  APL: { n: '팔라와 (태즈메이니아 원주민)', e: 'Palawa', s: [50, 6, 6, 2], a: ['팔라와', '태즈메이니아 원주민'] },
  PPN: { n: '파푸아인 (뉴기니 고지대 농경민)', e: 'Papuan peoples', s: FARM, a: ['파푸아인', '뉴기니 원주민'] },
  MEL: { n: '멜라네시아인 (라피타 후예)', e: 'Melanesian peoples', s: FARM, a: ['멜라네시아인', '라피타 후예', '카낙 조상'] },
  // 시베리아 북극권·극동
  SAM: { n: '사모예드족 (네네츠·셀쿠프 조상)', e: 'Samoyedic peoples', s: HG, a: ['사모예드', '네네츠 조상'] },
  TNG: { n: '퉁구스족 (에벤키 조상)', e: 'Tungusic peoples', s: HG, a: ['퉁구스', '에벤키 조상'] },
  CHK: { n: '축치·코랴크 조상 (고코랴크 문화)', e: 'Paleo-Siberian peoples (Old Koryak culture)', s: HG, a: ['축치', '코랴크', '이텔멘'] },
  OKH: { n: '오호츠크 문화', e: 'Okhotsk culture', s: [50, 12, 12, 5], a: ['오호츠크인', '니브흐 조상'] },
  ADM: { n: '안다만 원주민 (대안다만족·옹게족)', e: 'Andamanese peoples', s: [50, 6, 6, 2], a: ['안다만인', '옹게족'] },
  // 남아메리카 저지·남단
  ARW: { n: '아라와크족', e: 'Arawak peoples', s: FARM, a: ['아라와크', '마이푸레어족'] },
  TUP: { n: '투피-과라니족', e: 'Tupi-Guarani peoples', s: FARM, a: ['투피', '과라니', '투피남바 조상'] },
  JEP: { n: '제족', e: 'Je peoples', s: [50, 10, 12, 4], a: ['제어족', '타푸이아'] },
  GUA: { n: '과이쿠루족', e: 'Guaycuruan peoples', s: HG, a: ['과이쿠루', '토바', '모코비'] },
  CHA: { n: '차루아족', e: 'Charrua', s: HG, a: ['차루아'] },
  QUE: { n: '케란디족 (팜파스 수렵민)', e: 'Querandi', s: HG, a: ['케란디', '팜파스 수렵민'] },
  CMG: { n: '코메칭곤족', e: 'Comechingones', s: [50, 10, 10, 4], a: ['코메칭곤'] },
  HUA: { n: '우아르페족', e: 'Huarpe', s: [50, 10, 10, 4], a: ['우아르페'] },
  TEH: { n: '테우엘체족', e: 'Tehuelche', s: HG, a: ['테우엘체', '파타고니아 수렵민'] },
  SEL: { n: '셀크남족', e: "Selk'nam", s: [50, 6, 6, 2], a: ['셀크남', '오나족'] },
  YAG: { n: '야간·카웨스카르 (해양 수렵민)', e: 'Yaghan and Kawesqar', s: [50, 6, 6, 2], a: ['야간', '카웨스카르', '초노'] },
  // 남부 아프리카
  SAN: { n: '산족', e: 'San peoples', s: HG, a: ['산', '부시맨', '칼라하리 수렵민'] },
  KHK: { n: '코이코이족', e: 'Khoikhoi', s: [50, 10, 10, 4], a: ['코이코이', '코이산 목축민'] },
  // 북아메리카 (두 시대 모두 수렵채집·어로 사회)
  NWC: { n: '북서 해안 원주민 (살리시·치누크)', e: 'Northwest Coast peoples', s: [50, 14, 12, 6], a: ['살리시', '치누크', '하이다 조상'] },
  CHM: { n: '추마시족 등 캘리포니아 원주민', e: 'Chumash and Californian peoples', s: [50, 12, 10, 5], a: ['추마시', '오흘로니'] },
  NUM: { n: '누믹족 (그레이트베이슨 원주민)', e: 'Numic peoples', s: HG, a: ['누믹', '파이우트 조상', '쇼숀 조상'] },
  DEN: { n: '데네족 (아타바스카인)', e: 'Dene (Athabaskan) peoples', s: HG, a: ['데네', '아타바스카'] },
  CRE: { n: '크리족 (알곤킨계 수렵민)', e: 'Cree peoples', s: HG, a: ['크리', '알곤킨계'] },
  MIK: { n: '미크맥족 조상 (와바나키)', e: "Mi'kmaq ancestors (Wabanaki)", s: HG, a: ['미크맥', '와바나키'] },
  COA: { n: '코아우일테코족', e: 'Coahuiltecan peoples', s: HG, a: ['코아우일테코'] },
  COC: { n: '코치미족 (바하칼리포르니아)', e: 'Cochimi', s: [50, 6, 6, 2], a: ['코치미'] },
};

export const SHARED_PAINT = [
  // 오스트레일리아 (모든 주가 같은 원주민 권역)
  ['AWD', { adm0: 'AUS', names: ['Western Australia', 'South Australia'] }],
  ['ANR', { adm0: 'AUS', names: ['Northern Territory'] }, 'ATC'],
  ['ANE', { adm0: 'AUS', names: ['Queensland'] }, 'CSI'],
  ['ASE', { adm0: 'AUS', names: ['New South Wales', 'Victoria', 'Jervis Bay', 'Capital Territory', 'Lord Howe'] }, 'NFK'],
  ['APL', { adm0: 'AUS', names: ['Tasmania', 'Macquarie'] }],
  // 뉴기니·멜라네시아
  ['PPN', { adm0: 'IDN', names: ['Papua'] }, { adm0: 'PNG', box: [140, -11, 149.5, -2.5] }],
  ['MEL', { adm0: 'PNG' }, 'SLB', 'VUT', 'NCL'],
  // 시베리아 북극권·극동
  ['SAM', { adm0: 'RUS', names: ['Yamalo-Nenets', 'Nenets'] }, { adm0: 'RUS', box: [60, 66, 70, 72] }],
  ['TNG', { adm0: 'RUS', names: ['Krasnoyarsk', 'Sakha Republic'] }],
  ['CHK', { adm0: 'RUS', names: ['Chukotka', 'Kamchatka', 'Magadan'] }],
  ['OKH', { adm0: 'RUS', names: ['Sakhalin'] }],
  ['ADM', { adm0: 'IND', names: ['Andaman'] }],
  // 남아메리카 남단
  ['SEL', { adm0: 'ARG', names: ['Tierra del Fuego'] }],
  ['YAG', { adm0: 'CHL', names: ['Aysén', 'Magellan'] }, 'FLK', 'SGS', 'SPI'],
  ['TEH', { adm0: 'ARG', names: ['Santa Cruz', 'Chubut', 'Río Negro'] }],
  ['CHA', 'URY', 'BRI'],
];
