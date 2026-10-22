import * as THREE from 'three';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {CopyShader} from 'three/addons/shaders/CopyShader.js';

export function createLensBloom(width,height){
 const bloom=new UnrealBloomPass(new THREE.Vector2(width,height),.04/3,.5,0);
 // Blur the complete HDR signal. No luminance threshold clips dim highlights.
 bloom.highPassUniforms.opacity={value:1};bloom.materialHighPassFilter.fragmentShader=CopyShader.fragmentShader;
 const scatter={value:.04},blend=bloom.blendMaterial;
 blend.uniforms.uScatter=scatter;blend.fragmentShader='uniform float uScatter;\n'+blend.fragmentShader.replace('gl_FragColor = opacity * texel;','gl_FragColor = vec4(opacity*texel.rgb,uScatter);');
 blend.blending=THREE.CustomBlending;blend.blendEquation=THREE.AddEquation;blend.blendSrc=THREE.OneFactor;blend.blendDst=THREE.OneMinusSrcAlphaFactor;
 blend.blendEquationAlpha=THREE.AddEquation;blend.blendSrcAlpha=THREE.ZeroFactor;blend.blendDstAlpha=THREE.OneFactor;
 // The five radius-interpolated mip weights always sum to three. Redistribute
 // a small fraction of radiance instead of adding brightness to every pixel.
 bloom.setScatter=value=>{scatter.value=THREE.MathUtils.clamp(value,0,.12);bloom.strength=scatter.value/3;};
 bloom.userData={energyConserving:true,threshold:false,scatter};return bloom;
}

export function createOpaqueOutput(){
 const pass=new OutputPass(),source=pass.material.fragmentShader,end=source.lastIndexOf('}');
 pass.material.fragmentShader=source.slice(0,end)+'gl_FragColor.a=1.;\n'+source.slice(end);
 return pass;
}
