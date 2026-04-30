import React, { useMemo } from 'react';
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

interface Node {
  id: string;
  label: string;
  sublabel?: string;
  kind: NodeKind;
  width: number;
  height: number;
  x?: number;
  y?: number;
  qaVerdict?: 'pass' | 'pass_with_concerns' | 'fail' | null;
  saved?: boolean;
  archived?: boolean;
  feasibility?: 'covered' | 'partial' | 'uncovered';
  behaviour?: AttackBehaviour;
  opportunity?: DetectionOpportunity;
}

interface Edge { from: string; to: string }

const NODE_W = 240;
const NODE_H = 64;

/** Glow effect: appended via SVG <filter> + <feDropShadow>. Two glows used:
 *  sage-green (already-covered) and yellow (feasibility issue). */
const GLOW_FILTERS = {
  sage:   { id: 'tr-glow-sage',   colour: '#84a98c', opacity: 0.85 },
  yellow: { id: 'tr-glow-yellow', colour: '#eab308', opacity: 0.85 },
  red:    { id: 'tr-glow-red',    colour: 'rgb(var(--md-sys-color-error))', opacity: 0.7 },
} as const;

function nodeColours(n: Node): { fillVar: string; strokeVar: string; textClass: string; strokeWidth: number; glow?: keyof typeof GLOW_FILTERS } {
  // Library match: sage green glow, no QA, no opportunity
  if (n.kind === 'library_match') {
    return {
      fillVar: '--md-sys-color-tertiary-container',
      strokeVar: '--md-sys-color-tertiary',
      textClass: 'text-on-tertiary-container',
      strokeWidth: 2,
      glow: 'sage',
    };
  }
  if (n.kind === 'subject') {
    return {
      fillVar: '--md-sys-color-primary-container',
      strokeVar: '--md-sys-color-primary',
      textClass: 'text-on-primary-container',
      strokeWidth: 2,
    };
  }
  if (n.kind === 'behaviour') {
    return {
      fillVar: '--md-sys-color-secondary-container',
      strokeVar: '--md-sys-color-secondary',
      textClass: 'text-on-secondary-container',
      strokeWidth: 1.5,
    };
  }
  if (n.kind === 'opportunity') {
    return {
      fillVar: '--md-sys-color-surface-container-high',
      strokeVar: '--md-sys-color-outline',
      textClass: 'text-on-surface',
      strokeWidth: 1.5,
    };
  }
  // detection node
  if (n.archived) {
    return {
      fillVar: '--md-sys-color-surface-variant',
      strokeVar: '--md-sys-color-outline-variant',
      textClass: 'text-on-surface-variant line-through',
      strokeWidth: 1.5,
    };
  }
  if (n.qaVerdict === 'fail') {
    return {
      fillVar: '--md-sys-color-error-container',
      strokeVar: '--md-sys-color-error',
      textClass: 'text-on-error-container',
      strokeWidth: 1.5,
      glow: 'red',
    };
  }
  // Yellow glow for feasibility issues (data sources missing/partial)
  if (n.feasibility && n.feasibility !== 'covered') {
    return {
      fillVar: '--md-sys-color-surface-container',
      strokeVar: '--md-sys-color-outline',
      textClass: 'text-on-surface',
      strokeWidth: 1.5,
      glow: 'yellow',
    };
  }
  if (n.saved) {
    return {
      fillVar: '--md-sys-color-tertiary-container',
      strokeVar: '--md-sys-color-tertiary',
      textClass: 'text-on-tertiary-container',
      strokeWidth: 1.5,
    };
  }
  return {
    fillVar: '--md-sys-color-surface-container',
    strokeVar: '--md-sys-color-outline',
    textClass: 'text-on-surface',
    strokeWidth: 1.5,
  };
}

function iconFor(n: Node): string {
  if (n.kind === 'subject') return 'compass';
  if (n.kind === 'behaviour') return 'crosshair';
  if (n.kind === 'opportunity') return 'lightbulb';
  if (n.kind === 'library_match') return 'check-circle';
  return n.saved ? 'check-circle' : 'shield';
}

