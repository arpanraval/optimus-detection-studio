/**
 * Optimus Prime Tool Definitions
 * Gemini format for the ai-generate edge function
 */

// =============================================================================
// TOOL DEFINITIONS (Gemini format)
// =============================================================================

/**
 * Search library using semantic + keyword hybrid search
 * Understands security concepts: "credential stealing" -> Credential Access
 */
export const searchLibraryTool = {
  functionDeclarations: [{
    name: 'search_library',
    description: `Search the detection library using natural language. Understands security concepts:
- "credential stealing" finds Credential Access techniques (T1003, T1555, T1552)
- "lateral movement" finds TA0008 techniques
- "powershell abuse" finds T1059.001 detections
- "ransomware" finds T1486, T1490 detections
Returns summarized results, not full detection objects.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Natural language search query (e.g., "credential stealing", "lateral movement", "T1059")'
        },
        filters: {
          type: 'OBJECT',
          description: 'Optional filters',
          properties: {
            status: { type: 'STRING', description: 'Filter by status (Draft, Review, Production, Deprecated)' },
            severity: { type: 'STRING', description: 'Filter by severity (Low, Medium, High, Critical)' }
          }
        },
        limit: {
          type: 'INTEGER',
          description: 'Maximum results to return (default: 20, max: 50)'
        }
      },
      required: ['query']
    }
  }]
};

/**
 * Get high-level coverage statistics
 * Returns aggregated metrics, not individual detections
 */
export const getCoverageSummaryTool = {
  functionDeclarations: [{
    name: 'get_coverage_summary',
    description: `Get high-level detection coverage statistics. Returns aggregated metrics, NOT individual detections.
Use this for questions like:
- "What's our coverage?"
- "How many techniques do we cover?"
- "Where are we strongest/weakest?"
- "Give me a coverage overview"`,
    parameters: {
      type: 'OBJECT',
      properties: {
        scope: {
          type: 'STRING',
          description: 'Scope of coverage analysis (overall, by_tactic, by_platform, production_only)',
          enum: ['overall', 'by_tactic', 'by_platform', 'production_only']
        },
        platform: {
          type: 'STRING',
          description: 'Filter by platform (Windows, Linux, macOS, Cloud)'
        }
      },
      required: []
    }
  }]
};

/**
 * Find threat actor by name, alias, or MITRE ID
 */
export const findThreatActorTool = {
  functionDeclarations: [{
    name: 'find_threat_actor',
    description: `Find a threat actor/group by name, alias, or MITRE Group ID.
Supports various naming conventions:
- MITRE IDs: "G1015", "G0016"
- Common names: "Scattered Spider", "APT29"
- Vendor names: "UNC3944", "Cozy Bear", "Midnight Blizzard"
Returns actor details including aliases and targeting intelligence.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Threat actor name, alias, or MITRE Group ID (e.g., "Scattered Spider", "UNC3944", "G1015")'
        }
      },
      required: ['query']
    }
  }]
};

/**
 * Analyze coverage against a specific threat actor
 */
