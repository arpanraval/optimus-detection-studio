import React, { useState } from 'react';
import { FeatureSlide, MockupFrame, FeatureCarousel } from '../shared/FeatureSlide';

const ACCENT = '#783264';
const BLUE = '#005091';
const TEAL = '#4D7C6F';

/* ------------------------------------------------------------------ */
/*  Shared sub-components                                              */
/* ------------------------------------------------------------------ */

/** Small Optimus "O" logo icon used in the chat header */
const OptimusIcon = () => (
  <div
    className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black shrink-0"
    style={{ backgroundColor: `${ACCENT}30`, color: `${ACCENT}cc` }}
  >
    O
  </div>
);

/** Chat header bar matching the real product UI */
const ChatHeader: React.FC<{
  language: string;
  languageColor?: string;
}> = ({ language, languageColor = BLUE }) => (
  <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/[0.06]">
    <OptimusIcon />
    <span className="text-xs font-semibold text-white/70 tracking-wide">AI Query Generator</span>
    <span className="mono text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400/90 border border-emerald-500/20">
      Gemini 3 Flash <span className="text-emerald-400/50">&#9656;</span>
    </span>
    <span
      className="mono text-[9px] px-2 py-0.5 rounded-md border"
      style={{ borderColor: `${languageColor}35`, color: `${languageColor}bb`, backgroundColor: `${languageColor}10` }}
    >
      {language} &#9662;
    </span>
    <div className="ml-auto flex items-center gap-2">
      <span className="text-white/20 text-sm cursor-default" title="History">&#128340;</span>
      <span
        className="w-5 h-5 rounded-md flex items-center justify-center text-[13px] text-white/30 border border-white/[0.08] cursor-default"
        title="New chat"
      >
        +
      </span>
    </div>
  </div>
);

/** User message bubble */
const UserMessage: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex gap-3 mb-4">
    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold bg-white/[0.07] text-white/40 mt-0.5">
      U
    </div>
    <div className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-sm text-white/60 leading-relaxed">
      {text}
    </div>
  </div>
);

/** AI response wrapper */
const AIResponse: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex gap-3 mb-4">
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[9px] font-black mt-0.5"
      style={{ backgroundColor: `${ACCENT}25`, color: `${ACCENT}cc` }}
    >
      O
    </div>
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

/** Code block with language badge, copy + add-to-library buttons */
const CodeBlock: React.FC<{
  language: string;
  languageColor?: string;
  children: React.ReactNode;
}> = ({ language, languageColor = '#3b82f6', children }) => (
  <div className="border border-white/[0.08] rounded-lg overflow-hidden my-3">
    <div className="flex items-center px-3 py-1.5 border-b border-white/[0.06] bg-white/[0.02]">
      <span
        className="mono text-[8px] tracking-wider font-bold px-2 py-0.5 rounded"
        style={{ backgroundColor: `${languageColor}20`, color: `${languageColor}cc` }}
      >
        {language}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <span className="mono text-[9px] text-white/25 cursor-default hover:text-white/40" title="Copy">&#9776;</span>
        <span className="mono text-[9px] px-1.5 py-0.5 rounded text-white/25 cursor-default hover:text-white/40" style={{ backgroundColor: `${TEAL}12`, color: `${TEAL}88` }} title="Add to library">+ Library</span>
      </div>
    </div>
    <div className="p-4 mono text-[10px] sm:text-[11px] leading-[1.75] text-white/65 bg-black/25 overflow-x-auto">
      {children}
    </div>
  </div>
);

/** Chat input bar at bottom */
const ChatInput: React.FC<{ placeholder?: string }> = ({ placeholder = 'Refine detection or ask for another language...' }) => (
  <div className="flex items-center gap-2 px-3 py-2 border border-white/[0.08] rounded-lg bg-white/[0.02] mt-3">
    <span className="text-xs text-white/25 flex-1">{placeholder}</span>
    <span
      className="mono text-[9px] px-2.5 py-1 rounded-md"
      style={{ backgroundColor: `${ACCENT}20`, color: `${ACCENT}bb` }}
    >
      Send
    </span>
  </div>
);

