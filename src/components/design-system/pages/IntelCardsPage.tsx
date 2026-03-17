import React, { useState } from 'react';
import { DesignSystemPage, Section } from '../shared';
import { Icon } from '../../Icon';

// =============================================================================
// INTEL CARDS — REDESIGN OPTIONS v3
// =============================================================================
// Information hierarchy is king. Each card type has different data priorities:
//
// GROUP:    Name → Origin → Aliases → Targets → Sectors → Stats
// CAMPAIGN: Name → Attribution (WHO) → Active? → Timeline → Techniques → Description
// SOFTWARE: Name → Type (malware/tool) → Platforms → Stats → Description
//
// Two design options that preserve these hierarchies while improving visuals.
// Cards are entity-specific — not forced into the same template.

// ─── Semantic Colors ─────────────────────────────────────────────────────────
// Same palette as MITRE tooltip — proven to work in our dark/light modes.

const THREAT_RED = '#A63D40';
const TOOL_AMBER = '#D97706';
const CAMPAIGN_SKY = '#0EA5E9';
// Option D uses a different color scheme:
const GROUP_MAGENTA = '#783264';
const CAMPAIGN_YELLOW = '#EAB308';
const SOFTWARE_RED = '#A63D40';

// ─── Mock Data ───────────────────────────────────────────────────────────────

const mockGroup = {
  mitre_id: 'G0007', name: 'APT28', origin_country: 'Russia',
  aliases: ['Fancy Bear', 'Sofacy', 'Pawn Storm', 'Sednit', 'Tsar Team', 'STRONTIUM'],
  target_countries: ['United States', 'Germany', 'Ukraine', 'France', 'Poland', 'Georgia', 'Netherlands', 'Norway'],
  target_sectors: ['Government', 'Defense', 'Energy', 'Media', 'Aerospace'],
  technique_count: 72, software_count: 18, campaign_count: 5,
};

const mockCampaign = {
  mitre_id: 'C0026', name: 'Operation Dream Job',
  aliases: ['Dream Job', 'NukeSped Campaign'],
  first_seen: 'Mar 2020', last_seen: 'Jan 2024', duration: '3y 10m',
  attributed_group: { name: 'Lazarus Group', mitre_id: 'G0032' },
  technique_count: 42, recent: true,
  description: 'North Korean state-sponsored actors targeting defense, aerospace, and government organizations through fake job recruitment campaigns.',
};

const mockCampaignUnattributed = {
  mitre_id: 'C0015', name: 'C0015',
  aliases: [],
  first_seen: 'Jan 2021', last_seen: 'Jun 2021', duration: '5m',
  attributed_group: null as null | { name: string; mitre_id: string },
  technique_count: 12, recent: false,
  description: 'A campaign that involved the use of SUNBURST and other malware to compromise multiple organizations.',
};

const mockMalware = {
  mitre_id: 'S0002', name: 'Mimikatz', software_type: 'malware' as const,
  aliases: ['sekurlsa', 'gentilkiwi'], platforms: ['Windows'],
  technique_count: 24, group_count: 42,
  description: 'Credential dumping tool that extracts plaintext passwords, hashes, PIN codes, and Kerberos tickets from memory.',
};

const mockTool = {
  mitre_id: 'S0154', name: 'Cobalt Strike', software_type: 'tool' as const,
  aliases: ['CobaltStrike', 'Agentemis', 'BEACON'], platforms: ['Windows', 'Linux', 'macOS'],
  technique_count: 56, group_count: 38,
  description: 'Commercial adversary simulation tool widely used by red teams and threat actors for post-exploitation.',
};

type MockSoftware = { mitre_id: string; name: string; software_type: 'malware' | 'tool'; aliases: string[]; platforms: string[]; technique_count: number; group_count: number; description: string; };
type MockCampaign = typeof mockCampaign;

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION A
// Clean sections, top gradient accent per entity color, Orbitron headings,
// tooltip-style section headers. Each card shaped by its own data needs.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Group Card A ─────────────────────────────────────────────────────────────
// Priority: Name huge → origin right next to it → aliases for recognition →
// targets as danger pills → sectors → stats anchored at bottom
const A_Group: React.FC = () => (
  <div className="rounded-xl overflow-hidden bg-background shadow-2xl shadow-black/60 hover:shadow-black/80 transition-all cursor-pointer flex flex-col">
    <div className="h-[2px]" style={{ background: `linear-gradient(to right, transparent, ${THREAT_RED}, transparent)` }} />

    {/* Identity block — name is dominant, origin is immediate context */}
    <div className="px-4 pt-4 pb-1">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-brand text-[11px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ color: THREAT_RED, backgroundColor: `${THREAT_RED}15` }}>
          {mockGroup.mitre_id}
        </span>
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container-high text-[11px] text-on-surface-variant font-medium">
          🇷🇺 {mockGroup.origin_country}
        </span>
      </div>
      <h3 className="font-brand text-xl font-bold text-on-surface leading-tight tracking-wide mb-2">
        {mockGroup.name}
      </h3>
      {/* Aliases — immediate recognition */}
      <div className="flex flex-wrap gap-1.5 mb-1">
        {mockGroup.aliases.slice(0, 3).map(a => (
          <span key={a} className="px-2 py-0.5 bg-surface-container-high text-on-surface-variant text-[11px] rounded">{a}</span>
        ))}
        {mockGroup.aliases.length > 3 && (
          <span className="px-2 py-0.5 bg-surface-container-high text-on-surface-variant/50 text-[11px] rounded">+{mockGroup.aliases.length - 3}</span>
        )}
      </div>
    </div>

    {/* Targets — this is the "danger zone", visually distinct */}
    <div className="px-4 py-2.5 bg-surface-container-lowest/50 mt-1">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="crosshairs" className="w-3.5 h-3.5" style={{ color: THREAT_RED }} />
        <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Targets</span>
        <div className="flex-1 h-px bg-outline-variant/15" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {mockGroup.target_countries.slice(0, 4).map(c => (
          <span key={c} className="inline-flex items-center gap-1 px-2 py-[3px] text-[10px] font-medium rounded-full border" style={{ color: THREAT_RED, borderColor: `${THREAT_RED}25`, backgroundColor: `${THREAT_RED}08` }}>
            <span className="w-1.5 h-1.5 rounded-full opacity-60" style={{ backgroundColor: THREAT_RED }} />
            {c}
          </span>
        ))}
        {mockGroup.target_countries.length > 4 && (
          <span className="px-2 py-[3px] text-[10px] text-on-surface-variant/40 rounded-full">+{mockGroup.target_countries.length - 4}</span>
        )}
      </div>
    </div>

    {/* Sectors */}
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="layers" className="w-3.5 h-3.5 text-on-surface-variant/40" />
        <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Sectors</span>
        <div className="flex-1 h-px bg-outline-variant/15" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {mockGroup.target_sectors.map(s => (
          <span key={s} className="px-2 py-[3px] text-[10px] text-on-surface-variant border border-outline-variant/15 rounded">{s}</span>
        ))}
      </div>
    </div>

    {/* Stats — anchored at bottom, always visible */}
    <div className="mt-auto px-4 py-3 flex items-end border-t border-outline-variant/15 bg-surface-container-lowest/30">
      <div className="flex-1">
        <div className="text-[9px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-0.5">TTPs</div>
        <div className="text-xl font-brand font-bold text-on-surface">{mockGroup.technique_count}</div>
      </div>
      <div className="w-px h-8 bg-outline-variant/15" />
      <div className="flex-1 pl-4">
        <div className="text-[9px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-0.5">Software</div>
        <div className="text-xl font-brand font-bold text-on-surface">{mockGroup.software_count}</div>
      </div>
      <div className="w-px h-8 bg-outline-variant/15" />
      <div className="flex-1 pl-4">
        <div className="text-[9px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-0.5">Campaigns</div>
        <div className="text-xl font-brand font-bold text-on-surface">{mockGroup.campaign_count}</div>
      </div>
    </div>
  </div>
);

