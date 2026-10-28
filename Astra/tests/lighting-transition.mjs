import assert from 'node:assert/strict';
import {runFixture} from '../tools/browser-fixture.mjs';
const r=await runFixture('tests/lighting-transition-fixture.js','lighting-transition');
assert.deepEqual(r.initial,[0,0,0]);assert.deepEqual(r.middle,[1,.5,.25]);assert.deepEqual(r.interrupted,r.middle);
assert.deepEqual(r.settled,[.5,1,2]);assert.ok(r.skipsSettledWork&&r.restoredTarget);
console.log('GPU lighting transition preserves HDR, interrupted fades and render state.');
