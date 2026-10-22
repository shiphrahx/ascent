import {THREE,ground,pathX,colors,lerp,smooth,rng,TAU} from './core.js';

// Continuous noise keeps erosion features coherent across adjacent rock faces.
function hash(x,z){let h=Math.imul(x,374761393)+Math.imul(z,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
export function landNoise(x,z){const ix=Math.floor(x),iz=Math.floor(z);let u=x-ix,v=z-iz;u=u*u*(3-2*u);v=v*v*(3-2*v);return lerp(lerp(hash(ix,iz),hash(ix+1,iz),u),lerp(hash(ix,iz+1),hash(ix+1,iz+1),u),v);}
function strata(x,z){return landNoise(x,z)*.58+landNoise(x*2.03+13,z*2.03+7)*.28+landNoise(x*4.11-9,z*4.11+19)*.14;}
const length=3000,rows=600,columns=44;
const ridgeCache=[];
function ridgeParameters(z,index){const side=index%2?1:-1,layer=index>>1;return {center:pathX(z)+side*(250+layer*185+38*(landNoise(z*.006,index*17)-.5)),width:155+layer*25,side,layer};}
function ridgeHeight(z,t,index){
 if(t<=0||t>=1||z< -1500||z>1500)return 0;
 const layer=index>>1,axis=.46+(landNoise(z*.009,index*17)-.5)*.19;
 const across=t<axis?t/axis:(1-t)/(1-axis),shoulder=Math.pow(Math.sin(across*Math.PI*.5),.88);
 const side=t<axis?0:1,runoff=1-across;
 // Drainage cuts widen downhill and wander into tributaries. Larger saddles
 // interrupt the cliff instead of making one unbroken, corrugated curtain.
 const along=z/47+(landNoise(z*.007,side+index*11)-.5)*.8+runoff*runoff*(side?1:-1)*.6;
 const cell=Math.floor(along);let cut=0;
 for(let k=cell-1;k<=cell+1;k++){
  const center=k+.2+hash(k,index*7+side)*.6,width=.055+runoff*.21;
  const d=(along-center)/width;
  cut+=Math.exp(-d*d)*( .12+runoff*.55)*(.6+hash(k,21+index)*.5);
  const branch=(along-center-.22*Math.sin(runoff*4+hash(k,8)*3))/(width*.45);
  cut+=Math.exp(-branch*branch)*.11*Math.sin(Math.PI*runoff);
 }
 const crest=(46+layer*32)*(.66+landNoise(z*.012,index*31)*.55);
 const saddle=.58+.42*smooth(landNoise(z*.004,index*19+2),.18,.7);
 const ledge=(landNoise(z*.04,index+t*4)-.5)*2.2*Math.sin(across*Math.PI);
 return Math.max(0,shoulder*crest*saddle*(1-Math.min(.76,cut))+ledge)*smooth(1500-Math.abs(z),0,140);
}
function ridgeData(index){
 if(ridgeCache[index])return ridgeCache[index];
 const centers=new Float64Array(rows+1),heights=new Float32Array((rows+1)*(columns+1)),width=155+(index>>1)*25;
 for(let j=0;j<=rows;j++){
  const z=j/rows*length-1500,p=ridgeParameters(z,index);centers[j]=p.center;
  for(let k=0;k<=columns;k++){const t=k/columns,x=p.center+(t-.5)*width;heights[j*(columns+1)+k]=ground(x,z)+ridgeHeight(z,t,index)-.45;}
 }
 return ridgeCache[index]={centers,heights,width};
}
export function ridgeSurface(x,z,index){
 if(Math.abs(z)>1500)return ground(x,z);
 // Sample the same triangular grid used by the mesh, including its drifting axis.
 const data=ridgeData(index),step=length/rows,j=Math.min(rows-1,Math.floor((z+1500)/step)),fz=(z+1500)/step-j;
 const t=(x-lerp(data.centers[j],data.centers[j+1],fz))/data.width+.5;
 if(t<=0||t>=1)return ground(x,z);
 const k=Math.min(columns-1,Math.floor(t*columns)),fx=t*columns-k;
 const q=j*(columns+1)+k,h=data.heights,a=h[q],b=h[q+1],c=h[q+columns+1],d=h[q+columns+2];
 return fx+fz<=1?a+fx*(b-a)+fz*(c-a):d+(1-fx)*(c-d)+(1-fz)*(b-d);
}
export function erodedRidge(index){
 const positions=[],uv=[],indices=[],data=ridgeData(index);
 for(let j=0;j<=rows;j++){
  const z=-1500+j/rows*length;
  for(let k=0;k<=columns;k++){
   const t=k/columns,x=data.centers[j]+(t-.5)*data.width;
   positions.push(x,data.heights[j*(columns+1)+k],z);uv.push(x*.1,z*.1);
   if(j<rows&&k<columns){const q=j*(columns+1)+k;indices.push(q,q+columns+1,q+1,q+1,q+columns+1,q+columns+2);}
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
 return colors(g,(x,y,z)=>{const n=strata(x*.018,z*.018),red=smooth(y+landNoise(x*.01,z*.01)*12,65,105)*(1-smooth(y,110,145));return new THREE.Color(.86+n*.12,.82+n*.13-red*.07,.75+n*.15-red*.09);});
}

export function erodedRock(seed=1,cap=false){
 // Spend the denser vertical grid on the close citadel. Thin capstones and
 // repeated valley remnants need fewer rings to retain the same silhouette.
 const random=rng(seed),phase=random()*TAU,kind=seed%6,segments=cap?48:64,rings=cap?16:seed>=50?48:36,ps=[],uv=[],indices=[],ao=[];
 const leanX=(random()-.5)*.22,leanZ=(random()-.5)*.19;
 const gullies=Array.from({length:7},()=>({a:random()*TAU,width:.07+random()*.15,depth:.08+random()*.13,drift:(random()-.5)*.65,split:.25+random()*.4}));
 const joints=Array.from({length:3},()=>({h:.2+random()*.65,depth:.008+random()*.02,tilt:(random()-.5)*.045}));
 for(let j=0;j<=rings;j++){
  const t=j/rings;
  for(let i=0;i<=segments;i++){
   const a=i/segments*TAU,ca=Math.cos(a),sa=Math.sin(a);
   let radius,cavity=0;
   if(cap){
    const edge=1+.19*Math.sin(a*3+phase)+.09*Math.sin(a*5-phase);
    radius=.66*Math.pow(Math.max(0,Math.sin(t*Math.PI)),.32)*edge;
    radius*=.88+.18*landNoise(ca*3+seed,sa*3+t*2);
   }
   else{
    const talus=.28*Math.exp(-t*7);
    if(kind===0)radius=talus+.68*Math.pow(1-t,.72);
    else if(kind===1)radius=talus+.32*(1-t*.28)+.06*Math.sin(t*4);
    else if(kind===2)radius=talus+.64*Math.pow(1-t,.38);
    else if(kind===3)radius=talus+.61*Math.pow(1-t,1.05);
    else if(kind===4)radius=talus+.68*Math.pow(1-t,.6);
    else radius=talus+.66*(1-t*.5);
    if(kind===1||kind===5)radius*=1-smooth(t,.94,1);
    const coarse=landNoise(ca*2.3+seed*3+t*.8,sa*2.3+t*1.7)-.5;
    radius*=1+coarse*.38+.11*Math.sin(a*2+phase+t*1.2);
    for(const gully of gullies){
     const drift=gully.a+gully.drift*t+Math.sin(t*5+phase)*.045;
     const delta=Math.atan2(Math.sin(a-drift),Math.cos(a-drift));
     const width=gully.width*(1.7-t*.9);
     const main=Math.exp(-Math.pow(delta/width,2));
     const tributary=Math.exp(-Math.pow((delta-.28*smooth(gully.split-t,0,.3))/(width*.5),2))*(1-smooth(t,gully.split,gully.split+.15));
     const erosion=gully.depth*(main+tributary*.35)*Math.pow(Math.sin(Math.PI*t),.65);
     radius-=erosion;cavity+=erosion;
    }
    // Unequal bedding planes have small undercuts and chipped ledges, not rings.
    for(const joint of joints){const d=t-joint.h-(ca+sa)*joint.tilt;radius-=joint.depth*Math.exp(-d*d/.00032);}
    radius+=(landNoise(ca*6+seed,t*12+sa*5)-.5)*.024*Math.sin(Math.PI*t);
    if(kind===4)radius*=.7+.3*Math.abs(Math.cos(a-phase));
    radius=Math.max(.003,radius);
   }
   const summit=t+Math.sin(t*Math.PI)*(.018*Math.sin(a*3+phase)+.012*Math.sin(a*5-phase));
   ps.push(ca*radius+leanX*t*t,summit,sa*radius+leanZ*t*t);uv.push(i/segments,t);ao.push(Math.max(.65,1-cavity*1.1));
   if(j<rings&&i<segments){const q=j*(segments+1)+i;indices.push(q,q+segments+1,q+1,q+1,q+segments+1,q+segments+2);}
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('aSurfaceAO',new THREE.Float32BufferAttribute(ao,1));g.setIndex(indices);g.computeVertexNormals();
 // Weld shading at the duplicated azimuth seam while retaining useful UVs.
 const normals=g.attributes.normal,n=new THREE.Vector3();
 for(let j=0;j<=rings;j++){const first=j*(segments+1),last=first+segments;n.fromBufferAttribute(normals,first).add(new THREE.Vector3().fromBufferAttribute(normals,last)).normalize();normals.setXYZ(first,n.x,n.y,n.z);normals.setXYZ(last,n.x,n.y,n.z);}
 return colors(g,(x,y,z)=>{const sediment=landNoise(y*7+seed,x*2+z*2),base=.87+.13*sediment;return new THREE.Color(base,base*(.96+sediment*.035),base*(.9+sediment*.07));});
}

export function volcanicMassif(){
 const ps=[],uv=[],ix=[],segments=128,rings=72;
 for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){
  const t=j/rings,a=i/segments*TAU;
  const flank=1+.11*Math.sin(a*3+.4)+.07*Math.sin(a*7+1.2);
  const radius=t*1900*flank,x=Math.cos(a)*radius,z=Math.sin(a)*radius;
  const drainage=1-Math.abs(strata(x*.0037+21,z*.0037+8)*2-1);
  const y=1320*Math.pow(1-t,1.8)+(drainage-.5)*170*Math.sin(t*Math.PI)+noiseRelief(x,z)*Math.sin(t*Math.PI);
  ps.push(x+90*Math.pow(1-t,2),y,z-60*Math.pow(1-t,2));uv.push(x*.02,z*.02);
  if(j<rings&&i<segments){const q=j*(segments+1)+i;ix.push(q,q+1,q+segments+1,q+1,q+segments+2,q+segments+1);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();
 return colors(g,(x,y,z)=>{const snow=smooth(y+landNoise(x*.006,z*.006)*180,630,1000);return new THREE.Color().lerpColors(new THREE.Color('#8e8790'),new THREE.Color('#f4f1ec'),snow);});
}
function noiseRelief(x,z){return (strata(x*.012,z*.012)-.5)*70;}

export function distantRange(layer){
 const positions=[],uv=[],indices=[],columns=900,rows=40;
 for(let j=0;j<=columns;j++)for(let k=0;k<=rows;k++){
  const x=-15000+j/columns*30000,t=k/rows,z=-3400-layer*1400+(t-.5)*1900;
  const crest=100+layer*55+strata(x*.0014+layer*13,z*.0007)*460;
  const gully=(strata(x*.012,z*.005)-.5)*55*Math.sin(t*Math.PI);
  const y=ground(x,z)-18+Math.pow(Math.sin(t*Math.PI),1.25)*crest+gully;
  positions.push(x,y,z);uv.push(x*.02,z*.02);
  if(j<columns&&k<rows){const q=j*(rows+1)+k;indices.push(q,q+1,q+rows+1,q+1,q+rows+2,q+rows+1);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
 return colors(g,(x,y,z)=>{const s=.82+strata(x*.007,z*.007)*.13;return new THREE.Color(s,s*.97,s*.92);});
}
