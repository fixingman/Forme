import {test,expect} from '@playwright/test';
import snapshot from '../fixtures/vinted.json';

test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('forme-onboarding-complete','1'));});
test.beforeEach(async({page})=>{await page.route('**/api/listings',route=>route.fulfill({status:503,json:{error:'Fixture uses static snapshot'}}));await page.route('**/api/local-profile',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));await page.route('**/api/refresh',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));await page.route('**/api/size-profile',route=>route.fulfill({json:{profile:null}}));});
const first=snapshot.items[0];
test.beforeEach(async({page})=>{await page.route('**/data/vinted.json',route=>route.fulfill({json:snapshot}));});

test('live snapshot renders real metadata, outbound link and persistent saves',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/following');
 await expect(page.getByLabel('Listing data')).toHaveCount(0);
 const card=page.getByTestId(`listing-${first.id}`);
 await expect(card).toBeVisible();
 await expect(card.locator('img')).toHaveAttribute('src',first.imageUrl);
 await expect(card.getByText(first.condition,{exact:false})).toBeVisible();
 await expect(card.locator('.price')).toContainText('kr');
 await expect(card.getByText('New today')).toHaveCount(0);
 await card.getByRole('button',{name:`Save ${first.brand} ${first.title}`,exact:true}).click();
 await page.goto('/saved');await expect(page.getByTestId(`listing-${first.id}`)).toBeVisible();
 await page.reload();await expect(page.getByTestId(`listing-${first.id}`)).toBeVisible();
 await page.getByTestId(`listing-${first.id}`).getByRole('link',{name:`View ${first.brand} ${first.title}`,exact:true}).click();
 await expect(page.getByRole('link',{name:'View on Vinted'})).toHaveAttribute('href',first.sourceUrl);
 await expect(page.getByText('Illustrative rarity',{exact:false})).toHaveCount(0);
 await page.goBack();await expect(page.getByRole('heading',{name:'Saved Items',exact:true})).toBeVisible();
 // A saved listing remains readable when a later snapshot no longer includes it.
 await page.route('**/data/vinted.json',route=>route.fulfill({json:{...snapshot,items:[]}}));
 await page.reload();await expect(page.getByTestId(`listing-${first.id}`)).toBeVisible();
 expect(errors).toEqual([]);
});

test('failed snapshot remains explicit and demo can be selected',async({page})=>{
 await page.route('**/data/vinted.json',route=>route.fulfill({status:503,body:'Unavailable'}));
 await page.goto('/following');await expect(page.getByText('Live listings could not be loaded.',{exact:false})).toBeVisible();
 await expect(page.locator('[data-testid^="listing-"]')).toHaveCount(0);
 await page.goto('/tools');await page.getByLabel('Listing data').selectOption('demo');await page.goto('/following');
 await expect(page.getByTestId('listing-6')).toBeVisible();
 await page.reload();await expect(page.getByText('Demo · illustrative listings',{exact:false})).toBeVisible();
});

