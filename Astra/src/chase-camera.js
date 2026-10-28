import * as THREE from 'three';
import {springPosition} from './camera-spring.js';

export function createChaseCamera(camera,hero,fleet,pushOut){
 const velocity=new THREE.Vector3(),centre=new THREE.Vector3(),desired=new THREE.Vector3(),target=new THREE.Vector3(),offset=new THREE.Vector3(),actorCentre=new THREE.Vector3();
 function exclude(point){offset.copy(camera.position).sub(point);if(offset.lengthSq()<196){if(offset.lengthSq()<1e-8)offset.set(0,0,1);camera.position.copy(point).addScaledVector(offset.normalize(),14);}}
 return {target,reset(){velocity.set(0,0,0);},update(dt,angle,elevation,distance){
  centre.set(0,17,0).applyQuaternion(hero.group.quaternion).add(hero.group.position);
  target.copy(centre);target.y+=2.5;
  desired.copy(centre).add(offset.set(Math.sin(angle)*distance,Math.sin(elevation)*distance,Math.cos(angle)*distance));
  pushOut(desired,3,true);springPosition(camera.position,velocity,desired,dt);
  pushOut(camera.position,3,true);
  for(const balloon of fleet){actorCentre.copy(balloon.group.position);actorCentre.y+=17;exclude(actorCentre);}
  exclude(centre);camera.lookAt(target);camera.updateMatrixWorld();
 }};
}
