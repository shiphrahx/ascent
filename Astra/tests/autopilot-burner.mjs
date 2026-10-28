import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {createAutopilotBurner}=await import('data:text/javascript;base64,'+Buffer.from(await readFile('src/autopilot-burner.js','utf8')).toString('base64'));
const controller=createAutopilotBurner(),edges=[];controller.reset();let on=false;
for(let i=0;i<3600;i++){
 const time=i/60,level=controller.update(time,Math.sin(time*12)*80,0,.6);
 if(controller.state.on!==on){edges.push(time);on=controller.state.on;}
 assert.ok(level>=0&&level<=1);
}
assert.ok(edges.length>10);
for(let i=1;i<edges.length;i++)assert.ok(edges[i]-edges[i-1]>=1.5-1e-8);
controller.reset();assert.equal(controller.update(0,100,0,.2),1);
assert.ok(controller.update(.5,5,0,.6)>0,'Minimum on-time is respected as demand falls');
assert.equal(controller.update(2,-100,0,1),0);
console.log('Proportional demand, hysteresis and minimum on/off dwell pass.');
