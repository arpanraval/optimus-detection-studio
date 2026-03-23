export interface BehaviorPattern {
  label: string;
  patterns: RegExp[];
}

export interface KillChainPhase {
  id: string;
  name: string;
  number: number;
  context: string;
  behaviors: BehaviorPattern[];
}

export const RANSOMWARE_KILL_CHAIN: KillChainPhase[] = [
  {
    id: 'initial_access',
    name: 'Initial Access',
    number: 1,
    context:
      'The entry point. Ransomware operators gain their first foothold through phishing, exposed services, or compromised credentials. Detecting here stops the attack before it starts.',
    behaviors: [
      {
        label: 'Phishing with malicious attachment',
        patterns: [
          /malicious.*attachment/i,
          /suspicious.*email.*attach/i,
          /macro.*enabled/i,
          /ole.*object/i,
        ],
      },
      {
        label: 'Phishing link to payload download',
        patterns: [
          /phishing.*link/i,
          /url.*click.*malware/i,
          /suspicious.*url.*email/i,
        ],
      },
      {
        label: 'Exploitation of public-facing application',
        patterns: [
          /exploit.*public/i,
          /cve-.*exploit/i,
          /webshell/i,
          /web.*shell/i,
        ],
      },
      {
        label: 'RDP brute force / credential stuffing',
        patterns: [
          /rdp.*brute/i,
          /rdp.*failed.*logon/i,
          /credential.*stuff/i,
          /3389.*brute/i,
        ],
      },
      {
        label: 'Compromised VPN/remote access',
        patterns: [
          /vpn.*anomal/i,
          /vpn.*brute/i,
          /remote.*access.*suspicious/i,
        ],
      },
    ],
  },
  {
    id: 'execution',
    name: 'Execution',
    number: 2,
    context:
      'Where the payload runs. Ransomware uses PowerShell, WMI, LOLBins, and Office macros to execute. These are the first signs of active compromise.',
    behaviors: [
      {
        label: 'PowerShell download cradle',
        patterns: [
          /powershell.*(downloadstring|invoke-webrequest|iwr|wget|iex.*net\.webclient)/i,
          /encoded.*command.*powershell/i,
        ],
      },
      {
        label: 'WMI/WMIC remote execution',
        patterns: [
          /wmic.*process.*call.*create/i,
          /wmi.*remote/i,
          /wmiprvse.*spawn/i,
        ],
      },
      {
        label: 'Macro/script execution from Office',
        patterns: [
          /winword.*spawn/i,
          /excel.*child.*process/i,
          /wscript|cscript.*execution/i,
        ],
      },
      {
        label: 'LOLBin proxy execution',
        patterns: [
          /mshta.*http/i,
          /rundll32.*javascript/i,
          /regsvr32.*scrobj/i,
          /certutil.*download/i,
          /bitsadmin.*transfer/i,
          /cmstp.*inf/i,
          /msiexec.*http/i,
        ],
      },
      {
        label: 'DLL sideloading',
        patterns: [
          /dll.*sideload/i,
          /dll.*hijack/i,
          /suspicious.*dll.*load.*path/i,
        ],
      },
      {
        label: 'Scheduled task for payload',
        patterns: [
          /schtasks.*\/create.*cmd|powershell/i,
          /scheduled.*task.*suspicious/i,
        ],
      },
    ],
  },
  {
    id: 'persistence',
    name: 'Persistence',
    number: 3,
    context:
      'How ransomware survives reboots and maintains access. Registry keys, services, scheduled tasks, and startup folders are the classic mechanisms.',
    behaviors: [
      {
        label: 'Registry run key modification',
        patterns: [
          /registry.*run.*key/i,
          /hklm.*\\run\\/i,
          /currentversion.*run.*modify/i,
        ],
      },
      {
        label: 'Service creation for backdoor',
        patterns: [
          /new.*service.*cmd|powershell/i,
          /sc.*create.*binpath/i,
          /suspicious.*service.*install/i,
        ],
      },
      {
        label: 'Scheduled task persistence',
        patterns: [
          /schtasks.*persist/i,
          /scheduled.*task.*creat/i,
        ],
      },
      {
        label: 'Startup folder modification',
        patterns: [
          /startup.*folder.*modif/i,
          /shell:startup/i,
        ],
      },
    ],
  },
  {
    id: 'privilege_escalation',
    name: 'Privilege Escalation',
    number: 4,
    context:
      'Ransomware needs admin rights to disable security tools and encrypt system files. UAC bypass and token manipulation are the common paths.',
    behaviors: [
      {
        label: 'UAC bypass',
        patterns: [
          /uac.*bypass/i,
          /fodhelper/i,
          /eventvwr.*hijack/i,
          /cmstp.*uac/i,
        ],
      },
      {
        label: 'Token manipulation',
        patterns: [
          /token.*manipulat/i,
          /token.*impersonat/i,
          /sedebugprivilege/i,
        ],
      },
      {
        label: 'Local privilege exploitation',
        patterns: [
          /privilege.*escalat/i,
          /local.*exploit.*priv/i,
        ],
      },
    ],
  },
  {
    id: 'defense_evasion',
    name: 'Defense Evasion',
    number: 5,
    context:
      'Ransomware groups invest heavily in evading defenses — killing AV/EDR, clearing logs, bypassing AMSI. If your defenses are blinded, everything downstream goes undetected.',
    behaviors: [
      {
        label: 'AV/EDR process termination',
        patterns: [
          /taskkill.*(msmpeng|defender|mcafee|symantec|crowdstrike|sentinel)/i,
          /kill.*av|edr/i,
          /disable.*tamper.*protect/i,
        ],
      },
      {
        label: 'Disabling Windows Defender',
        patterns: [
          /set-mppreference.*disablerealtimemonitoring/i,
          /defender.*disabl/i,
          /windows.*defender.*off/i,
        ],
      },
      {
        label: 'Clearing event logs',
        patterns: [
          /wevtutil.*cl/i,
          /clear-eventlog/i,
          /event.*log.*clear/i,
        ],
      },
      {
        label: 'Process injection',
        patterns: [
          /process.*inject/i,
          /createremotethread/i,
          /ntwritevirtualmemory/i,
          /hollowing/i,
        ],
      },
      {
        label: 'AMSI bypass',
        patterns: [
          /amsi.*bypass/i,
          /amsiutils/i,
          /amsiinitfailed/i,
        ],
      },
    ],
  },
  {
    id: 'credential_access',
    name: 'Credential Access',
    number: 6,
    context:
      'Credential theft enables lateral movement. LSASS dumping, Kerberoasting, and NTDS theft give attackers the keys to move across your network. A critical phase to detect.',
    behaviors: [
      {
        label: 'LSASS memory dumping',
        patterns: [
          /lsass.*dump|access|memory/i,
          /mimikatz/i,
          /sekurlsa/i,
          /procdump.*lsass/i,
          /comsvcs.*minidump/i,
        ],
      },
      {
        label: 'SAM database extraction',
        patterns: [
          /sam.*dump|extract|hive/i,
          /reg.*save.*sam/i,
        ],
      },
      {
        label: 'NTDS.dit theft',
        patterns: [
          /ntds\.dit/i,
          /ntdsutil/i,
          /vssadmin.*ntds/i,
          /dcsync/i,
        ],
      },
      {
        label: 'Kerberoasting',
        patterns: [
          /kerberoast/i,
          /4769.*rc4|0x17/i,
          /getspn/i,
          /invoke-kerberoast/i,
        ],
      },
      {
        label: 'Credential harvesting from stores',
        patterns: [
          /credential.*harvest|dump.*browser|vault/i,
          /lazagne/i,
          /credential.*manager.*access/i,
        ],
      },
    ],
  },
  {
    id: 'discovery',
    name: 'Discovery',
    number: 7,
    context:
      'Reconnaissance inside the network. Attackers map shares, enumerate AD, and identify backup infrastructure before moving laterally.',
    behaviors: [
      {
        label: 'Network share enumeration',
        patterns: [
          /net.*share/i,
          /net.*view/i,
          /share.*enum/i,
          /smb.*share.*discovery/i,
        ],
      },
      {
        label: 'Domain/AD reconnaissance',
        patterns: [
          /domain.*recon/i,
          /bloodhound/i,
          /sharphound/i,
          /ldap.*enum/i,
          /ad.*recon/i,
        ],
      },
      {
        label: 'System/network info gathering',
        patterns: [
          /systeminfo/i,
          /ipconfig.*\/all/i,
          /whoami.*\/all/i,
          /nltest.*domain/i,
        ],
      },
      {
        label: 'Process/service enumeration',
        patterns: [
          /tasklist/i,
          /sc.*query/i,
          /get-process.*remote/i,
          /wmic.*process.*list/i,
        ],
      },
      {
        label: 'Backup infrastructure reconnaissance',
        patterns: [
          /veeam.*enum/i,
          /backup.*discover/i,
          /wbadmin.*get.*versions/i,
          /get-wbsummary/i,
        ],
      },
    ],
  },
  {
    id: 'lateral_movement',
    name: 'Lateral Movement',
    number: 8,
    context:
      'Moving across the network to maximize impact. RDP, SMB, PsExec, WinRM, and GPO abuse spread the ransomware to every reachable system.',
    behaviors: [
      {
        label: 'RDP with stolen credentials',
        patterns: [
          /rdp.*lateral/i,
          /mstsc.*suspicious/i,
          /rdp.*from.*unusual/i,
        ],
      },
      {
        label: 'SMB/admin share access',
        patterns: [
          /smb.*lateral/i,
          /admin\$.*access/i,
          /c\$.*remote/i,
          /psexec/i,
        ],
      },
      {
        label: 'Remote service creation',
        patterns: [
          /sc.*\\\\.*create/i,
          /remote.*service.*creat/i,
          /psexec.*service/i,
        ],
      },
      {
        label: 'WinRM exploitation',
        patterns: [
          /winrm.*lateral/i,
          /invoke-command.*remote/i,
          /evil-winrm/i,
          /wsman/i,
        ],
      },
      {
        label: 'GPO abuse for mass deployment',
        patterns: [
          /gpo.*abuse/i,
          /group.*policy.*malicious/i,
          /gpo.*scheduled.*task/i,
          /sysvol.*script/i,
        ],
      },
      {
        label: 'Pass-the-hash/ticket',
        patterns: [
          /pass.*the.*hash/i,
          /overpass.*the.*hash/i,
          /pass.*the.*ticket/i,
          /pth|ptt/i,
        ],
      },
    ],
  },
  {
    id: 'collection',
    name: 'Collection & Staging',
    number: 9,
    context:
      'Data gathering before exfiltration. Attackers stage files centrally and create archives for efficient theft — the precursor to double extortion.',
    behaviors: [
      {
        label: 'Data staging to central location',
        patterns: [
          /data.*stag/i,
          /copy.*\\\\.*share/i,
          /robocopy.*mass/i,
          /xcopy.*\/s/i,
        ],
      },
      {
        label: 'Archive creation for exfil',
        patterns: [
          /7z.*a.*-p/i,
          /rar.*a.*-hp/i,
          /compress-archive/i,
          /makecab/i,
        ],
      },
      {
        label: 'Targeted file collection',
        patterns: [
          /collect.*file.*(docx|xlsx|pdf|pst)/i,
          /file.*harvest/i,
        ],
      },
    ],
  },
  {
    id: 'exfiltration',
    name: 'Exfiltration (Double Extortion)',
    number: 10,
    context:
      'Data theft before encryption. Modern ransomware steals data first for leverage — if you don\'t pay, they publish. Detecting exfiltration is your last chance before impact.',
    behaviors: [
      {
        label: 'Upload to cloud storage',
        patterns: [
          /rclone/i,
          /mega.*upload|sync/i,
          /cloud.*exfil/i,
          /azcopy/i,
          /aws.*s3.*cp/i,
        ],
      },
      {
        label: 'Exfiltration over C2',
        patterns: [
          /exfil.*c2|command.*control/i,
          /data.*exfil.*beacon/i,
        ],
      },
      {
        label: 'Large outbound data transfer',
        patterns: [
          /large.*upload|transfer/i,
          /data.*volume.*anomal/i,
          /outbound.*spike/i,
        ],
      },
    ],
  },
  {
    id: 'impact',
    name: 'Impact',
    number: 11,
    context:
      'The endgame — encryption, recovery destruction, and ransom note deployment. If you detect here, the damage is already done. Every earlier phase detection is more valuable.',
    behaviors: [
      {
        label: 'Shadow copy deletion',
        patterns: [
          /vssadmin.*delete.*shadows/i,
          /wmic.*shadowcopy.*delete/i,
          /shadow.*cop(y|ies).*delet/i,
        ],
      },
      {
        label: 'Recovery mode disabling',
        patterns: [
          /bcdedit.*\/set.*recoveryenabled.*no/i,
          /bcdedit.*safeboot/i,
          /recovery.*disabl/i,
        ],
      },
      {
        label: 'Mass file encryption',
        patterns: [
          /encrypt.*mass|bulk|ransom/i,
          /file.*extension.*changed.*mass/i,
          /ransom.*encrypt/i,
        ],
      },
      {
        label: 'Ransom note deployment',
        patterns: [
          /ransom.*note/i,
          /readme.*ransom|decrypt/i,
          /how.*to.*decrypt/i,
        ],
      },
      {
        label: 'Backup destruction (beyond shadow copies)',
        patterns: [
          /wbadmin.*delete/i,
          /veeam.*delet/i,
          /delete.*backup.*catalog/i,
        ],
      },
      {
        label: 'Service/process stopping before encryption',
        patterns: [
          /net.*stop.*sql|exchange|backup/i,
          /taskkill.*sql|oracle|veeam/i,
          /stop.*service.*before.*encrypt/i,
        ],
      },
    ],
  },
];

export const RANSOMWARE_ADJACENT_TECHNIQUES = new Set([
  'T1566', 'T1566.001', 'T1566.002',
  'T1190', 'T1133', 'T1078',
  'T1059', 'T1059.001', 'T1059.003',
  'T1204', 'T1204.001', 'T1204.002',
  'T1047',
  'T1547', 'T1547.001',
  'T1543', 'T1543.003',
  'T1053', 'T1053.005',
  'T1548', 'T1548.002',
  'T1055', 'T1134',
  'T1562', 'T1562.001',
  'T1070', 'T1070.001',
  'T1027', 'T1036', 'T1036.005',
  'T1218', 'T1218.011',
  'T1003', 'T1003.001', 'T1003.002', 'T1003.003',
  'T1555', 'T1558', 'T1558.003',
  'T1082', 'T1083', 'T1018', 'T1016', 'T1049', 'T1135',
  'T1021', 'T1021.001', 'T1021.002', 'T1021.006',
  'T1570', 'T1080',
  'T1560',
  'T1567', 'T1567.002', 'T1048', 'T1041',
  'T1486', 'T1490', 'T1489', 'T1485', 'T1529',
]);
