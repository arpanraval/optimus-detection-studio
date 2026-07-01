/* global console */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const previewPath = path.join(__dirname, 'enrichment-output', 'enrichment-preview.json');
const preview = JSON.parse(fs.readFileSync(previewPath, 'utf-8'));

// Generate SQL for all updates
const updates = preview.matches.map(match => {
  const intel = {
    data_source: 'misp_threat_actor_galaxy',
    enriched_at: new Date().toISOString(),
    enrichment_version: '1.0.0',
    match_type: match.matchType,
    match_confidence: match.confidence,
    matched_misp_actor_ids: match.mispActors.map(a => a.uuid),
    origin_country: match.enrichment.originCountry,
    origin_country_code: match.enrichment.originCountryCode,
    target_countries: match.enrichment.targetCountries,
    target_sectors: match.enrichment.targetSectors,
    activity_type: match.enrichment.activityType,
    vendor_names: match.enrichment.vendorNames
  };

  // Escape single quotes for SQL
  const jsonStr = JSON.stringify(intel).replace(/'/g, "''");
  return `SELECT update_targeting_intel('${match.mitreStixId}', '${jsonStr}'::jsonb);`;
});

// Output all updates
console.log(updates.join('\n'));
