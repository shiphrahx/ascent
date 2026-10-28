// Self-contained so the exact same implementation runs in Node and Chromium.
// Input is bottom-up RGBA8 from readPixels; crop coordinates are top-down.
export function createFlickerScorer(width,height,crop,regionSize=0){
 const lut=Float64Array.from({length:256},(_,i)=>{const s=i/255;return s<=.04045?s/12.92:Math.pow((s+.055)/1.055,2.4);});
 const history=Array.from({length:3},()=>new Float32Array(width*height));
 const columns=regionSize?Math.ceil(width/regionSize):0,rows=regionSize?Math.ceil(height/regionSize):0;
 const regionSum=new Float64Array(columns*rows),regionCount=new Float64Array(columns*rows);
 const regions=regionSize?Uint16Array.from({length:width*height},(_,i)=>Math.floor((height-1-Math.floor(i/width))/regionSize)*columns+Math.floor((i%width)/regionSize)):null;
 let frames=0,wholeSum=0,cropSum=0,wholeCount=0,cropCount=0;
 return {
  push(rgba){
   const now=history[frames%3],previous=history[(frames+2)%3],older=history[(frames+1)%3];
   let whole=0,cliff=0,cliffPixels=0;
   for(let i=0;i<now.length;i++){
    const q=i*4,luma=.2126*lut[rgba[q]]+.7152*lut[rgba[q+1]]+.0722*lut[rgba[q+2]];now[i]=luma;
    if(frames<2)continue;
    // Residual at the middle frame after subtracting the local linear trend.
    const residual=previous[i]-(older[i]+luma)*.5,square=residual*residual;
    whole+=square;if(regions){regionSum[regions[i]]+=square;regionCount[regions[i]]++;}
    const x=i%width,y=height-1-Math.floor(i/width);
    if(x>=crop.x&&x<crop.x+crop.width&&y>=crop.y&&y<crop.y+crop.height){cliff+=square;cliffPixels++;}
   }
   frames++;
   if(frames<3)return null;
   wholeSum+=whole;cropSum+=cliff;wholeCount+=now.length;cropCount+=cliffPixels;
   return {frame:frames-2,wholeRms:Math.sqrt(whole/now.length),cliffRms:Math.sqrt(cliff/cliffPixels)};
  },
  result(){return {frames,scoredFrames:Math.max(0,frames-2),wholeRms:Math.sqrt(wholeSum/wholeCount),cliffRms:Math.sqrt(cropSum/cropCount),...(regions?{regions:Array.from(regionSum,(sum,i)=>({x:(i%columns)*regionSize,y:Math.floor(i/columns)*regionSize,rms:Math.sqrt(sum/regionCount[i]),energyFraction:sum/wholeSum}))}:{})};}
 };
}
