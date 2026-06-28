export function formatMMK(value: number | null | undefined) {
  return `${new Intl.NumberFormat("en-US").format(Number(value || 0))} MMK`;
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export function formatBytes(value?: number | null) {
  if (!value) return "-";
  const gb = value / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
}

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

export function isExpiringSoon(expiryDate?: string | null, days = 7) {
  if (!expiryDate) return false;

  const now = new Date();
  const expiry = new Date(expiryDate);

  if (Number.isNaN(expiry.getTime())) return false;

  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays >= 0 && diffDays <= days;
}

export function getDaysLeft(expiryDate?: string | null) {
  if (!expiryDate) return null;
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return null;

  const diffMs = expiry.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function formatDaysLeft(expiryDate?: string | null) {
  const days = getDaysLeft(expiryDate);
  if (days === null) return "-";
  if (days < 0) return "Expired";
  if (days === 0) return "Today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}