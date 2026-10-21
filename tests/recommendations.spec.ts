import {test,expect} from '@playwright/test';
import {defaults} from '../lib/catalog';
const settings={...defaults,following:['Our Legacy'],excluded:[],saved:[],searches:[],styleRules:{},dismissed:[],sizing:{enabled:false,selected:[],includeOneSize:true,includeUnspecified:true}};
const base={source:'vinted',currency:'SEK',condition:'Good',fetchedAt:'2026-10-21T08:00:00Z',imageUrl:'https://images1.vinted.net/test.jpeg',size:'M',category:'',style:'',age:0,rarity:0,image:'',price:100};
const snapshot={fetchedAt:base.fetchedAt,queries:['test'],items:[{...base,id:10001,sourceKey:'vinted:10001',brand:'Our Legacy',title:'Cotton shirt'},{...base,id:10002,sourceKey:'vinted:10002',brand:'Auralee',title:'Wool jacket'}]};
snapshot.items=snapshot.items.map(item=>({...item,sourceId:String(item.id),sourceUrl:`https://www.vinted.se/items/${item.id}-fixture`}));
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('forme-onboarding-complete','1'));});
test.beforeEach(async({page})=>{
 await page.addInitScript(settings=>{if(!localStorage.getItem('forme-v2'))localStorage.setItem('forme-v2',JSON.stringify(settings));},settings);
 await page.route('**/api/refresh',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));await page.route('**/api/size-profile',route=>route.fulfill({json:{profile:null}}));
 await page.route('**/api/listings',route=>route.fulfill({json:snapshot}));
 await page.route('**/api/local-profile',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
});
test('Discover differs from Following, explains a recommendation, and persists dismissal with undo',async({page})=>{
 await page.goto('/following');await expect(page.getByTestId('listing-10001')).toBeVisible();await expect(page.getByTestId('listing-10002')).toHaveCount(0);
 await page.goto('/discover');await expect(page.getByTestId('listing-10001')).toHaveCount(0);await expect(page.getByTestId('listing-10002')).toBeVisible();
 await expect(page.getByTestId('listing-10002')).toContainText('Because you follow Our Legacy');
 await page.getByRole('button',{name:'Not interested in Wool jacket'}).click();await expect(page.getByTestId('listing-10002')).toHaveCount(0);
 await page.reload();await expect(page.getByTestId('listing-10002')).toHaveCount(0);
 // Dismiss again after undo to verify immediate undo independently from reload.
 await page.evaluate(()=>{const prefs=JSON.parse(localStorage.getItem('forme-v2')!);prefs.dismissed=[];localStorage.setItem('forme-v2',JSON.stringify(prefs));});await page.reload();
 await page.getByRole('button',{name:'Not interested in Wool jacket'}).click();await page.getByRole('button',{name:'Undo last Not interested'}).click();await expect(page.getByTestId('listing-10002')).toBeVisible();
});
test('local profile save checks revisions and previews restore without changing the browser',async({page})=>{
 const local={app:'forme',version:1,exportedAt:new Date().toISOString(),settings:{...settings,following:['Margaret Howell']},display:{mode:'live',collapsed:false},savedListings:[]};
 let revision=1;
 await page.route('**/api/local-profile',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{revision,profile:local}});
  const payload=route.request().postDataJSON();expect(payload.baseRevision).toBe(revision);expect(payload.profile.settings.following).toEqual(['Our Legacy']);revision++;return route.fulfill({json:{revision}});
 });
 await page.goto('/tools');await page.getByRole('button',{name:'Check local copy'}).click();await expect(page.getByRole('button',{name:'Restore local copy'})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).following)).toEqual(['Our Legacy']);
 await page.getByRole('button',{name:'Save current settings locally'}).click();await expect(page.getByText('Settings saved on this computer.',{exact:false})).toBeVisible();
});
test('same numeric size can be selected separately for clothing and shoes',async({page})=>{
 await page.goto('/settings');await page.getByRole('button',{name:'My sizes and departments'}).click();const dialog=page.getByRole('dialog');
 await dialog.getByText('Clothing · EU labels',{exact:true}).click();await dialog.locator('details').filter({has:page.getByText('Clothing · EU labels',{exact:true})}).getByRole('button',{name:'EU 48',exact:true}).click();
 await dialog.getByText('Shoes · EU labels',{exact:true}).click();await dialog.locator('details').filter({has:page.getByText('Shoes · EU labels',{exact:true})}).getByRole('button',{name:'EU 48',exact:true}).click();
 await dialog.getByRole('button',{name:'Apply filters'}).click();
 const groups=await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).sizing.groups);expect(groups.clothing).toContain('EU 48');expect(groups.shoes).toContain('EU 48');
});
