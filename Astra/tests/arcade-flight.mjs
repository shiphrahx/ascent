import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {arcadeVelocity}=await import('data:text/javascript;base64,'+Buffer.from(await readFile('src/arcade-flight.js','utf8')).toString('base64'));
for(const hz of[30,60,144])for(const angle of[0,.7,2.4]){
 const forward={x:Math.sin(angle),z:-Math.cos(angle)},right={x:-forward.z,z:forward.x},v={x:0,y:0,z:0};
 const wind={x:-right.x*5,z:-right.z*5};
 for(let i=0;i<Math.ceil(hz*.3);i++)arcadeVelocity(v,{right:1,forward:0,vertical:1},forward,wind,1/hz);
 assert.ok(v.x*right.x+v.z*right.z>=5);assert.ok(v.y>1);
 for(let i=0;i<Math.ceil(hz*.7);i++)arcadeVelocity(v,{right:0,forward:0,vertical:0},forward,wind,1/hz);
 assert.ok(Math.hypot(v.x,v.z)<1);assert.ok(Math.abs(v.y)<.4);
}
console.log('Camera-relative acceleration, climbing and braking pass at 30/60/144 Hz with opposing wind.');
