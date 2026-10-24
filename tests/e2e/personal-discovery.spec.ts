import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {defaults} from '../../lib/catalog';

const now=Date.now(),old=new Date(now-2*86400000).toISOString();
const piece=(id:number,brand:string,title:string)=>({id,brand,title,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,sourceUrl:`https://www.vinted.se/items/${id}-fixture`,imageUrl:'https://images1.vinted.net/test.webp',currency:'SEK',price:100,size:'M',condition:'Good',gender:'men',genderSource:'provider',fetchedAt:old,firstSeenAt:old,newlyCollected:true,category:'',style:'',image:'',age:1,rarity:0});
const retained=piece(91000,'Independent Maker','Black linen trousers');
const pieces=[piece(91001,'Auralee','Cotton shirt'),piece(91002,'Independent Maker','Black linen trousers'),piece(91003,'Lemaire','Wool jacket')];
const initial={...defaults,following:['Our Legacy'],excluded:[],styles:[],searches:[],styleRules:{},saved:[retained.id],dismissed:[],sizing:{enabled:false,selected:[],includeOneSize:true,includeUnspecified:true}};
test.beforeEach(async({page})=>{
 await page.addInitScript(({settings,saved})=>{
  localStorage.setItem('forme-onboarding-complete','1');
  if(!localStorage.getItem('forme-v2')){localStorage.setItem('forme-v2',JSON.stringify(settings));localStorage.setItem('forme-saved-listings',JSON.stringify([saved]));}
 },{settings:initial,saved:retained});
 await page.route('**/api/size-profile',route=>route.fulfill({json:{profile:null}}));
 await page.route('**/api/local-profile',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
 await page.route('**/api/profile',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
 await page.route('**/api/refresh',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
 await page.route('**/api/listings',route=>route.fulfill({json:{fetchedAt:old,queries:['test'],items:pieces}}));
});

test('retained saves shape Discover and hidden feedback round-trips through a v1 backup',async({page})=>{
 await page.goto('/discover');
 const cards=page.locator('.grid .product');
 await expect(cards.first()).toHaveAttribute('data-testid','listing-91002');
 await expect(page.getByTestId('listing-91002')).toContainText('A brand you saved');
 await expect(page.getByTestId('listing-91002').getByText('New to FORME',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Not for me: Black linen trousers',exact:true}).click();
 await page.goto('/settings');
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Download settings backup'}).click();
 const path=await (await downloadEvent).path();const backup=JSON.parse(await readFile(path!,'utf8'));
 expect(backup.version).toBe(1);expect(backup.savedListings[0].id).toBe(retained.id);
 expect(backup.settings.tasteFeedback).toEqual([expect.objectContaining({key:'vinted:91002',brand:'Independent Maker',traits:expect.arrayContaining(['material:linen','category:trousers'])})]);
 await page.getByLabel('Restore settings from file',{exact:true}).setInputFiles(path!);
 await page.getByRole('button',{name:'Restore this backup'}).click();await page.reload();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).tasteFeedback)).toEqual(backup.settings.tasteFeedback);
 await page.goto('/discover');await expect(page.getByTestId('listing-91002')).toHaveCount(0);
 await page.goto('/settings');
 await page.getByRole('button',{name:'Restore Black linen trousers',exact:true}).click();
 await page.goto('/discover');await expect(cards.first()).toHaveAttribute('data-testid','listing-91002');
});

test('quiet freshness opens a free cost preview in place and never collects on cancel',async({page})=>{
 let plans=0,runs=0;
 await page.route('**/api/refresh',route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{dailyCap:20,remainingCredits:20,running:false,providerAvailable:true,runs:[]}});
  const value=route.request().postDataJSON();if(value.action==='plan'){plans++;expect(value.scope).toBe('discover');return route.fulfill({json:{id:'quote',maximumCredits:15,maximumItems:60,jobs:[{brand:'Auralee'},{brand:'Lemaire'},{brand:'Studio Nicholson'}]}});}
  runs++;return route.fulfill({json:{status:'complete'}});
 });
 await page.setViewportSize({width:390,height:844});await page.goto('/discover');
 const reminder=page.getByLabel('Collection freshness',{exact:true});
 await expect(reminder.locator('.refresh-age')).toHaveText(/^\d+[smhd]$/);await expect(reminder).not.toContainText('refresh is due');
 await expect(reminder.getByRole('button',{name:'Find new pieces',exact:true})).toHaveAttribute('title',/Latest check/);
 await expect(page.locator('.topbar').getByLabel('Collection freshness',{exact:true})).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Check for updates',exact:true})).toHaveCount(0);
 const trigger=reminder.getByRole('button',{name:'Find new pieces',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog',{name:'Find new pieces',exact:true});
 await expect(dialog.getByRole('button',{name:'Find pieces · up to 15 credits'})).toBeEnabled();
 await expect(dialog).toContainText('Auralee · Lemaire · Studio Nicholson');await expect(page).toHaveURL(/\/discover$/);
 expect(plans).toBe(1);expect(runs).toBe(0);
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
 expect(runs).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('background polling loads published additions without starting collection',async({page})=>{
 let reads=0,paidActions=0;
 await page.route('**/api/listings',route=>{reads++;return route.fulfill({json:{fetchedAt:old,queries:['test'],items:reads>1?[...pieces,piece(91005,'Auralee','Polled wool coat')]:pieces}});});
 await page.route('**/api/refresh',route=>{if(route.request().method()==='POST')paidActions++;return route.fulfill({status:503,json:{error:'Isolated test'}});});
 await page.clock.install();await page.goto('/discover');await expect(page.getByTestId('listing-91001')).toBeVisible();
 await page.clock.fastForward(5*60000);
 await expect(page.getByTestId('listing-91005')).toBeVisible();expect(reads).toBeGreaterThan(1);expect(paidActions).toBe(0);
});

test('Following quotes its own feed and collects only after the cost-labelled confirmation',async({page})=>{
 let runs=0;
 await page.route('**/api/refresh',route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{dailyCap:20,remainingCredits:20,running:false,providerAvailable:true,runs:[]}});
  const value=route.request().postDataJSON();
  if(value.action==='plan'){expect(value.scope).toBe('following');return route.fulfill({json:{id:'following-quote',maximumCredits:5,maximumItems:20,jobs:[{brand:'Our Legacy'}]}});}
  expect(value.action).toBe('run');expect(value.id).toBe('following-quote');runs++;return route.fulfill({json:{status:'complete',accepted:3,matchingPreferences:2}});
 });
 await page.goto('/following');await page.getByRole('button',{name:'Find new pieces',exact:true}).click();
 const dialog=page.getByRole('dialog');const confirm=dialog.getByRole('button',{name:'Find pieces · up to 5 credits',exact:true});
 await expect(confirm).toBeEnabled();expect(runs).toBe(0);await confirm.dblclick();
 await expect(dialog.getByRole('status')).toContainText('Refresh complete: 3 validated listings, 2 matches');expect(runs).toBe(1);
 await expect(confirm).toHaveCount(0);await dialog.getByRole('button',{name:'Done',exact:true}).click();
});

