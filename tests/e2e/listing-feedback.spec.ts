import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {defaults} from '../../lib/catalog';

const at=new Date(Date.now()-86400000).toISOString();
const piece=(id:number,brand:string,title:string)=>({id,brand,title,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,sourceUrl:`https://www.vinted.se/items/${id}-fixture`,imageUrl:'https://images1.vinted.net/fixture.webp',price:100,currency:'SEK',size:'M',condition:'Good',gender:'men',genderSource:'provider',fetchedAt:at,firstSeenAt:at,newlyCollected:true,category:'',style:'',age:1,rarity:0,image:''});
const pieces=[piece(92001,'Our Legacy','Cotton shirt'),piece(92002,'Our Legacy','Wool jacket'),piece(92003,'Auralee','Linen trousers')];
const settings={...defaults,following:['Our Legacy'],excluded:[],styles:[],saved:[92001],dismissed:[],styleRules:{},searches:[{id:1,name:'Cotton',keyword:'shirt',brand:'',size:'',max:'',alerts:true}],sizing:{enabled:false,selected:[],includeOneSize:true,includeUnspecified:true}};

test.beforeEach(async({page})=>{
 await page.addInitScript(settings=>{
  localStorage.setItem('forme-onboarding-complete','1');
  if(!localStorage.getItem('forme-v2'))localStorage.setItem('forme-v2',JSON.stringify(settings));
 },settings);
 await page.route('**/api/listings',route=>route.fulfill({json:{fetchedAt:at,queries:['fixture'],items:pieces}}));
 for(const path of ['size-profile','local-profile','profile','refresh'])await page.route(`**/api/${path}`,route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
 await page.route('https://images1.vinted.net/**',route=>route.fulfill({status:404,body:''}));
});

for(const path of ['/','/following','/searches','/searches/1','/saved'])test(`piece feedback works from ${path}, persists across feeds and preserves saves`,async({page})=>{
 let paidRequests=0;
 page.on('request',request=>{if(request.url().includes('/api/refresh')&&request.method()==='POST')paidRequests++;});
 await page.goto(path);
 const card=page.getByTestId('listing-92001');await expect(card).toBeVisible();
 await card.getByRole('button',{name:'Not for me: Cotton shirt',exact:true}).click();
 await expect(card).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).saved)).toEqual([92001]);
 await page.goto('/following');await expect(card).toHaveCount(0);await expect(page.getByTestId('listing-92002')).toBeVisible();
 await page.goto('/saved');await expect(card).toHaveCount(0);
 await page.goto('/settings');await page.getByRole('button',{name:'Restore Cotton shirt',exact:true}).click();
 await page.goto(path);await expect(card).toBeVisible();expect(paidRequests).toBe(0);
});

