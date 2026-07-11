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

export function getRegionLocation(regionSlug) {
  return DO_REGION_MAP[String(regionSlug || "").toLowerCase().trim()] ?? null;
}
