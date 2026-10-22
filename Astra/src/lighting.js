import {CSM} from 'three/addons/csm/CSM.js';
import {THREE} from './core.js';
import {applyTerrainLighting,bakeStaticTerrainLighting} from './terrain-lighting.js';

export function createSunShadows(scene,camera,renderer){
 const terrainPerFragment=renderer.ascentQuality.name==='high';
 const csm=new CSM({camera,parent:scene,cascades:3,maxFar:1900,
  mode:'custom',customSplitsCallback:(c,n,f,breaks)=>breaks.push(180/f,620/f,1),
  shadowMapSize:renderer.ascentQuality.shadowSize,shadowBias:-.000025,lightNear:1,lightFar:4500,
  lightMargin:1800,lightDirection:new THREE.Vector3(-1,-1,1).normalize()});
 csm.fade=true;csm.updateFrustums();
 csm.lights.forEach((light,i)=>{light.shadow.normalBias=[.07,.18,.5][i];light.shadow.radius=2;light.shadow.autoUpdate=false;if(i>0)light.shadow.camera.layers.set(2);});
 scene.updateMatrixWorld(true);
 const materials=new Set();
 scene.traverse(object=>{
  if(!terrainPerFragment)bakeStaticTerrainLighting(object);
  // Basket wicker, rigging and facial details are smaller than a far shadow
  // texel. Keep their full shadows in the first cascade only.
  if(object.isMesh&&object.castShadow){
   object.geometry.computeBoundingSphere();
   const size=object.geometry.boundingSphere.radius*object.matrixWorld.getMaxScaleOnAxis();
   if(!object.userData.smallDebris&&(size>7||object.isInstancedMesh))object.layers.enable(2);
  }
  for(const material of [].concat(object.material??[])){
   if(!material.isMeshStandardMaterial||materials.has(material))continue;
   materials.add(material);
   material.defaultAttributeValues={...material.defaultAttributeValues,aTerrainLight:[1,0]};
   // CSM replaces onBeforeCompile. Preserve the rock, cloth and wind shaders.
   const surface=material.onBeforeCompile,cacheKey=material.customProgramCacheKey.bind(material);
   const surfaceKey=cacheKey();
   csm.setupMaterial(material);const shadows=material.onBeforeCompile;
   material.onBeforeCompile=function(shader,renderer){surface.call(this,shader,renderer);applyTerrainLighting(shader,terrainPerFragment);shadows.call(this,shader,renderer);};
   material.customProgramCacheKey=()=>surfaceKey+'-terrain-light-'+terrainPerFragment+'-csm3';
  }
 });
 // WebGLShadowMap filters casters using the view camera's layers, not the
 // shadow camera's layers. Apply the coarse caster layer per far cascade so
 // basket weave, facial details and rubble actually stay out of those maps.
 const shadowMap=renderer.shadowMap,renderShadows=shadowMap.render,farLights=new Set(csm.lights.slice(1));
 shadowMap.render=function(lights,shadowScene,viewCamera){
  if(!this.enabled||(!this.autoUpdate&&!this.needsUpdate)||lights.length===0)return;
  const layers=viewCamera.layers.mask;
  try{
   for(const light of lights){
    viewCamera.layers.mask=farLights.has(light)?1<<2:layers;
    this.needsUpdate=true;renderShadows.call(this,[light],shadowScene,viewCamera);
   }
  }finally{viewCamera.layers.mask=layers;}
 };
 let projection='',lastDirection=new THREE.Vector3(),lastEye=new THREE.Vector3(Infinity,0,0),lastRotation=new THREE.Quaternion(),lastUpdate=[-Infinity,-Infinity,-Infinity],frame=0,lastFrame=[-Infinity,-Infinity,-Infinity];
 return {csm,update(direction,color,intensity){
  frame++;
  const now=performance.now()/1000;
  const next=[camera.fov,camera.aspect,camera.near].join(',');
  const cameraCut=lastEye.distanceToSquared(camera.position)>36||lastRotation.angleTo(camera.quaternion)>.08;
  const force=next!==projection||cameraCut||lastDirection.distanceToSquared(direction)>.00005;
  if(next!==projection){csm.updateFrustums();projection=next;}
  csm.lightDirection.copy(direction).negate();
  for(const light of csm.lights){light.color.copy(color);light.intensity=intensity;}
  csm.update();
  csm.lights[0].shadow.needsUpdate=true;
  if(force){csm.lights.forEach((light,i)=>{light.shadow.needsUpdate=true;lastUpdate[i]=now;lastFrame[i]=frame;});}
  else{
   // Spread the larger maps over different frames to avoid periodic GPU spikes.
   const intervals=[0,.1,.22];let due=0,overdue=1;
   for(let i=1;i<3;i++){const age=(now-lastUpdate[i])/intervals[i];if(age>overdue&&frame-lastFrame[i]>=[0,4,8][i]){overdue=age;due=i;}}
   if(due){csm.lights[due].shadow.needsUpdate=true;lastUpdate[due]=now;lastFrame[due]=frame;}
  }
  lastEye.copy(camera.position);lastRotation.copy(camera.quaternion);lastDirection.copy(direction);
 }};
}
