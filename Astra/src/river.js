import {Reflector} from 'three/addons/objects/Reflector.js';
import {THREE,ground,riverBanks,uniforms} from './core.js';

export function createRiver(scene,renderer){
 const positions=[],indices=[],depths=[],uv=[],across=8,rows=680;
 let minWidth=Infinity,maxWidth=0,maxShoreError=0,maxDepth=0;
 for(let j=0;j<=rows;j++){
  const z=-1700+j*5,[left,right]=riverBanks(z);minWidth=Math.min(minWidth,right-left);maxWidth=Math.max(maxWidth,right-left);
  for(let k=0;k<=across;k++){
   const x=THREE.MathUtils.lerp(left,right,k/across),depth=Math.max(0,3.55-ground(x,z));
   positions.push(x,3.55,z);uv.push(k/across,j/15);depths.push(depth);maxDepth=Math.max(maxDepth,depth);
   if(k===0||k===across)maxShoreError=Math.max(maxShoreError,Math.abs(ground(x,z)-3.55));
   if(j<rows&&k<across){const q=j*(across+1)+k;indices.push(q,q+across+1,q+1,q+1,q+across+1,q+across+2);}
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('aWaterDepth',new THREE.Float32BufferAttribute(depths,1));geometry.setIndex(indices);geometry.computeVertexNormals();
 // Reflector's local normal is +Z; transform the authored horizontal surface.
 geometry.rotateX(Math.PI/2);
 const water=new Reflector(geometry,{textureWidth:renderer.ascentQuality.reflectionSize,textureHeight:renderer.ascentQuality.reflectionSize,multisample:2,clipBias:.004});water.rotation.x=-Math.PI/2;water.name='Silty river';
 const material=water.material,high=renderer.ascentQuality.name==='high',lite=renderer.ascentQuality.name==='lite';
 material.transparent=true;
 Object.assign(material.uniforms,{uTime:uniforms.time,uDay:uniforms.day,uFrost:uniforms.frost,uReflectionTexel:{value:1/renderer.ascentQuality.reflectionSize}});
 material.vertexShader=material.vertexShader.replace('varying vec4 vUv;','varying vec4 vUv;varying vec3 vWaterWorld;varying float vWaterDepth;attribute float aWaterDepth;').replace('vUv = textureMatrix','vWaterWorld=(modelMatrix*vec4(position,1.)).xyz;vWaterDepth=aWaterDepth;vUv = textureMatrix');
 material.fragmentShader=material.fragmentShader.replace('varying vec4 vUv;','varying vec4 vUv;varying vec3 vWaterWorld;varying float vWaterDepth;uniform float uTime,uDay,uFrost,uReflectionTexel;');
 material.fragmentShader=material.fragmentShader.replace('vec4 base = texture2DProj( tDiffuse, vUv );',`
  vec2 flow=vWaterWorld.xz;
  float footprint=max(length(dFdx(flow)),length(dFdy(flow)));
  float rippleFade=1.-smoothstep(.5,3.,footprint);
  vec2 slope=vec2(cos(flow.x*1.3+flow.y*.48-uTime*1.3),sin(flow.y*.7-flow.x*.35-uTime*.8))*.035*rippleFade;
  slope+=vec2(sin(flow.y*.16-uTime*.5),cos(flow.x*.22+flow.y*.09-uTime*.3))*.018;
  vec2 reflectionUv=vUv.xy/vUv.w+slope*.035;
  vec3 reflected=texture2D(tDiffuse,reflectionUv).rgb;
  ${lite?'':`vec2 blur=vec2(uReflectionTexel*(1.5+2.*(1.-rippleFade)),0.);
  reflected=reflected*.5+(texture2D(tDiffuse,reflectionUv+blur).rgb+texture2D(tDiffuse,reflectionUv-blur).rgb)*.25;`}
  ${high?'reflected=reflected*.6+(texture2D(tDiffuse,reflectionUv+blur.yx).rgb+texture2D(tDiffuse,reflectionUv-blur.yx).rgb)*.2;':''}
  vec4 base=vec4(reflected,1.);`);
 material.fragmentShader=material.fragmentShader.replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );',`
  vec3 eye=normalize(cameraPosition-vWaterWorld),normal=normalize(vec3(-slope.x,1.,-slope.y));
  float fresnel=.02+.98*pow(1.-max(dot(eye,normal),0.),5.);
  float depth=max(0.,vWaterDepth),opticalDepth=depth/max(eye.y,.15);
  vec3 transmission=exp(-vec3(1.15,.72,1.85)*opticalDepth);
  float silt=.92+.08*sin(flow.x*.19+sin(flow.y*.13));
  vec3 bed=vec3(.16,.125,.068)*silt,body=vec3(.043,.052,.025);
  vec3 colour=mix(body,bed,transmission)*(.04+.96*uDay);
  colour=mix(colour,base.rgb,clamp(fresnel,.02,.82));
  float ice=(1.-smoothstep(.015,.22,depth))*(.5+.5*sin(flow.y*.43+sin(flow.y*.17)))*uFrost*.45;
  colour=mix(colour,vec3(.34,.39,.4)*(.08+.92*uDay),ice);
  gl_FragColor=vec4(colour,smoothstep(.015,.16,depth));`);
 // Preserve the bounded reflection schedule and the coarse reflection layer.
 const reflect=water.onBeforeRender.bind(water),lastEye=new THREE.Vector3(Infinity,0,0),lastRotation=new THREE.Quaternion();let reflectionTime=-Infinity,lastDay=-1,reflectionFrames=2;
 water.camera.layers.set(1);
 water.onBeforeRender=(r,s,c)=>{
  reflectionFrames++;const now=performance.now()/1000,moved=lastEye.distanceToSquared(c.position)>16||lastRotation.angleTo(c.quaternion)>.08;
  if((now-reflectionTime<1/renderer.ascentQuality.reflectionHz||reflectionFrames<renderer.ascentQuality.reflectionFrames)&&!moved&&Math.abs(uniforms.day.value-lastDay)<.02)return;
  reflect(r,s,c);reflectionTime=now;reflectionFrames=0;lastEye.copy(c.position);lastRotation.copy(c.quaternion);lastDay=uniforms.day.value;
 };
 water.userData.river={minWidth,maxWidth,maxDepth,maxShoreError,vertices:depths.length,reflectionSamples:high?5:lite?1:3};scene.add(water);return water;
}
