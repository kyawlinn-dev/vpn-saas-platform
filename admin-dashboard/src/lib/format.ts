import {formatBusinessDate,formatUsageBytes,daysLeft} from "./businessDisplay";
export function formatMMK(value: number | null | undefined) {
  if(value == null) return "Unavailable";
  return new Intl.NumberFormat('en-US').format(Number(value || 0)) + ' MMK';
}

export function formatDate(value?:string|null) { return formatBusinessDate(value,{dateOnly:true}); }

export function formatDateTime(value?:string|null) { return formatBusinessDate(value); }

export function formatBytes(value?:number|null) { return formatUsageBytes(value); }

export function getStatusColor(status: string) {
  switch (status) {
    case 'active':
    case 'paid':
      return 'success';
    case 'pending':
      return 'warning';
    case 'stopped':
    case 'deleted':
    case 'unpaid':
      return 'default';
    case 'overdue':
    case 'expired':
      return 'error';
    default:
      return 'info';
  }
}
