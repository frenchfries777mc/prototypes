// 1866년 4월: 프랑스령 코친차이나 동부 3성(1862), 영국령 라고스(1861), 러시아의 타슈켄트 점령(1865)과 추이·탈라스 계곡,
// 막시밀리안의 멕시코 제국과 치와와로 밀려난 후아레스 공화국 정부.
import { w19fill } from './_w19fill.mjs';
const base = w19fill({ year: 1866 });
export default {
  polities: {
    ...base.polities,
    MXE: { n: '멕시코 제국', e: 'Second Mexican Empire', s: [30, 38, 34, 30], a: ['멕시코', '막시밀리안'] },
    MXR: { n: '멕시코 공화국 (후아레스)', e: 'Mexican Republic (Juárez)', s: [44, 16, 24, 20], a: ['후아레스', '멕시코 공화국'] },
  },
  paint: [
    ['FRA', { adm0: 'VNM', box: [105.95, 10.25, 107.7, 12.0] }],
    ['GBR', { adm0: 'NGA', names: ['Lagos'] }],
    ['RUS', { adm0: 'UZB', names: ['Tashkent'] }, { adm0: 'KGZ', names: ['Issyk-Kul', 'Chuy', 'Bishkek', 'Talas'] }],
    ['MXR', { adm0: 'MEX', names: ['Chihuahua'] }],
    ['MXE', 'MEX'],
    ...base.paint,
  ],
};
