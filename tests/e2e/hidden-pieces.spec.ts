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
 for(const path of ['size-profile','local-profile','profile','refresh'])await page.route(`**/api/${path}`,route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
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
 expect(await rows(page).locator('strong').allInnerTexts()).toEqual(['Lemaire','Comme des Garçons','Studio Nicholson','Vinted listing 96003']);
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
 await page.evaluate(([keys,notes])=>{const s=JSON.parse(localStorage.getItem('forme-v2')!);s.dismissed=[...s.dismissed,...keys];s.tasteFeedback=[...s.tasteFeedback,...notes];localStorage.setItem('forme-v2',JSON.stringify(s));},[many,extra] as const);
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
 await page.goto('/settings');
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('forme-v2')!);const keys=Array.from({length:6},(_,i)=>`vinted:98${i}00`);s.dismissed=[...s.dismissed,...keys];s.tasteFeedback=[...s.tasteFeedback,...keys.map(key=>({key,brand:'Lemaire',traits:[],style:'',title:'Denim shirt'}))];localStorage.setItem('forme-v2',JSON.stringify(s));});
 await page.reload();const search=page.getByRole('searchbox',{name:'Search hidden pieces'});await search.fill('denim');await expect(rows(page)).toHaveCount(6);
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
