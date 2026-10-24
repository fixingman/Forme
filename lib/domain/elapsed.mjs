// Compact "time since" text for the top-bar refresh control. It counts up: seconds under a minute, then minutes, hours, days.
export function elapsedLabel(ms){
 const s=Math.floor(Math.max(0,ms)/1000);
 if(s<60)return `${s}s`;
 const m=Math.floor(s/60);if(m<60)return `${m}m`;
 const h=Math.floor(m/60);if(h<24)return `${h}h`;
 return `${Math.floor(h/24)}d`;
}
/** The same elapsed time in words, for screen readers and tooltips. */
export function elapsedWords(ms){
 const s=Math.floor(Math.max(0,ms)/1000);
 if(s<5)return 'just now';
 const unit=(n,name)=>`${n} ${name}${n===1?'':'s'} ago`;
 if(s<60)return unit(s,'second');
 const m=Math.floor(s/60);if(m<60)return unit(m,'minute');
 const h=Math.floor(m/60);if(h<24)return unit(h,'hour');
 return unit(Math.floor(h/24),'day');
}
/** How long to wait before the label can next change, so the display stays exact without waking the page needlessly. */
export function nextTickMs(ms){
 const s=Math.floor(Math.max(0,ms)/1000);
 if(s<60)return 1000-(Math.max(0,ms)%1000)||1000;
 const unit=s<3600?60:s<86400?3600:86400;
 return Math.max(1,(unit-(s%unit))*1000-(Math.max(0,ms)%1000));
}
