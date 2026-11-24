// 고대 템플릿(punic-264, pax-romana-117) 빈 땅 채우기 공용 모듈.
// 행 형식: [ID, 한국어 이름, 영어 이름, [안정, 경제, 군사, 영향력], 별칭[], 선택자[], 색(선택)]
// 칠하기는 행 순서대로, 아직 빈 땅에만 적용된다. 그래서 무인도처럼 좁은 규칙을 앞에 둔다.

/** 행 목록을 fill 형식({ polities, paint })으로 바꾼다. */
export function build(rows) {
  const polities = {}, paint = [];
  for (const [id, n, e, s, a, sels, c] of rows) {
    if (n) polities[id] = { n, e, s, a, ...(c ? { c } : {}), ...(id === 'UNIN' ? { neutral: true } : {}) };
    if (sels?.length) paint.push([id, ...sels]);
  }
  return { polities, paint };
}

/** 선택자 도우미 */
export const N = (adm0, ...names) => ({ adm0, names });
export const B = (adm0, box) => ({ adm0, box });

/**
 * 두 시대 공통(또는 거의 같은) 지역: 사람이 아직 정착하지 않은 섬, 오세아니아, 북극권, 시베리아 북부,
 * 아메리카 수렵채집민, 아프리카 남부 등. era: -264 | 117
 */