test('live brand exclusions and mobile width remain consistent',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/brands');await page.getByLabel('Find a brand').fill('Our Legacy');
 await page.getByRole('group',{name:'Our Legacy preference'}).getByRole('button',{name:'Exclude',exact:true}).click();
 await page.goto('/following');await expect(page.locator('.data-status')).toHaveCount(0);
 await expect(page.getByTestId(`listing-${first.id}`)).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('English titles and conditions expose original listing text',async({page})=>{
 await page.goto('/items/10447404161');
 await expect(page.getByRole('heading',{name:'Acne leather jacket',exact:true})).toBeVisible();
 await expect(page.locator('.detail .facts')).toContainText('Size');await expect(page.locator('.detail .facts')).toContainText('Good');
 await page.getByText('Translated · show original',{exact:true}).click();
 await expect(page.locator('.original-listing').getByText('Acne skinnjacka',{exact:true})).toBeVisible();
 await expect(page.locator('.original-listing')).toContainText('Condition: Bra');
});

test('larger feeds reveal additional listings without rendering the entire batch initially',async({page})=>{
 await page.addInitScript(brands=>localStorage.setItem('forme-v2',JSON.stringify({following:brands})),[...new Set(snapshot.items.map(item=>item.brand))]);
 await page.goto('/following');
 await expect(page.locator('.product')).toHaveCount(24);
 await expect(page.getByRole('button',{name:/Show more/})).toHaveCount(0);
 await page.getByTestId('feed-load-more').scrollIntoViewIfNeeded();
 await expect(page.locator('.product')).toHaveCount(29);
 await expect(page.getByRole('button',{name:'Show more',exact:false})).toHaveCount(0);
});

for(const width of [1280,390])test(`scrolling loads successive batches through the end at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 const pieces=Array.from({length:93},(_,index)=>({...first,id:94000+index,sourceId:String(94000+index),sourceKey:`vinted:${94000+index}`,sourceUrl:`https://www.vinted.se/items/${94000+index}-fixture`}));
 await page.addInitScript(brand=>localStorage.setItem('forme-v2',JSON.stringify({following:[brand]})),first.brand);
 await page.route('**/data/vinted.json',route=>route.fulfill({json:{...snapshot,items:pieces}}));
 const posts:string[]=[];page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
 await page.goto('/following');await expect(page.locator('.product')).toHaveCount(24);
 for(const count of [48,72,93]){
  await page.getByTestId('feed-load-more').scrollIntoViewIfNeeded();
  await expect(page.locator('.product')).toHaveCount(count);
 }
 await expect(page.getByTestId('feed-load-more')).toHaveCount(0);
 const ids=await page.locator('.product').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-testid')));
 expect(new Set(ids).size).toBe(93);expect(posts).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('with no listings anywhere, the banner says so plainly instead of showing a JSON parse error',async({page})=>{
 // What a fresh checkout does: the database has nothing (404) and the static file is missing, so the catch-all page answers with HTML.
 await page.route('**/api/listings',route=>route.fulfill({status:404,json:{error:'Import a snapshot first'}}));
 await page.route('**/data/vinted.json',route=>route.fulfill({status:200,contentType:'text/html',body:'<!DOCTYPE html><html><body>FORME</body></html>'}));
 await page.goto('/following');
 await expect(page.getByText('No live listings are available yet.',{exact:false})).toBeVisible();
 await expect(page.getByText('Unexpected token',{exact:false})).toHaveCount(0);await expect(page.getByText('not valid JSON',{exact:false})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Retry listings'})).toBeVisible();
 await expect(page.locator('[data-testid^="listing-"]')).toHaveCount(0);
});
test('a missing database answer with a real static snapshot still loads, and a plain 404 for both is the empty state',async({page})=>{
 await page.route('**/api/listings',route=>route.fulfill({status:404,json:{error:'Nothing has been published yet.'}}));
 await page.goto('/following');await expect(page.getByTestId(`listing-${first.id}`)).toBeVisible();
 await page.unroute('**/data/vinted.json');await page.route('**/data/vinted.json',route=>route.fulfill({status:404,body:'Not found'}));
 await page.goto('/discover');await expect(page.getByText('No live listings are available yet.',{exact:false})).toBeVisible();
});
test('a server error and a garbled answer stay the generic failure, never a parser message',async({page})=>{
 await page.route('**/data/vinted.json',route=>route.fulfill({status:200,contentType:'application/json',body:'{not json'}));
 await page.goto('/following');await expect(page.getByText('Live listings could not be loaded.',{exact:false})).toBeVisible();
 await expect(page.getByText('JSON',{exact:false})).toHaveCount(0);
});

test('a dead photo shows a placeholder everywhere, with an Open on Vinted link only on the item page',async({page})=>{
 await page.route(/vinted\.net/,route=>route.abort());
 await page.goto(`/items/${first.id}`);
 const photo=page.locator('.detail .photo');
 await expect(photo.getByText('Photo unavailable',{exact:true})).toBeVisible();
 await expect(photo.getByText('It may have changed on Vinted.',{exact:true})).toBeVisible();
 const link=photo.getByRole('link',{name:'Open on Vinted ↗'});
 await expect(link).toHaveAttribute('href',(first as {sourceUrl:string}).sourceUrl);await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel',/noopener/);await expect(link).toHaveAttribute('rel',/noreferrer/);
 await page.goto('/following');
 const card=page.getByTestId(`listing-${first.id}`);await expect(card).toBeVisible();
 await expect(card.getByText('Photo unavailable',{exact:true})).toBeVisible();
 await expect(card.getByRole('link',{name:/Open on Vinted/})).toHaveCount(0);await expect(card.getByText('It may have changed on Vinted.')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('a photo that loads shows no placeholder and no extra link',async({page})=>{
 await page.route(/vinted\.net/,route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==','base64')}));
 await page.goto(`/items/${first.id}`);await expect(page.locator('.detail .photo img')).toBeVisible();
 await expect(page.getByText('Photo unavailable')).toHaveCount(0);await expect(page.locator('.photo-fallback-link')).toHaveCount(0);
});

for(const width of [1280,390])test(`deep-feed feedback and item-page Back preserve browsing at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 const pieces=Array.from({length:93},(_,index)=>({...first,id:95000+index,sourceId:String(95000+index),sourceKey:`vinted:${95000+index}`,sourceUrl:`https://www.vinted.se/items/${95000+index}-fixture`}));
 await page.addInitScript(brand=>localStorage.setItem('forme-v2',JSON.stringify({following:[brand]})),first.brand);
 await page.route('**/data/vinted.json',route=>route.fulfill({json:{...snapshot,items:pieces}}));
 await page.goto('/following');await expect(page.locator('.product')).toHaveCount(24);
 for(const count of [48,72]){await page.getByTestId('feed-load-more').scrollIntoViewIfNeeded();await expect(page.locator('.product')).toHaveCount(count);}
 const target=page.getByTestId('listing-95060');const dislike=target.getByRole('button',{name:/Not for me:/});
 await dislike.scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY);await dislike.click();
 await expect(target).toHaveCount(0);await expect(page.locator('.product')).toHaveCount(72);
 expect(Math.abs(await page.evaluate(()=>scrollY)-before)).toBeLessThan(200);
 const next=page.getByTestId('listing-95061');await next.locator('.productlink').scrollIntoViewIfNeeded();
 const browsing=await page.evaluate(()=>scrollY);await next.locator('.productlink').click();await expect(page).toHaveURL(/\/items\/95061$/);
 await page.goBack();await expect(page).toHaveURL(/\/following$/);await expect(page.locator('.product')).toHaveCount(72);
 await expect.poll(async()=>Math.abs(await page.evaluate(()=>scrollY)-browsing)).toBeLessThan(200);
});

test('a background listing update preserves the expanded feed',async({page})=>{
 await page.clock.install();
 const pieces=Array.from({length:93},(_,index)=>({...first,id:96000+index,sourceId:String(96000+index),sourceKey:`vinted:${96000+index}`,sourceUrl:`https://www.vinted.se/items/${96000+index}-fixture`}));
 await page.addInitScript(brand=>localStorage.setItem('forme-v2',JSON.stringify({following:[brand]})),first.brand);
 let reads=0;
 await page.route('**/data/vinted.json',route=>{reads++;return route.fulfill({json:{...snapshot,items:pieces}});});
 await page.goto('/following');await expect(page.locator('.product')).toHaveCount(24);
 for(const count of [48,72]){await page.getByTestId('feed-load-more').scrollIntoViewIfNeeded();await expect(page.locator('.product')).toHaveCount(count);}
 await page.getByTestId('listing-96060').scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY);
 pieces.unshift({...first,id:96999,sourceId:'96999',sourceKey:'vinted:96999',sourceUrl:'https://www.vinted.se/items/96999-fixture',age:0});
 await page.clock.runFor(61000);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect.poll(()=>reads).toBe(2);await expect(page.getByTestId('listing-96999')).toHaveCount(1);
 await expect(page.locator('.product')).toHaveCount(72);expect(Math.abs(await page.evaluate(()=>scrollY)-before)).toBeLessThan(200);
});
