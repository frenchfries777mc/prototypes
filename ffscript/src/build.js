const fs = require('fs'), path = require('path');
const r = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const rt = r('runtime.js');
if (/<\/script/i.test(rt)) throw new Error('runtime.js contains </script');
const out = r('editor.html')
  .replace('/*@RUNTIME_TEXT*/', () => rt)
  .replace('/*@RUNTIME*/', () => rt)
  .replace('/*@COMPILER*/', () => r('compiler.js'))
  .replace('/*@EXAMPLES*/', () => r('examples.js'))
  .replace('/*@TUTORIAL*/', () => r('tutorial.js'));
fs.writeFileSync(path.join(__dirname, '..', 'index.html'), out);
console.log('built', out.length, 'bytes');
