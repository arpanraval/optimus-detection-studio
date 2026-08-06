import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { useThreatIntel } from '../../context/ThreatIntelContext';
import { digestThreatReport, LLM_MODELS, DEFAULT_MODEL } from '../../lib/aiService';
import {
  ThreatReport,
  ThreatIntelSession,
  ProcessingStage,
  PROCESSING_STAGES,
  generateReportId,
  ThreatLevel,
  AttackType,
  ExtractedTTP,
  ExtractedIoC,
  IoCType,
  IoCCategory,
  TTPSourceType,
  ExtractedRule,
  ExtractedRuleType,
} from '../../types/threatIntel';

// =============================================================================
// MOCK DATA
// =============================================================================

const createMockReport = (sourceUrl?: string): ThreatReport => {
  const mockTTPs: ExtractedTTP[] = [
    { id: '1', mitreId: 'T1566.001', techniqueName: 'Spearphishing Attachment', tacticName: 'Initial Access', tacticId: 'TA0001', sourceType: TTPSourceType.Explicit, confidence: 'high', evidence: 'Weaponized Word documents via phishing emails', explanation: 'Phishing with malicious attachments', isSubTechnique: true, parentTechniqueId: 'T1566', hasExistingDetection: true, existingDetectionCount: 3 },
    { id: '2', mitreId: 'T1059.001', techniqueName: 'PowerShell', tacticName: 'Execution', tacticId: 'TA0002', sourceType: TTPSourceType.Explicit, confidence: 'high', evidence: 'PowerShell command execution', explanation: 'PowerShell for payload delivery', isSubTechnique: true, parentTechniqueId: 'T1059', hasExistingDetection: true, existingDetectionCount: 5 },
    { id: '3', mitreId: 'T1574.002', techniqueName: 'DLL Side-Loading', tacticName: 'Persistence', tacticId: 'TA0003', sourceType: TTPSourceType.Contextual, confidence: 'medium', evidence: 'Legitimate app loads malicious DLL', explanation: 'DLL side-loading for persistence', isSubTechnique: true, parentTechniqueId: 'T1574', hasExistingDetection: false, existingDetectionCount: 0 },
    { id: '4', mitreId: 'T1071.001', techniqueName: 'Web Protocols', tacticName: 'Command and Control', tacticId: 'TA0011', sourceType: TTPSourceType.Explicit, confidence: 'high', evidence: 'HTTPS C2 communication', explanation: 'HTTPS for C2', isSubTechnique: true, parentTechniqueId: 'T1071', hasExistingDetection: false, existingDetectionCount: 0 },
    { id: '5', mitreId: 'T1027', techniqueName: 'Obfuscated Files', tacticName: 'Defense Evasion', tacticId: 'TA0005', sourceType: TTPSourceType.Contextual, confidence: 'medium', evidence: 'XOR-encoded payload', explanation: 'Obfuscation for evasion', isSubTechnique: false, hasExistingDetection: true, existingDetectionCount: 2 },
    { id: '6', mitreId: 'T1053.005', techniqueName: 'Scheduled Task', tacticName: 'Persistence', tacticId: 'TA0003', sourceType: TTPSourceType.Explicit, confidence: 'high', evidence: 'Scheduled task for persistence', explanation: 'Task scheduler abuse', isSubTechnique: true, parentTechniqueId: 'T1053', hasExistingDetection: true, existingDetectionCount: 4 },
  ];

  const mockIoCs: ExtractedIoC[] = [
    { id: '1', type: IoCType.SHA256, category: IoCCategory.Hashes, value: 'a3f2b4c5d6e7f890123456789abcdef0123456789abcdef0123456789abcdef0', severity: 'malicious', context: 'Dropper' },
    { id: '2', type: IoCType.Domain, category: IoCCategory.Network, value: 'update-service[.]com', severity: 'malicious', context: 'C2' },
    { id: '3', type: IoCType.IPv4, category: IoCCategory.Network, value: '185.123.45.67', severity: 'malicious', context: 'C2' },
    { id: '4', type: IoCType.FilePath, category: IoCCategory.Files, value: 'C:\\Users\\Public\\svchost.dll', severity: 'malicious', context: 'Payload' },
  ];

  const mockRules: ExtractedRule[] = [
    { id: '1', type: ExtractedRuleType.Sigma, name: 'Suspicious Scheduled Task', content: 'title: Suspicious Task\ndetection:\n  selection:\n    CommandLine|contains: schtasks', description: 'Detects suspicious scheduled task' },
  ];

  return {
    id: generateReportId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // Fixture data, fully populated by construction.
    outcome: 'complete',
    sourceQuality: 'full_article',
    sourceType: 'url',
    sourceUrl,
    summary: {
      title: 'APT29 Targets European Diplomatic Entities',
      publishDate: '2024-12-15',
      author: 'Threat Research',
      organization: 'Unit 42',
      executiveSummary: 'Campaign targeting European diplomatic organizations using spearphishing.',
      keyFindings: ['Targets diplomatic entities', 'Novel backdoor', 'DLL side-loading'],
      threatLevel: ThreatLevel.High,
      targetedIndustries: ['Government'],
      targetedRegions: ['Europe'],
    },
    classification: { primaryType: AttackType.APT, secondaryTypes: [], confidence: 'high', reasoning: 'APT indicators' },
    ttps: mockTTPs,
    iocs: mockIoCs,
    rules: mockRules,
    mitreMapping: {
      matchedGroups: [{ stixId: 'intrusion-set--xxx', mitreId: 'G0016', name: 'APT29', type: 'intrusion-set', matchConfidence: 'high', matchReason: 'Attribution', existsInDb: true }],
      matchedCampaigns: [],
      matchedSoftware: [],
      matchedTechniques: [],
      tacticCoverage: [],
    },
    libraryMatches: [],
    processingStage: ProcessingStage.Complete,
    processingDurationMs: 5000,
  };
};

