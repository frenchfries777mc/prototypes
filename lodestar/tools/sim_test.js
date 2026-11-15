// 헤드리스 검증: 봇 10명 경기를 빠르게 돌려 예외와 경기 길이를 본다.  node tools/sim_test.js [경기 수]
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'js');
const src = ['data', 'map', 'sim', 'ai'].map(f => fs.readFileSync(path.join(dir, f + '.js'), 'utf8')).join('\n');
vm.runInThisContext(src + '\nglobalThis.__api={newGame,tick,get G(){return G},MAP,HEROES};');
const api = globalThis.__api;
const N = +process.argv[2] || 3;
let fail = 0;
for (let g = 0; g < N; g++) {
  api.newGame({ noPlayer: true, seed: (+process.env.SEED0 || 1000) + g * 77 });
  const t0 = Date.now(); const ev = {};
  while (!api.G.over && api.G.t < 60 * 30) { api.tick(1 / 30); for (const e of api.G.events) ev[e.k] = (ev[e.k] || 0) + 1; api.G.events.length = 0; }
  const G = api.G;
  console.log(`game ${g}: ${G.over ? 'winner ' + G.over.winner : 'NO RESULT'} at ${(G.t / 60).toFixed(1)}m, score ${G.score}, kills ${G.kills}, pickups ${ev.pickup || 0} throws ${ev.throw || 0} drops ${ev.drop || 0} packs ${ev.pack || 0}${G.overtime ? ' OT' : ''}, ${Date.now() - t0}ms`);
  console.log('  ' + G.heroes.map(h => `${h.team}${h.role}:${h.defId} ${h.kills}/${h.deaths}/${h.assists} sc${h.scores}`).join(' | '));
  if (!G.over) fail++;
  for (const u of G.units) if (!isFinite(u.x) || !isFinite(u.hp)) { console.log('NaN unit'); fail++; break; }
}
process.exit(fail ? 1 : 0);
