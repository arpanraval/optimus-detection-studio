import React, { useState, useCallback, useMemo } from 'react';
import { ToggleChip } from '../cards/ToggleChip';
import { Icon } from '../../../Icon';
import { TARGET_COUNTRIES, ORIGIN_COUNTRIES } from '../../../../types/environment';

interface CountryStepProps {
  userCountry: string | null;
  threatOriginCountries: string[];
  onSelectCountry: (country: string | null) => void;
  onSelectOrigins: (origins: string[]) => void;
}

export const CountryStep: React.FC<CountryStepProps> = ({
  userCountry,
  threatOriginCountries,
  onSelectCountry,
  onSelectOrigins,
}) => {
  const [countrySearch, setCountrySearch] = useState('');

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return TARGET_COUNTRIES.slice(0, 20);
    const q = countrySearch.toLowerCase();
    return TARGET_COUNTRIES.filter(c => c.toLowerCase().includes(q));
  }, [countrySearch]);

  const toggleOrigin = useCallback((code: string) => {
    if (threatOriginCountries.includes(code)) {
      onSelectOrigins(threatOriginCountries.filter(c => c !== code));
    } else {
      onSelectOrigins([...threatOriginCountries, code]);
    }
  }, [threatOriginCountries, onSelectOrigins]);

  const selectAllOrigins = useCallback(() => {
    if (threatOriginCountries.length === ORIGIN_COUNTRIES.length) {
      onSelectOrigins([]);
    } else {
      onSelectOrigins(ORIGIN_COUNTRIES.map(c => c.code));
    }
  }, [threatOriginCountries, onSelectOrigins]);

  return (
    <div>
      <h2 className="text-lg font-semibold text-on-surface mb-1">Where are you, and who's targeting you?</h2>
      <p className="text-sm text-on-surface-variant mb-6">
        This filters threat intelligence to groups that target your region and originate from specific countries.
      </p>

      {/* Section 1: User's country */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-on-surface mb-3 flex items-center gap-2">
          <Icon name="map-pin" className="w-4 h-4 text-primary" />
          Your Country / Region
        </h3>
        <div className="relative mb-3">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50" />
          <input
            type="text"
            value={countrySearch}
            onChange={e => setCountrySearch(e.target.value)}
            placeholder="Search countries..."
            className="w-full h-10 pl-10 pr-4 rounded-xl text-sm border border-outline-variant/30 bg-transparent text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary/50 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto scrollbar-thin">
          {filteredCountries.map(country => (
            <ToggleChip
              key={country}
              label={country}
              selected={userCountry === country}
              onClick={() => onSelectCountry(userCountry === country ? null : country)}
            />
          ))}
          {filteredCountries.length === 0 && (
            <p className="text-xs text-on-surface-variant/50 py-2">No countries match your search</p>
          )}
        </div>
        {userCountry && !countrySearch && (
          <div className="mt-2 text-xs text-on-surface-variant/70">
            Selected: <span className="text-primary font-medium">{userCountry}</span>
          </div>
        )}
      </div>

      {/* Section 2: Threat origins */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-on-surface flex items-center gap-2">
            <Icon name="crosshair" className="w-4 h-4 text-red-400" />
            Threat Origin Countries
          </h3>
          <button
            onClick={selectAllOrigins}
            className="text-[11px] text-primary hover:text-primary/80 transition-colors"
          >
            {threatOriginCountries.length === ORIGIN_COUNTRIES.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        <p className="text-xs text-on-surface-variant/70 mb-3">
          Filter to threat groups originating from these countries. Leave empty for all origins.
        </p>
        <div className="flex flex-wrap gap-2">
          {ORIGIN_COUNTRIES.map(origin => (
            <ToggleChip
              key={origin.code}
              label={`${origin.name} (${origin.groupCount})`}
              selected={threatOriginCountries.includes(origin.code)}
              onClick={() => toggleOrigin(origin.code)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
