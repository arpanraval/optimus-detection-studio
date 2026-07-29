-- Append-only vendor-search provenance.
--
-- Replaces an application-level read-modify-write of the WHOLE session tree,
-- which I introduced in 13fef67 and which is a data-loss bug:
--
--   1. worker A reads tree (version X)
--   2. worker B reads tree (version X)
--   3. worker A writes X + its provenance
--   4. worker B writes X + its provenance  -- A's provenance is gone, AND so is
--      every detection/QA mutation any worker committed between B's read and
--      B's write
--
-- The comment on that function claimed appending avoided clobbering sibling
-- workers. It did not: appending to one field of a whole-tree round trip still
-- writes the whole tree. Detection and QA leaves are patched concurrently by
-- design (tr_patch_detection exists precisely so they don't need a full-tree
-- write), so this would silently discard finished work — the exact "work
-- disappeared" failure this remediation exists to remove.
--
-- A separate table removes the race by construction: an INSERT needs no read,
-- so there is nothing to clobber. It also keeps the tree from growing without
-- bound on long sessions, and makes provenance queryable across sessions
-- ("when did vendor search last actually work?") rather than buried in jsonb.

CREATE TABLE IF NOT EXISTS public.threat_research_vendor_searches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL
                REFERENCES public.threat_research_sessions(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  /** Which phase/job made the call, so a search can be tied to the work it fed. */
  phase         text,
  behaviour_id  text,
  query         text NOT NULL,
  repositories  text[] NOT NULL DEFAULT '{}',
  results_found integer NOT NULL DEFAULT 0,
  source_urls   text[] NOT NULL DEFAULT '{}',
  /** Set when the search could not run at all — most often a missing
   *  GITHUB_TOKEN. This is the row that matters most: it is the difference
   *  between "found nothing" and "never looked". */
  error         text,
  attempted_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.threat_research_vendor_searches IS
  'Append-only record of vendor rule-repo searches. Deliberately NOT stored on the session tree: several workers search concurrently, and a read-modify-write of the tree would discard both their provenance and any detection/QA leaf patched between the read and the write.';

CREATE INDEX IF NOT EXISTS trvs_session_idx
  ON public.threat_research_vendor_searches(session_id, attempted_at DESC);

ALTER TABLE public.threat_research_vendor_searches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.threat_research_vendor_searches FROM PUBLIC, anon;

-- Users may read their own provenance so the UI can show what was reviewed.
-- Only the orchestrator (service role) writes.
DROP POLICY IF EXISTS trvs_self_select ON public.threat_research_vendor_searches;
CREATE POLICY trvs_self_select ON public.threat_research_vendor_searches
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON TABLE public.threat_research_vendor_searches TO authenticated;
