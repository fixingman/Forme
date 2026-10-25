import {test,expect,type Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {defaults} from '../../lib/catalog';
import {createBackup} from '../../lib/settings-backup';

const at=new Date(Date.now()-86400000).toISOString();
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==','base64');
const piece=(id:number,brand:string,title:string,extra:Record<string,unknown>={})=>({id,brand,title,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,sourceUrl:`https://www.vinted.se/items/${id}-x`,imageUrl:`https://images1.vinted.net/live-${id}.png`,price:1200,currency:'SEK',size:'M',condition:'Good',gender:'men',genderSource:'provider',fetchedAt:at,firstSeenAt:at,observedAt:at,newlyCollected:true,category:'',style:'',age:1,rarity:0,image:'',...extra});
const inCollection=[piece(95001,'Lemaire','Wide jeans'),piece(95002,'Auralee','Silk shirt'),piece(95003,'Our Legacy','Box shirt')];
const snap=(key:string,brand:string,extra:Record<string,unknown>={})=>({key,brand,traits:['category:clothing'],style:'',...extra});
// Hidden oldest -> newest. 95001 is still in the collection; 96001 left it but was remembered; 96002/96003 are older rows.
const dismissed=['vinted:96003','vinted:96002','vinted:96001','vinted:95001'];
const remembered=[
 snap('vinted:96001','Comme des Garçons',{title:'Wool parachute jacket',imageUrl:'https://images1.vinted.net/gone-96001.png',sourceUrl:'https://www.vinted.se/items/96001-jacket'}),
 snap('vinted:96002','Studio Nicholson'),   // older: brand only
];
const settings={...defaults,following:[],excluded:[],styles:[],styleRules:{},saved:[],searches:[],dismissed,tasteFeedback:remembered,sizing:{enabled:false,selected:[],includeOneSize:true,includeUnspecified:true}};

test.beforeEach(async({page})=>{
 await page.addInitScript(value=>{localStorage.setItem('forme-onboarding-complete','1');if(!localStorage.getItem('forme-v2'))localStorage.setItem('forme-v2',JSON.stringify(value));},settings);
 await page.route('**/api/listings',route=>route.fulfill({json:{fetchedAt:at,queries:['fixture'],items:inCollection}}));
 for(const path of ['size-profile','local-profile','profile','refresh','learning'])await page.route(`**/api/${path}`,route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
 // live and remembered photos load; the third piece's photo is gone, as on Vinted after a re-upload
 await page.route('https://images1.vinted.net/**',route=>/live-95001|gone-96001/.test(route.request().url())?route.fulfill({status:200,contentType:'image/png',body:PNG}):route.fulfill({status:404,body:''}));
});
const rows=(page:Page)=>page.locator('#hidden-pieces .hidden-piece');
const row=(page:Page,text:string|RegExp)=>rows(page).filter({hasText:text});

test('every hidden piece is recognisable: brand, title, thumbnail and where it is now',async({page})=>{
 await page.goto('/settings');await expect(rows(page)).toHaveCount(4);
 await expect(page.getByText('A piece outside the current collection')).toHaveCount(0);
 // still in the collection: live details, links to the item page, photo shown
 const live=row(page,'Lemaire');await expect(live.locator('strong')).toHaveText('Lemaire');await expect(live).toContainText('Wide jeans');
 await expect(live.getByRole('link',{name:/Lemaire\s*Wide jeans/})).toHaveAttribute('href','/items/95001');await expect(live.locator('img')).toBeVisible();await expect(live).not.toContainText('No longer in your collection');
 // left the collection but remembered: brand, title, photo, a plain note and a link to the listing
 const gone=row(page,'Comme des Garçons');await expect(gone.locator('strong')).toHaveText('Comme des Garçons');await expect(gone).toContainText('Wool parachute jacket');
 await expect(gone).toContainText('No longer in your collection');await expect(gone.locator('img')).toBeVisible();
 const link=gone.getByRole('link',{name:'Open on Vinted ↗'});await expect(link).toHaveAttribute('href','https://www.vinted.se/items/96001-jacket');await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel',/noopener/);await expect(link).toHaveAttribute('rel',/noreferrer/);
 // older, brand only: still named, honest about what was not saved, and still reachable
 const old=row(page,'Studio Nicholson');await expect(old.locator('strong')).toHaveText('Studio Nicholson');await expect(old).toContainText('Photo and title weren’t saved for this older piece');
 await expect(old.getByRole('link',{name:'Open on Vinted ↗'})).toHaveAttribute('href','https://www.vinted.se/items/96002');
 // no brand at all: a recognisable listing number instead of an anonymous row
 const bare=row(page,'Vinted listing 96003');await expect(bare.locator('strong')).toHaveText('Vinted listing 96003');await expect(bare.getByRole('link',{name:'Open on Vinted ↗'})).toHaveAttribute('href','https://www.vinted.se/items/96003');
});
test('newest hidden first',async({page})=>{
 await page.goto('/settings');
 await expect(rows(page).locator('strong')).toHaveText(['Lemaire','Comme des Garçons','Studio Nicholson','Vinted listing 96003']);
});
test('a thumbnail that cannot load becomes a quiet icon, not a block of text, and is hidden from screen readers',async({page})=>{
 await page.goto('/settings');const old=row(page,'Studio Nicholson');
 await expect(old.locator('.hidden-piece-photo .photo-fallback-compact')).toBeVisible();await expect(old.locator('.hidden-piece-photo')).not.toContainText('Photo unavailable');
 await expect(old.locator('.photo-fallback-compact')).toHaveAttribute('aria-hidden','true');
 const box=(await old.locator('.hidden-piece-photo').boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(46);expect(box.width).toBeLessThanOrEqual(58);
});
test('Restore is named after the piece and removes only that row, persistently',async({page})=>{
 await page.goto('/settings');
 await row(page,'Comme des Garçons').getByRole('button',{name:'Restore Wool parachute jacket',exact:true}).click();
 await expect(rows(page)).toHaveCount(3);await expect(row(page,'Comme des Garçons')).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).dismissed)).toEqual(['vinted:96003','vinted:96002','vinted:95001']);
 await page.reload();await expect(rows(page)).toHaveCount(3);
 await expect(row(page,'Studio Nicholson').getByRole('button',{name:'Restore Studio Nicholson',exact:true})).toBeVisible();await expect(row(page,'Vinted listing 96003').getByRole('button',{name:'Restore Vinted listing 96003',exact:true})).toBeVisible();
 await expect(row(page,'Lemaire').getByRole('button',{name:'Restore Wide jeans',exact:true})).toBeVisible();
});
test('no search for a short list; it appears for a long one and finds by brand, title or accented name',async({page})=>{
 await page.goto('/settings');await expect(page.getByRole('searchbox',{name:'Search hidden pieces'})).toHaveCount(0);
 const many=Array.from({length:8},(_,i)=>`vinted:97${String(i).padStart(3,'0')}`),extra=many.map((key,i)=>snap(key,i%2?'Lemaire':'Auralee',{title:i%2?`Linen trousers ${i}`:`Merino knit ${i}`}));
 // Seed on the next document before the persistent shell can write its initial state.
 await page.addInitScript(value=>localStorage.setItem('forme-v2',JSON.stringify(value)),{...settings,dismissed:[...dismissed,...many],tasteFeedback:[...remembered,...extra]});
 await page.reload();await expect(rows(page)).toHaveCount(12);
 const search=page.getByRole('searchbox',{name:'Search hidden pieces'});await expect(search).toBeVisible();
 await search.fill('linen');await expect(rows(page)).toHaveCount(4);await expect(page.locator('.hidden-search-status')).toHaveText('Showing 4 of 12');
 await search.fill('lemaire linen');await expect(rows(page)).toHaveCount(4);
 await search.fill('garcons');await expect(rows(page)).toHaveCount(1);await expect(rows(page).first()).toContainText('Comme des Garçons');
 await search.fill('MERINO');await expect(rows(page)).toHaveCount(4);
 await search.fill('96003');await expect(rows(page)).toHaveCount(1);
 await search.fill('zzz');await expect(rows(page)).toHaveCount(0);await expect(page.locator('.hidden-search-status')).toHaveText('No hidden pieces match “zzz”.');
 await page.getByRole('button',{name:'Clear search',exact:true}).click();await expect(rows(page)).toHaveCount(12);await expect(search).toHaveValue('');await expect(page.locator('.hidden-search-status')).toHaveCount(0);
});
test('searching then restoring keeps the filter and updates the count',async({page})=>{
 // Seed before hydration instead of racing the persistent shell's initial localStorage write.
 await page.addInitScript(s=>{if(sessionStorage.getItem('hidden-search-seeded'))return;sessionStorage.setItem('hidden-search-seeded','1');const keys=Array.from({length:6},(_,i)=>`vinted:98${i}00`);localStorage.setItem('forme-v2',JSON.stringify({...s,dismissed:[...s.dismissed,...keys],tasteFeedback:[...s.tasteFeedback,...keys.map(key=>({key,brand:'Lemaire',traits:[],style:'',title:'Denim shirt'}))]}));},settings);
 await page.goto('/settings');const search=page.getByRole('searchbox',{name:'Search hidden pieces'});await search.fill('denim');await expect(rows(page)).toHaveCount(6);
 await rows(page).first().getByRole('button',{name:'Restore Denim shirt',exact:true}).click();
 await expect(rows(page)).toHaveCount(5);await expect(search).toHaveValue('denim');await expect(page.locator('.hidden-search-status')).toHaveText('Showing 5 of 9');
});
test('hiding a piece remembers it; after it leaves the collection it is still recognisable',async({page})=>{
 // start this test from a clean slate that follows Our Legacy and has nothing hidden (seeded once, so later navigation keeps its changes)
 await page.addInitScript(value=>{if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('forme-v2',JSON.stringify(value));}},{...settings,following:['Our Legacy'],dismissed:[],tasteFeedback:[]});
 await page.goto('/following');await expect(page.getByTestId('listing-95003')).toBeVisible();
 await page.getByTestId('listing-95003').getByRole('button',{name:'Not for me: Box shirt',exact:true}).click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).tasteFeedback.at(-1));
 expect(saved).toMatchObject({key:'vinted:95003',brand:'Our Legacy',title:'Box shirt',imageUrl:'https://images1.vinted.net/live-95003.png',sourceUrl:'https://www.vinted.se/items/95003-x'});
 // the listing now leaves the collection entirely
 await page.unroute('**/api/listings');await page.route('**/api/listings',route=>route.fulfill({json:{fetchedAt:at,queries:['fixture'],items:inCollection.filter(item=>item.id!==95003)}}));
 await page.goto('/settings');const gone=row(page,'Our Legacy');
 await expect(gone).toContainText('Box shirt');await expect(gone).toContainText('No longer in your collection');await expect(gone.getByRole('link',{name:'Open on Vinted ↗'})).toHaveAttribute('href','https://www.vinted.se/items/95003-x');
});
test('the remembered details travel in a backup, and a hand-edited backup cannot add other addresses',async({page})=>{
 await page.goto('/settings');
 const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Download settings backup'}).click();
 const backup=JSON.parse(await readFile((await (await waiting).path())!,'utf8'));
 const first=backup.settings.tasteFeedback.find((row:{key:string})=>row.key==='vinted:96001');
 expect(first).toMatchObject({title:'Wool parachute jacket',imageUrl:'https://images1.vinted.net/gone-96001.png',sourceUrl:'https://www.vinted.se/items/96001-jacket'});
 // hostile edit: a foreign photo address and a javascript: link
 first.imageUrl='https://evil.example/track.png';first.sourceUrl='javascript:alert(1)';
 const path=test.info().outputPath('tampered.json');await writeFile(path,JSON.stringify(backup));
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('forme-v2')!);s.tasteFeedback=[];s.dismissed=[];localStorage.setItem('forme-v2',JSON.stringify(s));});await page.reload();
 await page.getByLabel('Restore settings from file',{exact:true}).setInputFiles(path);await page.getByRole('button',{name:'Restore this backup'}).click();await page.reload();
 const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).tasteFeedback.find((row:{key:string})=>row.key==='vinted:96001'));
 expect(restored.title).toBe('Wool parachute jacket');expect(restored.brand).toBe('Comme des Garçons');
 expect(restored.imageUrl).toBeUndefined();expect(restored.sourceUrl).toBeUndefined();   // accepted, then stripped: only validated Vinted addresses are kept
 await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);await expect(page.locator('img[src*="evil.example"]')).toHaveCount(0);
 // the piece is still recognisable, and its link falls back to one built from the listing number
 await expect(row(page,'Comme des Garçons').getByRole('link',{name:'Open on Vinted ↗'})).toHaveAttribute('href','https://www.vinted.se/items/96001');
});
test('a backup with a malformed remembered title is refused whole and changes nothing',async({page})=>{
 await page.goto('/settings');
 const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Download settings backup'}).click();
 const backup=JSON.parse(await readFile((await (await waiting).path())!,'utf8'));
 backup.settings.tasteFeedback.find((row:{key:string})=>row.key==='vinted:96001').title='T'.repeat(500);
 const path=test.info().outputPath('too-long.json');await writeFile(path,JSON.stringify(backup));
 const before=await page.evaluate(()=>localStorage.getItem('forme-v2'));
 await page.getByLabel('Restore settings from file',{exact:true}).setInputFiles(path);
 await expect(page.getByRole('button',{name:'Restore this backup'})).toHaveCount(0);await expect(page.getByRole('status').filter({hasText:/invalid taste feedback|nothing was changed/i}).first()).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('forme-v2'))).toBe(before);
});
test('the Collection tools review shows the same recognisable rows',async({page})=>{
 await page.goto('/tools');await page.locator('#feedback > summary').click();await page.getByText(/Review hidden pieces \(\d+\)/).click();
 const list=page.locator('#feedback .hidden-piece');await expect(list).toHaveCount(4);
 await expect(list.filter({hasText:'Comme des Garçons'})).toContainText('Wool parachute jacket');await expect(list.filter({hasText:'Comme des Garçons'})).toContainText('No longer in your collection');
 await expect(page.getByText('Item outside the current collection')).toHaveCount(0);
 await list.filter({hasText:'Lemaire'}).getByRole('button',{name:'Restore Wide jeans',exact:true}).click();await expect(page.locator('#feedback .hidden-piece')).toHaveCount(3);
});
for(const [name,size] of [['phone',{width:375,height:760}],['small phone',{width:340,height:700}],['desktop',{width:1280,height:800}]] as const)
test(`hidden pieces fit without overflow on ${name}, with 44px restore targets`,async({page})=>{
 await page.setViewportSize(size);await page.goto('/settings');await expect(rows(page)).toHaveCount(4);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const button of await page.locator('#hidden-pieces').getByRole('button',{name:/^Restore/}).all()){const b=(await button.boundingBox())!;expect(b.height).toBeGreaterThanOrEqual(44);expect(b.x+b.width).toBeLessThanOrEqual(size.width);}
 for(const r of await rows(page).all()){const b=(await r.boundingBox())!;expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(size.width+0.5);}
});

