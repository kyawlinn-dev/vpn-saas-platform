import {formatBusinessDate,formatUsageBytes,daysLeft} from "./businessDisplay";
export function formatMMK(value: number | null | undefined) {
  if(value == null) return "Unavailable";
  return `${new Intl.NumberFormat("en-US").format(Number(value || 0))} MMK`;
}

export function formatDate(value?:string|null) { return formatBusinessDate(value,{dateOnly:true}); }

export function formatBytes(value?:number|null) { return formatUsageBytes(value); }

export function formatUsageGb(value?: number | null) {
  return `${Number(value || 0).toFixed(2)} GB`;
}

export function getStatusColor(status: string) {
  switch (status) {
    case "active":
    case "paid":
      return "success";
    case "pending":
      return "warning";
    case "stopped":
    case "deleted":
    case "unpaid":
      return "default";
    case "overdue":
    case "expired":
      return "error";
    default:
      return "info";
  }
}

export function isExpiringSoon(expiryDate?:string|null,days=7) { const left=daysLeft(expiryDate);return left!=null && left>=0 && left<=days; }

export function getDaysLeft(expiryDate?:string|null) { return daysLeft(expiryDate); }

export function formatDaysLeft(expiryDate?: string | null) {
  const days = getDaysLeft(expiryDate);
  if (days === null) return "-";
  if (days < 0) return "Expired";
  if (days === 0) return "Today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}