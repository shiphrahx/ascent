// Shared geological fields: deterministic, world-scale and independent of rendering.
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(x,a,b)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function landHash(x,z){let h=Math.imul(x,374761393)+Math.imul(z,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
export function landNoise(x,z){const ix=Math.floor(x),iz=Math.floor(z);let u=x-ix,v=z-iz;u=u*u*(3-2*u);v=v*v*(3-2*v);return mix(mix(landHash(ix,iz),landHash(ix+1,iz),u),mix(landHash(ix,iz+1),landHash(ix+1,iz+1),u),v);}

export function terraceHeight(height,x,z,strength=.82){
 // Unequal 4–12 m beds, gently warped over hundreds of metres. Most of a bed
 // forms a shelf, with its height gained over a short resistant cliff face.
 const thickness=4+8*landNoise(x*.0018+7,z*.0018-11),warp=(landNoise(x*.004,z*.004)-.5)*5;
 const level=(height+warp)/thickness,base=Math.floor(level),fraction=level-base;
 const stepped=(base+smooth(fraction,.60,.92))*thickness-warp;
 return mix(height,stepped,strength);
}

export function valleyErosion(x,z,distance){
 const runoff=smooth(Math.abs(distance),45,240),side=Math.sign(distance)||1;
 // Continuous V-shaped channels meander downhill and fork near their mouths.
 const along=z/62+(landNoise(z*.004,side*19)-.5)*1.4+side*Math.abs(distance)*.0018;
 const cell=Math.floor(along);let cut=0;
 for(let i=cell-1;i<=cell+1;i++){
  const center=i+.2+landHash(i,side*7)*.6,width=.09+(1-runoff)*.17;
  const channel=Math.max(0,1-Math.abs(along-center)/width);
  const fork=Math.max(0,1-Math.abs(along-center-.22*(1-runoff))/(width*.5));
  cut+=channel+fork*.28*(1-runoff);
 }
 return cut*(4+runoff*13)*smooth(Math.abs(distance),18,85);
}

export function valleyTalus(x,z,distance){
 // Low, broad depositional fans survive the eight-metre near-terrain grid.
 // The river corridor stays clear; the field is baked once into geometry.
 const d=Math.abs(distance),foot=smooth(d,18,42)*(1-smooth(d,95,160));
 const fan=landNoise(x*.025+13,z*.018-7)*.7+landNoise(x*.055,z*.045)*.3;
 return foot*smooth(fan,.3,.8)*3.5;
}
