import {test,expect} from '@playwright/test';
import fixture from '../fixtures/vinted.json';
const first=fixture.items[0];
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('forme-onboarding-complete','1'));
 await page.route('**/api/size-profile',route=>route.fulfill({json:{profile:null}}));
 await page.route('**/api/refresh',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
 await page.route('**/api/local-profile',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
});
test('bad prices and source links are excluded; item-specific stale data and unknown availability are visible',async({page})=>{
 const at=new Date(Date.now()-10*86400000).toISOString();
 await page.route('**/api/listings',route=>route.fulfill({json:{...fixture,fetchedAt:new Date().toISOString(),items:[{...first,fetchedAt:at,firstSeenAt:at},{...first,id:999991,price:null},{...first,id:999992,sourceUrl:'https://evil.example/item'}]}}));
 await page.goto('/following');const card=page.getByTestId(`listing-${first.id}`);await expect(card).toBeVisible();await expect(card).toContainText('Price last observed over 7 days ago');await expect(page.locator('.product')).toHaveCount(1);
 await card.getByRole('link',{name:`View ${first.brand} ${first.title}`,exact:true}).click();
 await expect(page.getByText('Availability unknown.',{exact:false})).toBeVisible();await expect(page.getByText('Price is the last observed item price',{exact:false})).toBeVisible();
 await page.goto('/tools');const report=page.locator('#data-quality');await expect(report).toBeVisible();await expect(report.locator('div').filter({has:page.locator('dt',{hasText:'Excluded or duplicate records'})}).locator('dd')).toHaveText('2');
});
test('reported sold pieces leave shopping feeds but remain saved with their status and backup provenance',async({page})=>{
 await page.addInitScript(id=>{localStorage.setItem('forme-v2',JSON.stringify({following:['Our Legacy'],saved:[id]}));},first.id);
 await page.route('**/api/listings',route=>route.fulfill({json:{...fixture,items:[{...first,availability:'sold',availabilitySource:'provider',availabilityObservedAt:first.fetchedAt}]}}));
 await page.goto('/following');await expect(page.locator('.product')).toHaveCount(0);
 await page.goto('/saved');await expect(page.getByTestId(`listing-${first.id}`)).toContainText('Sold');
 await page.getByTestId(`listing-${first.id}`).getByRole('link',{name:`View ${first.brand} ${first.title}`,exact:true}).click();await expect(page.getByText('Sold.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'♥ Saved — remove'}).click();await page.getByRole('button',{name:'♡ Save item',exact:true}).click();
 await page.goto('/settings');const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download settings backup'}).click();const download=await downloading;const {readFile}=await import('node:fs/promises');const backup=JSON.parse(await readFile((await download.path())!,'utf8'));expect(backup.savedListings[0].availability).toBe('sold');expect(backup.savedListings[0].availabilitySource).toBe('provider');
});