export function common(era) {
  const early = era < 0;
  const uninhabited = [
    'ISL', 'FRO', N('NOR', 'Svalbard', 'Bouvet'), 'BMU', N('PRT', 'Madeira', 'Azores'), 'CPV', 'STP', N('GNQ', 'Annobón'),
    'SHN', 'SGS', 'FLK', 'ATF', 'HMD', 'MDG', 'COM', N('FRA', 'Mayotte', 'Réunion'), 'MUS', 'SYC', 'IOT', 'IOA',
    N('AUS', 'Macquarie', 'Lord Howe'), 'NFK', 'CSI', 'ATC', { adm0: 'NZL' }, 'COK', 'PYF', 'PCN', N('USA', 'Hawaii'), 'UMI',
    N('ECU', 'Galápagos'), 'CLP', { adm0: 'COL', names: ['Saint Andr'] }, { adm0: 'COL', box: [-82, 3, -80, 5] }, 'SER', 'BJN',
    'JAM', 'BHS', 'CYM', 'TCA', 'TUV', 'PGA', 'SCR', N('CHN', 'Paracel'), N('TWN', 'Pratas'),
    ...(early ? ['KIR', 'MHL', 'NRU', 'FSM'] : []),
  ];
  return [
    ['UNIN', '무인지 (인류 정착 이전)', 'Uninhabited (not yet settled)', [100, 0, 0, 0], ['무인도', '미정주지'], uninhabited],

    // ---- 오세아니아 ----
    ['TASM', '태즈메이니아 원주민 (팔라와)', 'Aboriginal Tasmanians (Palawa)', [55, 4, 4, 2], ['팔라와', '태즈메이니아인'], [N('AUS', 'Tasmania')]],
    ['ABOR', '오스트레일리아 원주민 (지역별 언어 집단)', 'Aboriginal Australians', [55, 6, 6, 3], ['애버리지니', '호주 원주민'], [{ adm0: 'AUS' }]],
    ['PAPU', '파푸아인 (뉴기니 고지 농경민)', 'Papuans (New Guinea)', [52, 10, 8, 4], ['파푸아인', '뉴기니인'],
      [N('IDN', 'Papua'), N('PNG', 'Sandaun', 'Western', 'East Sepik', 'Madang', 'Morobe', 'Oro', 'Milne', 'Central', 'Port Moresby', 'Gulf', 'Chimbu', 'Enga', 'Highlands')]],
    ['LAPI', '라피타 후예 (멜라네시아인)', 'Lapita descendants (Island Melanesians)', [52, 10, 8, 5], ['멜라네시아인', '라피타'],
      ['PNG', 'SLB', 'VUT', 'NCL', 'FJI']],
    ['POLY', '초기 폴리네시아인 (통가·사모아)', 'Ancestral Polynesians (Tonga–Samoa)', [55, 10, 8, 6], ['폴리네시아인', '통가·사모아'],
      ['TON', 'WSM', 'ASM', 'WLF', 'NIU']],
    ['MARI', '마리아나·팔라우 오스트로네시아인 (차모로 선조)', 'Marianas & Palau Austronesians', [55, 8, 6, 3], ['차모로 선조', '마리아나인'],
      ['GUM', 'MNP', 'PLW']],
    ...(early ? [] : [['MICR', '미크로네시아인 (캐롤라인·마셜 제도)', 'Micronesians (Carolines & Marshalls)', [55, 8, 6, 3], ['미크로네시아인'],
      ['FSM', 'MHL', 'NRU', 'KIR']]]),

    // ---- 북극권·시베리아 ----
    ['DORS', '고에스키모 (도싯·그로스워터 문화)', 'Paleo-Eskimos (Dorset & Groswater)', [55, 6, 5, 3], ['도싯 문화', '고에스키모'],
      ['GRL', N('CAN', 'Nunavut', 'Newfoundland'), 'SPM']],
    ['NORT', early ? '노턴 문화 (고에스키모)' : '노턴·이피우타크 문화 (에스키모 선조)', early ? 'Norton culture' : 'Norton & Ipiutak cultures',
      [55, 8, 6, 3], ['노턴 문화', '알래스카 원주민'], [N('USA', 'Alaska')]],
    ['CHUK', early ? '오크비크 문화 (베링 해협 고에스키모)' : '구베링해 문화 (베링 해협 에스키모)', early ? 'Okvik culture' : 'Old Bering Sea culture',
      [55, 8, 6, 3], ['축치 반도 해양 수렵민'], [N('RUS', 'Chukotka')]],
    ['KORY', '오호츠크 연안 수렵어로민 (토칼레프·타르야 문화)', 'Okhotsk–Kamchatka foragers (Tokarev & Tarya)', [55, 6, 6, 3], ['코랴크·이텔멘 선조'],
      [N('RUS', 'Magadan', 'Kamchatka')]],
    ['SIBE', '시베리아 타이가 수렵민 (퉁구스·유카기르 선조)', 'Siberian taiga hunters (proto-Tungusic & Yukaghir)', [55, 6, 6, 3], ['퉁구스 선조', '유카기르 선조'],
      [N('RUS', 'Sakha', 'Krasnoyarsk')]],
    ['URAL', '우랄계 수렵어로민 (우그르·사모예드 선조)', 'Uralic hunter-fishers (Ugric & Samoyedic)', [55, 7, 6, 3], ['우그르 선조', '사모예드 선조'],
      [N('RUS', 'Komi', 'Arkhangelsk', 'Nenets', 'Yamalo', 'Khanty', 'Sverdlovsk'), B('RUS', [66, 68, 69, 70])]],
    ['SAMI', '사미인 선조 (북방 수렵민)', 'Proto-Sámi', [55, 6, 5, 3], ['사미인', '라프인'],
      [N('NOR', 'Finnmark', 'Troms', 'Nordland'), B('SWE', [10, 64, 25, 70]), B('FIN', [20, 64.3, 32, 71]), N('RUS', 'Murmansk')]],

    // ---- 북아메리카 ----
    ['MARP', '마르폴 문화 (북서 해안 원주민)', 'Marpole culture (Northwest Coast)', [55, 14, 8, 5], ['북서 해안 원주민', '살리시 선조'],
      [N('CAN', 'British Columbia'), B('USA', [-125, 45.5, -116, 49.5]), N('USA', 'Oregon')]],
    ['SUBA', '아한대 수렵민 (아타바스카·알곤킨 선조)', 'Subarctic hunters (proto-Athabaskan & Algonquian)', [55, 6, 6, 3], ['아타바스카 선조', '알곤킨 선조'],
      [N('CAN', 'Yukon', 'Northwest', 'Alberta', 'Saskatchewan', 'Manitoba', 'Ontario', 'Quebec')]],
    ['CALI', '캘리포니아 원주민 (도토리 채집민)', 'California Native peoples', [56, 10, 6, 3], ['캘리포니아 원주민'], [N('USA', 'California')]],
    ['GBAS', '그레이트베이슨·고원 수렵채집민', 'Great Basin & Plateau foragers', [55, 6, 5, 3], ['그레이트베이슨 원주민'], [N('USA', 'Nevada', 'Utah', 'Idaho')]],
    ['PLAI', '대평원 들소 수렵민', 'Great Plains bison hunters', [54, 7, 8, 3], ['평원 인디언 선조'],
      [N('USA', 'Montana', 'Wyoming', 'North Dakota', 'South Dakota', 'Nebraska', 'Kansas', 'Oklahoma', 'Texas')]],
    ['BASK', '바스켓메이커 문화 (선조 푸에블로인)', 'Basketmaker II (Ancestral Puebloans)', [54, 10, 6, 3], ['바스켓메이커', '선조 푸에블로'],
      [N('USA', 'Colorado', 'New Mexico', ...(early ? ['Arizona'] : []))]],

    // ---- 카리브 ----
    ['CASI', '카시미로이드 수렵채집민 (카리브 고기 원주민)', 'Casimiroid foragers (Archaic Caribbean)', [55, 6, 4, 2], ['카리브 고기 문화', '과나하타베이 선조'],
      ['CUB', 'HTI', 'DOM']],
    ['SALA', '사라도이드 문화 (아라와크계 농경민)', 'Saladoid culture (Arawakan)', [54, 12, 8, 5], ['사라도이드', '아라와크계'],
      ['PRI', 'VIR', 'VGB', 'AIA', 'MAF', 'SXM', 'BLM', 'KNA', 'ATG', 'MSR', 'DMA', 'LCA', 'VCT', 'BRB', 'GRD', 'TTO',
        'ABW', 'CUW', N('NLD', 'Bonaire', 'Sint Eustatius', 'Saba'), N('FRA', 'Guadeloupe', 'Martinique', 'French Guiana'), 'GUY', 'SUR', 'VEN',
        N('COL', 'Arauca', 'Casanare', 'Vichada', 'Meta')]],

    // ---- 메소아메리카 북부·중앙아메리카 ----
    ['CHCH', '아리도아메리카 수렵채집민 (치치메카)', 'Aridoamerican foragers (Chichimeca)', [54, 6, 7, 3], ['치치메카', '북멕시코 원주민'],
      [N('MEX', 'Sonora', 'Baja', 'Chihuahua', 'Coahuila', 'Nuevo', 'Durango', 'Zacatecas', 'Aguascalientes', 'Sinaloa')]],
    ['HUAS', '와스텍', 'Huastec', [52, 14, 10, 5], ['와스테카', '테에넥'], [N('MEX', 'Tamaulipas', 'San Luis')]],
    ['WMEX', '서멕시코 수혈묘 전통 (테우치틀란)', 'West Mexican shaft-tomb tradition (Teuchitlán)', [52, 16, 10, 6], ['테우치틀란', '수혈묘 문화'],
      [N('MEX', 'Jalisco', 'Nayarit', 'Colima', 'Guerrero')]],
    ['CHUP', '추피쿠아로 문화', 'Chupícuaro culture', [52, 16, 10, 6], ['추피쿠아로'], [N('MEX', 'Guanajuato', 'Michoacán', 'Querétaro')]],
    ['ZAPO', '사포텍 (몬테알반)', 'Zapotec (Monte Albán)', [56, 26, 20, 16], ['사포텍', '몬테알반'], [N('MEX', 'Oaxaca')]],
    ['EPIO', '에피올멕 (트레스사포테스)', 'Epi-Olmec (Tres Zapotes)', [50, 22, 14, 12], ['에피올멕', '트레스사포테스'], [N('MEX', 'Veracruz', 'Tabasco')]],
    ['MAYA', early ? '마야 도시국가들 (엘미라도르·나크베 등)' : '마야 도시국가들 (엘미라도르·티칼 등)', 'Preclassic Maya city-states',
      [52, 30, 22, 20], ['마야', early ? '엘미라도르' : '티칼'],
      [N('MEX', 'Chiapas', 'Campeche', 'Yucatán', 'Quintana'), B('MEX', [-90, 21.5, -88, 23]), 'GTM', 'BLZ', 'SLV', B('HND', [-90, 13, -88.3, 16])]],
    ['CHIB', '치브차계 농경민 (이스트모-콜롬비아)', 'Chibchan farmers (Isthmo-Colombian)', [52, 12, 8, 5], ['치브차계', '이스트모-콜롬비아'],
      ['HND', 'NIC', 'CRI', 'PAN', N('COL', 'Guajira', 'Cesar', 'Magdalena', 'Atlántico', 'Bolívar', 'Sucre', 'Córdoba', 'Antioquia', 'Chocó')]],

    // ---- 남아메리카 ----
    ['TOLI', '라 톨리타 문화 (에콰도르 해안·고지)', 'La Tolita culture', [52, 18, 10, 8], ['라 톨리타', '툴마요'],
      [N('ECU', 'Esmeraldas', 'Carchi', 'Imbabura', 'Pichincha', 'Santo Domingo', 'Manabí', 'Los Ríos', 'Guayas', 'Santa Elena', 'El Oro', 'Loja', 'Azuay', 'Cañar', 'Chimborazo', 'Bolívar', 'Cotopaxi', 'Tungurahua')]],
    ['SAGU', '산아구스틴 문화', 'San Agustín culture', [52, 16, 10, 7], ['산아구스틴', '칼리마'],
      [N('COL', 'Huila', 'Cauca', 'Nariño', 'Valle', 'Quindío', 'Risaralda', 'Caldas', 'Tolima')]],
    ['MUIS', '에레라기 치브차인 (무이스카 선조)', 'Herrera-period Chibchans (proto-Muisca)', [52, 14, 8, 6], ['무이스카 선조', '에레라기'],
      [N('COL', 'Cundinamarca', 'Bogotá', 'Boyacá', 'Santander')]],
    ['AMAZ', '아마존 하천 농경민 (아라와크·투피계)', 'Amazonian riverine peoples (Arawakan & Tupian)', [54, 8, 6, 3], ['아마존 원주민'],
      [N('BRA', 'Amazonas', 'Pará', 'Acre', 'Rondônia', 'Roraima', 'Amapá'), B('BRA', [-62, -15, -50, -8]), N('PER', 'Loreto', 'Ucayali', 'Madre de Dios', 'San Martín', 'Amazonas'),
        N('BOL', 'Pando', 'Beni'), { adm0: 'ECU' }, { adm0: 'COL' }]],
    ['JEPE', '마크로-제어족 수렵채집민 (제족 선조)', 'Macro-Jê foragers', [54, 6, 6, 3], ['제족', '마크로-제'],
      [N('BRA', 'Mato Grosso do Sul', 'Goiás', 'Federal', 'Tocantins', 'Minas', 'Bahia', 'Piauí', 'Maranhão', 'Ceará', 'Norte', 'Paraíba', 'Pernambuco', 'Alagoas', 'Sergipe')]],
    ['SAMB', '삼바키 (패총) 문화', 'Sambaqui (shell-mound) culture', [55, 8, 5, 3], ['삼바키', '패총 문화'], [{ adm0: 'BRA' }]],
    ['URUG', '세리토 축조민 (차루아 선조)', 'Cerrito mound-builders (proto-Charrúa)', [54, 6, 6, 3], ['차루아 선조', '세리토 문화'],
      ['URY', 'BRI', N('ARG', 'Entre Ríos', 'Corrientes', 'Misiones')]],
    ['CHAC', '그란차코 수렵채집민 (과이쿠루 선조)', 'Gran Chaco foragers (proto-Guaycuruan)', [54, 6, 6, 3], ['과이쿠루 선조', '차코 원주민'],
      ['PRY', N('ARG', 'Formosa', 'Chaco', 'Santiago del Estero', 'Santa Fe'), N('BOL', 'Santa Cruz', 'Tarija')]],
    ['TAFI', '타피·콘도르와시 문화 (아르헨티나 북서부)', 'Tafí & Condorhuasi cultures', [52, 12, 8, 4], ['타피 문화', '콘도르와시'],
      [N('ARG', 'Tucumán', 'Catamarca', 'Salta', 'Jujuy', 'La Rioja', 'San Juan', 'Mendoza')]],
    ['PATA', '팜파스·파타고니아 수렵민 (테우엘체·야간 선조)', 'Pampas & Patagonian hunters (proto-Tehuelche & Yaghan)', [55, 5, 6, 2], ['테우엘체 선조', '파타고니아인'],
      [{ adm0: 'ARG' }, N('CHL', 'Aysén', 'Magellan'), 'SPI']],
    ['ATAC', '아타카마 오아시스 문화 (아타카메뇨 선조)', 'Atacama oasis cultures (proto-Atacameño)', [53, 10, 6, 4], ['아타카메뇨 선조', '엘 몰레 문화'],
      [N('CHL', 'Arica', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo')]],
    ['MAPU', '마푸체 선조 (중남부 칠레)', 'Proto-Mapuche (central-southern Chile)', [54, 8, 8, 3], ['마푸체 선조', '피투렌 문화'], [{ adm0: 'CHL' }]],
  ];
}

/** 아프리카 사하라 이남 등 두 시대에 비슷한 땅 (후에 칠할수록 우선순위가 낮다) */
export function africa(era) {
  const early = era < 0;
  return [
    ['TEBU', '투부족 선조 (티베스티 유목민)', 'Proto-Toubou (Tibesti)', [54, 6, 8, 3], ['투부 선조', '테다'],
      [N('TCD', 'Tibesti', 'Borkou', 'Ennedi'), N('LBY', 'Kufra')]],
    ['GARA', '가라만테스', 'Garamantes', [54, early ? 26 : 30, early ? 26 : 28, early ? 16 : 18], ['가라만테스', '페잔'],
      [N('LBY', 'Murzuq', 'Sabha', 'Ghat', 'Wadi al Hayaa', 'Ash Shati', 'Jufra'), N('DZA', 'Illizi')]],
    ['GAET', '가에툴리족 (베르베르 유목민)', 'Gaetuli (Berber nomads)', [52, 10, 16, 6], ['가에툴리', '베르베르 유목민'],
      [{ adm0: 'DZA' }, N('MAR', 'Guelmim', 'Laâyoune', 'Oued', 'Suss'), 'SAH', B('MRT', [-18, 18, -4, 28]), N('MLI', 'Kidal', 'Tombouctou'), N('NER', 'Agadez')]],
    ['DJEN', '젠네-제노 (니제르강 내륙 삼각주)', 'Djenné-Djenno (Inland Niger Delta)', [54, 18, 10, 8], ['젠네-제노', '자라'],
      [N('MLI', 'Mopti', 'Ségou', 'Gao')]],
    ['MAND', '만데어족 농경민 (소닌케·말링케 선조)', 'Mande farmers (proto-Soninke & Malinke)', [54, 12, 10, 5], ['만데', '소닌케 선조'],
      ['MLI', 'MRT', 'BFA', 'GIN']],
    ['SENE', '세네감비아 거석 문화', 'Senegambian megalith builders', [54, 10, 8, 4], ['세네감비아 환상열석'], ['SEN', 'GMB', 'GNB']],
    ['MELF', '대서양 해안 농경민 (멜어족)', 'Atlantic-coast farmers (Mel-speaking)', [54, 8, 6, 3], ['키시·템네 선조'], ['SLE', 'LBR']],
    ['AKAN', '크와어족 숲 농경민 (아칸 선조)', 'Kwa forest farmers (proto-Akan)', [54, 10, 8, 4], ['아칸 선조', '크와어족'], ['CIV', 'GHA']],
    ['NOK', early ? '녹 문화' : '녹 문화 (후기)', 'Nok culture', [52, 22, 14, 10], ['녹', 'Nok'],
      [N('NGA', 'Kaduna', 'Plateau', 'Nasarawa', 'Federal', 'Niger State', 'Kogi', 'Benue')]],
    ['CHAD', '차드어족 농경민 (하우사·사오 선조)', 'Chadic farmers (proto-Hausa & Sao)', [54, 10, 10, 4], ['하우사 선조', '사오 선조'],
      [N('NGA', 'Kano', 'Katsina', 'Jigawa', 'Yobe', 'Borno', 'Bauchi', 'Gombe', 'Adamawa', 'Sokoto', 'Zamfara', 'Kebbi'), 'NER',
        N('TCD', 'Lac', 'Kanem', 'Bahr el Gazel', 'Hadjer', 'Chari-Baguirmi', "N'Djamena", 'Mayo', 'Batha', 'Guéra'), N('CMR', 'Far North', 'North')]],
    ['YORU', '니제르강 하류 숲 농경민 (요루바·이그보 선조)', 'Lower Niger forest farmers (proto-Yoruba & Igbo)', [54, 12, 8, 4], ['요루바 선조', '이그보 선조'],
      ['NGA', 'BEN', 'TGO']],
    ['NUBA', '누바인 (코르도판·다르푸르)', 'Nuba & Darfur peoples', [52, 8, 10, 3], ['누바인', '다르푸르인'],
      [N('SDN', 'Kordofan', 'Darfur', 'West Soudan'), N('TCD', 'Ouaddaï', 'Wadi Fira', 'Sila')]],
    ['UBAN', '우방기어족 농경민 (아다마와-우방기)', 'Ubangian farmers (Adamawa–Ubangi)', [54, 8, 8, 3], ['우방기어족', '사라 선조'],
      ['TCD', N('CMR', 'Adamawa'), B('CAF', [14, 6.5, 28, 12])]],
    ['NILO', '닐로트인 (딩카·누에르 선조)', 'Nilotic pastoralists (proto-Dinka & Nuer)', [54, 8, 10, 3], ['닐로트인', '딩카 선조'],
      ['SDS', N('ETH', 'Gambela')]],
    ['AGAW', '아가우인', 'Agaw', [52, 12, 10, 4], ['아가우', '쿠시계 농경민'], [N('ETH', 'Amhara', 'Benishangul')]],
    ['CUSH', '쿠시계 목축민 (오로모·소말리 선조)', 'Cushitic pastoralists (proto-Oromo & Somali)', [54, 8, 10, 3], ['쿠시계', '소말리 선조'],
      [{ adm0: 'ETH' }, ...(early ? ['DJI'] : []), N('KEN', 'North Eastern')]],
    ['UREW', '우레웨 문화 (대호수 반투 농경민)', 'Urewe culture (Great Lakes Bantu)', [54, 14, 10, 5], ['우레웨', '동부 반투'],
      ['UGA', 'RWA', 'BDI', N('COD', 'Kivu'), N('TZA', 'Kagera', 'Mwanza', 'Geita', 'Mara', 'Kigoma', 'Simiyu'), N('KEN', 'Nyanza', 'Western')]],
    ['SPNE', '사바나 목축 신석기인 (남부 쿠시계 목축민)', 'Savanna Pastoral Neolithic (Southern Cushitic herders)', [54, 8, 8, 3], ['엘멘테이탄', '남부 쿠시계'],
      ['KEN', N('TZA', 'Arusha', 'Kilimanjaro', 'Manyara', 'Dodoma', 'Singida', 'Shinyanga', 'Tabora', 'Tanga')]],
    ['PYGM', '피그미 수렵채집민 (바카·음부티)', 'Central African foragers (Baka, Mbuti)', [56, 5, 5, 2], ['피그미', '바트와'],
      ['CAF', N('COD', 'Équateur', 'Orientale', 'Maniema')]],
    ['WBAN', '서부 반투 농경민', 'Western Bantu farmers', [54, 10, 8, 4], ['서부 반투', '콩고 분지 농경민'],
      ['CMR', 'GNQ', 'GAB', 'COG', N('COD', 'Kinshasa', 'Kongo', 'Bandundu', 'Kasaï'), N('AGO', 'Cabinda', 'Zaire', 'Uíge', 'Bengo', 'Luanda', 'Cuanza Norte', 'Malanje', 'Lunda Norte')]],
  ];
}
