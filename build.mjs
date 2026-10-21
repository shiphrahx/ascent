// Bundles src/ into one standalone HTML file with everything inlined.
import * as esbuild from 'esbuild';
import fs from 'fs';

const dev = process.argv.includes('--dev');
const result = await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: !dev,
  write: false,
  target: 'es2020',
  legalComments: 'eof',
  loader: { '.jpg': 'dataurl' },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\/script');
const html = fs.readFileSync('src/index.html', 'utf8').replace('/*__APP__*/', () => js);
fs.writeFileSync('cappadocia.html', html);
console.log('built cappadocia.html', (html.length / 1024).toFixed(0) + 'kb');
