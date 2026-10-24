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
 await page.getByRole('button',{name:'Brand preferences for Our Legacy',exact:true}).click();await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Exclude brand',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Not interested in Our Legacy',exact:true}).click();
 await page.goto('/settings');const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download settings backup',exact:true}).click();
 const path=await (await downloading).path();const backup=JSON.parse(await readFile(path!,'utf8'));
 expect(backup.version).toBe(1);expect(backup.settings.excluded).toEqual(['Our Legacy']);expect(backup.settings.saved).toEqual([92001]);
});
