import { describe, expect, it } from 'vitest';
import { serverDisplay, countryFlag, subscriptionServerName, panelDisplayNames, provisioningLocation } from '../services/serverDisplay.js';

describe('consistent server display', () => {
  it('keeps the familiar ordinal instead of replacing it with its city', () => {
    expect(serverDisplay({ name: 'Singapore #4', region: 'sgp1', display_city: 'Singapore' }))
      .toMatchObject({ name: 'Singapore #4', city: 'Singapore', country: 'Singapore', flag: '🇸🇬', number: 4 });
  });
  it('resolves Vultr regions and never leaks a provider resource ID', () => {
    expect(serverDisplay({ name: 'NovaNet fra b33396f0-c391-4dad-81fc-9f13da209e1c', region: 'fra' }))
      .toMatchObject({ name: 'Frankfurt', city: 'Frankfurt', country: 'Germany', flag: '🇩🇪' });
    expect(serverDisplay({ region: 'sgp' }).flag).toBe('🇸🇬');
  });
  it('preserves custom names and supports metadata for a new provider region', () => {
    expect(serverDisplay({ name: 'Seoul #2', region: 'new-region', display_city: 'Seoul', display_country: 'South Korea', region_code: 'KR' }))
      .toMatchObject({ name: 'Seoul #2', flag: '🇰🇷' });
    expect(serverDisplay({ name: 'Singapore Trial', region: 'sgp1' }).name).toBe('Singapore Trial');
    expect(serverDisplay({ name: 'nn-development-123', region: 'unknown' }).name).toBe('Server');
  });
  it('makes the first emoji the country flag and separates private panel labels from public names', () => {
    const server = { name: 'Tokyo #1', region: 'nrt', environment: 'development' };
    expect(subscriptionServerName(server)).toBe('🇯🇵 Tokyo #1');
    expect(panelDisplayNames(server)).toEqual({ node: 'DEV · Tokyo #1', ss: 'DEV · SS · Tokyo #1', verification: 'DEV · Verification · Tokyo #1' });
    expect(countryFlag('de')).toBe('🇩🇪');
    expect(countryFlag('invalid')).toBeNull();
  });
  it('derives country codes for DO facilities and normalizes new Vultr region metadata', () => {
    expect(provisioningLocation({ provider: 'digitalocean', region: 'sfo2', metadata: { name: 'San Francisco 2' } }))
      .toMatchObject({ city: 'San Francisco', country: 'United States', countryCode: 'US', flag: '🇺🇸' });
    expect(provisioningLocation({ provider: 'vultr', region: 'waw', metadata: { city: 'Warsaw', country: 'pl' } }))
      .toMatchObject({ city: 'Warsaw', country: 'Poland', countryCode: 'PL', flag: '🇵🇱' });
  });
});