// ── Campaign Card A ──────────────────────────────────────────────────────────
// Priority: Name → Attribution (WHO — must be instantly visible without reading)
// → Active badge → Timeline → Techniques → Description
const A_Campaign: React.FC<{ data: MockCampaign }> = ({ data }) => (
  <div className="rounded-xl overflow-hidden bg-background shadow-2xl shadow-black/60 hover:shadow-black/80 transition-all cursor-pointer flex flex-col">
    <div className="h-[2px]" style={{ background: `linear-gradient(to right, transparent, ${CAMPAIGN_SKY}, transparent)` }} />

    <div className="px-4 pt-4 pb-2">
      {/* ID + Active badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="font-brand text-[11px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ color: CAMPAIGN_SKY, backgroundColor: `${CAMPAIGN_SKY}15` }}>
          {data.mitre_id}
        </span>
        {data.recent && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider" style={{ color: CAMPAIGN_SKY, backgroundColor: `${CAMPAIGN_SKY}12` }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: CAMPAIGN_SKY }} />
            Active
          </span>
        )}
      </div>

      {/* Name — dominant */}
      <h3 className="font-brand text-xl font-bold text-on-surface leading-tight tracking-wide mb-1">
        {data.name}
      </h3>

      {/* Aliases */}
      {data.aliases.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {data.aliases.slice(0, 2).map(a => (
            <span key={a} className="px-2 py-0.5 bg-surface-container-high text-on-surface-variant text-[11px] rounded">{a}</span>
          ))}
          {data.aliases.length > 2 && (
            <span className="px-2 py-0.5 text-on-surface-variant/40 text-[11px]">+{data.aliases.length - 2}</span>
          )}
        </div>
      )}
    </div>

    {/* Attribution — THE most important field. Big, prominent, immediately scannable */}
    {data.attributed_group ? (
      <div className="mx-3 mb-2 px-3 py-2.5 rounded-lg flex items-center gap-2.5" style={{ backgroundColor: `${THREAT_RED}08`, border: `1px solid ${THREAT_RED}20` }}>
        <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${THREAT_RED}15` }}>
          <Icon name="threat-actor" className="w-4 h-4" style={{ color: THREAT_RED }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-on-surface-variant/60 uppercase tracking-wider">Attributed to</div>
          <div className="text-sm font-semibold text-on-surface truncate">{data.attributed_group.name}</div>
        </div>
        <span className="font-brand text-[10px] font-bold tracking-wider flex-shrink-0" style={{ color: THREAT_RED }}>
          {data.attributed_group.mitre_id}
        </span>
      </div>
    ) : (
      <div className="mx-3 mb-2 px-3 py-2.5 rounded-lg flex items-center gap-2 bg-surface-container-low/60 border border-outline-variant/10">
        <Icon name="help-circle" className="w-4 h-4 text-on-surface-variant/30 flex-shrink-0" />
        <span className="text-[11px] text-on-surface-variant/50 italic">Unattributed</span>
      </div>
    )}

    {/* Timeline */}
    <div className="px-4 py-2.5 bg-surface-container-lowest/50">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="activity" className="w-3.5 h-3.5" style={{ color: CAMPAIGN_SKY }} />
        <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Timeline</span>
        <div className="flex-1 h-px bg-outline-variant/15" />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-mono font-medium text-on-surface">{data.first_seen}</span>
        <div className="flex-1 h-1.5 rounded-full bg-outline-variant/10 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: data.recent ? '88%' : '100%', background: `linear-gradient(90deg, ${CAMPAIGN_SKY}, ${CAMPAIGN_SKY}${data.recent ? '80' : '40'})` }} />
        </div>
        <span className="text-[11px] font-mono font-medium text-on-surface">{data.last_seen}</span>
      </div>
    </div>

    {/* Description */}
    <div className="px-4 py-2.5">
      <p className="text-[11px] text-on-surface-variant leading-relaxed line-clamp-2">{data.description}</p>
    </div>

    {/* Stats — techniques + click-to-explore */}
    <div className="mt-auto px-4 py-2.5 flex items-center justify-between border-t border-outline-variant/15 bg-surface-container-lowest/30">
      <div className="flex items-center gap-2">
        <Icon name="matrix" className="w-3.5 h-3.5" style={{ color: CAMPAIGN_SKY }} />
        <span className="text-[11px] text-on-surface-variant">
          <span className="font-brand font-bold text-on-surface text-sm">{data.technique_count}</span> techniques
        </span>
      </div>
      <Icon name="chevron-right" className="w-3.5 h-3.5 text-on-surface-variant/40" />
    </div>
  </div>
);

// ── Software Card A ──────────────────────────────────────────────────────────
// Priority: Name → Type badge (malware=danger, tool=caution) — must be instantly
// obvious → Platforms → Stats → Description → Aliases
const A_Software: React.FC<{ data: MockSoftware }> = ({ data }) => {
  const isMalware = data.software_type === 'malware';
  const accent = isMalware ? THREAT_RED : TOOL_AMBER;
  const typeIcon = isMalware ? 'bug' : 'tool';

  return (
    <div className="rounded-xl overflow-hidden bg-background shadow-2xl shadow-black/60 hover:shadow-black/80 transition-all cursor-pointer flex flex-col">
      <div className="h-[2px]" style={{ background: `linear-gradient(to right, transparent, ${accent}, transparent)` }} />

      <div className="px-4 pt-4 pb-2">
        {/* ID + Type — type badge is prominent, not subtle */}
        <div className="flex items-center gap-2 mb-2">
          <span className="font-brand text-[11px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ color: accent, backgroundColor: `${accent}15` }}>
            {data.mitre_id}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ color: accent, backgroundColor: `${accent}12`, border: `1px solid ${accent}25` }}>
            <Icon name={typeIcon} className="w-3 h-3" />
            {data.software_type}
          </span>
        </div>

        {/* Name */}
        <h3 className="font-brand text-xl font-bold text-on-surface leading-tight tracking-wide mb-2">
          {data.name}
        </h3>

        {/* Aliases */}
        <div className="flex flex-wrap gap-1.5">
          {data.aliases.map(a => (
            <span key={a} className="px-2 py-0.5 bg-surface-container-high text-on-surface-variant text-[11px] rounded">{a}</span>
          ))}
        </div>
      </div>

      {/* Platforms — critical for "does this affect my environment?" */}
      <div className="px-4 py-2.5 bg-surface-container-lowest/50 mt-1">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="layers" className="w-3.5 h-3.5" style={{ color: accent }} />
          <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Platforms</span>
          <div className="flex-1 h-px bg-outline-variant/15" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {data.platforms.map(p => (
            <span key={p} className="px-2.5 py-1 text-[11px] font-mono font-medium text-on-surface-variant border border-outline-variant/15 rounded-md bg-surface-container-low/40">
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="px-4 py-2.5">
        <p className="text-[11px] text-on-surface-variant leading-relaxed line-clamp-2">{data.description}</p>
      </div>

      {/* Stats */}
      <div className="mt-auto px-4 py-3 flex items-end border-t border-outline-variant/15 bg-surface-container-lowest/30">
        <div className="flex-1">
          <div className="text-[9px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-0.5">Techniques</div>
          <div className="text-xl font-brand font-bold text-on-surface">{data.technique_count}</div>
        </div>
        <div className="w-px h-8 bg-outline-variant/15" />
        <div className="flex-1 pl-4">
          <div className="text-[9px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-0.5">Used by Groups</div>
          <div className="text-xl font-brand font-bold text-on-surface">{data.group_count}</div>
        </div>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// OPTION B
// Bolder approach: tinted header zone per entity, icon badges,
// inner rounded panels for content groups. More visual weight.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Group Card B ─────────────────────────────────────────────────────────────
const B_Group: React.FC = () => (
  <div className="rounded-xl overflow-hidden bg-background shadow-2xl shadow-black/60 hover:shadow-black/80 transition-all cursor-pointer flex flex-col">
    {/* Tinted header with entity icon */}
    <div className="px-4 py-3.5 flex items-start gap-3" style={{ backgroundColor: `${THREAT_RED}08` }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${THREAT_RED}18` }}>
        <Icon name="threat-actor" className="w-5 h-5" style={{ color: THREAT_RED }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-brand text-[11px] font-bold tracking-wider" style={{ color: THREAT_RED }}>{mockGroup.mitre_id}</span>
          <span className="flex items-center gap-1 text-[11px] text-on-surface-variant font-medium">
            🇷🇺 {mockGroup.origin_country}
          </span>
        </div>
        <h3 className="font-brand text-lg font-bold text-on-surface leading-tight tracking-wide">{mockGroup.name}</h3>
      </div>
    </div>

    {/* Aliases */}
    <div className="px-4 py-2">
      <div className="flex flex-wrap gap-1.5">
        {mockGroup.aliases.slice(0, 4).map(a => (
          <span key={a} className="px-2 py-0.5 text-[10px] font-medium text-on-surface-variant border border-outline-variant/15 rounded">{a}</span>
        ))}
        {mockGroup.aliases.length > 4 && (
          <span className="px-2 py-0.5 text-[10px] text-on-surface-variant/40">+{mockGroup.aliases.length - 4}</span>
        )}
      </div>
    </div>

    {/* Targets panel */}
    <div className="mx-3 mb-1.5 p-3 rounded-lg bg-surface-container-low/60">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="crosshairs" className="w-3.5 h-3.5" style={{ color: THREAT_RED }} />
        <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Targets</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {mockGroup.target_countries.slice(0, 4).map(c => (
          <span key={c} className="inline-flex items-center gap-1 px-2 py-[3px] text-[10px] font-medium rounded-full" style={{ color: THREAT_RED, backgroundColor: `${THREAT_RED}08`, border: `1px solid ${THREAT_RED}20` }}>
            <span className="w-1.5 h-1.5 rounded-full opacity-50" style={{ backgroundColor: THREAT_RED }} />
            {c}
          </span>
        ))}
        {mockGroup.target_countries.length > 4 && (
          <span className="text-[10px] text-on-surface-variant/40 px-1 py-[3px]">+{mockGroup.target_countries.length - 4}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-outline-variant/10">
        {mockGroup.target_sectors.map(s => (
          <span key={s} className="px-2 py-[2px] text-[10px] text-on-surface-variant bg-surface-container rounded">{s}</span>
        ))}
      </div>
    </div>

    {/* Stats bar */}
    <div className="mt-auto px-4 py-3 flex items-center gap-5 border-t border-outline-variant/10 bg-surface-container-lowest/40">
      {[
        { icon: 'matrix', color: THREAT_RED, val: mockGroup.technique_count, label: 'techniques' },
        { icon: 'bug', color: TOOL_AMBER, val: mockGroup.software_count, label: 'software' },
        { icon: 'flag', color: CAMPAIGN_SKY, val: mockGroup.campaign_count, label: 'campaigns' },
      ].map(s => (
        <div key={s.label} className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: `${s.color}15` }}>
            <Icon name={s.icon} className="w-3 h-3" style={{ color: s.color }} />
          </div>
          <span className="text-[11px] text-on-surface-variant">
            <span className="font-brand font-bold text-on-surface">{s.val}</span> {s.label}
          </span>
        </div>
      ))}
    </div>
  </div>
);

