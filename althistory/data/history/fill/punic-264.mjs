// 기원전 264년: 템플릿이 칠하지 않은 땅을 당시의 나라·부족·문화로 채운다.
import { build, common, africa, N, B } from './_ancient.mjs';

const rows = [
  // ---- 지중해 서부·작은 땅 ----
  ['ROM', null, null, null, null, ['VAT', 'SMR']],
  ['CAR', null, null, null, null, [N('ESP', 'Balearic', 'Melilla'), 'GIB']],
  ['PTO', null, null, null, null, ['ESB', 'WSB', 'CNM', 'CYN', B('JOR', [34, 31.2, 40, 33.5])]],
  ['MASS', '마살리아', 'Massalia', [58, 46, 20, 24], ['마실리아', '마르세유'], [N('FRA', 'Bouches-du-Rhône', 'Var', 'Alpes-Maritimes'), 'MCO']],

  // ---- 이탈리아 북부 ----
  ['VENE', '베네티인', 'Veneti', [52, 24, 18, 10], ['베네티', '베네토인'], [B('ITA', [11.4, 44.9, 14, 46.2])]],
  ['RAET', '라이티아인', 'Raetians', [50, 12, 14, 6], ['라이티', '레티아인'], [B('ITA', [9.5, 46.2, 13, 47.2])]],
  ['LIGU', '리구리아인', 'Ligurians', [50, 14, 20, 8], ['리구레스', '리구리아'], [B('ITA', [6, 43.8, 8.75, 45.3])]],
  ['CISG', '갈리아 키살피나 켈트족 (보이·인수브레스)', 'Cisalpine Gauls (Boii, Insubres)', [48, 24, 32, 14], ['키살피나 갈리아', '인수브레스', '보이족'], [{ adm0: 'ITA' }]],

  // ---- 갈리아 ----
  ['ARMO', '아르모리카 부족 (베네티족 등)', 'Armorican tribes', [50, 16, 16, 8], ['아르모리카', '브르타뉴 켈트'], [B('FRA', [-5.3, 46.8, -0.8, 49.0]), 'GGY', 'JEY']],
  ['AQUI', '아퀴타니족', 'Aquitani', [50, 14, 16, 6], ['아퀴타니', '바스크계 아퀴타니'], [B('FRA', [-1.9, 42.5, 1.6, 44.4])]],
  ['BELG', '벨가이족', 'Belgae', [46, 22, 34, 14], ['벨가이', '벨기카'],
    [B('FRA', [-1.5, 49.0, 9, 51.5]), 'BEL', 'LUX', B('NLD', [3, 50.5, 7.5, 51.75]), N('DEU', 'Rhineland', 'Saarland', 'North Rhine')]],
  ['GAUL', '갈리아 켈트족 (아르베르니·하이두이 등)', 'Gallic Celts (Arverni, Aedui, etc.)', [46, 28, 38, 18], ['갈리아', '갈리아인', '켈트족'], [B('FRA', [-5.3, 41.3, 9.7, 51.2])]],

  // ---- 이베리아 ----
  ['VASC', '바스콘족 (바스크인 선조)', 'Vascones', [52, 12, 14, 5], ['바스콘', '바스크 선조'], [N('ESP', 'Navarre', 'Gipuzkoa', 'Biscay', 'Álava')]],
  ['ASTU', '아스투르·칸타브리족', 'Astures & Cantabri', [52, 10, 18, 5], ['아스투르', '칸타브리'], [N('ESP', 'Asturias', 'Cantabria', 'León', 'Palencia')]],
  ['GALC', '갈라이키족', 'Gallaeci', [52, 12, 14, 5], ['갈라이키', '갈리시아 켈트'], [N('ESP', 'Coruña', 'Lugo', 'Ourense', 'Pontevedra'), B('PRT', [-10, 41.05, -6, 42.2])]],
  ['LUSI', '루시타니아인 (베토네스 포함)', 'Lusitanians (incl. Vettones)', [50, 14, 22, 8], ['루시타니아', '베토네스'], [{ adm0: 'PRT' }, N('ESP', 'Cáceres', 'Badajoz', 'Salamanca', 'Ávila')]],
  ['IBER', '이베리아인 (일레르게테스·에데타니 등)', 'Iberians (Ilergetes, Edetani, etc.)', [48, 26, 22, 10], ['이베리아인', '일레르게테스'], [B('ESP', [-1.6, 37.3, 3.5, 42.9]), 'AND']],
  ['CELB', '켈티베리아인 (바카이족 등)', 'Celtiberians (incl. Vaccaei)', [48, 18, 30, 10], ['켈티베리아', '아레바키'], [B('ESP', [-9.6, 35.9, 4.5, 43.9])]],
  ['CANA', '카나리아 제도 원주민 (베르베르계)', 'Canary Islanders (Berber settlers)', [56, 4, 4, 2], ['관체족 선조', '카나리아인'], [N('ESP', 'Santa Cruz de Tenerife', 'Las Palmas')]],

  // ---- 브리타니아·히베르니아 ----
  ['HIBE', '히베르니아 게일 부족', 'Gaelic tribes of Ireland', [52, 10, 12, 5], ['히베르니아', '아일랜드 켈트'], ['IRL', B('GBR', [-8.3, 54.0, -5.4, 55.3])]],
  ['CALE', '칼레도니아 부족 (픽트인 선조)', 'Caledonian tribes', [52, 8, 14, 5], ['칼레도니아', '픽트 선조'], [B('GBR', [-9, 56.0, 0, 61])]],
  ['BRIT', '브리튼인 (브리타니아 켈트족)', 'Ancient Britons', [50, 16, 18, 8], ['브리튼', '브리타니아'], [{ adm0: 'GBR' }, 'IMN']],

  // ---- 중부 유럽 켈트 ----
  ['HELV', '헬베티족', 'Helvetii', [50, 22, 26, 10], ['헬베티', '헬베티아'], ['CHE', 'LIE', N('DEU', 'Baden')]],
  ['BOII', '보이족 (보헤미아 켈트)', 'Boii', [50, 24, 26, 12], ['보이', '보헤미아'], ['CZE', 'SVK', N('DEU', 'Bavaria', 'Hesse', 'Thuringia'), B('DEU', [12.5, 50, 15.5, 51.3]),
    N('POL', 'Silesia', 'Opole', 'Lesser Poland'), N('UKR', 'Zakarpattia')]],
  ['NORI', '노리쿰 켈트족 (타우리스키)', 'Taurisci (Norican Celts)', [50, 22, 22, 10], ['노리쿰', '타우리스키'], ['AUT', 'SVN', 'HUN', N('HRV', 'Međimurje', 'Varaždin', 'Koprivnica', 'Krapina', 'Zagreb')]],

  // ---- 발칸 ----
  ['SCOR', '스코르디스키족 (켈트)', 'Scordisci', [46, 16, 28, 10], ['스코르디스키'], ['SRB', B('HRV', [18.3, 44.9, 19.5, 46])]],
  ['DARD', '다르다니아 왕국', 'Dardanian Kingdom', [48, 16, 22, 8], ['다르다니아'], ['KOS']],
  ['ILLY', '일리리아인 (아르디아이 왕국 등)', 'Illyrians (Ardiaei)', [48, 20, 28, 12], ['일리리아', '아르디아이'], ['ALB', 'MNE', 'BIH', 'HRV']],
  ['TYLI', '틸리스 왕국 (트라키아의 켈트)', 'Celtic Kingdom of Tylis', [46, 22, 26, 10], ['틸리스', '트라키아 켈트'], [N('BGR', 'Burgas', 'Varna', 'Dobrich', 'Shumen')]],
  ['GETA', '게타이족 (다키아인)', 'Getae (Dacians)', [48, 20, 28, 12], ['게타이', '다키아', '게테'], [N('BGR', 'Ruse', 'Silistra', 'Razgrad', 'Targovishte'), 'ROU', 'MDA', N('UKR', 'Chernivtsi', 'Ivano-Frankivsk')]],
  ['ODRY', '오드뤼사이 왕국 (트라키아인)', 'Odrysian Kingdom (Thracians)', [46, 26, 28, 14], ['오드뤼사이', '트라키아'], ['BGR']],

  // ---- 북유럽 ----
  ['GERM', '게르만 부족 (야스토르프 문화)', 'Germanic tribes (Jastorf culture)', [50, 16, 22, 8], ['게르만', '야스토르프'], [{ adm0: 'DEU' }, B('NLD', [3, 50, 8, 54]), { adm0: 'DNK' }, B('SWE', [10, 55, 16, 57.5])]],
  ['SCAN', '스칸디나비아 북게르만인', 'Pre-Roman Iron Age Scandinavians', [52, 12, 14, 5], ['북게르만', '스칸디나비아인'], [B('SWE', [10, 55, 25, 64]), B('NOR', [4, 57, 32, 65.5]), 'ALD']],
  ['FINN', '발트 핀인 (핀족·에스토니아인 선조)', 'Baltic Finns', [54, 8, 8, 3], ['핀족 선조', '에스토니아인 선조'],
    [B('FIN', [19, 59, 32, 64.3]), 'EST', N('RUS', 'Karelia', 'Leningrad', 'Saint Petersburg', 'Vologda', 'Pskov'), B('RUS', [31, 57.8, 34, 59])]],
  ['POMO', '포모제 문화 (면상 항아리 문화)', 'Pomeranian culture', [50, 12, 14, 5], ['포모제', '면상 항아리'], ['POL']],
  ['BALT', '발트족 (드네프르-드비나·유흐노프 문화)', 'Balts', [52, 10, 12, 4], ['발트인', '발트 부족'],
    ['LTU', 'LVA', 'BLR', N('RUS', 'Kaliningrad', 'Smolensk', 'Bryansk', 'Oryol')]],

  // ---- 흑해 북안·러시아 ----
  ['CHSN', '케르소네소스', 'Chersonesus', [56, 40, 12, 14], ['케르소네소스 타우리카'], [N('RUS', 'Sevastopol')]],
  ['OLBI', '올비아', 'Olbia', [52, 36, 10, 12], ['올비아 폰티카'], [N('UKR', 'Mykolaiv')]],
  ['BOSP', '보스포로스 왕국', 'Bosporan Kingdom', [54, 44, 26, 24], ['보스포로스', '판티카파이온'], [N('RUS', 'Krasnodar', 'Adygea')]],
  ['SCYT', '스키타이 (소스키타이 왕국)', 'Scythians', [46, 26, 36, 18], ['스키타이', '스키타이인'], ['UKR', N('RUS', 'Crimea', 'Kursk', 'Belgorod', 'Voronezh')]],
  ['SARM', '사르마티아인 (사우로마타이)', 'Sarmatians', [48, 14, 40, 16], ['사르마티아', '사우로마타이', '프로호로프카 문화'],
    [N('RUS', 'Rostov', 'Volgograd', 'Astrakhan', 'Kalmykia', 'Saratov', 'Stavropol', 'Orenburg', 'Samara', 'Chelyabinsk'), N('KAZ', 'West Kazakhstan', 'Atyrau', 'Aktobe', 'Kostanay')]],
  ['CAUC', '북캅카스 산악 부족 (코반 문화 후예)', 'North Caucasian highlanders', [50, 10, 16, 4], ['캅카스 산악민', '코반 문화'],
    [N('RUS', 'Karachay', 'Kabardino', 'Ossetia', 'Ingushetia', 'Chechen', 'Dagestan')]],
  ['GORO', '고로데츠 문화 (모르드바인 선조)', 'Gorodets culture (proto-Mordvins)', [54, 8, 8, 3], ['고로데츠', '모르드바 선조'],
    [N('RUS', 'Mordovia', 'Penza', 'Ryazan', 'Tambov', 'Lipetsk', 'Nizhny', 'Ulyanovsk')]],
  ['DYAK', '댜코보 문화 (볼가 핀인 선조)', 'Dyakovo culture', [54, 8, 8, 3], ['댜코보', '메랴 선조'],
    [N('RUS', 'Moscow', 'Tver', 'Yaroslavl', 'Vladimir', 'Ivanovo', 'Kostroma', 'Kaluga', 'Tula')]],
  ['ANAN', '아나니노 문화 (페름·우드무르트 선조)', 'Ananyino culture', [54, 10, 10, 4], ['아나니노', '페름 선조'],
    [N('RUS', 'Tatarstan', 'Udmurt', 'Perm', 'Kirov', 'Bashkortostan', 'Chuvash', 'Mari El')]],
  ['SARG', '사르가트 문화', 'Sargat culture', [52, 10, 14, 4], ['사르가트'], [N('RUS', 'Tyumen', 'Kurgan', 'Omsk'), N('KAZ', 'North Kazakhstan')]],
  ['KULA', '쿨라이 문화 (사모예드 선조)', 'Kulai culture', [54, 8, 8, 3], ['쿨라이'], [N('RUS', 'Tomsk', 'Novosibirsk', 'Kemerovo')]],
  ['PAZY', '파지리크 문화 (알타이)', 'Pazyryk culture', [52, 14, 20, 8], ['파지리크', '알타이 스키타이'], [N('RUS', 'Altai'), N('MNG', 'Bayan-Ölgii')]],
  ['TAGA', '타가르 문화 (견곤 선조)', 'Tagar culture', [52, 12, 16, 6], ['타가르', '견곤 선조'], [N('RUS', 'Khakassia', 'Tuva'), N('MNG', 'Uvs')]],
  ['DING', '정령 (丁零)', 'Dingling', [50, 8, 16, 5], ['정령', '딩링'], [N('RUS', 'Buryatia', 'Irkutsk', 'Zabaykalsky'), N('MNG', 'Khövsgöl')]],

  // ---- 중앙아시아 초원 ----
  ['MASG', '마사게타이 (다하이 포함)', 'Massagetae', [48, 14, 36, 14], ['마사게타이', '다하이'], [N('KAZ', 'Turkistan', 'Kyzylorda', 'Mangystau'), 'KAB']],
  ['SAKA', '사카 (塞)', 'Saka', [48, 16, 36, 14], ['사카', '색종'], ['KAZ', 'KGZ']],

  // ---- 동아시아 ----
  ['XION', '흉노', 'Xiongnu', [50, 24, 54, 30], ['흉노', '두만 선우'], [N('CHN', 'Inner Mongolia'),
    N('MNG', 'Ömnögovi', 'Dundgovi', 'Dornogovi', 'Övörkhangai', 'Töv', 'Ulaanbaatar', 'Arkhangai', 'Bayankhongor', 'Bulgan', 'Orkhon', 'Selenge', 'Darkhan', 'Govisümber', 'Zavkhan')]],
  ['DONH', '동호 (東胡)', 'Donghu', [48, 16, 38, 16], ['동호'], [N('MNG', 'Dornod', 'Sükhbaatar', 'Khentii')]],
  ['YUEZ', '월지', 'Yuezhi', [50, 26, 42, 24], ['월지', '대월지 선조'], [N('CHN', 'Gansu'), N('MNG', 'Govi-Altai', 'Khovd')]],
  ['TOCH', '서역 오아시스 도시 (토하라·사카계)', 'Tarim oasis towns (Tocharian & Saka)', [52, 24, 14, 10], ['토하라인', '타림 분지'], [N('CHN', 'Xinjiang')]],
  ['ZHAN', '상웅 (象雄)', 'Zhangzhung', [52, 14, 16, 8], ['상웅', '샹슝'], [N('CHN', 'Tibet'), 'KAS', N('IND', 'Ladakh')]],
  ['QIAN', '강족 (羌)', 'Qiang', [50, 10, 20, 6], ['강족', '서강'], [N('CHN', 'Qinghai')]],
  ['QIN', '진 (秦)', 'State of Qin', [66, 60, 78, 54], ['진나라', '진', '소양왕'], [N('CHN', 'Shaanxi', 'Sichuan', 'Chongqing', 'Ningxia', 'Hubei')], '#4f5d73'],
  ['ZHAO', '조 (趙)', 'State of Zhao', [54, 46, 62, 40], ['조나라', '조'], [N('CHN', 'Shanxi')]],
  ['YAN', '연 (燕)', 'State of Yan', [50, 42, 46, 32], ['연나라', '연'], [N('CHN', 'Hebei', 'Beijing', 'Tianjin', 'Liaoning')]],
  ['WEI', '위 (魏)', 'State of Wei', [46, 48, 44, 34], ['위나라', '위', '대량'], [N('CHN', 'Henan')]],
  ['QI', '제 (齊)', 'State of Qi', [52, 58, 44, 42], ['제나라', '제', '임치'], [N('CHN', 'Shandong')]],
  ['CHU', '초 (楚)', 'State of Chu', [48, 54, 56, 46], ['초나라', '초'], [N('CHN', 'Anhui', 'Jiangsu', 'Shanghai', 'Zhejiang', 'Hunan', 'Jiangxi')]],
  ['YELA', '야랑 (夜郞)', 'Yelang', [50, 16, 16, 8], ['야랑'], [N('CHN', 'Guizhou')]],
  ['DIAN', '전 (滇)', 'Dian Kingdom', [52, 20, 16, 8], ['전국', '전왕'], [N('CHN', 'Yunnan')]],
  ['TAIW', '대만 원주민 (오스트로네시아계)', 'Taiwanese Austronesians', [55, 8, 6, 3], ['대만 원주민'], ['TWN']],
  ['GOJO', '고조선', 'Gojoseon', [52, 30, 36, 24], ['고조선', '조선', '왕검성'], [N('PRK', 'Pyongan', 'Pyongyang', 'Hwanghae', 'Chagang')]],
  ['OKJE', '옥저', 'Okjeo', [52, 12, 12, 5], ['옥저', '크로우놉카 문화'], [N('PRK', 'North Hamgyong', 'Rason'), N('RUS', 'Primorsky')]],
  ['YEMA', '예맥', 'Yemaek', [50, 14, 18, 8], ['예맥', '예', '맥'], [N('CHN', 'Jilin'), 'PRK', N('KOR', 'Gangwon')]],
  ['JING', '진국 (辰國)', 'Jin state', [52, 16, 14, 8], ['진국', '삼한 선조'], ['KOR']],
  ['SUSH', '숙신 (肅愼)', 'Sushen', [50, 8, 14, 4], ['숙신', '읍루 선조'], [N('CHN', 'Heilongjiang'), N('RUS', 'Amur', 'Jewish', 'Khabarovsk')]],
  ['BAIY', '백월 (민월·남월·낙월 등)', 'Baiyue (Hundred Yue)', [48, 18, 20, 10], ['백월', '월족'], ['CHN']],
  ['EPIJ', '속조몬 문화 (홋카이도·사할린)', 'Epi-Jōmon culture', [54, 8, 6, 3], ['속조몬', '아이누 선조'], [N('JPN', 'Hokkaidō'), N('RUS', 'Sakhalin')]],
  ['RYUK', '패총 시대 류큐인', 'Ryukyu Shell-Midden people', [55, 6, 4, 2], ['류큐 선조', '패총 시대'], [N('JPN', 'Okinawa')]],
  ['JOMO', '조몬 문화 (만기)', 'Final Jōmon culture', [54, 10, 8, 4], ['조몬', '조몬인'], [B('JPN', [137.4, 34.5, 146, 42])]],
  ['YAYO', '야요이 문화 (왜인 소집단)', 'Yayoi culture', [52, 16, 10, 6], ['야요이', '왜인'], ['JPN']],

  // ---- 남아시아 ----
  ['MAU', '마우리아 제국', 'Maurya Empire', [64, 74, 80, 70], ['마우리아', '아소카', '파탈리푸트라'], [], '#c9782c'],
  ['KALI', '칼링가', 'Kalinga', [52, 42, 40, 24], ['칼링가'], [N('IND', 'Odisha')]],
  ['CHOL', '촐라', 'Early Cholas', [52, 34, 26, 16], ['촐라', '초기 촐라'], [N('IND', 'Puducherry')]],
  ['PAND', '판디아', 'Early Pandyas', [52, 36, 26, 18], ['판디아', '마두라이'], [N('IND', 'Tamil Nadu')]],
  ['CHERA', '체라', 'Early Cheras', [52, 32, 22, 14], ['체라', '케랄라'], [N('IND', 'Kerala', 'Lakshadweep')]],
  ['ANUR', '아누라다푸라 왕국', 'Anuradhapura Kingdom', [52, 30, 20, 14], ['아누라다푸라', '싱할라'], ['LKA', 'MDV']],
  ['ANDA', '안다만·니코바르 원주민', 'Andamanese & Nicobarese', [56, 4, 4, 2], ['안다만인'], [N('IND', 'Andaman')]],
  ['NEIN', '티베트버마계 부족 (나가·카시·친 선조)', 'Northeast hill peoples (Naga, Khasi, Chin)', [52, 8, 10, 3], ['나가 선조', '카시'],
    [N('IND', 'Assam', 'Meghalaya', 'Arunachal', 'Nagaland', 'Manipur', 'Mizoram', 'Tripura', 'Sikkim'), 'BTN', N('MMR', 'Kachin', 'Chin', 'Rakhine')]],
  ['MAU', null, null, null, null, ['IND', 'PAK', 'BGD', 'NPL']],

  // ---- 동남아시아 ----
  ['VANL', '반랑 (흥왕조, 동선 문화)', 'Văn Lang (Hùng kings, Đông Sơn)', [52, 24, 20, 12], ['반랑', '문랑', '동선 문화'], [B('VNM', [102, 17.8, 110, 24])]],
  ['KHME', '몬-크메르계 농경민 (크메르 선조)', 'Mon-Khmer farmers (proto-Khmer)', [54, 12, 8, 4], ['크메르 선조', '오스트로아시아계'],
    [N('VNM', 'Kon Tum', 'Gia Lai', 'Đắk', 'Lâm Đồng', 'Bình Phước')]],
  ['SAHU', '사후인 문화 (참족 선조)', 'Sa Huỳnh culture', [54, 16, 10, 6], ['사후인', '참족 선조'], [B('VNM', [106, 15.5, 110, 17.8]), B('VNM', [107, 10.8, 110, 15.5])]],
  ['KHME', null, null, null, null, ['VNM', 'KHM', 'LAO', B('THA', [101.5, 14.5, 106, 18.5]), N('MMR', 'Shan', 'Kayah'), B('THA', [97, 17, 106, 21])]],
  ['PYU', '퓨족 (초기 도시 문화)', 'Pyu', [52, 16, 10, 6], ['퓨', '표국'], [N('MMR', 'Magway', 'Mandalay', 'Sagaing')]],
  ['MONS', '몬족 선조 (오스트로아시아계)', 'Proto-Mon', [54, 16, 8, 6], ['몬족', '반돈타펫'], ['MMR', B('THA', [97, 9.5, 106, 17])]],
  ['MALA', '말레이 반도 원주민 (오랑 아슬리 선조)', 'Malay Peninsula aborigines', [55, 8, 6, 3], ['오랑 아슬리 선조'], ['THA', B('MYS', [99, 1, 105, 7]), 'SGP']],
  ['BUNI', '부니 문화 (서자와)', 'Buni culture', [54, 14, 8, 5], ['부니', '서자와'], [N('IDN', 'West Java', 'Banten', 'Jakarta')]],
  ['NUSA', '누산타라 오스트로네시아인 (말레이·자와 선조)', 'Nusantara Austronesians', [54, 12, 8, 5], ['오스트로네시아계', '말레이 선조'], [B('IDN', [94, -11, 131, 6]), 'MYS', 'BRN', 'TLS']],
  ['PHIL', '필리핀 오스트로네시아인 (칼라나이 문화)', 'Philippine Austronesians (Kalanay)', [54, 10, 8, 4], ['칼라나이 문화', '필리핀 원주민'], ['PHL']],

  // ---- 아라비아·아프리카 북동부 ----
  ['NABA', '나바테아인', 'Nabataeans', [54, 40, 22, 18], ['나바테아', '페트라'], ['JOR', N('SAU', 'Tabuk')]],
  ['LIHY', '리흐얀 왕국 (데단)', 'Lihyan (Dedan)', [52, 30, 14, 12], ['리흐얀', '데단'], [N('SAU', 'Madinah')]],
  ['GERR', '게라 (게르하)', 'Gerrha', [54, 44, 12, 18], ['게라', '게르하'], [N('SAU', 'Eastern'), 'QAT', 'BHR']],
  ['MAIN', '마인 왕국', 'Kingdom of Maʿīn', [52, 40, 16, 18], ['마인', '미나이아'], [N('YEM', 'Al Jawf', "Sa'dah"), N('SAU', 'Najran')]],
  ['SABA', '사바 왕국', 'Kingdom of Saba', [56, 50, 28, 30], ['사바', '시바', '마리브'], [N('YEM', "Ma'rib", 'Sanaa', "'Amran", 'Dhamar', 'Mahwit', 'Hajjah', 'Raymah', 'Hudaydah')]],
  ['QATB', '카타반 왕국', 'Kingdom of Qataban', [52, 40, 20, 18], ['카타반', '팀나'], [{ adm0: 'YEM', box: [43, 12, 46.5, 14.5] }]],
  ['HADR', '하드라마우트 왕국', 'Kingdom of Hadramawt', [52, 42, 20, 18], ['하드라마우트', '샤브와'], ['YEM', N('OMN', 'Dhofar')]],
  ['MLEI', '믈레이하 (오만 반도 아랍인)', 'Mleiha (Oman Peninsula)', [52, 24, 12, 8], ['믈레이하', '마칸'], ['ARE', 'OMN']],
  ['ARAB', '아랍 유목 부족 (북·중부 아라비아)', 'Arab nomadic tribes', [48, 12, 22, 8], ['아랍 부족', '베두인'], ['SAU']],
  ['KUSH', '쿠시 왕국 (메로에)', 'Kingdom of Kush (Meroë)', [56, 46, 40, 32], ['쿠시', '메로에', '누비아'],
    [N('SDN', 'Northern', 'River Nile', 'Khartoum', 'Jazirah', 'White Nile', 'Sennar', 'Kassala', 'Qadarif', 'Blue Nile'), 'BRT']],
  ['BEJA', '베자인 (블렘미에스)', 'Beja (Blemmyes)', [50, 8, 16, 4], ['블렘미에스', '베자'], [N('SDN', 'Red Sea'), N('ERI', 'Northern Red Sea', 'Gash-Barka', 'Anseba')]],
  ['PREA', '프레악숨 소왕국 (다모트 후계)', 'Pre-Aksumite polities (post-Dʿmt)', [50, 22, 16, 10], ['다모트 후계', '프레악숨'], ['ERI', N('ETH', 'Tigray', 'Afar')]],
  ['SOMC', '원(原)소말리 해안 교역민', 'Proto-Somali coastal traders', [52, 14, 10, 6], ['원소말리', '바르바리아'], ['SOM', 'SOL']],

  // ---- 북아프리카 ----
  ['MAUE', '마우리족 (마우레타니아)', 'Mauri (Mauretania)', [50, 18, 22, 10], ['마우레타니아', '마우리'],
    [N('ESP', 'Ceuta'), N('MAR', 'Oriental', 'Meknès', 'Taza', 'Rabat', 'Chaouia', 'Casablanca', 'Doukkala', 'Marrakesh', 'Fès', 'Tadla', 'Tanger', 'Gharb')]],
];

