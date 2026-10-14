import {formatBusinessDate} from "./businessDisplay";
export function formatDate(value) { return formatBusinessDate(value,{dateOnly:true}); }

const MYANMAR_DIGITS = ["၀", "၁", "၂", "၃", "၄", "၅", "၆", "၇", "၈", "၉"];

export function formatNumber(value, language = "EN", options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";

  if (language === "MM") {
    return String(number).replace(/\d/g, (digit) => MYANMAR_DIGITS[Number(digit)]);
  }

  return number.toLocaleString("en-US", options);
}

export function formatCurrencyMmk(value, language = "EN") {
  if (value == null || Number.isNaN(Number(value))) return "-";
  if (language === "MM") {
    return `${formatNumber(value, language)} ကျပ်`;
  }
  return `${Number(value).toLocaleString("en-US")} MMK`;
}
