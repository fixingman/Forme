import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hiddenEntries,searchHidden,reasonCounts,filterByReason,NO_REASON,PAGE_SIZE} from '../../lib/domain/hidden-pieces.mjs';
import {isHiddenAt} from '../../lib/domain/hidden-at.mjs';
import {normalizeTasteFeedback} from '../../lib/domain/taste-profile.mjs';
const piece=(id,brand,title,extra={})=>({id,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,sourceUrl:`https://www.vinted.se/items/${id}-x`,imageUrl:`https://images1.vinted.net/${id}.webp`,brand,title,...extra});

test('rows are newest first, and a piece still in the collection shows its live details',()=>{
 const rows=hiddenEntries({keys:['vinted:1','vinted:2','vinted:3'],source:[piece(1,'Lemaire','Wide jeans'),piece(3,'Auralee','Silk shirt')]});
 assert.deepEqual(rows.map(r=>r.key),['vinted:3','vinted:2','vinted:1']);
 assert.deepEqual({s:rows[0].status,b:rows[0].brand,t:rows[0].title,id:rows[0].id,img:rows[0].imageUrl},{s:'collection',b:'Auralee',t:'Silk shirt',id:3,img:'https://images1.vinted.net/3.webp'});
});
test('a piece that left the collection is recognised from what was remembered: brand, title, photo and link',()=>{
 const remembered=[{key:'vinted:2',brand:'Lemaire',title:'Parachute coat',imageUrl:'https://images1.vinted.net/2.webp',sourceUrl:'https://www.vinted.se/items/2-coat',traits:[],style:''}];
 const [row]=hiddenEntries({keys:['vinted:2'],source:[],remembered});
 assert.deepEqual({s:row.status,b:row.brand,t:row.title,img:row.imageUrl,url:row.sourceUrl},{s:'remembered',b:'Lemaire',t:'Parachute coat',img:'https://images1.vinted.net/2.webp',url:'https://www.vinted.se/items/2-coat'});
});
test('an older hidden piece with only a brand is never anonymous: it keeps its brand and gets a link built from the listing number',()=>{
 const [row]=hiddenEntries({keys:['vinted:12345'],remembered:[{key:'vinted:12345',brand:'Studio Nicholson',traits:[],style:''}]});
 assert.equal(row.status,'bare');assert.equal(row.brand,'Studio Nicholson');assert.equal(row.label,'Vinted listing 12345');assert.equal(row.sourceUrl,'https://www.vinted.se/items/12345');
 const [none]=hiddenEntries({keys:['vinted:777']});assert.equal(none.brand,'');assert.equal(none.label,'Vinted listing 777');assert.equal(none.sourceUrl,'https://www.vinted.se/items/777');
});
test('keys that are not Vinted listings get an honest label and no invented link',()=>{
 const [demo]=hiddenEntries({keys:['demo:5']});assert.equal(demo.label,'Sample piece');assert.equal(demo.sourceUrl,undefined);
 const [odd]=hiddenEntries({keys:['tradera:9']});assert.equal(odd.label,'Hidden piece');assert.equal(odd.sourceUrl,undefined);
 const [evil]=hiddenEntries({keys:['vinted:1; javascript:alert(1)']});assert.equal(evil.sourceUrl,undefined);
});
test('a live piece without its own link falls back to the remembered one, then to the listing number',()=>{
 const [a]=hiddenEntries({keys:['vinted:4'],source:[piece(4,'A','B',{sourceUrl:undefined})],remembered:[{key:'vinted:4',brand:'A',sourceUrl:'https://www.vinted.se/items/4-remembered',traits:[],style:''}]});assert.equal(a.sourceUrl,'https://www.vinted.se/items/4-remembered');
 const [b]=hiddenEntries({keys:['vinted:4'],source:[piece(4,'A','B',{sourceUrl:undefined})]});assert.equal(b.sourceUrl,'https://www.vinted.se/items/4');
});
test('inputs are not changed and empty input is fine',()=>{
 const keys=['vinted:1','vinted:2'];hiddenEntries({keys});assert.deepEqual(keys,['vinted:1','vinted:2']);
 assert.deepEqual(hiddenEntries(),[]);assert.deepEqual(hiddenEntries({keys:[]}),[]);
});
test('search matches every typed word in brand, title or listing number, ignoring case and accents',()=>{
 const rows=hiddenEntries({keys:['vinted:1','vinted:2','vinted:3','vinted:4'],source:[piece(1,'Lemaire','Wide jeans'),piece(2,'Comme des Garçons','Wool jacket'),piece(3,'Auralee','Silk shirt')],remembered:[{key:'vinted:4',brand:'Lemaire',title:'Parachute coat',traits:[],style:''}]});
 const find=query=>searchHidden(rows,query).map(r=>r.key).sort();
 assert.deepEqual(find(''),['vinted:1','vinted:2','vinted:3','vinted:4']);assert.deepEqual(find('   '),['vinted:1','vinted:2','vinted:3','vinted:4']);
 assert.deepEqual(find('lemaire'),['vinted:1','vinted:4']);assert.deepEqual(find('LEMAIRE coat'),['vinted:4']);assert.deepEqual(find('coat lemaire'),['vinted:4']);
 assert.deepEqual(find('garcons'),['vinted:2'],'accents are ignored');assert.deepEqual(find('garçons'),['vinted:2']);assert.deepEqual(find('silk'),['vinted:3']);
 assert.deepEqual(find('nothing like this'),[]);assert.deepEqual(find('vinted:2'),['vinted:2'],'the listing number is searchable too');
 const bare=hiddenEntries({keys:['vinted:998877']});assert.equal(searchHidden(bare,'998877').length,1);assert.equal(searchHidden(bare,'listing').length,1);
});

