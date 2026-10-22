import {THREE,rng,TAU,ground,riverX,mat,mesh,box,rod,combine,stoneMaterial,archShape} from './core.js';

// Buildings are assembled with real wall thickness and openings, then merged
// by material. Detail therefore adds triangles rather than hundreds of draws.
export function createSettlement(scene,{x:cx,z:cz,surfaceHeight,obstacles,smokeSources,lampPoints,windowMat}){
 const random=rng(5829),masonry=stoneMaterial('#d2bea4',5),trim=stoneMaterial('#e1d0b8',5);
 const roof=mat('#887e6b',{roughness:.98}),wood=mat('#514234',{roughness:.88}),iron=mat('#333638',{metalness:.45,roughness:.63});
 const interior=mat('#1b1917'),glass=mat('#586366',{metalness:.12,roughness:.25});
 const buildings=new THREE.Group(),streets=new THREE.Group(),plots=[];
 const roadMat=stoneMaterial('#b5a28c',4),courtyard=mat('#9d9079',{roughness:1});
 function wall(parent,width,height,depth,position,rotation,openings){
  const shape=new THREE.Shape();shape.moveTo(-width/2,0);shape.lineTo(width/2,0);shape.lineTo(width/2,height);shape.lineTo(-width/2,height);shape.closePath();
  for(const opening of openings){
   const points=opening.arch?archShape(opening.w,opening.h).getPoints(12):[new THREE.Vector2(-opening.w/2,0),new THREE.Vector2(opening.w/2,0),new THREE.Vector2(opening.w/2,opening.h),new THREE.Vector2(-opening.w/2,opening.h)];
   shape.holes.push(new THREE.Path(points.map(p=>new THREE.Vector2(p.x+opening.x,p.y+opening.y))));
  }
  const frame=new THREE.Group();frame.position.set(...position);frame.rotation.y=rotation;parent.add(frame);
  const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:12});
  // Recesses lose indirect sky visibility without darkening sunlit facades.
  const ao=new Float32Array(g.attributes.position.count),p=g.attributes.position,n=g.attributes.normal;
  for(let i=0;i<ao.length;i++)ao[i]=Math.abs(n.getZ(i))<.7?.5+.5*p.getZ(i)/depth:1;
  g.setAttribute('aSurfaceAO',new THREE.BufferAttribute(ao,1));mesh(g,masonry,frame);
  for(const o of openings){
   if(o.door){
    box(frame,wood,[o.x,o.y+o.h*.5,.08],[o.w*.94,o.h,.1]);
    for(let k=1;k<5;k++)box(frame,iron,[o.x-o.w*.5+o.w*k/5,o.y+o.h*.5,.143],[.012,o.h*.97,.015]);
    box(frame,iron,[o.x+o.w*.28,o.y+1,.16],[.055,.18,.04]);
   }else{
    box(frame,interior,[o.x,o.y+o.h*.5,-.65],[o.w*1.4,o.h*1.3,.08]);
    const lit=random()<.23;
    box(frame,lit?windowMat:glass,[o.x,o.y+o.h*.48,.04],[o.w*.88,o.h*.91,.025]);
    for(const side of[-1,1])box(frame,wood,[o.x+side*o.w*.45,o.y+o.h*.5,.08],[.045,o.h,.07]);
    box(frame,wood,[o.x,o.y+o.h*.48,.08],[.05,o.h*.95,.07]);
    box(frame,wood,[o.x,o.y+o.h*.48,.08],[o.w,.045,.07]);
   }
   box(frame,trim,[o.x,o.y-.07,depth+.05],[o.w+.3,.14,.38]);
   if(!o.arch)box(frame,trim,[o.x,o.y+o.h+.12,depth+.025],[o.w+.44,.23,.22]);
  }
 }
 function house(parent,w,d,floors){
  const h=floors*3.05,wallDepth=.46,windows=[];
  for(let f=0;f<floors;f++)for(const side of[-1,1])windows.push({x:side*w*.29,y:f*3.05+1.05,w:.82+random()*.22,h:1.3,arch:floors===2&&f===1});
  windows.push({x:(random()-.5)*.3,y:.06,w:1.18,h:2.3,door:true,arch:false});
  wall(parent,w,h,wallDepth,[0,0,d/2-wallDepth],0,windows);
  wall(parent,d,h,wallDepth,[w/2-wallDepth,0,0],Math.PI/2,[{x:0,y:1.25,w:.75,h:1.05},...(floors>1?[{x:-d*.2,y:4.3,w:.8,h:1.05}]:[])]);
  wall(parent,d,h,wallDepth,[-w/2+wallDepth,0,0],-Math.PI/2,[{x:d*.18,y:1.2,w:.72,h:1.1}]);
  box(parent,masonry,[0,h/2,-d/2+.23],[w,h,.46]);
  box(parent,roof,[0,h-.08,0],[w,.2,d]);
  box(parent,trim,[0,h+.08,0],[w+.14,.2,d+.14]);
  box(parent,roof,[0,h+.195,0],[w-.48,.04,d-.48]);
  for(const side of[-1,1]){box(parent,masonry,[side*(w/2-.14),h+.4,0],[.28,.64,d]);box(parent,trim,[side*(w/2-.14),h+.74,0],[.38,.08,d+.08]);}
  for(const side of[-1,1]){box(parent,masonry,[0,h+.4,side*(d/2-.14)],[w-.4,.64,.28]);box(parent,trim,[0,h+.74,side*(d/2-.14)],[w,.08,.38]);}
  // Gutters, lintels, several roof heights, and occasional covered galleries
  // provide familiar scale cues without a regular grid of glowing windows.
  const chimneyX=w*.27,chimneyZ=-d*.24;
  box(parent,masonry,[chimneyX,h+.75,chimneyZ],[.6,1.25,.65]);
  box(parent,trim,[chimneyX,h+1.42,chimneyZ],[.78,.12,.83]);
  box(parent,interior,[chimneyX,h+1.485,chimneyZ],[.33,.01,.38]);
  rod(parent,[-w*.43,.3,d*.5+.09],[-w*.43,h+.25,d*.5+.09],.04,iron,6);
  if(random()<.3){
   box(parent,wood,[0,2.6,d*.5+1],[w*.8,.13,2.2]);
   for(const side of[-1,1])rod(parent,[side*w*.35,.08,d*.5+1.9],[side*w*.35,2.6,d*.5+1.9],.065,wood,6);
  }
  return {h,chimney:new THREE.Vector3(chimneyX,h+1.5,chimneyZ)};
 }
 for(let ring=0;ring<3;ring++){
  const radius=60+ring*31;
  // Streets follow contours around the citadel; houses address the street.
  const streetRadius=a=>radius+Math.sin(a*3+ring)*3+Math.sin(a*5+ring)*1.4;
  const ps=[],uv=[],ix=[];
  for(let j=0;j<=160;j++){
   const a=j/160*TAU,rr=streetRadius(a);
   for(const side of[-1,1]){const x=cx+Math.cos(a)*(rr+side*1.65),z=cz+Math.sin(a)*(rr+side*1.65);ps.push(x,ground(x,z)+.09,z);uv.push(side,j/6);}
   if(j<160){const q=j*2,x=cx+Math.cos(a)*rr,z=cz+Math.sin(a)*rr;if(surfaceHeight(x,z)<ground(x,z)+.3&&Math.abs(x-riverX(z))>18)ix.push(q,q+2,q+1,q+1,q+2,q+3);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();mesh(g,roadMat,streets).castShadow=false;
  const count=27+ring*13;
  for(let i=0;i<count;i++){
   if(random()<.12)continue;
   const angle=(i+.17*(random()-.5))/count*TAU,rr=streetRadius(angle)+7.5;
   const x=cx+Math.cos(angle)*rr,z=cz+Math.sin(angle)*rr,w=5.3+random()*3.1,d=5+random()*2.8;
   if(Math.abs(x-riverX(z))<28||surfaceHeight(x,z)>ground(x,z)+.5)continue;
   const rotation=Math.atan2(-Math.cos(angle),-Math.sin(angle));
   const transform=(lx,lz)=>[x+Math.cos(rotation)*lx+Math.sin(rotation)*lz,z-Math.sin(rotation)*lx+Math.cos(rotation)*lz];
   const corners=[[-w/2,-d/2],[-w/2,d/2],[w/2,-d/2],[w/2,d/2]].map(p=>transform(...p));
   const levels=corners.map(([xx,zz])=>ground(xx,zz));
   if(corners.some(([xx,zz])=>surfaceHeight(xx,zz)>ground(xx,zz)+.6)||Math.max(...levels)-Math.min(...levels)>5)continue;
   const floor=Math.max(...levels)+.12,base=Math.min(...levels)-.4,b=new THREE.Group();b.position.set(x,floor,z);b.rotation.y=rotation;buildings.add(b);
   const floors=random()<.37?2:1,result=house(b,w,d,floors);
   box(b,masonry,[0,(base-floor)/2,0],[w,floor-base,d]);
   const front=transform(0,d/2+1),rise=floor-ground(...front),steps=Math.max(1,Math.ceil(rise/.22));
   for(let step=0;step<Math.min(steps,18);step++)box(b,trim,[0,-step*.22-.11,d/2+.22+step*.27],[1.7,.22,.46]);
   if(i%4===0){b.updateMatrixWorld(true);smokeSources.push(result.chimney.clone().applyMatrix4(b.matrixWorld));}
   if(i%3===0){b.updateMatrixWorld(true);lampPoints.push(new THREE.Vector3(w*.3,1.8,d/2+.2).applyMatrix4(b.matrixWorld));}
   const rx=Math.abs(Math.cos(rotation))*w*.5+Math.abs(Math.sin(rotation))*d*.5,rz=Math.abs(Math.sin(rotation))*w*.5+Math.abs(Math.cos(rotation))*d*.5;
   obstacles.push({x,z,y:base,h:floor-base+result.h+1.5,box:true,rx:rx+.3,rz:rz+.3});
   if(random()<.5){
    box(b,courtyard,[0,-.04,d/2+2.6],[w,.12,3.7]);
    for(const side of[-1,1])box(b,masonry,[side*w*.5,.45,d/2+2.6],[.35,.9,3.7]);
   }
   plots.push({x,z,width:w,depth:d,floors,floor,base,rotation});
  }
 }
 const baked=combine(buildings);baked.name='Contour village';scene.add(baked);scene.add(streets);
 return {material:masonry,plots};
}
