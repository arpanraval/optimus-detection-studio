import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import dagre from 'dagre';
import { Icon } from '../Icon';
import BackgroundGrid from '../onboarding/pipeline/BackgroundGrid';
import type {
  ThreatResearchTree, AttackBehaviour, DetectionOpportunity,
} from '../../types/threatResearch';

interface Props {
  tree: ThreatResearchTree;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  onLeafClick: (behaviour: AttackBehaviour, opportunity: DetectionOpportunity) => void;
  onLibraryMatchClick: (behaviour: AttackBehaviour) => void;
}

type NodeKind = 'subject' | 'behaviour' | 'opportunity' | 'detection' | 'library_match';

interface CanvasNode {
  id: string;
  label: string;
  sublabel?: string;
  kind: NodeKind;
  x: number;
  y: number;
  qaVerdict?: 'pass' | 'pass_with_concerns' | 'fail' | null;
  saved?: boolean;
  archived?: boolean;
  feasibility?: 'covered' | 'partial' | 'uncovered';
  behaviour?: AttackBehaviour;
  opportunity?: DetectionOpportunity;
}

interface CanvasEdge { from: string; to: string }

const NODE_W = 220;
const NODE_H = 56;

// ─────────────────────────────────────────────────────────────────────────────
// Pan / zoom view state
// ─────────────────────────────────────────────────────────────────────────────

interface ViewTransform { tx: number; ty: number; scale: number }
const MIN_SCALE = 0.25;
const MAX_SCALE = 3;

function clampScale(s: number) { return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)); }

// ─────────────────────────────────────────────────────────────────────────────
// Glow filters & colour helpers
// ─────────────────────────────────────────────────────────────────────────────

const GLOW_FILTERS = {
  sage:   { id: 'tr-glow-sage',   colour: '#84a98c', opacity: 0.85 },
  yellow: { id: 'tr-glow-yellow', colour: '#eab308', opacity: 0.9 },
  red:    { id: 'tr-glow-red',    colour: 'rgb(var(--md-sys-color-error))', opacity: 0.7 },
} as const;

function nodeColours(n: CanvasNode): {
  fillVar: string; strokeVar: string; textClass: string;
  strokeWidth: number; glow?: keyof typeof GLOW_FILTERS;
} {
  if (n.kind === 'library_match') {
    return { fillVar: '--md-sys-color-tertiary-container', strokeVar: '--md-sys-color-tertiary',
             textClass: 'text-on-tertiary-container', strokeWidth: 2, glow: 'sage' };
  }
  if (n.kind === 'subject') {
    return { fillVar: '--md-sys-color-primary-container', strokeVar: '--md-sys-color-primary',
             textClass: 'text-on-primary-container', strokeWidth: 2 };
  }
  if (n.kind === 'behaviour') {
    return { fillVar: '--md-sys-color-secondary-container', strokeVar: '--md-sys-color-secondary',
             textClass: 'text-on-secondary-container', strokeWidth: 1.5 };
  }
  if (n.kind === 'opportunity') {
    return { fillVar: '--md-sys-color-surface-container-high', strokeVar: '--md-sys-color-outline',
             textClass: 'text-on-surface', strokeWidth: 1.5 };
  }
  // detection
  if (n.archived) {
    return { fillVar: '--md-sys-color-surface-variant', strokeVar: '--md-sys-color-outline-variant',
             textClass: 'text-on-surface-variant line-through', strokeWidth: 1.5 };
  }
  if (n.qaVerdict === 'fail') {
    return { fillVar: '--md-sys-color-error-container', strokeVar: '--md-sys-color-error',
             textClass: 'text-on-error-container', strokeWidth: 1.5, glow: 'red' };
  }
  if (n.feasibility && n.feasibility !== 'covered') {
    return { fillVar: '--md-sys-color-surface-container', strokeVar: '--md-sys-color-outline',
             textClass: 'text-on-surface', strokeWidth: 1.5, glow: 'yellow' };
  }
  if (n.saved) {
    return { fillVar: '--md-sys-color-tertiary-container', strokeVar: '--md-sys-color-tertiary',
             textClass: 'text-on-tertiary-container', strokeWidth: 1.5 };
  }
  return { fillVar: '--md-sys-color-surface-container', strokeVar: '--md-sys-color-outline',
           textClass: 'text-on-surface', strokeWidth: 1.5 };
}

