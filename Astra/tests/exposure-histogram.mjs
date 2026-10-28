import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../src/exposure-histogram.js',import.meta.url),'utf8');
const {histogramExposure,adaptExposure}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const pixels=level=>{const a=new Uint8Array(1000*4);for(let i=0;i<a.length;i+=4){a[i]=Math.round((Math.log2(level)+12)/24*255);a[i+1]=255;}return a;};
assert.equal(histogramExposure(pixels(2**-12)).target,1.8);
assert.equal(histogramExposure(pixels(2**12)).target,.45);
const middle=pixels(.18),base=histogramExposure(middle).target;
assert(Math.abs(Math.log2(base))<.2,'Middle grey gives approximately unit exposure within histogram quantisation');
for(let i=0;i<10;i++)middle[i*4]=255;
assert.equal(histogramExposure(middle).target,base,'A small bright light does not move metering');
const empty=new Uint8Array(40);assert(Number.isFinite(histogramExposure(empty).target));
assert.equal(adaptExposure(1,.45,0),1);
let current=1;for(let i=0;i<600;i++){const next=adaptExposure(current,.45,1/60);assert(next<=current&&next>=.45);current=next;}
assert(Math.abs(current-.45)<1e-6,'Adaptation converges without overshooting');
assert.equal(adaptExposure(1,1.8,100),adaptExposure(1,1.8,.1),'Long stalls cannot cause an exposure jump');
assert.equal(histogramExposure(pixels(.18)).bins.length,256);
assert.ok(Math.abs(Math.log2(adaptExposure(1,2,.1))+Math.log2(adaptExposure(1,.5,.1)))<1e-12,'Bright and dark adaptation have the same speed in stops');
for(let code=96;code<116;code++){
 const a=new Uint8Array([code,255,0,255]),b=new Uint8Array([code+1,255,0,255]);
 assert.ok(Math.abs(histogramExposure(a).meanEV-histogramExposure(b).meanEV)<.095,'Adjacent levels no longer jump by 0.375 EV');
}
console.log('Exposure histogram: grey reference, outlier rejection, clamps, empty samples and bounded adaptation passed.');
