import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recommendListings} from '../../lib/domain/recommendations.mjs';
import {feedbackSnapshot,normalizeTasteFeedback} from '../../lib/domain/taste-profile.mjs';
import {vintedImageUrl,vintedItemUrl} from '../../lib/domain/vinted-urls.mjs';

const now=Date.parse('2026-10-23T12:00:00Z');
const base={following:[],excluded:[],styles:[],styleRules:{},saved:[],dismissed:[],gender:{selected:['men','unisex'],includeUnknown:false},sizing:{enabled:false}};
const piece=(id,brand,title,extra={})=>({id,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,sourceUrl:`https://www.vinted.se/items/${id}-x`,imageUrl:`https://images1.vinted.net/t/${id}.webp?s=1`,brand,title,gender:'men',size:'M',price:100,age:1,fetchedAt:'2026-10-21T10:00:00Z',...extra});
const all=row=>[row.reason,...row.details];
const style=row=>all(row).filter(text=>/style|pieces you saved/i.test(text)&&!/like pieces you saved/i.test(text)&&!/^A brand you saved/.test(text));

test('a piece that matches one of your styles twice over is explained once, not twice',()=>{
 // Lemaire is in the Minimalism brand reference AND the piece itself is Minimalism: two ways to say "style".
 const [row]=recommendListings([piece(1,'Lemaire','Wool shirt',{style:'Minimalism'})],{...base,styles:['Minimalism']},{now});
 assert.match(row.reason,/Minimalism/);assert.equal(style(row).length,1,`style reasoning must appear once: ${JSON.stringify(all(row))}`);
 assert.equal(new Set(all(row)).size,all(row).length,'no reason is repeated');
});
test('reason is always a single short sentence; details are separate, distinct and capped at two',()=>{
 const source=[piece(2,'Lemaire','Cotton trousers',{style:'Minimalism'}),piece(3,'Lemaire','Wool trousers',{style:'Minimalism'})];
 const rows=recommendListings(source,{...base,following:['Our Legacy'],styles:['Minimalism'],saved:[3]},{now,signals:source});
 assert.ok(rows.length>0);
 for(const row of rows){
  assert.equal(typeof row.reason,'string');assert.ok(!row.reason.includes(' · '),`one reason, not a joined list: ${row.reason}`);
  assert.ok(Array.isArray(row.details)&&row.details.length<=2);assert.ok(row.details.every(text=>typeof text==='string'&&/^[A-Z]/.test(text)&&!text.includes(' · ')),JSON.stringify(row.details));
  assert.equal(new Set(all(row)).size,all(row).length);assert.ok(!row.details.includes(row.reason));
 }
});
test('different kinds of reason are kept as details: a saved brand AND a matching category are both useful',()=>{
 const source=[piece(4,'Lemaire','Cotton trousers',{style:'Minimalism'}),piece(5,'Lemaire','Linen trousers',{style:'Minimalism'})];
 const rows=recommendListings(source,{...base,saved:[4]},{now,signals:source});const row=rows.find(r=>r.item.id===5);
 assert.ok(row);assert.match(row.reason,/brand you saved/i);
 assert.ok(row.details.some(text=>/trousers like pieces you saved/i.test(text)),JSON.stringify(row.details));
 assert.ok(!row.details.some(text=>/brand you saved/i.test(text)),'the saved-brand reason is not stated again as a detail');
});
test('the strongest, most personal reason leads: a followed brand\'s relatives say who they relate to',()=>{
 const [row]=recommendListings([piece(6,'Lemaire','Wool coat')],{...base,following:['Our Legacy']},{now});
 assert.equal(row.reason,'Because you follow Our Legacy');
});
test('a piece with only a style signal still gets exactly one clear reason and no details',()=>{
 const [row]=recommendListings([piece(7,'Independent Maker','Vintage denim jacket')],{...base,styles:['Weekend'],styleRules:{Weekend:['Archive']}},{now});
 assert.match(row.reason,/Archive|Weekend/);assert.deepEqual(row.details,[]);
});
test('evidence is still reported for callers that want the raw signals',()=>{
 const [row]=recommendListings([piece(8,'Lemaire','Wool shirt',{style:'Minimalism'})],{...base,styles:['Minimalism']},{now});
 assert.ok(Array.isArray(row.evidence));
});

