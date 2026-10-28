// Frame-rate independent light envelope. Flame geometry keeps its own fast
// shader flicker; only these slow frequencies reach the cloth and surroundings.
export function smoothBurner(level,target,dt){
 const command=Math.max(0,Math.min(1,target));
 return level+(command-level)*(1-Math.exp(-Math.max(0,dt)/(command>level?.25:.6)));
}
export function burnerVariation(seconds,phase=0){
 return 1+.018*Math.sin(seconds*1.07+phase)+.012*Math.sin(seconds*2.33+phase*1.7)+.008*Math.sin(seconds*4.46+phase*.63);
}
