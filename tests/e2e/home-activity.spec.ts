import {test,expect} from '@playwright/test';
import {defaults} from '../../lib/catalog';
const now=new Date().toISOString();
const base={source:'vinted',currency:'SEK',condition:'Good',fetchedAt:now,imageUrl:'https://images1.vinted.net/test.webp',size:'M',category:'',style:'',age:1,rarity:0,image:'',price:80,brand:'Our Legacy',gender:'men',genderSource:'provider'};
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('forme-onboarding-complete','1'));});
test.beforeEach(async({page})=>{
 await page.addInitScript(value=>{if(!localStorage.getItem('forme-v2'))localStorage.setItem('forme-v2',JSON.stringify({...value,styleRules:{},saved:[]}));},defaults);
 await page.route('**/api/refresh',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));await page.route('**/api/size-profile',route=>route.fulfill({json:{profile:null}}));
 await page.route('**/api/local-profile',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
});
test('Home distinguishes seeded stock, new finds and actual price changes',async({page})=>{
 const snapshot={fetchedAt:now,queries:['test'],items:[{...base,id:30001,sourceKey:'vinted:30001',title:'Baseline cotton shirt',newlyCollected:false,firstSeenAt:now},{...base,id:30002,sourceKey:'vinted:30002',title:'New wool jacket',newlyCollected:true,firstSeenAt:now},{...base,id:30003,sourceKey:'vinted:30003',title:'Reduced cotton shirt',newlyCollected:false,firstSeenAt:now,previousPrice:100,priceChangedAt:now}]};
 snapshot.items=snapshot.items.map(item=>({...item,sourceId:String(item.id),sourceUrl:`https://www.vinted.se/items/${item.id}-fixture`}));
 await page.route('**/api/listings',route=>route.fulfill({json:snapshot}));await page.goto('/');
 await expect(page.getByRole('heading',{name:'New to FORME',exact:true})).toBeVisible();await expect(page.getByTestId('listing-30002')).toBeVisible();await expect(page.getByTestId('listing-30001')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Price changes',exact:true})).toBeVisible();await expect(page.getByTestId('listing-30003')).toContainText('Previously');await expect(page.getByTestId('listing-30003')).toContainText('down');
});