// ── Campaign Card B ──────────────────────────────────────────────────────────
const B_Campaign: React.FC<{ data: MockCampaign }> = ({ data }) => (
  <div className="rounded-xl overflow-hidden bg-background shadow-2xl shadow-black/60 hover:shadow-black/80 transition-all cursor-pointer flex flex-col">
    <div className="px-4 py-3.5 flex items-start gap-3" style={{ backgroundColor: `${CAMPAIGN_SKY}08` }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${CAMPAIGN_SKY}18` }}>
        <Icon name="flag" className="w-5 h-5" style={{ color: CAMPAIGN_SKY }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-brand text-[11px] font-bold tracking-wider" style={{ color: CAMPAIGN_SKY }}>{data.mitre_id}</span>
          {data.recent && (
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: CAMPAIGN_SKY }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: CAMPAIGN_SKY }} />Active
            </span>
          )}
        </div>
        <h3 className="font-brand text-lg font-bold text-on-surface leading-tight tracking-wide">{data.name}</h3>
      </div>
    </div>

    {/* Attribution — BIG and immediate. The first thing your eye goes to after name. */}
    {data.attributed_group ? (
      <div className="mx-3 mt-2.5 mb-1 px-3 py-2.5 rounded-lg flex items-center gap-2.5" style={{ backgroundColor: `${THREAT_RED}08`, border: `1px solid ${THREAT_RED}20` }}>
        <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${THREAT_RED}15` }}>
          <Icon name="threat-actor" className="w-4 h-4" style={{ color: THREAT_RED }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-on-surface-variant/60 uppercase tracking-wider">Attributed to</div>
          <div className="text-sm font-semibold text-on-surface truncate">{data.attributed_group.name}</div>
        </div>
        <span className="font-brand text-[10px] font-bold tracking-wider flex-shrink-0" style={{ color: THREAT_RED }}>
          {data.attributed_group.mitre_id}
        </span>
      </div>
    ) : (
      <div className="mx-3 mt-2.5 mb-1 px-3 py-2.5 rounded-lg flex items-center gap-2 bg-surface-container-low/60 border border-outline-variant/10">
        <Icon name="help-circle" className="w-4 h-4 text-on-surface-variant/30 flex-shrink-0" />
        <span className="text-[11px] text-on-surface-variant/50 italic">Unattributed</span>
      </div>
    )}

    {/* Timeline panel */}
    <div className="mx-3 mt-1.5 mb-2 p-3 rounded-lg bg-surface-container-low/60">
      <div className="flex items-center justify-between text-[10px] mb-1.5">
        <div>
          <div className="text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-0.5">First seen</div>
          <span className="font-mono font-medium text-on-surface">{data.first_seen}</span>
        </div>
        <div className="flex-1 mx-3 flex flex-col items-center gap-1">
          <span className="text-[8px] text-on-surface-variant/40">{data.duration}</span>
          <div className="w-full h-1.5 rounded-full bg-outline-variant/10 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: data.recent ? '88%' : '100%', background: `linear-gradient(90deg, ${CAMPAIGN_SKY}, ${CAMPAIGN_SKY}${data.recent ? '80' : '40'})` }} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-[8px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-0.5">Last seen</div>
          <span className="font-mono font-medium text-on-surface">{data.last_seen}</span>
        </div>
      </div>
    </div>

    {/* Description */}
    <div className="px-4 py-2">
      <p className="text-[11px] text-on-surface-variant leading-relaxed line-clamp-2">{data.description}</p>
    </div>

    {/* Stats */}
    <div className="mt-auto px-4 py-2.5 flex items-center justify-between border-t border-outline-variant/10 bg-surface-container-lowest/40">
      <div className="flex items-center gap-1.5">
        <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: `${CAMPAIGN_SKY}15` }}>
          <Icon name="matrix" className="w-3 h-3" style={{ color: CAMPAIGN_SKY }} />
        </div>
        <span className="text-[11px] text-on-surface-variant">
          <span className="font-brand font-bold text-on-surface">{data.technique_count}</span> techniques
        </span>
      </div>
      <Icon name="chevron-right" className="w-3.5 h-3.5 text-on-surface-variant/40" />
    </div>
  </div>
);

