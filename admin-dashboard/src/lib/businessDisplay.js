const ZONE = 'Asia/Bangkok';
export function formatUsageBytes(bytes, locale='en-US') {
 if(bytes == null || !Number.isFinite(Number(bytes)) || Number(bytes)<0) return 'Usage unavailable';
 const gb=Number(bytes)/1024**3;
 return gb === 0 ? '0 GB' : gb < 0.01 ? '<0.01 GB' : new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(gb)+' GB';
}
export function formatBusinessDate(value,{locale='en-US',dateOnly=false}={}) {
 if(!value) return 'Unavailable';
 const isDay=/^\d{4}-\d{2}-\d{2}$/.test(value);
 const date=new Date(isDay ? value+'T00:00:00+07:00' : value);
 if(!Number.isFinite(date.getTime())) return 'Unavailable';
 return new Intl.DateTimeFormat(locale,{timeZone:ZONE,year:'numeric',month:'short',day:'numeric',...(!dateOnly && !isDay ? {hour:'2-digit',minute:'2-digit'} : {})}).format(date);
}
export function businessMonth(now=new Date()) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit'}).formatToParts(now);
 return parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
}
export function businessDay(now=new Date()) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
}
export function expiryCutoffAt(value) {
 const metadata=typeof value==='object' ? value?.business_summary?.expiry_cutoff_at : null;
 if(typeof metadata==='string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(metadata)) {
  const timestamp=Date.parse(metadata);
  if(Number.isFinite(timestamp))return new Date(timestamp).toISOString();
 }
 const day=typeof value==='object' ? value?.expiry_date : value;
 if(typeof day!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
 const timestamp=Date.parse(day+'T00:00:00Z');
 if(!Number.isFinite(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==day)return null;
 // Stored day D ends at D+1 04:00 Myanmar, or D 21:30 UTC.
 return new Date(timestamp+(21*60+30)*60000).toISOString();
}
export function formatExpiryDeadline(value,{locale='en-US',timeZoneLabel='Myanmar'}={}) {
 const cutoff=expiryCutoffAt(value);
 if(!cutoff)return 'Unavailable';
 const date=new Date(cutoff);
 const day=new Intl.DateTimeFormat(locale,{timeZone:'Asia/Yangon',year:'numeric',month:'short',day:'numeric'}).format(date);
 const time=new Intl.DateTimeFormat(locale,{timeZone:'Asia/Yangon',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
 return day+', '+time+' '+timeZoneLabel;
}
export function daysLeft(value,now=new Date()) {
 const cutoff=expiryCutoffAt(value);
 if(!cutoff || !Number.isFinite(now.getTime()))return null;
 const remaining=Date.parse(cutoff)-now.getTime();
 return remaining<=0 ? -1 : Math.floor(remaining/86400000);
}
export function quotaDisplay(quota) {
 if(!quota || (quota.is_unlimited!==true && (quota.limit_bytes==null || Number(quota.limit_bytes)<=0))) return {kind:'unknown',used:'Usage unavailable',total:'Unavailable',remaining:'Unavailable',percent:null};
 const used=formatUsageBytes(quota.used_bytes);
 if(quota.is_unlimited===true)return {kind:'unlimited',used,total:'Unlimited',remaining:'Unlimited',percent:null};
 return {kind:'finite',used,total:formatUsageBytes(quota.limit_bytes),remaining:formatUsageBytes(quota.remaining_bytes),percent:quota.used_bytes==null?null:Math.max(0,Math.min(100,Number(quota.used_bytes)/Number(quota.limit_bytes)*100))};
}
export function statusLabels(summary) {
 const access={active:'Active',pending:'Not started',queued:'Queued',stopped:'Stopped',expired:'Expired'};
 const review={unpaid:'Awaiting payment',awaiting_review:'Awaiting review',confirmed:'Confirmed',rejected:'Rejected',mixed:'Multiple payment states',no_payment_required:'No payment required'};
 const application={pending:'Recording pending',applied:'Recorded',failed:'Recording failed',reversed:'Reversed',mixed:'Multiple recording states'};
 return {access:access[summary?.access_status]||'Unavailable',review:review[summary?.payment_review_status]||'Unavailable',application:application[summary?.application_status]||'Unavailable'};
}
