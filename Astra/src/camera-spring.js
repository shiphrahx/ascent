// Exact critically damped solution for a target held over this time step.
// Mutates vector-like objects without allocating during camera updates.
export function springPosition(position,velocity,target,seconds,frequency=7.5){
 const dt=Math.max(0,seconds),decay=Math.exp(-frequency*dt);
 for(const axis of ['x','y','z']){
  const offset=position[axis]-target[axis],impulse=velocity[axis]+frequency*offset;
  position[axis]=target[axis]+(offset+impulse*dt)*decay;
  velocity[axis]=(velocity[axis]-frequency*impulse*dt)*decay;
 }
}
