import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const tag=process.argv[2];if(!/^[a-z0-9-]+$/.test(tag??''))throw Error('Tag required');
for(const file of ['verify.mjs','graphics.mjs','temporal.mjs','tools/plan2-capture.mjs','tools/plan2-checkpoint.mjs']){
 const args=file.endsWith('capture.mjs')?['--tag='+tag]:file.endsWith('checkpoint.mjs')?[tag]:[];
 console.log('Running '+file);
 const result=spawnSync(process.execPath,[file,...args],{encoding:'utf8'});
 writeFileSync(`captures/plan2-${tag}-${file.split('/').at(-1)}.log`,(result.stdout??'')+(result.stderr??''));
 if(result.status!==0){console.error(result.stdout,result.stderr);process.exit(result.status??1);}
 console.log(file+' passed');
}
