/**
 * Shared country utilities for flag rendering and country code lookup.
 * Single source of truth — used by GroupCard, GroupsLibrary, GroupDetailPage, etc.
 */

const COUNTRY_CODES: Record<string, string> = {
  'China': 'CN', 'Russian Federation': 'RU', 'Russia': 'RU',
  'Iran': 'IR', 'Iran (Islamic Republic of)': 'IR',
  'North Korea': 'KP', 'Korea (Democratic People\'s Republic of)': 'KP',
  'South Korea': 'KR', 'Korea (Republic of)': 'KR',
  'United States': 'US', 'Israel': 'IL', 'United Kingdom': 'GB',
  'Germany': 'DE', 'France': 'FR', 'Japan': 'JP', 'India': 'IN',
  'Pakistan': 'PK', 'Vietnam': 'VN', 'Turkey': 'TR', 'Ukraine': 'UA',
  'Taiwan': 'TW', 'Australia': 'AU', 'Canada': 'CA', 'Brazil': 'BR',
  'Hong Kong': 'HK', 'Singapore': 'SG', 'Malaysia': 'MY',
  'Afghanistan': 'AF', 'Egypt': 'EG', 'Cambodia': 'KH',
  'Lebanon': 'LB', 'Netherlands': 'NL', 'Belgium': 'BE',
  'Switzerland': 'CH', 'Norway': 'NO', 'Sweden': 'SE',
  'Saudi Arabia': 'SA', 'United Arab Emirates': 'AE',
};

/** Get ISO 3166-1 alpha-2 code from country name. Returns null if unknown. */
export function getCountryCode(country: string): string | null {
  if (!country) return null;
  // Already a 2-letter code
  if (country.length === 2 && country === country.toUpperCase()) return country;
  return COUNTRY_CODES[country] || null;
}

/** Get SVG flag URL from a 2-letter country code. */
export function getFlagUrl(countryCode: string): string {
  return `https://flagcdn.com/${countryCode.toLowerCase()}.svg`;
}
