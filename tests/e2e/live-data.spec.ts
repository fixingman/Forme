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
 await page.getByText('Show original listing text',{exact:true}).click();
 await expect(page.locator('.original-listing').getByText('Acne skinnjacka',{exact:true})).toBeVisible();
 await expect(page.locator('.original-listing')).toContainText('Condition: Bra');
});

test('larger feeds reveal additional listings without rendering the entire batch initially',async({page})=>{
 await page.addInitScript(brands=>localStorage.setItem('forme-v2',JSON.stringify({following:brands})),[...new Set(snapshot.items.map(item=>item.brand))]);
 await page.goto('/following');
 await expect(page.locator('.product')).toHaveCount(24);
 await page.getByRole('button',{name:'Show more',exact:false}).click();
 await expect(page.locator('.product')).toHaveCount(29);
 await expect(page.getByRole('button',{name:'Show more',exact:false})).toHaveCount(0);
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
