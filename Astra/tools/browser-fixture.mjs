import {build} from 'esbuild';
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
export async function runFixture(entry,name){
 const local={name:'local-fixture',setup(b){
  b.onResolve({filter:/.*/},a=>({path:path.isAbsolute(a.path)?a.path:a.path.startsWith('.')?path.resolve(path.dirname(a.importer),a.path):fileURLToPath(import.meta.resolve(a.path)),namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},async a=>({contents:await readFile(a.path,'utf8'),loader:'js'}));
 }};
 const bundle=await build({entryPoints:[path.resolve(entry)],plugins:[local],tsconfigRaw:{},bundle:true,format:'iife',write:false,minify:true});
 const file=`captures/${name}-probe.html`;
 await writeFile(file,'<!doctype html><body><script>'+bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script>');
 const browser=await chromium.launch({channel:'chromium',headless:true}),errors=[];
 try{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
  await page.goto(pathToFileURL(path.resolve(file)).href);await page.waitForFunction(()=>window.__results);
  const result=await page.evaluate(()=>__results);await writeFile(`captures/${name}-report.json`,JSON.stringify({result,errors},null,2));
  if(errors.length)throw Error(errors.join('\n'));return result;
 }finally{await browser.close();}
}
