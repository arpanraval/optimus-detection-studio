// Shared integration form field definitions and setup guides.
// Used by both ConnectionSetupInline and any future credential forms.

import type { IntegrationAuthType, IntegrationCategory } from '../types';

// =============================================================================
// Field Definitions
// =============================================================================

export interface IntegrationFieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'password' | 'select' | 'checkbox';
  placeholder?: string;
  defaultValue?: string | number | boolean;
  required?: boolean;
  options?: { value: string; label: string }[];
  isCredential?: boolean;
  isConfig?: boolean;
}

export const PROVIDER_FIELDS: Record<string, IntegrationFieldDef[]> = {
  splunk: [
    { key: 'host', label: 'Host', type: 'text', placeholder: 'splunk.example.com', required: true, isConfig: true },
    { key: 'port', label: 'Port', type: 'number', defaultValue: 8089, isConfig: true },
    { key: 'authMethod', label: 'Auth Method', type: 'select', options: [
      { value: 'token', label: 'Token' },
      { value: 'basic', label: 'Username / Password' },
    ], defaultValue: 'token' },
    { key: 'token', label: 'Auth Token', type: 'password', placeholder: 'Splunk auth token', isCredential: true },
    { key: 'username', label: 'Username', type: 'text', isCredential: true },
    { key: 'password', label: 'Password', type: 'password', isCredential: true },
    { key: 'app', label: 'App Context', type: 'text', placeholder: 'search', defaultValue: 'search', isConfig: true },
    { key: 'owner', label: 'Owner', type: 'text', placeholder: 'admin', isConfig: true },
    { key: 'ssl', label: 'Use SSL', type: 'checkbox', defaultValue: true, isConfig: true },
  ],
  sentinel: [
    { key: 'tenantId', label: 'Tenant ID', type: 'text', placeholder: 'Azure AD tenant ID', required: true, isConfig: true },
    { key: 'subscriptionId', label: 'Subscription ID', type: 'text', placeholder: 'Azure subscription ID', required: true, isConfig: true },
    { key: 'resourceGroup', label: 'Resource Group', type: 'text', required: true, isConfig: true },
    { key: 'workspaceName', label: 'Workspace Name', type: 'text', required: true, isConfig: true },
    { key: 'clientId', label: 'Client ID (App Registration)', type: 'text', required: true, isCredential: true },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true, isCredential: true },
  ],
  defender_xdr: [
    { key: 'tenantId', label: 'Tenant ID', type: 'text', placeholder: 'Azure AD tenant ID', required: true, isConfig: true },
    { key: 'clientId', label: 'Client ID (App Registration)', type: 'text', required: true, isCredential: true },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true, isCredential: true },
  ],
  elastic: [
    { key: 'connectionType', label: 'Connection Type', type: 'select', options: [
      { value: 'self-hosted', label: 'Self-hosted' },
      { value: 'cloud', label: 'Elastic Cloud' },
    ], defaultValue: 'self-hosted' },
    { key: 'host', label: 'Kibana Host', type: 'text', placeholder: 'kibana.example.com', isConfig: true },
    { key: 'port', label: 'Kibana Port', type: 'number', defaultValue: 5601, isConfig: true },
    { key: 'cloudId', label: 'Cloud ID', type: 'text', placeholder: 'deployment:base64...', isConfig: true },
    { key: 'authMethod', label: 'Auth Method', type: 'select', options: [
      { value: 'api_key', label: 'API Key' },
      { value: 'basic', label: 'Username / Password' },
    ], defaultValue: 'api_key' },
    { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'base64 encoded API key', isCredential: true },
    { key: 'username', label: 'Username', type: 'text', isCredential: true },
    { key: 'password', label: 'Password', type: 'password', isCredential: true },
    { key: 'spaceId', label: 'Space ID', type: 'text', placeholder: 'default', isConfig: true },
    { key: 'ssl', label: 'Use SSL', type: 'checkbox', defaultValue: true, isConfig: true },
  ],
  github: [
    { key: 'owner', label: 'Owner / Org', type: 'text', required: true, isConfig: true },
    { key: 'repo', label: 'Repository', type: 'text', required: true, isConfig: true },
    { key: 'branch', label: 'Branch', type: 'text', defaultValue: 'main', isConfig: true },
    { key: 'token', label: 'Personal Access Token', type: 'password', required: true, isCredential: true },
  ],
  gitlab: [
    { key: 'host', label: 'GitLab Host', type: 'text', placeholder: 'gitlab.com', defaultValue: 'gitlab.com', isConfig: true },
    { key: 'projectId', label: 'Project ID', type: 'text', required: true, isConfig: true },
    { key: 'branch', label: 'Branch', type: 'text', defaultValue: 'main', isConfig: true },
    { key: 'token', label: 'Personal Access Token', type: 'password', required: true, isCredential: true },
  ],
  jira: [
    { key: 'host', label: 'Jira Host', type: 'text', placeholder: 'yourteam.atlassian.net', required: true, isConfig: true },
    { key: 'projectKey', label: 'Project Key', type: 'text', placeholder: 'DET', required: true, isConfig: true },
    { key: 'email', label: 'Email', type: 'text', required: true, isCredential: true },
    { key: 'apiToken', label: 'API Token', type: 'password', required: true, isCredential: true },
  ],
  slack: [
    { key: 'channel', label: 'Default Channel', type: 'text', placeholder: '#detections', isConfig: true },
    { key: 'webhookUrl', label: 'Webhook URL', type: 'password', placeholder: 'https://hooks.slack.com/...', required: true, isCredential: true },
  ],
  crowdstrike: [
    { key: 'baseUrl', label: 'API Base URL', type: 'select', options: [
      { value: 'https://api.crowdstrike.com', label: 'US-1 (api.crowdstrike.com)' },
      { value: 'https://api.us-2.crowdstrike.com', label: 'US-2 (api.us-2.crowdstrike.com)' },
      { value: 'https://api.eu-1.crowdstrike.com', label: 'EU-1 (api.eu-1.crowdstrike.com)' },
      { value: 'https://api.laggar.gcw.crowdstrike.com', label: 'US-GOV-1 (GovCloud)' },
    ], defaultValue: 'https://api.crowdstrike.com', isConfig: true },
    { key: 'repository', label: 'NGSIEM Search Repository', type: 'select', options: [
      { value: 'search-all', label: 'All data (search-all)' },
      { value: 'investigate_view', label: 'Investigate (investigate_view)' },
      { value: 'third-party', label: 'Third-party data (third-party)' },
      { value: 'falcon_for_it_view', label: 'Falcon for IT (falcon_for_it_view)' },
      { value: 'forensics_view', label: 'Forensics (forensics_view)' },
    ], defaultValue: 'search-all', required: true, isConfig: true },
    { key: 'customerId', label: 'Customer ID (CID)', type: 'text', placeholder: '32-char hex (e.g. 619ef3d2... with or without -XX suffix)', required: true, isConfig: true },
    { key: 'clientId', label: 'API Client ID', type: 'text', placeholder: 'OAuth2 Client ID', required: true, isCredential: true },
    { key: 'clientSecret', label: 'API Client Secret', type: 'password', placeholder: 'OAuth2 Client Secret', required: true, isCredential: true },
  ],
  chronicle: [
    { key: 'region', label: 'Region', type: 'select', options: [
      { value: 'us', label: 'US (us-chronicle.googleapis.com)' },
      { value: 'europe', label: 'Europe (europe-chronicle.googleapis.com)' },
      { value: 'asia-southeast1', label: 'Asia Southeast (asia-southeast1-chronicle.googleapis.com)' },
    ], defaultValue: 'us', required: true, isConfig: true },
    { key: 'customerId', label: 'Customer ID', type: 'text', placeholder: 'Chronicle customer UUID', required: true, isConfig: true },
    { key: 'projectId', label: 'GCP Project ID', type: 'text', placeholder: 'my-gcp-project (optional)', isConfig: true },
    { key: 'instanceId', label: 'SecOps Instance ID', type: 'text', placeholder: 'Instance UUID (optional)', isConfig: true },
    { key: 'clientEmail', label: 'Service Account Email', type: 'text', placeholder: 'sa-name@project.iam.gserviceaccount.com', required: true, isCredential: true },
    { key: 'privateKey', label: 'Private Key (PEM)', type: 'password', placeholder: '-----BEGIN RSA PRIVATE KEY-----...', required: true, isCredential: true },
  ],
};

