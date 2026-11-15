import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { DT, decodeClient } from '@lw/shared';
import { Game, type Conn } from './game';
import type { Store } from './store';

export interface ServerOptions {
  port: number;
  seed: number;
  store: Store;
  /** 빌드된 클라이언트 폴더. 있으면 같은 포트에서 정적 파일로 제공한다. */
  staticDir?: string;
  log?: boolean;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const MAX_MSGS_PER_SEC = 120;
const MAX_CATCHUP_TICKS = 5;

export interface RunningServer {
  game: Game;
  port: number;
  close(): Promise<void>;
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const game = new Game(opts.seed, opts.store);
  const root = opts.staticDir ? resolve(opts.staticDir) : undefined;

  const http: Server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!;
    if (path === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ players: game.playerCount, mobs: game.mobCount, tick: game.tick }));
      return;
    }
    if (root && existsSync(root)) {
      let file = resolve(join(root, normalize(decodeURIComponent(path))));
      if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; } // 경로 탈출 차단
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404).end('not found');
  });

  // 정상적인 클라이언트 메시지는 수십 바이트다. 큰 페이로드는 받지도 않는다.
  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 512 });
  wss.on('connection', (ws: WebSocket) => {
    const conn: Conn = {
      send: (data) => { if (ws.readyState === ws.OPEN) ws.send(data, { binary: true }); },
      close: () => ws.close(),
      buffered: () => ws.bufferedAmount,
    };
    let windowStart = Date.now(), count = 0;
    ws.on('message', (data, isBinary) => {
      const now = Date.now();
      if (now - windowStart > 1000) { windowStart = now; count = 0; }
      if (++count > MAX_MSGS_PER_SEC || !isBinary) { ws.close(1008); return; }
      try {
        const buf = data as Buffer;
        game.onMessage(conn, decodeClient(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)));
      } catch {
        ws.close(1008); // 해석할 수 없는 메시지를 보낸 연결은 끊는다
      }
    });
    ws.on('close', () => game.leave(conn));
    ws.on('error', () => ws.close());
  });

  // 고정 시간 간격 루프. 타이머가 밀리면 따라잡되, 한 번에 몰아 돌리는 틱 수는 제한한다.
  let last = performance.now(), acc = 0, worst = 0, total = 0, ticks = 0;
  const loop = setInterval(() => {
    const now = performance.now();
    acc += (now - last) / 1000;
    last = now;
    if (acc > DT * MAX_CATCHUP_TICKS) acc = DT * MAX_CATCHUP_TICKS;
    while (acc >= DT) {
      const t0 = performance.now();
      game.step();
      const cost = performance.now() - t0;
      worst = Math.max(worst, cost); total += cost; ticks++;
      acc -= DT;
    }
  }, 5);
  const housekeeping = setInterval(() => {
    game.saveAll();
    opts.store.flush();
    if (opts.log && ticks) {
      console.log(`[stats] players=${game.playerCount} mobs=${game.mobCount} tick avg=${(total / ticks).toFixed(2)}ms max=${worst.toFixed(2)}ms`);
    }
    worst = 0; total = 0; ticks = 0;
  }, 10_000);

  return new Promise((ok) => {
    http.listen(opts.port, () => {
      const addr = http.address();
      const port = typeof addr === 'object' && addr ? addr.port : opts.port;
      ok({
        game, port,
        close: () => new Promise<void>((done) => {
          clearInterval(loop); clearInterval(housekeeping);
          game.saveAll(); opts.store.flush();
          for (const c of wss.clients) c.terminate();
          wss.close(() => http.close(() => done()));
        }),
      });
    });
  });
}
