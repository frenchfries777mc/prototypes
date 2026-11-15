const fs = require('fs'), path = require('path');
const r = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const rt = r('runtime.js');
if (/<\/script/i.test(rt)) throw new Error('runtime.js contains </script');
const kst = new Date(Date.now() + 9 * 3600 * 1000), stamp = kst.toISOString().slice(0, 16).replace('T', ' ').replace(/^\d{4}-/, '');
const out = r('editor.html')
  .replace('/*@RUNTIME_TEXT*/', () => rt)
  .replace('/*@RUNTIME*/', () => rt)
  .replace('/*@COMPILER_TEXT*/', () => r('compiler.js'))
  .replace('/*@CONVERTER_TEXT*/', () => r('converter.js'))
  .replace('/*@COMPILER*/', () => r('compiler.js'))
  .replace('/*@CONVERTER*/', () => r('converter.js'))
  .replace('/*@EXAMPLES*/', () => r('examples.js'))
  .replace('/*@TUTORIAL*/', () => r('tutorial.js'));
fs.writeFileSync(path.join(__dirname, '..', 'index.html'), out.split('/*@BUILD*/').join(stamp));
console.log('built', out.length, 'bytes');
