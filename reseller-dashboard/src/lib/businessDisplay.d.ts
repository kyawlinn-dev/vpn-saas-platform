import type {BusinessSummary,OrderQuota} from '../types/api';
export function formatUsageBytes(bytes:number|null|undefined,locale?:string):string;
export function formatBusinessDate(value?:string|null,options?:{locale?:string,dateOnly?:boolean}):string;
export function businessMonth(now?:Date):string;
export function businessDay(now?:Date):string;
export function daysLeft(value?:string|null,now?:Date):number|null;
export function quotaDisplay(quota?:OrderQuota|null):{kind:'finite'|'unlimited'|'unknown',used:string,total:string,remaining:string,percent:number|null};
export function statusLabels(summary?:Partial<BusinessSummary>|null):{access:string,review:string,application:string};
