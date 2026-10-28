import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const tag=process.argv[2];if(!/^[a-z0-9-]+$/.test(tag??''))throw Error('Checkpoint tag required');
const buildSha256=createHash('sha256').update(await readFile('Ascent.html')).digest('hex'),validation={buildSha256};
for(const name of ['verification','graphics-report','temporal-report']){
 const report=JSON.parse(await readFile(`captures/${name}.json`,'utf8'));
 if(Object.values(report.checks).some(v=>v===false)||report.errors.length||report.warnings?.length)throw Error(name+' failed');
 validation[name]={checks:report.checks,errors:report.errors,warnings:report.warnings??[]};
}
await writeFile(`captures/plan2-validation-${tag}.json`,JSON.stringify(validation,null,2));
console.log('Validated '+tag+' '+buildSha256);
