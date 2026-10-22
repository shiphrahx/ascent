import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
await mkdir('captures',{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[],requests=[];page.on('pageerror',e=>{errors.push(e.stack);console.log('ERROR',String(e));});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('CONSOLE',m.text());}});page.on('request',r=>requests.push(r.url()));
await page.goto(pathToFileURL(path.resolve('Ascent.html')).href);await page.waitForFunction(()=>window.__ready,{timeout:120000});await page.waitForTimeout(2500);
const shots=[
 {name:'01-sunrise',hour:6.25,z:1000,y:60,orbit:[-.65,.20,83]},
 {name:'02-above-dawn-fog',hour:6.55,z:680,y:120,orbit:[-.4,.20,96]},
 {name:'03-inside-envelope',hour:6.4,z:600,y:115,mode:1,look:[0,1.45]},
 {name:'04-snowstorm',hour:10.8,z:250,y:100,storm:1,orbit:[.45,.21,77]},
 {name:'05-golden-hour',hour:17.15,z:-180,y:115,orbit:[-.6,.27,100]},
 {name:'06-sunset',hour:17.85,z:-470,y:110,orbit:[.65,.19,92]},
 {name:'07-night',hour:22,z:-80,y:105,orbit:[.2,.2,85]}
];const results=[];
for(const s of shots){await page.evaluate(s=>{const a=window.__ascent; a.setHour(s.hour);a.setStorm(s.storm??0);a.setCamera(s.mode??0);a.position(95*Math.sin(s.z*.004)+55*Math.sin(s.z*.008+1),s.y,s.z);if(s.orbit)a.orbit(...s.orbit);if(s.look)a.look(...s.look);},s);if(s.mode===1||s.name==='07-night')await page.keyboard.down('Space');await page.waitForTimeout(1800);await page.screenshot({path:`captures/${s.name}.png`});await page.keyboard.up('Space');const state=await page.evaluate(()=>window.__state);results.push({name:s.name,...state});console.log(s.name,JSON.stringify(state));}
await writeFile('captures/report.json',JSON.stringify({errors,requests,results,visibleText:await page.locator('body').innerText()},null,2));console.log('errors',errors.length,'externalRequests',requests.filter(x=>/^https?:/.test(x)).length);await browser.close();
