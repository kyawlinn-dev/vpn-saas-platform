export function runnerSubscriptionConfig(env) {
  const value=env.PUBLIC_SUBSCRIPTION_BASE_URL || env.WEBHOOK_BASE_URL;
  let url;
  try {url=new URL(value);}catch {throw new Error('RUNNER_SUBSCRIPTION_CONFIGURATION_REQUIRED');}
  if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash)
    throw new Error('RUNNER_SUBSCRIPTION_CONFIGURATION_REQUIRED');
  return {PUBLIC_SUBSCRIPTION_BASE_URL:value};
}
