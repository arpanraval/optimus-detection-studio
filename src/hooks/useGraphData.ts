import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Detection } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeType = 'group' | 'software' | 'technique' | 'campaign' | 'detection';

export interface GraphNode {
  id: string;
  stix_id: string;
  mitre_id: string;
  name: string;
  type: NodeType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  technique_count?: number;
  description?: string;
  covered?: boolean;
  quality_score?: number;
  status?: string;
  expandable?: boolean;
  expanded?: boolean;
  parentId?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export type LoadingPhase = 'groups' | 'techniques' | 'campaigns' | 'detections' | 'done';

export interface GraphStats {
  groups: number;
  software: number;
  techniques: number;
  campaigns: number;
  detections: number;
  coveredTechniques: number;
  totalTechniques: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_COLORS: Record<NodeType, string> = {
  group: '#f87171',
  software: '#60a5fa',
  technique: '#fbbf24',
  campaign: '#c084fc',
  detection: '#005091',
};

const COVERED_TECHNIQUE_COLOR = '#005091';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomX(): number {
  return (Math.random() - 0.5) * 800;
}

function randomY(): number {
  return (Math.random() - 0.5) * 600;
}

function makeNode(
  id: string,
  stix_id: string,
  mitre_id: string,
  name: string,
  type: NodeType,
  radius: number,
  overrides?: Partial<GraphNode>,
): GraphNode {
  return {
    id,
    stix_id,
    mitre_id,
    name,
    type,
    x: randomX(),
    y: randomY(),
    vx: 0,
    vy: 0,
    radius,
    color: NODE_COLORS[type],
    ...overrides,
  };
}

/**
 * Fetch rows from `mitre_objects` in batches of `batchSize` using an `in`
 * filter on the `stix_id` column. Supabase has a practical URL-length limit,
 * so we chunk large ID lists.
 */
async function fetchObjectsByStixIds(
  stixIds: string[],
  type: string,
  batchSize = 100,
): Promise<any[]> {
  if (stixIds.length === 0) return [];
  const results: any[] = [];

  for (let i = 0; i < stixIds.length; i += batchSize) {
    const batch = stixIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('mitre_objects')
      .select('id, name, stix_id, mitre_id, description')
      .eq('type', type)
      .in('stix_id', batch);

    if (error) {
      console.error(`Failed to fetch ${type} batch:`, error);
      continue;
    }
    if (data) results.push(...data);
  }

  return results;
}

function computeStats(nodes: GraphNode[]): GraphStats {
  let groups = 0;
  let software = 0;
  let techniques = 0;
  let campaigns = 0;
  let detectionCount = 0;
  let coveredTechniques = 0;
  let totalTechniques = 0;

  for (const n of nodes) {
    switch (n.type) {
      case 'group': groups++; break;
      case 'software': software++; break;
      case 'technique':
        techniques++;
        totalTechniques++;
        if (n.covered) coveredTechniques++;
        break;
      case 'campaign': campaigns++; break;
      case 'detection': detectionCount++; break;
    }
  }

  return { groups, software, techniques, campaigns, detections: detectionCount, coveredTechniques, totalTechniques };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGraphData(detections: Detection[]): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  loading: boolean;
  loadingPhase: LoadingPhase;
  error: string | null;
  stats: GraphStats;
  expandedIds: Set<string>;
  expandingNodeId: string | null;
  toggleExpand: (nodeId: string) => void;
} {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('groups');
  const [error, setError] = useState<string | null>(null);

  // Expand/collapse overlay state — which group nodes are "expanded" (highlighted with children)
  const [expandedIds, setExpandedIds] = useState(new Set<string>());
  const [expandingNodeId] = useState<string | null>(null);

  // Derive the set of technique IDs the user covers via their detections.
  // Use a ref so the loading effect doesn't re-trigger on every detections change.
  const userTechniqueIdsRef = useRef(new Set<string>());
  useMemo(() => {
    const ids = new Set<string>();
    for (const d of detections) {
      for (const tid of d.mitreAttackIds ?? []) {
        ids.add(tid);
      }
    }
    userTechniqueIdsRef.current = ids;
  }, [detections]);

  // Stable ref for detections array
  const detectionsRef = useRef(detections);
  detectionsRef.current = detections;

  // Track which group stix_id -> child technique/software node IDs
  const groupChildrenRef = useRef(new Map<string, Set<string>>());

  // -------------------------------------------------------------------
  // Main data-loading effect — runs ONCE on mount
  //
  // IMPORTANT: We accumulate nodes/edges in local arrays and use
  // replacement setState (not functional updates) each phase. This
  // prevents StrictMode double-invocation from interleaving edges
  // from one run with nodes from another run.
  // -------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      setLoadingPhase('groups');

      // Local accumulators — all phases append here, then we set state
      // with a full snapshot each phase so edges always match nodes.
      const allNodes: GraphNode[] = [];
      const allEdges: GraphEdge[] = [];

      try {
        // ---------------------------------------------------------------
        // Phase 1 -- Groups + Software
        // ---------------------------------------------------------------
        const { data: groupRows, error: groupErr } = await supabase
          .from('v_mitre_groups_with_stats')
          .select('id, name, stix_id, mitre_id, technique_count, description, deprecated')
          .eq('deprecated', false)
          .order('technique_count', { ascending: false })
          .limit(60);

        if (groupErr) throw new Error(`Groups fetch failed: ${groupErr.message}`);
        if (cancelled) return;

        const groupStixIds = (groupRows ?? []).map((g: any) => g.stix_id);

        // Fetch all `uses` relationships originating from these groups
        const { data: groupRels, error: relErr } = await supabase
          .from('mitre_relationships')
          .select('source_ref, target_ref, relationship_type')
          .eq('relationship_type', 'uses')
          .in('source_ref', groupStixIds);

        if (relErr) throw new Error(`Group relationships fetch failed: ${relErr.message}`);
        if (cancelled) return;

        // Fetch software objects (malware + tool)
        const { data: softwareRows, error: swErr } = await supabase
          .from('mitre_objects')
          .select('id, name, stix_id, mitre_id, type, description')
          .in('type', ['malware', 'tool'])
          .eq('deprecated', false)
          .limit(120);

        if (swErr) throw new Error(`Software fetch failed: ${swErr.message}`);
        if (cancelled) return;

        // Build a set of software stix_ids for quick lookup
        const allSoftwareStixIds = new Set(
          (softwareRows ?? []).map((s: any) => s.stix_id),
        );

        // Only include software that is referenced by a group relationship
        const softwareUsageCount = new Map<string, number>();
        for (const rel of groupRels ?? []) {
          if (allSoftwareStixIds.has(rel.target_ref)) {
            softwareUsageCount.set(
              rel.target_ref,
              (softwareUsageCount.get(rel.target_ref) ?? 0) + 1,
            );
          }
        }

        const usedSoftware = (softwareRows ?? []).filter((s: any) =>
          softwareUsageCount.has(s.stix_id),
        );

        // Build group nodes
        const maxTechCount = Math.max(
          1,
          ...((groupRows ?? []).map((g: any) => g.technique_count ?? 0)),
        );

        const groupNodes: GraphNode[] = (groupRows ?? []).map((g: any) =>
          makeNode(g.id, g.stix_id, g.mitre_id, g.name, 'group',
            6 + ((g.technique_count ?? 0) / maxTechCount) * 14,
            {
              technique_count: g.technique_count,
              description: g.description,
              expandable: true,
              expanded: false,
            }),
        );

        // Build software nodes
        const maxUsage = Math.max(1, ...Array.from(softwareUsageCount.values()));

        const softwareNodes: GraphNode[] = usedSoftware.map((s: any) =>
          makeNode(s.id, s.stix_id, s.mitre_id, s.name, 'software',
            4 + ((softwareUsageCount.get(s.stix_id) ?? 0) / maxUsage) * 10,
            {
              description: s.description,
              expandable: true,
              expanded: false,
            }),
        );

        // Build group->software edges
        const softwareNodeIds = new Map(
          softwareNodes.map((n) => [n.stix_id, n.id]),
        );
        const groupNodeIds = new Map(
          groupNodes.map((n) => [n.stix_id, n.id]),
        );

        for (const rel of groupRels ?? []) {
          const sourceId = groupNodeIds.get(rel.source_ref);
          const targetId = softwareNodeIds.get(rel.target_ref);
          if (sourceId && targetId) {
            allEdges.push({ source: sourceId, target: targetId, type: 'uses' });
          }
        }

        allNodes.push(...groupNodes, ...softwareNodes);

        if (cancelled) return;
        setNodes([...allNodes]);
        setEdges([...allEdges]);

        // ---------------------------------------------------------------
        // Phase 2 -- Techniques
        // ---------------------------------------------------------------
        setLoadingPhase('techniques');

        // Collect technique stix_ids from group relationships (targets that are NOT software)
        const techniqueStixIds = new Set<string>();
        for (const rel of groupRels ?? []) {
          if (!allSoftwareStixIds.has(rel.target_ref)) {
            techniqueStixIds.add(rel.target_ref);
          }
        }

        // Also fetch group->technique uses rels, excluding software targets
        let groupTechRels = groupRels ?? [];
        if (allSoftwareStixIds.size > 0) {
          groupTechRels = groupTechRels.filter(
            (r: any) => !allSoftwareStixIds.has(r.target_ref),
          );
        }

        // Batch-fetch technique objects
        const techniqueObjects = await fetchObjectsByStixIds(
          Array.from(techniqueStixIds),
          'attack-pattern',
        );
        if (cancelled) return;

        const techniqueNodeMap = new Map<string, GraphNode>();
        for (const t of techniqueObjects) {
          const covered = userTechniqueIdsRef.current.has(t.mitre_id);
          const node = makeNode(t.id, t.stix_id, t.mitre_id, t.name, 'technique', 3, {
            covered,
            color: covered ? COVERED_TECHNIQUE_COLOR : NODE_COLORS.technique,
            description: t.description,
            expandable: true,
            expanded: false,
          });
          techniqueNodeMap.set(t.stix_id, node);
        }

        // Build group->technique edges + compute group children map
        const childrenMap = new Map<string, Set<string>>();

        for (const rel of groupTechRels) {
          const sourceId = groupNodeIds.get(rel.source_ref);
          const targetNode = techniqueNodeMap.get(rel.target_ref);
          if (sourceId && targetNode) {
            allEdges.push({ source: sourceId, target: targetNode.id, type: 'uses' });

            // Track children for expand/collapse
            if (!childrenMap.has(sourceId)) childrenMap.set(sourceId, new Set());
            childrenMap.get(sourceId)!.add(targetNode.id);
          }
        }

        // Also add software to children map
        for (const rel of groupRels ?? []) {
          const sourceId = groupNodeIds.get(rel.source_ref);
          const targetId = softwareNodeIds.get(rel.target_ref);
          if (sourceId && targetId) {
            if (!childrenMap.has(sourceId)) childrenMap.set(sourceId, new Set());
            childrenMap.get(sourceId)!.add(targetId);
          }
        }

        groupChildrenRef.current = childrenMap;

        const techniqueNodes = Array.from(techniqueNodeMap.values());
        allNodes.push(...techniqueNodes);

        if (cancelled) return;
        setNodes([...allNodes]);
        setEdges([...allEdges]);

        // ---------------------------------------------------------------
        // Phase 3 -- Campaigns
        // ---------------------------------------------------------------
        setLoadingPhase('campaigns');

        const { data: campaignRows, error: campErr } = await supabase
          .from('mitre_objects')
          .select('id, name, stix_id, mitre_id, description')
          .eq('type', 'campaign')
          .eq('deprecated', false)
          .limit(50);

        if (campErr) throw new Error(`Campaigns fetch failed: ${campErr.message}`);
        if (cancelled) return;

        const campaignStixIds = (campaignRows ?? []).map((c: any) => c.stix_id);

        const { data: campaignRels, error: campRelErr } = await supabase
          .from('mitre_relationships')
          .select('source_ref, target_ref, relationship_type')
          .in('relationship_type', ['uses', 'attributed-to'])
          .in('source_ref', campaignStixIds.length > 0 ? campaignStixIds : ['__none__']);

        if (campRelErr) throw new Error(`Campaign rels fetch failed: ${campRelErr.message}`);
        if (cancelled) return;

        // Count relationships per campaign
        const campaignRelCount = new Map<string, number>();
        for (const rel of campaignRels ?? []) {
          campaignRelCount.set(
            rel.source_ref,
            (campaignRelCount.get(rel.source_ref) ?? 0) + 1,
          );
        }

        const campaignNodeMap = new Map<string, string>(); // stix_id -> node id
        const campaignNodes: GraphNode[] = (campaignRows ?? []).map((c: any) => {
          const relCount = campaignRelCount.get(c.stix_id) ?? 0;
          const node = makeNode(
            c.id, c.stix_id, c.mitre_id, c.name, 'campaign',
            4 + Math.min(relCount, 10),
            { description: c.description },
          );
          campaignNodeMap.set(c.stix_id, node.id);
          return node;
        });

        // Build campaign edges (to groups, techniques, software)
        const allNodeStixToId = new Map<string, string>();
        for (const n of groupNodes) allNodeStixToId.set(n.stix_id, n.id);
        for (const n of softwareNodes) allNodeStixToId.set(n.stix_id, n.id);
        for (const [stixId, node] of techniqueNodeMap) allNodeStixToId.set(stixId, node.id);

        for (const rel of campaignRels ?? []) {
          const sourceId = campaignNodeMap.get(rel.source_ref);
          const targetId = allNodeStixToId.get(rel.target_ref);
          if (sourceId && targetId) {
            allEdges.push({
              source: sourceId,
              target: targetId,
              type: rel.relationship_type,
            });
          }
        }

        allNodes.push(...campaignNodes);

        if (cancelled) return;
        setNodes([...allNodes]);
        setEdges([...allEdges]);

        // ---------------------------------------------------------------
        // Phase 4 -- User Detections
        // ---------------------------------------------------------------
        setLoadingPhase('detections');

        for (const d of detectionsRef.current) {
          if (!d.mitreAttackIds || d.mitreAttackIds.length === 0) continue;

          const radius = 3 + Math.min((d.qualityScore ?? 0) / 20, 4);
          const node = makeNode(
            `detection-${d.id}`,
            '',
            '',
            d.name,
            'detection',
            radius,
            {
              quality_score: d.qualityScore,
              status: d.status,
            },
          );
          allNodes.push(node);

          for (const tid of d.mitreAttackIds) {
            // Find the technique node whose mitre_id matches
            const techNode = techniqueObjects.find((t: any) => t.mitre_id === tid);
            if (techNode) {
              allEdges.push({
                source: node.id,
                target: techNode.id,
                type: 'detects',
              });
            }
          }
        }

        if (cancelled) return;
        setNodes([...allNodes]);
        setEdges([...allEdges]);

        // ---------------------------------------------------------------
        // Done
        // ---------------------------------------------------------------
        setLoadingPhase('done');
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unknown error loading graph data';
        console.error('useGraphData error:', err);
        setError(message);
        setLoading(false);
        setLoadingPhase('done');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------
  // toggleExpand — highlight/dim a group's children in the graph
  // This doesn't add/remove nodes. It toggles the `expanded` flag
  // which the ForceGraph renders with a visual indicator.
  // -------------------------------------------------------------------
  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });

    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, expanded: !n.expanded } : n,
    ));
  }, []);

  // -------------------------------------------------------------------
  // Stats (derived from current node state)
  // -------------------------------------------------------------------
  const stats = useMemo<GraphStats>(() => computeStats(nodes), [nodes]);

  return {
    nodes,
    edges,
    loading,
    loadingPhase,
    error,
    stats,
    expandedIds,
    expandingNodeId,
    toggleExpand,
  };
}
