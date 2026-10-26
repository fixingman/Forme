import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recommendListings,listingKey} from '../../lib/domain/recommendations.mjs';

// A piece you saved is no longer a recommendation: on Discover it should leave the list, not pile up at the top. The option is
// opt-in, because Home, learning, the ranking preview and collection planning still treat saved pieces as evidence.
const now=Date.parse('2026-10-25T12:00:00Z');
const base={following:['Our Legacy'],excluded:[],styles:['Minimalism'],styleRules:{},saved:[],dismissed:[],gender:{selected:['men','unisex'],includeUnknown:false},sizing:{enabled:false}};
const piece=(id,brand,title,extra={})=>({id,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,sourceUrl:`https://www.vinted.se/items/${id}-x`,imageUrl:`https://images1.vinted.net/t/${id}.webp?s=1`,brand,title,gender:'men',size:'M',price:100,age:1,fetchedAt:'2026-10-24T12:00:00Z',observedAt:'2026-10-24T12:00:00Z',condition:'Good',currency:'SEK',category:'',image:'',...extra});
const pool=[piece(1,'Lemaire','Cotton trousers',{style:'Minimalism'}),piece(2,'Lemaire','Wool jacket',{style:'Minimalism'}),piece(3,'Auralee','Silk shirt',{style:'Minimalism'}),piece(4,'Auralee','Linen shirt',{style:'Minimalism'}),piece(5,'Studio Nicholson','Wool coat',{style:'Minimalism'})];
const ids=rows=>rows.map(row=>row.item.id);
const run=(preferences,options={})=>recommendListings(pool,preferences,{now,signals:pool,...options});

test('by default saved pieces are still recommended, exactly as before',()=>{
 const saved={...base,saved:[1]};
 assert.ok(ids(run(saved)).includes(1));
 assert.deepEqual(run(saved),run(saved,{excludeSaved:false}),'the option off is the same as not passing it');
});
test('with the option on, a saved piece is gone and every other piece is still there',()=>{
 const saved={...base,saved:[1]};
 const rows=run(saved,{excludeSaved:true});
 assert.ok(!ids(rows).includes(1));
 assert.deepEqual(ids(rows).sort(),ids(run(base)).filter(id=>id!==1).sort(),'only the saved piece is removed');
});
test('the saved piece was the one piling up: it ranked first before, and the next best leads after',()=>{
 const saved={...base,saved:[3]};
 assert.equal(run(saved)[0].item.id,3,'before: the piece you just saved is the top recommendation');
 const after=run(saved,{excludeSaved:true});
 assert.notEqual(after[0].item.id,3);assert.equal(after.length,run(saved).length-1);
});
test('saving several pieces removes all of them, and the rest keep their scores and reasons',()=>{
 const saved={...base,saved:[1,3]};
 const full=run(saved),rows=run(saved,{excludeSaved:true});
 assert.deepEqual(ids(rows).sort(),[2,4,5]);
 for(const row of rows){const same=full.find(other=>other.item.id===row.item.id);assert.equal(row.score,same.score,`piece ${row.item.id} keeps its score`);assert.equal(row.reason,same.reason);assert.deepEqual(row.details,same.details);}
});
test('saved pieces still shape the taste: saving a piece keeps boosting its brand and style for the others',()=>{
 const none=run(base,{excludeSaved:true}),saved=run({...base,saved:[3]},{excludeSaved:true});
 const score=(rows,id)=>rows.find(row=>row.item.id===id).score;
 assert.ok(score(saved,4)>score(none,4),'the other Auralee piece scores higher because you saved an Auralee piece');
});
test('unsaving brings the piece back; a piece that is both saved and hidden is simply hidden',()=>{
 assert.ok(ids(run({...base,saved:[]},{excludeSaved:true})).includes(1),'not saved: back in the list');
 assert.ok(!ids(run({...base,saved:[1],dismissed:[listingKey(pool[0])]},{excludeSaved:true})).includes(1));
});
test('saved ids that are not in the pool, an empty list, and missing saved settings are all harmless',()=>{
 assert.deepEqual(ids(run({...base,saved:[999,-1]},{excludeSaved:true})).sort(),ids(run(base)).sort());
 const {saved,...withoutSaved}=base;
 assert.deepEqual(ids(run(withoutSaved,{excludeSaved:true})).sort(),ids(run(base)).sort());
 assert.deepEqual(recommendListings([],{...base,saved:[1]},{now,excludeSaved:true}),[]);
 assert.deepEqual(recommendListings([pool[0]],{...base,saved:[1]},{now,signals:pool,excludeSaved:true}),[],'everything saved: nothing left, not an error');
});
test('the option removes by id only: a different piece with a similar title is untouched',()=>{
 const twin=piece(6,'Lemaire','Cotton trousers',{style:'Minimalism'});
 const rows=recommendListings([...pool,twin],{...base,saved:[1]},{now,signals:[...pool,twin],excludeSaved:true});
 assert.ok(ids(rows).includes(6));assert.ok(!ids(rows).includes(1));
});
