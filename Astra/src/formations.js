// Placement is seeded per cluster so changing a neighbouring formation or a
// terrain rejection does not reroll the whole valley. All assets stay procedural.
export function formationLayout({ground,surfaceHeight,pathX,riverX,clearings,tier,rng}){
 const formations=[],members=tier==='high'?5:tier==='lite'?3:4;
 for(let cluster=0;cluster<42;cluster++){
  if(tier==='medium'&&cluster%4===3||tier==='lite'&&cluster%7>=4)continue;
  const random=rng(1837+cluster*997),side=cluster%2?1:-1;
  const z0=-1280+cluster/41*2560+(random()-.5)*36,x0=pathX(z0)+side*(142+random()*53);
  const height0=35+random()*37,radius0=11+random()*12,variant=[2,3,4,5,0,1][cluster%6]+(cluster%3===0?6:0);
  for(let member=0;member<members;member++){
   const angle=random()*Math.PI*2,spread=member===0?0:member<3?radius0*(.7+random()*.35):24+random()*24;
   const x=x0+Math.cos(angle)*spread,z=z0+Math.sin(angle)*spread;
   const height=height0*(member===0?1:.45+random()*.42),radius=radius0*(member===0?1:.5+random()*.32);
   const v=member<3?variant:Math.floor(random()*12),yaw=random()*Math.PI*2,depth=.78+random()*.35;
   const cap=(v+10)%6===1||((v+10)%6===5&&random()<.6);
   const base=ground(x,z);let footing=base;
   // The visible talus must enter the lowest terrain around its full footprint,
   // not float where the centre sample lies on the uphill side of a slope.
   for(const ring of [.45,.9,1.3])for(let i=0;i<16;i++){const a=i*Math.PI/8;footing=Math.min(footing,ground(x+Math.cos(a)*radius*ring,z+Math.sin(a)*radius*depth*ring));}
   if(Math.abs(x-riverX(z))<34||(z>900&&Math.abs(x-pathX(z))<150))continue;
   if(clearings.some(c=>Math.hypot(x-c.x,z-c.z)<c.r+radius))continue;
   if(surfaceHeight(x,z)>base+height*.55)continue;
   formations.push({cluster,member,x,z,y:footing-4,h:height+base-footing+2,r:radius,v,yaw,depth,cap});
  }
 }
 return formations;
}
