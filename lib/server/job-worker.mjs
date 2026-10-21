import {refreshControl} from './refresh-control.mjs';
import {log} from './log.mjs';
let draining=false;
/** Processes queued refreshes one at a time until none remain. Safe to call repeatedly; a second call while draining is a no-op. */
export async function drainQueue(options){
 if(draining)return;draining=true;
 try{
  for(;;){
   const control=refreshControl(options);let outcome;
   try{control.recover();outcome=await control.work();}
   catch(error){log('error','refresh.failed',{message:error instanceof Error?error.message:String(error)});outcome={status:'failed'};}
   finally{control.close();}
   if(outcome.status==='idle'||outcome.status==='busy')return;
   log('log','refresh.finished',{id:outcome.id,status:outcome.status,accepted:outcome.accepted});
  }
 }finally{draining=false;}
}