// =============================================================================
// Auth Type & Category Maps
// =============================================================================

export const PROVIDER_AUTH_TYPE: Record<string, IntegrationAuthType> = {
  splunk: 'token',
  sentinel: 'oauth2_client_credentials',
  defender_xdr: 'oauth2_client_credentials',
  elastic: 'api_key',
  crowdstrike: 'oauth2_client_credentials',
  chronicle: 'api_key',
  github: 'token',
  gitlab: 'token',
  jira: 'api_key',
  slack: 'webhook',
};

export const PROVIDER_CATEGORY: Record<string, IntegrationCategory> = {
  splunk: 'siem',
  sentinel: 'siem',
  defender_xdr: 'siem',
  elastic: 'siem',
  crowdstrike: 'siem',
  chronicle: 'siem',
  github: 'version_control',
  gitlab: 'version_control',
  azure_devops: 'version_control',
  jira: 'automation',
  slack: 'automation',
};

// =============================================================================
// Setup Guides
// =============================================================================

export interface SetupGuide {
  summary: string;
  docsUrl?: string;
  steps: string[];
  permissions?: string[];
  notes?: string[];
}

export const PROVIDER_SETUP_GUIDES: Record<string, SetupGuide> = {
  splunk: {
    summary: "You'll need a Splunk admin account or auth token with saved search permissions.",
    docsUrl: 'https://docs.splunk.com/Documentation/Splunk/latest/Security/UseAuthTokens',
    steps: [
      'Navigate to Settings \u2192 Tokens \u2192 New Token.',
      'Select a role with admin or power capabilities.',
      'Copy the token value.',
    ],
    notes: [
      'For Splunk Cloud, use the management port (8089).',
      'Self-signed certs are accepted in dev mode.',
    ],
  },
  sentinel: {
    summary: "You'll need an Azure AD App Registration with Sentinel Contributor role.",
    docsUrl: 'https://learn.microsoft.com/en-us/rest/api/securityinsights/',
    steps: [
      'Go to Azure Portal \u2192 App Registrations \u2192 New registration.',
      'Create a client secret under Certificates & Secrets.',
      'Assign "Microsoft Sentinel Contributor" role on the workspace.',
      'Find Tenant ID on the Overview page.',
      'Find Subscription ID, Resource Group, and Workspace in the Sentinel workspace overview.',
    ],
    permissions: ['SecurityInsights.ReadWrite.All (Application)'],
  },
  defender_xdr: {
    summary: "You'll need an Azure AD App Registration with Graph API permissions.",
    docsUrl: 'https://learn.microsoft.com/en-us/graph/api/resources/security-api-overview',
    steps: [
      'Go to Azure Portal \u2192 App Registrations \u2192 New registration.',
      'Add API permission \u2192 Microsoft Graph \u2192 Application \u2192 CustomDetection.ReadWrite.All.',
      'Grant admin consent.',
      'Create a client secret under Certificates & Secrets.',
      'Copy the Tenant ID from the Overview page.',
    ],
    permissions: ['CustomDetection.ReadWrite.All (Microsoft Graph, Application)'],
    notes: [
      'Permissions must be granted admin consent.',
      'The secret has an expiry \u2014 set a reminder to rotate it.',
    ],
  },
  elastic: {
    summary: "You'll need a Kibana API key or superuser credentials.",
    docsUrl: 'https://www.elastic.co/guide/en/kibana/current/api-keys.html',
    steps: [
      'Open Kibana \u2192 Stack Management \u2192 API Keys \u2192 Create API key.',
      'Give it a name and select the superuser role (or a custom role with detection CRUD).',
      'Copy the Base64-encoded key.',
    ],
    notes: [
      'For Elastic Cloud, find your Cloud ID in the deployment overview at cloud.elastic.co.',
    ],
  },
  github: {
    summary: "You'll need a Personal Access Token (classic) with repo scope.",
    docsUrl: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens',
    steps: [
      'Go to github.com \u2192 Settings \u2192 Developer settings \u2192 Personal access tokens \u2192 Tokens (classic).',
      'Click Generate new token.',
      'Select the repo scope (full control of private repos).',
      'Copy the token.',
    ],
  },
  gitlab: {
    summary: "You'll need a Project Access Token with API scope.",
    docsUrl: 'https://docs.gitlab.com/ee/user/project/settings/project_access_tokens.html',
    steps: [
      'Go to your GitLab project \u2192 Settings \u2192 Access Tokens \u2192 Add new token.',
      'Select the api scope and Maintainer role.',
      'Copy the token.',
      "Find Project ID on the project's main page (below the name).",
    ],
  },
  jira: {
    summary: "You'll need a Jira API token for your Atlassian account.",
    docsUrl: 'https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/',
    steps: [
      'Go to id.atlassian.com \u2192 Security \u2192 API tokens \u2192 Create API token.',
      'Copy the token.',
      'Use the email associated with your Atlassian account.',
      'Find your project key in the Jira project settings.',
    ],
  },
  slack: {
    summary: "You'll need an Incoming Webhook URL for your Slack workspace.",
    docsUrl: 'https://api.slack.com/messaging/webhooks',
    steps: [
      'Go to api.slack.com/apps \u2192 Create New App \u2192 From scratch.',
      'Enable Incoming Webhooks in the Features section.',
      'Add a new webhook to your target channel.',
      'Copy the webhook URL.',
    ],
  },
  crowdstrike: {
    summary: "You'll need a CrowdStrike API Client with Correlation Rules and NGSIEM read/write scopes.",
    docsUrl: 'https://www.falconpy.io/Service-Collections/Correlation-Rules.html',
    steps: [
      'Go to Falcon Console \u2192 Support and resources \u2192 API Clients and Keys.',
      'Click Add new API client.',
      'Give it a name and description.',
      'Under Scope, grant Correlation Rules: Read and Write.',
      'For pre-flight query execution, also grant NGSIEM: Read and Write.',
      'Copy the Client ID and Client Secret.',
      'Note your cloud region (US-1, US-2, EU-1, or US-GOV-1) from the console URL.',
      'Find your Customer ID (CID) under Sensor Downloads or Host Setup.',
    ],
    permissions: ['Correlation Rules: Read, Write', 'NGSIEM: Read, Write'],
    notes: [
      'Your cloud region determines the API base URL \u2014 check your Falcon console URL.',
      'CID is a 32-character hex string unique to your environment.',
      'Max 750 active rules per CID. New rules beyond this limit are auto-deactivated.',
    ],
  },
  chronicle: {
    summary: "You'll need a GCP service account with Chronicle API access.",
    docsUrl: 'https://cloud.google.com/chronicle/docs/reference/rest',
    steps: [
      'Go to GCP Console \u2192 IAM & Admin \u2192 Service Accounts \u2192 Create Service Account.',
      'Grant the service account the "Chronicle API Editor" role.',
      'Create a JSON key for the service account and download it.',
      'Copy the client_email and private_key fields from the JSON key file.',
      'Find your Chronicle Customer ID in the SecOps console under Settings.',
      'Select your Chronicle region (US, Europe, or Asia Southeast).',
    ],
    permissions: ['Chronicle API Editor (roles/chronicle.editor)'],
    notes: [
      'The private key must be in PEM format (starts with -----BEGIN RSA PRIVATE KEY-----).',
      'Some older key files use PKCS#8 format (BEGIN PRIVATE KEY) which is also supported.',
      'Your region determines the API endpoint \u2014 check your SecOps console URL.',
    ],
  },
};

