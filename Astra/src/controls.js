// Edit this one map to remap keyboard controls, then rebuild Ascent.html.
export const CONTROL_KEYS={
 left:['ArrowLeft','KeyA'],right:['ArrowRight','KeyD'],forward:['ArrowUp','KeyW'],back:['ArrowDown','KeyS'],
 climb:['Space'],descend:['ShiftLeft','ShiftRight','KeyV'],orbitLeft:['KeyQ'],orbitRight:['KeyE'],
 camera:['KeyC'],sound:['KeyM'],fullscreen:['KeyF'],time:['KeyT']
};
export const keyMatches=(action,code)=>CONTROL_KEYS[action].includes(code);
export const actionDown=(keys,action)=>CONTROL_KEYS[action].some(code=>keys.has(code));
export const flightKey=code=>['left','right','forward','back','climb','descend','orbitLeft','orbitRight'].some(action=>keyMatches(action,code));
export function readFlightInput(keys){
 return {right:Number(actionDown(keys,'right'))-Number(actionDown(keys,'left')),
  forward:Number(actionDown(keys,'forward'))-Number(actionDown(keys,'back')),
  vertical:Number(actionDown(keys,'climb'))-Number(actionDown(keys,'descend')),
  orbit:Number(actionDown(keys,'orbitRight'))-Number(actionDown(keys,'orbitLeft'))};
}