// ── Software Card B ──────────────────────────────────────────────────────────
const B_Software: React.FC<{ data: MockSoftware }> = ({ data }) => {
  const isMalware = data.software_type === 'malware';
  const accent = isMalware ? THREAT_RED : TOOL_AMBER;
  const typeIcon = isMalware ? 'bug' : 'tool';

  return (
    <div className="rounded-xl overflow-hidden bg-background shadow-2xl shadow-black/60 hover:shadow-black/80 transition-all cursor-pointer flex flex-col">
      <div className="px-4 py-3.5 flex items-start gap-3" style={{ backgroundColor: `${accent}08` }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${accent}18` }}>
          <Icon name={typeIcon} className="w-5 h-5" style={{ color: accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-brand text-[11px] font-bold tracking-wider" style={{ color: accent }}>{data.mitre_id}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>{data.software_type}</span>
          </div>
          <h3 className="font-brand text-lg font-bold text-on-surface leading-tight tracking-wide">{data.name}</h3>
        </div>
      </div>

      {/* Aliases */}
      <div className="px-4 py-2">
        <div className="flex flex-wrap gap-1.5">
          {data.aliases.map(a => (
            <span key={a} className="px-2 py-0.5 text-[10px] font-medium text-on-surface-variant border border-outline-variant/15 rounded">{a}</span>
          ))}
        </div>
      </div>

      {/* Platforms */}
      <div className="mx-3 mb-2 p-3 rounded-lg bg-surface-container-low/60">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="layers" className="w-3.5 h-3.5" style={{ color: accent }} />
          <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Platforms</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {data.platforms.map(p => (
            <span key={p} className="px-2.5 py-1 text-[11px] font-mono font-medium text-on-surface-variant border border-outline-variant/15 rounded-md bg-surface-container-low/40">{p}</span>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="px-4 py-2">
        <p className="text-[11px] text-on-surface-variant leading-relaxed line-clamp-2">{data.description}</p>
      </div>

      {/* Stats */}
      <div className="mt-auto px-4 py-3 flex items-center gap-5 border-t border-outline-variant/10 bg-surface-container-lowest/40">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: `${accent}15` }}>
            <Icon name="matrix" className="w-3 h-3" style={{ color: accent }} />
          </div>
          <span className="text-[11px] text-on-surface-variant">
            <span className="font-brand font-bold text-on-surface">{data.technique_count}</span> techniques
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: `${THREAT_RED}15` }}>
            <Icon name="threat-actor" className="w-3 h-3" style={{ color: THREAT_RED }} />
          </div>
          <span className="text-[11px] text-on-surface-variant">
            <span className="font-brand font-bold text-on-surface">{data.group_count}</span> groups
          </span>
        </div>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// OPTION C — "Native"
// Uses the EXACT same patterns as existing app cards (GroupCard, CampaignCard,
// SoftwareCard): bg-surface-container-low, border-outline-variant/30, rounded-lg,
// p-6, hover:scale-[1.02], hover:border-color/50, group class for child hovers.
// Fixes UX problems (hardcoded colors, inconsistent hierarchy) while staying
// visually identical to the rest of the app.
// ═══════════════════════════════════════════════════════════════════════════════

const C_Group: React.FC = () => (
  <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-6 cursor-pointer transition-all duration-200 hover:border-error/50 hover:shadow-lg hover:shadow-error/10 hover:scale-[1.02] flex flex-col h-full group">
    {/* Row 1: MITRE ID + Origin */}
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xs font-mono font-bold text-on-error-container bg-error-container px-2 py-1 rounded border border-error/20">
        {mockGroup.mitre_id}
      </span>
      <span className="flex items-center gap-1.5 px-2 py-1 bg-surface-container-high rounded text-sm text-on-surface-variant">
        🇷🇺 {mockGroup.origin_country}
      </span>
    </div>

    {/* Row 2: Group Name */}
    <h3 className="text-2xl font-brand font-bold text-on-surface mb-4 group-hover:text-error transition-colors">
      {mockGroup.name}
    </h3>

    {/* Row 3: Aliases */}
    <div className="flex flex-wrap gap-1.5 mb-6">
      {mockGroup.aliases.slice(0, 3).map(a => (
        <span key={a} className="px-2.5 py-1 bg-surface-container-high text-on-surface-variant text-sm rounded">
          {a}
        </span>
      ))}
      {mockGroup.aliases.length > 3 && (
        <span className="px-2.5 py-1 bg-surface-container-high text-on-surface-variant/60 text-sm rounded">
          +{mockGroup.aliases.length - 3}
        </span>
      )}
    </div>

    {/* Row 4: Targets */}
    <div className="mb-4">
      <div className="text-[11px] text-on-surface-variant/60 uppercase tracking-wider mb-2">Targets</div>
      <div className="flex flex-wrap gap-1.5">
        {mockGroup.target_countries.slice(0, 4).map(c => (
          <span key={c} className="flex items-center gap-1.5 px-2.5 py-1 bg-error-container/30 text-error text-sm rounded-full border border-error/15">
            <span className="w-1.5 h-1.5 rounded-full bg-error/60" />
            {c}
          </span>
        ))}
        {mockGroup.target_countries.length > 4 && (
          <span className="px-2.5 py-1 text-on-surface-variant/50 text-sm rounded-full">
            +{mockGroup.target_countries.length - 4}
          </span>
        )}
      </div>
    </div>

    {/* Row 5: Sectors */}
    <div className="mb-6">
      <div className="text-[11px] text-on-surface-variant/60 uppercase tracking-wider mb-2">Sectors</div>
      <div className="flex flex-wrap gap-1.5">
        {mockGroup.target_sectors.slice(0, 3).map(s => (
          <span key={s} className="px-2.5 py-1 bg-surface-container-high text-on-surface-variant text-sm rounded">
            {s}
          </span>
        ))}
        {mockGroup.target_sectors.length > 3 && (
          <span className="px-2.5 py-1 bg-surface-container-high text-on-surface-variant/60 text-sm rounded">
            +{mockGroup.target_sectors.length - 3}
          </span>
        )}
      </div>
    </div>

    {/* Row 6: Stats Footer */}
    <div className="flex items-end mt-auto pt-4 border-t border-outline-variant/30">
      <div className="flex-1">
        <div className="text-[11px] text-on-surface-variant/60 uppercase tracking-wider mb-1">TTPs</div>
        <div className="text-2xl font-bold text-on-surface">{mockGroup.technique_count}</div>
      </div>
      <div className="w-px h-10 bg-outline-variant/30" />
      <div className="flex-1 pl-4">
        <div className="text-[11px] text-on-surface-variant/60 uppercase tracking-wider mb-1">Tools</div>
        <div className="text-2xl font-bold text-on-surface">{mockGroup.software_count}</div>
      </div>
      <div className="w-px h-10 bg-outline-variant/30" />
      <div className="flex-1 pl-4">
        <div className="text-[11px] text-on-surface-variant/60 uppercase tracking-wider mb-1">Camps</div>
        <div className="text-2xl font-bold text-on-surface">{mockGroup.campaign_count}</div>
      </div>
    </div>
  </div>
);

const C_Campaign: React.FC<{ data: MockCampaign }> = ({ data }) => (
  <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-6 cursor-pointer transition-all duration-200 hover:border-tertiary/50 hover:shadow-lg hover:shadow-tertiary/10 hover:scale-[1.02] flex flex-col h-full group">
    {/* Header */}
    <div className="flex items-start justify-between mb-3">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs font-mono text-tertiary font-bold bg-tertiary-container px-1.5 py-0.5 rounded border border-tertiary/20">
            {data.mitre_id}
          </span>
          {data.recent && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-tertiary/20 text-tertiary text-[10px] font-bold rounded uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
              Active
            </span>
          )}
        </div>
        <h3 className="text-lg font-bold text-on-surface mb-2 line-clamp-2 group-hover:text-tertiary transition-colors">
          {data.name}
        </h3>
      </div>
      <Icon name="flag" className="w-6 h-6 flex-shrink-0 text-tertiary/30" />
    </div>

    {/* Attribution — THE priority field, prominent box */}
    {data.attributed_group ? (
      <div className="mb-4 flex items-center gap-2 px-3 py-2.5 bg-error-container/20 rounded-lg border border-error/15">
        <Icon name="threat-actor" className="w-5 h-5 text-error flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs text-on-surface-variant">Attributed to</span>
          <div className="text-sm font-semibold text-on-surface truncate">{data.attributed_group.name}</div>
        </div>
        <span className="text-xs font-mono text-error/70 flex-shrink-0">{data.attributed_group.mitre_id}</span>
      </div>
    ) : (
      <div className="mb-4 flex items-center gap-2 px-3 py-2.5 bg-surface-container rounded-lg border border-outline-variant/20">
        <Icon name="help-circle" className="w-4 h-4 text-on-surface-variant/30 flex-shrink-0" />
        <span className="text-xs text-on-surface-variant/50 italic">Unattributed</span>
      </div>
    )}

    {/* Timeline */}
    <div className="mb-4 p-3 bg-surface-container rounded-lg border border-outline-variant/20">
      <div className="flex items-center justify-between text-xs">
        <div>
          <span className="text-on-surface-variant block mb-1">First Seen</span>
          <span className="text-on-surface font-mono">{data.first_seen}</span>
        </div>
        <div className="flex-1 mx-4">
          <div className="h-1.5 rounded-full bg-outline-variant/15 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-tertiary/60 to-tertiary/20"
              style={{ width: data.recent ? '85%' : '100%' }} />
          </div>
        </div>
        <div className="text-right">
          <span className="text-on-surface-variant block mb-1">Last Seen</span>
          <span className="text-on-surface font-mono">{data.last_seen}</span>
        </div>
      </div>
    </div>

    {/* Aliases */}
    {data.aliases.length > 0 && (
      <div className="mb-3 flex flex-wrap gap-1">
        {data.aliases.slice(0, 2).map(a => (
          <span key={a} className="px-2 py-0.5 bg-surface-container text-on-surface-variant text-xs rounded border border-outline-variant/10">
            {a}
          </span>
        ))}
        {data.aliases.length > 2 && (
          <span className="px-2 py-0.5 text-on-surface-variant/50 text-xs">+{data.aliases.length - 2}</span>
        )}
      </div>
    )}

    {/* Description */}
    {data.description && (
      <p className="text-sm text-on-surface-variant line-clamp-2 mb-4">{data.description}</p>
    )}

    {/* Stats */}
    <div className="flex items-center gap-4 text-xs text-on-surface-variant mt-auto pt-4 border-t border-outline-variant/20">
      <div className="flex items-center gap-1">
        <Icon name="matrix" className="w-4 h-4 text-tertiary" />
        <span className="font-semibold text-on-surface">{data.technique_count}</span>
        <span>Techniques</span>
      </div>
    </div>
  </div>
);

const C_Software: React.FC<{ data: MockSoftware }> = ({ data }) => {
  const isMalware = data.software_type === 'malware';
  return (
    <div className={`bg-surface-container-low border border-outline-variant/30 rounded-lg p-6 cursor-pointer transition-all duration-200 hover:scale-[1.02] flex flex-col h-full group shadow-sm ${
      isMalware
        ? 'hover:border-error/50 hover:shadow-lg hover:shadow-error/10'
        : 'hover:border-secondary/50 hover:shadow-lg hover:shadow-secondary/10'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded border ${
              isMalware
                ? 'text-error bg-error-container/30 border-error/20'
                : 'text-secondary bg-secondary-container px-1.5 py-0.5 rounded border-secondary/20'
            }`}>
              {data.mitre_id}
            </span>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase border ${
              isMalware
                ? 'bg-error-container text-on-error-container border-error/30'
                : 'bg-secondary-container text-on-secondary-container border-secondary/30'
            }`}>
              {data.software_type}
            </span>
          </div>
          <h3 className={`text-lg font-bold text-on-surface mb-2 line-clamp-2 transition-colors ${
            isMalware ? 'group-hover:text-error' : 'group-hover:text-secondary'
          }`}>
            {data.name}
          </h3>
        </div>
        <Icon
          name={isMalware ? 'bug' : 'tool'}
          className={`w-6 h-6 flex-shrink-0 ${isMalware ? 'text-error/30' : 'text-secondary/30'}`}
        />
      </div>

      {/* Aliases */}
      {data.aliases.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {data.aliases.map(a => (
            <span key={a} className="px-2 py-0.5 bg-surface-container text-on-surface-variant text-xs rounded border border-outline-variant/20">
              {a}
            </span>
          ))}
        </div>
      )}

      {/* Platforms */}
      <div className="mb-4 flex flex-wrap gap-1">
        {data.platforms.map(p => (
          <span key={p} className="px-2 py-0.5 bg-surface-container-high text-on-surface-variant text-[10px] rounded border border-outline-variant/20">
            {p}
          </span>
        ))}
      </div>

      {/* Description */}
      {data.description && (
        <p className="text-sm text-on-surface-variant line-clamp-2 mb-4">{data.description}</p>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mt-auto border-t border-outline-variant/20 pt-4">
        <div className="flex flex-col">
          <span className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold mb-0.5">Techniques</span>
          <span className="text-2xl font-mono font-bold text-on-surface">{data.technique_count}</span>
        </div>
        <div className="flex flex-col pl-4 border-l border-outline-variant/20">
          <span className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold mb-0.5">Groups</span>
          <span className="text-2xl font-mono font-bold text-on-surface">{data.group_count}</span>
        </div>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// OPTION D — "Native Enhanced"
// Fully neutral cards. Color only from:
//   1. Icon badge (muted tint using hex from MITRE tooltip palette)
//   2. Stat accent bars (3px left-border in entity color)
//   3. Semantic badges (malware/tool type, Active, target dots)
// Numbers are text-on-surface (always readable). Entity colors:
//   #783264 (magenta — groups), #EAB308 (yellow — campaigns), #A63D40 (red — software)
// ═══════════════════════════════════════════════════════════════════════════════

const D_Group: React.FC = () => (
  <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-6 cursor-pointer transition-all duration-200 hover:border-outline-variant/60 hover:shadow-lg hover:shadow-black/10 hover:scale-[1.02] flex flex-col h-full group">
    {/* Top line: subtle MITRE ID + icon */}
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] font-mono text-on-surface-variant/50">{mockGroup.mitre_id}</span>
      <div className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0" style={{ backgroundColor: '#78326420', borderColor: '#78326430' }}>
        <Icon name="threat-actor" className="w-4 h-4" style={{ color: '#783264' }} />
      </div>
    </div>

    {/* Name — hero element */}
    <h3 className="text-xl font-brand font-bold text-on-surface leading-tight line-clamp-2 m-0 mb-1">
      {mockGroup.name}
    </h3>

    {/* Origin country — prominent with large flag */}
    <div className="flex items-center gap-2 mb-3">
      <img src="https://flagcdn.com/ru.svg" alt="Russia" className="w-4 h-3 rounded-[1px] object-cover" />
      <span className="text-sm text-on-surface-variant font-medium">{mockGroup.origin_country}</span>
    </div>

    {/* Aliases */}
    <div className="flex flex-wrap gap-1 mb-4">
      {mockGroup.aliases.slice(0, 3).map((alias: string) => (
        <span key={alias} className="px-1.5 py-px bg-[#4D7C6F]/10 text-[#4D7C6F] dark:text-[#6BA594] text-[11px] rounded border border-[#4D7C6F]/20">
          {alias}
        </span>
      ))}
      {mockGroup.aliases.length > 3 && (
        <span className="px-1.5 py-px text-on-surface-variant/50 text-[11px]">
          +{mockGroup.aliases.length - 3}
        </span>
      )}
    </div>

    {/* Targets Panel */}
    <div className="mb-4 p-3 bg-surface-container rounded-lg border border-outline-variant/15">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon name="crosshairs" className="w-3.5 h-3.5" style={{ color: '#783264' }} />
        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Targets</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {mockGroup.target_countries.slice(0, 4).map(c => (
          <span key={c} className="flex items-center gap-1 px-2 py-0.5 bg-surface-container-high text-on-surface-variant text-xs rounded-full border border-outline-variant/15">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#783264' }} />
            {c}
          </span>
        ))}
        {mockGroup.target_countries.length > 4 && (
          <span className="px-2 py-0.5 text-on-surface-variant/40 text-xs">+{mockGroup.target_countries.length - 4}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-outline-variant/10">
        {mockGroup.target_sectors.map(s => (
          <span key={s} className="px-2 py-0.5 bg-surface-container-high text-on-surface-variant text-xs rounded">
            {s}
          </span>
        ))}
      </div>
    </div>

    {/* Stats Footer */}
    <div className="grid grid-cols-3 gap-3 mt-auto border-t border-outline-variant/20 pt-4">
      <div className="flex flex-col pl-2.5 border-l-[3px]" style={{ borderColor: '#783264' }}>
        <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mb-0.5">TTPs</span>
        <span className="text-xl font-mono font-bold text-on-surface">{mockGroup.technique_count}</span>
      </div>
      <div className="flex flex-col pl-2.5 border-l-[3px] border-outline-variant/20">
        <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mb-0.5">Software</span>
        <span className="text-xl font-mono font-bold text-on-surface">{mockGroup.software_count}</span>
      </div>
      <div className="flex flex-col pl-2.5 border-l-[3px] border-outline-variant/20">
        <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mb-0.5">Campaigns</span>
        <span className="text-xl font-mono font-bold text-on-surface">{mockGroup.campaign_count}</span>
      </div>
    </div>
  </div>
);

const D_Campaign: React.FC<{ data: MockCampaign }> = ({ data }) => (
  <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-6 cursor-pointer transition-all duration-200 hover:border-outline-variant/60 hover:shadow-lg hover:shadow-black/10 hover:scale-[1.02] flex flex-col h-full group">
    {/* Header: Icon + ID + Active */}
    <div className="flex items-start gap-3 mb-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border" style={{ backgroundColor: '#EAB30820', borderColor: '#EAB30830' }}>
        <Icon name="flag" className="w-5 h-5" style={{ color: '#EAB308' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono font-bold text-on-surface bg-surface-container-high px-1.5 py-0.5 rounded border border-outline-variant/20">
            {data.mitre_id}
          </span>
          {data.recent && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded uppercase" style={{ backgroundColor: '#EAB30818', color: '#EAB308' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#EAB308' }} />
              Active
            </span>
          )}
        </div>
        <h3 className="text-lg font-brand font-bold text-on-surface leading-tight line-clamp-2">
          {data.name}
        </h3>
      </div>
    </div>

    {/* Timeline */}
    <div className="mb-3 p-3 bg-surface-container rounded-lg border border-outline-variant/20">
      <div className="flex items-center justify-between text-xs">
        <div>
          <span className="text-on-surface-variant block mb-1">First Seen</span>
          <span className="text-on-surface font-mono">{data.first_seen}</span>
        </div>
        <div className="flex-1 mx-4 h-[2px] rounded-full" style={{ background: 'linear-gradient(to right, #EAB30880, #EAB30830)' }} />
        <div className="text-right">
          <span className="text-on-surface-variant block mb-1">Last Seen</span>
          <span className="text-on-surface font-mono">{data.last_seen}</span>
        </div>
      </div>
    </div>

    {/* Attribution — fixed height so cards align regardless of attribution */}
    <div className="mb-3 h-10 flex items-center">
      {data.attributed_group ? (
        <div className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md" style={{ backgroundColor: '#EAB308' }}>
          <Icon name="threat-actor" className="w-4 h-4 flex-shrink-0 text-black/70" />
          <span className="text-[10px] text-black/50 flex-shrink-0">Attributed to</span>
          <span className="text-xs font-bold text-black/90 truncate">{data.attributed_group.name}</span>
          <span className="text-[10px] font-mono text-black/40 ml-auto flex-shrink-0">{data.attributed_group.mitre_id}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-2.5">
          <Icon name="help-circle" className="w-3.5 h-3.5 text-on-surface-variant/25" />
          <span className="text-[10px] text-on-surface-variant/40 italic">Unattributed</span>
        </div>
      )}
    </div>

    {/* Aliases */}
    {data.aliases.length > 0 && (
      <div className="mb-3 flex flex-wrap gap-1">
        {data.aliases.slice(0, 2).map(a => (
          <span key={a} className="px-2 py-0.5 bg-surface-container text-on-surface-variant text-xs rounded border border-outline-variant/10">
            {a}
          </span>
        ))}
        {data.aliases.length > 2 && (
          <span className="px-2 py-0.5 text-on-surface-variant/50 text-xs">+{data.aliases.length - 2}</span>
        )}
      </div>
    )}

    {/* Description */}
    {data.description && (
      <p className="text-sm text-on-surface-variant line-clamp-2 mb-4">{data.description}</p>
    )}

    {/* Stats Footer */}
    <div className="grid grid-cols-1 gap-3 mt-auto border-t border-outline-variant/20 pt-4">
      <div className="flex flex-col pl-2.5 border-l-[3px]" style={{ borderColor: '#EAB308' }}>
        <span className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold mb-0.5">Techniques</span>
        <span className="text-xl font-mono font-bold text-on-surface">{data.technique_count}</span>
      </div>
    </div>
  </div>
);

const D_Software: React.FC<{ data: MockSoftware }> = ({ data }) => {
  const isMalware = data.software_type === 'malware';
  const accent = '#A63D40';
  return (
    <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-6 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:border-outline-variant/60 hover:shadow-lg hover:shadow-black/10 flex flex-col h-full group shadow-sm">
      {/* Header with icon */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border" style={{ backgroundColor: `${accent}20`, borderColor: `${accent}30` }}>
          <Icon
            name={isMalware ? 'bug' : 'tool'}
            className="w-5 h-5"
            style={{ color: accent }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-mono font-bold text-on-surface bg-surface-container-high px-1.5 py-0.5 rounded border border-outline-variant/20">
              {data.mitre_id}
            </span>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase border border-outline-variant/20" style={{ backgroundColor: `${accent}15`, color: accent }}>
              {data.software_type}
            </span>
          </div>
          <h3 className="text-lg font-brand font-bold text-on-surface leading-tight line-clamp-2">
            {data.name}
          </h3>
        </div>
      </div>

      {/* Aliases */}
      {data.aliases.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {data.aliases.map(a => (
            <span key={a} className="px-2 py-0.5 bg-surface-container text-on-surface-variant text-xs rounded border border-outline-variant/20">
              {a}
            </span>
          ))}
        </div>
      )}

      {/* Platforms — neutral panel */}
      <div className="mb-4 p-3 rounded-lg bg-surface-container border border-outline-variant/15">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="monitor" className="w-3.5 h-3.5" style={{ color: accent }} />
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Platforms</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {data.platforms.map(p => (
            <span key={p} className="px-2.5 py-1 bg-surface-container-high text-on-surface-variant text-[10px] font-mono rounded border border-outline-variant/15">
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* Description */}
      {data.description && (
        <p className="text-sm text-on-surface-variant line-clamp-2 mb-4">{data.description}</p>
      )}

      {/* Stats Grid — accent left-border */}
      <div className="grid grid-cols-2 gap-3 mt-auto border-t border-outline-variant/20 pt-4">
        <div className="flex flex-col pl-2.5 border-l-[3px]" style={{ borderColor: accent }}>
          <span className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold mb-0.5">Techniques</span>
          <span className="text-xl font-mono font-bold text-on-surface">{data.technique_count}</span>
        </div>
        <div className="flex flex-col pl-2.5 border-l-[3px] border-outline-variant/20">
          <span className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold mb-0.5">Groups</span>
          <span className="text-xl font-mono font-bold text-on-surface">{data.group_count}</span>
        </div>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════════

type Approach = 'a' | 'b' | 'c' | 'd';

export const IntelCardsPage: React.FC = () => {
  const [ap, setAp] = useState<Approach>('c');

  const opts: { id: Approach; label: string; tag: string }[] = [
    { id: 'a', label: 'Option A — Clean Sections', tag: 'Gradient accent, section headers with dividers, large stat numbers at bottom' },
    { id: 'b', label: 'Option B — Tinted Headers', tag: 'Bold entity-colored header bar with icon, inner panels, icon stat counters' },
    { id: 'c', label: 'Option C — Native', tag: 'Same card patterns as existing app — fixes UX issues without changing design language' },
    { id: 'd', label: 'Option D — Native Enhanced', tag: 'Native foundation + entity icon badges, tinted target panels, richer layout' },
  ];

  const renderGroup = () => {
    switch (ap) {
      case 'a': return <A_Group />;
      case 'b': return <B_Group />;
      case 'c': return <C_Group />;
      case 'd': return <D_Group />;
    }
  };

  const renderCampaign = (data: MockCampaign) => {
    switch (ap) {
      case 'a': return <A_Campaign data={data} />;
      case 'b': return <B_Campaign data={data} />;
      case 'c': return <C_Campaign data={data} />;
      case 'd': return <D_Campaign data={data} />;
    }
  };

  const renderSoftware = (data: MockSoftware) => {
    switch (ap) {
      case 'a': return <A_Software data={data} />;
      case 'b': return <B_Software data={data} />;
      case 'c': return <C_Software data={data} />;
      case 'd': return <D_Software data={data} />;
    }
  };

  return (
    <DesignSystemPage title="Intel Cards" description="Four design approaches — each card type is shaped by its own data priorities, not forced into a uniform template">

      <div className="flex flex-wrap gap-2 mb-8">
        {opts.map(o => (
          <button key={o.id} onClick={() => setAp(o.id)}
            className={`px-4 py-2.5 rounded-xl text-left transition-all border ${ap === o.id ? 'bg-primary/10 border-primary/30 text-on-surface' : 'bg-surface-container border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'}`}>
            <div className="text-sm font-medium">{o.label}</div>
            <div className="text-[10px] text-on-surface-variant/60 mt-0.5">{o.tag}</div>
          </button>
        ))}
      </div>

      {/* ── Threat Group ── */}
      <Section title="Threat Group" description="APT28 — name and origin dominate, targets are visually dangerous, stats anchored at bottom">
        <div className="max-w-[380px]">
          {renderGroup()}
        </div>
      </Section>

      {/* ── Campaign (attributed + unattributed) ── */}
      <Section title="Campaign" description="Attribution is the #1 field — must be instantly visible without reading. Showing attributed vs unattributed.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-[780px]">
          {renderCampaign(mockCampaign)}
          {renderCampaign(mockCampaignUnattributed)}
        </div>
      </Section>

      {/* ── Software ── */}
      <Section title="Software — Malware vs Tool" description="Type badge is prominent — malware feels dangerous (red), tool feels cautionary (amber). Platforms answer 'does this affect me?'">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-[780px]">
          {renderSoftware(mockMalware)}
          {renderSoftware(mockTool)}
        </div>
      </Section>

      {/* ── Grid preview ── */}
      <Section title="Grid Preview" description="Mixed entity types in a 3-column grid — cards share structural rhythm but each is shaped by its data">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {renderGroup()}
          {renderCampaign(mockCampaign)}
          {renderSoftware(mockMalware)}
        </div>
      </Section>

    </DesignSystemPage>
  );
};
