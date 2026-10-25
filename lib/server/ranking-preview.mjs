import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID,randomInt} from 'node:crypto';
import {spawn} from 'node:child_process';
import {trustedSnapshot} from '../domain/data-trust.mjs';
import {recommendListings,listingKey} from '../domain/recommendations.mjs';
import {feedbackSnapshot} from '../domain/taste-profile.mjs';
import {englishListing} from '../domain/listing-language.mjs';
import {PREVIEW_ENGINES,PREVIEW_CHOICES,preferenceKey,normalizePreviewRanking} from '../domain/ranking-preview.mjs';
import {featuresFor,activeExamples} from '../../scripts/lab/recommendation-data.mjs';
import {openStore} from './store.mjs';

const read=(path,fallback)=>{try{return JSON.parse(readFileSync(path,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}};
const atomic=(path,value)=>{const tmp=path+'.'+randomUUID()+'.tmp';writeFileSync(tmp,JSON.stringify(value),{mode:0o600});renameSync(tmp,path);};
const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
const emptyFeedback=()=>({version:1,revision:0,choices:{}});
export class PreviewError extends Error{constructor(message,status=400){super(message);this.status=status;}}
function lock(path){
 let fd;
 for(let attempt=0;attempt<2;attempt++)try{fd=openSync(path,'wx',0o600);writeFileSync(fd,String(process.pid));break;}
 catch(error){
  if(error.code!=='EEXIST')throw error;
  const pid=Number(readFileSync(path,'utf8'));
  if(Number.isSafeInteger(pid)&&pid>0)try{process.kill(pid,0);}catch(probe){if(probe.code==='ESRCH'&&attempt===0){unlinkSync(path);continue;}}
  throw new PreviewError('Another preview operation is in progress. Try again shortly.',409);
 }
 return ()=>{closeSync(fd);unlinkSync(path);};
}
async function runModels(root,directory){
 const python=join(root,'.context/recommendation-lab/.venv/bin/python'),gorse=join(root,'.context/recommendation-lab/bin/gorse-in-one');
 if(!existsSync(python))return {};
 const env=Object.fromEntries(['HOME','PATH','TMPDIR','LANG'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
 await new Promise((accept,reject)=>{
  const child=spawn(python,[join(root,'scripts/lab/preview_rankings.py'),'--directory',directory,'--gorse-bin',gorse,'--parent-pid',String(process.pid)],{cwd:root,env,detached:true,stdio:['ignore','ignore','ignore']});
  const stop=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}};
  const timer=setTimeout(()=>{stop();reject(Error('Preview models timed out'));},120000);
  child.once('error',error=>{clearTimeout(timer);stop();reject(error);});
  child.once('exit',code=>{clearTimeout(timer);code===0?accept():reject(Error('Preview model process failed'));});
 });
 return read(join(directory,'models.json'),{});
}

export function rankingPreview({root=process.cwd(),snapshot,rank=runModels,now=Date.now}={}){
 root=resolve(root);const directory=join(root,'.context/ranking-preview');mkdirSync(directory,{recursive:true,mode:0o700});
 const feedbackPath=join(directory,'feedback.json'),latestPath=join(directory,'latest.json');
 const feedback=()=>read(feedbackPath,emptyFeedback());
 const sessionPath=id=>{if(!validId(id))throw new PreviewError('Invalid comparison.');return join(directory,id,'session.json');};
 function load(id){const value=read(sessionPath(id),null);if(!value)throw new PreviewError('Comparison not found. Create a new comparison.',404);return value;}
 function present(session,{blind=false,reveal=false}={}){
  const blindAvailable=['river','gorse'].every(id=>session.engines[id].mode==='learned');
  if(blind&&!blindAvailable)throw new PreviewError('Both learned models must be ready for a blind comparison.',409);
  const choices=feedback(),views=blind?session.blindOrder.map((engine,index)=>({id:`edit-${index+1}`,label:`Edit ${String.fromCharCode(65+index)}${reveal?' · '+session.engines[engine].label:''}`,keys:session.engines[engine].keys,...(reveal?{mode:session.engines[engine].mode,note:session.engines[engine].note}:{})})):PREVIEW_ENGINES.map(id=>({id,...session.engines[id]}));
  return {id:session.id,createdAt:session.createdAt,profileKey:session.profileKey,items:session.items,training:session.training,views,blindAvailable,revision:choices.revision,choices:Object.fromEntries(session.items.flatMap(item=>choices.choices[listingKey(item)]?[[listingKey(item),choices.choices[listingKey(item)].choice]]:[]))};
 }
 return {
  status(){return {latest:read(latestPath,null)?.id??null,reviewChoices:Object.values(feedback().choices).filter(row=>row.choice!=='skip').length};},
  get(id,options){return present(load(id),options);},
  seed(rows){
   const release=lock(join(directory,'feedback.lock'));try{
    const current=feedback();let added=0;
    for(const {item,choice} of rows){if(!PREVIEW_CHOICES.includes(choice)||!item?.sourceKey)throw new PreviewError('Invalid preview seed');if(!current.choices[item.sourceKey]){current.choices[item.sourceKey]={choice,item};added++;}}
    if(added)atomic(feedbackPath,{...current,revision:current.revision+1});return {added,revision:current.revision+(added?1:0)};
   }finally{release();}
  },
  async create(profile){
   const release=lock(join(directory,'build.lock'));try{
    const id=randomUUID(),sessionDirectory=join(directory,id);mkdirSync(sessionDirectory,{mode:0o700});
    let raw=snapshot?.();
    if(!raw&&existsSync(join(root,'.forme-data/forme.sqlite'))){const store=openStore(join(root,'.forme-data/forme.sqlite'));try{raw=store.snapshot();}finally{store.close();}}
    if(!raw)raw=read(join(root,'public/data/vinted.json'),null);
    if(!raw)throw new PreviewError('No local listings are available. Import existing listings first.');
    const source=trustedSnapshot(raw,now()).items.map(englishListing),saved=profile.savedListings??[],all=new Map([...saved,...source].map(item=>[listingKey(item),item]));
    const frozenFeedback=feedback(),states=new Map();
    const actualItems=new Map(all);
    for(const [key,row] of Object.entries(frozenFeedback.choices))if(row.choice!=='skip'){states.set(key,row.choice);all.set(key,row.item);}
    const settings=profile.settings;
    // Current real preferences override older study choices; hard hides have highest priority.
    for(const item of actualItems.values())if(settings.saved.includes(item.id)){states.set(listingKey(item),'save');all.set(listingKey(item),item);}
    for(const key of settings.dismissed){states.set(key,'dismiss');if(actualItems.has(key))all.set(key,actualItems.get(key));}
    const signals=[...all.values()],known=new Set(states.keys()),savedIds=signals.filter(item=>states.get(listingKey(item))==='save').map(item=>item.id),hidden=[...states].filter(([,choice])=>choice==='dismiss').map(([key])=>key);
    const preferences={...settings,saved:savedIds,dismissed:hidden,tasteFeedback:[...(settings.tasteFeedback??[]),...signals.filter(item=>hidden.includes(listingKey(item))).map(feedbackSnapshot)]};
    const baseline=recommendListings(source,preferences,{signals,now:now()}).filter(row=>!known.has(listingKey(row.item))),keys=baseline.map(row=>listingKey(row.item));
    const events=[...states].map(([key,choice])=>({key,action:choice})),examples=activeExamples(signals,events);
    const modelCase={now:now(),items:signals.map(item=>({key:listingKey(item),features:featuresFor(item),at:item.observedAt??item.fetchedAt??new Date(now()).toISOString()})),candidateKeys:keys,examples,baseline:baseline.map(row=>({key:listingKey(row.item),score:row.score}))};
    atomic(join(sessionDirectory,'input.json'),{case:modelCase});
    let models={};try{if(keys.length)models=await rank(root,sessionDirectory);}catch{/* Current remains usable if local model preparation fails. */}
    const engines={current:{label:'Current',keys,mode:'current',note:'Current rules applied to this comparison’s frozen feedback.'}};
    for(const name of ['river','gorse']){
     const result=models[name];let normalized;
     try{if(result?.ranking)normalized=normalizePreviewRanking(result.ranking,keys);}catch{}
     const fallback=result?.mode?.includes('fallback');
     engines[name]={label:name==='river'?'River':'Gorse',keys:normalized?.keys??keys,mode:!keys.length?'empty':!normalized?'unavailable':fallback?'fallback':normalized.missing?'partial':'learned',note:!keys.length?'No unrated eligible pieces in this snapshot.':!normalized?'This model is unavailable on this computer. Showing Current order.':fallback?'More positive and negative examples are needed. Showing Current order.':normalized.missing?`${normalized.missing} pieces kept their Current order because the model did not rank them.`:'Trained locally on the same frozen feedback.'};
    }
    const blindOrder=[...PREVIEW_ENGINES];for(let i=blindOrder.length-1;i>0;i--){const j=randomInt(i+1);[blindOrder[i],blindOrder[j]]=[blindOrder[j],blindOrder[i]];}
    const session={id,createdAt:new Date(now()).toISOString(),profileKey:preferenceKey(settings,saved),items:baseline.map(row=>row.item),engines,blindOrder,training:{positive:examples.filter(row=>row.label===1).length,negative:examples.filter(row=>row.label===0).length,revision:frozenFeedback.revision}};
    atomic(sessionPath(id),session);atomic(latestPath,{id});return present(session);
   }finally{release();}
  },
  vote({id,key,choice,baseRevision}){
   const session=load(id);if(!session.items.some(item=>listingKey(item)===key)||choice!==null&&!PREVIEW_CHOICES.includes(choice))throw new PreviewError('Invalid comparison choice');
   const release=lock(join(directory,'feedback.lock'));try{
    const current=feedback();if(baseRevision!==current.revision)throw new PreviewError('Preview choices changed in another tab. Reload this comparison before rating again.',409);
    if(choice===null)delete current.choices[key];else current.choices[key]={choice,item:session.items.find(item=>listingKey(item)===key)};
    atomic(feedbackPath,{...current,revision:current.revision+1});return {revision:current.revision+1};
   }finally{release();}
  }
 };
}
