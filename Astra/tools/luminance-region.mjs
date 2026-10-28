// Bottom-up RGBA8 input, top-down crop. Fractional tracking avoids introducing
// a spectral peak each time an ascending envelope crosses an integer pixel.
export function meanRegion(pixels,width,height,rect,subpixel=false){
 let sum=0,count=0;
 if(!subpixel){
  for(let y=Math.max(0,rect.y);y<Math.min(height,rect.y+rect.height);y++)for(let x=Math.max(0,rect.x);x<Math.min(width,rect.x+rect.width);x++){
   const k=((height-y-1)*width+x)*4;sum+=.2126*pixels[k]+.7152*pixels[k+1]+.0722*pixels[k+2];count++;
  }
 }else{
  const sample=(x,y)=>{const k=((height-1-Math.max(0,Math.min(height-1,y)))*width+Math.max(0,Math.min(width-1,x)))*4;return .2126*pixels[k]+.7152*pixels[k+1]+.0722*pixels[k+2];};
  for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){
   const px=rect.x+x,py=rect.y+y,ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy;
   sum+=(sample(ix,iy)*(1-fx)+sample(ix+1,iy)*fx)*(1-fy)+(sample(ix,iy+1)*(1-fx)+sample(ix+1,iy+1)*fx)*fy;count++;
  }
 }
 return sum/count;
}
