// A static height field supplies large-scale sky visibility. Integrating about
// the local surface normal avoids darkening an otherwise unobstructed slope.
export function bakeTerrainHorizons({heightAt,bounds,size=257,directions=8,ranges=[16,32,64,128,256,512,1024,2048,3072]}){
 const [minX,minZ,maxX,maxZ]=bounds,dx=(maxX-minX)/(size-1),dz=(maxZ-minZ)/(size-1);
 const heights=new Float32Array(size*size),normals=new Float32Array(size*size*3),angles=new Float32Array(size*size*directions),visibility=new Float32Array(size*size);
 for(let z=0;z<size;z++)for(let x=0;x<size;x++)heights[z*size+x]=heightAt(minX+x*dx,minZ+z*dz);
 function sample(x,z){
  const u=(x-minX)/dx,v=(z-minZ)/dz;
  if(u<0||v<0||u>size-1||v>size-1)return heightAt(x,z);
  const ix=Math.min(size-2,Math.floor(u)),iz=Math.min(size-2,Math.floor(v)),fx=u-ix,fz=v-iz,q=iz*size+ix;
  return (heights[q]*(1-fx)+heights[q+1]*fx)*(1-fz)+(heights[q+size]*(1-fx)+heights[q+size+1]*fx)*fz;
 }
 const rays=Array.from({length:directions},(_,i)=>[Math.cos(i*Math.PI*2/directions),Math.sin(i*Math.PI*2/directions)]);
 for(let z=0;z<size;z++)for(let x=0;x<size;x++){
  const q=z*size+x,wx=minX+x*dx,wz=minZ+z*dz,h=heights[q];
  let nx=-(sample(wx+dx,wz)-sample(wx-dx,wz))/(2*dx),nz=-(sample(wx,wz+dz)-sample(wx,wz-dz))/(2*dz);
  const length=Math.hypot(nx,1,nz),ny=1/length;nx/=length;nz/=length;normals.set([nx,ny,nz],q*3);
  let visible=0;
  for(let d=0;d<directions;d++){
   const [rx,rz]=rays[d];let slope=-1e6;
   for(const distance of ranges)slope=Math.max(slope,(sample(wx+rx*distance,wz+rz*distance)-h-1.5)/distance);
   const horizon=Math.atan(slope);angles[q*directions+d]=horizon;
   const horizontal=nx*rx+nz*rz,lower=Math.max(horizon,Math.atan2(-horizontal,ny));
   visible+=horizontal*(Math.PI/4-lower/2-Math.sin(2*lower)/4)+ny*.5*Math.cos(lower)**2;
  }
  visibility[q]=Math.max(0,Math.min(1,visible*2/directions));
 }
 return {bounds,size,directions,heights,normals,angles,visibility};
}
