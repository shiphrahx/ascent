import assert from 'node:assert/strict';
import {meanRegion} from '../tools/luminance-region.mjs';
import {analyseSignal} from '../tools/light-signal.mjs';
const size=64,pixels=new Uint8Array(size*size*4);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){const k=((size-y-1)*size+x)*4;pixels.set([x+y,x+y,x+y,255],k);}
const values=Array.from({length:600},(_,i)=>meanRegion(pixels,size,size,{x:5+i*.06,y:3,width:8,height:8},true));
assert.ok(analyseSignal(values).largestDetrendedJump<1e-10);
assert.ok(Math.abs(values[250]-(5+250*.06+3+7))<1e-10);
console.log('Fractional moving crops preserve a smooth luminance trend without pixel-step peaks.');
