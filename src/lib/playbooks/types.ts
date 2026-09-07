import type { IconName } from '../../components/Icon';

// =============================================================================
// Playbook Type Definitions
// =============================================================================

/** A step in a playbook that calls an Optimus tool */
export interface PlaybookStep {
  id: string;
  name: string;
  description: string;
  /** Which optimus tool to call */
  tool: string;
  /** Static parameters for the tool */
  params: Record<string, any>;
  /** Map tool param keys to user input keys (for dynamic params) */
  paramMapping?: Record<string, string>;
  /** Key to store the result under in the playbook context */
  contextKey: string;
}

/** Report section definition */
export interface ReportSection {
  key: string;
  title: string;
  /** 'data' sections display tool results; 'ai-generated' sections are synthesized */
  type: 'data' | 'ai-generated';
  /** For 'data' type: which context key to display */
  contextKey?: string;
}

/** Report template defining the output format */
export interface ReportTemplate {
  title: string;
  sections: ReportSection[];
}

/** User input configuration for playbooks that require parameters */
export interface PlaybookInput {
  key: string;
  label: string;
  placeholder: string;
  type: 'text' | 'select';
  options?: { label: string; value: string }[];
}

/** A playbook definition */
export interface Playbook {
  id: string;
  name: string;
  description: string;
  icon: IconName;
  category: 'threat-assessment' | 'quality' | 'reporting';
  estimatedDuration: string;
  /** If true, playbook is greyed out and not runnable */
  disabled?: boolean;
  /** Reason shown to user when disabled */
  disabledReason?: string;
  /** If set, the playbook requires user input before running */
  requiresInput?: PlaybookInput;
  steps: PlaybookStep[];
  reportTemplate: ReportTemplate;
}

/** Result of a single playbook step execution */
export interface PlaybookStepResult {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  data?: any;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

/** A playbook execution run */
export interface PlaybookRun {
  id: string;
  playbookId: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  /** User-provided inputs */
  inputs: Record<string, string>;
  /** Step results keyed by step id */
  stepResults: Record<string, PlaybookStepResult>;
  /** Aggregated context from all completed steps */
  context: Record<string, any>;
  /** AI-generated report sections */
  generatedSections: Record<string, string>;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  /** ID of the persisted analysis_reports row */
  reportId?: string;
}
