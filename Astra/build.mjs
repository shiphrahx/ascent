import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateMaterials} from './tools/generate-materials.mjs';
await generateMaterials();
await mkdir('src',{recursive:true});
// Resolve through Node so builds also work in workspaces whose parent folders
// cannot be enumerated. All sources still come from the installed local packages.
const localSources={name:'local-sources',setup(builder){
 builder.onResolve({filter:/.*/},args=>({
  path:path.isAbsolute(args.path)?args.path:args.path.startsWith('.')?path.resolve(path.dirname(args.importer),args.path):fileURLToPath(import.meta.resolve(args.path)),
  namespace:'local-source'
 }));
 builder.onLoad({filter:/\.(png|jpe?g|webp)$/i,namespace:'local-source'},async args=>({contents:await readFile(args.path),loader:'dataurl'}));
 builder.onLoad({filter:/\.js$/,namespace:'local-source'},async args=>({contents:await readFile(args.path,'utf8'),loader:'js'}));
}};
const result=await build({absWorkingDir:process.cwd(),entryPoints:[path.resolve('src/main.js')],plugins:[localSources],tsconfigRaw:{},bundle:true,minify:true,format:'iife',target:'es2020',write:false,legalComments:'inline'});
const code=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const shell=await readFile('src/shell.html','utf8');
const license=await readFile('node_modules/three/LICENSE','utf8');
const html=shell.replace('/*__APP__*/',()=>code).replace('</head>',()=>`<!--\n${license}\n--></head>`);
await writeFile('Ascent.html',html);
console.log('Ascent.html: '+Buffer.byteLength(html)+' bytes, all runtime assets embedded.');
