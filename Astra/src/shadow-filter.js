import * as THREE from 'three';

// A fixed Poisson disk avoids screen-space noise and animated sample rotation.
// Shadow history is reprojected with the matrix that produced the old map.
export function createShadowFiltering(renderer,csm,high){
 function target(size){const depth=new THREE.DepthTexture(size,size,THREE.UnsignedIntType);depth.compareFunction=THREE.LessEqualCompare;depth.minFilter=depth.magFilter=THREE.LinearFilter;return new THREE.WebGLRenderTarget(size,size,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthTexture:depth});}
 csm.lights.forEach(light=>{light.shadow.map=target(light.shadow.mapSize.x);});
 const history=[null,null,null],matrices=[new THREE.Matrix4(),new THREE.Matrix4(),new THREE.Matrix4()],updated=[-Infinity,-Infinity,-Infinity];
 const blend=new THREE.Vector2(1,1),uniforms={uCascadeDepth:{value:csm.lights.map(l=>l.shadow.map.depthTexture)},uPreviousShadow1:{value:csm.lights[1].shadow.map.depthTexture},uPreviousShadow2:{value:csm.lights[2].shadow.map.depthTexture},uPreviousMatrix1:{value:matrices[1]},uPreviousMatrix2:{value:matrices[2]},uShadowBlend:{value:blend}};
 const samples=high?12:renderer.ascentQuality.name==='lite'?4:8,farSamples=high?12:4,stats={samples,farSamples,nativeComparison:true,copies:0,resets:0,updates:[0,0,0]};let time=0,reset=true;
 const points=Array.from({length:samples},(_,i)=>{const a=i*2.399963229728653,r=Math.sqrt((i+.5)/samples);return [Math.cos(a)*r,Math.sin(a)*r];});
 const filter=`
 float poissonShadow(sampler2DShadow map,vec2 mapSize,float intensity,float bias,float radius,vec4 coord,int cascade){
  vec3 p=coord.xyz/coord.w;p.z+=bias;
  // Compare each filter tap against the receiver plane, rather than one depth
  // for the whole kernel. This suppresses striped self-shadowing on slopes.
  vec3 dx=dFdx(p),dy=dFdy(p);float determinant=dx.x*dy.y-dx.y*dy.x;
  vec2 depthGradient=vec2(0.);
  if(abs(determinant)>.0000000001)depthGradient=clamp(vec2(dy.y*dx.z-dx.y*dy.z,dx.x*dy.z-dy.x*dx.z)/determinant,vec2(-2.),vec2(2.));
  float visibility=1.;
  if(p.x>=0.&&p.y>=0.&&p.x<=1.&&p.y<=1.&&p.z<=1.){
  float angle=float(cascade)*1.618,cs=cos(angle),sn=sin(angle);
  mat2 rotation=mat2(cs,sn,-sn,cs);vec2 stepSize=vec2(radius)/mapSize;
  if(cascade>0)stepSize*=${Math.sqrt(samples/farSamples).toFixed(7)};
  float shadow=0.;
  ${points.map(([x,y],i)=>`${i>=farSamples?'if(cascade==0)':''}{vec2 offset=rotation*vec2(${x.toFixed(7)},${y.toFixed(7)})*stepSize;shadow+=texture(map,vec3(p.xy+offset,p.z+dot(depthGradient,offset)));}`).join('\n')}
  visibility=mix(1.,shadow/(cascade==0?${samples}.:${farSamples}.),intensity);
  }
  return visibility;
 }
 float stableCascadeShadow(sampler2DShadow map,vec2 mapSize,float intensity,float bias,float radius,vec4 coord,int cascade,vec3 world,vec3 worldNormal){
  float current=poissonShadow(map,mapSize,intensity,bias,radius,coord,cascade);
  ${high?'':`if(cascade==1&&uShadowBlend.x<.999)current=mix(poissonShadow(uPreviousShadow1,mapSize,intensity,bias,radius,uPreviousMatrix1*vec4(world+worldNormal*.18,1.),cascade),current,uShadowBlend.x);
  else if(cascade==2&&uShadowBlend.y<.999)current=mix(poissonShadow(uPreviousShadow2,mapSize,intensity,bias,radius,uPreviousMatrix2*vec4(world+worldNormal*.5,1.),cascade),current,uShadowBlend.y);`}
  return current;
 }
 `;
 return {stats,history,blend,advance(now,force){
  time=now;reset=force;
  if(force){blend.set(1,1);updated.fill(-Infinity);stats.resets++;}
  else blend.set(THREE.MathUtils.smoothstep(now-updated[1],0,.1),THREE.MathUtils.smoothstep(now-updated[2],0,.22));
 },beforeRender(light){
  const i=csm.lights.indexOf(light);if(i<0||!light.shadow.needsUpdate)return;
  const previous=stats.updates[i]++>0;
  if(high||i===0)return;
  if(reset||!previous){blend.setComponent(i-1,1);return;}
  const source=light.shadow.map;
  if(!history[i]||history[i].width!==source.width){
   history[i]?.dispose();history[i]=target(source.width);renderer.initRenderTarget(history[i]);
   uniforms['uPreviousShadow'+i].value=history[i].depthTexture;
  }
  renderer.copyTextureToTexture(source.depthTexture,history[i].depthTexture);matrices[i].copy(light.shadow.matrix);
  updated[i]=time;blend.setComponent(i-1,0);stats.copies++;
 },apply(shader,worldVarying){
  Object.assign(shader.uniforms,uniforms);
  shader.fragmentShader='precision highp sampler2DShadow;uniform sampler2DShadow uCascadeDepth[3];\n'+shader.fragmentShader;
  if(!high){
   if(!worldVarying){worldVarying='vShadowWorld';const varying='varying vec3 vShadowWorld;\n';shader.vertexShader=varying+shader.vertexShader;shader.fragmentShader=varying+shader.fragmentShader;shader.vertexShader=shader.vertexShader.replace('#include <shadowmap_vertex>','vShadowWorld=terrainPosition;\n#include <shadowmap_vertex>');}
   shader.fragmentShader='uniform mat4 uPreviousMatrix1,uPreviousMatrix2;uniform highp sampler2DShadow uPreviousShadow1,uPreviousShadow2;uniform vec2 uShadowBlend;\n'+shader.fragmentShader;
  }
  shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>','#include <shadowmap_pars_fragment>\n'+filter);
  // Terrain shadows already expand this chunk on affected surfaces.
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin);
  shader.fragmentShader=shader.fragmentShader.replace(/getShadow\( directionalShadowMap\[ i \],([^;]+?)vDirectionalShadowCoord\[ i \] \)/g,`stableCascadeShadow( uCascadeDepth[ i ],$1vDirectionalShadowCoord[ i ], UNROLLED_LOOP_INDEX, ${worldVarying}, inverseTransformDirection(nonPerturbedNormal,viewMatrix) )`);
 }};
}
