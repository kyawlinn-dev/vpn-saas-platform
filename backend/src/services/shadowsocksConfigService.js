import { fetchSubscriptionConfigs } from "./marzneshinService.js";
import { parseSsUrl } from "../utils/parseSsUrl.js";

export async function resolveShadowsocksConfig(accessUrl, fetchConfigs = fetchSubscriptionConfigs) {
  if (typeof accessUrl !== "string") return null;
  const url = accessUrl.trim();
  if (url.startsWith("ss://")) return parseSsUrl(url);
  if (!/^https?:\/\//i.test(url)) return null;
  const configs = await fetchConfigs(url);
  return configs.ss;
}
