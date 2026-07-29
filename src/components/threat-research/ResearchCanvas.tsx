import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import dagre from 'dagre';
import { Icon } from '../Icon';
import { isDetectionSaved } from './shared';
import type {
  ThreatResearchTree,
  AttackBehaviour,
  DetectionOpportunity,
  MitreTacticName,
  ResearchStatus,
} from '../../types/threatResearch';

interface Props {
  tree: ThreatResearchTree;
  /** Use the shared ResearchStatus rather than restating the union: a local
   *  copy silently went stale when 'partial' was added, and the only reason it
   *  surfaced is that tsc happened to check this file. */
  status: ResearchStatus;
  /** Behaviours with an agent currently running on them; renders an active
   *  pulse on their tile + descendants. Derived from the events stream. */
  activeBehaviourIds?: ReadonlySet<string>;
  onLeafClick: (behaviour: AttackBehaviour, opportunity: DetectionOpportunity) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Node model
// ─────────────────────────────────────────────────────────────────────────────

type NodeKind = 'subject' | 'tactic' | 'behaviour' | 'opportunity' | 'detection';

type NodeState =
  | 'default' // idle, has content
  | 'active' // worker currently processing
  | 'pending' // expected but not yet produced (qa null on detection, no opps yet)
  | 'covered' // library match — nothing new to do
  | 'fail' // qa returned verdict:'fail'
  | 'qa_error' // QA pipeline failed mid-run (timeout / model error) — distinct from a qa verdict
  | 'archived' // user archived
  | 'engineer_failed' // detection-engineer agent loop crashed — retry available
  | 'not_detectable' // model verdict: no observable signal exists
  | 'needs_telemetry'; // detectable in principle but env lacks the source

interface CanvasNode {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  label: string;
  /** Detection-specific second-line subtitle. */
  subtitle?: string;
  state: NodeState;
  hasChildren: boolean;
  /** For state derivation at render time. */
  behaviourId?: string;
  /** Click handler payload (only set on detection nodes). */
  behaviour?: AttackBehaviour;
  opportunity?: DetectionOpportunity;
  /** Computed by dagre. */
  x: number;
  y: number;
}

interface CanvasEdge {
  from: string;
  to: string;
  /** Edge inherits state from the parent node so the live path lights up. */
  state: NodeState;
}

const TILE = 48; // 48×48 icon tile
const NODE_W = 128; // overall node footprint (tile + label) — keep tree narrow
const NODE_H = 96; // tile + label below (room for 2-line labels)
const RANK_SEP = 100; // vertical gap between layers — generous so edges don't crowd labels
const NODE_SEP = 12; // horizontal gap between siblings — tight, avoids "stretched" look

// MITRE tactic display order (kill-chain order, lowercase-with-hyphens).
const TACTIC_ORDER: MitreTacticName[] = [
  'reconnaissance',
  'resource-development',
  'initial-access',
  'execution',
  'persistence',
  'privilege-escalation',
  'defense-evasion',
  'credential-access',
  'discovery',
  'lateral-movement',
  'collection',
  'command-and-control',
  'exfiltration',
  'impact',
];

function tacticLabel(t: MitreTacticName): string {
  return t
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function detectionState(det: DetectionOpportunity['detection'], behaviourActive: boolean): NodeState {
  if (det.archived) return 'archived';
  // Checked before any qa branch, same precedence as ResearchList's
  // resolveRowState — a saved detection (user-saved, or reuse-first pointing
  // the leaf at an existing library rule with qa left null) is terminal
  // regardless of what its qa verdict says. This used to be missing here,
  // so a reused leaf fell through to the qa-null branch below and rendered
  // "pending" forever while ResearchList correctly showed it as saved.
  if (isDetectionSaved(det)) return 'covered';
  if (det.qa?.verdict === 'fail') return 'fail';
  // qa_error is a pipeline failure (QA never returned a verdict). Distinct
  // from 'fail' (a real verdict) — UI must render the two differently so
  // operators know whether QA judged the detection or never ran. When
  // qa is null AND qa_error is set, this is the case.
  if (!det.qa && det.qa_error) return 'qa_error';
  if (!det.qa) return behaviourActive ? 'active' : 'pending';
  return 'default';
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout — dagre top-to-bottom, expand/collapse aware
// ─────────────────────────────────────────────────────────────────────────────

function buildLayout(
  tree: ThreatResearchTree,
  activeBehaviourIds: ReadonlySet<string>,
  collapsed: ReadonlySet<string>,
): { nodes: CanvasNode[]; edges: CanvasEdge[]; width: number; height: number } {
  if (!tree.subject) return { nodes: [], edges: [], width: 0, height: 0 };

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', ranksep: RANK_SEP, nodesep: NODE_SEP, edgesep: 12, marginx: 32, marginy: 32 });
  g.setDefaultEdgeLabel(() => ({}));

  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  // Subject ───────────────────────────────────────────────────────────────
  const subjectId = 'subject';
  const subjectActive = activeBehaviourIds.size > 0 || tree.behaviours.length === 0;
  nodes.push({
    id: subjectId,
    parentId: null,
    kind: 'subject',
    label: tree.subject.subject,
    state: subjectActive ? 'active' : 'default',
    hasChildren: tree.behaviours.length > 0,
    x: 0,
    y: 0,
  });
  g.setNode(subjectId, { width: NODE_W, height: NODE_H });
  if (collapsed.has(subjectId)) {
    dagre.layout(g);
    return finishLayout(g, nodes, edges);
  }

  // Group behaviours by tactic so we can insert a tactic layer ────────────
  const byTactic = new Map<MitreTacticName, AttackBehaviour[]>();
  for (const b of tree.behaviours) {
    const arr = byTactic.get(b.tactic) ?? [];
    arr.push(b);
    byTactic.set(b.tactic, arr);
  }

  // Render tactics in canonical MITRE order, only the observed ones.
  const observedTactics = TACTIC_ORDER.filter((t) => byTactic.has(t));

  for (const tactic of observedTactics) {
    const tacticId = `tactic/${tactic}`;
    const behaviours = byTactic.get(tactic)!;
    const tacticActive = behaviours.some((b) => activeBehaviourIds.has(b.id));
    nodes.push({
      id: tacticId,
      parentId: subjectId,
      kind: 'tactic',
      label: tacticLabel(tactic),
      state: tacticActive ? 'active' : 'default',
      hasChildren: behaviours.length > 0,
      x: 0,
      y: 0,
    });
    g.setNode(tacticId, { width: NODE_W, height: NODE_H });
    edges.push({ from: subjectId, to: tacticId, state: tacticActive ? 'active' : 'default' });
    g.setEdge(subjectId, tacticId);

    if (collapsed.has(tacticId)) continue;

    for (const b of behaviours) {
      const bActive = activeBehaviourIds.has(b.id);
      // State derivation order matters: active beats verdict, terminal
      // verdicts (not_detectable, needs_telemetry) beat the generic
      // empty-opps pending state.
      //
      // 'engineer_failed' used to have a branch here keyed off
      // b.detectability, but the Opportunity Planner's VALID_DETECTABILITY
      // never emits it (only siem/edr/needs_telemetry/not_detectable) and
      // nothing else assigns it — permanently dead, removed rather than
      // left unreachable.
      //
      // A behaviour-level b.library_match branch also used to live here,
      // gating on a field that is never assigned anywhere in the
      // orchestrator (dead by design note, not by accident — see
      // orchestrator.ts's handleDetection comment). "Covered" is decided at
      // the OPPORTUNITY level via detection.saved_detection_id
      // (detectionState() above), which every opportunity node already
      // reflects correctly — no behaviour-level shortcut is needed.
      const bState: NodeState = bActive
        ? 'active'
        : b.detectability === 'not_detectable'
          ? 'not_detectable'
          : b.detectability === 'needs_telemetry'
            ? 'needs_telemetry'
            : b.opportunities.length === 0
              ? 'pending'
              : 'default';
      // Subtitle precedence on behaviour tiles:
      //   merged-only (no own opps, has merged_into) → "merged into N
      //     opportunit(y/ies)" — surface the planner's clustering decision
      //     so users don't think the behaviour was dropped
      //   otherwise → no subtitle (label uses both lines)
      const mergedCount = b.merged_into_opportunity_ids?.length ?? 0;
      const ownOppCount = b.opportunities.length;
      const behaviourSubtitle =
        ownOppCount === 0 && mergedCount > 0
          ? `merged into ${mergedCount} opp${mergedCount === 1 ? '' : 's'}`
          : undefined;
      nodes.push({
        id: b.id,
        parentId: tacticId,
        kind: 'behaviour',
        label: b.title,
        subtitle: behaviourSubtitle,
        state: bState,
        // Show children only when there's actually something to expand to.
        // not_detectable / needs_telemetry leaves are terminal — chevron
        // would offer nothing. Merged-only behaviours also have no children
        // (their detections live under sibling behaviours via
        // covers_behaviour_ids).
        hasChildren: b.opportunities.length > 0,
        behaviourId: b.id,
        behaviour: b,
        x: 0,
        y: 0,
      });
      g.setNode(b.id, { width: NODE_W, height: NODE_H });
      edges.push({ from: tacticId, to: b.id, state: bState });
      g.setEdge(tacticId, b.id);

      if (collapsed.has(b.id)) continue;

      for (const o of b.opportunities) {
        const oId = `${b.id}/${o.id}`;
        const oState: NodeState = o.detection.archived
          ? 'archived'
          : o.detection.qa?.verdict === 'fail'
            ? 'fail'
            : bActive && !o.detection.qa
              ? 'active'
              : 'default';
        nodes.push({
          id: oId,
          parentId: b.id,
          kind: 'opportunity',
          label: o.title,
          state: oState,
          hasChildren: true,
          behaviourId: b.id,
          behaviour: b,
          opportunity: o,
          x: 0,
          y: 0,
        });
        g.setNode(oId, { width: NODE_W, height: NODE_H });
        edges.push({ from: b.id, to: oId, state: oState });
        g.setEdge(b.id, oId);

        if (collapsed.has(oId)) continue;

        const det = o.detection;
        const dId = `${oId}/${det.id}`;
        const dState = detectionState(det, bActive);
        // Subtitle precedence (most-specific first), matching
        // detectionState()'s precedence above:
        //   saved (user-saved, or reuse-first with qa left null) → "<verdict>
        //     · saved", or "in library" when there's no verdict to show
        //   qa_error → "QA didn't run" (recoverable pipeline failure)
        //   qa verdict → "<verdict>" (real verdict from completed QA)
        //   active → "in review…"
        //   neither → "qa pending"
        const sub = isDetectionSaved(det)
          ? (det.qa ? `${det.qa.verdict.replace(/_/g, ' ')} · saved` : 'in library')
          : det.qa_error
            ? "QA didn't run"
            : det.qa
              ? det.qa.verdict.replace(/_/g, ' ')
              : bActive
                ? 'in review…'
                : 'qa pending';
        nodes.push({
          id: dId,
          parentId: oId,
          kind: 'detection',
          label: det.name,
          subtitle: sub,
          state: dState,
          hasChildren: false,
          behaviourId: b.id,
          behaviour: b,
          opportunity: o,
          x: 0,
          y: 0,
        });
        g.setNode(dId, { width: NODE_W, height: NODE_H });
        edges.push({ from: oId, to: dId, state: dState });
        g.setEdge(oId, dId);
      }
    }
  }

  dagre.layout(g);
  return finishLayout(g, nodes, edges);
}

function finishLayout(
  g: dagre.graphlib.Graph,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): { nodes: CanvasNode[]; edges: CanvasEdge[]; width: number; height: number } {
  for (const n of nodes) {
    const laid = g.node(n.id);
    if (laid) {
      n.x = laid.x - NODE_W / 2;
      n.y = laid.y - NODE_H / 2;
    }
  }
  const info = g.graph();
  return { nodes, edges, width: info.width ?? NODE_W * 4, height: info.height ?? NODE_H * 6 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pan / zoom view
// ─────────────────────────────────────────────────────────────────────────────

interface ViewTransform {
  tx: number;
  ty: number;
  scale: number;
}
const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;
const clampScale = (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));

const EMPTY_ACTIVE_SET: ReadonlySet<string> = new Set();

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ResearchCanvas({ tree, status, activeBehaviourIds, onLeafClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeIds = activeBehaviourIds ?? EMPTY_ACTIVE_SET;

  // Default: every tactic node starts collapsed. With 30 behaviours across
  // 8+ tactics, an all-expanded tree is unreadable. User clicks a tactic
  // tile (or chevron) to drill in.
  const collapseDefaultedRef = useRef(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (collapseDefaultedRef.current) return;
    if (!tree.subject || tree.behaviours.length === 0) return;
    const tactics = new Set<string>();
    for (const b of tree.behaviours) tactics.add(`tactic/${b.tactic}`);
    if (tactics.size > 0) {
      setCollapsed(tactics);
      collapseDefaultedRef.current = true;
      // Force re-fit AFTER collapsed state and layout settle. Otherwise the
      // initial fit happens against the FULL (uncollapsed) layout which
      // is huge, and the canvas opens off-centre at MIN_SCALE.
      lastFitSubjectRef.current = null;
    }
    // tree.behaviours included in deps: the for-loop reads behaviour.tactic
    // off each element. The one-shot ref guard above keeps this effect from
    // re-running once it's done its job, but the deps still need to be
    // honest — otherwise React lint flags the loop's reference, and a future
    // refactor that removes the guard would yield stale data.
  }, [tree.subject?.subject, tree.behaviours]);
  const [view, setView] = useState<ViewTransform>({ tx: 0, ty: 0, scale: 1 });
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const lastFitSubjectRef = useRef<string | null>(null);

  const layout = useMemo(() => buildLayout(tree, activeIds, collapsed), [tree, activeIds, collapsed]);

  // Auto-fit ONCE per subject (don't yank user's pan/zoom on every event).
  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el || layout.nodes.length === 0) return;
    const padding = 60;
    const W = el.clientWidth;
    const H = el.clientHeight;
    // Tight bounding box of the nodes themselves — dagre's reported width/height
    // includes its marginx/marginy (32px on each side) plus internal gutters
    // that don't belong to the visible content. Using it directly biases the
    // centering up-and-left. Compute the real content extent from node coords.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of layout.nodes) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + NODE_W > maxX) maxX = n.x + NODE_W;
      if (n.y + NODE_H > maxY) maxY = n.y + NODE_H;
    }
    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);
    const scaleX = (W - padding * 2) / contentW;
    const scaleY = (H - padding * 2) / contentH;
    const scale = clampScale(Math.min(scaleX, scaleY, 1));
    const tx = (W - contentW * scale) / 2 - minX * scale;
    const ty = (H - contentH * scale) / 2 - minY * scale;
    setView({ tx, ty, scale });
  }, [layout.nodes]);

  useEffect(() => {
    const subject = tree.subject?.subject ?? null;
    if (!subject || layout.nodes.length === 0) return;
    if (lastFitSubjectRef.current === subject) return;
    lastFitSubjectRef.current = subject;
    // Wait two frames so the container has its final size after the page
    // main area's flex children settle. Without this, the first fit runs
    // against a 0-size or pre-resize container and the tree opens at a
    // tiny scale parked in the upper-left.
    requestAnimationFrame(() => requestAnimationFrame(fitToView));
  }, [tree.subject?.subject, layout.nodes.length, fitToView]);

  // Re-fit when the container itself resizes (sidebar toggles, window
  // resize, side panel opens), but only until the user has manually
  // panned/zoomed — after that, preserve their viewport.
  const userInteractedRef = useRef(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (userInteractedRef.current) return;
      if (layout.nodes.length === 0) return;
      requestAnimationFrame(() => requestAnimationFrame(fitToView));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitToView, layout.nodes.length]);

  // Native wheel listener — React's onWheel is passive, so preventDefault
  // there is a no-op and the page steals our zoom (browser zoom on Ctrl,
  // page scroll on plain wheel). Attach our own non-passive listener.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // Always swallow — canvas wheel must not propagate to the page.
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      // Ctrl/⌘ + wheel OR pinch-zoom (ctrlKey is set on pinch by browsers)
      // → zoom canvas. Plain wheel → pan.
      userInteractedRef.current = true;
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        setView((v) => {
          const nextScale = clampScale(v.scale * factor);
          const ratio = nextScale / v.scale;
          return {
            scale: nextScale,
            tx: cx - (cx - v.tx) * ratio,
            ty: cy - (cy - v.ty) * ratio,
          };
        });
      } else {
        // Pan with wheel. deltaX = horizontal, deltaY = vertical.
        setView((v) => ({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }));
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Mouse-drag pan (only when starting outside a node).
  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-canvas-node]')) return;
    userInteractedRef.current = true;
    dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  }
  function onMouseMove(e: React.MouseEvent) {
    const d = dragRef.current;
    if (!d) return;
    setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.x), ty: d.ty + (e.clientY - d.y) }));
  }
  function onMouseUp() {
    dragRef.current = null;
  }

  // Touch handlers — single-finger pan, two-finger pinch zoom.
  // Without these, the canvas was non-interactive on tablet/mobile.
  // touchRef tracks the active gesture: a single anchor for pan, or the
  // initial pinch distance + viewport for zoom.
  const touchRef = useRef<
    | { kind: 'pan'; x: number; y: number; tx: number; ty: number }
    | { kind: 'pinch'; dist: number; scale: number; cx: number; cy: number; tx: number; ty: number }
    | null
  >(null);

  const distance = (a: React.Touch | Touch, b: React.Touch | Touch): number => {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  };

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      // Single-finger pan only when starting outside a node.
      if ((e.target as HTMLElement).closest('[data-canvas-node]')) return;
      const t = e.touches[0];
      touchRef.current = { kind: 'pan', x: t.clientX, y: t.clientY, tx: view.tx, ty: view.ty };
    } else if (e.touches.length === 2) {
      // Two-finger pinch — zoom toward the midpoint.
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const [a, b] = [e.touches[0], e.touches[1]];
      const cx = (a.clientX + b.clientX) / 2 - rect.left;
      const cy = (a.clientY + b.clientY) / 2 - rect.top;
      touchRef.current = {
        kind: 'pinch',
        dist: distance(a, b),
        scale: view.scale,
        cx,
        cy,
        tx: view.tx,
        ty: view.ty,
      };
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    const r = touchRef.current;
    if (!r) return;
    if (r.kind === 'pan' && e.touches.length === 1) {
      const t = e.touches[0];
      setView((v) => ({ ...v, tx: r.tx + (t.clientX - r.x), ty: r.ty + (t.clientY - r.y) }));
    } else if (r.kind === 'pinch' && e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const newDist = distance(a, b);
      const factor = newDist / Math.max(1, r.dist);
      const nextScale = clampScale(r.scale * factor);
      const ratio = nextScale / r.scale;
      // Zoom toward the gesture's initial midpoint, like the wheel pinch path.
      setView({
        scale: nextScale,
        tx: r.cx - (r.cx - r.tx) * ratio,
        ty: r.cy - (r.cy - r.ty) * ratio,
      });
    }
  }

  function onTouchEnd() {
    touchRef.current = null;
  }

  function zoomBy(factor: number) {
    setView((v) => {
      const el = containerRef.current;
      if (!el) return v;
      const cx = el.clientWidth / 2;
      const cy = el.clientHeight / 2;
      const nextScale = clampScale(v.scale * factor);
      const ratio = nextScale / v.scale;
      return { scale: nextScale, tx: cx - (cx - v.tx) * ratio, ty: cy - (cy - v.ty) * ratio };
    });
  }

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // PRESERVE the user's zoom/pan on per-node toggle. Forcing fitToView
    // here yanked the viewport to "fit everything" on every chevron click,
    // which is jarring when zoomed in to read details on a busy tree.
    // Bulk expand/collapse-all retains the auto-fit (see toggleExpandAll).
  }

  // Bulk expand/collapse. Collapse-all = every node that has children. Expand-all
  // = empty set. The button toggles between the two based on whether anything
  // is currently collapsed.
  const allCollapsibleIds = useMemo(() => {
    const ids = new Set<string>();
    if (!tree.subject) return ids;
    ids.add('subject');
    const tactics = new Set<MitreTacticName>();
    for (const b of tree.behaviours) tactics.add(b.tactic);
    for (const t of tactics) ids.add(`tactic/${t}`);
    for (const b of tree.behaviours) {
      if (b.opportunities.length > 0) ids.add(b.id);
      for (const o of b.opportunities) ids.add(`${b.id}/${o.id}`);
    }
    return ids;
  }, [tree]);

  const allExpanded = collapsed.size === 0;
  function toggleExpandAll() {
    setCollapsed(allExpanded ? allCollapsibleIds : new Set());
    requestAnimationFrame(() => requestAnimationFrame(fitToView));
  }

  // Empty / loading state ─────────────────────────────────────────────────
  if (!tree.subject) {
    return (
      <div className="relative flex h-full flex-1 items-center justify-center" style={{ background: dottedBg() }}>
        <div className="text-center">
          <div className="mb-2 inline-block animate-spin">
            <Icon name="loader" size={20} className="text-primary" />
          </div>
          <div className="text-sm text-on-surface-variant">
            {status === 'running' ? 'Research Agent is preparing the subject brief…' : 'No subject brief yet.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full flex-1 overflow-hidden touch-none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        background: dottedBg(),
        cursor: dragRef.current ? 'grabbing' : 'grab',
      }}
    >
      <svg className="absolute inset-0 h-full w-full" style={{ overflow: 'visible' }}>
        <defs>
          {/* Soft drop shadow used by every node tile. Gives the canvas
              physical depth; flat rects on a flat background read as a
              wireframe, not a graph. */}
          <filter id="canvas-node-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000" floodOpacity="0.18" />
          </filter>
        </defs>
        <g transform={`translate(${view.tx}, ${view.ty}) scale(${view.scale})`} style={{ pointerEvents: 'auto' }}>
          {layout.edges.map((e) => (
            <Edge key={`${e.from}->${e.to}`} edge={e} layout={layout} />
          ))}
          {layout.nodes.map((n) => {
            // Capture node fields into local consts so TypeScript's narrowing
            // survives into the click-handler closure. Without these, the
            // arrow functions below would lose the n.behaviour/n.opportunity
            // narrowing from the outer ternary and require non-null assertions
            // (which can mask a real crash if layout drift ever puts a null
            // here at click time). Explicit local refs make the contract
            // visible and crash-safe.
            const detBehaviour = n.kind === 'detection' ? n.behaviour : null;
            const detOpportunity = n.kind === 'detection' ? n.opportunity : null;
            const onClick: (() => void) | undefined =
              detBehaviour && detOpportunity
                ? () => onLeafClick(detBehaviour, detOpportunity)
                : undefined;
            return (
              <NodeTile
                key={n.id}
                node={n}
                collapsed={collapsed.has(n.id)}
                onToggle={() => toggleCollapsed(n.id)}
                onClick={onClick}
              />
            );
          })}
        </g>
      </svg>

      {/* Floating zoom + expand/collapse controls — bottom-right so they
          never fight with the activity panel handle or top-left status
          banners. */}
      <div className="pointer-events-auto absolute right-3 bottom-3 z-10 flex flex-col gap-0.5 rounded-2xl border border-outline-variant bg-surface p-1 shadow-sm">
        <button
          type="button"
          onClick={() => zoomBy(1.2)}
          aria-label="Zoom in"
          className="flex h-8 w-8 items-center justify-center rounded-xl text-on-surface hover:bg-surface-container"
        >
          <Icon name="plus" size={14} />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.2)}
          aria-label="Zoom out"
          className="flex h-8 w-8 items-center justify-center rounded-xl text-on-surface hover:bg-surface-container"
        >
          <Icon name="minus" size={14} />
        </button>
        <button
          type="button"
          onClick={fitToView}
          aria-label="Fit to view"
          className="flex h-8 w-8 items-center justify-center rounded-xl text-[10px] font-medium tracking-tight text-on-surface hover:bg-surface-container"
        >
          FIT
        </button>
        <div className="my-0.5 h-px bg-outline-variant" />
        <button
          type="button"
          onClick={toggleExpandAll}
          aria-label={allExpanded ? 'Collapse all' : 'Expand all'}
          title={allExpanded ? 'Collapse all' : 'Expand all'}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-on-surface hover:bg-surface-container"
        >
          <Icon name={allExpanded ? 'chevron-up' : 'chevron-down'} size={14} />
        </button>
      </div>

      <div className="pointer-events-none absolute left-3 bottom-3 rounded-full border border-outline-variant bg-surface px-3 py-1 text-xs font-medium text-on-surface-variant shadow-sm">
        {Math.round(view.scale * 100)}%
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Node tile + edge rendering
// ─────────────────────────────────────────────────────────────────────────────

