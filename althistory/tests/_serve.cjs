// 시험용 작은 정적 서버: althist.html을 file:// 대신 http://127.0.0.1:포트 로 연다(헤드리스에서 file:// 의 localStorage는 새로고침 때 가끔 사라진다)
const http = require('http'), fs = require('fs'), path = require('path');
module.exports = function serve(root = path.resolve(__dirname, '..')) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'althist.html');
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${srv.address().port}/althist.html`, close: () => srv.close() }));
  });
};
