// 플레이어 자리에 봇을 앉혀 플레이어 전용 경로(골드 표시, 알림, 난이도 보정)를 검증한다.  node tools/player_test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'js');
const src = ['data', 'map', 'sim', 'ai'].map(f => fs.readFileSync(path.join(dir, f + '.js'), 'utf8')).join('\n');
vm.runInThisContext(src + '\nglobalThis.__api={newGame,tick,aiInit,get G(){return G},HERO_IDS};');
const api = globalThis.__api;
let fail = 0;
for (let d = 0; d < 3; d++) for (const hero of ['kael', 'ignis']) {
  api.newGame({ heroId: hero, diff: d, seed: 500 + d * 31 });
  api.aiInit(api.G.player, 'mid');
  const kinds = {};
  while (!api.G.over && api.G.t < 3600) { api.tick(1 / 30); for (const e of api.G.events) kinds[e.k] = (kinds[e.k] || 0) + 1; api.G.events.length = 0; }
  const G = api.G, p = G.player;
  console.log(`diff ${d} ${hero}: ${G.over ? (G.over.winner === 0 ? 'WIN' : 'LOSS') : 'NO RESULT'} ${(G.t / 60).toFixed(1)}m kills ${G.kills} | player L${p.level} ${p.kills}/${p.deaths}/${p.assists} items ${p.items.length} | events ${JSON.stringify(kinds)}`);
  if (!G.over) fail++;
}
process.exit(fail ? 1 : 0);
