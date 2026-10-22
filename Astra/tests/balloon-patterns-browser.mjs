import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const source=await readFile(new URL('../src/balloon-patterns.js',import.meta.url),'utf8');
const {paintBalloonFabric,balloonPatternNames}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1400,height:460}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
 const result=await page.evaluate(({paintSource,names})=>{
  const paint=eval('('+paintSource+')'),patterns=[];document.body.style='margin:0;background:#282828;color:white;font:15px sans-serif;display:flex;gap:6px';
  for(let i=0;i<names.length;i++){
   let seed=3;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   const canvas=document.createElement('canvas');canvas.width=canvas.height=512;paint(canvas.getContext('2d'),512,['#ac4934','#e8c68a','#4b7378','#e6d6ab'],i,random);
   const small=document.createElement('canvas');small.width=small.height=12;small.getContext('2d').drawImage(canvas,0,0,12,12);patterns.push([...small.getContext('2d').getImageData(0,0,12,12).data]);
   const card=document.createElement('figure');card.style='margin:0;width:194px';canvas.style='width:194px;height:388px';const caption=document.createElement('figcaption');caption.textContent=names[i];card.append(canvas,caption);document.body.append(card);
  }
  let minimum=Infinity;const pairs=[];
  for(let a=0;a<patterns.length;a++)for(let b=a+1;b<patterns.length;b++){let sum=0;for(let i=0;i<patterns[a].length;i++)if(i%4!==3)sum+=(patterns[a][i]-patterns[b][i])**2;const rms=Math.sqrt(sum/(12*12*3))/255;minimum=Math.min(minimum,rms);pairs.push({a:names[a],b:names[b],rms});}
  return {designs:names.length,minimumMacroDifference:minimum,pairs};
 },{paintSource:paintBalloonFabric.toString(),names:balloonPatternNames});
 assert.equal(result.designs,7);assert(result.minimumMacroDifference>.06,'Designs must differ at large scale with the same palette and weave seed');
 await page.screenshot({path:'captures/balloon-patterns.png'});
 await page.goto(pathToFileURL(path.resolve('Ascent.html')).href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});
 result.fleetDesigns=await page.evaluate(()=>[...new Set(__ascent.fleet.map(b=>b.envelope.material.map.userData.pattern))]);assert.equal(result.fleetDesigns.length,7);assert.deepEqual(errors,[]);
 await writeFile('captures/balloon-patterns.json',JSON.stringify({...result,errors},null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
