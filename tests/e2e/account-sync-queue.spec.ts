import {test,expect,type Page} from '@playwright/test';
import {defaults} from '../../lib/catalog';
import {createBackup} from '../../lib/settings-backup';

// An edit made while an earlier save is still in flight must be sent next, in order, and the indicator must not say
// "saved" while anything is still waiting. The profile API is stubbed so each save can be held open.
const base={...defaults,styleRules:{},saved:[],dismissed:[]} as any;
const prefs=(...following:string[])=>({...base,following});
const backupOf=(...following:string[])=>createBackup(prefs(...following),{mode:'live',collapsed:false},[]);
const me={email:'owner@example.com',role:'owner'};
const gate=()=>{let open!:()=>void;const promise=new Promise<void>(resolve=>{open=resolve;});return {promise,open};};
type Put={expectedRevision:number;following:string[]};

async function setup(page:Page,{holds=[] as ReturnType<typeof gate>[],failFirst=false}={}){
 const puts:Put[]=[];let revision=3;
 await page.addInitScript(value=>{localStorage.setItem('forme-onboarding-complete','1');localStorage.setItem('forme-data-mode','demo');localStorage.setItem('forme-v2',JSON.stringify(value));localStorage.setItem('forme-sync',JSON.stringify({user:'owner@example.com',rev:3,dirty:false}));},prefs('Auralee'));
 for(const path of ['listings','local-profile','refresh'])await page.route(`**/api/${path}`,route=>route.fulfill({status:503,json:{error:'static'}}));
 await page.route('**/api/size-profile',route=>route.fulfill({json:{profile:null}}));
 await page.route('**/api/profile',async route=>{
  if(route.request().method()!=='PUT')return route.fulfill({json:{sync:'ready',user:me,profile:{backup:backupOf('Auralee'),revision,updatedAt:'2026-10-24T10:00:00Z'}}});
  const body=route.request().postDataJSON();const index=puts.length;puts.push({expectedRevision:body.expectedRevision,following:body.backup.settings.following});
  if(holds[index])await holds[index].promise;
  if(failFirst&&index===0)return route.abort('failed');
  revision=body.expectedRevision+1;return route.fulfill({json:{revision}});
 });
 return puts;
}
const follow=async(page:Page,brand:string)=>{await page.getByLabel('Find a brand').fill(brand);await page.getByRole('group',{name:`${brand} preference`}).getByRole('button',{name:'Follow',exact:true}).click();};
const marker=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('forme-sync')!));
const goSettings=async(page:Page)=>{await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Settings',exact:true}).click();await expect(page).toHaveURL(/\/settings$/);};

test('an edit made during a save is queued and sent next, in order, with the revision the first save returned',async({page})=>{
 const first=gate(),second=gate();const puts=await setup(page,{holds:[first,second]});
 await page.goto('/brands');
 await follow(page,'Lemaire');await expect.poll(()=>puts.length,{timeout:6000}).toBe(1);           // save #1 is now in flight
 await follow(page,'Margaret Howell');await page.waitForTimeout(1500);                              // longer than the debounce: the old code dropped this attempt
 expect(puts).toHaveLength(1);
 first.open();
 await expect.poll(()=>puts.length,{timeout:6000}).toBe(2);
 expect(puts[0]).toEqual({expectedRevision:3,following:expect.arrayContaining(['Auralee','Lemaire'])});expect(puts[0].following).not.toContain('Margaret Howell');
 expect(puts[1].expectedRevision).toBe(4);expect(puts[1].following).toEqual(expect.arrayContaining(['Auralee','Lemaire','Margaret Howell']));
 second.open();
 await expect.poll(async()=>(await marker(page)).rev,{timeout:6000}).toBe(5);
 expect(await marker(page)).toEqual({user:'owner@example.com',rev:5,dirty:false});expect(puts).toHaveLength(2);
});
test('the indicator says Saving until every queued edit is stored, and only then says saved',async({page})=>{
 const first=gate(),second=gate();const puts=await setup(page,{holds:[first,second]});
 await page.goto('/brands');
 await follow(page,'Lemaire');await expect.poll(()=>puts.length,{timeout:6000}).toBe(1);await follow(page,'Margaret Howell');
 first.open();await expect.poll(()=>puts.length,{timeout:6000}).toBe(2);                            // #1 done, #2 held open
 await goSettings(page);
 await expect(page.getByText('Saving…',{exact:true})).toBeVisible();await expect(page.getByText('All changes saved to your account')).toHaveCount(0);
 expect((await marker(page)).dirty).toBe(true);
 second.open();
 await expect(page.getByText('All changes saved to your account')).toBeVisible();expect((await marker(page)).dirty).toBe(false);
});
test('several quick edits during one save are sent together in a single follow-up, not one save each',async({page})=>{
 const first=gate();const puts=await setup(page,{holds:[first]});
 await page.goto('/brands');
 await follow(page,'Lemaire');await expect.poll(()=>puts.length,{timeout:6000}).toBe(1);
 await follow(page,'Margaret Howell');await follow(page,'Studio Nicholson');await follow(page,'Auralee');
 first.open();await expect.poll(()=>puts.length,{timeout:6000}).toBe(2);
 await expect.poll(async()=>(await marker(page)).dirty,{timeout:6000}).toBe(false);await page.waitForTimeout(1500);
 expect(puts).toHaveLength(2);expect(puts[1].following).toEqual(expect.arrayContaining(['Lemaire','Margaret Howell','Studio Nicholson','Auralee']));
});
test('an edit made after a save has finished is saved normally',async({page})=>{
 const puts=await setup(page);await page.goto('/brands');
 await follow(page,'Lemaire');await expect.poll(async()=>(await marker(page)).rev,{timeout:6000}).toBe(4);
 await follow(page,'Margaret Howell');await expect.poll(async()=>(await marker(page)).rev,{timeout:6000}).toBe(5);
 expect(puts.map(p=>p.expectedRevision)).toEqual([3,4]);expect((await marker(page)).dirty).toBe(false);
});
test('a failed save keeps every edit, reports offline, and the retry sends them all',async({page})=>{
 const puts=await setup(page,{failFirst:true});await page.goto('/brands');
 await follow(page,'Lemaire');await expect.poll(()=>puts.length,{timeout:6000}).toBe(1);
 await follow(page,'Margaret Howell');
 await goSettings(page);await expect(page.getByText('Offline — changes are kept here',{exact:false})).toBeVisible();
 expect((await marker(page)).dirty).toBe(true);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).following)).toEqual(expect.arrayContaining(['Lemaire','Margaret Howell']));
 await page.getByRole('button',{name:'Try again'}).click();
 await expect(page.getByText('All changes saved to your account')).toBeVisible();
 expect(puts.at(-1)!.following).toEqual(expect.arrayContaining(['Auralee','Lemaire','Margaret Howell']));expect((await marker(page)).dirty).toBe(false);
});