// ------------------------------------------------------------------ hidden-piece snapshot
test('a snapshot remembers how to recognise the piece, using only validated Vinted addresses',()=>{
 const snap=feedbackSnapshot(piece(11,'Lemaire','  Wide   jeans  '));
 assert.equal(snap.key,'vinted:11');assert.equal(snap.brand,'Lemaire');assert.equal(snap.title,'Wide jeans','whitespace is tidied');
 assert.equal(snap.imageUrl,'https://images1.vinted.net/t/11.webp?s=1');assert.equal(snap.sourceUrl,'https://www.vinted.se/items/11-x');
 assert.ok(Array.isArray(snap.traits)&&'style' in snap);
});
test('addresses that are not Vinted’s, or are unsafe, are never stored; the rest of the snapshot still is',()=>{
 for(const bad of ['https://evil.example/p.jpg','http://images1.vinted.net/p.jpg','https://u:p@images1.vinted.net/p.jpg','javascript:alert(1)','https://images1.vinted.net.evil.test/p.jpg','',null,42,{}]){
  const snap=feedbackSnapshot(piece(12,'Lemaire','Shirt',{imageUrl:bad,sourceUrl:bad}));
  assert.ok(!('imageUrl' in snap),String(bad));assert.ok(!('sourceUrl' in snap),String(bad));assert.equal(snap.title,'Shirt');assert.equal(snap.brand,'Lemaire');
 }
 assert.ok(!('sourceUrl' in feedbackSnapshot(piece(13,'A','B',{sourceUrl:'https://www.vinted.com/items/13-x'}))),'wrong Vinted host');
 assert.ok(!('sourceUrl' in feedbackSnapshot(piece(14,'A','B',{sourceUrl:'https://www.vinted.se/member/14'}))),'not a listing page');
 assert.ok(!('title' in feedbackSnapshot(piece(15,'A','   '))),'a blank title is dropped');
 assert.equal(feedbackSnapshot(piece(16,'A','x'.repeat(500))).title.length,200,'titles are bounded');
});
test('demo pieces and pieces without a title or photo still snapshot cleanly',()=>{
 const snap=feedbackSnapshot({id:3,brand:'Our Legacy',title:'Evening Shirt',style:'Minimalism'});
 assert.equal(snap.key,'demo:3');assert.equal(snap.title,'Evening Shirt');assert.ok(!('imageUrl' in snap)&&!('sourceUrl' in snap));
 assert.deepEqual(Object.keys(feedbackSnapshot({id:4,brand:'X'})).sort(),['brand','key','style','traits']);
});
test('stored feedback is re-validated on load and import; old rows without the new fields stay valid',()=>{
 const old={key:'vinted:1',brand:'Lemaire',traits:['category:clothing'],style:'Minimalism'};
 assert.deepEqual(normalizeTasteFeedback([old]),[old],'an old row round-trips unchanged');
 const hostile=normalizeTasteFeedback([{...old,title:'T'.repeat(400),imageUrl:'https://evil.example/x.jpg',sourceUrl:'javascript:1',extra:'ignored'}]);
 assert.equal(hostile[0].title.length,200);assert.ok(!('imageUrl' in hostile[0])&&!('sourceUrl' in hostile[0])&&!('extra' in hostile[0]));
 const good=normalizeTasteFeedback([{...old,title:'Wide jeans',imageUrl:'https://images1.vinted.net/a.webp',sourceUrl:'https://www.vinted.se/items/1-x'}]);
 assert.deepEqual(good[0],{...old,title:'Wide jeans',imageUrl:'https://images1.vinted.net/a.webp',sourceUrl:'https://www.vinted.se/items/1-x'});
 assert.deepEqual(normalizeTasteFeedback('nope'),[]);assert.equal(normalizeTasteFeedback(Array.from({length:300},(_,i)=>({...old,key:`vinted:${i}`}))).length,200,'still bounded to 200');
});
test('the shared Vinted URL rules accept only plain https on Vinted’s own hosts',()=>{
 assert.equal(vintedImageUrl('https://images1.vinted.net/a.webp'),'https://images1.vinted.net/a.webp');assert.equal(vintedItemUrl('https://www.vinted.se/items/123-shirt'),'https://www.vinted.se/items/123-shirt');assert.equal(vintedItemUrl('https://www.vinted.se/items/123'),'https://www.vinted.se/items/123');
 for(const bad of ['http://www.vinted.se/items/1-x','https://vinted.se/items/1-x','https://www.vinted.se:444/items/1-x','https://www.vinted.se/items/abc','https://www.vinted.se/items/','',undefined,null])assert.equal(vintedItemUrl(bad),undefined,String(bad));
});