// =============================================================================
// PREFILLED REPORTS (for demo/testing)
// =============================================================================

const REACT2SHELL_REPORT_ID = 'prefilled_react2shell_cve_2025_55182';

const createReact2ShellReport = (): ThreatReport => {
  const ttps: ExtractedTTP[] = [
    {
      id: 'r2s-1',
      mitreId: 'T1190',
      techniqueName: 'Exploit Public-Facing Application',
      tacticName: 'Initial Access',
      tacticId: 'TA0001',
      sourceType: TTPSourceType.Explicit,
      confidence: 'high',
      evidence: 'CVE-2025-55182 exploits React Server Components through malicious serialized payloads in HTTP requests',
      explanation: 'The vulnerability allows attackers to exploit web applications using React Server Components by sending crafted serialized payloads that achieve remote code execution',
      isSubTechnique: false,
      hasExistingDetection: false,
      existingDetectionCount: 0,
    },
    {
      id: 'r2s-2',
      mitreId: 'T1059.007',
      techniqueName: 'JavaScript',
      tacticName: 'Execution',
      tacticId: 'TA0002',
      sourceType: TTPSourceType.Explicit,
      confidence: 'high',
      evidence: 'Payload executes arbitrary JavaScript code on the server through unsafe deserialization of Server Components',
      explanation: 'The exploit leverages JavaScript execution capabilities in Node.js environments running React Server Components',
      isSubTechnique: true,
      parentTechniqueId: 'T1059',
      hasExistingDetection: true,
      existingDetectionCount: 2,
    },
    {
      id: 'r2s-3',
      mitreId: 'T1055',
      techniqueName: 'Process Injection',
      tacticName: 'Defense Evasion',
      tacticId: 'TA0005',
      sourceType: TTPSourceType.Contextual,
      confidence: 'medium',
      evidence: 'Post-exploitation payloads observed injecting into Node.js child processes',
      explanation: 'After initial code execution, attackers inject malicious code into spawned Node.js processes to evade detection',
      isSubTechnique: false,
      hasExistingDetection: false,
      existingDetectionCount: 0,
    },
    {
      id: 'r2s-4',
      mitreId: 'T1071.001',
      techniqueName: 'Web Protocols',
      tacticName: 'Command and Control',
      tacticId: 'TA0011',
      sourceType: TTPSourceType.Explicit,
      confidence: 'high',
      evidence: 'C2 communication established via WebSocket connections disguised as legitimate RSC streaming',
      explanation: 'Attackers use WebSocket connections that mimic React Server Component streaming protocol for C2',
      isSubTechnique: true,
      parentTechniqueId: 'T1071',
      hasExistingDetection: false,
      existingDetectionCount: 0,
    },
    {
      id: 'r2s-5',
      mitreId: 'T1105',
      techniqueName: 'Ingress Tool Transfer',
      tacticName: 'Command and Control',
      tacticId: 'TA0011',
      sourceType: TTPSourceType.Contextual,
      confidence: 'medium',
      evidence: 'Secondary payloads downloaded via fetch() calls within injected code',
      explanation: 'Additional tooling and payloads are transferred to compromised servers using built-in Node.js fetch capabilities',
      isSubTechnique: false,
      hasExistingDetection: true,
      existingDetectionCount: 3,
    },
    {
      id: 'r2s-6',
      mitreId: 'T1560.001',
      techniqueName: 'Archive via Utility',
      tacticName: 'Collection',
      tacticId: 'TA0009',
      sourceType: TTPSourceType.Contextual,
      confidence: 'low',
      evidence: 'Observed use of tar and gzip for staging exfiltrated data',
      explanation: 'Attackers archive collected data before exfiltration using standard compression utilities',
      isSubTechnique: true,
      parentTechniqueId: 'T1560',
      hasExistingDetection: true,
      existingDetectionCount: 1,
    },
    {
      id: 'r2s-7',
      mitreId: 'T1041',
      techniqueName: 'Exfiltration Over C2 Channel',
      tacticName: 'Exfiltration',
      tacticId: 'TA0010',
      sourceType: TTPSourceType.Contextual,
      confidence: 'medium',
      evidence: 'Sensitive application data exfiltrated through established WebSocket C2 channel',
      explanation: 'Data exfiltration leverages the same WebSocket channel used for C2 communication',
      isSubTechnique: false,
      hasExistingDetection: false,
      existingDetectionCount: 0,
    },
    {
      id: 'r2s-8',
      mitreId: 'T1003.007',
      techniqueName: 'Proc Filesystem',
      tacticName: 'Credential Access',
      tacticId: 'TA0006',
      sourceType: TTPSourceType.Explicit,
      confidence: 'high',
      evidence: 'Environment variables containing secrets accessed via /proc/self/environ',
      explanation: 'Attackers read process environment variables to extract API keys, database credentials, and secrets',
      isSubTechnique: true,
      parentTechniqueId: 'T1003',
      hasExistingDetection: true,
      existingDetectionCount: 2,
    },
  ];

  const iocs: ExtractedIoC[] = [
    { id: 'r2s-ioc-1', type: IoCType.CVE, category: IoCCategory.Vulnerabilities, value: 'CVE-2025-55182', severity: 'malicious', context: 'React2Shell vulnerability' },
    { id: 'r2s-ioc-2', type: IoCType.Domain, category: IoCCategory.Network, value: 'rsc-stream[.]io', severity: 'malicious', context: 'C2 domain mimicking RSC' },
    { id: 'r2s-ioc-3', type: IoCType.Domain, category: IoCCategory.Network, value: 'react-cdn-cache[.]com', severity: 'malicious', context: 'Payload delivery' },
    { id: 'r2s-ioc-4', type: IoCType.Domain, category: IoCCategory.Network, value: 'nextjs-telemetry[.]net', severity: 'suspicious', context: 'Suspected staging' },
    { id: 'r2s-ioc-5', type: IoCType.IPv4, category: IoCCategory.Network, value: '198.51.100.47', severity: 'malicious', context: 'Primary C2 server' },
    { id: 'r2s-ioc-6', type: IoCType.IPv4, category: IoCCategory.Network, value: '203.0.113.89', severity: 'malicious', context: 'Secondary C2 server' },
    { id: 'r2s-ioc-7', type: IoCType.SHA256, category: IoCCategory.Hashes, value: '8d4e7f2a9b1c3e5d6f8a0b2c4e6f8a0b2c4e6f8a0b2c4e6f8a0b2c4e6f8a0b2c', severity: 'malicious', context: 'Initial exploit payload' },
    { id: 'r2s-ioc-8', type: IoCType.SHA256, category: IoCCategory.Hashes, value: 'c3a2b1e4d5f6789012345678abcdef0123456789abcdef0123456789abcdef01', severity: 'malicious', context: 'Secondary dropper' },
    { id: 'r2s-ioc-9', type: IoCType.FilePath, category: IoCCategory.Files, value: '/tmp/.rsc_cache', severity: 'malicious', context: 'Malware staging directory' },
    { id: 'r2s-ioc-10', type: IoCType.FilePath, category: IoCCategory.Files, value: '/var/tmp/.next-telemetry', severity: 'malicious', context: 'Persistence location' },
    { id: 'r2s-ioc-11', type: IoCType.ProcessName, category: IoCCategory.Windows, value: 'node --experimental-loader', severity: 'suspicious', context: 'Loader hijacking' },
    { id: 'r2s-ioc-12', type: IoCType.URL, category: IoCCategory.Network, value: 'wss://rsc-stream[.]io/v1/flight', severity: 'malicious', context: 'WebSocket C2 endpoint' },
    { id: 'r2s-ioc-13', type: IoCType.UserAgent, category: IoCCategory.Network, value: 'React-Server-Components/1.0 (Flight Protocol)', severity: 'suspicious', context: 'Spoofed user agent' },
  ];

  const rules: ExtractedRule[] = [
    {
      id: 'r2s-rule-1',
      type: ExtractedRuleType.Sigma,
      name: 'React2Shell CVE-2025-55182 Exploitation Attempt',
      content: `title: React2Shell CVE-2025-55182 Exploitation Attempt
id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
status: experimental
description: Detects potential exploitation of CVE-2025-55182 in React Server Components
references:
  - https://www.microsoft.com/en-us/security/blog/2025/12/15/defending-against-the-cve-2025-55182-react2shell-vulnerability-in-react-server-components/
logsource:
  category: webserver
detection:
  selection:
    cs-uri-query|contains:
      - '__rsc_action'
      - '__flight_data'
    cs-method: POST
  condition: selection
falsepositives:
  - Legitimate React Server Component requests
level: high
tags:
  - attack.initial_access
  - attack.t1190
  - cve.2025.55182`,
      description: 'Detects HTTP requests that may indicate exploitation of the React2Shell vulnerability'
    },
    {
      id: 'r2s-rule-2',
      type: ExtractedRuleType.Sigma,
      name: 'Node.js Process Environment Variable Access',
      content: `title: Node.js Process Environment Variable Access
id: b2c3d4e5-f6a7-8901-bcde-f23456789012
status: experimental
description: Detects suspicious access to /proc/self/environ in Node.js processes
logsource:
  product: linux
  category: file_access
detection:
  selection:
    process.name|endswith: 'node'
    file.path|contains: '/proc/self/environ'
  condition: selection
level: medium
tags:
  - attack.credential_access
  - attack.t1003.007`,
      description: 'Detects potential credential harvesting from Node.js process environment'
    },
    {
      id: 'r2s-rule-3',
      type: ExtractedRuleType.KQL,
      name: 'React2Shell WebSocket C2 Detection',
      content: `// Detect potential React2Shell C2 WebSocket connections
DeviceNetworkEvents
| where RemoteUrl has_any ("rsc-stream", "react-cdn-cache", "nextjs-telemetry")
| where RemotePort in (443, 8443)
| where InitiatingProcessFileName == "node.exe" or InitiatingProcessFileName == "node"
| project Timestamp, DeviceName, RemoteUrl, RemoteIP, InitiatingProcessCommandLine
| summarize ConnectionCount=count() by DeviceName, RemoteUrl, bin(Timestamp, 1h)
| where ConnectionCount > 10`,
      description: 'KQL query for Microsoft Defender to detect React2Shell C2 activity'
    },
  ];

  return {
    id: REACT2SHELL_REPORT_ID,
    createdAt: '2025-12-15T09:00:00Z',
    updatedAt: '2025-12-15T09:00:00Z',
    // Fixture data, fully populated by construction.
    outcome: 'complete',
    sourceQuality: 'full_article',
    sourceType: 'url',
    sourceUrl: 'https://www.microsoft.com/en-us/security/blog/2025/12/15/defending-against-the-cve-2025-55182-react2shell-vulnerability-in-react-server-components/',
    summary: {
      title: 'Defending Against the CVE-2025-55182 React2Shell Vulnerability in React Server Components',
      publishDate: '2025-12-15',
      author: 'Microsoft Threat Intelligence',
      organization: 'Microsoft Security',
      executiveSummary: 'Microsoft has identified active exploitation of CVE-2025-55182, dubbed "React2Shell", a critical remote code execution vulnerability affecting React Server Components. This vulnerability allows attackers to execute arbitrary code on servers running React applications that use Server Components by sending specially crafted serialized payloads. Multiple threat actors have been observed exploiting this vulnerability in the wild, targeting enterprise applications built with Next.js and other React Server Component implementations.',
      keyFindings: [
        'Critical RCE vulnerability (CVSS 9.8) affecting React Server Components',
        'Active exploitation observed targeting Next.js applications',
        'Exploitation requires no authentication and can be triggered via HTTP requests',
        'Post-exploitation includes credential theft from environment variables',
        'C2 infrastructure mimics legitimate React Server Component traffic patterns',
        'Affects React 18+ with Server Components enabled',
      ],
      threatLevel: ThreatLevel.Critical,
      targetedIndustries: ['Technology', 'Financial Services', 'E-commerce', 'SaaS Providers'],
      targetedRegions: ['North America', 'Europe', 'Asia Pacific'],
      attackTimeline: {
        firstSeen: '2025-11-28',
        lastSeen: '2025-12-14',
        duration: '17 days',
      },
    },
    classification: {
      primaryType: AttackType.ZeroDay,
      secondaryTypes: [AttackType.SupplyChain],
      confidence: 'high',
      reasoning: 'Novel vulnerability in widely-used framework with active exploitation before patch availability. Supply chain implications due to framework prevalence in enterprise applications.',
    },
    ttps,
    iocs,
    rules,
    mitreMapping: {
      matchedGroups: [],
      matchedCampaigns: [],
      matchedSoftware: [
        {
          stixId: 'malware--react2shell',
          mitreId: 'S9999',
          name: 'React2Shell',
          type: 'malware',
          matchConfidence: 'high',
          matchReason: 'Novel exploit framework specifically targeting React Server Components',
          existsInDb: false,
        }
      ],
      matchedTechniques: [],
      tacticCoverage: [
        { tacticId: 'TA0001', tacticName: 'Initial Access', techniqueCount: 1, techniques: ['T1190'] },
        { tacticId: 'TA0002', tacticName: 'Execution', techniqueCount: 1, techniques: ['T1059.007'] },
        { tacticId: 'TA0005', tacticName: 'Defense Evasion', techniqueCount: 1, techniques: ['T1055'] },
        { tacticId: 'TA0006', tacticName: 'Credential Access', techniqueCount: 1, techniques: ['T1003.007'] },
        { tacticId: 'TA0009', tacticName: 'Collection', techniqueCount: 1, techniques: ['T1560.001'] },
        { tacticId: 'TA0010', tacticName: 'Exfiltration', techniqueCount: 1, techniques: ['T1041'] },
        { tacticId: 'TA0011', tacticName: 'Command and Control', techniqueCount: 2, techniques: ['T1071.001', 'T1105'] },
      ],
    },
    libraryMatches: [],
    processingStage: ProcessingStage.Complete,
    processingDurationMs: 4200,
  };
};