function dottedBg(): string {
  // Subtle dotted grid using SVG data URI. Token-driven via CSS var so it
  // adapts to light/dark.
  return `radial-gradient(circle, rgb(var(--md-sys-color-outline-variant)) 1px, transparent 1px) 0 0 / 22px 22px`;
}

interface TileColors {
  fillVar: string; // background fill
  strokeVar: string; // stroke
  iconClass: string; // text color class for the icon
  labelClass: string; // text color class for the label
  dashed: boolean;
  pulse: boolean;
}

function tileColors(state: NodeState): TileColors {
  switch (state) {
    case 'active':
      return {
        fillVar: '--md-sys-color-primary',
        strokeVar: '--md-sys-color-primary',
        iconClass: 'text-on-primary',
        labelClass: 'text-on-surface',
        dashed: false,
        pulse: true,
      };
    case 'covered':
      return {
        fillVar: '--md-sys-color-tertiary-container',
        strokeVar: '--md-sys-color-tertiary',
        iconClass: 'text-on-tertiary-container',
        labelClass: 'text-on-surface',
        dashed: false,
        pulse: false,
      };
    case 'fail':
      return {
        fillVar: '--md-sys-color-error-container',
        strokeVar: '--md-sys-color-error',
        iconClass: 'text-on-error-container',
        labelClass: 'text-error',
        dashed: false,
        pulse: false,
      };
    case 'engineer_failed':
      // Recoverable failure — orange/error-container so it's visually
      // distinct from a model verdict (not_detectable). User can retry.
      return {
        fillVar: '--md-sys-color-error-container',
        strokeVar: '--md-sys-color-error',
        iconClass: 'text-on-error-container',
        labelClass: 'text-on-surface',
        dashed: true,
        pulse: false,
      };
    case 'qa_error':
      // QA pipeline failed without producing a verdict. ext-amber matches
      // the design system's Warning / Medium-severity / Pending colour;
      // distinct from 'fail' (ext-coral, a real model verdict). Dashed
      // border signals "recoverable, retry-eligible".
      return {
        fillVar: '--md-ext-color-amber',
        strokeVar: '--md-ext-color-amber',
        iconClass: 'text-on-surface',
        labelClass: 'text-on-surface',
        dashed: true,
        pulse: false,
      };
    case 'not_detectable':
      // Terminal verdict — neutral muted, no error styling. Real intel.
      return {
        fillVar: '--md-sys-color-surface-variant',
        strokeVar: '--md-sys-color-outline',
        iconClass: 'text-on-surface-variant',
        labelClass: 'text-on-surface-variant',
        dashed: false,
        pulse: false,
      };
    case 'needs_telemetry':
      return {
        fillVar: '--md-sys-color-secondary-container',
        strokeVar: '--md-sys-color-secondary',
        iconClass: 'text-on-secondary-container',
        labelClass: 'text-on-surface',
        dashed: true,
        pulse: false,
      };
    case 'pending':
      return {
        fillVar: '--md-sys-color-surface',
        strokeVar: '--md-sys-color-outline-variant',
        iconClass: 'text-on-surface-variant',
        labelClass: 'text-on-surface-variant',
        dashed: true,
        pulse: false,
      };
    case 'archived':
      return {
        fillVar: '--md-sys-color-surface-variant',
        strokeVar: '--md-sys-color-outline-variant',
        iconClass: 'text-on-surface-variant',
        labelClass: 'text-on-surface-variant line-through',
        dashed: true,
        pulse: false,
      };
    default:
      return {
        fillVar: '--md-sys-color-surface',
        strokeVar: '--md-sys-color-primary',
        iconClass: 'text-primary',
        labelClass: 'text-on-surface',
        dashed: false,
        pulse: false,
      };
  }
}

