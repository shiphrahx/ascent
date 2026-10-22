import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const [before,after,tag]=process.argv.slice(2);
if(![before,after,tag].every(v=>v&&/^[a-z0-9-]+$/i.test(v)))throw Error('Usage: node tools/review-comparison.mjs before-prefix after-prefix output-prefix');
const html='<!doctype html><meta charset="utf-8"><title>Matched visual review</title><style>body{margin:0;background:#222;color:white;font:18px sans-serif}main{display:grid;grid-template-columns:1fr 1fr}figure{margin:4px}img{width:100%}</style><main>'+['valley','village','rock','clouds'].flatMap(view=>[before,after].map(stage=>`<figure><figcaption>${view}: ${stage}</figcaption><img src="${stage}-${view}.png"></figure>`)).join('')+'</main>';
await writeFile(`captures/${tag}.html`,html);
const browser=await chromium.launch({channel:'chromium',headless:true});
try{const page=await browser.newPage({viewport:{width:1600,height:1800}});await page.goto(pathToFileURL(path.resolve(`captures/${tag}.html`)).href);await page.screenshot({path:`captures/${tag}.png`,fullPage:true});}finally{await browser.close();}
