import {test,expect} from '@playwright/test';
import {defaults} from '../../lib/catalog';
const base={source:'vinted',currency:'SEK',condition:'Good',fetchedAt:'2026-10-21T10:00:00Z',imageUrl:'https://images1.vinted.net/test.webp',size:'M',category:'',style:'',age:1,rarity:0,image:'',price:100};
const snapshot={fetchedAt:base.fetchedAt,queries:['test'],items:[{...base,id:50001,sourceKey:'vinted:50001',brand:'Auralee',title:'Cotton shirt'},{...base,id:50002,sourceKey:'vinted:50002',brand:'Lemaire',title:'Wool jacket'}]};
const settings={...defaults,following:['Our Legacy'],excluded:[],saved:[50001],dismissed:['vinted:50002'],styleRules:{}};
const initial={day:'2026-10-21',dailyCap:15,reservedCredits:15,reportedCredits:15,remainingCredits:0,providerAvailable:true,running:false,runs:[]};
snapshot.items=snapshot.items.map(item=>({...item,sourceId:String(item.id),sourceUrl:`https://www.vinted.se/items/${item.id}-fixture`}));
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('forme-onboarding-complete','1'));});
test.beforeEach(async({page})=>{
 await page.addInitScript(value=>{if(!localStorage.getItem('forme-v2'))localStorage.setItem('forme-v2',JSON.stringify(value));},settings);
 await page.route('**/api/listings',route=>route.fulfill({json:snapshot}));await page.route('**/api/size-profile',route=>route.fulfill({json:{profile:null}}));await page.route('**/api/local-profile',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
});
test('preview spends nothing, cap gates the run and only an explicit run refreshes data',async({page})=>{
 let status={...initial},runs=0;
 await page.route('**/api/refresh',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:status});const value=route.request().postDataJSON();
  if(value.action==='plan')return route.fulfill({json:{id:'quote',maximumCredits:15,maximumItems:60,exactBrandJobs:3,department:'Men’s catalog',sizeFiltering:'Size labels checked after fetching.',translation:'Cached translations only.',coverage:'Homeware is unaffected.',expiresAt:new Date(Date.now()+600000).toISOString(),jobs:[{brand:'Auralee',brandId:'2053426'},{brand:'Lemaire',brandId:'295938'},{brand:'Studio Nicholson',brandId:'663899'}]}});
  if(value.action==='budget'){expect(value.dailyCap).toBe(30);status={...status,dailyCap:30,remainingCredits:15};return route.fulfill({json:status});}
  expect(value.action).toBe('run');expect(value.id).toBe('quote');runs++;return route.fulfill({json:{status:'complete',accepted:1,eligible:1,pendingTranslations:0}});
 });
 await page.goto('/tools');await page.getByRole('button',{name:'See refresh cost'}).click();expect(runs).toBe(0);
 await expect(page.getByRole('button',{name:'Find pieces · up to 15 credits'})).toBeDisabled();
 await page.getByText('Budget and history',{exact:true}).click();await page.getByLabel('Daily credit cap',{exact:true}).fill('30');await page.getByRole('button',{name:'Save daily cap',exact:true}).click();expect(runs).toBe(0);
 await page.getByRole('button',{name:'Find pieces · up to 15 credits'}).click();await expect(page.getByText('Refresh complete:',{exact:false})).toBeVisible();expect(runs).toBe(1);
});
test('daily limit can be turned off and larger quotes still need explicit collection confirmation',async({page})=>{
 let status:{dailyCap:number;remainingCredits:number|null}=initial,runs=0,plans=0;
 await page.route('**/api/refresh',route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{...initial,...status}});
  const value=route.request().postDataJSON();
  if(value.action==='budget'){expect(value.dailyCap).toBe(0);status={dailyCap:0,remainingCredits:null};return route.fulfill({json:{...initial,...status}});}
  if(value.action==='plan'){plans++;return route.fulfill({json:{id:'large-quote',maximumCredits:value.limit*5,maximumItems:value.limit*20,exactBrandJobs:0,jobs:Array.from({length:value.limit},(_,index)=>({brand:`Fixture brand ${index+1}`}))}});}
  expect(value.action).toBe('run');expect(value.id).toBe('large-quote');runs++;return route.fulfill({json:{status:'complete',accepted:0,eligible:0}});
 });
 await page.setViewportSize({width:390,height:844});await page.goto('/tools');
 await page.getByText('Budget and history',{exact:true}).click();
 await page.getByRole('checkbox',{name:'Limit daily spending',exact:true}).uncheck();
 await expect(page.getByLabel('Daily credit cap',{exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Save daily cap',exact:true}).click();
 expect(plans).toBe(0);expect(runs).toBe(0);
 await expect(page.locator('.refresh-allowance')).toHaveText('Daily limit off');
 await page.getByLabel('Brand searches',{exact:true}).selectOption('120');
 await page.getByRole('button',{name:'See refresh cost',exact:true}).click();
 await expect(page.getByRole('button',{name:'Find pieces · up to 600 credits',exact:true})).toBeEnabled();
 expect(plans).toBe(1);expect(runs).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Find pieces · up to 600 credits',exact:true}).click();expect(runs).toBe(1);
});
test('changing preferences discards the preview and feedback can restore a hidden recommendation',async({page})=>{
 await page.route('**/api/refresh',route=>route.fulfill({json:route.request().method()==='GET'?initial:{id:'quote',maximumCredits:5,maximumItems:20,exactBrandJobs:1,department:'Men’s catalog',sizeFiltering:'Local sizes.',translation:'Cached translations.',coverage:'Clothing only.',jobs:[{brand:'Auralee',brandId:'2053426'}]}}));
 await page.goto('/tools');await page.getByRole('button',{name:'See refresh cost'}).click();await expect(page.getByRole('button',{name:'Find pieces · up to 5 credits'})).toBeVisible();
 await page.goto('/settings');await page.getByRole('button',{name:'My sizes and departments',exact:true}).click();await page.getByRole('checkbox',{name:'Women',exact:true}).uncheck();await page.getByRole('button',{name:'Apply filters',exact:true}).click();await page.goto('/tools');await expect(page.getByRole('button',{name:'Find pieces · up to 5 credits'})).toHaveCount(0);
 await page.locator('#feedback > summary').click();await page.getByText('Review hidden pieces (1)',{exact:true}).click();await page.getByRole('button',{name:'Restore Wool jacket',exact:true}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).dismissed)).toEqual([]);
 await page.goto('/discover');await expect(page.getByTestId('listing-50002')).toBeVisible();
});
test('refresh controls fit a mobile viewport',async({page})=>{
 await page.route('**/api/refresh',route=>route.fulfill({json:initial}));await page.setViewportSize({width:390,height:844});await page.goto('/tools');await expect(page.getByRole('heading',{name:'Refresh listings'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('a queued refresh runs in the background, the page follows progress and a failed run explains itself',async({page})=>{
 let phase:'idle'|'running'|'complete'|'interrupted'='idle';
 const runs=()=>phase==='idle'?[]:[{id:'quote',status:phase,reserved:5,reported:phase==='running'?0:5,created_at:new Date().toISOString(),result:phase==='complete'?{accepted:2,eligible:1,pendingTranslations:0}:phase==='interrupted'?{error:'The collection worker stopped before finishing. Credits stay reserved.'}:null}];
 await page.route('**/api/refresh',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{...initial,dailyCap:30,remainingCredits:25,running:phase==='running',runs:runs()}});
  const value=route.request().postDataJSON();
  if(value.action==='plan')return route.fulfill({json:{id:'quote',maximumCredits:5,maximumItems:20,exactBrandJobs:1,department:'Men’s catalog',sizeFiltering:'Local sizes.',translation:'Cached translations.',coverage:'Clothing only.',expiresAt:new Date(Date.now()+600000).toISOString(),jobs:[{brand:'Auralee',brandId:'2053426'}]}});
  phase='running';return route.fulfill({status:202,json:{id:'quote',status:'queued'}});
 });
 await page.goto('/tools');await page.getByRole('button',{name:'See refresh cost'}).click();await page.getByRole('button',{name:'Find pieces · up to 5 credits'}).click();
 await expect(page.getByText('Refresh started in the background',{exact:false})).toBeVisible();
 phase='complete';await expect(page.getByText('Refresh complete: 2 validated listings',{exact:false})).toBeVisible({timeout:10000});
});
test('an interrupted background refresh is reported with its reason',async({page})=>{
 let started=false;
 await page.route('**/api/refresh',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{...initial,dailyCap:30,remainingCredits:25,running:false,runs:started?[{id:'quote',status:'interrupted',reserved:5,reported:0,created_at:new Date().toISOString(),result:{error:'The collection worker stopped before finishing. Credits stay reserved.'}}]:[]}});
  const value=route.request().postDataJSON();
  if(value.action==='plan')return route.fulfill({json:{id:'quote',maximumCredits:5,maximumItems:20,exactBrandJobs:1,department:'Men’s catalog',sizeFiltering:'Local sizes.',translation:'Cached translations.',coverage:'Clothing only.',expiresAt:new Date(Date.now()+600000).toISOString(),jobs:[{brand:'Auralee',brandId:'2053426'}]}});
  started=true;return route.fulfill({status:202,json:{id:'quote',status:'queued'}});
 });
 await page.goto('/tools');await page.getByRole('button',{name:'See refresh cost'}).click();await page.getByRole('button',{name:'Find pieces · up to 5 credits'}).click();
 await expect(page.getByText('The collection worker stopped before finishing',{exact:false}).first()).toBeVisible({timeout:10000});
});
test('saved-item availability checks preview their cost and report what was found',async({page})=>{
 let planned:any=null,ran=false;
 await page.route('**/api/refresh',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{...initial,dailyCap:30,remainingCredits:30,running:false,runs:[]}});
  const value=route.request().postDataJSON();
  if(value.action==='plan'){planned=value;return route.fulfill({json:{id:'quote',kind:'availability',maximumCredits:20,maximumItems:2,exactBrandJobs:0,department:'Saved items only',sizeFiltering:'Each saved listing is checked individually; no search is run.',translation:'No translation is involved.',coverage:'2 of 2 saved Vinted listings are due for a check. Each check costs up to 10 credits.',expiresAt:new Date(Date.now()+600000).toISOString(),jobs:[{brand:'Auralee · Cotton shirt',brandId:null},{brand:'Lemaire · Wool jacket',brandId:null}]}});}
  ran=true;return route.fulfill({json:{status:'complete',checked:2,sold:1,unavailable:0,reserved:0,available:1}});
 });
 await page.goto('/tools');await page.getByLabel('Refresh feed',{exact:true}).selectOption('availability');
 await expect(page.getByText('Saved items to check',{exact:true})).toBeVisible();await expect(page.getByLabel('Saved items to check').locator('option').first()).toContainText('up to 10 credits');
 await page.getByLabel('Saved items to check').selectOption('2');await page.getByRole('button',{name:'See refresh cost'}).click();
 expect(planned.scope).toBe('availability');expect(planned.limit).toBe(2);expect(ran).toBe(false);
 await expect(page.getByText('Auralee · Cotton shirt',{exact:false})).toBeVisible();await page.getByText('Plan details',{exact:true}).click();await expect(page.getByText('Saved items only',{exact:false}).first()).toBeVisible();
 await page.getByRole('button',{name:'Find pieces · up to 20 credits'}).click();
 await expect(page.getByText('Availability checked for 2 saved items: 1 sold',{exact:false})).toBeVisible();expect(ran).toBe(true);
});