// ------------------------------------------------------------------ reasons
const reasonOf=(page:Page,key:string)=>page.evaluate(k=>JSON.parse(localStorage.getItem('forme-v2')!).tasteFeedback.find((row:{key:string})=>row.key===k)?.reason,key);
const dialog=(page:Page)=>page.getByRole('dialog',{name:'Why wasn’t this for you?'});
const labels=['Not my style','Not the right material','Not the right colour','Too expensive','Incorrect size/category','No reason'];
test('the reason dialog offers material and colour, in a sensible order, with the current choice marked',async({page})=>{
 await page.goto('/settings');
 await row(page,'Comme des Garçons').getByRole('button',{name:'Edit reason for Wool parachute jacket',exact:true}).click();
 await expect(dialog(page)).toBeVisible();
 expect(await dialog(page).locator('.reason-options button').allInnerTexts()).toEqual(labels);
 await expect(dialog(page).getByRole('button',{name:'No reason',exact:true})).toHaveAttribute('aria-pressed','true');   // nothing chosen yet
 await expect(dialog(page)).toContainText('Material and colour are remembered as specific dislikes, not as a verdict on the brand.');
 await dialog(page).getByRole('button',{name:'Not now',exact:true}).click();await expect(dialog(page)).toHaveCount(0);expect(await reasonOf(page,'vinted:96001')).toBeUndefined();
});
test('choosing a colour reason shows it on the row, survives a reload, and can be found by search',async({page})=>{
 await page.goto('/settings');const gone=row(page,'Comme des Garçons');
 await expect(gone.locator('.hidden-piece-reason')).toHaveCount(0);
 await gone.getByRole('button',{name:'Edit reason for Wool parachute jacket',exact:true}).click();await dialog(page).getByRole('button',{name:'Not the right colour',exact:true}).click();
 await expect(dialog(page)).toHaveCount(0);await expect(page.getByText('Reason saved.',{exact:false})).toBeVisible();
 await expect(gone.locator('.hidden-piece-reason')).toHaveText('Not the right colour');expect(await reasonOf(page,'vinted:96001')).toBe('color');
 await page.reload();await expect(row(page,'Comme des Garçons').locator('.hidden-piece-reason')).toHaveText('Not the right colour');
 // reopening marks the saved choice, and changing it replaces it rather than adding another
 await row(page,'Comme des Garçons').getByRole('button',{name:'Edit reason for Wool parachute jacket',exact:true}).click();
 await expect(dialog(page).getByRole('button',{name:'Not the right colour',exact:true})).toHaveAttribute('aria-pressed','true');await expect(dialog(page).getByRole('button',{name:'Not the right material',exact:true})).toHaveAttribute('aria-pressed','false');
 await dialog(page).getByRole('button',{name:'Not the right material',exact:true}).click();
 await expect(row(page,'Comme des Garçons').locator('.hidden-piece-reason')).toHaveText('Not the right material');expect(await reasonOf(page,'vinted:96001')).toBe('material');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).tasteFeedback.filter((row:{key:string})=>row.key==='vinted:96001').length)).toBe(1);
 await expect(rows(page)).toHaveCount(4);
});
test('"No reason" and a plain hide show no reason line, so the list stays quiet',async({page})=>{
 await page.goto('/settings');await expect(page.locator('#hidden-pieces .hidden-piece-reason')).toHaveCount(0);
 const gone=row(page,'Comme des Garçons');
 await gone.getByRole('button',{name:'Edit reason for Wool parachute jacket',exact:true}).click();await dialog(page).getByRole('button',{name:'Too expensive',exact:true}).click();
 await expect(gone.locator('.hidden-piece-reason')).toHaveText('Too expensive');
 await gone.getByRole('button',{name:'Edit reason for Wool parachute jacket',exact:true}).click();await dialog(page).getByRole('button',{name:'No reason',exact:true}).click();
 await expect(gone.locator('.hidden-piece-reason')).toHaveCount(0);expect(await reasonOf(page,'vinted:96001')).toBe('unspecified');
});
test('a piece hidden before its details were remembered can still be given a reason',async({page})=>{
 await page.goto('/settings');
 expect(await reasonOf(page,'vinted:95001')).toBeUndefined();   // hidden, in the collection, but with no stored row
 await row(page,'Lemaire').getByRole('button',{name:'Edit reason for Wide jeans',exact:true}).click();await dialog(page).getByRole('button',{name:'Not the right colour',exact:true}).click();
 await expect(row(page,'Lemaire').locator('.hidden-piece-reason')).toHaveText('Not the right colour');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).tasteFeedback.find((row:{key:string})=>row.key==='vinted:95001'));
 expect(saved).toMatchObject({key:'vinted:95001',brand:'Lemaire',title:'Wide jeans',reason:'color'});
 await page.reload();await expect(row(page,'Lemaire').locator('.hidden-piece-reason')).toHaveText('Not the right colour');
 // and one that has left the collection and has no row at all still keeps its choice
 await row(page,'Vinted listing 96003').getByRole('button',{name:/^Edit reason for /}).click();await dialog(page).getByRole('button',{name:'Not the right material',exact:true}).click();
 await expect(row(page,'Vinted listing 96003').locator('.hidden-piece-reason')).toHaveText('Not the right material');expect(await reasonOf(page,'vinted:96003')).toBe('material');
});
test('search finds hidden pieces by the reason in words',async({page})=>{
 await page.goto('/settings');await expect(rows(page).first()).toBeVisible();
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('forme-v2')!);const keys=Array.from({length:6},(_,i)=>`vinted:99${i}00`);s.dismissed=[...s.dismissed,...keys];s.tasteFeedback=[...s.tasteFeedback,...keys.map((key,i)=>({key,brand:'Auralee',traits:[],style:'',title:'Knit',reason:i%2?'color':'material'}))];localStorage.setItem('forme-v2',JSON.stringify(s));});
 await page.reload();const search=page.getByRole('searchbox',{name:'Search hidden pieces'});
 await search.fill('right colour');await expect(rows(page)).toHaveCount(3);await search.fill('material');await expect(rows(page)).toHaveCount(3);await search.fill('not the right');await expect(rows(page)).toHaveCount(6);
});
test('the new reasons travel in a backup; an unknown reason is refused whole and changes nothing',async({page})=>{
 await page.goto('/settings');
 await row(page,'Comme des Garçons').getByRole('button',{name:'Edit reason for Wool parachute jacket',exact:true}).click();await dialog(page).getByRole('button',{name:'Not the right colour',exact:true}).click();
 const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Download settings backup'}).click();
 const backup=JSON.parse(await readFile((await (await waiting).path())!,'utf8'));
 expect(backup.settings.tasteFeedback.find((r:{key:string})=>r.key==='vinted:96001').reason).toBe('color');
 // a clean restore keeps it
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('forme-v2')!);s.tasteFeedback=[];localStorage.setItem('forme-v2',JSON.stringify(s));});await page.reload();
 const okPath=test.info().outputPath('ok.json');await writeFile(okPath,JSON.stringify(backup));
 await page.getByLabel('Restore settings from file',{exact:true}).setInputFiles(okPath);await page.getByRole('button',{name:'Restore this backup'}).click();await page.reload();
 expect(await reasonOf(page,'vinted:96001')).toBe('color');await expect(row(page,'Comme des Garçons').locator('.hidden-piece-reason')).toHaveText('Not the right colour');
 // an invented reason is refused before anything changes
 backup.settings.tasteFeedback.find((r:{key:string})=>r.key==='vinted:96001').reason='colour';
 const badPath=test.info().outputPath('bad.json');await writeFile(badPath,JSON.stringify(backup));const before=await page.evaluate(()=>localStorage.getItem('forme-v2'));
 await page.getByLabel('Restore settings from file',{exact:true}).setInputFiles(badPath);
 await expect(page.getByRole('button',{name:'Restore this backup'})).toHaveCount(0);await expect(page.getByRole('status').filter({hasText:/invalid feedback|nothing was changed/i}).first()).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('forme-v2'))).toBe(before);
});
test('the six reasons fit on a phone, each a comfortable tap target',async({page})=>{
 await page.setViewportSize({width:340,height:700});await page.goto('/settings');
 await row(page,'Comme des Garçons').getByRole('button',{name:'Edit reason for Wool parachute jacket',exact:true}).click();await expect(dialog(page)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const b of await dialog(page).locator('.reason-options button').all()){const box=(await b.boundingBox())!;expect(box.height).toBeGreaterThanOrEqual(40);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(340);}
 const dlg=(await dialog(page).boundingBox())!;expect(dlg.y).toBeGreaterThanOrEqual(0);expect(dlg.y+dlg.height).toBeLessThanOrEqual(700+1);
});