/* Syntax-highlighting helpers */
const K = ({ children }: { children: React.ReactNode }) => <span className="text-blue-400">{children}</span>;          // keywords
const S = ({ children }: { children: React.ReactNode }) => <span className="text-green-400/80">{children}</span>;      // strings
const V = ({ children }: { children: React.ReactNode }) => <span className="text-amber-400/80">{children}</span>;      // values / numbers
const P = ({ children }: { children: React.ReactNode }) => <span className="text-fuchsia-400/80">{children}</span>;    // pipe / operators
const C = ({ children }: { children: React.ReactNode }) => <span className="text-white/25 italic">{children}</span>;   // comments
const F = ({ children }: { children: React.ReactNode }) => <span className="text-white/70">{children}</span>;          // field names

/* ------------------------------------------------------------------ */
/*  Slide 1 — Generate Query (CrowdStrike LogScale)                    */
/* ------------------------------------------------------------------ */

const GenerateQueryMockup = () => (
  <MockupFrame title="AI QUERY GENERATOR" accent={BLUE}>
    <ChatHeader language="CrowdStrike LogScale" languageColor="#2563eb" />

    <UserMessage text="Create a detection for LSASS credential dumping via process access, covering known tools like Mimikatz and Procdump, with proper exclusions for legitimate security software." />

    <AIResponse>
      <p className="text-xs text-white/45 leading-relaxed mb-2">
        This detection monitors for suspicious process access to LSASS (Local Security Authority Subsystem Service)
        using Sysmon Event ID 10. It filters for access masks commonly associated with credential dumping tools
        while excluding legitimate security products to minimize false positives.
      </p>

      <CodeBlock language="CROWDSTRIKE LOGSCALE" languageColor="#2563eb">
        <div><C>{'// LSASS Credential Dumping via Process Access'}</C></div>
        <div><C>{'// Sysmon EventID 10 — ProcessAccess'}</C></div>
        <div>&nbsp;</div>
        <div><F>{'#event_simpleName'}</F>=<S>ProcessAccess</S></div>
        <div><P>|</P> <F>TargetImage</F>=<S>/.*\\lsass\\.exe/i</S></div>
        <div>&nbsp;</div>
        <div><C>{'// Filter for credential-dumping access masks'}</C></div>
        <div><P>|</P> <K>case</K> {'{'}</div>
        <div>{'    '}<F>GrantedAccess</F>=<S>"0x1010"</S>  <P>|</P> <F>access_type</F> := <S>"PROCESS_QUERY_LIMITED + PROCESS_VM_READ"</S> ;</div>
        <div>{'    '}<F>GrantedAccess</F>=<S>"0x1410"</S>  <P>|</P> <F>access_type</F> := <S>"QUERY_LIMITED + VM_READ + SUSPEND_RESUME"</S> ;</div>
        <div>{'    '}<F>GrantedAccess</F>=<S>"0x1FFFFF"</S> <P>|</P> <F>access_type</F> := <S>"PROCESS_ALL_ACCESS"</S> ;</div>
        <div>{'    '}<F>GrantedAccess</F>=<S>"0x1438"</S>  <P>|</P> <F>access_type</F> := <S>"FULL_DUMP_ACCESS"</S> ;</div>
        <div>{'    '}<P>*</P> <P>|</P> <F>access_type</F> := <S>"other"</S> ;</div>
        <div>{'}'}</div>
        <div><P>|</P> <F>access_type</F> <P>!=</P> <S>"other"</S></div>
        <div>&nbsp;</div>
        <div><C>{'// Exclude known-good security software'}</C></div>
        <div><P>|</P> <P>NOT</P> <F>SourceImage</F> <P>IN</P> {'['}</div>
        <div>{'    '}<S>/.*\\MsMpEng\.exe/i</S>,</div>
        <div>{'    '}<S>/.*\\csfalconservice\.exe/i</S>,</div>
        <div>{'    '}<S>/.*\\cb\.exe/i</S>,</div>
        <div>{'    '}<S>/.*\\SentinelAgent\.exe/i</S>,</div>
        <div>{'    '}<S>/.*\\CylanceSvc\.exe/i</S></div>
        <div>{']'}</div>
        <div>&nbsp;</div>
        <div><C>{'// Exclude system processes'}</C></div>
        <div><P>|</P> <P>NOT</P> <F>SourceImage</F> <P>IN</P> {'['}</div>
        <div>{'    '}<S>/.*\\svchost\.exe/i</S>,</div>
        <div>{'    '}<S>/.*\\wininit\.exe/i</S>,</div>
        <div>{'    '}<S>/.*\\csrss\.exe/i</S></div>
        <div>{']'}</div>
        <div>&nbsp;</div>
        <div><C>{'// Aggregate and enrich for triage'}</C></div>
        <div><P>|</P> <K>groupBy</K>({'['}<F>SourceImage</F>, <F>GrantedAccess</F>, <F>access_type</F>, <F>ComputerName</F>{']'},</div>
        <div>{'    '}<K>function</K>=[<K>count</K>(<K>as</K>=<F>hits</F>), <K>min</K>(<F>@timestamp</F>, <K>as</K>=<F>first_seen</F>)]</div>
        <div>)</div>
        <div><P>|</P> <F>hits</F> {'>'} <V>0</V></div>
        <div><P>|</P> <K>sort</K>(<F>hits</F>, <K>order</K>=<K>desc</K>)</div>
      </CodeBlock>

      <ChatInput />
    </AIResponse>
  </MockupFrame>
);

