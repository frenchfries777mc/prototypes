/**
 * 부하 시험용 봇. 실제 프로토콜로 접속해 돌아다니며 공격한다.
 *   npm run bots -- 200 ws://localhost:8080/ws 60
 */
import WebSocket from 'ws';
import { C, DIR_NONE, S, TICK_RATE, decodeServer, encodeClient } from '@lw/shared';

const count = Number(process.argv[2] ?? 50);
const url = process.argv[3] ?? 'ws://localhost:8080/ws';
const seconds = Number(process.argv[4] ?? 30);

let connected = 0, snapshots = 0, bytes = 0, entitiesSeen = 0;

for (let i = 0; i < count; i++) {
  const ws = new WebSocket(url);
  ws.binaryType = 'nodebuffer';
  let seq = 0, dir = DIR_NONE, timer: NodeJS.Timeout | undefined;
  ws.on('open', () => {
    connected++;
    ws.send(encodeClient({ t: C.Join, name: `봇${i}`, token: '' }));
    timer = setInterval(() => {
      if (Math.random() < 0.05) dir = Math.random() < 0.2 ? DIR_NONE : Math.floor(Math.random() * 8);
      ws.send(encodeClient({ t: C.Input, seq: ++seq, dir }));
      if (Math.random() < 0.05) ws.send(encodeClient({ t: C.Attack, angle: Math.random() * Math.PI * 2 }));
    }, 1000 / TICK_RATE);
  });
  ws.on('message', (data: Buffer) => {
    bytes += data.byteLength;
    const m = decodeServer(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    if (m.t === S.Snapshot) { snapshots++; entitiesSeen += m.updates.length; }
  });
  ws.on('close', () => { connected--; clearInterval(timer); });
  ws.on('error', () => {});
}

setInterval(() => {
  console.log(`[bots] connected=${connected}/${count} snapshots/s=${snapshots} avgUpdates=${snapshots ? (entitiesSeen / snapshots).toFixed(1) : 0} down=${(bytes / 1024).toFixed(0)}KB/s`);
  snapshots = 0; bytes = 0; entitiesSeen = 0;
}, 1000);
setTimeout(() => process.exit(0), seconds * 1000);
