import {test,expect} from '@playwright/test';
import {defaults} from '../../lib/catalog';

// Discover cards give one clear reason; anything different sits behind an optional "Why this?".
const at=new Date(Date.now()-86400000).toISOString();
const piece=(id:number,brand:string,title:string,extra:Record<string,unknown>={})=>({id,brand,title,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,sourceUrl:`https://www.vinted.se/items/${id}-x`,imageUrl:'https://images1.vinted.net/fixture.webp',price:1200,currency:'SEK',size:'M',condition:'Good',gender:'men',genderSource:'provider',fetchedAt:at,firstSeenAt:at,observedAt:at,newlyCollected:true,category:'',style:'',age:1,rarity:0,image:'',...extra});
const items=[
 piece(94001,'Lemaire','Cotton trousers',{style:'Minimalism'}),   // related to Our Legacy, and matches the Minimalism style: a second, different reason
 piece(94002,'Auralee','Silk shirt'),                              // related to Our Legacy only: nothing more to say
 piece(94003,'Our Legacy','Followed brand shirt'),                 // followed, so it is in Following, not Discover
];
const settings={...defaults,following:['Our Legacy'],excluded:[],styles:['Minimalism'],styleRules:{},saved:[],dismissed:[],searches:[],sizing:{enabled:false,selected:[],includeOneSize:true,includeUnspecified:true}};
test.beforeEach(async({page})=>{
 await page.addInitScript(value=>{localStorage.setItem('forme-onboarding-complete','1');if(!localStorage.getItem('forme-v2'))localStorage.setItem('forme-v2',JSON.stringify(value));},settings);
 await page.route('**/api/listings',route=>route.fulfill({json:{fetchedAt:at,queries:['fixture'],items}}));
 for(const path of ['size-profile','local-profile','profile','refresh'])await page.route(`**/api/${path}`,route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
 await page.route('https://images1.vinted.net/**',route=>route.fulfill({status:404,body:''}));
});
const card=(page:import('@playwright/test').Page,id:number)=>page.getByTestId(`listing-${id}`);

test('a card shows one reason line, and the second kind of reason waits behind Why this?',async({page})=>{
 await page.goto('/discover');
 const a=card(page,94001);await expect(a).toBeVisible();
 await expect(a.locator('.why > p')).toHaveText('Because you follow Our Legacy');
 await expect(a.locator('.why > p')).not.toContainText(' · ');
 await expect(a.getByText('Matches your Minimalism style')).toBeHidden();      // closed: not visible
 await a.getByText('Why this?',{exact:true}).click();
 await expect(a.getByText('Matches your Minimalism style')).toBeVisible();
 await expect(a.locator('.why-details li')).toHaveCount(1);
});
test('the style idea is never said twice on one card',async({page})=>{
 await page.goto('/discover');const a=card(page,94001);await a.getByText('Why this?',{exact:true}).click();
 const texts=await a.locator('.why p, .why li').allInnerTexts();
 expect(new Set(texts).size).toBe(texts.length);
 expect(texts.filter(text=>/style/i.test(text))).toHaveLength(1);
});
test('a card with nothing more to say has no Why this? at all',async({page})=>{
 await page.goto('/discover');const b=card(page,94002);await expect(b).toBeVisible();
 await expect(b.locator('.why > p')).toHaveText('Because you follow Our Legacy');await expect(b.getByText('Why this?')).toHaveCount(0);await expect(b.locator('details')).toHaveCount(0);
});
test('Why this? opens and closes from the keyboard and has a visible focus ring',async({page})=>{
 await page.goto('/discover');const a=card(page,94001),summary=a.locator('.why-details > summary');
 await summary.focus();await expect(summary).toBeFocused();
 expect(await summary.evaluate(e=>getComputedStyle(e).outlineStyle)).not.toBe('none');
 await page.keyboard.press('Enter');await expect(a.locator('.why-details')).toHaveAttribute('open','');
 await page.keyboard.press('Enter');await expect(a.locator('.why-details')).not.toHaveAttribute('open','');
});
test('explanations belong to Discover only',async({page})=>{
 await page.goto('/following');await expect(card(page,94003)).toBeVisible();
 await expect(page.locator('.why')).toHaveCount(0);await expect(page.getByText('Why this?')).toHaveCount(0);
});
test('opening one explanation does not change the card layout of its neighbours, and the touch target is comfortable',async({page})=>{
 await page.goto('/discover');const a=card(page,94001),b=card(page,94002);
 const before=(await b.boundingBox())!;await a.getByText('Why this?',{exact:true}).click();const after=(await b.boundingBox())!;
 expect(Math.abs(after.x-before.x)).toBeLessThan(1);expect((await a.locator('.why-details > summary').boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
for(const [name,size] of [['phone',{width:375,height:760}],['small phone',{width:340,height:700}]] as const)
test(`explanations fit without overflow on a ${name}`,async({page})=>{
 await page.setViewportSize(size);await page.goto('/discover');await card(page,94001).getByText('Why this?',{exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const box=(await card(page,94001).locator('.why').boundingBox())!;expect(box.x+box.width).toBeLessThanOrEqual(size.width);
});
