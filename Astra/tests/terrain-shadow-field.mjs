import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/terrain-shadow-field.js',import.meta.url),'utf8');
const {bakeTerrainShadowField}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const options={bounds:[-100,-100,100,100],size:21,directions:8,ranges:[10,20,40,80,160]};
const flat=bakeTerrainShadowField({...options,heightAt:()=>10});
for(let i=0;i<flat.data.length;i+=4){assert(flat.data[i]<0);assert.equal(flat.data[i+1],10);assert(flat.data[i+2]>0);}
const ridge=bakeTerrainShadowField({...options,heightAt:x=>x>25&&x<65?60:0}),centre=10*21+10;
const east=centre*4,west=(4*21*21+centre)*4;
assert(ridge.data[east]>1,'Eastern wall blocks a low eastern sun');
assert(ridge.data[west]<0,'No wall blocks the western sky');
assert(ridge.data[east]-80*ridge.data[east+2]<0,'An elevated receiver can see over the wall');
assert(ridge.data.every(Number.isFinite));
console.log('Terrain shadow field: flat ground, directional obstruction, elevated receivers and finite encoding passed.');
