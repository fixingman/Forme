// Long-running collection worker: node scripts/worker.mjs  (or npm run worker). Survives browser/server restarts;
// queued runs are picked up and stale ones are marked interrupted, never retried automatically.
import {drainQueue} from '../lib/server/job-worker.mjs';
const interval=Number(process.env.FORME_WORKER_INTERVAL_MS??5000);let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;console.log(JSON.stringify({level:'log',event:'worker.stopping',signal}));});
console.log(JSON.stringify({level:'log',event:'worker.started',intervalMs:interval}));
while(!stopping){await drainQueue();await new Promise(resolve=>setTimeout(resolve,interval));}
