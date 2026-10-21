export function localAccess(request:Request){
 const url=new URL(request.url),host=request.headers.get('host')??'';
 return !process.env.VERCEL&&/^127\.0\.0\.1(?::\d+)?$/.test(host)&&(!request.headers.get('origin')||request.headers.get('origin')===`${url.protocol}//${host}`);
}