export function ResearchCanvas({ tree, status, onLeafClick, onLibraryMatchClick }: Props) {
  const layout = useMemo(() => buildLayout(tree), [tree]);

  if (!tree.subject) {
    return (
      <div className="relative flex flex-1 items-center justify-center">
        <BackgroundGrid phase={status === 'running' ? 'processing' : status === 'completed' ? 'complete' : 'selection'} />
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

  const { nodes, edges, width, height } = layout;

  return (
    <div className="relative flex-1 overflow-auto">
      <BackgroundGrid phase={status === 'running' ? 'processing' : status === 'completed' ? 'complete' : 'selection'} />
      <svg width={width + 80} height={height + 80} className="relative mx-auto my-6 block">
        <defs>
          {Object.entries(GLOW_FILTERS).map(([key, g]) => (
            <filter key={key} id={g.id} x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={g.colour} floodOpacity={g.opacity} />
              <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor={g.colour} floodOpacity={g.opacity * 0.5} />
            </filter>
          ))}
        </defs>
        <g transform="translate(40, 40)">
          {edges.map(e => {
            const from = nodes.find(n => n.id === e.from)!;
            const to = nodes.find(n => n.id === e.to)!;
            if (from?.x == null || to?.x == null) return null;
            const x1 = from.x + NODE_W / 2;
            const y1 = from.y! + NODE_H;
            const x2 = to.x + NODE_W / 2;
            const y2 = to.y!;
            const my = (y1 + y2) / 2;
            return (
              <path
                key={`${e.from}->${e.to}`}
                d={`M ${x1} ${y1} L ${x1} ${my} L ${x2} ${my} L ${x2} ${y2}`}
                fill="none"
                stroke="rgb(var(--md-sys-color-outline-variant))"
                strokeWidth={1.5}
              />
            );
          })}
          {nodes.map(n => (
            <NodeBox
              key={n.id}
              node={n}
              onClick={
                n.kind === 'detection' && n.behaviour && n.opportunity
                  ? () => onLeafClick(n.behaviour!, n.opportunity!)
                  : n.kind === 'library_match' && n.behaviour
                    ? () => onLibraryMatchClick(n.behaviour!)
                    : undefined
              }
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

function NodeBox({ node, onClick }: { node: Node; onClick?: () => void }) {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const { fillVar, strokeVar, textClass, strokeWidth, glow } = nodeColours(node);
  const cursor = onClick ? 'cursor-pointer' : '';
  const filterAttr = glow ? `url(#${GLOW_FILTERS[glow].id})` : undefined;

  return (
    <g transform={`translate(${x}, ${y})`} onClick={onClick} className={cursor}>
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={8}
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

function buildLayout(tree: ThreatResearchTree): { nodes: Node[]; edges: Edge[]; width: number; height: number } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', ranksep: 60, nodesep: 28, edgesep: 12, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (!tree.subject) return { nodes: [], edges: [], width: 0, height: 0 };

  const subjectId = 'subject';
  nodes.push({ id: subjectId, label: tree.subject.subject, kind: 'subject', width: NODE_W, height: NODE_H });
  g.setNode(subjectId, { width: NODE_W, height: NODE_H });

  for (const b of tree.behaviours) {
    nodes.push({
      id: b.id,
      label: b.title,
      sublabel: b.tactic,
      kind: 'behaviour',
      width: NODE_W,
      height: NODE_H,
    });
    g.setNode(b.id, { width: NODE_W, height: NODE_H });
    edges.push({ from: subjectId, to: b.id });
    g.setEdge(subjectId, b.id);

    // Library match → single sage-green leaf, no opportunity/detection chain
    if (b.library_match) {
      const lmId = `${b.id}/library_match`;
      nodes.push({
        id: lmId,
        label: 'Already in library',
        sublabel: b.library_match.name,
        kind: 'library_match',
        width: NODE_W,
        height: NODE_H,
        behaviour: b,
      });
      g.setNode(lmId, { width: NODE_W, height: NODE_H });
      edges.push({ from: b.id, to: lmId });
      g.setEdge(b.id, lmId);
      continue;
    }

    // Otherwise: opportunities → detections
    for (const o of b.opportunities) {
      const oId = `${b.id}/${o.id}`;
      nodes.push({ id: oId, label: o.title, kind: 'opportunity', width: NODE_W, height: NODE_H });
      g.setNode(oId, { width: NODE_W, height: NODE_H });
      edges.push({ from: b.id, to: oId });
      g.setEdge(b.id, oId);

      const det = o.detection;
      const dId = `${oId}/${det.id}`;
      nodes.push({
        id: dId,
        label: det.name,
        kind: 'detection',
        width: NODE_W,
        height: NODE_H,
        qaVerdict: det.qa?.verdict ?? null,
        saved: !!det.saved_detection_id,
        archived: det.archived,
        feasibility: det.feasibility,
        behaviour: b,
        opportunity: o,
      });
      g.setNode(dId, { width: NODE_W, height: NODE_H });
      edges.push({ from: oId, to: dId });
      g.setEdge(oId, dId);
    }
  }

  dagre.layout(g);

  for (const n of nodes) {
    const laid = g.node(n.id);
    if (laid) {
      n.x = laid.x - NODE_W / 2;
      n.y = laid.y - NODE_H / 2;
    }
  }
  const graphInfo = g.graph();
  return {
    nodes,
    edges,
    width: graphInfo.width ?? NODE_W * 4,
    height: graphInfo.height ?? NODE_H * 8,
  };
}

export default ResearchCanvas;
