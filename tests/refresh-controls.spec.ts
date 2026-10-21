import {test,expect} from '@playwright/test';
import {defaults} from '../lib/catalog';
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
 await page.goto('/tools');await page.getByRole('button',{name:'Preview refresh · free'}).click();expect(runs).toBe(0);
 await expect(page.getByRole('button',{name:'Run refresh · up to 15 credits'})).toBeDisabled();
 await page.getByLabel('Daily credit cap',{exact:true}).fill('30');await page.getByRole('button',{name:'Save daily cap',exact:true}).click();expect(runs).toBe(0);
 await page.getByRole('button',{name:'Run refresh · up to 15 credits'}).click();await expect(page.getByText('Refresh complete:',{exact:false})).toBeVisible();expect(runs).toBe(1);
});
test('changing preferences discards the preview and feedback can restore a hidden recommendation',async({page})=>{
 await page.route('**/api/refresh',route=>route.fulfill({json:route.request().method()==='GET'?initial:{id:'quote',maximumCredits:5,maximumItems:20,exactBrandJobs:1,department:'Men’s catalog',sizeFiltering:'Local sizes.',translation:'Cached translations.',coverage:'Clothing only.',jobs:[{brand:'Auralee',brandId:'2053426'}]}}));
 await page.goto('/tools');await page.getByRole('button',{name:'Preview refresh · free'}).click();await expect(page.getByRole('button',{name:'Run refresh · up to 5 credits'})).toBeVisible();
 await page.goto('/settings');await page.getByRole('button',{name:'My sizes and departments',exact:true}).click();await page.getByRole('checkbox',{name:'Women',exact:true}).uncheck();await page.getByRole('button',{name:'Apply filters',exact:true}).click();await page.goto('/tools');await expect(page.getByRole('button',{name:'Run refresh · up to 5 credits'})).toHaveCount(0);
 await page.getByText('Review hidden pieces (1)',{exact:true}).click();await page.getByRole('button',{name:'Restore Wool jacket',exact:true}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).dismissed)).toEqual([]);
 await page.goto('/discover');await expect(page.getByTestId('listing-50002')).toBeVisible();
});
test('refresh controls fit a mobile viewport',async({page})=>{
 await page.route('**/api/refresh',route=>route.fulfill({json:initial}));await page.setViewportSize({width:390,height:844});await page.goto('/tools');await expect(page.getByRole('heading',{name:'Refresh listings'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
