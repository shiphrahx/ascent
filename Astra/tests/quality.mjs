import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {classifyGpu,selectQuality}=await import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL('../src/quality.js',import.meta.url))).toString('base64'));
for(const [gpu,expected]of [
 ['ANGLE (AMD, AMD Radeon 890M Graphics, D3D11)','medium'],
 ['AMD Radeon 780M','medium'],['Intel Iris Xe','medium'],['Apple M4','medium'],
 ['ANGLE (NVIDIA, NVIDIA GeForce RTX 4070, D3D11)','high'],
 ['AMD Radeon RX 7800 XT','high'],['Intel Arc B580','high'],
 ['Google SwiftShader','lite'],['llvmpipe (LLVM 15)','lite'],['WebGL 2.0','medium']
])assert.equal(classifyGpu(gpu),expected,gpu);
const renderer={getContext:()=>({RENDERER:1,getExtension:()=>null,getParameter:()=> 'AMD Radeon 890M'})};
assert.equal(selectQuality(renderer,'').name,'medium');
assert.equal(selectQuality(renderer,'?quality=high').name,'high');
assert.equal(selectQuality(renderer,'?quality=lite').samples,2);
assert.equal(selectQuality(renderer,'?quality=__proto__').name,'medium');
assert.equal(selectQuality(renderer,'?quality=unknown').source,'detected');
console.log('Quality selection: hardware families, masked GPU, and overrides passed.');
