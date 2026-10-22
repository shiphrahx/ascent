import {chromium} from 'playwright';
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

// Resolve locally without requiring directory access above this workspace.
const local={name:'fixture-sources',setup(b){
 b.onResolve({filter:/.*/},a=>({path:path.isAbsolute(a.path)?a.path:a.path.startsWith('.')?path.resolve(path.dirname(a.importer),a.path):fileURLToPath(import.meta.resolve(a.path)),namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},async a=>({contents:await readFile(a.path,'utf8'),loader:'js'}));
}};
const bundle=await build({entryPoints:[path.resolve('tests/temporal-fixture.js')],plugins:[local],tsconfigRaw:{},bundle:true,format:'iife',write:false,minify:true});
await writeFile('captures/temporal-probe.html','<!doctype html><body><script>'+bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script>');
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage(),errors=[],warnings=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
 await page.goto(pathToFileURL(path.resolve('captures/temporal-probe.html')).href);await page.waitForFunction(()=>window.__ready);
 const result=await page.evaluate(()=>runTemporalProbe());
 const cases=Object.values(result.cases);
 const checks={reducedFlicker:result.temporal.flicker<result.msaa.flicker*.9,
  accurateCoverage:cases.every(c=>c.temporal.rmse<=c.msaa.rmse),
  noFlickerRegressions:cases.every(c=>c.temporal.flicker<=c.msaa.flicker+1e-7),
  preservesFineBranches:cases.every(c=>c.temporal.contrastRetention>.85&&c.temporal.contrastRetention<1.15),
  noActorTrails:result.actors.every(a=>a.pixels>0&&a.trailError<.025&&a.maxTrailError<.025),
  cameraCutRejectsHistory:!result.cameraCut.usedHistory,resizeRejectsHistory:result.resizeReset,
  lightingRejectsHistory:result.lightingReset&&result.weatherReset,toggleRejectsHistory:result.toggleReset,projectionRejectsHistory:result.projectionReset,
  noErrors:errors.length===0&&warnings.length===0};
 await writeFile('captures/temporal-report.json',JSON.stringify({checks,result,errors,warnings},null,2));console.log(JSON.stringify({checks,result,errors,warnings},null,2));
 if(Object.values(checks).some(v=>!v))process.exitCode=1;
}finally{await browser.close();}
