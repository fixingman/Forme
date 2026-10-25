import {test,expect,type Page} from '@playwright/test';
import {defaults} from '../../lib/catalog';
const at=new Date(Date.now()-3600000).toISOString();
const pieces=Array.from({length:4},(_,i)=>({id:97001+i,source:'vinted',sourceId:String(97001+i),sourceKey:`vinted:${97001+i}`,sourceUrl:`https://www.vinted.se/items/${97001+i}-fixture`,brand:i%2?'Auralee':'Lemaire',title:['Cotton shirt','Wool jacket','Linen trousers','Cotton knit'][i],price:400,currency:'SEK',size:'M',gender:'men',genderSource:'provider',condition:'Good',image:'',imageUrl:'https://images1.vinted.net/fixture.webp',category:'',style:'',rarity:0,age:1,fetchedAt:at}));
const settings={...defaults,following:['Our Legacy'],excluded:[],styles:[],saved:[],dismissed:[],tasteFeedback:[],styleRules:{},gender:{selected:['men','women','unisex'],includeUnknown:true},sizing:{enabled:false,selected:[],includeOneSize:true,includeUnspecified:true}};
const id='11111111-1111-4111-8111-111111111111';
test.beforeEach(async({page})=>{
 await page.addInitScript(settings=>{localStorage.setItem('forme-onboarding-complete','1');if(!localStorage.getItem('forme-v2'))localStorage.setItem('forme-v2',JSON.stringify(settings));},settings);
 await page.route('**/api/listings',route=>route.fulfill({json:{fetchedAt:at,items:pieces}}));
 await page.route('**/api/profile',route=>route.fulfill({json:{sync:'off'}}));
 for(const name of ['size-profile','local-profile','refresh'])await page.route(`**/api/${name}`,route=>route.fulfill({status:503,json:{error:'Isolated fixture'}}));
 await page.route('https://images1.vinted.net/**',route=>route.fulfill({status:404,body:''}));
});
async function mockLearning(page:Page,eligible=false){
 let offline=false,revision=0;const events=new Map<string,any>(),exposures=new Map<string,any>(),selections:any[]=[];
 const keys=pieces.map(row=>row.sourceKey),engines=Object.fromEntries(['current','river','river-regularized','gorse'].map(name=>[name,{mode:name==='current'?'current':'learned',keys:name==='current'?keys:[...keys].reverse()}]));
 let selected:any=null;
 await page.route('**/api/learning**',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{events:events.size,selection:{revision,selected,history:[]},canTrain:true,job:null,runs:[{id,channel:'preview',createdAt:at,engines,training:{positive:6,negative:6}}],reports:['shopping','preview'].map(channel=>({channel,counts:{positive:0,style:0,price:0,data:0,unknown:0,unscored:0},metric:'Only judged pairs count.',engines:Object.fromEntries(Object.keys(engines).map(name=>[name,{eligible:eligible&&channel==='preview',status:eligible?'ready-for-review':'insufficient-evidence',pairs:eligible?20:0,days:eligible?5:0}]))}))}});
  const body=route.request().postDataJSON();
  if(body.action==='snapshot')return route.fulfill({json:{id,createdAt:at,items:pieces,engines,training:{positive:6,negative:6},selectedKeys:null,selectedName:'current'}});
  if(offline)return route.fulfill({status:503,json:{error:'Offline fixture. Feedback remains on this device.'}});
  if(body.action==='events'){body.events.forEach((event:any)=>events.set(event.id,event));return route.fulfill({json:{ack:body.events.map((event:any)=>event.id)}});}
  if(body.action==='exposure'){exposures.set(body.exposure.id,body.exposure);return route.fulfill({json:{id:body.exposure.id}});}
  if(body.action==='select'){selections.push(body);revision++;selected=body.engine==='current'?null:{engine:body.engine,runId:body.runId,channel:'preview'};return route.fulfill({json:{revision,selected,history:[]}});}
  return route.fulfill({json:{}});
 });
 return {events,exposures,selections,offline:(value:boolean)=>{offline=value;}};
}
test('immediate hide, optional price reason and offline feedback survive reload without changing saves or spending',async({page})=>{
 const mock=await mockLearning(page);let paid=0;page.on('request',request=>{if(request.method()==='POST'&&/\/api\/(refresh|translate)/.test(request.url()))paid++;});
 await page.goto('/discover');await expect(page.getByTestId('listing-97001')).toBeVisible();
 await expect.poll(()=>mock.exposures.size).toBeGreaterThan(0);mock.offline(true);
 await page.getByRole('button',{name:'Not for me: Cotton shirt',exact:true}).click();
 await expect(page.getByTestId('listing-97001')).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Add reason',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Too expensive',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).tasteFeedback[0].reason)).toBe('price');
 await page.reload();await expect(page.getByTestId('listing-97001')).toHaveCount(0);
 mock.offline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect.poll(()=>[...mock.events.values()].map(row=>row.action)).toEqual(['dismiss','reason']);
 expect([...mock.events.values()][1].targetId).toBe([...mock.events.values()][0].id);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).saved)).toEqual([]);
 await page.goto('/settings');await page.getByRole('button',{name:'Restore Cotton shirt',exact:true}).click();
 await expect.poll(()=>[...mock.events.values()].map(row=>row.action)).toEqual(['dismiss','reason','restore']);expect(paid).toBe(0);
});
test('preview votes stay separate; changing filters invalidates a frozen comparison',async({page})=>{
 const mock=await mockLearning(page);await page.goto('/tools/learning');await page.getByRole('button',{name:'Create learning comparison',exact:true}).click();
 await page.getByRole('button',{name:'River',exact:true}).click();
 await page.getByRole('button',{name:'Not for me: Cotton knit',exact:true}).click();
 await page.getByRole('button',{name:'Add reason',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Not my style',exact:true}).click();
 await expect.poll(()=>[...mock.events.values()].filter(row=>row.action==='reason').length).toBe(1);
 expect([...mock.events.values()].every(row=>row.channel==='preview')).toBe(true);
 expect(await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('forme-v2')!);return [p.saved,p.dismissed];})).toEqual([[],[]]);
 await page.getByRole('button',{name:'My sizes and departments',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('checkbox',{name:'Women',exact:true}).uncheck();await dialog.getByRole('button',{name:'Apply filters',exact:true}).click();
 await expect(page.getByText('Your preferences or inventory changed.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Not for me: Cotton knit',exact:true})).toHaveCount(0);
});
test('activation needs sufficient evidence and explicit preview consent; rollback returns to Current',async({page})=>{
 await mockLearning(page);await page.goto('/tools/learning');for(const button of await page.getByRole('button',{name:'Review activation',exact:true}).all())await expect(button).toBeDisabled();
 const mock=await mockLearning(page,true);await page.reload();const preview=page.locator('.learning-report').filter({hasText:'Private preview judgments'});
 await preview.getByRole('button',{name:'Review activation',exact:true}).first().click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'Activate River',exact:true})).toBeDisabled();
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Activate River',exact:true}).click();
 await expect(page.getByRole('button',{name:'Return to Current',exact:true})).toBeVisible();expect(mock.selections[0]).toMatchObject({engine:'river',expectedRevision:0,allowPreviewTraining:true});
 await page.getByRole('button',{name:'Return to Current',exact:true}).click();await expect(page.getByText('Current remains selected.',{exact:true})).toBeVisible();expect(mock.selections[1]).toMatchObject({engine:'current',expectedRevision:1});
 await page.setViewportSize({width:375,height:812});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('learning API rejects foreign origins and malformed events without training',async({request,baseURL})=>{
 const origin=new URL(baseURL!).origin;
 expect((await request.post('/api/learning',{headers:{origin:'https://elsewhere.example'},data:{action:'train'}})).status()).toBe(403);
 expect((await request.post('/api/learning',{headers:{origin,'Content-Type':'application/json'},data:'null'})).status()).toBe(400);
 expect((await request.post('/api/learning',{headers:{origin},data:{action:'events',events:[{id:'invalid'}]}})).status()).toBe(400);
 expect((await request.post('/api/learning',{headers:{origin},data:{action:'clear',confirmation:'yes'}})).status()).toBe(400);
});
