import type { CatalogPlan, OperationQuote, OperatorVerifiedHourlyBilling, ProviderBilling, ProviderId, ProviderReadiness } from './api';

export const providers: ProviderId[] = ['digitalocean', 'vultr', 'lightnode'];
export const providerName = (id: ProviderId) => ({ digitalocean: 'DigitalOcean', vultr: 'Vultr', lightnode: 'LightNode' })[id];
const reasons: Record<string, string> = {
  PROVIDER_PRICE_UNVERIFIED: 'Price requires operator verification.',
  PROVIDER_PRICE_STALE: 'Operator price verification is out of date.',
  PROVIDER_ACCOUNT_UNVERIFIED: 'Account requires operator attestation and immutable instance verification.',
  PROVIDER_ACCOUNT_NOT_REGISTERED: 'Provider account is not registered.',
  PROVIDER_ACCOUNT_MISMATCH: 'Provider account evidence changed. Operator re-attestation is required.',
  LIGHTNODE_BOOTSTRAP_POLICY_REQUIRED: 'Operator must enable first-contact SSH trust and password-to-key bootstrap.',
  NODE_SECURITY_CONFIGURATION_REQUIRED: 'SSH security configuration is required, including first-contact SSH trust for LightNode.',
  NODE_BOOTSTRAP_PENDING: 'SSH bootstrap is pending. Resume the existing operation.',
  PROVIDER_CONFIGURATION_REQUIRED: 'Provider configuration is required.',
  PROVIDER_NOT_CONFIGURED: 'Provider configuration is required.',
};
export const providerReason = (reason: string | null | undefined) =>
  reason && Object.prototype.hasOwnProperty.call(reasons, reason) ? reasons[reason] : 'Unavailable';

/** Options remain controlled by the dialog; unready providers cannot be selected. */
export function ProviderOptions({ readiness }: { readiness: ProviderReadiness[] }) {
  return <>{readiness.map(p => <option key={p.id} value={p.id} disabled={!p.ready}>{providerName(p.id)}</option>)}</>;
}

export function ProviderReadinessSummary({ readiness }: { readiness: ProviderReadiness[] }) {
  return <div className="space-y-1 text-xs" aria-label="Provider readiness">{readiness.map(p =>
    <p key={p.id} className="break-words">{providerName(p.id)}: {p.ready ? 'Ready' : providerReason(p.reason)}</p>)}</div>;
}

function validBilling(billing: ProviderBilling | undefined): billing is OperatorVerifiedHourlyBilling {
  return Boolean(billing && billing.kind === 'operator_verified_hourly'
    && Number.isFinite(billing.hourly) && billing.hourly > 0
    && Number.isFinite(billing.monthlyEstimate) && billing.monthlyEstimate > 0
    && Number.isFinite(billing.referenceHours) && billing.referenceHours > 0
    && typeof billing.currency === 'string' && /^[A-Z]{3}$/.test(billing.currency)
    && typeof billing.verifiedAt === 'string' && Number.isFinite(Date.parse(billing.verifiedAt))
    && typeof billing.source === 'string' && billing.source.trim());
}

function LightNodePrice({ billing }: { billing?: ProviderBilling }) {
  if (!validBilling(billing)) return <>
    <p>Provider pricing applies</p>
    <p className="text-xs text-muted-foreground">Rates are not returned by the API.</p>
  </>;
  return <>
    <p>{billing.hourly} {billing.currency} / hour</p>
    <p>{billing.monthlyEstimate.toFixed(2)} {billing.currency} monthly estimate.</p>
    <p className="text-xs text-muted-foreground">Console estimate; billing follows provider terms.</p>
    <p className="break-words text-xs text-muted-foreground">Operator-verified price. Source: {billing.source}</p>
    <p className="text-xs text-muted-foreground">Verified <time dateTime={billing.verifiedAt}>{billing.verifiedAt}</time>; {billing.referenceHours} reference hours.</p>
  </>;
}

export function CatalogPrice({ provider, price }: { provider: ProviderId; price: CatalogPlan['price'] }) {
  if (provider === 'lightnode') return <LightNodePrice billing={price.billing} />;
  return <>
    <p>{price.monthly == null ? 'Price unavailable' : `${price.monthly.toFixed(2)} ${price.currency || 'Unknown currency'} / month`}</p>
    {price.hourly != null && <p>{price.hourly} {price.currency || 'Unknown currency'} / hour</p>}
  </>;
}

export function QuotePrice({ price }: { price: NonNullable<OperationQuote['price']> }) {
  if (price.provider === 'lightnode') return <LightNodePrice billing={price.trafficTerms.billing} />;
  if (price.recurringAmount == null) return <p>Price unavailable</p>;
  return <p className="text-lg font-semibold">{price.recurringAmount.toFixed(2)} {price.currency} / month</p>;
}
