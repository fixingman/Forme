import { test, expect } from '@playwright/test';

test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('forme-onboarding-complete','1'));});
test.beforeEach(async({page})=>{await page.route('**/api/listings',route=>route.fulfill({status:503,json:{error:'Fixture uses static snapshot'}}));await page.route('**/api/local-profile',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));await page.route('**/api/refresh',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));await page.route('**/api/size-profile',route=>route.fulfill({json:{profile:null}}));});

test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('forme-data-mode','demo'));});

test('Home, listing state, deep links, reload and browser history stay consistent', async ({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Home',exact:true})).toBeVisible();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Following',exact:true}).click();
  await expect(page).toHaveURL(/\/following$/);
  await expect(page.getByRole('heading',{name:'Following',exact:true})).toBeVisible();
  const shirt=page.getByTestId('listing-6');
  await expect(shirt.getByText('New today')).toBeVisible();
  await shirt.getByRole('button',{name:'Save Our Legacy Evening Shirt',exact:true}).click();
  await page.getByRole('link',{name:'Saved items, 1',exact:true}).click();
  await expect(page).toHaveURL(/\/saved$/);
  await expect(page.getByRole('heading',{name:'Saved Items',exact:true})).toBeVisible();
  await expect(page.getByTestId('listing-6')).toBeVisible();
  await page.getByTestId('listing-6').getByRole('link',{name:'View Our Legacy Evening Shirt',exact:true}).click();
  await expect(page).toHaveURL(/\/items\/6$/);
  await page.goBack(); await expect(page).toHaveURL(/\/saved$/);
  await page.goForward(); await expect(page).toHaveURL(/\/items\/6$/);
  await page.reload(); await expect(page.getByRole('button',{name:'♥ Saved — remove'})).toBeVisible();
});

test('style suggestions can be added, edited and removed with URL filters', async ({page})=>{
  await page.goto('/styles');
  await page.getByText('Quiet Luxury',{exact:true}).locator('..').getByRole('button',{name:'Add style'}).click();
  const tile=page.getByText('Quiet Luxury',{exact:true}).locator('..');
  await tile.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByLabel('Style name').fill('My quiet edit');
  await page.getByRole('button',{name:'Save style',exact:true}).click();
  await page.getByText('My quiet edit',{exact:true}).locator('..').getByRole('link',{name:'View feed'}).click();
  await expect(page).toHaveURL(/style=My%20quiet%20edit/);
  await expect(page.getByTestId('listing-6')).toBeVisible();
  await expect(page.getByTestId('listing-4')).toHaveCount(0);
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'My Styles',exact:true}).click();
  await page.getByRole('button',{name:'Remove My quiet edit',exact:true}).click();
  await page.goto('/discover'); await expect(page.getByRole('link',{name:'My quiet edit',exact:true})).toHaveCount(0);
});

test('saved searches support creation, editing, budget zero, deletion and history', async ({page})=>{
  await page.goto('/searches');
  await expect(page.getByRole('button',{name:'New search'})).toHaveCount(1);
  await page.getByRole('button',{name:'New search'}).click();
  await page.getByLabel('Search name').fill('Evening shirts');
  await page.getByLabel('Keywords (all words must match)').fill('Evening Shirt');
  await page.getByRole('button',{name:'Create search',exact:true}).click();
  await expect(page).toHaveURL(/\/searches\/\d+$/);
  await expect(page.getByTestId('listing-6')).toBeVisible();
  await page.getByRole('button',{name:'Edit search',exact:true}).click();
  await page.getByLabel('Maximum price, SEK').fill('0');
  await page.getByRole('button',{name:'Save changes'}).click();
  await expect(page.getByText('No matching pieces yet.',{exact:false})).toBeVisible();
  await page.getByRole('link',{name:'All saved searches'}).click();
  await expect(page).toHaveURL(/\/searches$/);
  await page.goBack(); await expect(page.getByRole('heading',{name:'Evening shirts'})).toBeVisible();
  await page.getByRole('button',{name:'Edit search',exact:true}).click();
  await page.getByRole('button',{name:'Delete search'}).click();
  await expect(page).toHaveURL(/\/searches$/);
  await expect(page.getByText('Evening shirts',{exact:true})).toHaveCount(0);
});

