// Static directional horizons, with azimuth along a 3D texture's depth axis.
// Slopes and inverse distances interpolate continuously in one GPU read.
export function bakeTerrainShadowField({heightAt,bounds,size,directions,ranges=[128,192,256,384,512,768,1024,1536,2048,3072,4096,6144,8192,12288,16384]}){
 const [minX,minZ,maxX,maxZ]=bounds,dx=(maxX-minX)/(size-1),dz=(maxZ-minZ)/(size-1),heights=new Float32Array(size*size);
 for(let z=0;z<size;z++)for(let x=0;x<size;x++)heights[z*size+x]=heightAt(minX+x*dx,minZ+z*dz);
 function sample(x,z){
  const u=(x-minX)/dx,v=(z-minZ)/dz;
  if(u<0||v<0||u>size-1||v>size-1)return heightAt(x,z);
  const ix=Math.min(size-2,Math.floor(u)),iz=Math.min(size-2,Math.floor(v)),fx=u-ix,fz=v-iz,q=iz*size+ix;
  return (heights[q]*(1-fx)+heights[q+1]*fx)*(1-fz)+(heights[q+size]*(1-fx)+heights[q+size+1]*fx)*fz;
 }
 const data=new Float32Array(size*size*directions*4);
 for(let d=0;d<directions;d++){
  const angle=d*Math.PI*2/directions,rx=Math.cos(angle),rz=Math.sin(angle);
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
   const q=z*size+x,h=heights[q],wx=minX+x*dx,wz=minZ+z*dz;
   let slope=-Infinity,distance=ranges[0];
   for(const r of ranges){const candidate=(sample(wx+rx*r,wz+rz*r)-h-3)/r;if(candidate>slope){slope=candidate;distance=r;}}
   const p=(d*size*size+q)*4;
   data[p]=slope;data[p+1]=h;data[p+2]=1/distance;data[p+3]=1;
  }
 }
 return {bounds,size,directions,data};
}