test('brand feedback is explicit, reversible and separate from piece dislikes',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/following');
 const card=page.getByTestId('listing-92001');
 await card.getByRole('button',{name:'Brand preferences for Our Legacy',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Hide Our Legacy?',exact:true});
 await expect(dialog).toContainText('all your feeds');await expect(dialog).toContainText('stop following');
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(card).toBeVisible();
 await expect(card.getByRole('button',{name:'Brand preferences for Our Legacy',exact:true})).toBeFocused();
 await card.getByRole('button',{name:'Brand preferences for Our Legacy',exact:true}).click();
 await dialog.getByRole('button',{name:'Not interested in Our Legacy',exact:true}).click();
 await expect(card).toHaveCount(0);await expect(page.getByTestId('listing-92002')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('forme-v2')!);return {excluded:p.excluded,following:p.following,saved:p.saved,dismissed:p.dismissed};})).toEqual({excluded:['Our Legacy'],following:[],saved:[92001],dismissed:[]});
 await page.getByRole('button',{name:'Undo brand exclusion',exact:true}).click();await expect(card).toBeVisible();
 await card.getByRole('button',{name:'Brand preferences for Our Legacy',exact:true}).click();await dialog.getByRole('button',{name:'Not interested in Our Legacy',exact:true}).click();
 await page.reload();await page.goto('/brands');await page.getByRole('button',{name:'Excluded',exact:true}).click();
 const row=page.locator('.brandrow').filter({hasText:'Our Legacy'});await expect(row).toBeVisible();await row.getByRole('button',{name:'Neutral',exact:true}).click();
 await page.goto('/saved');await expect(card).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('item details offer both feedback scopes, Undo, and compatible settings exports',async({page})=>{
 await page.goto('/items/92001');await page.getByRole('button',{name:'Not for me: Cotton shirt',exact:true}).click();
 await expect(page.getByRole('button',{name:'Restore Cotton shirt',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Undo Not for me',exact:true}).click();
 await expect(page.getByRole('button',{name:'Not for me: Cotton shirt',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Brand preferences for Our Legacy',exact:true}),'the item page has one brand control, not a second "…" route to it').toHaveCount(0);
 await page.getByRole('button',{name:'Exclude brand',exact:true}).click();await expect(page.getByRole('dialog',{name:'Hide Our Legacy?',exact:true})).toBeVisible();await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Exclude brand',exact:true})).toHaveAttribute('aria-pressed','false');
 await page.getByRole('button',{name:'Exclude brand',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Not interested in Our Legacy',exact:true}).click();
 await page.goto('/settings');const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download settings backup',exact:true}).click();
 const path=await (await downloading).path();const backup=JSON.parse(await readFile(path!,'utf8'));
 expect(backup.version).toBe(1);expect(backup.settings.excluded).toEqual(['Our Legacy']);expect(backup.settings.saved).toEqual([92001]);
});

test.describe('item page: one action row and one brand control',()=>{
 const group=(page:import('@playwright/test').Page)=>page.getByRole('group',{name:'Our Legacy',exact:true});
 test('Save and Not for me share one row; the brand control is one labelled group with short labels and no duplicate menu',async({page})=>{
  await page.goto('/items/92001');
  const row=page.locator('.detail-actions');
  await expect(row.getByRole('button',{name:/Save|Saved/})).toBeVisible();await expect(row.getByRole('button',{name:'Not for me: Cotton shirt',exact:true})).toBeVisible();
  const [save,notForMe]=await Promise.all([row.getByRole('button',{name:/Save|Saved/}).boundingBox(),row.getByRole('button',{name:'Not for me: Cotton shirt',exact:true}).boundingBox()]);
  expect(Math.abs((save!.y+save!.height/2)-(notForMe!.y+notForMe!.height/2))).toBeLessThan(8);expect(notForMe!.x).toBeGreaterThan(save!.x+save!.width);
  await expect(group(page).getByRole('button')).toHaveCount(3);
  await expect(group(page).getByRole('button',{name:'Follow brand',exact:true})).toHaveText('Follow');await expect(group(page).getByRole('button',{name:'Neutral',exact:true})).toHaveText('Neutral');await expect(group(page).getByRole('button',{name:'Exclude brand',exact:true})).toHaveText('Exclude');
  await expect(group(page).getByRole('button',{name:'Follow brand',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'Brand preferences for Our Legacy',exact:true})).toHaveCount(0);
  await expect(page.locator('.brand-pref-note')).toHaveCount(0);await expect(page.getByText('This brand is excluded and hidden from all feeds.')).toHaveCount(0);
 });
 test('an excluded brand shows one quiet line with a way back, not a notice box',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('forme-v2',JSON.stringify({...JSON.parse(localStorage.getItem('forme-v2')!),following:[],excluded:['Our Legacy']})));
  await page.goto('/items/92001');
  await expect(group(page).getByRole('button',{name:'Exclude brand',exact:true})).toHaveAttribute('aria-pressed','true');
  const note=page.locator('.brand-pref-note');await expect(note).toContainText('Hidden from every feed.');await expect(note.getByRole('link',{name:'Your brands',exact:true})).toHaveAttribute('href','/brands');
  await expect(page.locator('.detail .notice',{hasText:'excluded'})).toHaveCount(0);
 });
 test('a hidden piece says so beside Restore, and restoring brings the normal action back',async({page})=>{
  await page.goto('/items/92001');await page.getByRole('button',{name:'Not for me: Cotton shirt',exact:true}).click();
  const row=page.locator('.detail-actions');
  await expect(row.getByRole('status')).toHaveText('Hidden from your feeds');await expect(row.getByRole('button',{name:'Restore Cotton shirt',exact:true})).toBeVisible();
  await expect(page.getByText('You marked this piece Not for me')).toHaveCount(0);
  await row.getByRole('button',{name:'Restore Cotton shirt',exact:true}).click();
  await expect(row.getByRole('status')).toHaveCount(0);await expect(row.getByRole('button',{name:'Not for me: Cotton shirt',exact:true})).toBeVisible();
 });
 test('follow and neutral change immediately; Exclude asks first and Escape changes nothing',async({page})=>{
  await page.goto('/items/92001');
  await group(page).getByRole('button',{name:'Neutral',exact:true}).click();await expect(group(page).getByRole('button',{name:'Neutral',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).following)).toEqual([]);
  await group(page).getByRole('button',{name:'Exclude brand',exact:true}).click();await expect(page.getByRole('dialog',{name:'Hide Our Legacy?',exact:true})).toBeVisible();await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).excluded)).toEqual([]);await expect(group(page).getByRole('button',{name:'Neutral',exact:true})).toHaveAttribute('aria-pressed','true');
 });
 for(const [name,size] of [['phone',{width:375,height:760}],['small phone',{width:340,height:700}],['desktop',{width:1280,height:800}]] as const)
 test(`the controls fit without overflow on ${name}, with comfortable touch targets`,async({page})=>{
  await page.setViewportSize(size);await page.goto('/items/92001');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const button of await group(page).getByRole('button').all()){const box=(await button.boundingBox())!;expect(box.height).toBeGreaterThanOrEqual(38);expect(box.x+box.width).toBeLessThanOrEqual(size.width);expect(box.x).toBeGreaterThanOrEqual(0);}
  const notForMe=(await page.locator('.detail-actions').getByRole('button',{name:'Not for me: Cotton shirt',exact:true}).boundingBox())!;expect(notForMe.height).toBeGreaterThanOrEqual(38);
 });
});