test('brand states are exclusive and exclusions apply to all feeds', async ({page})=>{
  await page.goto('/brands');
  await page.getByLabel('Find a brand').fill('Our');
  const group=page.getByRole('group',{name:'Our Legacy preference'});
  await group.getByRole('button',{name:'Exclude',exact:true}).click();
  await expect(group.getByRole('button',{name:'Exclude',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(group.getByRole('button',{name:'Follow',exact:true})).toHaveAttribute('aria-pressed','false');
  for(const path of ['/discover','/following','/drops','/rare','/saved','/']) {
    await page.goto(path); await expect(page.getByTestId('listing-6')).toHaveCount(0); await expect(page.getByTestId('listing-1')).toHaveCount(0);
  }
  await page.goto('/brands');
  await page.getByLabel('Find a brand').fill('Our Legacy');
  await page.getByRole('group',{name:'Our Legacy preference'}).getByRole('button',{name:'Neutral',exact:true}).click();
  await page.goto('/discover'); await expect(page.getByTestId('listing-6')).toBeVisible();
  await page.goto('/following'); await expect(page.getByTestId('listing-6')).toHaveCount(0);
});

test('experimental daily digest respects every source toggle and deduplicates items', async ({page})=>{
  await page.goto('/tools?preview=digest');
  for(const label of ['New pieces from followed brands','New matches from enabled saved searches','New potential rare finds','New pieces matching My Styles']) await page.getByLabel(label,{exact:true}).uncheck();
  await page.getByRole('link',{name:'Preview your daily digest'}).click();
  await expect(page.locator('[data-testid^="listing-"]')).toHaveCount(0);
  await page.getByRole('link',{name:'Digest settings',exact:true}).click();
  await page.getByLabel('New pieces from followed brands',{exact:true}).check();
  await page.getByRole('link',{name:'Preview your daily digest'}).click();
  await expect(page.getByTestId('listing-6')).toHaveCount(1);
  await expect(page.getByTestId('listing-10')).toHaveCount(1);
  await expect(page.getByTestId('listing-1')).toHaveCount(0);
});

test('v1 preferences migrate without overwriting original storage', async ({page})=>{
  await page.addInitScript(()=>{if(!localStorage.getItem('forme-v2'))localStorage.setItem('forme-v1',JSON.stringify({saved:[6],following:['Our Legacy'],excluded:['Zara'],styles:['Minimalism']}));});
  await page.goto('/saved'); await expect(page.getByTestId('listing-6')).toBeVisible();
  const stored=await page.evaluate(()=>({v1:JSON.parse(localStorage.getItem('forme-v1')!),v2:JSON.parse(localStorage.getItem('forme-v2')!)}));
  expect(stored.v1.saved).toEqual([6]); expect(stored.v2.saved).toEqual([6]); expect(stored.v2.following).toEqual(['Our Legacy']);
});

test('mobile navigation exposes every screen without horizontal overflow', async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('button',{name:'More',exact:true}).click();
  await page.locator('#more-menu').getByRole('link',{name:'My Styles'}).click();
  await expect(page.getByRole('heading',{name:'My Styles',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Create style'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  for(const path of ['/','/discover','/brands','/searches','/settings','/items/6']) {
    await page.goto(path); await expect(page.locator('.content')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});


test('sidebar collapse persists and icon-only links retain accessible names', async ({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Collapse sidebar'}).click();
 await expect(page.locator('.app')).toHaveClass(/sidebar-collapsed/);
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Discover',exact:true}).click();
 await expect(page).toHaveURL(/\/discover$/);
 await page.reload();
 await expect(page.getByRole('button',{name:'Expand sidebar'})).toBeVisible();
 await page.getByRole('button',{name:'Expand sidebar'}).click();
 await expect(page.locator('.app')).not.toHaveClass(/sidebar-collapsed/);
});

test('Discover style editor works in place and search feeds expose matching pieces', async ({page})=>{
 await page.goto('/discover');
 await page.getByRole('button',{name:'Edit style filters'}).click();
 await expect(page.getByRole('dialog',{name:'Your Discover filters'})).toBeVisible();
 await page.getByRole('button',{name:'Edit Minimalism',exact:true}).click();
 await page.getByLabel('Style name').fill('Everyday minimal');
 await page.getByRole('button',{name:'Save style',exact:true}).click();
 await expect(page.getByRole('link',{name:'Everyday minimal',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Edit style filters'}).click();
 await page.getByRole('button',{name:'Remove Everyday minimal',exact:true}).click();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('link',{name:'Everyday minimal',exact:true})).toHaveCount(0);
 await page.goto('/searches');
 await expect(page.getByRole('region',{name:'Leather jackets matching pieces'}).getByTestId('listing-1')).toBeVisible();
 await expect(page.locator('.productmeta .price').first()).not.toContainText('SEK');
});
