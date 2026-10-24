// The only addresses FORME will keep from marketplace data: plain https, no credentials or port, on Vinted's own domains.
/** A photo address: https on vinted.net or a subdomain. Anything else is dropped. */
export function vintedImageUrl(value){
 try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='vinted.net'||u.hostname.endsWith('.vinted.net')))return u.href;}catch{}
 return undefined;
}
/** A listing page: https://www.vinted.se/items/<id>[-slug]. */
export function vintedItemUrl(value){
 try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname==='www.vinted.se'&&/^\/items\/\d+(?:-|$)/.test(u.pathname))return u.href;}catch{}
 return undefined;
}
