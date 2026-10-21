// Structured JSON logging with redaction, so logs can be shipped to any collector without leaking keys.
const sensitive=/key|token|secret|authorization|password|cookie/i;
const clean=(value,depth=0)=>{
 if(typeof value==='string')return value.length>500?`${value.slice(0,500)}…`:value;
 if(value instanceof Error)return clean(value.message);
 if(Array.isArray(value))return depth>3?'[truncated]':value.slice(0,50).map(item=>clean(item,depth+1));
 if(value&&typeof value==='object')return depth>3?'[truncated]':Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sensitive.test(key)?'[redacted]':clean(item,depth+1)]));
 return value;
};
export const logLine=(level,event,fields={})=>JSON.stringify({level,event,at:new Date().toISOString(),...clean(fields)});
export const log=(level,event,fields)=>(level==='error'?console.error:console.log)(logLine(level,event,fields));
