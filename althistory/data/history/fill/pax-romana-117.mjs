// 기원후 117년: 템플릿이 칠하지 않은 땅을 당시의 나라·부족·문화로 채운다.
import { build, common, africa, N, B } from './_ancient.mjs';

const rows = [
  // ---- 로마·한·파르티아가 실제로 다스린 자투리 땅 ----
  ['ROM', null, null, null, null, ['VAT', 'SMR', 'MCO', 'AND', 'LIE', 'GIB', 'KOS', 'ESB', 'WSB', 'CNM', 'CYN', N('ESP', 'Ceuta', 'Melilla'), N('GBR', 'Scilly'), N('UKR', 'Odessa'), 'GGY', 'JEY',
    N('DEU', 'Bavaria'), N('RUS', 'Sevastopol'), N('SAU', 'Tabuk')]],
  ['HAN', null, null, null, null, [N('CHN', 'Liaoning'), 'HKG', 'MAC', B('VNM', [105, 15.3, 109, 19])]],
  ['PAR', null, null, null, null, ['BHR']],

  // ---- 브리타니아 북부·히베르니아 ----
  ['HIBE', '히베르니아 게일 부족', 'Gaelic tribes of Hibernia', [52, 12, 16, 8], ['히베르니아', '아일랜드 켈트'], ['IRL', B('GBR', [-8.3, 54.0, -5.4, 55.3])]],
  ['CALE', '칼레도니아인 (픽트인 선조)', 'Caledonians', [50, 10, 26, 10], ['칼레도니아', '픽트 선조'], [B('GBR', [-9, 56.0, 0, 61])]],
  ['BRTN', '북브리튼 부족 (보타디니·셀고바이 등)', 'North British tribes (Votadini, Selgovae)', [48, 12, 18, 8], ['보타디니', '셀고바이', '노바타이'], [{ adm0: 'GBR' }, 'IMN']],

  ['CANA', '카나리아 제도 원주민 (베르베르계)', 'Canary Islanders (Berber settlers)', [56, 4, 4, 2], ['관체족 선조', '카나리아인'], [N('ESP', 'Santa Cruz de Tenerife', 'Las Palmas')]],

  // ---- 게르마니아 ----
  ['ANGL', '앵글족·유트족', 'Angles & Jutes', [50, 14, 20, 8], ['앵글족', '유트족'], [{ adm0: 'DNK' }]],
  ['SAXO', '작센족', 'Saxons', [50, 14, 24, 8], ['작센', '색슨족'], [N('DEU', 'Schleswig')]],
  ['CHAU', '카우키족', 'Chauci', [50, 14, 22, 8], ['카우키'], [N('DEU', 'Bremen', 'Hamburg')]],
  ['CHRU', '케루스키족', 'Cherusci', [46, 16, 22, 10], ['케루스키', '아르미니우스의 부족'], [N('DEU', 'Lower Saxony')]],
  ['LANG', '랑고바르드족', 'Langobardi', [50, 14, 24, 8], ['랑고바르드', '롬바르드 선조'], [N('DEU', 'Saxony-Anhalt')]],
  ['HERM', '헤르문두리족', 'Hermunduri', [52, 18, 22, 10], ['헤르문두리'], [N('DEU', 'Thuringia', 'Saxony')]],
  ['SEMN', '셈노네스족 (수에비)', 'Semnones (Suebi)', [50, 14, 24, 10], ['셈노네스', '수에비족'], [N('DEU', 'Brandenburg', 'Berlin')]],
  ['RUGI', '루기족', 'Rugii', [50, 12, 18, 6], ['루기'], [N('DEU', 'Mecklenburg'), N('POL', 'West Pomeranian')]],
  ['MARC', '마르코만니족', 'Marcomanni', [50, 24, 36, 18], ['마르코만니', '보헤미아'], [B('CZE', [12, 48.5, 16.2, 51.1])]],
  ['QUAD', '콰디족', 'Quadi', [48, 20, 32, 14], ['콰디', '모라비아'], ['CZE', 'SVK']],
  ['BURG', '부르군트족', 'Burgundians', [50, 12, 20, 6], ['부르군트', '부르군디오네스'], [N('POL', 'Lubusz', 'Greater Poland')]],
  ['GOTH', '고트족 (구토네스, 비엘바르크 문화)', 'Goths (Gutones, Wielbark culture)', [52, 16, 28, 12], ['고트', '구토네스'], [N('POL', 'Pomeranian Voivodeship', 'Kuyavian')]],
  ['AEST', '아이스티족 (발트족)', 'Aestii (Balts)', [52, 12, 14, 6], ['아이스티', '발트족', '갈린디아'],
    [N('POL', 'Warmian', 'Podlaskie'), 'LTU', 'LVA', N('RUS', 'Kaliningrad'), B('BLR', [23, 52.7, 33, 56.5]), N('RUS', 'Smolensk', 'Bryansk', 'Oryol', 'Pskov')]],
  ['VAND', '반달족 (루기이 연맹, 프셰보르스크 문화)', 'Vandals (Lugii, Przeworsk culture)', [50, 16, 28, 12], ['반달', '루기이'], ['POL']],

  // ---- 스칸디나비아·발트 핀 ----
  ['GAUT', '가우트족 (예아트족)', 'Gautar (Geats)', [52, 14, 18, 6], ['가우트', '예아트'],
    [N('SWE', 'Västra Götaland', 'Östergötland', 'Jönköping', 'Kalmar', 'Kronoberg', 'Halland', 'Blekinge', 'Skåne', 'Gotland')]],
  ['SUIO', '수이오네스족 (스베아족)', 'Suiones (Svear)', [52, 16, 20, 8], ['수이오네스', '스베아'], [B('SWE', [10, 55, 25, 64]), 'ALD']],
  ['NORS', '노르웨이 북게르만 부족', 'Norse tribes of Norway', [52, 12, 14, 5], ['북게르만', '노르웨이인 선조'], [B('NOR', [4, 57, 32, 65.5])]],
  ['FENN', '펜니 (핀족·에스토니아인 선조)', 'Fenni (Baltic Finns)', [54, 8, 8, 3], ['펜니', '핀족 선조'],
    [B('FIN', [19, 59, 32, 64.3]), 'EST', N('RUS', 'Karelia', 'Leningrad', 'Saint Petersburg', 'Vologda'), B('RUS', [31, 57.8, 34, 59])]],

  // ---- 동유럽·흑해 북안 ----
  ['FDAC', '자유 다키아인 (카르피·코스토보키)', 'Free Dacians (Carpi, Costoboci)', [46, 16, 28, 10], ['카르피', '코스토보키', '자유 다키아'],
    ['MDA', N('UKR', 'Zakarpattia', 'Chernivtsi', 'Ivano-Frankivsk', 'Lviv', 'Ternopil', 'Odessa')]],
  ['OLBI', '올비아', 'Olbia', [50, 30, 10, 12], ['올비아 폰티카'], [N('UKR', 'Mykolaiv')]],
  ['BOSP', '보스포로스 왕국', 'Bosporan Kingdom', [58, 46, 30, 28], ['보스포로스', '판티카파이온', '사우로마테스 1세'], [N('RUS', 'Krasnodar', 'Adygea')]],
  ['SCYT', '후기 스키타이 (크림 네아폴리스)', 'Late Scythians (Crimea)', [46, 20, 22, 10], ['스키타이', '네아폴리스'], [N('RUS', 'Crimea')]],
  ['SARM', '사르마티아인 (록솔라니·아오르시)', 'Sarmatians (Roxolani, Aorsi)', [44, 16, 42, 18], ['록솔라니', '사르마티아', '아오르시'],
    [N('UKR', 'Kherson', 'Zaporizhzhia', 'Donetsk', 'Luhansk', 'Dnipropetrovsk', 'Kharkiv', 'Kirovohrad'), N('RUS', 'Rostov', 'Volgograd', 'Kalmykia', 'Astrakhan', 'Voronezh')]],
  ['VNDI', '베네디족 (자루빈치 후기 문화)', 'Venedi (late Zarubintsy)', [50, 12, 14, 6], ['베네디', '슬라브 선조'], ['UKR', 'BLR', N('RUS', 'Kursk', 'Belgorod')]],
  ['ALAN', '알란족 (엄채)', 'Alans', [46, 18, 50, 24], ['알란', '엄채', '아란'],
    [N('RUS', 'Stavropol', 'Kabardino', 'Ossetia', 'Karachay', 'Ingushetia', 'Saratov', 'Samara', 'Orenburg'), N('KAZ', 'West Kazakhstan', 'Atyrau', 'Aktobe', 'Mangystau')]],
  ['CAUC', '북캅카스 산악 부족', 'North Caucasian highlanders', [50, 10, 16, 4], ['캅카스 산악민', '레즈긴 선조'], [N('RUS', 'Chechen', 'Dagestan')]],
  ['LAZI', '라지카 (콜키스)', 'Lazica (Colchis)', [52, 24, 18, 12], ['라지카', '콜키스'], [B('GEO', [39, 41, 43.6, 44])]],
  ['IBEK', '이베리아 왕국 (카르틀리)', 'Kingdom of Iberia (Kartli)', [54, 32, 32, 22], ['카르틀리', '이베리아', '파라스마네스 2세'], ['GEO']],
  ['GORO', '고로데츠 문화 (모르드바인 선조)', 'Gorodets culture (proto-Mordvins)', [54, 8, 8, 3], ['고로데츠', '모르드바 선조'],
    [N('RUS', 'Mordovia', 'Penza', 'Ryazan', 'Tambov', 'Lipetsk', 'Nizhny', 'Ulyanovsk')]],
  ['DYAK', '댜코보 문화 (메랴인 선조)', 'Dyakovo culture', [54, 8, 8, 3], ['댜코보', '메랴 선조'],
    [N('RUS', 'Moscow', 'Tver', 'Yaroslavl', 'Vladimir', 'Ivanovo', 'Kostroma', 'Kaluga', 'Tula')]],
  ['PYAN', '퍄노보르 문화 (페름·우드무르트 선조)', 'Pyanobor culture', [54, 10, 10, 4], ['퍄노보르', '페름 선조'],
    [N('RUS', 'Tatarstan', 'Udmurt', 'Perm', 'Kirov', 'Bashkortostan', 'Chuvash', 'Mari El')]],
  ['SARG', '사르가트 문화', 'Sargat culture', [52, 10, 14, 4], ['사르가트'], [N('RUS', 'Tyumen', 'Kurgan', 'Omsk', 'Chelyabinsk'), N('KAZ', 'North Kazakhstan')]],
  ['KULA', '쿨라이 문화 (사모예드 선조)', 'Kulai culture', [54, 8, 8, 3], ['쿨라이'], [N('RUS', 'Tomsk', 'Novosibirsk', 'Kemerovo')]],

  // ---- 중앙아시아·몽골 초원 ----
  ['KANG', '강거 (康居)', 'Kangju', [50, 28, 40, 22], ['강거', '캉거'], [N('KAZ', 'Turkistan', 'Kyzylorda', 'Karaganda', 'Akmola', 'Nur-Sultan', 'Pavlodar', 'Kostanay'), 'KAB']],
  ['WUSU', '오손 (烏孫)', 'Wusun', [50, 22, 40, 20], ['오손', '우순'], ['KGZ', N('KAZ', 'Almaty', 'Jambyl')]],
  ['NXIO', '북흉노 (잔존 세력)', 'Northern Xiongnu (remnant)', [38, 14, 34, 14], ['북흉노', '흉노'],
    [N('MNG', 'Khovd', 'Govi-Altai', 'Bayan-Ölgii', 'Uvs'), N('RUS', 'Altai'), 'KAZ']],
  ['GEKU', '견곤 (타시티크 문화)', 'Gekun (Tashtyk culture)', [52, 12, 18, 6], ['견곤', '키르기스 선조'], [N('RUS', 'Khakassia', 'Tuva')]],
  ['DING', '정령 (丁零)', 'Dingling', [50, 8, 20, 6], ['정령', '딩링'], [N('RUS', 'Buryatia', 'Irkutsk'), N('MNG', 'Khövsgöl')]],
  ['XIAN', '선비 (鮮卑)', 'Xianbei', [50, 22, 54, 32], ['선비', '선비족'], [N('CHN', 'Inner Mongolia'), 'MNG', N('RUS', 'Zabaykalsky')]],
  ['XIYU', '서역 제국 (구자·우전·선선·소륵 등)', 'Western Regions states (Kucha, Khotan, Shanshan, Kashgar)', [48, 32, 20, 16], ['서역', '구자', '우전'], [N('CHN', 'Xinjiang')]],
  ['ZHAN', '상웅 (象雄)', 'Zhangzhung', [52, 14, 16, 8], ['상웅', '샹슝'], [N('CHN', 'Tibet'), 'KAS']],
  ['QIAN', '강족 (서강)', 'Qiang', [42, 10, 30, 10], ['강족', '서강', '선령강'], [N('CHN', 'Qinghai')]],
  ['LIZU', '여족 (黎族, 해남도)', 'Li people (Hainan)', [54, 8, 8, 3], ['여족', '리족'], [N('CHN', 'Hainan')]],

  // ---- 한반도·만주·일본 ----
  ['GOGU', '고구려', 'Goguryeo', [56, 30, 42, 28], ['고구려', '태조왕', '국내성'], [N('CHN', 'Jilin')], '#6b8f3a'],
  ['BUYE', '부여', 'Buyeo', [56, 30, 32, 22], ['부여', '북부여'], [N('CHN', 'Heilongjiang')]],
  ['YILO', '읍루 (挹婁)', 'Yilou', [50, 8, 16, 4], ['읍루', '숙신 후예'], [N('RUS', 'Amur', 'Jewish', 'Khabarovsk', 'Primorsky')]],
  ['BAEK', '백제', 'Baekje', [52, 22, 20, 14], ['백제', '위례성', '십제'], [N('KOR', 'Seoul', 'Gyeonggi', 'Incheon')]],
  ['SILL', '신라 (사로국)', 'Silla (Saro)', [52, 20, 18, 12], ['신라', '사로국', '서라벌'], [N('KOR', 'North Gyeongsang', 'Daegu', 'Ulsan')]],
  ['GAYA', '가야 (변한, 구야국)', 'Gaya (Byeonhan)', [52, 22, 16, 12], ['가야', '금관가야', '변한'], [N('KOR', 'South Gyeongsang', 'Busan')]],
  ['DONY', '동예', 'Dongye', [50, 10, 12, 5], ['동예', '예'], [N('KOR', 'Gangwon')]],
  ['TAMN', '탐라 (주호)', 'Tamna (Juho)', [54, 8, 6, 4], ['탐라', '주호'], [N('KOR', 'Jeju')]],
  ['MAHA', '마한', 'Mahan confederacy', [50, 22, 16, 12], ['마한', '목지국'], ['KOR']],
  ['EPIJ', '속조몬 문화 (홋카이도·도호쿠 북부)', 'Epi-Jōmon culture', [54, 8, 6, 3], ['속조몬', '아이누 선조', '에미시 선조'],
    [N('JPN', 'Hokkaidō', 'Aomori', 'Akita', 'Iwate'), N('RUS', 'Sakhalin')]],
  ['RYUK', '패총 시대 류큐인', 'Ryukyu Shell-Midden people', [55, 6, 4, 2], ['류큐 선조', '패총 시대'], [N('JPN', 'Okinawa')]],
  ['WA', '왜 (야요이 소국들)', 'Wa (Yayoi polities)', [50, 24, 18, 12], ['왜', '왜국', '노국'], ['JPN']],

  // ---- 남아시아 ----
  ['SATA', '사타바하나 왕조', 'Satavahana Empire', [58, 58, 54, 46], ['사타바하나', '안드라', '가우타미푸트라 사타카르니'],
    [N('IND', 'Maharashtra', 'Andhra', 'Telangana', 'Karnataka', 'Goa', 'Chhattisgarh')], '#b0603a'],
  ['WKSA', '서크샤트라파 (크샤하라타 왕조)', 'Western Satraps (Kshaharata)', [52, 52, 44, 34], ['서크샤트라파', '나하파나', '크샤하라타'],
    [N('IND', 'Gujarat', 'Dadra', 'Madhya Pradesh')]],
  ['KALI', '칼링가 (마하메가바하나 후계)', 'Kalinga', [48, 34, 26, 18], ['칼링가'], [N('IND', 'Odisha')]],
  ['MAGA', '마가다 (슝가·칸바 이후 소왕국)', 'Magadha (post-Kanva kingdoms)', [44, 40, 28, 22], ['마가다', '파탈리푸트라'], [N('IND', 'Bihar', 'Jharkhand')]],
  ['GANG', '강가리다이 (방가)', 'Gangaridai (Vanga)', [50, 36, 22, 16], ['강가리다이', '방가', '벵골'], [N('IND', 'West Bengal'), 'BGD']],
  ['CHOL', '촐라 (카리칼라 시대)', 'Early Cholas', [54, 40, 30, 22], ['촐라', '카리칼라'], [N('IND', 'Puducherry')]],
  ['PAND', '판디아', 'Early Pandyas', [54, 42, 28, 22], ['판디아', '마두라이'], [N('IND', 'Tamil Nadu')]],
  ['CHERA', '체라', 'Early Cheras', [54, 40, 24, 20], ['체라', '무지리스'], [N('IND', 'Kerala', 'Lakshadweep')]],
  ['ANUR', '아누라다푸라 왕국', 'Anuradhapura Kingdom', [54, 36, 22, 16], ['아누라다푸라', '싱할라'], ['LKA', 'MDV']],
  ['ANDA', '안다만·니코바르 원주민', 'Andamanese & Nicobarese', [56, 4, 4, 2], ['안다만인'], [N('IND', 'Andaman')]],
  ['KIRA', '키라타 왕조 (네팔)', 'Kirata dynasty (Nepal)', [50, 18, 14, 8], ['키라타', '네팔 키라트'], ['NPL']],
  ['NEIN', '티베트버마계 부족 (나가·카시·친 선조)', 'Northeast hill peoples (Naga, Khasi, Chin)', [52, 8, 10, 3], ['나가 선조', '카시'],
    [N('IND', 'Assam', 'Meghalaya', 'Arunachal', 'Nagaland', 'Manipur', 'Mizoram', 'Tripura', 'Sikkim'), 'BTN', N('MMR', 'Kachin', 'Chin', 'Rakhine')]],

  // ---- 동남아시아 ----
  ['KHME', '몬-크메르계 농경민 (크메르 선조)', 'Mon-Khmer farmers', [54, 12, 8, 4], ['크메르 선조', '오스트로아시아계'],
    [N('VNM', 'Kon Tum', 'Gia Lai', 'Đắk', 'Lâm Đồng', 'Bình Phước'), 'LAO', B('THA', [101.5, 14.5, 106, 18.5]), N('MMR', 'Shan', 'Kayah'), B('THA', [97, 17, 106, 21])]],
  ['SAHU', '사후인 문화 (참족 선조)', 'Sa Huỳnh culture (proto-Cham)', [54, 18, 12, 8], ['사후인', '참족 선조', '임읍 선조'], [B('VNM', [107, 10.8, 110, 15.5])]],
  ['FUNA', '부남 (扶南)', 'Funan', [54, 38, 22, 20], ['부남', '푸난', '옥에오'], ['VNM', 'KHM']],
  ['PYU', '퓨 도시국가 (스리크셰트라·베익타노)', 'Pyu city-states', [52, 22, 12, 8], ['퓨', '표국'], [N('MMR', 'Magway', 'Mandalay', 'Sagaing', 'Bago')]],
  ['MONS', '몬족 (오스트로아시아계)', 'Mon peoples', [54, 18, 8, 6], ['몬족'], ['MMR', B('THA', [97, 9.5, 106, 17])]],
  ['MALA', '말레이 반도 (오랑 아슬리·초기 교역항)', 'Malay Peninsula peoples & early ports', [55, 12, 6, 4], ['오랑 아슬리 선조', '숭가이 바투'], ['THA', B('MYS', [99, 1, 105, 7]), 'SGP']],
  ['BUNI', '부니 문화 (서자와)', 'Buni culture', [54, 16, 8, 6], ['부니', '서자와'], [N('IDN', 'West Java', 'Banten', 'Jakarta')]],
  ['NUSA', '누산타라 오스트로네시아인 (말레이·자와 선조)', 'Nusantara Austronesians', [54, 14, 8, 5], ['오스트로네시아계', '말레이 선조'], [B('IDN', [94, -11, 131, 6]), 'MYS', 'BRN', 'TLS']],
  ['PHIL', '필리핀 오스트로네시아인 (칼라나이 문화)', 'Philippine Austronesians (Kalanay)', [54, 10, 8, 4], ['칼라나이 문화', '필리핀 원주민'], ['PHL']],
  ['TAIW', '대만 원주민 (오스트로네시아계)', 'Taiwanese Austronesians', [55, 8, 6, 3], ['대만 원주민'], ['TWN']],

  // ---- 아라비아 ----
  ['SABA', '사바 왕국', 'Kingdom of Saba', [46, 40, 24, 24], ['사바', '마리브'], [N('YEM', "Ma'rib", 'Sanaa', "'Amran", 'Al Jawf', "Sa'dah", 'Hajjah', 'Mahwit'), N('SAU', 'Najran')]],
  ['HIMY', '힘야르 왕국 (사바와 두라이단)', 'Himyarite Kingdom', [54, 46, 32, 30], ['힘야르', '두라이단', '자파르'],
    [N('YEM', 'Ibb', 'Dhamar', "Ta'izz", 'Lahij', "'Adan", "Ad Dali'", 'Hudaydah', 'Raymah')]],
  ['QATB', '카타반 왕국', 'Kingdom of Qataban', [42, 30, 16, 14], ['카타반', '팀나'], [N('YEM', "Al Bayda'", 'Abyan')]],
  ['HADR', '하드라마우트 왕국', 'Kingdom of Hadramawt', [52, 44, 24, 22], ['하드라마우트', '샤브와', '유향'], ['YEM', N('OMN', 'Dhofar')]],
  ['MLEI', '오만 반도 아랍인 (믈레이하·에드두르)', 'Oman Peninsula (Mleiha, ed-Dur)', [52, 26, 12, 10], ['믈레이하', '에드두르', '오마나'], ['ARE', 'OMN']],
  ['ARAB', '아랍 유목 부족 (히자즈·나즈드·동아라비아)', 'Arab nomadic tribes', [48, 12, 22, 8], ['아랍 부족', '베두인'], ['SAU', 'QAT']],

  // ---- 아프리카 북동부 ----
  ['KUSH', '쿠시 왕국 (메로에)', 'Kingdom of Kush (Meroë)', [56, 44, 36, 30], ['쿠시', '메로에', '누비아'],
    [N('SDN', 'Northern', 'River Nile', 'Khartoum', 'Jazirah', 'White Nile', 'Sennar', 'Kassala', 'Qadarif', 'Blue Nile'), 'BRT']],
  ['BEJA', '블렘미에스 (베자인)', 'Blemmyes (Beja)', [48, 10, 22, 8], ['블렘미에스', '베자'], [N('SDN', 'Red Sea')]],
  ['BARB', '바르바리아 교역 도시 (말라오·오포네 등)', 'Barbaria trading towns (Malao, Opone)', [52, 20, 10, 10], ['바르바리아', '말라오', '오포네'],
    ['SOL', B('SOM', [44, 4.2, 52, 12])]],
  ['AZAN', '아자니아 (랍타)', 'Azania (Rhapta)', [52, 20, 10, 10], ['아자니아', '랍타', '스와힐리 선조'],
    ['SOM', N('KEN', 'Coast'), N('TZA', 'Tanga', 'Pwani', 'Dar es Salaam', 'Unguja', 'Mjini', 'Pemba')]],
  ['BAQU', '바쿠아테스·마케니테스 (마우리 부족)', 'Baquates & Macenites (Mauri tribes)', [46, 14, 24, 8], ['바쿠아테스', '마우리'],
    [N('MAR', 'Meknès', 'Tadla', 'Marrakesh', 'Chaouia', 'Casablanca', 'Doukkala')]],
];

