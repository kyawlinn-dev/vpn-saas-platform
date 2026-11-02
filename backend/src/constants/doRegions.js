export const DO_REGIONS = [
  { slug: 'sgp1', country: 'Singapore',      city: 'Singapore',     flag: '🇸🇬', area: 'Asia Pacific'  },
  { slug: 'blr1', country: 'India',          city: 'Bangalore',     flag: '🇮🇳', area: 'Asia Pacific'  },
  { slug: 'syd1', country: 'Australia',      city: 'Sydney',        flag: '🇦🇺', area: 'Asia Pacific'  },
  { slug: 'nyc1', country: 'United States',  city: 'New York',      flag: '🇺🇸', area: 'North America' },
  { slug: 'nyc3', country: 'United States',  city: 'New York 3',    flag: '🇺🇸', area: 'North America' },
  { slug: 'sfo3', country: 'United States',  city: 'San Francisco', flag: '🇺🇸', area: 'North America' },
  { slug: 'tor1', country: 'Canada',         city: 'Toronto',       flag: '🇨🇦', area: 'North America' },
  { slug: 'lon1', country: 'United Kingdom', city: 'London',        flag: '🇬🇧', area: 'Europe'        },
  { slug: 'fra1', country: 'Germany',        city: 'Frankfurt',     flag: '🇩🇪', area: 'Europe'        },
  { slug: 'ams3', country: 'Netherlands',    city: 'Amsterdam',     flag: '🇳🇱', area: 'Europe'        },
];

export const DO_REGION_MAP = Object.fromEntries(DO_REGIONS.map((r) => [r.slug, r]));

// Legacy callers share this resolver; Vultr region codes must resolve identically.
const REGION_ALIASES = {
  sgp: 'sgp1', fra: 'fra1', ams: 'ams3', syd: 'syd1', lhr: 'lon1',
  sfo: 'sfo3', nyc: 'nyc1', tor: 'tor1', blr: 'blr1', lon: 'lon1',
};
const OTHER_LOCATIONS = {
  nrt: { city: 'Tokyo', country: 'Japan', flag: '🇯🇵' },
  icn: { city: 'Seoul', country: 'South Korea', flag: '🇰🇷' },
  lax: { city: 'Los Angeles', country: 'United States', flag: '🇺🇸' },
  bom: { city: 'Mumbai', country: 'India', flag: '🇮🇳' },
  del: { city: 'Delhi', country: 'India', flag: '🇮🇳' },
  atl: { city: 'Atlanta', country: 'United States', flag: '🇺🇸' },
};

export function getRegionLocation(regionSlug) {
  const slug = String(regionSlug || "").toLowerCase().trim();
  const cityCode = slug.replace(/\d+$/, '');
  return DO_REGION_MAP[slug] ?? DO_REGION_MAP[REGION_ALIASES[cityCode]] ?? OTHER_LOCATIONS[cityCode] ?? null;
}
