import {spawnSync} from 'node:child_process';
const tag=process.argv[2];if(!/^[a-z0-9-]+$/.test(tag??''))throw Error('Tag required');
for(const file of ['verify.mjs','graphics.mjs','temporal.mjs','tools/plan2-capture.mjs','tools/plan2-checkpoint.mjs']){
 const args=file.endsWith('capture.mjs')?['--tag='+tag]:file.endsWith('checkpoint.mjs')?[tag]:[];
 console.log('Running '+file);
 const result=spawnSync(process.execPath,[file,...args],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status??1);
}
