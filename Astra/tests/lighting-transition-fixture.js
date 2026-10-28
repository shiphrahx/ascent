import * as THREE from 'three';
import {createTextureTransition} from '../src/texture-transition.js';
const renderer=new THREE.WebGLRenderer(),fade=createTextureTransition(renderer,4,4);
function source(r,g,b){const data=new Uint16Array(4*4*4);for(let i=0;i<data.length;i+=4)data.set([r,g,b,1].map(THREE.DataUtils.toHalfFloat),i);const t=new THREE.DataTexture(data,4,4,THREE.RGBAFormat,THREE.HalfFloatType);t.needsUpdate=true;return t;}
function sample(){const data=new Uint16Array(64);renderer.readRenderTargetPixels(fade.output,0,0,4,4,data);return Array.from(data.slice(0,3),THREE.DataUtils.fromHalfFloat);}
const dark=source(0,0,0),warm=source(2,1,.5),cool=source(.5,1,2);
fade.start(dark,0);const initial=sample();fade.snapshot();fade.start(warm,0,1);fade.update(.5);const middle=sample();
fade.snapshot();fade.start(cool,.5,1);fade.update(.5);const interrupted=sample();fade.update(1.5);const settled=sample();
const count=fade.stats.frames;fade.update(10);
window.__results={initial,middle,interrupted,settled,skipsSettledWork:fade.stats.frames===count,restoredTarget:renderer.getRenderTarget()===null};
