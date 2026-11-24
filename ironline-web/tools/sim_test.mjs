// 봇끼리 한 판을 헤드리스로 돌려 불변식(NaN·맵 이탈·점령 규칙·경기 종료)을 검사한다.  node tools/sim_test.mjs [팀당 인원] [시드] [사람 슬롯 시험 0|1]
import { Sim, TICK } from '../src/sim.js';
import { HALF_X, HALF_Z } from '../src/world.js';
const per = +process.argv[2] || 16, seed = +process.argv[3] || 1234, human = process.argv[4] === '1';
let fails = 0;
const check = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
let t0 = performance.now();
const sim = new Sim(seed, per);
console.log(`월드+유닛 생성 ${(performance.now() - t0).toFixed(0)} ms, 상자 ${sim.world.boxes.length}개, 집 ${sim.world.houses.length}채`);
if (human) { sim.claim(0, 1); check(sim.units[0].alive, '사람 슬롯은 claim 즉시 투입된다(시작하자마자 처치당함 화면 없음)'); check(sim.units[0].deaths === 0, '첫 투입 전에는 deaths = 0'); }
let kills = 0, shots = 0, caps = 0, bad = false, worst = 0, total = 0, ticks = 0, spawnsLate = 0;
const ownedHist = new Set();
while (sim.winner < 0 && sim.time < 600) {
  if (human) { const u = sim.units[0]; u.moveY = 1; u.fire = (ticks % 20) < 5; u.yaw += 0.01; }
  const a = performance.now(); sim.step(TICK); const dt = performance.now() - a; total += dt; worst = Math.max(worst, dt); ticks++;
  for (const e of sim.events) { if (e.t === 'kill') kills++; else if (e.t === 'shot') shots++; else if (e.t === 'cap') caps++; }
  sim.events.length = 0;
  for (const u of sim.units) {
    if (!u.alive) continue;
    if (![u.x, u.y, u.z, u.hp].every(Number.isFinite)) bad = true;
    if (Math.abs(u.x) > HALF_X + 8 || Math.abs(u.z) > HALF_Z + 8) bad = true;
  }
  ownedHist.add(sim.owned(0) + ':' + sim.owned(1));
}
console.log(`경기 ${sim.time.toFixed(0)}초 종료: 승자 ${sim.winner} (${sim.winReason}), 병력 ${sim.tickets.join(' / ')}, 거점 ${sim.pts.map((p) => p.owner).join(',')}`);
console.log(`킬 ${kills}, 총성 ${shots}, 점령 변화 ${caps}, 틱당 평균 ${(total / ticks).toFixed(2)} ms, 최악 ${worst.toFixed(2)} ms`);
check(!bad, '값이 NaN 이거나 맵을 벗어난 유닛이 없다');
check(kills > 20, '교전이 실제로 일어난다 (킬 ' + kills + ')');
check(caps >= 2, '점령이 진행된다 (변화 ' + caps + ')');
check(sim.winner >= 0, '경기가 끝난다');
check(worst < 40, '틱 비용이 30Hz 예산(33ms) 안이다');
console.log(fails ? `\n${fails}개 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);
