export function normalizeNullableString(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

export function normalizeRequiredString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

/**
 * Normalizes a payment_status value to one of the accepted enum values.
 * Returns null for unrecognized values instead of silently defaulting —
 * callers should decide their own fallback (e.g. keep existing value or use "pending").
 */
export function normalizePaymentStatus(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  const valid = ["pending", "unpaid", "paid", "overdue", "refunded"];
  return valid.includes(normalized) ? normalized : null;
}