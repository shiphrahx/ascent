import {THREE,rand,rng,TAU,noise,pathX,riverX,riverBanks,terrainGeometry,ground,mat,mesh,box,sphere,rod,tube,combine,stoneMaterial,colors,archShape,uniforms,canvasTexture,smooth,lerp,instanceCells,landscapeCells} from './core.js';
import {addWinterGrass,addWinterTrees} from './vegetation.js';
import {createSettlement} from './settlement.js';
import {carveOpenings} from './carving.js';
import {createRiver} from './river.js';
import {TessellateModifier} from 'three/addons/modifiers/TessellateModifier.js';
import {erodedRock,erodedRidge,ridgeSurface,landNoise,volcanicMassif,configureGeology} from './geology.js';
import {configureTerrain} from './core.js';
import {createFarTerrain} from './far-terrain.js';
import {formationLayout} from './formations.js';
import {createTerrainLighting} from './terrain-lighting.js';
import {createTerrainShadows} from './terrain-shadows.js';
const cream=stoneMaterial('#dfcab2'),rose=stoneMaterial('#d0a39a',1),basalt=stoneMaterial('#5b5149',2),dark=mat('#211d21'),wood=mat('#695d50'),metal=mat('#555d61',{metalness:.7,roughness:.4});
const windowMat=mat('#ffd2a0',{emissive:'#ff9b42',emissiveIntensity:0,roughness:.6});
export function surfaceHeight(x,z){let y=ground(x,z);if(z<-1500||z>1500)return y;for(let i=0;i<6;i++)y=Math.max(y,ridgeSurface(x,z,i));return y;}
export const obstacles=[],smokeSources=[],lampPoints=[],horses=[],birds=[];
export const chimneyGeometry=erodedRock;
function addCave(parent,x,y,z,angle,w=1.6,h=2.5){const group=new THREE.Group();group.position.set(x,y,z);group.rotation.y=angle;parent.add(group);const frame=new THREE.Shape();frame.moveTo(-w*.66,-.12);frame.lineTo(w*.66,-.12);frame.lineTo(w*.66,h-w*.42);frame.absarc(0,h-w*.42,w*.66,0,Math.PI,false);frame.lineTo(-w*.66,-.12);const hole=new THREE.Path(archShape(w,h).getPoints(18));frame.holes.push(hole);mesh(new THREE.ExtrudeGeometry(frame,{depth:.22,bevelEnabled:true,bevelSize:.07,bevelThickness:.06,bevelSegments:2,steps:1}),cream,group);mesh(new THREE.ShapeGeometry(archShape(w,h)),dark,group,[0,0,-.06]);if(w<1.3){box(group,windowMat,[0,h*.4,-.035],[w*.65,h*.55,.02]);box(group,wood,[0,h*.42,.02],[.08,h*.65,.06]);}else{for(let i=0;i<5;i++)box(group,cream,[0,-i*.25-.16,i*.24+.15],[w*1.5,.22,.5]);}return group;}
function fitCarving(group,rock){
 group.updateWorldMatrix(true,true);rock.updateWorldMatrix(true,false);const base=group.getWorldPosition(new THREE.Vector3()).z,rc=new THREE.Raycaster(),cache=new Map(),p=new THREE.Vector3(),d=new THREE.Vector3(0,0,-1);
 function surface(x,y){const key=x.toFixed(3)+','+y.toFixed(3);if(cache.has(key))return cache.get(key);rc.set(new THREE.Vector3(x,y,base+150),d);const hits=rc.intersectObject(rock,false),z=hits.length?hits[0].point.z:base;cache.set(key,z);return z;}
 group.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone(),a=g.attributes.position,inverse=o.matrixWorld.clone().invert();for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);p.z=surface(p.x,p.y)+(p.z-base)+.10;p.applyMatrix4(inverse);a.setXYZ(i,p.x,p.y,p.z);}g.computeVertexNormals();o.geometry=g;});
}
export function createWorld(scene,renderer,camera){
 configureTerrain(renderer.ascentQuality);
 configureGeology(renderer.ascentQuality);
 const terrain=terrainGeometry();colors(terrain,(x,y,z)=>{const n=noise(x*3,z*3)*.025,shade=.95+n;return new THREE.Color(shade,shade*.97,shade*.92);});landscapeCells(terrain,stoneMaterial('#fff8ed',4),scene,600).name='Valley terrain';
 const farTerrain=createFarTerrain(scene,renderer);
 const ridgeSoilDetail=renderer.ascentQuality.name==='high';
 const ridgeStone=[stoneMaterial('#dfcab2',6,ridgeSoilDetail),stoneMaterial('#d0a39a',6,ridgeSoilDetail)];
 for(let i=0;i<6;i++)landscapeCells(erodedRidge(i),ridgeStone[i%3===0?1:0],scene).name=`Eroded ridge ${i}`;
 const farField=farTerrain.texture.image,farSize=farField.width;
 function lightingHeight(x,z){
  const u=THREE.MathUtils.clamp((x/65536+.5)*(farSize-1),0,farSize-1),v=THREE.MathUtils.clamp((z/65536+.5)*(farSize-1),0,farSize-1);
  const ix=Math.min(farSize-2,Math.floor(u)),iz=Math.min(farSize-2,Math.floor(v)),fx=u-ix,fz=v-iz,q=iz*farSize+ix,d=farField.data;
  const distant=lerp(lerp(d[q],d[q+1],fx),lerp(d[q+farSize],d[q+farSize+1],fx),fz);
  return Math.max(surfaceHeight(x,z),distant);
 }
 const terrainLighting=createTerrainLighting(lightingHeight,renderer.ascentQuality);
 const terrainShadows=createTerrainShadows(lightingHeight,renderer);
 const volcano=mesh(volcanicMassif(),stoneMaterial('#e6dfd6',3),scene,[-6000,100,-17000],[1.8,1.8,1.8]);volcano.castShadow=false;
 const variants=Array.from({length:12},(_,i)=>chimneyGeometry(i+10));const capVariants=Array.from({length:6},(_,i)=>chimneyGeometry(i+70,true));const batches=Array.from({length:12},()=>[]),caps=Array.from({length:6},()=>[]);const dummy=new THREE.Object3D();
 // Related columns share overlapping talus bases along the first cliff feet.
 // A cluster's own seed keeps placement stable when another rock is rejected.
 const clearings=[{x:pathX(350)+123,z:350,r:65},{x:pathX(500)-155,z:500,r:45},{x:pathX(-70)+158,z:-70,r:145},{x:riverX(-650),z:-650,r:36}];
 const formations=formationLayout({ground,surfaceHeight,pathX,riverX,clearings,tier:renderer.ascentQuality.name,rng});
 const carved=formations.filter(f=>f.member===0&&f.z> -300&&f.z<900).sort((a,b)=>Math.abs(a.z-450)-Math.abs(b.z-450)).slice(0,renderer.ascentQuality.name==='high'?5:renderer.ascentQuality.name==='lite'?2:3);
 const formationCarvings=[];
 for(const f of formations){
  const {x,y,z,h,r,v,yaw,depth}=f;
  dummy.position.set(x,y,z);dummy.scale.set(r,h,r*depth);dummy.rotation.set(0,yaw,0);dummy.updateMatrix();
  const stone=v%4===0?rose:cream;
  if(carved.includes(f)){
   const group=new THREE.Group();group.position.set(x,y,z);scene.add(group);
   const rock=mesh(variants[v],stone,group,[0,0,0],[r,h,r*depth]);rock.rotation.y=yaw;rock.name='Carved fairy chimney';
   let entrance=5;
   for(const u of [.25,.5,.75,1.])for(const side of [-1,0,1])entrance=Math.max(entrance,surfaceHeight(x+side,z+r*depth*u)-y+1.2);
   const openings=[{x:0,y:entrance,w:1.7,h:2.8},{x:r*.12,y:entrance+5,w:1.1,h:1.8}];
   const carving=carveOpenings(rock,group,openings,stone,fitCarving,512);
   formationCarvings.push({rock,mask:carving.mask,count:carving.count,position:[x,y,z],entrance:y+entrance});
  }else batches[v].push(dummy.matrix.clone());
  obstacles.push({x,z,y,h:h*(f.cap?1.04:1),r:r*1.3});
  if(f.cap){dummy.position.y+=h*.89;dummy.scale.set(r*.75,h*.15,r*depth*.75);dummy.updateMatrix();caps[v%6].push(dummy.matrix.clone());}
 }
 batches.forEach((arr,i)=>scene.add(instanceCells(variants[i],i%4===0?rose:cream,arr)));caps.forEach((arr,i)=>scene.add(instanceCells(capVariants[i],basalt,arr)));
 // Smaller fallen fragments establish the scale of the larger formations.
 const rubbleRandom=rng(4251),rubbleMatrices=[],rubbleGeo=new THREE.IcosahedronGeometry(1,1),rubblePositions=rubbleGeo.attributes.position;
 for(let i=0;i<rubblePositions.count;i++){const x=rubblePositions.getX(i),y=rubblePositions.getY(i),z=rubblePositions.getZ(i),r=.8+landNoise(x*3+12,z*3+y)*.35;rubblePositions.setXYZ(i,x*r,y*r*.65,z*r);}rubbleGeo.computeVertexNormals();colors(rubbleGeo,()=>new THREE.Color(.9,.87,.82));
 for(const rock of obstacles)for(let i=0;i<5;i++){
  const a=rubbleRandom()*TAU,r=rock.r*(.8+rubbleRandom()*.9),x=rock.x+Math.cos(a)*r,z=rock.z+Math.sin(a)*r,scale=.2+Math.pow(rubbleRandom(),2)*1.5,y=surfaceHeight(x,z);
  if(y>ground(x,z)+12||Math.abs(x-riverX(z))<15)continue;
  dummy.position.set(x,y+scale*.18,z);dummy.scale.set(scale,scale,scale*(.65+rubbleRandom()*.7));dummy.rotation.set(0,rubbleRandom()*TAU,(rubbleRandom()-.5)*.4);dummy.updateMatrix();rubbleMatrices.push(dummy.matrix.clone());
 }
 const rubble=instanceCells(rubbleGeo,cream,rubbleMatrices,240);rubble.traverse(o=>{if(o.isMesh)o.userData.smallDebris=true;});scene.add(rubble);
 // Rock-cut sanctuary, a deep carved portico with six columns.
 const cz=350,cx=pathX(cz)+123,cy=ground(cx,cz);const church=new THREE.Group();church.position.set(cx,cy-1,cz);scene.add(church);
 const cliff=new THREE.Shape();cliff.moveTo(-28,-8);cliff.lineTo(28,-8);cliff.lineTo(27,12);cliff.quadraticCurveTo(24,23,18,27);cliff.lineTo(12,35);cliff.quadraticCurveTo(6,49,-1,48);cliff.lineTo(-9,39);cliff.lineTo(-14,29);cliff.quadraticCurveTo(-25,24,-28,12);cliff.closePath();
 const arch=archShape(23,17);const opening=new THREE.Path(arch.getPoints(40).map(p=>new THREE.Vector2(p.x,p.y+1)));cliff.holes.push(opening);
 for(let i=-2;i<=2;i++){const h=archShape(1.3,2.4);cliff.holes.push(new THREE.Path(h.getPoints(16).map(p=>new THREE.Vector2(p.x+i*4,p.y+24))));}
 const churchBase=new THREE.ExtrudeGeometry(cliff,{depth:26,steps:1,curveSegments:24,bevelEnabled:true,bevelSegments:3,bevelSize:.32,bevelThickness:.25});
 const cgChurch=new TessellateModifier(4,5).modify(churchBase);churchBase.dispose();
 const cp=cgChurch.attributes.position,churchAO=new Float32Array(cp.count);churchAO.fill(1);
 for(let i=0;i<cp.count;i++){
  const x=cp.getX(i),y=cp.getY(i),z=cp.getZ(i),natural=Math.max(smooth(Math.abs(x),12,17),smooth(y,17,23));
  const relief=(landNoise(x*.12+7,y*.1)-.5)*2.8+(landNoise(x*.45,y*.28)-.5)*.6;cp.setZ(i,z+relief*natural);
  // Sky visibility falls inside the deep carved tunnel. Apply this only to
  // indirect light, so sunlight can still reach and illuminate the entrance.
  const interior=Math.abs(cgChurch.attributes.normal.getZ(i))<.85&&((Math.abs(x)<12&&y<18.5&&y>.5)||(y>23.5&&y<27&&Math.abs(x)<10));
  if(interior)churchAO[i]=.1+.9*Math.pow(smooth(z,0,26),2.5);
 }
 cgChurch.setAttribute('aSurfaceAO',new THREE.BufferAttribute(churchAO,1));cgChurch.attributes.uv.array.forEach((v,i,a)=>a[i]=v*.11);cgChurch.computeVertexNormals();mesh(cgChurch,cream,church,[0,0,-14]);
 box(church,cream,[0,.3,0],[48,1.5,34]);box(church,dark,[0,9,-12.9],[23,17,.1]);
 for(let i=-3;i<=3;i++){const x=i*3.4;rod(church,[x,1,12.4],[x,12,12.4],.62,cream,16,.48);box(church,cream,[x,12.2,12.4],[1.5,.7,1.5]);box(church,cream,[x,1.4,12.4],[1.7,.8,1.7]);}
 box(church,cream,[0,12.8,12.4],[23.5,.6,2]);for(let i=-2;i<=2;i++)addCave(church,i*3.8,1.2,-12.6,0,2.5,7);
 for(let i=0;i<7;i++)box(church,cream,[0,.8-i*.25,13+i*.85],[26,.3,2.5]);obstacles.push({x:cx,z:cz,y:cy,h:48,r:30,box:true,rx:29,rz:17});
 // Pigeon houses set in a curved cliff, surrounded by ochre-red bands.
 const doveFrame=mat('#995544');const dz=500,dx=pathX(dz)-155,dy=ground(dx,dz),dove=new THREE.Group();dove.position.set(dx,dy,dz);scene.add(dove);const doveRock=mesh(chimneyGeometry(17),rose,dove,[0,-1,-6],[22,42,13]),doveCarvings=new THREE.Group();doveCarvings.position.z=5.6;dove.add(doveCarvings);for(let j=0;j<5;j++)for(let i=0;i<7;i++){const x=(i-3)*1.8,y=9+j*2;box(doveCarvings,doveFrame,[x,y,0],[1.1,.95,.09]);box(doveCarvings,dark,[x,y,.06],[.58,.57,.1]);box(doveCarvings,cream,[x,y-.55,.2],[1.3,.14,.6]);}fitCarving(doveCarvings,doveRock);
 // Honeycombed citadel, grounded into the village hill.
 const vz=-70,vx=pathX(vz)+158,vy=ground(vx,vz),castle=new THREE.Group();castle.position.set(vx,vy-3,vz);scene.add(castle);
 const castleRock=mesh(chimneyGeometry(56),cream,castle,[0,0,0],[47,91,36]);
 mesh(chimneyGeometry(54),cream,castle,[-26,-2,3],[25,57,24]);mesh(chimneyGeometry(58),cream,castle,[28,-1,-8],[25,68,24]);
 obstacles.push({x:vx,z:vz,y:vy-3,h:91,r:53});const carveRandom=rng(676),castleOpenings=[];
 for(let j=0;j<8;j++)for(let i=0;i<6;i++){
  if(carveRandom()<.22)continue;
  const y=7+j*8.7+carveRandom()*2.3,x=(i-2.5)*7.5*Math.pow(1-y/110,.55)+(carveRandom()-.5)*2,w=1.15+carveRandom()*.9,h=1.9+carveRandom()*1.2;
  castleOpenings.push({x,y,w,h});
 }
 const castleCarving=carveOpenings(castleRock,castle,castleOpenings,cream,fitCarving);
 const settlement=createSettlement(scene,{x:vx,z:vz,surfaceHeight,obstacles,smokeSources,lampPoints,windowMat});const houseMat=settlement.material;
 // Bare winter poplars, branching apricot trees, trellises and walls.
 const treeWood=mat('#625b4e'),trees=addWinterTrees(scene);
 const farms=new THREE.Group();for(let f=0;f<7;f++){const z=-900+f*280,x=pathX(z)+140*(f%2?1:-1);for(let row=0;row<5;row++){const xx=x+row*6;for(let col=0;col<12;col++){const zz=z+col*4,y=ground(xx,zz);rod(farms,[xx,y,zz],[xx,y+1.5,zz],.09,wood,5);if(col<11)rod(farms,[xx,y+1,zz],[xx,ground(xx,zz+4)+1,zz+4],.025,metal,4);} }for(let j=0;j<20;j++){const xx=x+j*2.1,zz=z-6;box(farms,cream,[xx,ground(xx,zz)+.5,zz],[2.1,1.1,1.3]);}if(f%2===0)for(let j=0;j<9;j++){const xx=x+rand()*35,zz=z+60+rand()*30,yy=ground(xx,zz);rod(farms,[xx,yy,zz],[xx+.4,yy+3,zz],.2,treeWood,6,.1);for(let k=0;k<5;k++){const a=k*TAU/5,tip=[xx+Math.cos(a)*2.2,yy+4.5+rand(),zz+Math.sin(a)*2.2];rod(farms,[xx+.4,yy+2.4,zz],tip,.07,treeWood,5,.02);}}}scene.add(combine(farms));
 // The bridge has an open arch, an intrados and individual stone voussoirs.
 const bz=-650,bx=riverX(bz),bridge=new THREE.Group();bridge.position.set(bx,3.6,bz);scene.add(bridge);const wall=new THREE.Shape();wall.moveTo(-20,0);wall.lineTo(-20,8);wall.quadraticCurveTo(0,16,20,8);wall.lineTo(20,0);wall.lineTo(10,0);wall.absarc(0,0,10,0,Math.PI,false);wall.lineTo(-20,0);const bg=new THREE.ExtrudeGeometry(wall,{depth:5,bevelEnabled:false,curveSegments:32});mesh(bg,houseMat,bridge,[0,0,-2.5]);for(let i=0;i<25;i++){const a=(i+.5)/25*Math.PI;const m=box(bridge,cream,[Math.cos(a)*10.4,Math.sin(a)*10.4,0],[1.1,.9,5.4]);m.rotation.z=a-Math.PI/2;}for(let i=0;i<40;i++){const x=-20+i,h=8+4*(1-x*x/400);for(let k of[-1,1])box(bridge,cream,[x,h+.7,k*2.4],[1,1.1,.55]);}
 // Two meadow clearings and compact, grounded ground-support equipment.
 const fieldMat=mat('#918b6b');for(const z of[1100,-1190]){const x=pathX(z)-(z<0?80:0);const fg=new THREE.PlaneGeometry(140,110,20,20);fg.rotateX(-Math.PI/2);const fp=fg.attributes.position;for(let i=0;i<fp.count;i++)fp.setY(i,ground(fp.getX(i)+x,fp.getZ(i)+z)+.035);fg.computeVertexNormals();fg.dispose();const eq=new THREE.Group();for(let i=0;i<8;i++){const xx=x+50,zz=z+i*3,yy=ground(xx,zz);box(eq,wood,[xx,yy+.7,zz],[1.3,1.4,1.8]);}scene.add(combine(eq));}
 const water=createRiver(scene,renderer);
 // These landmarks never animate: merge their hundreds of pieces by material.
 // The perforated citadel retains its custom shadow material when batching.
 scene.attach(castleRock);
 for(const landmark of [church,dove,castle,bridge]){const baked=combine(landmark);scene.remove(landmark);scene.add(baked);}
 addWinterGrass(scene);createWildlife(scene);
 return {farTerrain,terrainLighting,terrainShadows,formations,formationGeometry:variants,formationCarvings,trees,water,windowMat,settlement,castleCarving,landmarks:{church:[cx,cy,cz],dovecotes:[dx,dy,dz],castle:[vx,vy,vz],bridge:[bx,3.6,bz]},update(t,dt,state){farTerrain.update(camera);terrainLighting.update(t,state.lighting);terrainShadows.update(state.lighting);windowMat.emissiveIntensity=state.night*2.7;updateWildlife(t,state);}};
}
function createWildlife(scene){const feather=mat('#5c5552');for(let i=0;i<44;i++){const group=new THREE.Group(),eagle=i<2;const wing=new THREE.Shape();wing.moveTo(0,0);wing.quadraticCurveTo(.5,.3,1.5,.13);wing.lineTo(1.85,-.15);wing.lineTo(1.2,-.08);wing.lineTo(.7,-.25);wing.lineTo(0,-.12);const g=new THREE.ShapeGeometry(wing);g.rotateX(-Math.PI/2);const a=mesh(g,mat(eagle?'#423c3d':'#aaa8a3',{side:THREE.DoubleSide}),group);const b=mesh(g,a.material,group);b.scale.x=-1;sphere(group,feather,[0,0,0],[.14,.12,.43],8);group.scale.setScalar(eagle?1.3:.35);scene.add(group);birds.push({group,a,b,eagle,phase:rand()*TAU});}
 const coat=mat('#806657'),mane=mat('#352e2b'),hoof=mat('#403a39');for(let i=0;i<8;i++){const g=new THREE.Group();sphere(g,coat,[0,1.35,0],[1.1,.6,.43]);const n=sphere(g,coat,[.85,1.8,0],[.35,.7,.3]);n.rotation.z=-.4;sphere(g,coat,[1.15,2.3,0],[.46,.24,.23]);for(const z of[-.2,.2])rod(g,[.98,2.4,z],[.95,2.72,z],.08,mane,5,.02);const legs=[];for(const x of[-.7,.65])for(const z of[-.3,.3]){const l=new THREE.Group();l.position.set(x,1.1,z);rod(l,[0,0,0],[0,-.95,0],.11,coat,7,.08);box(l,hoof,[.07,-1.04,0],[.25,.17,.2]);g.add(l);legs.push(l);}tube(g,[[-.9,1.5,0],[-1.4,1.2,0],[-1.5,.7,0]],.09,mane,10);const x=pathX(780)+70+rand()*35,z=760+rand()*55;g.position.set(x,ground(x,z),z);scene.add(g);horses.push({group:g,legs,x,z,phase:rand()*TAU});}}