// ------------------------------------------------------- hidden date, filter, paging
const seed=async(page:Page,extra:{key:string;reason?:string}[])=>{await expect(rows(page).first()).toBeVisible();await seedRows(page,extra);};
const seedRows=(page:Page,extra:{key:string;reason?:string}[])=>page.evaluate(rows=>{const s=JSON.parse(localStorage.getItem('forme-v2')!);s.dismissed=[...s.dismissed,...rows.map(row=>row.key)];s.tasteFeedback=[...s.tasteFeedback,...rows.map(row=>({key:row.key,brand:'Auralee',traits:[],style:'',title:`Knit ${row.key.slice(-3)}`,...(row.reason?{reason:row.reason}:{})}))];localStorage.setItem('forme-v2',JSON.stringify(s));},extra);
const stored=(page:Page,key:string)=>page.evaluate(k=>JSON.parse(localStorage.getItem('forme-v2')!).tasteFeedback.find((row:{key:string})=>row.key===k),key);
test('a new hide records when it happened; older hides stay undated and a reason change keeps the date',async({page})=>{
 await page.clock.install({time:new Date('2026-10-25T10:00:00Z')});
 await page.goto('/items/95002');await page.getByRole('button',{name:'Not for me: Silk shirt',exact:true}).click();
 await expect.poll(async()=>(await stored(page,'vinted:95002'))?.hiddenAt).toBeTruthy();
 const hidden=(await stored(page,'vinted:95002')).hiddenAt as string;expect(hidden).toMatch(/^2026-10-25T10:00:0\d\.\d{3}Z$/);
 expect((await stored(page,'vinted:96001')).hiddenAt).toBeUndefined();   // hidden before dates were recorded
 await page.goto('/settings');await page.clock.runFor(60_000);
 await row(page,'Auralee').getByRole('button',{name:'Edit reason for Silk shirt',exact:true}).click();await dialog(page).getByRole('button',{name:'Not the right colour',exact:true}).click();
 await expect(row(page,'Auralee').locator('.hidden-piece-reason')).toHaveText('Not the right colour');
 expect(await stored(page,'vinted:95002')).toMatchObject({reason:'color',hiddenAt:hidden});
 // hiding it again later is a new hide with a new date
 await row(page,'Auralee').getByRole('button',{name:'Restore Silk shirt',exact:true}).click();await page.goto('/items/95002');
 await page.getByRole('button',{name:'Not for me: Silk shirt',exact:true}).click();
 await expect.poll(async()=>((await stored(page,'vinted:95002')).hiddenAt as string)>hidden).toBe(true);
});
test('with only a few hidden pieces there is no filter and no Show more',async({page})=>{
 await page.goto('/settings');await expect(rows(page)).toHaveCount(4);
 await expect(page.getByRole('group',{name:'Filter by reason'})).toHaveCount(0);await expect(page.getByRole('button',{name:/Show \d+ more/})).toHaveCount(0);
});
test('a long list shows twenty at a time, newest first, and keeps going until everything is shown',async({page})=>{
 await page.goto('/settings');
 await seed(page,Array.from({length:46},(_,i)=>({key:`vinted:98${String(i).padStart(3,'0')}`})));await page.reload();
 await expect(rows(page)).toHaveCount(20);
 await expect(rows(page).first()).toContainText('Knit 045');   // hidden last = shown first
 const more=page.getByRole('button',{name:/^Show \d+ more/});await expect(more).toHaveText(/Show 20 more\s*30 left/);
 await more.click();await expect(rows(page)).toHaveCount(40);await expect(more).toHaveText(/Show 10 more\s*10 left/);
 await more.click();await expect(rows(page)).toHaveCount(50);await expect(more).toHaveCount(0);
 // restoring one keeps the revealed depth rather than snapping back to twenty
 await page.getByRole('button',{name:'Restore Knit 045',exact:true}).click();await expect(rows(page)).toHaveCount(49);
});
test('filter by reason: counts, one choice at a time, combines with search, and resets paging',async({page})=>{
 await page.goto('/settings');
 await seed(page,[{key:'vinted:97001',reason:'color'},{key:'vinted:97002',reason:'color'},{key:'vinted:97003',reason:'material'},{key:'vinted:97004'},{key:'vinted:97005',reason:'unspecified'},{key:'vinted:97006'}]);await page.reload();
 const group=page.getByRole('group',{name:'Filter by reason'});await expect(group).toBeVisible();
 expect((await group.getByRole('button').allInnerTexts()).map(text=>text.replace(/\s+/g,' ').trim())).toEqual(['All 10','Not the right material 1','Not the right colour 2','No reason 7']);
 await expect(group.getByRole('button',{name:/^All/})).toHaveAttribute('aria-pressed','true');await expect(rows(page)).toHaveCount(10);
 await group.getByRole('button',{name:/^Not the right colour/}).click();
 await expect(group.getByRole('button',{name:/^Not the right colour/})).toHaveAttribute('aria-pressed','true');await expect(group.getByRole('button',{name:/^All/})).toHaveAttribute('aria-pressed','false');
 await expect(rows(page)).toHaveCount(2);await expect(page.getByRole('status').filter({hasText:'Showing 2 of 10'})).toBeVisible();
 await expect(rows(page).locator('.hidden-piece-reason')).toHaveText(['Not the right colour','Not the right colour']);
 // search narrows within the chosen reason
 const search=page.getByRole('searchbox',{name:'Search hidden pieces'});await search.fill('97002');await expect(rows(page)).toHaveCount(1);
 await search.fill('zzz');await expect(page.getByText('No hidden pieces match “zzz”.')).toBeVisible();await search.fill('');
 // plain hides and "No reason" are one choice
 await group.getByRole('button',{name:/^No reason/}).click();await expect(rows(page)).toHaveCount(7);
 // restoring the last piece of a reason drops its choice and falls back to everything
 await group.getByRole('button',{name:/^Not the right material/}).click();await expect(rows(page)).toHaveCount(1);
 await rows(page).first().getByRole('button',{name:/^Restore /}).click();
 await expect(group.getByRole('button',{name:/^Not the right material/})).toHaveCount(0);await expect(group.getByRole('button',{name:/^All/})).toHaveAttribute('aria-pressed','true');await expect(rows(page)).toHaveCount(9);
});
test('changing a reason moves the piece between filter choices straight away',async({page})=>{
 await page.goto('/settings');
 await seed(page,[{key:'vinted:97001',reason:'color'},{key:'vinted:97002'}]);await page.reload();
 const group=page.getByRole('group',{name:'Filter by reason'});await expect(group.getByRole('button',{name:/^Not the right colour 1/})).toBeVisible();
 await row(page,'Comme des Garçons').getByRole('button',{name:'Edit reason for Wool parachute jacket',exact:true}).click();await dialog(page).getByRole('button',{name:'Not the right colour',exact:true}).click();
 await expect(group.getByRole('button',{name:/^Not the right colour 2/})).toBeVisible();await expect(group.getByRole('button',{name:/^No reason 4/})).toBeVisible();
});
test('the filter row wraps on a phone without sideways scrolling and keeps comfortable taps',async({page})=>{
 await page.setViewportSize({width:340,height:700});await page.goto('/settings');
 await seed(page,Array.from({length:30},(_,i)=>({key:`vinted:96${String(i+10).padStart(3,'0')}`,reason:['color','material','price','data','style',undefined][i%6]})));await page.reload();
 const group=page.getByRole('group',{name:'Filter by reason'});await group.scrollIntoViewIfNeeded();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const b of await group.getByRole('button').all()){const box=(await b.boundingBox())!;expect(box.height).toBeGreaterThanOrEqual(36);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(340);}
 const more=page.getByRole('button',{name:/^Show \d+ more/});await more.scrollIntoViewIfNeeded();const box=(await more.boundingBox())!;expect(box.height).toBeGreaterThanOrEqual(40);
});
test('the hidden date travels in a backup, and a malformed one is refused whole',async({page})=>{
 await page.goto('/settings');await expect(rows(page).first()).toBeVisible();
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('forme-v2')!);s.tasteFeedback=s.tasteFeedback.map((row:{key:string})=>row.key==='vinted:96001'?{...row,hiddenAt:'2026-10-25T10:00:00.000Z'}:row);localStorage.setItem('forme-v2',JSON.stringify(s));});await page.reload();
 const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Download settings backup'}).click();
 const backup=JSON.parse(await readFile((await (await waiting).path())!,'utf8'));
 expect(backup.settings.tasteFeedback.find((r:{key:string})=>r.key==='vinted:96001').hiddenAt).toBe('2026-10-25T10:00:00.000Z');
 backup.settings.tasteFeedback.find((r:{key:string})=>r.key==='vinted:96001').hiddenAt='last week';
 const badPath=test.info().outputPath('bad-date.json');await writeFile(badPath,JSON.stringify(backup));const before=await page.evaluate(()=>localStorage.getItem('forme-v2'));
 await page.getByLabel('Restore settings from file',{exact:true}).setInputFiles(badPath);
 await expect(page.getByRole('button',{name:'Restore this backup'})).toHaveCount(0);await expect(page.getByRole('status').filter({hasText:/hidden date|nothing was changed/i}).first()).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('forme-v2'))).toBe(before);
});
