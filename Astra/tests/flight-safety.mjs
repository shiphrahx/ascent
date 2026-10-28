import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {avoidObstacles}=await import('data:text/javascript;base64,'+Buffer.from(await readFile('src/flight-safety.js','utf8')).toString('base64'));
for(const hz of[30,60,144])for(const shape of['rock','building','fleet']){
 const obstacle=shape==='rock'?{x:0,z:0,y:0,h:45,r:12}: {x:0,z:0,y:0,h:45,rx:7,rz:7,box:true};
 const fleet=shape==='fleet'?[{group:{position:{x:0,y:10,z:0}}}]:[];
 const obstacles=shape==='fleet'?[]:[obstacle],p={x:-55,y:10,z:0},v={x:10,y:0,z:0};
 let closest=Infinity;
 for(let i=0;i<hz*8;i++){
  v.x+=(10-v.x)*(1-Math.exp(-1/hz/.24));
  avoidObstacles(p,v,obstacles,fleet,1/hz);p.x+=v.x/hz;p.y+=v.y/hz;p.z+=v.z/hz;
  closest=Math.min(closest,-p.x);assert.ok(Number.isFinite(p.x));
 }
 const top=26/45,limit=shape==='fleet'?24:shape==='building'?19:12*(.17+.91*(1-top)**1.6+.07*Math.sin(top*Math.PI))+12;
 assert.ok(closest>=limit,`${hz} Hz ${shape}: ${closest} < ${limit}`);
 assert.ok(Math.abs(v.x)<.1,`${shape} settles before collision`);
}
console.log('Held input approaches rocks, buildings and fleet smoothly without penetration at 30/60/144 Hz.');
