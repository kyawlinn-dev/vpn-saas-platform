export const LIGHTNODE_BILLING_SOURCE='https://doc.lightnode.com/Instance/Billingdescription.html';
export function providerPricingBilling(value) {
  return value?.kind==='provider_pricing'&&value.source===LIGHTNODE_BILLING_SOURCE
    ?{kind:'provider_pricing',source:LIGHTNODE_BILLING_SOURCE}:null;
}
/** Only LightNode exposes specifications without monetary prices. Null is not free. */
export function isProviderPricedQuote(provider,value) {
  return provider==='lightnode'&&value?.recurringAmount===null&&value.currency==='USD'&&
    providerPricingBilling(value.trafficTerms?.billing)!==null;
}
