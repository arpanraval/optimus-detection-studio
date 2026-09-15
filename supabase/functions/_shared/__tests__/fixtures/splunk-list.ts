// CONSTRUCTED FROM DOCS — not captured from a live tenant. Source:
// https://help.splunk.com/en/splunk-enterprise-security-7/administer/7.2/correlation-searches/list-correlation-searches-in-splunk-enterprise-security
// https://help.splunk.com/en/splunk-enterprise/leverage-rest-apis/rest-api-user-manual/9.4/rest-api-user-manual/basic-concepts-about-the-splunk-platform-rest-api
import type { SplunkEntry } from '../../siem-readers/splunk.ts';

/** Same name in two different apps/owners -- must NOT collide once owner is part of identity. */
export const SPLUNK_SAME_NAME_TWO_APPS: SplunkEntry[] = [
  {
    name: 'Excessive Failed Logins - Rule',
    acl: { app: 'SplunkEnterpriseSecuritySuite', owner: 'nobody', sharing: 'app' },
    content: {
      disabled: '0', search: 'index=auth failed | stats count by user',
      cron_schedule: '*/5 * * * *', 'action.correlationsearch.enabled': '1',
      'action.notable.param.security_domain': 'access',
    },
  },
  {
    name: 'Excessive Failed Logins - Rule',
    acl: { app: 'CustomSecApp', owner: 'analyst_jane', sharing: 'user' },
    content: {
      disabled: '0', search: 'index=custom_auth failed | stats count by user',
      cron_schedule: '*/10 * * * *', 'action.correlationsearch.enabled': '1',
      'action.notable.param.security_domain': 'access',
    },
  },
];

/** Disabled expressed three documented ways: base "1", and the looser correlationsearch.enabled
 *  true-ish forms ("true", "t"), plus an unknown-state entry where the two signals disagree. */
export const SPLUNK_STATE_VARIANTS: SplunkEntry[] = [
  {
    name: 'Suspicious PowerShell Execution - Rule',
    acl: { app: 'SplunkEnterpriseSecuritySuite', owner: 'nobody', sharing: 'app' },
    content: {
      disabled: '1', search: 'index=wineventlog EventCode=4688 CommandLine=*-enc*',
      'action.correlationsearch.enabled': '0',
    },
  },
  {
    name: 'Rare Process With Network Connection',
    acl: { app: 'SplunkEnterpriseSecuritySuite', owner: 'nobody', sharing: 'app' },
    content: {
      disabled: '0', search: 'index=sysmon EventCode=3 | stats count by process',
      'action.correlationsearch.enabled': 'true',
    },
  },
  {
    name: 'New Local Admin Account Created',
    acl: { app: 'SplunkEnterpriseSecuritySuite', owner: 'nobody', sharing: 'app' },
    content: {
      disabled: '0', search: 'index=wineventlog EventCode=4720',
      'action.correlationsearch.enabled': 't',
    },
  },
  // Disagreement: base search enabled, ES correlation flag disabled -- docs do not settle which
  // wins, so this must normalize to observedState 'unknown' with both signals recorded.
  {
    name: 'Disagreeing Signals Rule',
    acl: { app: 'SplunkEnterpriseSecuritySuite', owner: 'nobody', sharing: 'app' },
    content: {
      disabled: '0', search: 'index=wineventlog EventCode=4625',
      'action.correlationsearch.enabled': '0',
    },
  },
];

/** Names with spaces/slashes/Unicode, and a macro-dependent rule (dependency referenced, never
 *  resolved/executed). */
export const SPLUNK_NAME_AND_MACRO_VARIANTS: SplunkEntry[] = [
  {
    name: 'Lateral Movement / SMB Admin$ Access — Ünïcödé',
    acl: { app: 'SplunkEnterpriseSecuritySuite', owner: 'nobody', sharing: 'app' },
    content: {
      disabled: '0', search: '`get_lateral_movement_events` | where dest_count > 5',
      'action.correlationsearch.enabled': '1',
    },
  },
];

/** A private (owner-scoped) search vs. an app-shared one -- both must preserve `acl.sharing`. */
export const SPLUNK_PRIVATE_VS_SHARED: SplunkEntry[] = [
  {
    name: 'Personal Watchlist Alert',
    acl: { app: 'search', owner: 'analyst_bob', sharing: 'user' },
    content: { disabled: '0', search: 'index=watchlist', 'action.correlationsearch.enabled': '1' },
  },
  {
    name: 'Org Wide Correlation',
    acl: { app: 'SplunkEnterpriseSecuritySuite', owner: 'nobody', sharing: 'global' },
    content: { disabled: '0', search: 'index=global_auth', 'action.correlationsearch.enabled': '1' },
  },
];

/** A rule missing a query entirely -- normalization must reject it as unsupported, not crash. */
export const SPLUNK_MISSING_QUERY: SplunkEntry = {
  name: 'Broken Saved Search',
  acl: { app: 'search', owner: 'nobody', sharing: 'app' },
  content: { disabled: '0' },
};

/** Two full pages plus a short terminal page, for paging tests (page size 2). */
export const SPLUNK_PAGE_1: SplunkEntry[] = [SPLUNK_SAME_NAME_TWO_APPS[0], SPLUNK_SAME_NAME_TWO_APPS[1]];
export const SPLUNK_PAGE_2: SplunkEntry[] = [SPLUNK_STATE_VARIANTS[0], SPLUNK_STATE_VARIANTS[1]];
export const SPLUNK_PAGE_3: SplunkEntry[] = [SPLUNK_STATE_VARIANTS[2]];
