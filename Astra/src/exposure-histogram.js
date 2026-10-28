const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Red encodes log2 luminance from -12 to +12 EV; green is metering weight.
// Trim dark outliers and the brightest 2% so lamps and the sun cannot pump it.
export function histogramExposure(pixels,{key=.18,minimum=.45,maximum=1.8}={}){
 const bins=new Float64Array(256);let weight=0;
 for(let i=0;i<pixels.length;i+=4){const w=pixels[i+1]/255;bins[pixels[i]]+=w;weight+=w;}
 if(weight===0)return {target:1,meanEV:Math.log2(key),weight,bins:Array.from(bins)};
 const lo=weight*.1,hi=weight*.98;let cumulative=0,sum=0,kept=0;
 for(let i=0;i<256;i++){
  const next=cumulative+bins[i],take=Math.max(0,Math.min(next,hi)-Math.max(cumulative,lo));
  sum+=take*(-12+i*24/255);kept+=take;cumulative=next;
 }
 const meanEV=sum/Math.max(kept,1e-8);
 return {target:clamp(key/2**meanEV,minimum,maximum),meanEV,weight,bins:Array.from(bins)};
}
export function adaptExposure(current,target,seconds){
 // Smooth in stops, with a bounded time step after background tabs or stalls.
 const from=Math.log2(current),to=Math.log2(target),speed=1.3;
 return 2**(from+(to-from)*(1-Math.exp(-clamp(seconds,0,.1)*speed)));
}
