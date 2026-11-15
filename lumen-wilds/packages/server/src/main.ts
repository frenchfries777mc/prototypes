import { fileURLToPath } from 'node:url';
import { FileStore } from './store';
import { startServer } from './server';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const port = Number(process.env.PORT ?? 8080);
const seed = Number(process.env.WORLD_SEED ?? 20261115) >>> 0;

const server = await startServer({
  port, seed, log: true,
  store: new FileStore(process.env.DATA_FILE ?? here('../data/players.json')),
  staticDir: here('../../client/dist'),
});
console.log(`[lumen-wilds] listening on :${server.port} (seed ${seed})`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { void server.close().then(() => process.exit(0)); });
}
