const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Proportional thermal demand, with a Schmitt trigger and dwell times around
// the valve. The light envelope is applied separately in makeBalloon.
export function createAutopilotBurner(){
 const state={on:false,changed:-Infinity,demand:0,switches:0};
 return {state,reset(time=0){Object.assign(state,{on:false,changed:time-1.5,demand:0,switches:0});},
  update(time,heightError,verticalSpeed,thermal){
   const wantedHeat=clamp(.55+heightError*.025-verticalSpeed*.075,.08,1.2);
   state.demand=clamp(.25+(wantedHeat-thermal)*2,0,1);
   const wanted=state.on?state.demand>.18:state.demand>.45;
   if(wanted!==state.on&&time-state.changed>=1.5){state.on=wanted;state.changed=time;state.switches++;}
   return state.on?clamp(state.demand,.35,1):0;
  }
 };
}
