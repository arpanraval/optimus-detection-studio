import type { AnalysisReport } from '../../types/intelligence';
import type { PlaybookRun, Playbook } from '../playbooks/types';

/**
 * Convert an analysis_reports DB row into the shape PlaybookReport expects.
 * Uses the snapshotted report_template instead of resolving from playbook defs.
 */
export function reportToPlaybookRun(report: AnalysisReport): PlaybookRun {
  return {
    id: report.id,
    playbookId: report.playbook_id || '',
    status: report.status === 'completed' ? 'completed' : 'error',
    inputs: report.inputs as Record<string, string>,
    stepResults: Object.fromEntries(
      (report.step_results || []).map((sr: any) => [
        sr.stepId,
        { stepId: sr.stepId, status: sr.status, data: sr.data, error: sr.error, completedAt: sr.completedAt },
      ])
    ),
    context: report.context,
    generatedSections: report.generated_sections,
    startedAt: report.created_at,
    completedAt: report.completed_at || undefined,
    reportId: report.id,
  };
}

/**
 * Build a minimal Playbook object from the snapshotted report_template.
 * Used when rendering reports from DB (playbook definition may have changed).
 */
export function reportToPlaybook(report: AnalysisReport): Playbook {
  return {
    id: report.playbook_id || 'unknown',
    name: report.report_template?.title || report.title,
    description: '',
    icon: 'file-text',
    category: 'reporting',
    estimatedDuration: '',
    steps: [],
    reportTemplate: report.report_template || { title: report.title, sections: [] },
  };
}
