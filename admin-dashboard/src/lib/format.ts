export function formatMMK(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0)) + ' MMK';
}

export function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export function formatBytes(value?: number | null) {
  if (!value) return '-';
  const gb = value / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
}

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
