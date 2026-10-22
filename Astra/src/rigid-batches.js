import * as THREE from 'three';

// Preserve the animation hierarchy and collision objects. Only their rendering
// moves into instances; exact buffer comparisons prevent merging unlike shapes.
export function batchRigidParts(roots,scene){
 const hashes=new WeakMap(),buckets=new Map(),batches=[];
 function buffers(g){return [...Object.keys(g.attributes).sort().map(k=>[k,g.attributes[k]]),['index',g.index]].filter(([,a])=>a);}
 function key(g){
  if(hashes.has(g))return hashes.get(g);
  let hash=2166136261;
  const layout=buffers(g).map(([name,a])=>{
   const bytes=new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength);
   for(const byte of bytes)hash=Math.imul(hash^byte,16777619);
   return `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}:${a.array.length}`;
  }).join('|')+JSON.stringify(g.groups)+JSON.stringify(g.drawRange);
  const result=layout+':'+(hash>>>0);hashes.set(g,result);return result;
 }
 function equal(a,b){
  if(a===b)return true;
  const aa=buffers(a),bb=buffers(b);
  return aa.every(([,v],i)=>v.array.every((n,j)=>n===bb[i][1].array[j]));
 }
 for(const root of roots){
  root.updateWorldMatrix(true,true);
  root.traverse(o=>{
   if(!o.isMesh||o.isInstancedMesh||o.isSkinnedMesh||!o.visible||Array.isArray(o.material)||o.material.transparent||o.material.isShaderMaterial||o.morphTargetInfluences?.length||o.matrixWorld.determinant()<0||o.onBeforeRender!==THREE.Object3D.prototype.onBeforeRender)return;
   if(Object.values(o.geometry.attributes).some(a=>a.isInterleavedBufferAttribute))return;
   const id=[o.material.uuid,key(o.geometry),o.layers.mask,o.castShadow,o.receiveShadow,o.renderOrder,o.customDepthMaterial?.uuid,o.customDistanceMaterial?.uuid].join('/');
   const candidates=buckets.get(id)??[];let group=candidates.find(g=>equal(g[0].geometry,o.geometry));
   if(!group){group=[];candidates.push(group);buckets.set(id,candidates);}group.push(o);
  });
 }
 for(const candidates of buckets.values())for(const sources of candidates){
  if(sources.length<2)continue;
  const first=sources[0],mesh=new THREE.InstancedMesh(first.geometry,first.material,sources.length);
  mesh.name='Animated rigid parts';mesh.layers.mask=first.layers.mask;mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.renderOrder=first.renderOrder;mesh.customDepthMaterial=first.customDepthMaterial;mesh.customDistanceMaterial=first.customDistanceMaterial;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.userData.rigidBatch=true;
  for(const source of sources)source.layers.mask=0;
  scene.add(mesh);batches.push({mesh,sources});
 }
 const inverse=new THREE.Matrix4(),matrix=new THREE.Matrix4(),stats={batches:batches.length,parts:batches.reduce((n,b)=>n+b.sources.length,0),visibleParts:0};
 function update(){
  for(const root of roots)root.updateWorldMatrix(true,true);
  scene.updateWorldMatrix(true,false);inverse.copy(scene.matrixWorld).invert();stats.visibleParts=0;
  for(const {mesh,sources}of batches){
   let count=0,changed=false;const array=mesh.instanceMatrix.array;
   for(const source of sources){
    let visible=true;for(let p=source;p&&p!==scene;p=p.parent)if(!p.visible){visible=false;break;}
    if(!visible)continue;
    matrix.multiplyMatrices(inverse,source.matrixWorld);
    for(let j=0;j<16;j++){const index=count*16+j,value=Math.fround(matrix.elements[j]);if(array[index]!==value){array[index]=value;changed=true;}}
    count++;
   }
   if(mesh.count!==count){mesh.count=count;changed=true;}
   if(changed){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
   stats.visibleParts+=count;
  }
 }
 update();return {batches,stats,update};
}