function tileIcon(node: CanvasNode): string {
  // One distinct icon per layer + per terminal verdict on behaviour tiles.
  // Semantic mapping:
  //   threat-actor      — the threat / campaign / actor under study
  //   git-fork          — kill-chain branches into tactics
  //   swords            — attacker actions (default behaviour tile)
  //   alert-triangle    — engineer crashed, retry available
  //   eye-off           — model verdict: not detectable
  //   help-circle       — needs telemetry the env doesn't have
  //   search            — defender-side detection opportunities
  //   shield-check      — verified, generated detections
  switch (node.kind) {
    case 'subject':
      return 'threat-actor';
    case 'tactic':
      return 'git-fork';
    case 'behaviour':
      if (node.state === 'engineer_failed') return 'alert-triangle';
      if (node.state === 'not_detectable') return 'eye-off';
      if (node.state === 'needs_telemetry') return 'help-circle';
      return 'swords';
    case 'opportunity':
      return 'search';
    case 'detection':
      return 'shield-check';
  }
}

function NodeTile({
  node,
  collapsed,
  onToggle,
  onClick,
}: {
  node: CanvasNode;
  collapsed: boolean;
  onToggle: () => void;
  onClick?: () => void;
}) {
  const c = tileColors(node.state);
  const icon = tileIcon(node);

  // Tile is centered horizontally within NODE_W; label sits below it.
  const tileX = (NODE_W - TILE) / 2;
  const tileY = 0;
  const labelY = TILE + 8;
  const isClickable = !!onClick;

  return (
    <g data-canvas-node="true" transform={`translate(${node.x}, ${node.y})`} onMouseDown={(e) => e.stopPropagation()}>
      {/* Active pulse ring */}
      {c.pulse && (
        <rect
          x={tileX - 4}
          y={tileY - 4}
          width={TILE + 8}
          height={TILE + 8}
          rx={10}
          fill="none"
          stroke={`rgb(var(${c.strokeVar}))`}
          strokeWidth={2}
          pointerEvents="none"
        >
          <animate attributeName="opacity" values="0.2;1;0.2" dur="1.4s" repeatCount="indefinite" />
        </rect>
      )}

      {/* Tile */}
      <rect
        x={tileX}
        y={tileY}
        width={TILE}
        height={TILE}
        rx={8}
        fill={`rgb(var(${c.fillVar}))`}
        stroke={`rgb(var(${c.strokeVar}))`}
        strokeWidth={1.5}
        strokeDasharray={c.dashed ? '4 3' : undefined}
        filter="url(#canvas-node-shadow)"
        onClick={(e) => {
          e.stopPropagation();
          if (isClickable) onClick!();
          else if (node.hasChildren) onToggle();
        }}
        style={{ cursor: isClickable || node.hasChildren ? 'pointer' : 'default' }}
      />

      {/* Centered icon inside tile (one per layer) */}
      <foreignObject x={tileX} y={tileY} width={TILE} height={TILE} pointerEvents="none">
        <div className={`flex h-full w-full items-center justify-center ${c.iconClass}`}>
          <Icon name={icon} size={22} />
        </div>
      </foreignObject>

      {/* Collapse chevron (top-right of tile) when has children */}
      {node.hasChildren && !isClickable && (
        <g
          transform={`translate(${tileX + TILE - 14}, ${tileY - 6})`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          style={{ cursor: 'pointer' }}
        >
          <circle
            r={8}
            cx={6}
            cy={6}
            fill={`rgb(var(--md-sys-color-surface-container-high))`}
            stroke={`rgb(var(${c.strokeVar}))`}
            strokeWidth={1}
          />
          <foreignObject x={-2} y={-2} width={16} height={16} pointerEvents="none">
            <div className="flex h-4 w-4 items-center justify-center text-on-surface">
              <Icon name={collapsed ? 'plus' : 'minus'} size={9} />
            </div>
          </foreignObject>
        </g>
      )}

      {/* Trust-flag badge (top-left of tile) when behaviour has hallucinated
          MITRE ids, tactic mismatches, or unsourced training-only claims.
          Mirrors the per-detection chips on DetectionLeafCard so the canvas
          shows the same hallucination-defence signal at-a-glance — without
          this, users have to click into every leaf to see whether content
          is verified. Severity ranking: unverified > inconsistent > unsourced. */}
      {node.kind === 'behaviour' &&
        node.behaviour &&
        (() => {
          const b = node.behaviour;
          const unverifiedCount = (b.unverified_mitre_ids ?? []).length;
          const inconsistentCount = (b.tactic_inconsistent_mitre_ids ?? []).length;
          const unsourced = b.unsourced === true;
          if (!unverifiedCount && !inconsistentCount && !unsourced) return null;
          const fillVar = unverifiedCount > 0 ? '--md-sys-color-error' : '--md-sys-color-secondary';
          const titleAttr = [
            unverifiedCount > 0 ? `${unverifiedCount} unverified MITRE id${unverifiedCount === 1 ? '' : 's'}` : null,
            inconsistentCount > 0 ? `${inconsistentCount} tactic mismatch${inconsistentCount === 1 ? '' : 'es'}` : null,
            unsourced ? 'training-only behaviour' : null,
          ]
            .filter(Boolean)
            .join(' • ');
          const totalCount = unverifiedCount + inconsistentCount;
          return (
            <g transform={`translate(${tileX - 4}, ${tileY - 6})`} style={{ pointerEvents: 'auto' }}>
              <title>{titleAttr}</title>
              <circle
                r={8}
                cx={6}
                cy={6}
                fill={`rgb(var(${fillVar}))`}
                stroke={`rgb(var(--md-sys-color-surface))`}
                strokeWidth={1.5}
              />
              <foreignObject x={-2} y={-2} width={16} height={16} pointerEvents="none">
                <div className="flex h-4 w-4 items-center justify-center text-[8px] font-bold text-on-error">
                  {totalCount > 0 ? totalCount : '!'}
                </div>
              </foreignObject>
            </g>
          );
        })()}

      {/* Label — line-clamp-2 uses the 2-line space NODE_H reserves. The
          previous `truncate` class enforced a single line, wasting half
          the allocated label space and chopping titles like "Malvertising
          delivery of fake CAPTCHA landing pages" mid-word. */}
      <foreignObject x={0} y={labelY} width={NODE_W} height={NODE_H - labelY} pointerEvents="none">
        <div className={`text-center text-[11px] leading-tight ${c.labelClass}`}>
          <div
            className="px-1 font-medium"
            title={node.label}
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {node.label}
          </div>
          {node.subtitle && (
            <div className="truncate px-1 text-[10px] opacity-80" title={node.subtitle}>
              {node.subtitle}
            </div>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

const EDGE_STROKE: Record<NodeState, { color: string; opacity: number; width: number }> = {
  active: { color: '--md-sys-color-primary', opacity: 1.0, width: 2 },
  covered: { color: '--md-sys-color-tertiary', opacity: 0.7, width: 1.5 },
  fail: { color: '--md-sys-color-error', opacity: 0.7, width: 1.5 },
  qa_error: { color: '--md-sys-color-secondary', opacity: 0.7, width: 1.5 },
  engineer_failed: { color: '--md-sys-color-error', opacity: 0.7, width: 1.5 },
  not_detectable: { color: '--md-sys-color-outline', opacity: 0.5, width: 1.2 },
  needs_telemetry: { color: '--md-sys-color-secondary', opacity: 0.7, width: 1.5 },
  pending: { color: '--md-sys-color-outline-variant', opacity: 0.6, width: 1.2 },
  archived: { color: '--md-sys-color-outline-variant', opacity: 0.4, width: 1 },
  default: { color: '--md-sys-color-outline', opacity: 0.6, width: 1.2 },
};

function Edge({ edge, layout }: { edge: CanvasEdge; layout: { nodes: CanvasNode[] } }) {
  const from = layout.nodes.find((n) => n.id === edge.from);
  const to = layout.nodes.find((n) => n.id === edge.to);
  if (!from || !to) return null;

  // Cubic bezier with vertical-tangent control points at both ends.
  // For straight-down sibling (x1≈x2) it degenerates to a clean vertical
  // line. For offset siblings it sweeps as an S-curve, exiting vertically
  // from parent's bottom and entering vertically at child's top.
  const tileX = (NODE_W - TILE) / 2;
  const x1 = from.x + tileX + TILE / 2;
  const y1 = from.y + NODE_H; // emerge BELOW parent label
  const x2 = to.x + tileX + TILE / 2;
  const y2 = to.y; // enter at TOP of child tile

  const s = EDGE_STROKE[edge.state];

  let d: string;
  if (Math.abs(x1 - x2) < 0.5) {
    d = `M ${x1} ${y1} V ${y2}`;
  } else {
    const dh = y2 - y1;
    const c1y = y1 + dh * 0.55;
    const c2y = y2 - dh * 0.55;
    d = `M ${x1} ${y1} C ${x1} ${c1y}, ${x2} ${c2y}, ${x2} ${y2}`;
  }

  return (
    <path
      d={d}
      fill="none"
      stroke={`rgb(var(${s.color}))`}
      strokeOpacity={s.opacity}
      strokeWidth={s.width}
      strokeDasharray={edge.state === 'pending' ? '4 3' : undefined}
      strokeLinecap="round"
    />
  );
}

export default ResearchCanvas;
