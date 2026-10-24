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

test.describe('Undo toast',()=>{
 const toast=(page:import('@playwright/test').Page)=>page.locator('.toast-action');
 const hide=(page:import('@playwright/test').Page)=>page.getByRole('button',{name:'Not for me: Cotton shirt',exact:true}).click();
 // Playwright's fake clock keeps flowing in real time until paused. Freezing it once the toast is up makes every runFor() below exact.
 const freeze=async(page:import('@playwright/test').Page)=>{await expect(toast(page)).toBeVisible();await page.clock.pauseAt(new Date((await page.evaluate(()=>Date.now()))+300));};  // up to ~300ms of the countdown may already have run
 test('"Not for me" shows a bottom toast with Undo, not a banner in the page',async({page})=>{
  await page.goto('/items/92001');await hide(page);
  await expect(toast(page)).toBeVisible();await expect(toast(page)).toContainText('Piece hidden from your feeds.');
  await expect(page.locator('.content .feedback-notice')).toHaveCount(0);
  const box=(await toast(page).boundingBox())!,view=page.viewportSize()!;
  expect(box.y).toBeGreaterThan(view.height/2);expect(await page.evaluate(()=>getComputedStyle(document.querySelector('.toast-stack')!).position)).toBe('fixed');
  await expect(toast(page).getByRole('button',{name:'Undo Not for me',exact:true})).toBeVisible();await expect(toast(page).getByRole('button',{name:'Dismiss feedback notice',exact:true})).toBeVisible();
 });
 test('it dismisses itself after four seconds, not longer',async({page})=>{
  await page.clock.install();await page.goto('/items/92001');await hide(page);await freeze(page);
  await page.clock.runFor(3_000);await expect(toast(page)).toBeVisible();
  await page.clock.runFor(1_500);await expect(toast(page)).toHaveCount(0);
  // the piece stays hidden, and can still be restored from the page
  await expect(page.getByRole('button',{name:'Restore Cotton shirt',exact:true})).toBeVisible();
 });
 test('a small seconds count and a hairline bar show how long is left',async({page})=>{
  await page.clock.install();await page.goto('/items/92001');await hide(page);await freeze(page);
  const count=toast(page).locator('.toast-count'),bar=toast(page).locator('.toast-bar');
  await expect(count).toHaveText('4s');await expect(bar).toHaveCount(1);
  expect(await bar.evaluate(e=>getComputedStyle(e).animationDuration)).toBe('4s');expect(await bar.evaluate(e=>getComputedStyle(e).animationName)).toBe('toast-drain');
  expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(3);
  await page.clock.runFor(1_100);await expect(count).toHaveText('3s');await page.clock.runFor(1_000);await expect(count).toHaveText('2s');await page.clock.runFor(1_000);await expect(count).toHaveText('1s');
  // the count and bar are decoration for the eye; screen readers get the message and the two buttons only
  await expect(count).toHaveAttribute('aria-hidden','true');await expect(bar).toHaveAttribute('aria-hidden','true');
  await expect(toast(page)).toHaveAccessibleName('');await expect(toast(page).getByRole('button')).toHaveCount(2);
 });
 test('the bar sits inside the toast along its bottom edge',async({page})=>{
  await page.goto('/items/92001');await hide(page);
  const [t,b]=await Promise.all([toast(page).boundingBox(),toast(page).locator('.toast-bar').boundingBox()]);
  expect(b!.x).toBeGreaterThanOrEqual(t!.x-0.5);expect(b!.x+b!.width).toBeLessThanOrEqual(t!.x+t!.width+0.5);expect(b!.y+b!.height).toBeLessThanOrEqual(t!.y+t!.height+0.5);expect(b!.y).toBeGreaterThan(t!.y+t!.height-4);
  expect(t!.height).toBeLessThanOrEqual(60);
 });
 test('hovering freezes both the countdown and the bar, and leaving resumes from where it stopped',async({page})=>{
  await page.clock.install();await page.goto('/items/92001');await hide(page);await freeze(page);
  const bar=toast(page).locator('.toast-bar'),count=toast(page).locator('.toast-count');
  await page.clock.runFor(1_000);await toast(page).hover();
  await expect(toast(page)).toHaveClass(/is-paused/);expect(await bar.evaluate(e=>getComputedStyle(e).animationPlayState)).toBe('paused');
  await page.clock.runFor(30_000);await expect(toast(page)).toBeVisible();await expect(count).toHaveText('3s');
  await page.mouse.move(5,5);await expect(toast(page)).not.toHaveClass(/is-paused/);expect(await bar.evaluate(e=>getComputedStyle(e).animationPlayState)).toBe('running');
  // about three seconds were left, so it must not restart a full four
  await page.clock.runFor(2_000);await expect(toast(page)).toBeVisible();
  await page.clock.runFor(1_500);await expect(toast(page)).toHaveCount(0);
 });
 test('keyboard focus inside it also pauses, and moving between its two buttons does not release the pause',async({page})=>{
  await page.clock.install();await page.goto('/items/92001');await hide(page);await freeze(page);
  const undo=toast(page).getByRole('button',{name:'Undo Not for me',exact:true}),close=toast(page).getByRole('button',{name:'Dismiss feedback notice',exact:true});
  await undo.focus();await expect(toast(page)).toHaveClass(/is-paused/);await page.clock.runFor(20_000);await expect(toast(page)).toBeVisible();
  await close.focus();await expect(toast(page)).toHaveClass(/is-paused/);await page.clock.runFor(20_000);await expect(toast(page)).toBeVisible();
  await page.evaluate(()=>(document.activeElement as HTMLElement).blur());await expect(toast(page)).not.toHaveClass(/is-paused/);
  await page.clock.runFor(4_500);await expect(toast(page)).toHaveCount(0);
 });
 test('with reduced motion the bar is hidden but the seconds count remains and it still dismisses',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.clock.install();await page.goto('/items/92001');await hide(page);await freeze(page);
  await expect(toast(page).locator('.toast-bar')).toBeHidden();await expect(toast(page).locator('.toast-count')).toBeVisible();
  await page.clock.runFor(4_500);await expect(toast(page)).toHaveCount(0);
 });
 test('hiding another piece while it is showing starts a fresh countdown for the new message',async({page})=>{
  await page.clock.install();await page.goto('/following');
  const buttons=page.getByRole('button',{name:/^Not for me:/});await buttons.first().click();await freeze(page);
  await page.clock.runFor(3_000);await buttons.first().click();
  await expect(toast(page).locator('.toast-count')).toHaveText('4s');await page.clock.runFor(3_000);await expect(toast(page)).toBeVisible();
  await page.clock.runFor(1_500);await expect(toast(page)).toHaveCount(0);
 });
 test('Undo before it goes restores the piece and replaces the toast with the plain confirmation',async({page})=>{
  await page.goto('/items/92001');await hide(page);
  await toast(page).getByRole('button',{name:'Undo Not for me',exact:true}).click();
  await expect(toast(page)).toHaveCount(0);await expect(page.locator('.toast',{hasText:'Piece restored'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Not for me: Cotton shirt',exact:true})).toBeVisible();
 });
 test('the close button dismisses it without changing anything',async({page})=>{
  await page.goto('/items/92001');await hide(page);await toast(page).getByRole('button',{name:'Dismiss feedback notice',exact:true}).click();
  await expect(toast(page)).toHaveCount(0);await expect(page.getByRole('button',{name:'Restore Cotton shirt',exact:true})).toBeVisible();
 });
 test('the brand version is also a self-dismissing toast, and Undo restores the previous brand state',async({page})=>{
  await page.goto('/items/92001');
  await page.getByRole('group',{name:'Our Legacy',exact:true}).getByRole('button',{name:'Exclude brand',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Not interested in Our Legacy',exact:true}).click();
  await expect(toast(page)).toContainText('Our Legacy hidden from your feeds.');
  await toast(page).getByRole('button',{name:'Undo brand exclusion',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).excluded)).toEqual([]);
 });
 test('the toast and a plain toast stack instead of overlapping',async({page})=>{
  await page.goto('/items/92001');await hide(page);await expect(toast(page)).toBeVisible();
  // Navigate inside the app (the toast lives in the persistent shell), then raise a plain toast by adding a suggested style.
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'My Styles',exact:true}).click();await expect(page).toHaveURL(/\/styles$/);
  await expect(toast(page)).toBeVisible();
  await page.getByText('Quiet Luxury',{exact:true}).locator('..').getByRole('button',{name:'Add style'}).click();
  const stack=page.locator('.toast-stack .toast');await expect(stack).toHaveCount(2);await expect(stack.nth(1)).toContainText('added to My Styles');
  const [a,b]=await Promise.all([stack.nth(0).boundingBox(),stack.nth(1).boundingBox()]);
  expect(a!.y+a!.height).toBeLessThanOrEqual(b!.y+1);expect(Math.abs(a!.x+a!.width-(b!.x+b!.width))).toBeLessThan(2);
 });
 for(const [name,size] of [['phone',{width:375,height:760}],['small phone',{width:340,height:700}]] as const)
 test(`on a ${name} it sits above the bottom navigation, fits, and keeps 44px touch targets`,async({page})=>{
  await page.setViewportSize(size);await page.goto('/items/92001');await hide(page);await expect(toast(page)).toBeVisible();
  const box=(await toast(page).boundingBox())!,nav=await page.locator('nav.mobile-nav, .mobile-nav, nav[aria-label="Mobile navigation"]').first().boundingBox().catch(()=>null);
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width);
  if(nav)expect(box.y+box.height).toBeLessThanOrEqual(nav.y+1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await toast(page).getByRole('button',{name:'Undo Not for me',exact:true}).boundingBox())!.height).toBeGreaterThanOrEqual(44);
 });
});
