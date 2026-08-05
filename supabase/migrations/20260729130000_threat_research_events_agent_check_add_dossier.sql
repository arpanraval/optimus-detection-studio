-- 20260729130000_threat_research_events_agent_check_add_dossier.sql
--
-- The 2026-07-29 Dossier Agent consolidation (research-agent.ts +
-- attack-researcher.ts merged into dossier-agent.ts) added 'dossier' to the
-- TypeScript ResearchAgent union (both server and frontend) but never
-- migrated this CHECK constraint. Every event the Dossier Agent tries to
-- emit (agent_started, agent_iteration, agent_model_call_start,
-- agent_tool_call, agent_completed/agent_failed, agent_loop_exit) has been
-- silently rejected at INSERT since Batch 3 landed — emit() swallows DB
-- errors into a console.warn, so the whole research phase ran completely
-- dark with zero activity-console visibility. Found via Batch 8 live
-- verification: a real session's research phase failed with no diagnostic
-- events at all, which led here.
--
-- 'research' and 'attack-researcher' are kept in the allowed list for
-- historical event rows from before the consolidation (same reasoning as
-- keeping 'attack_research' in threat_research_jobs_phase_check).

ALTER TABLE public.threat_research_events DROP CONSTRAINT threat_research_events_agent_check;

ALTER TABLE public.threat_research_events ADD CONSTRAINT threat_research_events_agent_check
  CHECK ((agent = ANY (ARRAY[
    'orchestrator'::text, 'preflight'::text, 'dossier'::text, 'research'::text,
    'attack-researcher'::text, 'planner'::text, 'detection-engineer'::text, 'qa'::text
  ])));
