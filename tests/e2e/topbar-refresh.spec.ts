import {test,expect} from '@playwright/test';
import snapshot from '../fixtures/vinted.json';

// Fixed "last check" so elapsed time is exact: the fake clock starts N seconds after it.
const CHECK=Date.parse('2026-10-24T10:00:00.000Z');
const data={...snapshot,fetchedAt:new Date(CHECK).toISOString(),lastCollectionCheckAt:new Date(CHECK).toISOString(),items:snapshot.items.map(item=>({...item,fetchedAt:new Date(CHECK).toISOString(),observedAt:new Date(CHECK).toISOString()}))};
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('forme-onboarding-complete','1');});
 await page.route('**/api/listings',route=>route.fulfill({status:503,json:{error:'static'}}));
 await page.route('**/data/vinted.json',route=>route.fulfill({json:data}));
 await page.route('**/api/local-profile',route=>route.fulfill({status:503,json:{}}));
 await page.route('**/api/size-profile',route=>route.fulfill({json:{profile:null}}));
 await page.route('**/api/profile',route=>route.fulfill({json:{sync:'disabled'}}));
 await page.route('**/api/refresh',route=>route.fulfill({json:{dailyCap:20,remainingCredits:20,running:false,providerAvailable:true,runs:[]}}));
});
// Starts the fake clock one second after the check (so the check is never in the future), loads the page, then jumps forward and
// freezes exactly at the wanted moment. The wide head start keeps this reliable however slowly the page loads.
async function at(page:any,path:string,elapsed:number){await page.clock.install({time:CHECK+1000});await page.goto(path);await page.clock.pauseAt(CHECK+elapsed);}
const control=(page:any)=>page.locator('.topbar').getByRole('button',{name:'Find new pieces',exact:true});

test('the refresh control lives in the top bar as an icon with a ticking time, not under the page heading',async({page})=>{
 await at(page,'/discover',42_000);
 await expect(control(page)).toBeVisible();
 await expect(control(page).locator('svg')).toHaveCount(1);
 await expect(control(page)).not.toContainText('Find new pieces');
 await expect(control(page).locator('.refresh-age')).toHaveText('42s');
 await expect(page.locator('main .content').getByRole('button',{name:'Find new pieces'})).toHaveCount(0);
 await expect(page.locator('.feed-freshness')).toHaveCount(0);
 const box=await control(page).boundingBox(),bar=await page.locator('.topbar').boundingBox();
 expect(box!.y).toBeGreaterThanOrEqual(bar!.y);expect(box!.y+box!.height).toBeLessThanOrEqual(bar!.y+bar!.height+1);
});
test('the time counts up on its own, second by second, then minute by minute, then hours and days',async({page})=>{
 await at(page,'/discover',42_000);const age=control(page).locator('.refresh-age');
 await expect(age).toHaveText('42s');
 await page.clock.runFor(8_000);await expect(age).toHaveText('50s');
 await page.clock.runFor(10_000);await expect(age).toHaveText('1m');
 // Hour- and day-sized jumps use fastForward (timers due in the gap fire once). runFor would replay every timer in between, so the
 // test would slow down with each polling interval the app ever adds, and it is not what this test is about.
 await page.clock.fastForward(61*60_000);await expect(age).toHaveText('1h');
 await page.clock.fastForward(24*3600_000);await expect(age).toHaveText('1d');
});
test('it is one accessible button: named Find new pieces, described by the latest check, with the exact time as a tooltip',async({page})=>{
 await at(page,'/following',3*60_000);
 await expect(page.getByRole('button',{name:'Find new pieces',exact:true})).toHaveCount(1);
 await expect(control(page)).toHaveAccessibleDescription('Latest check 3 minutes ago');
 await expect(control(page)).toHaveAttribute('title',/^Find new pieces · Latest check \d{1,2} Oct 2026/);
 await page.clock.runFor(60_000);await expect(control(page)).toHaveAccessibleDescription('Latest check 4 minutes ago');
});
test('it is on every page, opens the same free-preview dialog in place, and never starts collection itself',async({page})=>{
 let plans=0,runs=0;
 await page.route('**/api/refresh',route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{dailyCap:20,remainingCredits:20,running:false,providerAvailable:true,runs:[]}});
  const value=route.request().postDataJSON();if(value.action==='plan'){plans++;return route.fulfill({json:{id:'q',maximumCredits:5,maximumItems:20,jobs:[{brand:'Auralee'}]}});}
  runs++;return route.fulfill({json:{status:'complete'}});
 });
 await page.clock.install({time:CHECK+30_000});
 for(const path of ['/','/discover','/following','/saved','/searches','/settings']){await page.goto(path);await expect(control(page),path).toBeVisible();}
 await page.goto('/settings');await control(page).click();
 const dialog=page.getByRole('dialog',{name:'Find new pieces',exact:true});await expect(dialog).toBeVisible();await expect(page).toHaveURL(/\/settings$/);
 await expect(dialog.getByRole('button',{name:/Find pieces · up to 5 credits/})).toBeEnabled();expect(plans).toBe(1);expect(runs).toBe(0);
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).toHaveCount(0);expect(runs).toBe(0);await expect(control(page)).toBeFocused();
});
for(const [name,size] of [['iPhone',{width:390,height:844}],['small phone',{width:360,height:740}],['very small phone',{width:340,height:700}],['narrowest phone',{width:320,height:640}],['tablet',{width:768,height:1024}],['desktop',{width:1280,height:800}]] as const)
test(`the top bar fits without overflow or wrapping on ${name}`,async({page})=>{
 // The widest realistic label (two digits plus a unit) is the hard case for a narrow bar.
 await page.setViewportSize(size);await at(page,'/',59*60_000);
 await expect(control(page).locator('.refresh-age')).toHaveText('59m');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const bar=await page.locator('.topbar').boundingBox();expect(bar!.height).toBeLessThanOrEqual(61);
 const boxes=await Promise.all([control(page),page.getByRole('button',{name:'My sizes and departments',exact:true}),page.getByRole('link',{name:/Saved items/})].map(l=>l.boundingBox()));
 for(const b of boxes){expect(b!.x).toBeGreaterThanOrEqual(0);expect(b!.x+b!.width).toBeLessThanOrEqual(size.width);}
 for(let i=1;i<boxes.length;i++)expect(boxes[i]!.x).toBeGreaterThanOrEqual(boxes[i-1]!.x+boxes[i-1]!.width-0.5);
 await expect(page.getByRole('button',{name:'My sizes and departments',exact:true})).toBeVisible();
 if(size.width<=390){const word=await page.locator('.mobile-wordmark').boundingBox();expect(boxes[0]!.x).toBeGreaterThanOrEqual(word!.x+word!.width);}
});
