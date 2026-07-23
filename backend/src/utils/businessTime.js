export const BUSINESS_TIME_ZONE = "Asia/Bangkok";

const BANGKOK_UTC_OFFSET_HOURS = 7;

export function businessDateOnly(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function currentBusinessMonth(date = new Date()) {
  return businessDateOnly(date).slice(0, 7);
}

export function addDaysToDateOnly(dateOnly, days) {
  const match = String(dateOnly || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const amount = Number(days);
  if (!match || !Number.isFinite(amount)) return null;

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
  date.setUTCDate(date.getUTCDate() + Math.trunc(amount));
  return date.toISOString().slice(0, 10);
}

export function parseBusinessMonth(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  const start = new Date(Date.UTC(year, month - 1, 1, -BANGKOK_UTC_OFFSET_HOURS));
  const end = new Date(Date.UTC(year, month, 1, -BANGKOK_UTC_OFFSET_HOURS));
  return {
    month: `${year}-${String(month).padStart(2, "0")}`,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}
