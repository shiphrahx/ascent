export const FLIGHT_RESPONSE={horizontalSpeed:10,verticalSpeed:4,attack:.24,brake:.2};
const approach=(value,target,dt,tau)=>value+(target-value)*(1-Math.exp(-Math.max(0,dt)/tau));

export function arcadeVelocity(velocity,input,forward,wind,dt){
 const magnitude=Math.hypot(input.right,input.forward),scale=1/Math.max(1,magnitude);
 const fx=forward.x,fz=forward.z,windLength=Math.hypot(wind.x,wind.z);
 // Braking also damps wind drift; otherwise a 2 m/s wind would defeat the
 // requested sub-1 m/s release response even after input velocity had stopped.
 const drift=Math.min(magnitude>0?2:.25,windLength*.2)/Math.max(windLength,1e-8);
 const x=(-fz*input.right+fx*input.forward)*scale*FLIGHT_RESPONSE.horizontalSpeed+wind.x*drift;
 const z=(fx*input.right+fz*input.forward)*scale*FLIGHT_RESPONSE.horizontalSpeed+wind.z*drift;
 const top=Math.max(1,Math.hypot(x,z)/FLIGHT_RESPONSE.horizontalSpeed),tau=magnitude>0?FLIGHT_RESPONSE.attack:FLIGHT_RESPONSE.brake;
 velocity.x=approach(velocity.x,x/top,dt,tau);velocity.z=approach(velocity.z,z/top,dt,tau);
 velocity.y=approach(velocity.y,input.vertical*FLIGHT_RESPONSE.verticalSpeed,dt,input.vertical?FLIGHT_RESPONSE.attack:FLIGHT_RESPONSE.brake);
 return velocity;
}