function iconFor(n: CanvasNode): string {
  if (n.kind === 'subject') return 'compass';
  if (n.kind === 'behaviour') return 'crosshair';
  if (n.kind === 'opportunity') return 'lightbulb';
  if (n.kind === 'library_match') return 'check-circle';
  return n.saved ? 'check-circle' : 'shield';
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

function buildLayout(tree: ThreatResearchTree): {
  nodes: CanvasNode[]; edges: CanvasEdge[]; width: number; height: number
} {
  if (!tree.subject) return { nodes: [], edges: [], width: 0, height: 0 };
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 36, edgesep: 16, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));

  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  const subjectId = 'subject';
  nodes.push({ id: subjectId, label: tree.subject.subject, kind: 'subject', x: 0, y: 0 });
  g.setNode(subjectId, { width: NODE_W, height: NODE_H });

  for (const b of tree.behaviours) {
    nodes.push({ id: b.id, label: b.title, sublabel: b.tactic, kind: 'behaviour', x: 0, y: 0 });
    g.setNode(b.id, { width: NODE_W, height: NODE_H });
    edges.push({ from: subjectId, to: b.id });
    g.setEdge(subjectId, b.id);

    if (b.library_match) {
      const lmId = `${b.id}/library_match`;
      nodes.push({
        id: lmId, label: 'Already in library', sublabel: b.library_match.name,
        kind: 'library_match', x: 0, y: 0, behaviour: b,
      });
      g.setNode(lmId, { width: NODE_W, height: NODE_H });
      edges.push({ from: b.id, to: lmId });
      g.setEdge(b.id, lmId);
      continue;
    }

    for (const o of b.opportunities) {
      const oId = `${b.id}/${o.id}`;
      nodes.push({ id: oId, label: o.title, kind: 'opportunity', x: 0, y: 0 });
      g.setNode(oId, { width: NODE_W, height: NODE_H });
      edges.push({ from: b.id, to: oId });
      g.setEdge(b.id, oId);

      const det = o.detection;
      const dId = `${oId}/${det.id}`;
      nodes.push({
        id: dId, label: det.name, kind: 'detection', x: 0, y: 0,
        qaVerdict: det.qa?.verdict ?? null,
        saved: !!det.saved_detection_id,
        archived: det.archived,
        feasibility: det.feasibility,
        behaviour: b, opportunity: o,
      });
      g.setNode(dId, { width: NODE_W, height: NODE_H });
      edges.push({ from: oId, to: dId });
      g.setEdge(oId, dId);
    }
  }

  dagre.layout(g);
  for (const n of nodes) {
    const laid = g.node(n.id);
    if (laid) { n.x = laid.x - NODE_W / 2; n.y = laid.y - NODE_H / 2; }
  }
  const info = g.graph();
  return { nodes, edges, width: info.width ?? NODE_W * 4, height: info.height ?? NODE_H * 8 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas
// ─────────────────────────────────────────────────────────────────────────────

export function ResearchCanvas({ tree, status, onLeafClick, onLibraryMatchClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => buildLayout(tree), [tree]);
  const [view, setView] = useState<ViewTransform>({ tx: 0, ty: 0, scale: 1 });
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  /** Fit the whole layout into the visible container with some padding. */
  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el || layout.nodes.length === 0) return;
    const padding = 60;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const scaleX = (W - padding * 2) / Math.max(1, layout.width);
    const scaleY = (H - padding * 2) / Math.max(1, layout.height);
    const scale = clampScale(Math.min(scaleX, scaleY, 1));
    const tx = (W - layout.width * scale) / 2;
    const ty = (H - layout.height * scale) / 2;
    setView({ tx, ty, scale });
  }, [layout.width, layout.height, layout.nodes.length]);

  // Auto-fit when the tree first lands and whenever the layout grows.
  useEffect(() => { fitToView(); }, [fitToView, layout.width, layout.height]);

  // Mouse-drag pan. Cmd/Ctrl-drag works the same as plain drag for trackpads.
  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-canvas-node]')) return;
    dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  }
  function onMouseMove(e: React.MouseEvent) {
    const d = dragRef.current;
    if (!d) return;
    setView(v => ({ ...v, tx: d.tx + (e.clientX - d.x), ty: d.ty + (e.clientY - d.y) }));
  }
  function onMouseUp() { dragRef.current = null; }

  // Wheel zoom centered on the cursor. Trackpad pinch sends ctrlKey=true.
  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 4) return;
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView(v => {
      const nextScale = clampScale(v.scale * factor);
      const ratio = nextScale / v.scale;
      return {
        scale: nextScale,
        tx: cx - (cx - v.tx) * ratio,
        ty: cy - (cy - v.ty) * ratio,
      };
    });
  }

  function zoomBy(factor: number) {
    setView(v => {
      const el = containerRef.current;
      if (!el) return v;
      const cx = el.clientWidth / 2;
      const cy = el.clientHeight / 2;
      const nextScale = clampScale(v.scale * factor);
      const ratio = nextScale / v.scale;
      return { scale: nextScale, tx: cx - (cx - v.tx) * ratio, ty: cy - (cy - v.ty) * ratio };
    });
  }

  if (!tree.subject) {
    return (
      <div className="relative flex flex-1 items-center justify-center">
        <BackgroundGrid phase={status === 'running' ? 'processing' : 'selection'} />
        <div className="relative text-center">
          <div className="mb-2 inline-block animate-spin">
            <Icon name="loader" size={28} className="text-primary" />
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
      className="relative flex-1 overflow-hidden"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
      style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
    >
      <BackgroundGrid phase={status === 'running' ? 'processing' : status === 'completed' ? 'complete' : 'selection'} />

      <svg
        className="absolute inset-0 h-full w-full pointer-events-none"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {Object.values(GLOW_FILTERS).map(g => (
            <filter key={g.id} id={g.id} x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={g.colour} floodOpacity={g.opacity} />
              <feDropShadow dx="0" dy="0" stdDeviation="10" floodColor={g.colour} floodOpacity={g.opacity * 0.5} />
            </filter>
          ))}
        </defs>
        <g
          transform={`translate(${view.tx}, ${view.ty}) scale(${view.scale})`}
          style={{ pointerEvents: 'auto' }}
        >
          {layout.edges.map(e => {
            const from = layout.nodes.find(n => n.id === e.from);
            const to = layout.nodes.find(n => n.id === e.to);
            if (!from || !to) return null;
            const x1 = from.x + NODE_W / 2;
            const y1 = from.y + NODE_H;
            const x2 = to.x + NODE_W / 2;
            const y2 = to.y;
            const my = (y1 + y2) / 2;
            return (
              <path
                key={`${e.from}->${e.to}`}
                d={`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`}
                fill="none"
                stroke="rgb(var(--md-sys-color-outline-variant))"
                strokeWidth={1.5}
              />
            );
          })}
          {layout.nodes.map(n => (
            <NodeBox
              key={n.id}
              node={n}
              onClick={
                n.kind === 'detection' && n.behaviour && n.opportunity
                  ? (e) => { e.stopPropagation(); onLeafClick(n.behaviour!, n.opportunity!); }
                  : n.kind === 'library_match' && n.behaviour
                    ? (e) => { e.stopPropagation(); onLibraryMatchClick(n.behaviour!); }
                    : undefined
              }
            />
          ))}
        </g>
      </svg>

      {/* Floating canvas controls */}
      <div className="pointer-events-auto absolute right-4 top-4 flex flex-col gap-1 rounded-lg border border-outline-variant bg-surface-container-high p-1 shadow-lg">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); zoomBy(1.2); }}
          aria-label="Zoom in"
          className="flex h-8 w-8 items-center justify-center rounded text-on-surface hover:bg-surface-container-highest"
        >
          <Icon name="plus" size={16} />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); zoomBy(1 / 1.2); }}
          aria-label="Zoom out"
          className="flex h-8 w-8 items-center justify-center rounded text-on-surface hover:bg-surface-container-highest"
        >
          <Icon name="minus" size={16} />
        </button>
        <div className="h-px bg-outline-variant" />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); fitToView(); }}
          aria-label="Fit to view"
          className="flex h-8 w-8 items-center justify-center rounded text-on-surface hover:bg-surface-container-highest"
        >
          <Icon name="maximize" size={16} />
        </button>
      </div>

      {/* Zoom indicator */}
      <div className="pointer-events-none absolute left-4 bottom-4 rounded-md border border-outline-variant bg-surface-container-high px-2 py-1 text-xs text-on-surface-variant shadow-sm">
        {Math.round(view.scale * 100)}%
      </div>
    </div>
  );
}

