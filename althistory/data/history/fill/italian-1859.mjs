// 1859년 4월: 프랑스·스페인 원정군이 다낭(투란, 1858.9~1860.3)과 사이공(1859.2)을 점령, 러시아는 이식쿨 키르기스를 복속(1855).
import { w19fill } from './_w19fill.mjs';
const base = w19fill({ year: 1859 });
export default {
  polities: base.polities,
  paint: [
    ['FRA', { adm0: 'VNM', names: ['Ho Chi Minh', 'Da Nang'] }],
    ['RUS', { adm0: 'KGZ', names: ['Issyk-Kul'] }],
    ...base.paint,
  ],
};
