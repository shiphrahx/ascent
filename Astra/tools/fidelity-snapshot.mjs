import {readFile,writeFile,copyFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const phase=process.argv[2];if(!/^[0-9]+(?:-[0-9]+)*$/.test(phase??''))throw Error('Usage: node tools/fidelity-snapshot.mjs phase-number');
const build=await readFile('Ascent.html'),modified=(await stat('Ascent.html')).mtimeMs,validation={buildSha256:createHash('sha256').update(build).digest('hex')};
for(const [name,file]of [['gameplay','verification'],['graphics','graphics-report'],['temporal','temporal-report']]){
 const path=`captures/${file}.json`,report=JSON.parse(await readFile(path,'utf8'));
 if((await stat(path)).mtimeMs<modified)throw Error(`${name} report predates the build`);
 if(!report.checks||Object.values(report.checks).some(v=>v===false)||report.errors?.length||report.warnings?.length)throw Error(`${name} validation failed`);
 validation[name]={checks:report.checks,errors:report.errors??[],warnings:report.warnings??[]};
}
await writeFile(`captures/fidelity-${phase}-validation.json`,JSON.stringify(validation,null,2));
await copyFile('Ascent.html',`captures/fidelity-phase-${phase}.html`);
console.log(JSON.stringify({phase,buildSha256:validation.buildSha256,checks:Object.fromEntries(Object.entries(validation).filter(([k])=>k!=='buildSha256').map(([k,v])=>[k,Object.keys(v.checks).length]))}));