function NodeBox({ node, onClick }: { node: CanvasNode; onClick?: (e: React.MouseEvent) => void }) {
  const { fillVar, strokeVar, textClass, strokeWidth, glow } = nodeColours(node);
  const filterAttr = glow ? `url(#${GLOW_FILTERS[glow].id})` : undefined;
  return (
    <g
      data-canvas-node="true"
      transform={`translate(${node.x}, ${node.y})`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={10}
        fill={`rgb(var(${fillVar}))`}
        stroke={`rgb(var(${strokeVar}))`}
        strokeWidth={strokeWidth}
        filter={filterAttr}
      />
      <foreignObject x={10} y={8} width={NODE_W - 20} height={NODE_H - 16}>
        <div className={`flex h-full items-center gap-2 text-xs leading-tight ${textClass}`}>
          <Icon name={iconFor(node)} size={14} className="flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{node.label}</div>
            {node.sublabel && (
              <div className="mt-0.5 truncate text-[10px] opacity-80">{node.sublabel}</div>
            )}
            {node.kind === 'detection' && (
              <div className="mt-0.5 flex items-center gap-1 text-[10px] opacity-80">
                {node.feasibility && <span>{node.feasibility}</span>}
                {node.qaVerdict && <span>· QA {node.qaVerdict.replace(/_/g, ' ')}</span>}
                {node.saved && <span>· saved</span>}
              </div>
            )}
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

export default ResearchCanvas;
