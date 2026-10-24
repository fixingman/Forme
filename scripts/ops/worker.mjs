// Long-running collection worker: node scripts/ops/worker.mjs  (or npm run worker). Survives browser/server restarts;
// queued runs are picked up and stale ones are marked interrupted, never retried automatically.
import {drainQueue} from '../../lib/server/job-worker.mjs';
import {log} from '../../lib/server/log.mjs';
try{process.loadEnvFile('.env.local');}catch(error){if(error.code!=='ENOENT')throw error;}
const interval=Number(process.env.FORME_WORKER_INTERVAL_MS??5000);let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;log('log','worker.stopping',{signal});});
log('log','worker.started',{intervalMs:interval});
while(!stopping){await drainQueue();await new Promise(resolve=>setTimeout(resolve,interval));}
