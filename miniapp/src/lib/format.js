export function formatDate(value) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

export function formatCurrencyMmk(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toLocaleString()} MMK`;
}