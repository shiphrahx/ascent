import * as THREE from 'three';

// Connected tapered branches are opaque geometry: no alpha cards or LOD swaps.
export function winterCrown(random,{height=15,width=2,limbs=18,segments=3,sides=4,forks=3,trunkSides=6,trunkSegments=8,poplar=true}={}){
 const positions=[],indices=[],colors=[],tau=Math.PI*2;
 function branch(start,end,radius,tipRadius,bow,steps=segments,radial=sides){
  const first=positions.length/3,axis=end.clone().sub(start).normalize(),tangent=new THREE.Vector3(0,0,1).cross(axis).normalize(),bitangent=tangent.clone().cross(axis).normalize();
  for(let j=0;j<=steps;j++){
   const t=j/steps,center=start.clone().lerp(end,t).addScaledVector(bow,Math.sin(t*Math.PI)),r=THREE.MathUtils.lerp(radius,tipRadius,t);
   for(let k=0;k<=radial;k++){
    const a=k/radial*tau,p=center.clone().addScaledVector(tangent,Math.cos(a)*r).addScaledVector(bitangent,Math.sin(a)*r);positions.push(p.x,p.y,p.z);
    const color=.72+.24*(.5+.5*Math.sin(a*3+height));colors.push(color,color*.97,color*.9);
    if(j<steps&&k<radial){const q=first+j*(radial+1)+k;indices.push(q,q+radial+1,q+1,q+1,q+radial+1,q+radial+2);}
   }
  }
 }
 const top=new THREE.Vector3((random()-.5)*height*.05,height,(random()-.5)*height*.05),scale=height/15;
 branch(new THREE.Vector3(),top.clone().multiplyScalar(poplar?1:.66),.29*scale,.025*scale,new THREE.Vector3(.12*scale,0,-.08*scale),trunkSegments,trunkSides);
 for(let j=0;j<limbs;j++){
  const fraction=.14+j/limbs*(poplar?.73:.43),y=height*fraction,a=j*2.399+random()*.65,span=width*(.65+random()*.65)*(poplar?1-Math.pow(y/(height*1.2),2):1);
  const start=top.clone().multiplyScalar(fraction),tip=new THREE.Vector3(Math.cos(a)*span,y+height*(poplar?.15+random()*.2:.18+random()*.15),Math.sin(a)*span);
  branch(start,tip,.085*scale*(1-y/(height*1.6)),.015*scale,new THREE.Vector3(Math.cos(a)*.2*scale,-.22*scale,Math.sin(a)*.2*scale));
  for(let k=0;k<forks;k++){
   const fork=start.clone().lerp(tip,.42+k*.19),angle=a+(k%2?-.65:.7),end=tip.clone().add(new THREE.Vector3(Math.cos(angle)*width*(.2+random()*.3),height*(.035+random()*.07),Math.sin(angle)*width*(.2+random()*.3)));
   branch(fork,end,.027*scale,.006*scale,new THREE.Vector3(0,-.12*scale,0),segments>3?2:1,3);
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
