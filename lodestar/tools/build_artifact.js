// index.html + style.css + js/*.js 를 한 파일로 묶는다.  node tools/build_artifact.js <출력 경로> [--full]
// 기본은 머리말 없는 조각(HTML fragment), --full 이면 혼자 열리는 완전한 문서.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = html.split('<!--APP-->')[1].split('<!--/APP-->')[0].trim();
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const js = ['data', 'map', 'sim', 'ai', 'sprites', 'render', 'ui'].map(f => fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8')).join('\n');
const head = '<title>로드스타</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=IBM+Plex+Sans+KR:wght@400;500;700&display=swap">\n';
let out = head + '<style>\n' + css + '</style>\n' + app + '\n<script>\n' + js.replace(/<\/script/g, '<\\/script') + '\n</script>\n';
if (process.argv.includes('--full')) out = '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' + out.replace('<style>', '</head>\n<body>\n<style>') + '</body>\n</html>\n';
fs.writeFileSync(process.argv[2], out);
console.log('wrote', process.argv[2], (out.length / 1024).toFixed(1) + ' KB');
