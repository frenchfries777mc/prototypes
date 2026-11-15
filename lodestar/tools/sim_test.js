// 헤드리스 검증: 봇 10명 경기를 빠르게 돌려 예외와 경기 길이를 본다.  node tools/sim_test.js [경기 수]
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'js');
const src = ['data', 'map', 'sim', 'ai'].map(f => fs.readFileSync(path.join(dir, f + '.js'), 'utf8')).join('\n');
vm.runInThisContext(src + '\nglobalThis.__api={newGame,tick,get G(){return G},MAP,HEROES};');
const api = globalThis.__api;
const N = +process.argv[2] || 3;
let fail = 0;
for (let g = 0; g < N; g++) {
  api.newGame({ noPlayer: true, seed: 1000 + g * 77 });
  const t0 = Date.now(); let maxU = 0;
  while (!api.G.over && api.G.t < 60 * 60) { api.tick(1 / 30); api.G.events.length = 0; maxU = Math.max(maxU, api.G.units.length); }
  const G = api.G;
  const tw = [0, 0]; G.towers.forEach(t => tw[t.team]++);
  console.log(`game ${g}: ${G.over ? 'winner ' + G.over.winner : 'NO RESULT'} at ${(G.t / 60).toFixed(1)}m, kills ${G.kills}, towers left ${tw}, maxUnits ${maxU}, ${(Date.now() - t0)}ms`);
  console.log('  ' + G.heroes.map(h => `${h.team}${h.role}:${h.defId} L${h.level} ${h.kills}/${h.deaths}/${h.assists} cs${h.cs} g${Math.round(h.earned)}`).join(' | '));
  if (!G.over) fail++;
  for (const u of G.units) if (!isFinite(u.x) || !isFinite(u.hp)) { console.log('NaN unit', u.type); fail++; break; }
}
process.exit(fail ? 1 : 0);