const americas = [
  ['SUBA', null, null, null, null, [N('USA', 'Minnesota')]],
  ['HOPE', '호프웰 문화', 'Hopewell culture', [52, 20, 10, 10], ['호프웰', '마운드 축조민'],
    [N('USA', 'Ohio', 'Indiana', 'Illinois', 'Kentucky', 'West Virginia', 'Wisconsin', 'Iowa', 'Missouri', 'Michigan', 'Tennessee')]],
  ['MARK', '마크스빌 문화', 'Marksville culture', [54, 12, 6, 5], ['마크스빌'], [N('USA', 'Louisiana', 'Mississippi', 'Arkansas')]],
  ['SWIF', '스위프트크리크·뎁트퍼드 문화', 'Swift Creek & Deptford cultures', [54, 12, 6, 5], ['스위프트크리크', '뎁트퍼드'],
    [N('USA', 'Georgia', 'Florida', 'Alabama', 'South Carolina', 'North Carolina')]],
  ['POIN', '포인트 페닌슐라 문화 (북동부 우들랜드)', 'Point Peninsula complex', [54, 8, 6, 3], ['포인트 페닌슐라', '이로쿼이·알곤킨 선조'],
    [N('USA', 'New York', 'Pennsylvania', 'Vermont', 'New Hampshire', 'Maine', 'Massachusetts', 'Rhode Island', 'Connecticut', 'New Jersey', 'Delaware', 'Maryland', 'Virginia'),
      B('USA', [-77.5, 38.5, -76.5, 39.2]), N('CAN', 'New Brunswick', 'Nova Scotia', 'Prince Edward')]],
  ['HOHO', '호호캄 문화 (초기)', 'Early Hohokam', [54, 12, 6, 4], ['호호캄'], [N('USA', 'Arizona')]],
  ['TEOT', '테오티우아칸', 'Teotihuacan', [62, 46, 32, 36], ['테오티우아칸', '태양의 피라미드'], [N('MEX', 'Mexico', 'Morelos', 'Puebla', 'Tlaxcala', 'Hidalgo')], '#9c5a8c'],
  ['MOCH', '모체', 'Moche', [56, 36, 26, 20], ['모체', '모치카'], [N('PER', 'La Libertad', 'Lambayeque', 'Piura', 'Tumbes')]],
  ['RECU', '레쿠아이 문화', 'Recuay culture', [52, 20, 16, 8], ['레쿠아이'], [N('PER', 'Áncash', 'Huanuco', 'Pasco', 'Cajamarca')]],
  ['LIMC', '리마 문화', 'Lima culture', [52, 24, 12, 10], ['리마 문화', '마랑가'], [N('PER', 'Lima', 'Callao', 'Junín')]],
  ['NAZC', '나스카', 'Nazca', [54, 28, 16, 14], ['나스카', '나스카 지상화'], [N('PER', 'Ica', 'Arequipa', 'Ayacucho', 'Huancavelica', 'Apurímac')]],
  ['PUKA', '푸카라·초기 티와나쿠', 'Pukará & early Tiwanaku', [52, 22, 14, 10], ['푸카라', '티와나쿠'],
    [N('PER', 'Puno', 'Cusco', 'Moquegua', 'Tacna'), N('BOL', 'La Paz', 'Oruro', 'Cochabamba', 'Potosí', 'Chuquisaca')]],
];

const south = [
  ['EBAN', '동부 반투 농경민 (초기 철기 문화)', 'Eastern Bantu farmers (Early Iron Age)', [54, 12, 8, 4], ['동부 반투', '퀘일 문화'],
    ['TZA', 'MWI', B('MOZ', [30, -17.5, 41, -10]), N('ZMB', 'Northern', 'Muchinga', 'Luapula')]],
  ['KHOK', '코이코이인 (목축민)', 'Khoikhoi herders', [54, 8, 8, 3], ['코이코이', '호텐토트'], ['NAM', N('ZAF', 'Western Cape', 'Northern Cape')]],
  ['KHOI', '산족 (코이산 수렵채집민)', 'San (Khoisan foragers)', [56, 5, 5, 2], ['산족', '코이산', '부시먼'],
    ['ZMB', 'MOZ', 'ZWE', 'BWA', 'ZAF', 'LSO', 'SWZ', 'AGO', 'COD']],
];

const [uninhabited, ...rest] = common(117);
export default build([uninhabited, ...rows, ...americas, ...rest, ...africa(117), ...south]);