export const getThreatActorCoverageTool = {
  functionDeclarations: [{
    name: 'get_threat_actor_coverage',
    description: `Analyze detection coverage against a specific threat actor.
Supports actor names, aliases, and MITRE IDs:
- "Scattered Spider", "UNC3944" -> G1015
- "APT29", "Cozy Bear", "Midnight Blizzard" -> G0016
- "APT41", "Wicked Panda" -> G0096
Returns coverage percentage, covered techniques, and critical gaps.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        actor_query: {
          type: 'STRING',
          description: 'Threat actor name, alias, or MITRE Group ID'
        }
      },
      required: ['actor_query']
    }
  }]
};

/**
 * Identify coverage gaps against threat profiles
 */
export const identifyCoverageGapsTool = {
  functionDeclarations: [{
    name: 'identify_coverage_gaps',
    description: `Analyze coverage gaps against predefined threat profiles. Use for:
- "What gaps do we have for ransomware?"
- "Are we prepared for APT attacks?"
- "What credential access techniques are we missing?"
- "Analyze our exfiltration coverage"

Available profiles:
- ransomware: T1486 (encryption), T1490 (shadow copies), T1489 (services)
- apt: T1003 (credentials), T1021 (remote services), T1055 (injection)
- initial_access: T1566 (phishing), T1190 (exploits), T1133 (external services)
- persistence: T1547 (boot), T1543 (services), T1053 (scheduled tasks)
- credential_access: T1003 (OS credentials), T1555 (browser), T1552 (unsecured)
- defense_evasion: T1027 (obfuscation), T1070 (indicator removal), T1036 (masquerading)
- lateral_movement: T1021 (remote services), T1080 (taint), T1534 (internal spearphishing)
- exfiltration: T1048 (alternative protocol), T1041 (C2), T1567 (web services)
- impact: T1486 (encryption), T1485 (destruction), T1529 (shutdown)`,
    parameters: {
      type: 'OBJECT',
      properties: {
        profile: {
          type: 'STRING',
          description: 'Threat profile to analyze against',
          enum: ['ransomware', 'apt', 'initial_access', 'persistence', 'credential_access',
                 'defense_evasion', 'lateral_movement', 'exfiltration', 'impact', 'custom']
        },
        custom_techniques: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Custom technique IDs if profile is "custom"'
        }
      },
      required: ['profile']
    }
  }]
};

/**
 * Query MITRE ATT&CK database
 */
export const queryMitreTool = {
  functionDeclarations: [{
    name: 'query_mitre',
    description: `Query the MITRE ATT&CK database for techniques, groups, software, or campaigns.
Use this to:
- Look up technique details (e.g., "what is T1059.001")
- Find threat actor TTPs
- Get software/malware information
- Research campaigns`,
    parameters: {
      type: 'OBJECT',
      properties: {
        entity_type: {
          type: 'STRING',
          description: 'Type of entity to search for',
          enum: ['technique', 'group', 'software', 'campaign', 'any']
        },
        query: {
          type: 'STRING',
          description: 'Name, ID, alias, or description to search'
        },
        include_relationships: {
          type: 'BOOLEAN',
          description: 'Include related techniques/software (default: false)'
        }
      },
      required: ['query']
    }
  }]
};

/**
 * Generate MITRE Navigator layer
 */
export const generateNavigatorLayerTool = {
  functionDeclarations: [{
    name: 'generate_navigator_layer',
    description: `Generate a MITRE ATT&CK Navigator layer JSON showing current detection coverage.
Can be filtered by threat actor, tactic, or platform.
Returns downloadable JSON for Navigator import.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        name: {
          type: 'STRING',
          description: 'Layer name (default: "Detection Coverage")'
        },
        scope: {
          type: 'STRING',
          description: 'Scope of the layer',
          enum: ['all', 'threat_actor', 'tactic', 'platform']
        },
        filter_value: {
          type: 'STRING',
          description: 'Actor name, tactic, or platform to filter by (when scope is not "all")'
        }
      },
      required: []
    }
  }]
};

/**
 * Web search for external knowledge (Tavily API)
 */
export const webSearchTool = {
  functionDeclarations: [{
    name: 'web_search',
    description: `Search the web for external security information not in internal databases.
USE THIS WHEN:
- Looking for recent threats, vulnerabilities, or incidents (CVEs, campaigns)
- Finding information about tools, malware, or threat actors not in MITRE
- Researching RMM tools, legitimate software abuse, LOLBins
- Getting current security news or advisories
- Finding vendor documentation or external references

DO NOT USE when information is in MITRE database or detection library.
Returns AI-summarized results with source URLs from security-focused sources.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Search query - be specific and include security context (e.g., "RMM tools abused by threat actors 2024", "AnyDesk abuse cyber attack")'
        },
        focus: {
          type: 'STRING',
          description: 'Focus area - filters results to relevant security sources',
          enum: ['threat_intel', 'tools', 'vulnerabilities', 'news', 'documentation', 'general']
        }
      },
      required: ['query']
    }
  }]
};

// =============================================================================
// COMBINED TOOLS ARRAY
// =============================================================================

/**
 * All Optimus Prime tools combined
 * Pass this to the ai-generate edge function
 */
export const OPTIMUS_TOOLS = [
  searchLibraryTool,
  getCoverageSummaryTool,
  findThreatActorTool,
  getThreatActorCoverageTool,
  identifyCoverageGapsTool,
  queryMitreTool,
  generateNavigatorLayerTool,
  webSearchTool
];

// =============================================================================
// TOOL NAME MAPPING
// =============================================================================

export const OPTIMUS_TOOL_NAMES = {
  SEARCH_LIBRARY: 'search_library',
  GET_COVERAGE_SUMMARY: 'get_coverage_summary',
  FIND_THREAT_ACTOR: 'find_threat_actor',
  GET_THREAT_ACTOR_COVERAGE: 'get_threat_actor_coverage',
  IDENTIFY_COVERAGE_GAPS: 'identify_coverage_gaps',
  QUERY_MITRE: 'query_mitre',
  GENERATE_NAVIGATOR_LAYER: 'generate_navigator_layer',
  WEB_SEARCH: 'web_search'
} as const;

export type OptimusToolName = typeof OPTIMUS_TOOL_NAMES[keyof typeof OPTIMUS_TOOL_NAMES];

export default OPTIMUS_TOOLS;
