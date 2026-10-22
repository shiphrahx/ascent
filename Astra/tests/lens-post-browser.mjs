import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const sources={name:'local-sources',setup(b){
 b.onResolve({filter:/.*/},a=>({path:path.isAbsolute(a.path)?a.path:a.path.startsWith('.')?path.resolve(a.importer?path.dirname(a.importer):process.cwd(),a.path):fileURLToPath(import.meta.resolve(a.path)),namespace:'local-source'}));
 b.onLoad({filter:/\.js$/,namespace:'local-source'},async a=>({contents:await readFile(a.path,'utf8'),loader:'js'}));
}};
const fixture=`import * as THREE from 'three';import {createLensBloom,createOpaqueOutput} from './src/lens-post.js';
const r=new THREE.WebGLRenderer({antialias:false,alpha:true,premultipliedAlpha:false});r.setSize(64,64);r.outputColorSpace=THREE.LinearSRGBColorSpace;document.body.append(r.domElement);
const read=new THREE.WebGLRenderTarget(64,64,{type:THREE.HalfFloatType,depthBuffer:false}),write=read.clone(),bloom=createLensBloom(64,64),output=createOpaqueOutput();output.renderToScreen=true;
const results=[];let alphaErrors=0;
for(const scatter of [.025,.06,.1])for(const level of [.001,.18,2,10]){
 bloom.setScatter(scatter);const alpha=level===.18?0:1,colour=new THREE.Color().setRGB(level,level*.7,level*.3);r.setRenderTarget(read);r.setClearColor(colour,alpha);r.clear();r.setRenderTarget(null);bloom.render(r,write,read,0,false);
 const data=new Uint16Array(64*64*4);r.readRenderTargetPixels(read,0,0,64,64,data);let relativeError=0,alphaError=0;
 for(let i=0;i<data.length;i++){const value=THREE.DataUtils.fromHalfFloat(data[i]),expected=i%4===3?alpha:level*[1,.7,.3][i%4];if(i%4===3)alphaError=Math.max(alphaError,Math.abs(value-expected));else relativeError=Math.max(relativeError,Math.abs(value-expected)/expected);}
 output.render(r,null,read);const gl=r.getContext(),pixel=new Uint8Array(4);gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);if(pixel[3]!==255)alphaErrors++;
 results.push({scatter,level,relativeError,alphaError});
}
window.result={results,alphaErrors,error:r.getContext().getError()};`;
const bundle=await build({absWorkingDir:process.cwd(),stdin:{contents:fixture,loader:'js'},plugins:[sources],tsconfigRaw:{},bundle:true,minify:true,format:'iife',write:false});
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
 await page.setContent('<!doctype html><body><script>'+bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script>');assert.deepEqual(errors,[]);await page.waitForFunction(()=>window.result,{},{timeout:5000}).catch(e=>{throw new Error(JSON.stringify(errors)+' '+e.message);});
 const result=await page.evaluate(()=>window.result);assert.deepEqual(errors,[]);assert.equal(result.error,0);assert.equal(result.alphaErrors,0);assert(result.results.every(v=>v.relativeError<.012&&v.alphaError===0));
 await writeFile('captures/lens-post.json',JSON.stringify({...result,errors},null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