/* ------------------------------------------------------------------ */
/*  Slide 2 — Multi-Language (KQL / Microsoft Sentinel)                */
/* ------------------------------------------------------------------ */

const MultiLanguageMockup = () => (
  <MockupFrame title="AI QUERY GENERATOR" accent={BLUE}>
    <ChatHeader language="Microsoft Sentinel (KQL)" languageColor="#0078d4" />

    <UserMessage text="Same detection -- LSASS credential dumping -- but in KQL for Microsoft Sentinel." />

    <AIResponse>
      <p className="text-xs text-white/45 leading-relaxed mb-2">
        Here is the equivalent LSASS credential dumping detection using KQL for Microsoft Sentinel,
        querying Sysmon Event ID 10 (ProcessAccess) from the Event table with XML field extraction.
      </p>

      <CodeBlock language="MICROSOFT SENTINEL (KQL)" languageColor="#0078d4">
        <div><C>{'// LSASS Credential Dumping — Microsoft Sentinel'}</C></div>
        <div><C>{'// Sysmon Event ID 10: Process Access to LSASS'}</C></div>
        <div>&nbsp;</div>
        <div><K>Event</K></div>
        <div><P>|</P> <K>where</K> <F>Source</F> == <S>"Microsoft-Windows-Sysmon"</S></div>
        <div><P>|</P> <K>where</K> <F>EventID</F> == <V>10</V></div>
        <div>&nbsp;</div>
        <div><C>{'// Extract fields from Sysmon XML payload'}</C></div>
        <div><P>|</P> <K>extend</K> <F>TargetImage</F>    = <K>extract</K>(<S>{'@"<Data Name=\'TargetImage\'>(.*?)</Data>"'}</S>, <V>1</V>, <F>EventData</F>)</div>
        <div><P>|</P> <K>extend</K> <F>SourceImage</F>    = <K>extract</K>(<S>{'@"<Data Name=\'SourceImage\'>(.*?)</Data>"'}</S>, <V>1</V>, <F>EventData</F>)</div>
        <div><P>|</P> <K>extend</K> <F>GrantedAccess</F>  = <K>extract</K>(<S>{'@"<Data Name=\'GrantedAccess\'>(.*?)</Data>"'}</S>, <V>1</V>, <F>EventData</F>)</div>
        <div><P>|</P> <K>extend</K> <F>SourceUser</F>     = <K>extract</K>(<S>{'@"<Data Name=\'SourceUser\'>(.*?)</Data>"'}</S>, <V>1</V>, <F>EventData</F>)</div>
        <div>&nbsp;</div>
        <div><C>{'// Target must be LSASS'}</C></div>
        <div><P>|</P> <K>where</K> <F>TargetImage</F> <K>endswith</K> <S>"\\lsass.exe"</S></div>
        <div>&nbsp;</div>
        <div><C>{'// Suspicious access masks for credential dumping'}</C></div>
        <div><P>|</P> <K>where</K> <F>GrantedAccess</F> <K>in</K> (<S>"0x1010"</S>, <S>"0x1410"</S>, <S>"0x1FFFFF"</S>, <S>"0x1438"</S>)</div>
        <div>&nbsp;</div>
        <div><C>{'// Exclude legitimate security products'}</C></div>
        <div><P>|</P> <K>where</K> <F>SourceImage</F> <P>!</P><K>endswith</K> <S>"\\MsMpEng.exe"</S></div>
        <div>{'    '}<K>and</K> <F>SourceImage</F> <P>!</P><K>endswith</K> <S>"\\csfalconservice.exe"</S></div>
        <div>{'    '}<K>and</K> <F>SourceImage</F> <P>!</P><K>endswith</K> <S>"\\SentinelAgent.exe"</S></div>
        <div>{'    '}<K>and</K> <F>SourceImage</F> <P>!</P><K>endswith</K> <S>"\\CylanceSvc.exe"</S></div>
        <div>&nbsp;</div>
        <div><C>{'// Exclude system processes'}</C></div>
        <div><P>|</P> <K>where</K> <F>SourceImage</F> <P>!</P><K>endswith</K> <S>"\\svchost.exe"</S></div>
        <div>{'    '}<K>and</K> <F>SourceImage</F> <P>!</P><K>endswith</K> <S>"\\csrss.exe"</S></div>
        <div>&nbsp;</div>
        <div><P>|</P> <K>summarize</K> <F>Hits</F>=<K>count</K>(), <F>FirstSeen</F>=<K>min</K>(<F>TimeGenerated</F>)</div>
        <div>{'    '}<K>by</K> <F>SourceImage</F>, <F>GrantedAccess</F>, <F>Computer</F>, <F>SourceUser</F></div>
        <div><P>|</P> <K>sort by</K> <F>Hits</F> <K>desc</K></div>
        <div><P>|</P> <K>project</K> <F>Computer</F>, <F>SourceImage</F>, <F>SourceUser</F>, <F>GrantedAccess</F>, <F>Hits</F>, <F>FirstSeen</F></div>
      </CodeBlock>

      <ChatInput />
    </AIResponse>
  </MockupFrame>
);

