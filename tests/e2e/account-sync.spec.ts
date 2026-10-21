import {test,expect,type Page} from '@playwright/test';
import {defaults} from '../../lib/catalog';
import {createBackup} from '../../lib/settings-backup';

// The sync logic runs in the browser against /api/profile, so these tests stub that endpoint and exercise the real client code.
const base={...defaults,styleRules:{},saved:[],dismissed:[]} as any;
const prefs=(brand:string)=>({...base,following:[brand]});
const backupOf=(brand:string)=>createBackup(prefs(brand),{mode:'live',collapsed:false},[]);
const me={email:'owner@example.com',role:'owner'};
const followingIn=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).following);

test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('forme-onboarding-complete','1');localStorage.setItem('forme-data-mode','demo');});
 await page.route('**/api/listings',route=>route.fulfill({status:503,json:{error:'static'}}));
 await page.route('**/api/local-profile',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
 await page.route('**/api/refresh',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
 await page.route('**/api/size-profile',route=>route.fulfill({json:{profile:null}}));
});

test('without Supabase the app behaves as before: no account panel, no uploads',async({page})=>{
 let puts=0;await page.route('**/api/profile',route=>{if(route.request().method()==='PUT')puts++;return route.fulfill({json:{sync:'disabled'}});});
 await page.goto('/settings');await expect(page.getByRole('heading',{name:'Settings'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Account'})).toHaveCount(0);expect(puts).toBe(0);
});
test('signed out locally: offers sign-in and never uploads',async({page})=>{
 let puts=0;await page.route('**/api/profile',route=>{if(route.request().method()==='PUT')puts++;return route.fulfill({json:{sync:'signed-out'}});});
 await page.goto('/settings');await expect(page.getByRole('heading',{name:'Account'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Sign in'})).toHaveAttribute('href','/login');expect(puts).toBe(0);
});
test('the first device uploads its preferences to an empty account, then shows the account and sign-out',async({page})=>{
 const puts:any[]=[];
 await page.addInitScript(value=>localStorage.setItem('forme-v2',JSON.stringify(value)),prefs('Local Brand'));
 await page.route('**/api/profile',route=>{
  if(route.request().method()==='PUT'){puts.push(route.request().postDataJSON());return route.fulfill({json:{revision:1}});}
  return route.fulfill({json:{sync:'ready',user:me,profile:null}});
 });
 await page.goto('/settings');
 await expect(page.getByText('All changes saved to your account')).toBeVisible();
 expect(puts).toHaveLength(1);expect(puts[0].expectedRevision).toBe(0);expect(puts[0].backup.settings.following).toEqual(['Local Brand']);
 await expect(page.getByText('owner@example.com')).toBeVisible();
 await expect(page.locator('form[action="/auth/signout"] button')).toHaveText('Sign out');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-sync')!))).toEqual({user:'owner@example.com',rev:1,dirty:false});
});
test('a new device adopts the account profile and keeps its own copy aside, with a notice',async({page})=>{
 await page.addInitScript(value=>localStorage.setItem('forme-v2',JSON.stringify(value)),prefs('Phone Brand'));
 await page.route('**/api/profile',route=>route.request().method()==='PUT'?route.fulfill({status:500,json:{}}):route.fulfill({json:{sync:'ready',user:me,profile:{backup:backupOf('Account Brand'),revision:5,updatedAt:'2026-10-22T10:00:00Z'}}}));
 await page.goto('/settings');
 await expect(page.getByText('Loaded the preferences saved in your account',{exact:false})).toBeVisible();
 expect(await followingIn(page)).toEqual(['Account Brand']);
 const aside=await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2-before-sync')!));expect(aside.settings.following).toEqual(['Phone Brand']);
 expect((await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-sync')!))).rev).toBe(5);
});
test('edits are saved with the revision this device last saw, and a conflict adopts the other device',async({page})=>{
 const puts:any[]=[];let conflict=false;
 await page.addInitScript(value=>{localStorage.setItem('forme-v2',JSON.stringify(value));localStorage.setItem('forme-sync',JSON.stringify({user:'owner@example.com',rev:3,dirty:false}));},prefs('Auralee'));
 await page.route('**/api/profile',route=>{
  if(route.request().method()==='PUT'){puts.push(route.request().postDataJSON());
   return conflict?route.fulfill({status:409,json:{error:'conflict',profile:{backup:backupOf('Other Device Brand'),revision:8,updatedAt:'2026-10-22T11:00:00Z'}}}):route.fulfill({json:{revision:4}});}
  return route.fulfill({json:{sync:'ready',user:me,profile:{backup:backupOf('Auralee'),revision:3,updatedAt:'2026-10-22T09:00:00Z'}}});
 });
 await page.goto('/brands');
 const brand=(name:string,state:string)=>page.getByLabel('Find a brand').fill(name).then(()=>page.getByRole('group',{name:`${name} preference`}).getByRole('button',{name:state,exact:true}).click());
 await brand('Lemaire','Follow');
 await expect.poll(()=>puts.length,{timeout:8000}).toBe(1);expect(puts[0].expectedRevision).toBe(3);
 expect((await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-sync')!))).rev).toBe(4);
 conflict=true;
 await brand('Auralee','Exclude');
 await expect.poll(()=>puts.length,{timeout:8000}).toBe(2);expect(puts[1].expectedRevision).toBe(4);
 await expect(page.getByText('Your account was updated on another device',{exact:false})).toBeVisible();
 expect(await followingIn(page)).toEqual(['Other Device Brand']);
});
test('an unreachable server keeps edits local, reports offline and recovers',async({page})=>{
 let online=false,puts=0;
 await page.addInitScript(value=>{localStorage.setItem('forme-v2',JSON.stringify(value));localStorage.setItem('forme-sync',JSON.stringify({user:'owner@example.com',rev:2,dirty:true}));},prefs('Auralee'));
 await page.route('**/api/profile',route=>{
  if(route.request().method()==='PUT'){puts++;return online?route.fulfill({json:{revision:3}}):route.abort('failed');}
  return route.fulfill({json:{sync:'ready',user:me,profile:{backup:backupOf('Auralee'),revision:2,updatedAt:'2026-10-22T09:00:00Z'}}});
 });
 await page.goto('/settings');await expect(page.getByText('Offline — changes are kept here',{exact:false})).toBeVisible();
 expect(await followingIn(page)).toEqual(['Auralee']);
 online=true;await page.getByRole('button',{name:'Try again'}).click();
 await expect(page.getByText('All changes saved to your account')).toBeVisible();expect(puts).toBeGreaterThanOrEqual(2);
 expect((await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-sync')!))).dirty).toBe(false);
});
