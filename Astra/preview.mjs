import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
await mkdir('captures',{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text());});page.on('request',r=>requests.push(r.url()));
await page.goto(pathToFileURL(path.resolve('Ascent.html')).href);
try{await page.waitForFunction(()=>window.__ready,{timeout:120000});await page.waitForTimeout(4000);}catch(e){errors.push(String(e));}
await page.screenshot({path:'captures/initial.png'});
console.log(JSON.stringify({errors,requests,state:await page.evaluate(()=>window.__state),gpu:await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');return gl?.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL||gl.RENDERER);})},null,2));
await writeFile('captures/initial-report.json',JSON.stringify({errors,requests},null,2));
await browser.close();
