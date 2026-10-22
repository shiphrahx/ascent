// Hemispherical visibility estimated from the height field, in metres. Sampling
// wraps with the texture, so cavities at tile boundaries have no artificial rim.
export function cavityVisibility(heights,size,tileMetres,reliefMetres){
 const visibility=new Float32Array(size*size),spacing=tileMetres/size;
 const directions=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]].map(([x,y])=>[x,y,Math.hypot(x,y)]);
 const radii=[1,2,4,8,16];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const h=heights[y*size+x];let sky=0;
  for(const [dx,dy,distance]of directions){
   let slope=0;
   for(const r of radii){
    const nx=(x+dx*r%size+size)%size,ny=(y+dy*r%size+size)%size;
    slope=Math.max(slope,(heights[ny*size+nx]-h)*reliefMetres/(r*spacing*distance));
   }
   sky+=1/(1+slope*slope);
  }
  visibility[y*size+x]=sky/directions.length;
 }
 return visibility;
}