function updateWildlife(t,state){for(let i=0;i<birds.length;i++){const b=birds[i],a=t*(b.eagle?.08:.22)+b.phase,rad=b.eagle?95:25+(i%5)*3,z=b.eagle?200:500,x=pathX(z)-(b.eagle?0:155);b.group.position.set(x+Math.cos(a)*rad,(b.eagle?145:65)+Math.sin(a*2)*7,z+Math.sin(a)*rad);b.group.rotation.set(Math.sin(a)*.1,-a,Math.cos(a)*.25);const flap=b.eagle?Math.sin(t*1.8+b.phase)*.06:Math.sin(t*9+b.phase)*.62;b.a.rotation.z=flap;b.b.rotation.z=-flap;}for(const h of horses){const near=state.hero.distanceTo(h.group.position)<95,speed=near?1:0;h.group.position.x=h.x+Math.sin(t*.5+h.phase)*speed*12;h.group.position.z=h.z+Math.cos(t*.5+h.phase)*speed*12;h.group.position.y=ground(h.group.position.x,h.group.position.z)+Math.abs(Math.sin(t*7))*speed*.12;h.group.rotation.y=near?t*.5+h.phase:Math.sin(t*.07+h.phase)*.3;h.legs.forEach((l,j)=>l.rotation.z=Math.sin(t*8+j*2)*speed*.6);}}
