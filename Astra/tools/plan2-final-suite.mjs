// Run GPU measurements sequentially; each tier is ready to review/publish on completion.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const requested=process.argv.slice(2),tiers=requested.length?requested:['medium','lite','high'];
if(tiers.some(t=>!['medium','lite','high'].includes(t)))throw Error('Expected medium, lite or high');
const baselineHash=createHash('sha256').update(readFileSync('captures/plan2-baseline.html')).digest('hex');
function run(name,args){
 console.log('Running '+name);
 const result=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:16*1024*1024});
 writeFileSync('captures/plan2-final-'+name+'.log',(result.stdout??'')+(result.stderr??''));
 if(result.status!==0){console.error(result.stdout,result.stderr);process.exit(result.status??1);}
 console.log(name+' passed');
}
for(const tier of tiers){
 run(tier+'-light',['tools/light-stability.mjs','--tier='+tier,'--tag=final']);
 run(tier+'-flicker',['tools/landscape-stability.mjs','--tier='+tier,'--tag=final']);
 const file='captures/plan2-flicker-'+tier+'-baseline-isolated.json';
 const baseline=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null;
 if(!baseline||baseline.buildSha256!==baselineHash||!baseline.independentScenes||baseline.cases.D?.simulationStart!==100||baseline.errors.length){
  run(tier+'-baseline',['tools/landscape-stability.mjs','--tier='+tier,'--tag=baseline-isolated','--case=D','--source=captures/plan2-baseline.html']);
 }
 run(tier+'-pacing',['benchmark.mjs','--flight','--sunrise','--tier='+tier,'--tag=plan2-final']);
 console.log('Completed final tier: '+tier);
}
