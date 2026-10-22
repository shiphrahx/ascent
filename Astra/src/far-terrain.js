import {THREE,ground,riverX,smooth,stoneMaterial,mesh,terrainBoundary} from './core.js';
import {landNoise} from './landforms.js';

const span=65536;
function strata(x,z){return landNoise(x,z)*.58+landNoise(x*2.03+13,z*2.03+7)*.28+landNoise(x*4.11-9,z*4.11+19)*.14;}
function farHeight(x,z){
 const distance=Math.max(Math.abs(z)-2000,Math.abs(x-riverX(z))-2600);
 const region=landNoise(x*.00019+17,z*.00019-23);
 const ridge=1-Math.abs(landNoise(x*.00062+7,z*.00062+29)*2-1);
 const tributary=1-Math.abs(landNoise(x*.0021-19,z*.0021+11)*2-1);
 let relief=40+region*110+Math.pow(ridge,3)*(100+region*240)+tributary*45;
 // Preserve the regional sequence of eroded northern escarpments, now part
 // of one continuous height field rather than four overlapping backdrops.
 for(let layer=0;layer<4;layer++){
  const t=(z+3400+layer*1400)/1900+.5;
  if(t>0&&t<1){const crest=100+layer*55+strata(x*.0014+layer*13,z*.0007)*460;relief=Math.max(relief,Math.pow(Math.sin(t*Math.PI),1.25)*crest+(strata(x*.012,z*.005)-.5)*55*Math.sin(t*Math.PI));}
 }
 return ground(x,z)+smooth(distance,0,900)*relief-64*(1-smooth(distance,-128,192));
}

// Nested grids share world-aligned vertices. Before a ring boundary moves,
// its fine heights converge to the neighbouring coarse triangles, without
// stochastic visibility, alpha fades or per-frame geometry uploads.
export function createFarTerrain(scene,renderer){
 const tier=renderer.ascentQuality.name,size=tier==='high'?2049:tier==='lite'?513:1025,cell=span/(size-1),data=new Float32Array(size*size);
 for(let j=0;j<size;j++)for(let i=0;i<size;i++)data[j*size+i]=farHeight(i*cell-span*.5,j*cell-span*.5);
 const texture=new THREE.DataTexture(data,size,size,THREE.RedFormat,THREE.FloatType);
 const linear=renderer.extensions.has('OES_texture_float_linear');
 texture.minFilter=texture.magFilter=linear?THREE.LinearFilter:THREE.NearestFilter;texture.needsUpdate=true;
 const center={value:new THREE.Vector2()},eye={value:new THREE.Vector2()},steps=tier==='high'?[32,64,128,128]:tier==='lite'?[128,128,128,256]:[64,128,128,128],rings=new THREE.Group();rings.name='Far terrain LOD rings';scene.add(rings);
 for(let level=0;level<4;level++){
  const extent=2048*2**level,step=steps[level],parentStep=steps[Math.min(3,level+1)],n=2*extent/step,ps=[],uv=[],ix=[];
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
   ps.push(-extent+i*step,0,-extent+j*step);uv.push(i/n,j/n);
   if(i<n&&j<n&&!(level>0&&i>=n/4&&i<n*3/4&&j>=n/4&&j<n*3/4)){
    const q=j*(n+1)+i;ix.push(q,q+n+1,q+1,q+1,q+n+1,q+n+2);
   }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();
  const material=stoneMaterial('#c9b9a8',6,false),compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=shader=>{
   compile(shader);
   Object.assign(shader.uniforms,{uFarHeight:{value:texture},uFarCenter:center,uFarEye:eye,uFarStep:{value:step},uFarParentStep:{value:parentStep},uFarExtent:{value:extent}});
   shader.vertexShader=`uniform sampler2D uFarHeight;uniform vec2 uFarCenter,uFarEye;uniform float uFarStep,uFarParentStep,uFarExtent;
    float fieldHeight(vec2 p){
     vec2 uv=.5+p/${(span+cell).toFixed(1)};
     ${linear?'return texture2D(uFarHeight,uv).r;':`vec2 q=uv*${size}.0-.5,b=floor(q),f=fract(q);vec2 a=(b+.5)/${size}.0;float d=1./${size}.0;return mix(mix(texture2D(uFarHeight,a).r,texture2D(uFarHeight,a+vec2(d,0.)).r,f.x),mix(texture2D(uFarHeight,a+vec2(0.,d)).r,texture2D(uFarHeight,a+vec2(d)).r,f.x),f.y);`}
    }
    float parentHeight(vec2 p,float spacing){
     vec2 cell=floor(p/spacing)*spacing,f=fract(p/spacing);
     float a=fieldHeight(cell),b=fieldHeight(cell+vec2(spacing,0.)),c=fieldHeight(cell+vec2(0.,spacing)),d=fieldHeight(cell+vec2(spacing));
     return f.x+f.y<=1.?a+f.x*(b-a)+f.y*(c-a):d+(1.-f.x)*(c-d)+(1.-f.y)*(b-d);
    }
    float ringMorph(vec2 p){vec2 d=abs(p-uFarEye);return smoothstep(uFarExtent*.625,uFarExtent*.75,max(d.x,d.y));}
    vec3 fieldNormal(vec2 p,float stepSize){return normalize(vec3(fieldHeight(p-vec2(stepSize,0.))-fieldHeight(p+vec2(stepSize,0.)),2.*stepSize,fieldHeight(p-vec2(0.,stepSize))-fieldHeight(p+vec2(0.,stepSize))));}
    `+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
    vec2 farWorld=position.xz+uFarCenter;float farMorph=ringMorph(farWorld);
    objectNormal=normalize(mix(fieldNormal(farWorld,uFarStep),fieldNormal(farWorld,uFarParentStep),farMorph));`);
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    transformed.y=mix(fieldHeight(farWorld),parentHeight(farWorld,uFarParentStep),farMorph);`);
  };
  material.customProgramCacheKey=()=>key+'-far-rings-'+linear+'-'+size;
  const ring=mesh(g,material,rings);ring.name=`Far terrain ring ${level}`;ring.castShadow=false;ring.frustumCulled=false;
 }
 // A border skirt follows the exact detailed terrain vertices and covers the
 // overlap with the coarse height field, including the curved river grid.
 const ps=[],uv=[],ix=[];
 for(const edge of terrainBoundary()){
  const start=ps.length/3;
  edge.forEach(([x,y,z],i)=>{ps.push(x,y,z,x,y-80,z);uv.push(x*.1,z*.1,x*.1,(z-80)*.1);if(i<edge.length-1){const q=start+i*2;ix.push(q,q+1,q+2,q+1,q+3,q+2);}});
 }
 const skirtGeometry=new THREE.BufferGeometry();skirtGeometry.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));skirtGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));skirtGeometry.setIndex(ix);skirtGeometry.computeVertexNormals();
 const skirt=mesh(skirtGeometry,stoneMaterial('#fff8ed',4),scene);skirt.material.side=THREE.DoubleSide;skirt.name='Detailed terrain border';skirt.castShadow=false;
 return {rings,texture,skirt,update(camera){
  eye.value.set(camera.position.x,camera.position.z);
  const snap=steps[3];center.value.set(Math.round(camera.position.x/snap)*snap,Math.round(camera.position.z/snap)*snap);
  rings.position.set(center.value.x,0,center.value.y);
 }};
}
