// Ease normal velocity away from a clearance boundary while preserving the
// tangential component, so held input slides around a rock rather than sticking.
export function softenContact(velocity,nx,ny,nz,gap,dt){
 if(gap>=8||dt<=0)return;
 const weight=Math.min(1,Math.max(0,1-gap/8))**2;
 const normal=velocity.x*nx+velocity.y*ny+velocity.z*nz;
 const outward=4*weight;
 if(normal>=outward)return;
 const change=(outward-normal)*(1-Math.exp(-28*weight*dt));
 velocity.x+=nx*change;velocity.y+=ny*change;velocity.z+=nz*change;
}

export function avoidObstacles(position,velocity,obstacles,fleet,dt){
 const testY=position.y+16;
 for(const o of obstacles){
  const dx=position.x-o.x,dz=position.z-o.z;
  if(Math.abs(dx)>(o.box?o.rx:o.r*1.1)+20||Math.abs(dz)>(o.box?o.rz:o.r*1.1)+20)continue;
  if(o.box){
   if(position.y+28<=o.y||position.y>=o.y+o.h+12)continue;
   const gx=Math.abs(dx)-o.rx-12,gz=Math.abs(dz)-o.rz-12;
   if(gx>0&&gz>0){const d=Math.hypot(gx,gz);softenContact(velocity,Math.sign(dx)*gx/d,0,Math.sign(dz)*gz/d,d,dt);}
   else if(gx>gz)softenContact(velocity,Math.sign(dx)||1,0,0,gx,dt);
   else softenContact(velocity,0,0,Math.sign(dz)||1,gz,dt);
  }else{
   if(testY>o.y+o.h+14||testY<o.y-8)continue;
   const top=Math.min(1,Math.max(0,(testY-o.y)/o.h));
   const radius=o.r*(.17+.91*(1-top)**1.6+.07*Math.sin(top*Math.PI))+12;
   const d=Math.hypot(dx,dz);
   softenContact(velocity,d>1e-6?dx/d:1,0,d>1e-6?dz/d:0,d-radius,dt);
  }
 }
 for(const balloon of fleet){
  const p=balloon.group.position,dx=position.x-p.x,dy=position.y-p.y,dz=position.z-p.z,d=Math.hypot(dx,dy,dz);
  softenContact(velocity,d>1e-6?dx/d:1,d>1e-6?dy/d:0,d>1e-6?dz/d:0,d-24,dt);
 }
 return velocity;
}