/* ------------------------------------------------------------------ */
/*  Slide 3 — One-Click Draft                                         */
/* ------------------------------------------------------------------ */

const OneClickDraftMockup = () => (
  <MockupFrame title="CREATE DETECTION FROM AI QUERY" accent={TEAL}>
    <div className="grid md:grid-cols-2 gap-6">
      {/* Left: query preview */}
      <div>
        <div className="mono text-[10px] text-white/30 mb-3 tracking-wider">GENERATED QUERY</div>
        <div className="mono text-[10px] text-white/40 leading-relaxed bg-black/20 rounded-lg p-4 mb-4 border border-white/[0.04] max-h-40 overflow-y-auto">
          <div>#event_simpleName=ProcessAccess</div>
          <div>| TargetImage=/.*\\lsass\.exe/i</div>
          <div>| case {'{'}</div>
          <div>{'    '}GrantedAccess="0x1010" | access_type := "QUERY+VM_READ";</div>
          <div>{'    '}GrantedAccess="0x1FFFFF" | access_type := "ALL_ACCESS";</div>
          <div>{'    '}* | access_type := "other";</div>
          <div>{'}'}</div>
          <div>| access_type != "other"</div>
          <div>| NOT SourceImage IN [/.*\\MsMpEng/i, ...]</div>
          <div>| groupBy([SourceImage, ComputerName], ...)</div>
        </div>

        <div className="mono text-[10px] text-white/30 mb-3 tracking-wider">AI-GENERATED INVESTIGATION STEPS</div>
        {[
          'Verify whether the source process is a known admin or pentest tool in this environment',
          'Check for concurrent credential-related events (4624/4625) from the same host within 5 minutes',
          'Correlate with endpoint telemetry for memory dump artifacts on disk',
          'Review the source user account for recent privilege escalation or lateral movement',
        ].map((s, i) => (
          <div key={i} className="flex gap-2 mb-2 text-xs text-white/35">
            <span className="mono text-white/20 shrink-0">{i + 1}.</span> {s}
          </div>
        ))}
      </div>

      {/* Right: auto-filled metadata */}
      <div>
        <div className="mono text-[10px] text-white/30 mb-3 tracking-wider">AUTO-FILLED METADATA</div>
        <div className="space-y-3">
          {[
            { label: 'Title', value: 'LSASS Credential Dumping via Suspicious Process Access' },
            { label: 'Severity', value: 'CRITICAL', color: 'bg-red-500/15 text-red-400/90' },
            { label: 'MITRE ATT&CK', value: 'T1003.001 (OS Credential Dumping: LSASS Memory)' },
            { label: 'Log Source', value: 'Sysmon / Process Access (Event ID 10)' },
            { label: 'Platforms', value: 'Windows' },
            { label: 'Language', value: 'CrowdStrike LogScale' },
            { label: 'Description', value: 'Detects suspicious process access to LSASS with access masks used by credential dumping tools (Mimikatz, Procdump). Excludes known security products and system processes.' },
            { label: 'FP Guidance', value: 'Legitimate security scanners or EDR agents performing LSASS inspection. Validate against approved tool inventory.' },
          ].map((f) => (
            <div key={f.label} className="flex items-start gap-3">
              <span className="mono text-[9px] text-white/25 w-20 shrink-0 pt-0.5">{f.label}</span>
              <span className="text-xs text-white/50 flex-1">
                {f.color
                  ? <span className={`mono text-[9px] px-1.5 py-0.5 rounded ${f.color}`}>{f.value}</span>
                  : f.value}
              </span>
              <span className="mono text-[8px] px-1 py-0.5 rounded shrink-0" style={{ backgroundColor: `${TEAL}15`, color: `${TEAL}99` }}>AI</span>
            </div>
          ))}
        </div>

        <button
          className="w-full mono text-[11px] px-4 py-3 rounded-lg mt-6 font-bold tracking-wider"
          style={{ backgroundColor: `${ACCENT}25`, color: `${ACCENT}cc` }}
        >
          Open as New Detection Draft &#8594;
        </button>
      </div>
    </div>
  </MockupFrame>
);

