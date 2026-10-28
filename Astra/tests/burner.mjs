import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const code=await readFile('src/burner.js','utf8');
const {smoothBurner,burnerVariation}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const evolve=(hz,target,initial)=>{let x=initial;for(let i=0;i<hz;i++)x=smoothBurner(x,target,1/hz);return x;};
for(const hz of[30,60,144]){
 assert.ok(Math.abs(evolve(hz,1,0)-(1-Math.exp(-4)))<1e-12);
 assert.ok(Math.abs(evolve(hz,0,1)-Math.exp(-1/.6))<1e-12);
}
for(let i=0;i<6000;i++)assert.ok(Math.abs(burnerVariation(i/60)-1)<=.0380001);
assert.equal(smoothBurner(.4,1,0),.4);
console.log('Burner attack/release are frame-rate independent; variation stays below 4%.');
