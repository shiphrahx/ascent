// Display luminance is measured in 8-bit levels. Remove a local linear trend
// for jumps; use a one-second moving mean and Hann window for the spectrum.
export function analyseSignal(values,hz=60){
 const n=values.length,residual=values.slice(1,-1).map((v,i)=>v-(values[i]+values[i+2])*.5);
 const half=Math.round(hz/2),detrended=values.map((v,i)=>{
  const a=Math.max(0,i-half),b=Math.min(n,i+half+1);let sum=0;for(let j=a;j<b;j++)sum+=values[j];return v-sum/(b-a);
 });
 const spectrum=[];
 for(let k=Math.ceil(n/hz*.2);k<=Math.floor(n/hz*12);k++){
  let re=0,im=0,weight=0;
  for(let i=0;i<n;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(n-1)),a=2*Math.PI*k*i/n;re+=detrended[i]*w*Math.cos(a);im-=detrended[i]*w*Math.sin(a);weight+=w;}
  spectrum.push({hz:k*hz/n,amplitude:2*Math.hypot(re,im)/weight});
 }
 const peaks=spectrum.filter((s,i)=>s.hz>=1&&s.hz<=10&&s.amplitude>(spectrum[i-1]?.amplitude??0)&&s.amplitude>(spectrum[i+1]?.amplitude??0)).sort((a,b)=>b.amplitude-a.amplitude);
 return {largestDetrendedJump:Math.max(...residual.map(Math.abs)),residualRms:Math.sqrt(residual.reduce((s,x)=>s+x*x,0)/residual.length),peaks:peaks.slice(0,10),spectrum};
}