const withReasons=[{key:'a',reason:'color'},{key:'b',reason:'material'},{key:'c'},{key:'d',reason:'color'},{key:'e',reason:'unspecified'},{key:'f',reason:'invented'}];
test('reason counts list only reasons that occur, in the order offered, with plain hides and "No reason" together last',()=>{
 assert.deepEqual(reasonCounts(withReasons).map(r=>[r.value,r.label,r.count]),[['material','Not the right material',1],['color','Not the right colour',2],[NO_REASON,'No reason',3]]);
 assert.deepEqual(reasonCounts([]),[]);
 assert.deepEqual(reasonCounts([{key:'x',reason:'price'}]).map(r=>r.value),['price']);
});
test('filtering by reason keeps order, treats unknown or unspecified as no reason, and "all" changes nothing',()=>{
 assert.deepEqual(filterByReason(withReasons,'color').map(r=>r.key),['a','d']);
 assert.deepEqual(filterByReason(withReasons,NO_REASON).map(r=>r.key),['c','e','f']);
 assert.equal(filterByReason(withReasons,'all'),withReasons);
 assert.deepEqual(filterByReason(withReasons,'price'),[]);
});
test('a page of hidden pieces is twenty',()=>assert.equal(PAGE_SIZE,20));
test('hidden dates are ISO instants only, and a stored row keeps a valid one but drops anything else',()=>{
 for(const good of ['2026-10-25T13:55:00.000Z','2026-10-25T13:55:00Z'])assert.equal(isHiddenAt(good),true,good);
 for(const bad of ['2026-10-25','yesterday','2026-13-45T99:00:00Z','2026-10-25T13:55:00+02:00',20261025,null,undefined,{}])assert.equal(isHiddenAt(bad),false,String(bad));
 const rows=normalizeTasteFeedback([{key:'vinted:1',brand:'A',traits:[],style:'',hiddenAt:'2026-10-25T13:55:00.000Z'},{key:'vinted:2',brand:'B',traits:[],style:'',hiddenAt:'last week'},{key:'vinted:3',brand:'C',traits:[],style:''}]);
 assert.equal(rows[0].hiddenAt,'2026-10-25T13:55:00.000Z');assert.equal('hiddenAt' in rows[1],false);assert.equal('hiddenAt' in rows[2],false);
});
