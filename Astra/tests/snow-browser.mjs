import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const source=await readFile(new URL('../src/snow.js',import.meta.url),'utf8');
const {snowCoverageGLSL}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage(),result=await page.evaluate(code=>{
  const canvas=new OffscreenCanvas(1,1),gl=canvas.getContext('webgl2',{antialias:false});
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
  const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}'));
  gl.attachShader(p,shader(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;uniform vec3 n;uniform vec4 params;out vec4 colour;\n'+code+'void main(){colour=vec4(vec3(snowCoverage(n,params.x,params.y,params.z,params.w)),1.);}'));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);
  const normal=gl.getUniformLocation(p,'n'),params=gl.getUniformLocation(p,'params'),pixel=new Uint8Array(4);
  function sample(n,sky=1,amount=.7,drift=.56,footprint=0){gl.uniform3fv(normal,n);gl.uniform4f(params,sky,amount,drift,footprint);gl.drawArrays(gl.TRIANGLES,0,3);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return pixel[0]/255;}
  return {north:sample([0,.8,.6]),south:sample([0,.8,-.6]),open:sample([0,1,0]),sheltered:sample([0,1,0],.35),cliff:sample([1,0,0],.35),melted:sample([0,1,0],.35,0),filtered:sample([0,1,0],1,.7,.8,.5),sharp:sample([0,1,0],1,.7,.8,0),error:gl.getError()};
 },snowCoverageGLSL);
 assert(result.north>result.south+.25);assert(result.sheltered>result.open+.3);assert.equal(result.cliff,0);assert.equal(result.melted,0);assert(result.filtered<result.sharp&&result.filtered>.3);assert.equal(result.error,0);
 await writeFile('captures/snow-coverage.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
