import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CatalogPrice, QuotePrice, ProviderOptions, ProviderReadinessSummary, providerName, providerReason } from './presentation';
import type { CatalogPlan, OperationQuote, OperatorVerifiedHourlyBilling, ProviderOption } from './api';

afterEach(cleanup);
const billing: OperatorVerifiedHourlyBilling = {
  kind: 'operator_verified_hourly', hourly: 0.012, monthlyEstimate: 7.71,
  referenceHours: 642.5, currency: 'USD', verifiedAt: '2026-11-01T00:00:00Z', source: 'LightNode console / operator record',
};
const price: NonNullable<OperationQuote['price']> = {
  provider: 'lightnode', region: 'tokyo', planId: 'fixture-plan', recurringAmount: 7.71, currency: 'USD',
  trafficTerms: { included: 1000, unit: 'GB', overageAmount: null, billing },
};
const catalogPrice: CatalogPlan['price'] = { monthly: 7.71, hourly: 0.012, currency: 'USD', billing };

describe('LightNode presentation contract', () => {
  it('includes LightNode as a typed provider option and disables it when unready', () => {
    const option: ProviderOption = { id: 'lightnode', regions: [] };
    expect(providerName(option.id)).toBe('LightNode');
    render(<select><ProviderOptions readiness={[
      { id: 'digitalocean', ready: true, reason: null, profiles: ['dual'] },
      { id: 'lightnode', ready: false, reason: 'PROVIDER_PRICE_UNVERIFIED', profiles: [] },
    ]} /></select>);
    expect((screen.getByRole('option', { name: 'LightNode' }) as HTMLOptionElement).disabled).toBe(true);
    expect((screen.getByRole('option', { name: 'DigitalOcean' }) as HTMLOptionElement).disabled).toBe(false);
  });
  it('labels quote billing as hourly with a monthly estimate and operator provenance', () => {
    render(<QuotePrice price={price} />);
    expect(screen.getByText('0.012 USD / hour')).toBeTruthy();
    expect(screen.getByText(/7.71 USD.*monthly estimate/)).toBeTruthy();
    expect(screen.getByText('Console estimate; billing follows provider terms.')).toBeTruthy();
    expect(screen.queryByText(/not a monthly cap/)).toBeNull();
    expect(screen.getByText(/Operator-verified/)).toBeTruthy();
    expect(screen.getByText(/LightNode console \/ operator record/)).toBeTruthy();
    expect(screen.getByText(/642.5 reference hours/)).toBeTruthy();
    expect(screen.getByText('2026-11-01T00:00:00Z').tagName).toBe('TIME');
    expect(screen.queryByText(/API.verified/i)).toBeNull();
    expect(screen.queryByText('7.71 USD / month')).toBeNull();
  });
  it('uses the same optional evidence for catalogue display', () => {
    render(<CatalogPrice provider="lightnode" price={catalogPrice} />);
    expect(screen.getByText('0.012 USD / hour')).toBeTruthy();
    expect(screen.getByText(/7.71 USD.*monthly estimate/)).toBeTruthy();
  });
  it('never infers LightNode pricing from recurring/monthly/hourly legacy numbers', () => {
    render(<><QuotePrice price={{ ...price, trafficTerms: { ...price.trafficTerms, billing: undefined } }} />
      <CatalogPrice provider="lightnode" price={{ ...catalogPrice, billing: undefined }} /></>);
    expect(screen.getAllByText('Provider pricing applies')).toHaveLength(2);
    expect(screen.queryByText(/7.71/)).toBeNull();
    expect(screen.queryByText(/0.012/)).toBeNull();
  });
  it.each([
    { hourly: NaN }, { hourly: -1 }, { hourly: 0 }, { monthlyEstimate: 0 }, { monthlyEstimate: null }, { source: '' },
    { verifiedAt: 'invalid' }, { referenceHours: 0 }, { currency: '' }, { kind: 'api_verified' },
  ])('does not display incomplete or malformed historical rates %j', invalid => {
    render(<QuotePrice price={{ ...price, trafficTerms: { ...price.trafficTerms, billing: { ...billing, ...invalid } as OperatorVerifiedHourlyBilling } }} />);
    expect(screen.getByText('Provider pricing applies')).toBeTruthy();
    expect(screen.queryByText(/monthly estimate/)).toBeNull();
  });
  it('keeps DO/Vultr quote and catalogue labels unchanged', () => {
    for (const provider of ['digitalocean', 'vultr'] as const) {
      const view = render(<><QuotePrice price={{ ...price, provider, recurringAmount: 12 }} />
        <CatalogPrice provider={provider} price={{ monthly: 12, hourly: 0.018, currency: 'USD' }} /></>);
      expect(screen.getAllByText('12.00 USD / month')).toHaveLength(2);
      expect(screen.getByText('0.018 USD / hour')).toBeTruthy();
      expect(screen.queryByText(/estimate/)).toBeNull();
      view.unmount();
    }
  });
  it('does not invent unknown catalogue prices', () => {
    render(<CatalogPrice provider="vultr" price={{ monthly: null, hourly: null, currency: null }} />);
    expect(screen.getByText('Price unavailable')).toBeTruthy();
    expect(screen.queryByText(/0.00/)).toBeNull();
  });
  it('displays provider pricing for nullable LightNode quote and catalogue rates', () => {
    const providerBilling = { kind: 'provider_pricing' as const, source: 'https://doc.lightnode.com/Instance/Billingdescription.html' };
    render(<><QuotePrice price={{ ...price, recurringAmount: null, trafficTerms: { ...price.trafficTerms, billing: providerBilling } }} />
      <CatalogPrice provider="lightnode" price={{ monthly: null, hourly: null, currency: 'USD', billing: providerBilling }} /></>);
    expect(screen.getAllByText('Provider pricing applies')).toHaveLength(2);
    expect(screen.getAllByText('Rates are not returned by the API.')).toHaveLength(2);
    expect(screen.queryByText(/verification required|0\.00|free|monthly estimate/i)).toBeNull();
  });
  it.each(['digitalocean', 'vultr'])('guards a missing %s quote rate without inventing zero', provider => {
    render(<QuotePrice price={{ ...price, provider, recurringAmount: null }} />);
    expect(screen.getByText('Price unavailable')).toBeTruthy();
    expect(screen.queryByText(/0\.00|Provider pricing applies/)).toBeNull();
  });
  it.each([
    ['PROVIDER_PRICE_UNVERIFIED', /operator verification/i],
    ['PROVIDER_PRICE_STALE', /out of date/i],
    ['PROVIDER_ACCOUNT_UNVERIFIED', /operator attestation/i],
    ['LIGHTNODE_BOOTSTRAP_POLICY_REQUIRED', /first.contact SSH trust/i],
    ['NODE_SECURITY_CONFIGURATION_REQUIRED', /first.contact SSH trust/i],
    ['NODE_BOOTSTRAP_PENDING', /bootstrap.*pending/i],
  ])('explains safe readiness code %s', (code, expected) => expect(providerReason(code)).toMatch(expected));
  it('does not echo unknown backend reasons', () => {
    expect(providerReason('private/token/value')).toBe('Unavailable');
    expect(providerReason('constructor')).toBe('Unavailable');
  });
  it('renders readable LightNode readiness alongside ready existing providers', () => {
    render(<ProviderReadinessSummary readiness={[
      { id: 'lightnode', ready: false, reason: 'PROVIDER_PRICE_UNVERIFIED', profiles: [] },
      { id: 'vultr', ready: true, reason: null, profiles: ['vless_only'] },
    ]} />);
    expect(screen.getByText('LightNode: Price requires operator verification.')).toBeTruthy();
    expect(screen.getByText('Vultr: Ready')).toBeTruthy();
  });
});
