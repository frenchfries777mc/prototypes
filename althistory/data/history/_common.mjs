// 시나리오 작성용 공용 도우미. (파일 이름이 _ 로 시작하면 시나리오로 취급하지 않는다)
// 상자는 [경도최소, 위도최소, 경도최대, 위도최대] 이며 주의 "중심점"이 상자 안에 있는지로 판정한다.

/** 현대 주 이름은 data/raw/admin1.geojson 의 name_en. adm0 는 Natural Earth 3글자 코드. */
export const BOX = {
  FRANCE: [-5.3, 41.3, 9.7, 51.2],
  IBERIA: [-9.6, 35.9, 4.5, 43.9],
  ENG_WALES: [-6, 49.8, 2, 55.05],
  SCOTLAND: [-8, 55.1, -0.5, 61],
  N_IRELAND: [-8.3, 54.0, -5.4, 55.3],
  SICILY: [12, 36.5, 15.7, 38.4],
  SARDINIA: [8, 38.8, 9.9, 41.3],
  CORSICA: [8.4, 41.3, 9.6, 43.1],
  CRETE: [23.5, 34.8, 26.4, 35.7],
  PENINSULAR_ITALY: [6, 36.5, 19, 44.3],
  N_ITALY: [6, 43.8, 14, 47.3],
  S_ITALY: [13.4, 36.5, 18.6, 41.9],
  CENTRAL_ITALY: [11.2, 41.3, 14, 44.4],
  ANATOLIA: [26, 36, 44.8, 42],
  W_ANATOLIA: [26, 36, 31, 42],
  MANCHURIA: [118, 41, 135, 50],
  CHINA_PROPER: [98, 21, 123, 41],
  CHINA_COAST_NORTH: [112, 30, 123, 41],
  TRANSYLVANIA: [20, 45, 25.5, 48],
  SILESIA: [15, 50, 19, 51.5],
  POSEN_POMERANIA: [14, 50.1, 20, 54.9],
  GALICIA: [19, 48.5, 26, 50.5],
  ALSACE_LORRAINE: [5.5, 47.4, 8.3, 49.6],
  SAVOY_NICE: [5.8, 43.4, 7.7, 46.3],
  GASCONY: [-1.8, 43, 1.3, 45.7],
  MESOPOTAMIA: [38, 29, 49, 38],
  NAFRICA_COAST: [-2, 33.5, 9, 37.5],
  TRIPOLITANIA: [8, 29, 20, 34],
  CYRENAICA: [20, 29, 26, 33.5],
  LATAM_SPAIN: null,
};

/** 식민지 목록(현대 국가 코드). 시대에 맞게 조합해서 쓴다. */
export const COL = {
  BRIT_AFRICA: ['EGY', 'SDN', 'SDS', 'UGA', 'KEN', 'ZMB', 'ZWE', 'MWI', 'BWA', 'ZAF', 'LSO', 'SWZ', 'NGA', 'GHA', 'SLE', 'GMB', 'SOL'],
  FRENCH_AFRICA: ['DZA', 'TUN', 'SEN', 'MLI', 'NER', 'TCD', 'MRT', 'GIN', 'CIV', 'BFA', 'BEN', 'GAB', 'COG', 'CAF', 'DJI', 'MDG'],
  FRENCH_MANDATES: ['TGO', 'CMR'],
  GERMAN_COLONIES: ['NAM', 'TZA', 'CMR', 'TGO', 'RWA', 'BDI'],
  BELGIAN: ['COD', 'RWA', 'BDI'],
  PORTUGUESE: ['AGO', 'MOZ', 'GNB', 'CPV', 'STP', 'TLS'],
  ITALIAN: ['LBY', 'ERI', 'SOM'],
  SPANISH_AFRICA: ['GNQ', 'SAH'],
  BRIT_ASIA: ['IND', 'PAK', 'BGD', 'LKA', 'MMR', 'MYS', 'SGP', 'BRN'],
  BRIT_GULF: ['KWT', 'QAT', 'BHR', 'ARE', 'OMN'],
  BRIT_DOMINIONS: ['CAN', 'AUS', 'NZL', 'IRL'],
  BRIT_AMERICAS: ['BLZ', 'GUY', 'JAM', 'BHS', 'TTO', 'BRB', 'GRD', 'VCT', 'LCA', 'DMA', 'ATG', 'KNA'],
  FRENCH_INDOCHINA: ['VNM', 'LAO', 'KHM'],
  DUTCH: ['IDN', 'SUR'],
  OTTOMAN_ME: ['TUR', 'SYR', 'LBN', 'ISR', 'PSX', 'JOR', 'IRQ'],
  RUSSIA_CENTRAL_ASIA: ['KAZ', 'UZB', 'TKM', 'KGZ', 'TJK'],
  RUSSIA_CAUCASUS: ['GEO', 'ARM', 'AZE'],
  RUSSIA_WEST: ['FIN', 'EST', 'LVA', 'LTU', 'BLR', 'UKR', 'MDA'],
  A_H_CORE: ['AUT', 'CZE', 'HUN', 'SVK', 'SVN', 'HRV', 'BIH'],
  BALKANS: ['SRB', 'MNE', 'ALB', 'MKD', 'BGR', 'GRC', 'ROU', 'KOS'],
};

/** 도시 좌표 주변의 작은 상자 선택자(군대 위치 지정용). */
export const at = (lon, lat, r = 0.6) => ({ box: [lon - r, lat - r, lon + r, lat + r] });
