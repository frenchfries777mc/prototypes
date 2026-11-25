// 19세기 중반(1853~1866) 세계의 빈 땅 채우기 공용 모듈. 템플릿 바탕은 ../_w19.mjs.
// w19fill({ year }) → { polities, paint }. 연도별 차이(오만·잔지바르 분리, 아프가니스탄 통합, 투쿨로르 팽창 등)는 여기서 처리하고,
// 템플릿 파일(fill/<id>.mjs)은 그 해에만 있는 앞선 규칙(paint 앞부분)을 덧붙인다.

const A = (adm0, ...names) => ({ adm0, names });

export function w19fill({ year = 1853 } = {}) {
  const y53 = year < 1855, y59 = year >= 1855 && year < 1863, y66 = year >= 1863;
  const P = {
    // ── 아메리카 ──
    NGR: y53 ? { n: '누에바그라나다 공화국', e: 'Republic of New Granada', s: [40, 30, 24, 22], a: ['누에바그라나다', '콜롬비아', '파나마'] }
      : y59 ? { n: '그라나다 연합', e: 'Granadine Confederation', s: [36, 30, 24, 20], a: ['그라나다 연합', '누에바그라나다', '콜롬비아'] }
      : { n: '콜롬비아 합중국', e: 'United States of Colombia', s: [38, 32, 24, 20], a: ['콜롬비아', '그라나다'] },
    BRZ: { n: '브라질 제국', e: 'Empire of Brazil', s: [60, 44, 38, 42], a: ['브라질', '페드루 2세'] },
    ARC: year < 1862 ? { n: '아르헨티나 연합', e: 'Argentine Confederation', s: [40, 30, 28, 22], a: ['아르헨티나', '파라나 정부', '우르키사'] }
      : { n: '아르헨티나 공화국', e: 'Argentine Republic', s: [46, 38, 34, 28], a: ['아르헨티나', '미트레'] },
    BAS: { n: '부에노스아이레스국', e: 'State of Buenos Aires', s: [48, 42, 28, 24], a: ['부에노스아이레스'] },
    MAP: { n: '마푸체 (아라우카니아)', e: 'Mapuche (Araucanía and the Pampas)', s: [50, 12, 32, 10], a: ['마푸체', '아라우카니아', '칼푸쿠라'] },
    TEH: { n: '테우엘체 (파타고니아)', e: 'Tehuelche (Patagonia)', s: [50, 6, 14, 4], a: ['테우엘체', '파타고니아'] },
    PERU: { n: '페루 공화국', e: 'Republic of Peru', s: [44, 42, 32, 30], a: ['페루'] },
    BOLV: { n: '볼리비아 공화국', e: 'Republic of Bolivia', s: [34, 24, 22, 16], a: ['볼리비아'] },
    // ── 북아프리카·사하라 ──
    MOR: { n: '모로코 술탄국', e: 'Sultanate of Morocco', s: [44, 32, 32, 24], a: ['모로코', '알라위 왕조'] },
    TRZ: { n: '트라르자 에미르국', e: 'Emirate of Trarza', s: [44, 12, 20, 8], a: ['트라르자'] },
    BRK: { n: '브라크나 에미르국', e: 'Emirate of Brakna', s: [42, 10, 16, 6], a: ['브라크나'] },
    ADR: { n: '아드라르 에미르국', e: 'Emirate of Adrar', s: [44, 8, 14, 6], a: ['아드라르'] },
    TAG: { n: '타간트 에미르국', e: 'Emirate of Tagant', s: [42, 8, 14, 6], a: ['타간트', '이드아이시'] },
    TUA: { n: '투아레그 연맹 (이울레메덴)', e: 'Tuareg confederations (Iwellemmeden, Kel Adagh)', s: [46, 8, 26, 10], a: ['투아레그', '이울레메덴'] },
    AIR: { n: '아이르 술탄국', e: 'Sultanate of Aïr (Agadez)', s: [44, 10, 18, 8], a: ['아가데즈', '아이르'] },
    TBU: { n: '투부 (테다)', e: 'Toubou (Teda) clans', s: [46, 4, 16, 4], a: ['투부', '테다', '티베스티'] },
    // ── 서아프리카 ──
    TUK: { n: '투쿨로르 제국', e: 'Toucouleur Empire (Umar Tall)', s: y53 ? [56, 14, 34, 18] : y59 ? [58, 20, 46, 28] : [44, 30, 46, 32], a: ['투쿨로르', '우마르 탈', '티자니야'] },
    KRT: { n: '카르타 왕국', e: 'Kingdom of Kaarta', s: [40, 16, 22, 10], a: ['카르타', '마사시'] },
    SEG: { n: '세구 왕국', e: 'Bambara Empire of Ségou', s: [44, 26, 32, 18], a: ['세구', '밤바라'] },
    MSN: { n: '마시나 칼리프국', e: 'Massina Caliphate (Hamdullahi)', s: [50, 24, 30, 20], a: ['마시나', '함달라이'] },
    KND: { n: '케네두구 왕국', e: 'Kingdom of Kénédougou', s: [46, 14, 20, 8], a: ['케네두구', '시카소'] },
    KONG: { n: '콩 제국', e: 'Kong Empire', s: [44, 22, 18, 12], a: ['콩', '와타라', '귀리코'] },
    MOS: { n: '모시 왕국들', e: 'Mossi Kingdoms', s: [56, 20, 30, 14], a: ['모시', '와가두구', '야텡가'] },
    FTJ: { n: '푸타잘롱 이맘국', e: 'Imamate of Futa Jallon', s: [48, 22, 28, 14], a: ['푸타잘롱', '팀보'] },
    BTE: { n: '바테 (칸칸)', e: 'Baté (Kankan Maninka)', s: [44, 14, 16, 8], a: ['칸칸', '바테'] },
    TMN: { n: '템네·멘데 족장국들', e: 'Temne and Mende chiefdoms', s: [42, 12, 14, 6], a: ['템네', '멘데'] },
    BAU: { n: '바울레 (아칸 족장국들)', e: 'Baoulé and Akan chiefdoms', s: [44, 14, 14, 6], a: ['바울레'] },
    ASH: { n: '아샨티 제국', e: 'Ashanti Empire', s: [56, 40, 46, 30], a: ['아샨티', '쿠마시'] },
    EWE: { n: '에웨 족장국들', e: 'Ewe chiefdoms', s: [42, 16, 14, 6], a: ['에웨'] },
    DAH: { n: '다호메이 왕국', e: 'Kingdom of Dahomey', s: [58, 34, 44, 24], a: ['다호메이', '아보메', '게조'] },
    PNV: { n: '포르토노보 왕국', e: 'Kingdom of Porto-Novo', s: [44, 22, 12, 8], a: ['포르토노보', '하그보메'] },
    BRG: { n: '보르구 (니키 왕국)', e: 'Borgu (Kingdom of Nikki)', s: [46, 14, 22, 8], a: ['보르구', '니키', '바리바'] },
    YOR: { n: '요루바 도시국가들', e: 'Yoruba states (Ibadan, Abeokuta)', s: [40, 32, 34, 18], a: ['요루바', '이바단', '아베오쿠타'] },
    BNN: { n: '베냉 왕국', e: 'Kingdom of Benin', s: [48, 28, 26, 14], a: ['베냉', '오바'] },
    ARO: { n: '아로 연맹', e: 'Aro Confederacy (Igboland)', s: [50, 30, 22, 16], a: ['아로', '이그보'] },
    BON: { n: '보니 왕국', e: 'Kingdom of Bonny (Niger Delta city-states)', s: [44, 34, 14, 12], a: ['보니', '칼라바르', '니제르 삼각주'] },
    SOK: { n: '소코토 칼리프국', e: 'Sokoto Caliphate', s: [52, 44, 48, 36], a: ['소코토', '풀라니', '하우사'] },
    BOR: { n: '보르누 제국', e: 'Bornu Empire', s: [44, 30, 30, 20], a: ['보르누', '카넴', '쿠카와'] },
    DMG: { n: '다마가람 술탄국', e: 'Sultanate of Damagaram (Zinder)', s: [48, 18, 22, 10], a: ['다마가람', '진데르'] },
    MRD: { n: '마라디·고비르', e: 'Maradi and Gobir (Hausa holdouts)', s: [44, 14, 20, 6], a: ['마라디', '고비르'] },
    ZRM: { n: '자르마 족장국 (도소)', e: 'Zarma chiefdoms (Dosso)', s: [44, 10, 16, 6], a: ['자르마', '도소'] },
    WAD: { n: '와다이 술탄국', e: 'Wadai Sultanate', s: [52, 30, 40, 24], a: ['와다이', '아베셰'] },
    BAG: { n: '바기르미 술탄국', e: 'Sultanate of Bagirmi', s: [42, 18, 22, 10], a: ['바기르미', '마세냐'] },
    // ── 중·동아프리카 ──
    DAR: { n: '다르푸르 술탄국', e: 'Sultanate of Darfur', s: [48, 28, 34, 18], a: ['다르푸르', '푸르'] },
    SHL: { n: '실루크 왕국', e: 'Shilluk Kingdom', s: [46, 12, 18, 6], a: ['실루크', '레스'] },
    DNK: { n: '딩카·누에르족', e: 'Dinka and Nuer peoples', s: [48, 8, 22, 4], a: ['딩카', '누에르'] },
    AZD: { n: '아잔데 왕국들', e: 'Azande kingdoms', s: [46, 12, 24, 8], a: ['아잔데', '잔데', '망베투'] },
    GBY: { n: '그바야·반다족', e: 'Gbaya and Banda peoples', s: [42, 8, 12, 4], a: ['그바야', '반다'] },
    BAM: { n: '바뭄 왕국', e: 'Bamum Kingdom', s: [50, 16, 18, 8], a: ['바뭄', '품반', '그라스필드'] },
    DUA: { n: '두알라 왕국들', e: 'Duala kingdoms', s: [42, 20, 10, 8], a: ['두알라', '벨 왕', '아콰 왕'] },
    FNG: { n: '팡족 (베티-파후인)', e: 'Fang (Beti-Pahuin) peoples', s: [44, 10, 16, 4], a: ['팡', '베티'] },
    ORU: { n: '오룽구 왕국', e: 'Orungu Kingdom (Cape Lopez)', s: [42, 16, 8, 6], a: ['오룽구', '미에네'] },
    LOA: { n: '로앙고 왕국', e: 'Kingdom of Loango', s: [38, 22, 12, 8], a: ['로앙고', '빌리'] },
    TEK: { n: '테케 왕국', e: 'Teke Kingdom (Makoko)', s: [44, 18, 16, 8], a: ['테케', '마코코', '안지쿠'] },
    KGO: { n: '콩고 왕국', e: 'Kingdom of Kongo', s: [32, 16, 12, 10], a: ['콩고', '음반자콩고'] },
    LUN: { n: '룬다 제국', e: 'Lunda Empire', s: [46, 26, 30, 18], a: ['룬다', '므와안트 야브'] },
    KUB: { n: '쿠바 왕국', e: 'Kuba Kingdom', s: [52, 22, 16, 8], a: ['쿠바', '부숑'] },
    LUB: { n: '루바 제국', e: 'Luba Empire', s: [48, 24, 30, 16], a: ['루바'] },
    MGO: { n: '몽고족 (콩고 분지)', e: 'Mongo peoples (Congo Basin)', s: [44, 8, 10, 4], a: ['몽고족'] },
    KZB: { n: '카젬베 왕국', e: 'Kingdom of Kazembe', s: [46, 24, 24, 14], a: ['카젬베', '루아풀라 룬다'] },
    BEM: { n: '벰바 왕국', e: 'Bemba Kingdom', s: [50, 14, 28, 10], a: ['벰바', '치티무쿨루'] },
    LOZ: year < 1864 ? { n: '마콜롤로 왕국', e: 'Makololo Kingdom', s: [46, 20, 32, 14], a: ['마콜롤로', '세케레투', '바로체'] }
      : { n: '바로체 왕국 (로지)', e: 'Barotse Kingdom (Lozi)', s: [50, 20, 28, 12], a: ['바로체', '로지', '시필로'] },
    MRV: { n: '마라비 (체와 왕국들)', e: 'Maravi (Chewa kingdoms)', s: [38, 16, 16, 8], a: ['마라비', '체와', '운디'] },
    NGN: { n: '응고니 왕국들', e: 'Ngoni kingdoms', s: [50, 12, 34, 12], a: ['응고니', '음벨와'] },
    NDB: { n: '은데벨레 왕국', e: 'Ndebele Kingdom (Mthwakazi)', s: [58, 18, 42, 18], a: ['은데벨레', '마타벨레', '음질리카지'] },
    MUT: { n: '무타파 왕국', e: 'Kingdom of Mutapa', s: [30, 12, 10, 6], a: ['무타파', '모노모타파'] },
    GAZ: { n: '가자 제국', e: 'Gaza Empire', s: [50, 18, 36, 14], a: ['가자', '소샹가네', '응구니'] },
    NGW: { n: '응와토 (바망와토)', e: 'Bamangwato (Ngwato)', s: [48, 14, 18, 8], a: ['응와토', '바망와토', '쇼숑'] },
    KWE: { n: '크웨나 (세첼레)', e: 'Bakwena (Sechele)', s: [48, 14, 18, 8], a: ['크웨나', '세첼레', '츠와나'] },
    TAW: { n: '타와나 (바타와나)', e: 'Batawana', s: [46, 10, 14, 6], a: ['타와나', '응가미'] },
    OVA: { n: '오밤보 왕국들', e: 'Ovambo kingdoms (Ondonga)', s: [50, 14, 18, 8], a: ['오밤보', '온동가'] },
    HER: { n: '헤레로족', e: 'Herero', s: [44, 14, 20, 6], a: ['헤레로', '마하레로'] },
    ORL: { n: '오를람 아프리카너 (나마)', e: 'Orlam Afrikaners (Nama)', s: [42, 12, 22, 8], a: ['오를람', '나마', '아프리카너'] },
    ZAR: year < 1860 ? { n: '트란스발 보어 공화국들', e: 'Transvaal Boer republics (South African Republic)', s: [40, 22, 26, 12], a: ['트란스발', '남아프리카 공화국', '보어'] }
      : { n: '남아프리카 공화국 (트란스발)', e: 'South African Republic (Transvaal)', s: [46, 24, 28, 14], a: ['트란스발', '보어', '프레토리우스'] },
    BSO: { n: '바소토 왕국', e: 'Basotho Kingdom', s: [56, 14, 26, 10], a: ['바소토', '레소토', '모슈슈'] },
    SWZI: { n: '스와지 왕국', e: 'Swazi Kingdom', s: [54, 12, 24, 8], a: ['스와지', '음스와티'] },
    MER: { n: '메리나 왕국', e: 'Merina Kingdom (Kingdom of Madagascar)', s: [50, 34, 38, 22], a: ['메리나', '마다가스카르', '라나발루나'] },
    SKL: { n: '사칼라바 왕국들 (메나베)', e: 'Sakalava kingdoms (Menabe)', s: [44, 14, 18, 8], a: ['사칼라바', '메나베'] },
    COMS: { n: '코모로 술탄국들', e: 'Comorian sultanates (Anjouan, Ngazidja, Mohéli)', s: [40, 14, 6, 4], a: ['코모로', '앙주앙'] },
    SHA: { n: '샴바 왕국', e: 'Shambaa Kingdom (Usambara)', s: [50, 16, 18, 8], a: ['샴바', '우삼바라', '킴웨리'] },
    KRG: { n: '카라궤 왕국', e: 'Kingdom of Karagwe', s: [52, 16, 16, 8], a: ['카라궤', '루마니카'] },
    NYM: { n: '니암웨지 (우냐녬베)', e: 'Nyamwezi chiefdoms (Unyanyembe)', s: [46, 22, 24, 10], a: ['니암웨지', '수쿠마', '타보라'] },
    HEH: { n: '헤헤·상구', e: 'Hehe and Sangu chiefdoms', s: [46, 12, 26, 8], a: ['헤헤', '상구', '우헤헤'] },
    MAA: { n: '마사이족', e: 'Maasai', s: [50, 12, 30, 10], a: ['마사이'] },
    WNG: { n: '와가 왕국', e: 'Wanga Kingdom', s: [46, 12, 14, 6], a: ['와가', '나보깅고'] },
    BUG: { n: '부간다 왕국', e: 'Kingdom of Buganda', s: [58, 30, 38, 22], a: ['부간다', '무테사'] },
    BNY: { n: '부뇨로-키타라 왕국', e: 'Kingdom of Bunyoro-Kitara', s: [48, 22, 30, 16], a: ['부뇨로', '키타라'] },
    TOR: { n: '토로 왕국', e: 'Kingdom of Toro', s: [46, 14, 14, 6], a: ['토로'] },
    ANK: { n: '안콜레 왕국', e: 'Kingdom of Ankole (Nkore)', s: [50, 16, 18, 8], a: ['안콜레', '은코레'] },
    ACH: { n: '아촐리 족장국들', e: 'Acholi chiefdoms', s: [44, 8, 16, 4], a: ['아촐리', '랑고', '테소'] },
    RWD: { n: '르완다 왕국', e: 'Kingdom of Rwanda', s: [58, 18, 32, 12], a: ['르완다', '르와부기리'] },
    BRD: { n: '부룬디 왕국', e: 'Kingdom of Burundi', s: [54, 16, 26, 10], a: ['부룬디', '음와미'] },
    // ── 아프리카의 뿔 ──
    ETP: y53 ? { n: '에티오피아 (제후 시대)', e: 'Ethiopia (Zemene Mesafint)', s: [30, 22, 34, 18], a: ['에티오피아', '아비시니아', '곤다르'] }
      : { n: '에티오피아 제국', e: 'Ethiopian Empire (Tewodros II)', s: [40, 22, 42, 22], a: ['에티오피아', '아비시니아', '테워드로스'] },
    SHW: { n: '셰와 왕국', e: 'Kingdom of Shewa', s: [50, 20, 26, 12], a: ['셰와', '안코베르', y66 ? '메넬리크' : '하일레 멜레코트'] },
    JIM: { n: '짐마 왕국 (기베 오로모)', e: 'Kingdom of Jimma (Gibe Oromo states)', s: [46, 20, 22, 10], a: ['짐마', '오로모', '기베'] },
    KAF: { n: '카파 왕국', e: 'Kingdom of Kaffa', s: [50, 18, 20, 8], a: ['카파'] },
    HAR: { n: '하라르 에미르국', e: 'Emirate of Harar', s: [46, 22, 12, 10], a: ['하라르'] },
    AUS: { n: '아우사 술탄국 (아파르)', e: 'Sultanate of Aussa (Afar)', s: [46, 10, 16, 6], a: ['아우사', '아파르', '타주라'] },
    OGD: { n: '오가덴 소말리', e: 'Ogaden Somali clans', s: [42, 8, 18, 4], a: ['오가덴'] },
    ISQ: { n: '이사크 술탄국', e: 'Isaaq Sultanate', s: [44, 12, 16, 6], a: ['이사크', '베르베라'] },
    MAJ: { n: '마제르텐 술탄국', e: 'Majeerteen Sultanate', s: [46, 14, 14, 6], a: ['마제르텐', '보코르 오스만'] },
    HRB: { n: '히라브 이맘국', e: 'Hiraab Imamate', s: [42, 10, 14, 6], a: ['히라브', '호뱌'] },
    GEL: { n: '게레디 술탄국', e: 'Geledi Sultanate', s: [50, 20, 22, 10], a: ['게레디', '아프구예', '고브론'] },
    // ── 아라비아·페르시아 ──
    NJD: { n: '네지드 토후국', e: 'Emirate of Nejd (Second Saudi State)', s: y66 ? [36, 18, 28, 16] : [52, 18, 30, 18], a: ['제2차 사우디 국가', '사우드 가문', '리야드'] },
    JSH: { n: '자발 샴마르 토후국', e: 'Emirate of Jabal Shammar', s: [52, 12, 24, 10], a: ['자발 샴마르', '라시드 왕조', '하일'] },
    ASR: { n: '아시르 (아이드 왕조)', e: 'Asir (Al Aidh)', s: [44, 10, 20, 6], a: ['아시르'] },
    ZAY: { n: '예멘 자이드 이맘국', e: 'Zaydi Imamate of Yemen', s: [26, 16, 16, 8], a: ['예멘', '자이드', '사나'] },
    LAH: { n: '라헤즈 술탄국', e: 'Sultanate of Lahej', s: [46, 12, 10, 6], a: ['라헤즈', '압달리'] },
    KTH: { n: '카티리 술탄국 (하드라마우트)', e: 'Kathiri Sultanate (Hadhramaut)', s: [42, 16, 14, 6], a: ['카티리', '하드라마우트', '쿠아이티'] },
    MHR: { n: '마흐라 술탄국', e: 'Mahra Sultanate (Qishn and Socotra)', s: [44, 8, 8, 4], a: ['마흐라', '소코트라'] },
    OMZ: { n: '무스카트·잔지바르 술탄국', e: 'Sultanate of Muscat and Zanzibar', s: [52, 40, 30, 32], a: ['오만', '잔지바르', '사이드 빈 술탄'] },
    OMA: { n: '무스카트 오만 술탄국', e: 'Sultanate of Muscat and Oman', s: [42, 26, 22, 18], a: ['오만', '무스카트'] },
    ZAN: { n: '잔지바르 술탄국', e: 'Sultanate of Zanzibar', s: [50, 36, 20, 26], a: ['잔지바르', '마지드'] },
    TRU: { n: '휴전 해안 토후국', e: 'Trucial States', s: [46, 14, 10, 6], a: ['휴전 토후국', '아부다비', '샤르자'] },
    BAHR: { n: '바레인 (할리파 왕조)', e: 'Bahrain (Al Khalifa, with Qatar)', s: [46, 22, 10, 8], a: ['바레인', '카타르'] },
    KUW: { n: '쿠웨이트 셰이크국', e: 'Sheikhdom of Kuwait', s: [52, 20, 8, 6], a: ['쿠웨이트', '사바 가문'] },
    QAJ: { n: '카자르 페르시아', e: 'Qajar Persia', c: '#9c6fb6', s: [44, 40, 38, 36], a: ['페르시아', '이란', '카자르'] },
    // ── 중앙아시아·아프가니스탄 ──
    KHI: { n: '히바 칸국', e: 'Khanate of Khiva', s: [46, 22, 26, 14], a: ['히바', '호라즘'] },
    BUK: { n: '부하라 에미르국', e: 'Emirate of Bukhara', s: [50, 34, 32, 22], a: ['부하라', '망기트 왕조'] },
    KOK: { n: '코칸드 칸국', e: 'Khanate of Kokand', s: year < 1860 ? [40, 28, 28, 16] : [30, 24, 24, 12], a: ['코칸드', '페르가나'] },
    TKN: { n: '투르크멘 부족 (테케)', e: 'Turkmen tribes (Tekke, Yomut)', s: [44, 10, 26, 8], a: ['투르크멘', '테케', '메르브'] },
    BDK: { n: '바다흐샨 미르국', e: 'Mirdom of Badakhshan (Shughnan, Wakhan)', s: [40, 10, 12, 4], a: ['바다흐샨', '슈그난', '와한'] },
    AFE: { n: y66 ? '아프가니스탄 에미르국' : '아프가니스탄 에미르국 (카불)', e: 'Emirate of Afghanistan', s: y66 ? [30, 22, 34, 20] : [48, 22, 36, 22], a: ['아프가니스탄', '바락자이', y66 ? '셰르 알리' : '도스트 무함마드'] },
    KDH: { n: '칸다하르 공국', e: 'Principality of Kandahar', s: [40, 16, 20, 8], a: ['칸다하르', '칸다하르 사르다르'] },
    HRT: { n: '헤라트 공국', e: 'Principality of Herat', s: [38, 16, 16, 8], a: ['헤라트'] },
    KTG: { n: '카타간 (쿤두즈)', e: 'Kataghan (Kunduz)', s: [40, 12, 14, 6], a: ['카타간', '쿤두즈'] },
    MAI: { n: '마이마나 칸국', e: 'Khanate of Maimana', s: [42, 12, 14, 6], a: ['마이마나', '우즈베크 칸국'] },
    KFR: { n: '카피리스탄', e: 'Kafiristan', s: [50, 6, 14, 4], a: ['카피리스탄', '누리스탄'] },
    // ── 남·동남아시아 ──
    BHU: { n: '부탄', e: 'Bhutan', s: [48, 12, 12, 6], a: ['부탄', '드룩'] },
    KON: { n: '꼰바웅 왕조', e: 'Konbaung Burma', s: y53 ? [40, 26, 30, 18] : [50, 28, 30, 18], a: ['버마', '미얀마', y53 ? '아마라푸라' : '민돈'] },
    SIA: { n: '시암', e: 'Kingdom of Siam', c: '#c79a3e', s: [58, 36, 34, 30], a: ['시암', '태국', '라따나꼬신'] },
    NGU: { n: '응우옌 왕조 (대남)', e: 'Nguyễn Dynasty (Đại Nam)', s: y66 ? [40, 32, 30, 20] : [48, 34, 32, 22], a: ['대남', '베트남', '안남'] },
    CAM: { n: y66 ? '캄보디아 왕국 (프랑스 보호국)' : '캄보디아 왕국', e: 'Kingdom of Cambodia', s: [38, 16, 12, 8], a: ['캄보디아', '크메르', y66 ? '노로돔' : '앙두옹'] },
    ACE: { n: '아체 술탄국', e: 'Sultanate of Aceh', s: [50, 30, 30, 16], a: ['아체', '아쩨'] },
    BAT: { n: '바탁족', e: 'Batak lands (with Nias)', s: [46, 10, 16, 4], a: ['바탁', '시상아망아라자', '니아스'] },
    SIK: { n: y53 ? '시악 술탄국' : '시악 술탄국 (네덜란드 보호국)', e: 'Sultanate of Siak', s: [40, 20, 12, 8], a: ['시악', '델리'] },
    RLG: { n: '리아우-링가 술탄국', e: 'Riau-Lingga Sultanate', s: [42, 22, 8, 8], a: ['리아우', '링가'] },
    JMB: { n: '잠비 술탄국', e: 'Sultanate of Jambi', s: y53 ? [42, 18, 14, 6] : [34, 16, 16, 6], a: ['잠비', '타하 사이푸딘'] },
    BAL: { n: '발리 왕국들', e: 'Balinese kingdoms (Klungkung, Karangasem, Badung)', s: [46, 22, 20, 8], a: ['발리', '클룽쿵'] },
    LMB: { n: '롬복 (마타람 왕국)', e: 'Lombok (Mataram) and Sumbawa sultanates', s: [48, 20, 18, 8], a: ['롬복', '마타람', '비마'] },
    SNB: { n: '손바이 왕국 (티모르)', e: 'Sonbai and Timor-Flores native kingdoms', s: [40, 10, 10, 4], a: ['손바이', '티모르', '플로레스'] },
    PTK: { n: '폰티아낙 술탄국', e: 'Sultanate of Pontianak (with Sambas and the kongsis)', s: [42, 20, 12, 8], a: ['폰티아낙', '삼바스', '란팡 공사'] },
    BJR: { n: '반자르 술탄국', e: 'Sultanate of Banjar', s: [40, 24, 16, 8], a: ['반자르', '반자르마신'] },
    DYK: { n: '다야크족', e: 'Dayak peoples (Ngaju)', s: [46, 8, 14, 4], a: ['다야크', '응아주'] },
    KUT: { n: '쿠타이 술탄국', e: 'Sultanate of Kutai Kartanegara', s: [46, 18, 10, 6], a: ['쿠타이', '불룽안'] },
    BONE: { n: '보네 왕국', e: 'Kingdom of Bone (with Gowa)', s: [44, 22, 22, 10], a: ['보네', '고와', '부기스'] },
    BUT: { n: '부톤 술탄국', e: 'Sultanate of Buton', s: [48, 12, 8, 4], a: ['부톤', '볼리오'] },
    TERN: { n: '테르나테 술탄국', e: 'Sultanate of Ternate (with Tidore)', s: [44, 18, 10, 8], a: ['테르나테', '티도레', '방가이'] },
    TIDO: { n: '티도레 술탄국 (파푸아 연안)', e: 'Sultanate of Tidore claims (Raja Ampat, Bird\'s Head)', s: [42, 10, 8, 4], a: ['티도레', '라자암팟'] },
    SUL: { n: '술루 술탄국', e: 'Sultanate of Sulu', s: [48, 22, 22, 12], a: ['술루', '타우숙'] },
    MAG: { n: '마긴다나오 술탄국', e: 'Sultanate of Maguindanao (with Lanao)', s: [44, 16, 20, 8], a: ['마긴다나오', '라나오', '모로'] },
    IGO: { n: '코르디예라 이고로트족', e: 'Igorot peoples of the Cordillera', s: [48, 6, 12, 2], a: ['이고로트', '이푸가오'] },
    BRU: { n: '브루나이 술탄국', e: 'Sultanate of Brunei', s: [40, 14, 6, 6], a: ['브루나이'] },
    MLD: { n: '몰디브 술탄국', e: 'Sultanate of the Maldives', s: [48, 12, 4, 4], a: ['몰디브'] },
    // ── 태평양 ──
    FIJ: { n: '피지 (바우 왕국)', e: 'Fiji (Kingdom of Bau)', s: [40, 10, 14, 6], a: ['피지', '바우', '카코바우'] },
    TGA: { n: '통가 왕국', e: 'Kingdom of Tonga', s: [56, 10, 12, 6], a: ['통가', '투포우'] },
    SAM: { n: '사모아 (말리에토아)', e: 'Samoa (Malietoa chiefdoms)', s: [42, 8, 10, 4], a: ['사모아', '말리에토아'] },
    MEL: { n: '멜라네시아 부족 사회', e: 'Melanesian tribal societies', s: [40, 6, 10, 2], a: ['파푸아', '뉴기니', '솔로몬'] },
    MIC: { n: '미크로네시아 추장 사회', e: 'Micronesian chiefdoms', s: [44, 6, 4, 2], a: ['미크로네시아', '캐롤라인', '마셜'] },
    // ── 유럽 소국 ──
    ANDR: { n: '안도라 공국', e: 'Principality of Andorra', s: [60, 10, 2, 2], a: ['안도라'] },
    MNC: { n: '모나코 공국', e: 'Principality of Monaco', s: [52, 12, 2, 4], a: ['모나코', '그리말디'] },
    SMA: { n: '산마리노 공화국', e: 'Republic of San Marino', s: [62, 10, 2, 2], a: ['산마리노'] },
  };

  const paint = [];
  const add = (...rules) => paint.push(...rules);

  // ── 유럽 소국·분쟁 소지 ──
  if (year < 1861) add(['SAR', 'ITA']); // 사르데냐령 오솔라 등 템플릿 상자 밖에 남은 주
  add(['ANDR', 'AND'], ['MNC', 'MCO'], ['SMA', 'SMR'], ['PAP', 'VAT'], ['GCF', 'LIE'], ['OTT', 'CNM', 'CYN', 'BRT']);
  // ── 아메리카 ──
  if (year < 1860) add(['MSQ', A('HND', 'Gracias a Dios'), A('NIC', 'Caribbean Coast')], ['GBR', A('HND', 'Bay Islands')]);
  if (year < 1860) P.MSQ = { n: '모스키토 왕국', e: 'Mosquito Kingdom (British protectorate)', s: [40, 10, 8, 6], a: ['모스키토', '미스키토'] };
  add(['NGR', 'COL', 'PAN', 'BJN', 'SER']);
  add(['BOLV', A('BRA', 'Acre'), A('CHL', 'Antofagasta')], ['BRZ', 'BRA', 'BRI']);
  add(['PERU', A('CHL', 'Arica', 'Tarapacá'), 'PER'], ['BOLV', 'BOL']);
  add(['MAP', A('CHL', 'Araucanía'), A('ARG', 'Neuquén', 'Río Negro', 'La Pampa')]);
  add(['TEH', A('CHL', 'Aysén'), A('ARG', 'Chubut', 'Santa Cruz', 'Tierra del Fuego'), 'SPI']);
  if (year < 1862) add(['BAS', A('ARG', 'Buenos Aires')]);
  add(['ARC', 'ARG']);
  // ── 북아프리카·사하라·서아프리카 ──
  add(['MOR', 'MAR', 'SAH']);
  add(['TRZ', A('MRT', 'Trarza', 'Nouakchott', 'Inchiri', 'Nouadhibou')], ['BRK', A('MRT', 'Brakna', 'Gorgol', 'Guidimaka')], ['ADR', A('MRT', 'Adrar', 'Tiris')], ['TAG', 'MRT']);
  add(['TUK', A('GIN', 'Dinguiraye')]);
  add(['TUA', A('MLI', 'Tombouctou', 'Gao', 'Kidal'), A('NER', 'Tahoua', 'Tillabéri')], ['KND', A('MLI', 'Wassoulou')]);
  if (y53) add(['KRT', A('MLI', 'Kayes')]);
  if (y66) add(['TUK', 'MLI']);
  else add(...(y59 ? [['TUK', A('MLI', 'Kayes')]] : []), ['MSN', A('MLI', 'Mopti')], ['SEG', 'MLI']);
  add(['GBR', 'GMB', A('SLE', 'Western')], ['TMN', 'SLE']);
  add(['BTE', A('GIN', 'Kankan', 'Siguiri', 'Mandiana', 'Kouroussa', 'Kérouané', 'Faranah', 'Kissidougou', 'Guéckédou', 'Macenta', 'Nzérékoré', 'Yomou', 'Lola', 'Beyla')], ['FTJ', 'GIN']);
  add(['SOK', { adm0: 'BFA', box: [-1.5, 13.3, 2.5, 15.5] }], ['KONG', { adm0: 'BFA', box: [-5.6, 9.3, -2.8, 13.5] }], ['MOS', 'BFA']);
  add(['FRA', A('CIV', 'Sud-Comoé')], ['BAU', A('CIV', "N'zi-Comoé")], ['ASH', A('CIV', 'Zanzan', 'Comoé')],
    ['KONG', A('CIV', 'Savanes', 'Denguélé', 'Worodougou', 'Bafing', 'Vallée du Bandama')], ['BAU', 'CIV']);
  add(['GBR', A('GHA', 'Western', 'Central', 'Greater Accra', 'Eastern')], ['EWE', A('GHA', 'Volta'), A('TGO', 'Maritime', 'Plateaux', 'Centre')], ['ASH', 'GHA', 'TGO']);
  add(['BRG', A('BEN', 'Borgou', 'Alibori', 'Atakora', 'Donga')], ['PNV', A('BEN', 'Ouémé', 'Plateau')], ['DAH', 'BEN']);
  add(['DUA', A('CMR', 'Littoral', 'Southwest')], ['BAM', A('CMR', 'West', 'Northwest')]);
  add(['BOR', A('NGA', 'Borno', 'Yobe'), A('NER', 'Diffa'), A('TCD', 'Lac', 'Kanem', 'Bahr el Gazel'), A('CMR', 'Far North')]);
  add(['YOR', A('NGA', 'Oyo', 'Osun', 'Ogun', 'Ekiti', 'Ondo', 'Lagos')], ['BNN', A('NGA', 'Edo', 'Delta')],
    ['BON', A('NGA', 'Rivers', 'Bayelsa', 'Akwa', 'Cross')], ['ARO', A('NGA', 'Anambra', 'Enugu', 'Ebonyi', 'Imo', 'Abia')], ['SOK', 'NGA', A('CMR', 'North', 'Adamawa')]);
  add(['AIR', A('NER', 'Agadez')], ['DMG', A('NER', 'Zinder')], ['MRD', A('NER', 'Maradi')], ['ZRM', 'NER']);
  add(['TBU', A('TCD', 'Tibesti', 'Borkou')], ['WAD', A('TCD', 'Ouaddaï', 'Wadi Fira', 'Sila', 'Batha', 'Salamat', 'Guéra', 'Ennedi'), A('CAF', 'Vakaga', 'Bamingui', 'Haute-Kotto')], ['BAG', 'TCD']);
  // ── 중앙아프리카 ──
  add(['SPA', A('GNQ', 'Bioko', 'Annobón')], ['FRA', A('GAB', 'Estuaire')],
    ['FNG', 'CMR', 'GNQ', A('GAB', 'Woleu-Ntem', 'Ogooué-Ivindo')], ['ORU', A('GAB', 'Ogooué-Maritime', 'Moyen-Ogooué')], ['LOA', A('GAB', 'Ngounié', 'Nyanga'), A('COG', 'Kouilou', 'Pointe-Noire', 'Niari', 'Bouenza', 'Lékoumou')],
    ['TEK', 'GAB', 'COG', A('COD', 'Kinshasa')]);
  add(['KGO', A('COD', 'Kongo Central')], ['LUN', A('COD', 'Bandundu'), A('ZMB', 'Northwestern')], ['KUB', A('COD', 'Kasaï-Occidental')], ['LUB', A('COD', 'Kasaï-Oriental', 'Katanga', 'Maniema')],
    ['AZD', A('COD', 'Orientale'), A('CAF', 'Mbomou'), A('SDS', 'Western Equatoria', 'Western Bahr')], ['RWD', A('COD', 'Kivu')], ['MGO', 'COD'], ['GBY', 'CAF']);
  // ── 수단·아프리카의 뿔 ──
  add(['DAR', A('SDN', 'Darfur', 'Soudan')], ['OTT', 'SDN', A('ETH', 'Benishangul'), A('ERI', 'Northern Red Sea', 'Gash-Barka')]);
  add(['SHL', A('SDS', 'Upper Nile')], ['DNK', 'SDS', A('ETH', 'Gambela')]);
  add(['AUS', A('ETH', 'Afar'), A('ERI', 'Southern Red Sea'), 'DJI'], ['OGD', A('ETH', 'Somali'), A('KEN', 'North Eastern')], ['HAR', A('ETH', 'Harari', 'Dire Dawa')],
    ['KAF', A('ETH', 'Southern Nations')], ['JIM', A('ETH', 'Oromia')]);
  if (!y59) add(['SHW', A('ETH', 'Addis Ababa')]);
  add(['ETP', 'ETH', 'ERI']);
  add(['ISQ', 'SOL'], ['MAJ', A('SOM', 'Bari', 'Nugal')], ['HRB', A('SOM', 'Mudug', 'Galguduud', 'Hiran')], ['GEL', 'SOM']);
  // ── 동아프리카 ──
  const ZZ = y53 ? 'OMZ' : 'ZAN';
  add([ZZ, A('KEN', 'Coast'), A('TZA', 'Pwani', 'Dar es Salaam', 'Unguja', 'Pemba', 'Mjini', 'Lindi', 'Mtwara')]);
  add(['WNG', A('KEN', 'Western', 'Nyanza')], ['MAA', 'KEN', A('TZA', 'Arusha', 'Manyara', 'Kilimanjaro')]);
  add(['SHA', A('TZA', 'Tanga')], ['KRG', A('TZA', 'Kagera')], ['HEH', A('TZA', 'Iringa', 'Mbeya', 'Njombe', 'Morogoro')], ['NGN', A('TZA', 'Ruvuma'), A('MWI', 'Chitipa', 'Rumphi', 'Nkhata Bay', 'Mzimba', 'Likoma')], ['NYM', 'TZA']);
  add(['TOR', A('UGA', 'Kabarole', 'Kasese', 'Bundibugyo', 'Ntoroko', 'Kyenjojo', 'Kamwenge', 'Kyegegwa')],
    ['ANK', A('UGA', 'Ntungamo', 'Isingiro', 'Mbarara', 'Ibanda', 'Buhweju', 'Sheema', 'Mitooma', 'Bushenyi', 'Rubirizi', 'Rukungiri', 'Kanungu')],
    ['BNY', A('UGA', 'Hoima', 'Masindi', 'Buliisa', 'Kibaale', 'Kiryandongo')], ['RWD', A('UGA', 'Kabale', 'Kisoro'), 'RWA'],
    ['ACH', { adm0: 'UGA', box: [30.8, 1.45, 35.1, 4.3] }, { adm0: 'UGA', box: [33.85, 0.35, 35.1, 1.45] }, A('UGA', 'Pallisa', 'Kibuku', 'Ngora', 'Serere')], ['BUG', 'UGA'], ['BRD', 'BDI']);
  // ── 남부 아프리카 ──
  add(['BEM', A('ZMB', 'Northern', 'Muchinga')], ['KZB', A('ZMB', 'Luapula', 'Copperbelt')], ['MRV', A('ZMB', 'Eastern'), 'MWI'], ['LOZ', 'ZMB', A('NAM', 'Zambezi')]);
  add(['MUT', A('ZWE', 'Mashonaland Central')], ['GAZ', A('ZWE', 'Manicaland', 'Masvingo')], ['NDB', 'ZWE']);
  add(['TAW', A('BWA', 'North-West', 'Ghanzi')], ['NGW', A('BWA', 'Central', 'North-East', 'Francistown', 'Selebi', 'Sowa')], ['KWE', 'BWA']);
  add(['OVA', A('NAM', 'Omusati', 'Ohangwena', 'Oshana', 'Oshikoto', 'Kavango')], ['ORL', A('NAM', 'Karas', 'Hardap', 'Khomas')], ['HER', 'NAM']);
  add(['ZAR', 'ZAF'], ['BSO', 'LSO'], ['SWZI', 'SWZ']);
  add(['SKL', A('MDG', 'Menabe', 'Melaky', 'Atsimo-Andrefana', 'Androy', 'Ihorombe')], ['MER', 'MDG'], ['COMS', 'COM'], ['GBR', 'MUS', 'SYC']);
  // ── 아라비아·페르시아 ──
  add(['NJD', A('SAU', 'Riyadh', 'Qassim', 'Eastern'), A('OMN', 'Buraimi')], ['JSH', A('SAU', "Ha'il", 'Jowf', 'Northern Borders')], ['ASR', A('SAU', 'Asir', 'Najran')], ['OTT', 'SAU', A('YEM', 'Hudaydah')]);
  add(['GBR', A('YEM', 'Adan')], ['LAH', A('YEM', 'Lahij', 'Abyan', 'Dali')], ['KTH', A('YEM', 'Hadhramaut', 'Shabwah')], ['MHR', A('YEM', 'Mahrah')], ['ZAY', 'YEM']);
  add([y53 ? 'OMZ' : 'OMA', 'OMN'], ['TRU', 'ARE'], ['BAHR', 'BHR', 'QAT'], ['KUW', 'KWT'], ['QAJ', 'IRN']);
  // ── 중앙아시아 ──
  add(['KHI', A('UZB', 'Karakalpakstan', 'Xorazm'), A('TKM', 'Daşoguz')], ['KOK', A('UZB', 'Fergana', 'Namangan', 'Andijan', 'Tashkent', 'Sirdaryo'), A('TJK', 'Khujand', 'districts'), 'KGZ'],
    ['BDK', A('TJK', 'Gorno')], ['BUK', 'UZB', 'TJK', A('TKM', 'Lebap')], ['TKN', 'TKM']);
  // ── 아프가니스탄 ──
  add(['KFR', A('AFG', 'Nuristan')], ['MAI', A('AFG', ...(y53 ? ['Faryab', 'Jowzjan', 'Sar-e Pol'] : ['Faryab']))]);
  if (y53) add(['BDK', A('AFG', 'Badakhshan')], ['KTG', A('AFG', 'Kunduz', 'Takhar', 'Baghlan')], ['KDH', A('AFG', 'Kandahar', 'Helmand', 'Zabul', 'Urozgan', 'Nimruz')]);
  if (!y66) add(['HRT', A('AFG', 'Herat', 'Badghis', 'Farah', 'Ghōr')]);
  add(['AFE', 'AFG']);
  // ── 남·동남아시아 ──
  add(['BHU', 'BTN'], ['BRU', 'BRN'], ['MLD', 'MDV']);
  add(['GBR', A('MMR', 'Rakhine', 'Tanintharyi', 'Mon', 'Kayin', 'Ayeyarwady', 'Yangon', 'Bago')], ['KON', 'MMR']);
  add(['SIA', 'THA', 'LAO', A('KHM', 'Battambang', 'Siem Reap', 'Banteay', 'Oddar', 'Pailin', 'Preah Vihear', 'Stung Treng', 'Ratanakiri')], ['CAM', 'KHM'], ['NGU', 'VNM']);
  // 네덜란드령 동인도: 실제 통치(자와·마두라, 서·남수마트라, 방카, 암본·반다, 미나하사·고론탈로), 나머지는 토후국·부족
  const I = (...n) => A('IDN', ...n);
  add(['ACE', I('Aceh')], ['BAT', I('North Sumatra')], ['RLG', I('Riau Islands')], ['SIK', I('Riau')], ['JMB', I('Jambi')],
    ['NET', I('West Sumatra', 'South Sumatra', 'Bengkulu', 'Lampung', 'Bangka', 'Banten', 'Jakarta', 'Java', 'Yogyakarta', 'North Sulawesi', 'Gorontalo'), { adm0: 'IDN', names: ['Maluku'], box: [125, -9, 135, -2] }],
    ['BAL', I('Bali')], ['LMB', I('West Nusa Tenggara')], ['SNB', I('East Nusa Tenggara')], ['PTK', I('West Kalimantan')], ['DYK', I('Central Kalimantan')],
    [y66 ? 'NET' : 'BJR', I('South Kalimantan')], ['KUT', I('East Kalimantan')], ['BONE', I('South Sulawesi', 'West Sulawesi')], ['BUT', I('Southeast Sulawesi')],
    ['TERN', I('North Maluku', 'Central Sulawesi')], ['TIDO', I('West Papua')], ['MEL', 'IDN']);
  // 스페인령 필리핀: 루손·비사야·민다나오 북·동부 연안. 남부는 술루·마긴다나오, 코르디예라 산지는 이고로트
  const H = (...n) => A('PHL', ...n);
  add(['SUL', H('Sulu', 'Tawi', 'Palawan', 'Puerto Princesa')], ['IGO', H('Ifugao', 'Mountain', 'Kalinga', 'Apayao')],
    ['SPA', H('Zamboanga Peninsula', 'Basilan')], ['MAG', H('Maguindanao', 'Cotabato', 'Sultan Kudarat', 'Sarangani', 'General Santos', 'Davao del Sur', 'Lanao', 'Zamboanga', 'Bukidnon')], ['SPA', 'PHL']);
  add(['SPA', 'SCR', 'PGA']);
  // ── 태평양 ──
  add(['FIJ', 'FJI'], ['TGA', 'TON'], ['SAM', 'WSM'], ['MEL', 'PNG', 'SLB', 'VUT'], ['MIC', 'FSM', 'PLW', 'MHL', 'KIR', 'NRU', 'TUV']);
  // ── 카리브해 영국령 ──
  add(['GBR', 'ATG', 'KNA', 'DMA', 'LCA', 'VCT', 'GRD']);

  // 그 해에 존재하지 않는 나라는 목록에서 뺀다
  const used = new Set(paint.map((r) => r[0]));
  for (const id of Object.keys(P)) if (!used.has(id)) delete P[id];
  return { polities: P, paint };
}
