import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makePlan,matchesJob,selectJobs} from '../../scripts/data/collection-plan.mjs';
const backup={app:'forme',version:1,settings:{following:['Our Legacy','our legacy','Zara'],excluded:['ZARA'],searches:[{id:1,name:'Trousers',keyword:'trousers',brand:'',size:'M',max:4000},{id:2,name:'Too broad',keyword:'',brand:'',size:'',max:2500}]}};
test('plan deduplicates brands, respects exclusions and skips unbounded searches',()=>{
 const plan=makePlan(backup);assert.equal(plan.jobs.length,2);assert.equal(plan.jobs[0].query,'Our Legacy');assert.equal(plan.skipped.length,1);
});
test('brand searches reject keyword mentions from other brands and normalize accents',()=>{
 const plan=makePlan(backup),job=plan.jobs[0];
 assert.equal(matchesJob({brand:'Other',title:'Our Legacy shirt'},job,plan),false);
 assert.equal(matchesJob({brand:'OUR LEGACY'},job,plan),true);
 assert.equal(matchesJob({brand:'Sefr'},{kind:'brand',brand:'Séfr'},plan),true);
});
test('saved searches honor keywords, max zero, size and exclusions',()=>{
 const plan=makePlan(backup),job=plan.jobs[1],item={brand:'COS',title:'Wool trousers',category:'',size:'M',price:1000};
 assert.equal(matchesJob(item,job,plan),true);assert.equal(matchesJob({...item,size:'L'},job,plan),false);
 assert.equal(matchesJob({...item,price:5000},job,plan),false);assert.equal(matchesJob(item,{...job,max:0},plan),false);
 assert.equal(matchesJob({...item,brand:'zara'},job,plan),false);
});
test('rotation chooses uncovered queries before previously collected queries',()=>{
 const plan=makePlan(backup);assert.equal(selectJobs(plan,[{id:plan.jobs[0].id,fetchedAt:'2026-10-20T00:00:00Z'}],1)[0].id,plan.jobs[1].id);
});
test('malformed files and searches are rejected',()=>{
 assert.throws(()=>makePlan({...backup,version:2}));assert.throws(()=>makePlan({...backup,settings:{...backup.settings,following:['a'.repeat(301)]}}));
 assert.throws(()=>makePlan({...backup,settings:{...backup.settings,searches:[{id:1,keyword:'x'}]}}));
});