test('failed free quotes can be retried while expired quotes never retry a collection',async({page})=>{
 let plans=0,runs=0;
 await page.route('**/api/refresh',route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{dailyCap:20,remainingCredits:20,running:false,providerAvailable:true,runs:[]}});
  const value=route.request().postDataJSON();
  if(value.action==='plan'){plans++;return plans===1?route.fulfill({status:503,json:{error:'Cost preview unavailable.'}}):route.fulfill({json:{id:'expired',maximumCredits:5,maximumItems:20,jobs:[{brand:'Auralee'}]}});}
  runs++;return route.fulfill({status:400,json:{error:'This plan expired. Preview a new refresh.'}});
 });
 await page.goto('/discover');await page.getByRole('button',{name:'Find new pieces',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('status')).toContainText('Cost preview unavailable.');
 await expect(dialog.getByRole('button',{name:/Find pieces · up to/})).toHaveCount(0);expect(runs).toBe(0);
 await dialog.getByRole('button',{name:'Try cost preview again'}).click();
 await dialog.getByRole('button',{name:'Find pieces · up to 5 credits'}).click();
 await expect(dialog.getByRole('status')).toContainText('expired');await expect(dialog.getByRole('button',{name:/Find pieces · up to/})).toHaveCount(0);
 expect(plans).toBe(2);expect(runs).toBe(1);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});

test('a compact quote cannot exceed the remaining allowance and details stay optional',async({page})=>{
 await page.route('**/api/refresh',route=>route.fulfill({json:route.request().method()==='GET'?{dailyCap:20,remainingCredits:0,running:false,providerAvailable:true,runs:[]}:{id:'quote',maximumCredits:15,maximumItems:60,department:'Scoped search',sizeFiltering:'Local sizes',jobs:[{brand:'Auralee'}]}}));
 await page.goto('/discover');await page.getByRole('button',{name:'Find new pieces',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'Find pieces · up to 15 credits'})).toBeDisabled();
 await expect(dialog).toContainText('over today’s remaining allowance');
 await expect(dialog.getByLabel('Brand searches',{exact:true})).not.toBeVisible();
 await dialog.getByText('Search options',{exact:true}).click();await expect(dialog.getByLabel('Brand searches',{exact:true})).toBeVisible();
 await expect(dialog.getByLabel('Daily credit cap',{exact:true})).toHaveCount(0);
});
