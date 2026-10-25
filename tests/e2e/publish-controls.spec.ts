import {test,expect} from '@playwright/test';
import {defaults} from '../../lib/catalog';
const base={source:'vinted',currency:'SEK',condition:'Good',fetchedAt:'2026-10-21T10:00:00Z',imageUrl:'https://images1.vinted.net/test.webp',size:'M',category:'',style:'',age:1,rarity:0,image:'',price:100};
const snapshot={fetchedAt:base.fetchedAt,queries:['test'],items:[{...base,id:50001,sourceKey:'vinted:50001',brand:'Auralee',title:'Cotton shirt'},{...base,id:50002,sourceKey:'vinted:50002',brand:'Lemaire',title:'Wool jacket'}]};
const settings={...defaults,following:['Our Legacy'],excluded:[],saved:[50001],dismissed:['vinted:50002'],styleRules:{}};
const initial={day:'2026-10-21',dailyCap:15,reservedCredits:15,reportedCredits:15,remainingCredits:0,providerAvailable:true,running:false,runs:[]};
snapshot.items=snapshot.items.map(item=>({...item,sourceId:String(item.id),sourceUrl:`https://www.vinted.se/items/${item.id}-fixture`}));
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('forme-onboarding-complete','1'));
 await page.addInitScript(value=>{if(!localStorage.getItem('forme-v2'))localStorage.setItem('forme-v2',JSON.stringify(value));},settings);
 await page.route('**/api/listings',route=>route.fulfill({json:snapshot}));await page.route('**/api/size-profile',route=>route.fulfill({json:{profile:null}}));await page.route('**/api/local-profile',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
});

// The hosted-site panel. /api/publish is always stubbed here: these tests must never write to a real hosted project.
const preview = {configured: true, blocked: null, local: {listings: 972, rejected: 0, fetchedAt: '2026-10-24T11:57:27.612Z'}, hosted: {listings: 868, fetchedAt: '2026-10-21T21:18:00.000Z', publishedAt: '2026-10-23T09:00:00.000Z'}};
test.beforeEach(async ({page}) => { await page.route('**/api/refresh', route => route.fulfill({json: initial})); });

test('the preview compares this computer with the hosted site and publishing waits for the click', async ({page}) => {
 let posts = 0; await page.route('**/api/publish', route => { if (route.request().method() === 'POST') posts++; return route.fulfill({json: preview}); });
 await page.goto('/tools');
 const panel = page.locator('#publish');
 await expect(panel.getByRole('heading', {name: 'Hosted site'})).toBeVisible();
 await expect(panel).toContainText('972 listings');await expect(panel).toContainText('868 listings');
 await expect(panel).toContainText('This computer');await expect(panel).toContainText('Publishing costs no provider credits');
 await expect(panel.getByRole('button', {name: 'Publish to hosted site'})).toBeEnabled();
 expect(posts).toBe(0);
});
test('publishing sends one explicit request, reports the result and refreshes the comparison', async ({page}) => {
 let posts = 0, body: unknown, hosted = preview.hosted;
 await page.route('**/api/publish', async route => {
  if (route.request().method() === 'POST') { posts++; body = route.request().postDataJSON(); await new Promise(r => setTimeout(r, 150)); hosted = {listings: 972, fetchedAt: preview.local.fetchedAt, publishedAt: '2026-10-25T17:30:00.000Z'}; return route.fulfill({json: {ok: true, published: 972, previous: 868, rejected: 0, fetchedAt: preview.local.fetchedAt}}); }
  return route.fulfill({json: {...preview, hosted}});
 });
 await page.goto('/tools');
 const panel = page.locator('#publish'), button = panel.getByRole('button', {name: 'Publish to hosted site'});
 await button.click();await expect(panel.getByRole('button', {name: 'Publishing…'})).toBeDisabled();
 await expect(panel.getByRole('status').filter({hasText: 'Published 972 listings to the hosted site (it had 868).'})).toBeVisible();
 expect(posts).toBe(1);expect(body).toEqual({action: 'publish'});
 await expect(panel).toContainText('972 listings · published');await expect(panel).not.toContainText('868 listings');
 await expect(button).toBeEnabled();
});
test('a refusal or a failure is shown plainly and leaves the button usable', async ({page}) => {
 await page.route('**/api/publish', route => route.request().method() === 'POST' ? route.fulfill({status: 502, json: {error: 'Could not write listings 1–200: boom'}}) : route.fulfill({json: preview}));
 await page.goto('/tools');
 await page.getByRole('button', {name: 'Publish to hosted site'}).click();
 await expect(page.getByRole('alert').filter({hasText: 'Could not write listings 1–200: boom'})).toBeVisible();
 await expect(page.getByRole('button', {name: 'Publish to hosted site'})).toBeEnabled();
});
test('when publishing would be refused, the preview says why and the button is off', async ({page}) => {
 await page.route('**/api/publish', route => route.fulfill({json: {...preview, blocked: 'Publishing would replace 868 hosted listings with 12. Publishing is refused unless that is confirmed on the command line (npm run publish -- --force).'}}));
 await page.goto('/tools');
 await expect(page.getByRole('alert').filter({hasText: 'Publishing would replace 868 hosted listings with 12.'})).toBeVisible();
 await expect(page.getByRole('button', {name: 'Publish to hosted site'})).toBeDisabled();
});
test('without the owner key the panel explains what is missing and cannot publish', async ({page}) => {
 await page.route('**/api/publish', route => route.fulfill({json: {configured: false, message: 'Publishing needs the owner key in .env.local on this computer (see docs/accounts-setup.md).'}}));
 await page.goto('/tools');
 await expect(page.locator('#publish')).toContainText('Publishing needs the owner key in .env.local');
 await expect(page.getByRole('button', {name: 'Publish to hosted site'})).toBeDisabled();
});
for (const status of [403, 401]) test(`the panel is absent where publishing is not allowed (${status}), such as the hosted site`, async ({page}) => {
 await page.route('**/api/publish', route => route.fulfill({status, json: {error: 'no'}}));
 await page.goto('/tools');
 await expect(page.getByRole('heading', {name: 'Collection tools'})).toBeVisible();
 await expect(page.locator('#publish')).toHaveCount(0);await expect(page.getByRole('button', {name: 'Publish to hosted site'})).toHaveCount(0);
});
test('the panel fits a phone screen', async ({page}) => {
 await page.setViewportSize({width: 340, height: 700});
 await page.route('**/api/publish', route => route.fulfill({json: preview}));
 await page.goto('/tools');
 const panel = page.locator('#publish');await panel.scrollIntoViewIfNeeded();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 const box = (await panel.getByRole('button', {name: 'Publish to hosted site'}).boundingBox())!;expect(box.height).toBeGreaterThanOrEqual(40);expect(box.x + box.width).toBeLessThanOrEqual(340);
});
