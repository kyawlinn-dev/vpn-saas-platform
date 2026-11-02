import { getRegionLocation } from '../constants/doRegions.js';

export function countryFlag(code) {
  const value = String(code || '').toUpperCase();
  return /^[A-Z]{2}$/.test(value) ? String.fromCodePoint(...[...value].map(char => 0x1f1e6 + char.charCodeAt(0) - 65)) : null;
}

export function serverDisplay(server = {}) {
  const location = getRegionLocation(server.region);
  const city = server.display_city || location?.city || null;
  const country = server.display_country || location?.country || null;
  const rawName = String(server.name || '').trim();
  const technical = /^(?:nn-(?:development|production)-|NovaNet\s+[a-z0-9_-]+\s+[a-f0-9-]+$)/i.test(rawName) ||
    /^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(rawName);
  const name = (!technical && rawName) || city || 'Server';
  const ordinal = name.match(/ #([1-9][0-9]*)$/);
  return { name, city: city || name, country, number: ordinal ? Number(ordinal[1]) : null,
    flag: countryFlag(server.region_code) || location?.flag || server.flag_emoji || '🌐' };
}

export const subscriptionServerName = server => {
  const display = serverDisplay(server);
  return `${display.flag} ${display.name}`;
};

export function panelDisplayNames(server) {
  const prefix = server.environment === 'development' ? 'DEV · ' : '';
  const { name } = serverDisplay(server);
  return { node: `${prefix}${name}`, ss: `${prefix}SS · ${name}`, verification: `${prefix}Verification · ${name}` };
}

export function provisioningLocation({ provider, region, metadata }) {
  const known = getRegionLocation(region);
  const regionalIndicators = [...(known?.flag || '')];
  const knownCode = regionalIndicators.length === 2 ? regionalIndicators.map(char => String.fromCharCode(char.codePointAt(0) - 0x1f1e6 + 65)).join('') : null;
  const code = ['vultr','lightnode'].includes(provider) ? String(metadata?.country || knownCode || '').toUpperCase() || null : knownCode;
  const country = code && /^[A-Z]{2}$/.test(code) ? new Intl.DisplayNames(['en'], { type: 'region' }).of(code) : known?.country;
  return { city: (known?.city || metadata?.city || metadata?.name || 'Server').replace(/\s+\d+$/, ''),
    country: country || null, flag: countryFlag(code) || known?.flag || null, countryCode: code || null };
}