const south = [
  ['KHOI', '코이산인 (산족 수렵채집민)', 'Khoisan (San hunter-gatherers)', [56, 5, 5, 2], ['코이산', '산족', '부시먼'],
    ['TZA', 'ZMB', 'MWI', 'MOZ', 'ZWE', 'BWA', 'NAM', 'ZAF', 'LSO', 'SWZ', 'AGO', 'COD']],
];

const americas = [
  ['ADEN', '아데나 문화', 'Adena culture', [52, 14, 10, 6], ['아데나', '마운드 축조민'], [N('USA', 'Ohio', 'Kentucky', 'West Virginia', 'Indiana', 'Tennessee')]],
  ['TCHE', '체펑크티 문화', 'Tchefuncte culture', [54, 10, 6, 4], ['체펑크티'], [N('USA', 'Louisiana', 'Mississippi', 'Arkansas')]],
  ['DEPT', '뎁트퍼드 문화', 'Deptford culture', [54, 10, 6, 4], ['뎁트퍼드'], [N('USA', 'Georgia', 'Florida', 'Alabama', 'South Carolina', 'North Carolina')]],
  ['WOOD', '초기 우들랜드 문화 (블랙 샌드·모턴)', 'Early Woodland (Black Sand, Morton)', [54, 8, 6, 3], ['초기 우들랜드'],
    [N('USA', 'Illinois', 'Iowa', 'Missouri', 'Wisconsin', 'Minnesota', 'Michigan')]],
  ['POIN', '포인트 페닌슐라 문화 (북동부 우들랜드)', 'Point Peninsula complex', [54, 8, 6, 3], ['포인트 페닌슐라', '이로쿼이·알곤킨 선조'],
    [N('USA', 'New York', 'Pennsylvania', 'Vermont', 'New Hampshire', 'Maine', 'Massachusetts', 'Rhode Island', 'Connecticut', 'New Jersey', 'Delaware', 'Maryland', 'Virginia'),
      B('USA', [-77.5, 38.5, -76.5, 39.2]), N('CAN', 'New Brunswick', 'Nova Scotia', 'Prince Edward')]],
  ['CUIC', '쿠이쿨코', 'Cuicuilco', [52, 24, 14, 14], ['쿠이쿨코', '멕시코 분지'], [N('MEX', 'Mexico', 'Morelos', 'Puebla', 'Tlaxcala', 'Hidalgo')]],
  ['PARA', '파라카스 문화', 'Paracas culture', [52, 22, 12, 10], ['파라카스'], [N('PER', 'Ica', 'Lima', 'Callao', 'Arequipa', 'Huancavelica', 'Ayacucho')]],
  ['SALI', '살리나르 문화 (차빈 이후 북부 페루)', 'Salinar culture (post-Chavín)', [50, 18, 12, 8], ['살리나르', '차빈 후계'],
    [N('PER', 'Áncash', 'La Libertad', 'Lambayeque', 'Cajamarca', 'Piura', 'Tumbes', 'Huanuco', 'Pasco', 'Junín')]],
  ['PUKA', '푸카라·치리파 문화 (티티카카 분지)', 'Pukará & Chiripa cultures', [52, 18, 12, 8], ['푸카라', '치리파'],
    [N('PER', 'Puno', 'Cusco', 'Apurímac', 'Moquegua', 'Tacna'), N('BOL', 'La Paz', 'Oruro', 'Cochabamba', 'Potosí', 'Chuquisaca')]],
];

const [uninhabited, ...rest] = common(-264);
export default build([uninhabited, ...rows, ...americas, ...rest, ...africa(-264), ...south]);
