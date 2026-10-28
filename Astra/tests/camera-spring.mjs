import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {springPosition}=await import('data:text/javascript;base64,'+Buffer.from(await readFile('src/camera-spring.js','utf8')).toString('base64'));
const endpoints=[];
for(const hz of[30,60,144]){
 const p={x:0,y:0,z:0},v={x:0,y:0,z:0},target={x:10,y:20,z:-10};let previous=0;
 for(let i=0;i<hz;i++){springPosition(p,v,target,1/hz);assert.ok(p.x>=previous&&p.x<=10);previous=p.x;}
 endpoints.push(p.x);assert.ok(p.x>9.9);
}
assert.ok(Math.max(...endpoints)-Math.min(...endpoints)<1e-10);
console.log('Camera spring reaches its target without overshoot at 30/60/144 Hz.');