// =============================================================================
// COMPONENT
// =============================================================================

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (reportId: string) => void;
}

export const DigestNewReportModal: React.FC<Props> = ({ isOpen, onClose, onComplete }) => {
  const { showToast } = useToast();
  const { saveReport } = useThreatIntel();
  const [mode, setMode] = useState<'url' | 'paste'>('url');
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reset = () => {
    setUrl('');
    setContent('');
    setProcessing(false);
    setStage(0);
    setShowCancelConfirm(false);
    // Don't reset model - keep user preference
  };

  // Handle attempt to close during processing
  const handleCloseAttempt = useCallback(() => {
    if (processing) {
      setShowCancelConfirm(true);
    } else {
      abortRef.current?.abort();
      reset();
      onClose();
    }
  }, [processing, onClose]);

  // Confirm cancel during processing
  const handleConfirmCancel = () => {
    abortRef.current?.abort();
    reset();
    onClose();
  };

  // Handle Escape key - prevent during processing
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCloseAttempt();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleCloseAttempt]);

  const handleClose = () => {
    handleCloseAttempt();
  };

  const handleAnalyze = async () => {
    const input = mode === 'url' ? url.trim() : content.trim();
    if (!input) return;

    setProcessing(true);
    setStage(0);
    abortRef.current = new AbortController();

    // Simulate stage progression while API processes
    const stageInterval = setInterval(() => {
      setStage(prev => {
        // Don't go past stage 6 until we get response
        if (prev < PROCESSING_STAGES.length - 2) return prev + 1;
        return prev;
      });
    }, 2500); // Move to next stage every 2.5 seconds

    try {
      // Call the real edge function
      const response = await digestThreatReport({
        sourceType: mode,
        url: mode === 'url' ? input : undefined,
        content: mode === 'paste' ? input : undefined,
        model,
      });

      clearInterval(stageInterval);

      if (abortRef.current?.signal.aborted) return;

      if (!response.success || !response.report) {
        throw new Error(response.error || 'Analysis failed');
      }

      // Show final stages completing
      setStage(PROCESSING_STAGES.length - 1);

      const report = response.report;
      const session: ThreatIntelSession = {
        id: crypto.randomUUID(),
        name: report.summary?.title || 'Untitled Report',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        report,
        selectedTTPIds: [],
        selectedIoCIds: [],
        createdDetectionIds: [],
        updatedEntities: [],
      };

      // Save to database via context
      await saveReport(session);

      // Small delay to show completion
      await new Promise(r => setTimeout(r, 500));

      showToast('success', 'Analysis Complete', `${report.ttps?.length || 0} TTPs, ${report.iocs?.length || 0} IoCs extracted`);
      setTimeout(() => onComplete(session.id), 200);
    } catch (e: any) {
      clearInterval(stageInterval);
      if (!abortRef.current?.signal.aborted) {
        console.error('Analysis error:', e);
        showToast('error', 'Analysis Failed', e.message || 'Failed to analyze report');
        setProcessing(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop - prevent click during processing */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity ${processing ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={handleCloseAttempt}
      />

      {/* Cancel Confirmation Dialog */}
      {showCancelConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center" role="alertdialog" aria-modal="true" aria-labelledby="cancel-dialog-title" aria-describedby="cancel-dialog-desc">
          <div className="bg-surface-container rounded-xl shadow-2xl p-6 max-w-sm mx-4 border border-outline-variant/30">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center">
                <Icon name="alert-triangle" className="w-5 h-5 text-error" />
              </div>
              <div>
                <h3 id="cancel-dialog-title" className="text-on-surface font-semibold">Cancel Analysis?</h3>
                <p className="text-on-surface-variant text-sm">Progress will be lost</p>
              </div>
            </div>
            <p id="cancel-dialog-desc" className="text-on-surface-variant text-sm mb-6">
              The AI is still analyzing the report. Are you sure you want to cancel?
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="text" color="surface" onClick={handleConfirmCancel}>
                Yes, Cancel
              </Button>
              <Button color="primary" onClick={() => setShowCancelConfirm(false)}>
                Continue Analysis
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="relative w-full max-w-lg bg-surface-container rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <h2 className="text-lg font-semibold text-on-surface">Analyze Report</h2>
          <Button
            variant="text"
            color="surface"
            size="sm"
            leadingIcon="x"
            onClick={handleCloseAttempt}
          >
            Close
          </Button>
        </div>

        {!processing ? (
          <>
            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Mode Toggle */}
              <div className="flex gap-2 p-1 bg-surface-container-high rounded-lg" role="tablist" aria-label="Input method">
                <button
                  role="tab"
                  aria-selected={mode === 'url'}
                  aria-controls="url-input"
                  onClick={() => setMode('url')}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                    mode === 'url' ? 'bg-surface-container text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  URL
                </button>
                <button
                  role="tab"
                  aria-selected={mode === 'paste'}
                  aria-controls="paste-input"
                  onClick={() => setMode('paste')}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                    mode === 'paste' ? 'bg-surface-container text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Paste Content
                </button>
              </div>

              {/* Input */}
              {mode === 'url' ? (
                <div id="url-input" role="tabpanel" aria-labelledby="url-tab">
                  <label htmlFor="report-url" className="sr-only">Report URL</label>
                  <input
                    id="report-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-4 py-3 bg-surface-container-high border border-outline-variant/30 rounded-lg
                             text-on-surface placeholder:text-on-surface-variant/50 text-sm
                             focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    autoFocus
                  />
                </div>
              ) : (
                <div id="paste-input" role="tabpanel" aria-labelledby="paste-tab">
                  <label htmlFor="report-content" className="sr-only">Report content</label>
                  <textarea
                    id="report-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Paste threat intelligence report content..."
                    rows={6}
                    className="w-full px-4 py-3 bg-surface-container-high border border-outline-variant/30 rounded-lg
                             text-on-surface placeholder:text-on-surface-variant/50 text-sm resize-none
                             focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    autoFocus
                  />
                </div>
              )}

              {/* Model Selector */}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1.5">AI Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface-container-high border border-outline-variant/30 rounded-lg
                           text-on-surface text-sm focus:outline-none focus:border-primary/50 cursor-pointer"
                >
                  {LLM_MODELS.filter(m => m.capabilities.json).map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.provider})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-on-surface-variant/60 mt-1">
                  {LLM_MODELS.find(m => m.id === model)?.description}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-outline-variant/20">
              <Button variant="text" color="surface" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                color="primary"
                leadingIcon="star"
                onClick={handleAnalyze}
                disabled={mode === 'url' ? !url.trim() : !content.trim()}
              >
                Analyze
              </Button>
            </div>
          </>
        ) : (
          /* Processing Pipeline - Improved Design */
          <div className="p-6">
            {/* Pipeline Header with animated gradient */}
            <div className="flex items-center gap-4 mb-6 pb-4 border-b border-outline-variant/10">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-tertiary/20 flex items-center justify-center">
                  <Icon name="star" className="w-6 h-6 text-primary" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-gradient-to-br from-primary to-tertiary rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                </div>
              </div>
              <div className="flex-1">
                <p className="text-on-surface font-semibold text-lg">Analyzing Report</p>
                <p className="text-on-surface-variant text-sm">
                  {PROCESSING_STAGES[stage]?.activeLabel || 'Processing...'}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">{Math.round(((stage + 1) / PROCESSING_STAGES.length) * 100)}%</div>
              </div>
            </div>

            {/* Pipeline Stages - Vertical Timeline */}
            <div className="relative">
              {/* Connecting Line */}
              <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-outline-variant/20" />
              <div
                className="absolute left-[19px] top-4 w-0.5 bg-gradient-to-b from-tertiary to-primary transition-all duration-500 ease-out"
                style={{ height: `${Math.max(0, ((stage) / (PROCESSING_STAGES.length - 1)) * 100)}%` }}
              />

              <div className="space-y-1">
                {PROCESSING_STAGES.map((s, i) => {
                  const isActive = i === stage;
                  const isComplete = i < stage;
                  const isPending = i > stage;

                  return (
                    <div
                      key={s.id}
                      className={`
                        relative flex items-center gap-4 py-2.5 px-3 rounded-xl transition-all duration-300
                        ${isActive ? 'bg-primary/5' : ''}
                        ${isComplete ? 'bg-tertiary/5' : ''}
                      `}
                    >
                      {/* Status Node */}
                      <div className={`
                        relative z-10 w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300
                        ${isComplete ? 'bg-tertiary text-white shadow-lg shadow-tertiary/25' : ''}
                        ${isActive ? 'bg-primary text-white shadow-lg shadow-primary/25 scale-110' : ''}
                        ${isPending ? 'bg-surface-container-high text-on-surface-variant/40 border border-outline-variant/30' : ''}
                      `}>
                        {isComplete ? (
                          <Icon name="check" className="w-5 h-5" />
                        ) : isActive ? (
                          <div className="relative">
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          </div>
                        ) : (
                          <span className="text-sm font-semibold">{i + 1}</span>
                        )}
                      </div>

                      {/* Label & Description */}
                      <div className="flex-1 min-w-0">
                        <p className={`
                          text-sm font-medium transition-colors duration-300
                          ${isComplete ? 'text-tertiary' : ''}
                          ${isActive ? 'text-on-surface' : ''}
                          ${isPending ? 'text-on-surface-variant/50' : ''}
                        `}>
                          {isActive ? s.activeLabel : s.label}
                        </p>
                      </div>

                      {/* Status Indicator */}
                      <div className="flex-shrink-0">
                        {isComplete && (
                          <div className="flex items-center gap-1.5 text-tertiary">
                            <Icon name="check-circle" className="w-4 h-4" />
                          </div>
                        )}
                        {isActive && (
                          <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-6 pt-4 border-t border-outline-variant/10">
              <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-tertiary via-primary to-tertiary rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                  style={{ width: `${((stage + 1) / PROCESSING_STAGES.length) * 100}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-on-surface-variant">
                  Step {stage + 1} of {PROCESSING_STAGES.length}
                </span>
                <span className="text-xs text-on-surface-variant">
                  {PROCESSING_STAGES[stage]?.label}
                </span>
              </div>
            </div>

            {/* Cancel Button */}
            <div className="mt-6 flex justify-center">
              <Button
                color="error"
                variant="outlined"
                leadingIcon="x"
                onClick={handleCloseAttempt}
              >
                Cancel Analysis
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DigestNewReportModal;
