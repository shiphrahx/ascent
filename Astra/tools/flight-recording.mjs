import {chromium} from 'playwright';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const browser=await chromium.launch({channel:'chromium',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],steps=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(pathToFileURL(path.resolve('Ascent.html')).href+'?quality=medium');await page.waitForFunction(()=>window.__ready,null,{timeout:120000});
 await page.evaluate(()=>{const a=__ascent;a.setHour(6.55);a.setStorm(0);a.setCamera(0);a.position(35,145,600);a.orbit(-.65,.2,83);});await page.waitForTimeout(2200);
 const recording=await page.evaluate(()=>{
  const mimeType=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(t=>MediaRecorder.isTypeSupported(t));
  if(!mimeType)throw Error('No WebM recorder available');
  const stream=__ascent.renderer.domElement.captureStream(60),chunks=[],recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:3500000});
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  window.__finishFlightVideo=()=>new Promise(resolve=>{
   recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>{stream.getTracks().forEach(t=>t.stop());resolve(reader.result.split(',')[1]);};reader.readAsDataURL(new Blob(chunks,{type:mimeType}));};recorder.stop();
  });recorder.start();return {mimeType,requestedFps:60,bitsPerSecond:3500000};
 });
 for(const [key,milliseconds]of [['ArrowRight',1300],[null,700],['Space',1500],['KeyW',1800],['KeyE',1000],['KeyW',1300],['ArrowLeft',1200],['ShiftLeft',1100],[null,1200]]){
  if(key)await page.keyboard.down(key);await page.waitForTimeout(milliseconds);if(key)await page.keyboard.up(key);
  steps.push({key,milliseconds,state:await page.evaluate(()=>__state)});
 }
 await page.screenshot({path:'captures/plan2-flight-end.png'});
 const data=await page.evaluate(()=>__finishFlightVideo());await writeFile('captures/plan2-flight.webm',Buffer.from(data,'base64'));
 await page.close();await context.close();
 await writeFile('captures/plan2-flight.json',JSON.stringify({buildSha256:createHash('sha256').update(await readFile('Ascent.html')).digest('hex'),recording,steps,errors},null,2));
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Recorded camera-relative steering, climbing, view rotation, braking and descent.');
}finally{await browser.close();}
