import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
const source=(await readFile('src/rigid-batches.js','utf8')).replace("from 'three'",`from '${import.meta.resolve('three')}'`);
const {batchRigidParts}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const scene=new THREE.Scene(),roots=[new THREE.Group(),new THREE.Group()],material=new THREE.MeshStandardMaterial(),parts=[];
for(let i=0;i<2;i++){
 scene.add(roots[i]);roots[i].position.set(i*12,2,3);
 const parent=new THREE.Group();parent.rotation.z=.3;roots[i].add(parent);
 const part=new THREE.Mesh(new THREE.BoxGeometry(1,2,3),material);part.position.set(1,4,2);part.layers.mask=5;part.castShadow=true;parent.add(part);parts.push(part);
}
const different=new THREE.Mesh(new THREE.BoxGeometry(1,2,3),material);different.geometry.attributes.position.setX(0,.6);roots[0].add(different);
const mirrored=parts[0].clone();mirrored.scale.x=-1;roots[0].add(mirrored);
const result=batchRigidParts(roots,scene);assert.equal(result.stats.batches,1);assert.equal(result.stats.parts,2);
const {mesh}=result.batches[0];assert.equal(mesh.layers.mask,5);assert(mesh.castShadow);assert.equal(different.layers.mask,1);assert.equal(mirrored.layers.mask,5);
const matrix=new THREE.Matrix4();
function check(){result.update();parts.forEach((p,i)=>{mesh.getMatrixAt(i,matrix);p.matrixWorld.elements.forEach((v,j)=>assert(Math.abs(v-matrix.elements[j])<.00001));});}
check();roots[0].position.x+=6;parts[1].rotation.y=1.1;check();
const version=mesh.instanceMatrix.version;result.update();assert.equal(mesh.instanceMatrix.version,version,'Paused transforms do not upload again');
roots[0].visible=false;result.update();assert.equal(mesh.count,1);mesh.getMatrixAt(0,matrix);assert(Math.abs(matrix.elements[12]-parts[1].matrixWorld.elements[12])<.00001);
roots[1].visible=false;result.update();assert.equal(mesh.count,0);roots.forEach(r=>r.visible=true);check();assert.equal(mesh.count,2);
console.log('Rigid batches: exact shape matching, transforms, layers, mirrored exclusion, ancestor visibility and paused uploads passed.');