/* ------------------------------------------------------------------ */
/*  Slide 4 — Sigma Conversion                                        */
/* ------------------------------------------------------------------ */

const SigmaConversionMockup = () => (
  <MockupFrame title="SIGMA CONVERTER" accent={TEAL}>
    <div className="grid md:grid-cols-2 gap-4">
      {/* Input: Sigma YAML */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="mono text-[10px] text-white/30">INPUT</span>
          <span className="mono text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/35">Sigma YAML</span>
        </div>
        <div className="mono text-[10px] text-white/50 leading-relaxed bg-black/20 rounded-lg p-4 border border-white/[0.04]">
          <div><K>title</K>: LSASS Access from Non-System Account</div>
          <div><K>id</K>: 0xbadc0de-...</div>
          <div><K>status</K>: production</div>
          <div><K>level</K>: critical</div>
          <div><K>logsource</K>:</div>
          <div>{'  '}<K>category</K>: process_access</div>
          <div>{'  '}<K>product</K>: windows</div>
          <div><K>detection</K>:</div>
          <div>{'  '}<K>selection</K>:</div>
          <div>{'    '}TargetImage|endswith: <S>'\lsass.exe'</S></div>
          <div>{'    '}GrantedAccess|contains:</div>
          <div>{'      '}- <S>'0x1010'</S></div>
          <div>{'      '}- <S>'0x1410'</S></div>
          <div>{'      '}- <S>'0x1FFFFF'</S></div>
          <div>{'  '}<K>filter_sysmon</K>:</div>
          <div>{'    '}SourceImage|endswith:</div>
          <div>{'      '}- <S>'\svchost.exe'</S></div>
          <div>{'      '}- <S>'\csrss.exe'</S></div>
          <div>{'  '}<K>condition</K>: selection and not filter_sysmon</div>
        </div>
      </div>

      {/* Output: converted query */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="mono text-[10px] text-white/30">OUTPUT</span>
          <span className="mono text-[9px] px-2 py-0.5 rounded" style={{ backgroundColor: `${BLUE}15`, color: `${BLUE}cc` }}>Splunk SPL &#9662;</span>
        </div>
        <div className="mono text-[10px] text-white/50 leading-relaxed bg-black/20 rounded-lg p-4 border border-white/[0.04]">
          <div><K>source</K>=<S>"WinEventLog:Microsoft-Windows-Sysmon/Operational"</S></div>
          <div><F>EventCode</F>=<V>10</V></div>
          <div><F>TargetImage</F>=<S>"*\\lsass.exe"</S></div>
          <div>(<F>GrantedAccess</F>=<S>"0x1010"</S></div>
          <div>{' '}<P>OR</P> <F>GrantedAccess</F>=<S>"0x1410"</S></div>
          <div>{' '}<P>OR</P> <F>GrantedAccess</F>=<S>"0x1FFFFF"</S>)</div>
          <div><P>NOT</P> (<F>SourceImage</F>=<S>"*\\svchost.exe"</S></div>
          <div>{' '}<P>OR</P> <F>SourceImage</F>=<S>"*\\csrss.exe"</S>)</div>
          <div><P>|</P> <K>stats</K> <K>count</K> <K>by</K> <F>SourceImage</F>, <F>GrantedAccess</F>, <F>Computer</F></div>
          <div><P>|</P> <K>sort</K> - <F>count</F></div>
        </div>
      </div>
    </div>

    {/* Target platforms grid */}
    <div className="mt-5 pt-4 border-t border-white/[0.06]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono text-[10px] text-white/25">14 target platforms:</span>
        {[
          'Splunk SPL', 'KQL (Sentinel)', 'EQL', 'ES|QL', 'Lucene',
          'CrowdStrike (CQL)', 'YARA-L (Chronicle)', 'Carbon Black',
          'Datadog', 'SQL / Snowflake', 'Kibana (Kuery)', 'OpenSearch DSL',
          'QRadar AQL', 'SumoLogic',
        ].map((l) => (
          <span key={l} className="mono text-[8px] px-1.5 py-0.5 rounded bg-white/[0.03] text-white/25">{l}</span>
        ))}
      </div>
      <p className="mono text-[10px] text-white/20 mt-3">
        Runs entirely in your browser via Pyodide + pySigma. No server round-trips. No API keys. Zero latency.
      </p>
    </div>
  </MockupFrame>
);

/* ------------------------------------------------------------------ */
/*  Export                                                             */
/* ------------------------------------------------------------------ */

export const AIQueryFeature: React.FC = () => {
  const [active, setActive] = useState(0);

  const slides = [
    { label: 'Generate Query', content: <GenerateQueryMockup /> },
    { label: 'Multi-Language', content: <MultiLanguageMockup /> },
    { label: 'One-Click Draft', content: <OneClickDraftMockup /> },
    { label: 'Sigma Conversion', content: <SigmaConversionMockup /> },
  ];

  return (
    <FeatureSlide
      headline="AI-powered query generation. Describe the attack, get the detection."
      description="Select your model, pick your SIEM language, describe the threat scenario. Refine iteratively in a chat interface. Auto-fill all detection metadata. Open as a draft with one click."
    >
      <FeatureCarousel slides={slides} activeIndex={active} onSelect={setActive} />
    </FeatureSlide>
  );
};