// =============================================================================
// Field Visibility Helpers
// =============================================================================

export function isFieldVisible(
  provider: string,
  field: IntegrationFieldDef,
  formValues: Record<string, string | number | boolean>
): boolean {
  if (provider === 'splunk') {
    if (field.key === 'token') return formValues.authMethod === 'token';
    if (field.key === 'username' || field.key === 'password') return formValues.authMethod === 'basic';
  }
  if (provider === 'elastic') {
    if (field.key === 'host' || field.key === 'port') return formValues.connectionType === 'self-hosted';
    if (field.key === 'cloudId') return formValues.connectionType === 'cloud';
    if (field.key === 'apiKey') return formValues.authMethod === 'api_key';
    if (field.key === 'username' || field.key === 'password') return formValues.authMethod === 'basic';
  }
  return true;
}

export function getAuthType(
  provider: string,
  formValues: Record<string, string | number | boolean>
): IntegrationAuthType {
  if (provider === 'splunk') {
    return formValues.authMethod === 'basic' ? 'basic' : 'token';
  }
  if (provider === 'elastic') {
    return formValues.authMethod === 'basic' ? 'basic' : 'api_key';
  }
  return PROVIDER_AUTH_TYPE[provider] || 'token';
}

export function buildConfig(
  provider: string,
  formValues: Record<string, string | number | boolean>
): Record<string, unknown> {
  const fields = PROVIDER_FIELDS[provider] || [];
  const config: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.isConfig && isFieldVisible(provider, field, formValues) && formValues[field.key] !== undefined) {
      config[field.key] = formValues[field.key];
    }
  }
  return config;
}

export function buildCredentials(
  provider: string,
  formValues: Record<string, string | number | boolean>
): Record<string, string> {
  const fields = PROVIDER_FIELDS[provider] || [];
  const creds: Record<string, string> = {};
  for (const field of fields) {
    if (field.isCredential && isFieldVisible(provider, field, formValues) && formValues[field.key]) {
      creds[field.key] = String(formValues[field.key]);
    }
  }
  return creds;
}

export function getDefaultFormValues(provider: string): Record<string, string | number | boolean> {
  const fields = PROVIDER_FIELDS[provider] || [];
  const defaults: Record<string, string | number | boolean> = {};
  for (const field of fields) {
    if (field.defaultValue !== undefined) {
      defaults[field.key] = field.defaultValue;
    }
  }
  return defaults;
}
