import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../src/formations.js',import.meta.url),'utf8');
const {formationLayout}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const options={ground:()=>0,surfaceHeight:()=>0,pathX:()=>0,riverX:()=>-62,clearings:[],rng,tier:'medium'};
const a=formationLayout(options),b=formationLayout(options);
assert.deepEqual(a,b,'Layouts are deterministic');
assert(a.length>80&&new Set(a.map(f=>f.cluster)).size>20,'Dozens of clusters populate the valley');
assert(new Set(a.map(f=>f.v)).size>=6&&a.filter(f=>f.cap).length>10,'Multiple cone and capped families occur');
const excluded=formationLayout({...options,clearings:[{x:a[0].x,z:a[0].z,r:40}]});
for(const f of excluded)assert(a.some(old=>JSON.stringify(old)===JSON.stringify(f)),'Exclusion does not reroll unrelated formations');
assert(formationLayout({...options,surfaceHeight:()=>1000}).length===0,'Buried formations are rejected');
assert(formationLayout({...options,tier:'high'}).length>a.length);
assert(formationLayout({...options,tier:'lite'}).length<a.length);
const sloped=formationLayout({...options,ground:(x,z)=>x*.3+z*.1,surfaceHeight:(x,z)=>x*.3+z*.1});
for(const f of sloped)for(let i=0;i<8;i++){const angle=i*Math.PI/4;assert(f.y<(f.x+Math.cos(angle)*f.r)*.3+(f.z+Math.sin(angle)*f.r*f.depth)*.1,'Talus is buried across a sloping footprint');}
console.log('Formations: deterministic clusters, variety, clearings, burial rejection and tier density passed.');
