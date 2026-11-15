import { decodeServer, encodeClient, type ClientMsg, type ServerMsg } from '@lw/shared';

export class Net {
  private ws?: WebSocket;
  onMessage: (m: ServerMsg) => void = () => {};
  onClose: () => void = () => {};

  connect(): Promise<void> {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    return new Promise((ok, fail) => {
      ws.onopen = () => ok();
      ws.onerror = () => fail(new Error('서버에 연결할 수 없습니다.'));
      ws.onclose = () => this.onClose();
      ws.onmessage = (ev) => {
        if (!(ev.data instanceof ArrayBuffer)) return;
        let msg: ServerMsg;
        try { msg = decodeServer(new Uint8Array(ev.data)); } catch (e) { console.error('bad server message', e); return; }
        this.onMessage(msg);
      };
    });
  }

  send(m: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeClient(m));
  }
}
