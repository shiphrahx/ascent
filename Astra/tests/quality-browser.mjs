import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chromium',headless:true});
const report=[];
try{
 for(const tier of ['medium','lite','high']){
  const page=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const url=pathToFileURL(path.resolve('Ascent.html'));url.searchParams.set('quality',tier);
  await page.goto(url.href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});
  const result=await page.evaluate(()=>{const a=__ascent;return {tier:a.tier,msaa:a.atmo.scenePass.target.samples,shadow:a.atmo.shadows.csm.lights[0].shadow.mapSize.x,reflection:a.world.water.getRenderTarget().width,sky:a.atmo.skyTarget.width,trees:a.world.trees.children.reduce((n,t)=>n+t.count,0),terrainTriangles:a.scene.getObjectByName('Valley terrain').children.reduce((n,m)=>n+m.geometry.index.count/3,0),contextLost:a.renderer.getContext().isContextLost()};});
  assert.equal(result.tier.name,tier);assert.equal(result.tier.source,'override');
  assert.equal(result.msaa,result.tier.samples);assert.equal(result.shadow,result.tier.shadowNearSize);
  assert.equal(result.reflection,result.tier.reflectionSize);assert.equal(result.sky,result.tier.skyWidth);
  assert.equal(result.trees,{high:720,medium:480,lite:320}[tier]);assert.equal(result.contextLost,false);assert.deepEqual(errors,[]);
  await page.setViewportSize({width:2848,height:1590});await page.waitForTimeout(2500);
  const large=await page.evaluate(()=>{const a=__ascent,r=a.renderer;return {ratio:r.getPixelRatio(),width:r.domElement.width,height:r.domElement.height,skyCache:a.atmo.skyCache,trees:a.world.trees.children.reduce((n,t)=>n+t.count,0)};});
  assert(large.width*large.height<=result.tier.pixelBudget);assert.equal(large.trees,result.trees);assert(large.skyCache.partialUpdates>0);
  assert.equal(large.skyCache.maxPartialPixels,result.tier.skyWidth**2/(2*large.skyCache.columns*large.skyCache.rows));assert.deepEqual(errors,[]);
  report.push({...result,large,errors});await page.close();
 }
 assert(report[2].terrainTriangles>report[0].terrainTriangles*2,'High tier enables the dense terrain grid');
 assert.equal(report[0].terrainTriangles,report[1].terrainTriangles,'Lower tiers retain stable terrain topology');
 await writeFile('captures/quality-report.json',JSON.stringify(report,null,2));
 console.log('All three quality tiers render with the configured GPU budgets and stable trees.');
}finally{await browser.close();}
