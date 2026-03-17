import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Icon } from '../Icon';
import { Detection } from '../../types';
import { useGraphData, GraphNode, NodeType } from '../../hooks/useGraphData';
import { ForceGraph, VisibilityFilter } from '../../lib/forceGraph';

// ============================================================================
// TYPES
// ============================================================================

interface IntelligenceGlobeProps {
  onNavigate: (type: 'group' | 'software' | 'technique', id: string) => void;
  detections: Detection[];
}

// ============================================================================
// NODE TYPE METADATA
// ============================================================================

const NODE_TYPE_META: Record<NodeType, { label: string; color: string; dotClass: string }> = {
  group: { label: 'Groups', color: '#f87171', dotClass: 'bg-red-400' },
  software: { label: 'Software', color: '#60a5fa', dotClass: 'bg-blue-400' },
  technique: { label: 'Techniques', color: '#fbbf24', dotClass: 'bg-amber-400' },
  campaign: { label: 'Campaigns', color: '#c084fc', dotClass: 'bg-purple-400' },
  detection: { label: 'Detections', color: '#005091', dotClass: 'bg-primary' },
};

const NODE_TYPES: NodeType[] = ['group', 'software', 'technique', 'campaign', 'detection'];

// ============================================================================
// COMPONENT
// ============================================================================

export const IntelligenceGlobe: React.FC<IntelligenceGlobeProps> = ({ onNavigate, detections }) => {
  // --- Graph Data (expand model) ---
  const {
    nodes,
    edges,
    loading,
    loadingPhase,
    error,
    stats,
    expandedIds,
    expandingNodeId,
    toggleExpand,
  } = useGraphData(detections);

  // --- UI State ---
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightDepth, setHighlightDepth] = useState(1);
  const [visibility, setVisibility] = useState<VisibilityFilter>({
    group: true,
    software: true,
    technique: true,
    campaign: true,
    detection: true,
  });

  // --- Refs ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraph | null>(null);

  // --- Derived State ---
  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null),
    [selectedNodeId, nodes],
  );

  const connectedNodes = useMemo(() => {
    if (!selectedNodeId) return [];
    const ids = new Set<string>();
    for (const edge of edges) {
      if (edge.source === selectedNodeId) ids.add(edge.target);
      else if (edge.target === selectedNodeId) ids.add(edge.source);
    }
    return nodes.filter((n) => ids.has(n.id));
  }, [selectedNodeId, edges, nodes]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return nodes
      .filter((n) => n.name.toLowerCase().includes(q) || n.mitre_id.toLowerCase().includes(q))
      .slice(0, 8);
  }, [searchQuery, nodes]);

  const coveragePct = useMemo(() => {
    if (stats.totalTechniques === 0) return 0;
    return Math.round((stats.coveredTechniques / stats.totalTechniques) * 100);
  }, [stats]);

  // --- Coverage for selected entity ---
  const selectedEntityCoverage = useMemo(() => {
    if (!selectedNode) return null;
    if (selectedNode.type === 'technique' || selectedNode.type === 'detection') return null;

    // Count techniques connected to this entity and how many are covered
    const connectedTechIds = new Set<string>();
    for (const edge of edges) {
      if (edge.source === selectedNode.id || edge.target === selectedNode.id) {
        const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
        const other = nodes.find((n) => n.id === otherId);
        if (other?.type === 'technique') connectedTechIds.add(other.id);
      }
    }

    const total = connectedTechIds.size;
    let covered = 0;
    for (const id of connectedTechIds) {
      const n = nodes.find((n) => n.id === id);
      if (n?.covered) covered++;
    }

    return { covered, total, pct: total > 0 ? Math.round((covered / total) * 100) : 0 };
  }, [selectedNode, edges, nodes]);

  // --- ForceGraph Lifecycle ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const graph = new ForceGraph(canvas, {
      width: rect.width,
      height: rect.height,
      onNodeClick: (node) => setSelectedNodeId(node.id),
      onNodeDoubleClick: (node) => {
        // Double-click → toggle expand highlight (visual focus on children)
        if (node.expandable) {
          toggleExpand(node.id);
        }
      },
      onBackgroundClick: () => setSelectedNodeId(null),
    });

    graphRef.current = graph;

    return () => {
      graph.destroy();
      graphRef.current = null;
    };
  }, [toggleExpand]);

  // --- Resize observer ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        graphRef.current?.resize(width, height);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // --- Sync data to graph engine ---
  useEffect(() => {
    graphRef.current?.setData(nodes, edges);
  }, [nodes, edges]);

  useEffect(() => {
    graphRef.current?.setVisibility(visibility);
  }, [visibility]);

  useEffect(() => {
    graphRef.current?.setSelectedNode(selectedNodeId);
  }, [selectedNodeId]);

  useEffect(() => {
    graphRef.current?.setHighlightDepth(highlightDepth);
  }, [highlightDepth]);

  // --- Handlers ---
  const handleToggleType = useCallback((type: NodeType) => {
    setVisibility((prev) => ({ ...prev, [type]: !prev[type] }));
  }, []);

  const handleSearchSelect = useCallback((node: GraphNode) => {
    setSelectedNodeId(node.id);
    setSearchQuery('');
    graphRef.current?.focusOnNode(node.id);
  }, []);

  const handleFocusGraph = useCallback(() => {
    if (selectedNodeId) {
      graphRef.current?.focusOnNode(selectedNodeId);
    }
  }, [selectedNodeId]);

  const handleExpandCollapse = useCallback(() => {
    if (!selectedNode) return;
    toggleExpand(selectedNode.id);
  }, [selectedNode, toggleExpand]);

  // --- Phase label ---
  const phaseLabel = loading
    ? loadingPhase === 'groups'
      ? 'Loading groups & software...'
      : loadingPhase === 'techniques'
        ? 'Loading techniques...'
        : loadingPhase === 'campaigns'
          ? 'Loading campaigns...'
          : 'Overlaying detections...'
    : null;

  return (
    <div className="flex h-full overflow-hidden relative font-brand">
      {/* === LEFT: GRAPH CANVAS === */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-4 px-5 py-3 bg-surface-container-lowest border-b border-outline-variant/20">
          {/* Node type toggles */}
          <div className="flex items-center gap-3">
            {NODE_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => handleToggleType(type)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium uppercase tracking-wider transition-all ${
                  visibility[type]
                    ? 'bg-surface-container text-on-surface'
                    : 'bg-transparent text-on-surface/30 line-through'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${NODE_TYPE_META[type].dotClass}`}
                  style={{ opacity: visibility[type] ? 1 : 0.3 }}
                />
                {NODE_TYPE_META[type].label}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-outline-variant/20" />

          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Icon name="search" className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search entities..."
              className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-surface-container rounded-lg text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:ring-1 focus:ring-primary/30"
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/20 z-50 overflow-hidden">
                {searchResults.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => handleSearchSelect(node)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-container transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full ${NODE_TYPE_META[node.type].dotClass}`} />
                    <span className="text-[11px] text-on-surface truncate">{node.name}</span>
                    <span className="text-[10px] text-on-surface-variant/50 ml-auto">{node.mitre_id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-outline-variant/20" />

          {/* Depth slider */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider">Depth</span>
            {[1, 2, 3].map((d) => (
              <button
                key={d}
                onClick={() => setHighlightDepth(d)}
                className={`w-6 h-6 rounded text-[11px] font-bold transition-all ${
                  highlightDepth === d
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant/60 hover:text-on-surface'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Canvas container */}
        <div ref={containerRef} className="flex-1 relative bg-background">
          <canvas ref={canvasRef} className="absolute inset-0" />

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
              <div className="flex flex-col items-center gap-3">
                <Icon name="loader" className="w-8 h-8 text-primary animate-spin" />
                <p className="text-[11px] text-on-surface-variant uppercase tracking-wider font-medium">
                  {phaseLabel}
                </p>
              </div>
            </div>
          )}

          {/* Error overlay */}
          {error && (
            <div className="absolute inset-x-0 top-4 flex justify-center z-10">
              <div className="bg-error-container text-on-error-container rounded-2xl px-5 py-3 flex items-center gap-3 shadow-lg">
                <Icon name="alert-triangle" className="w-4 h-4" />
                <span className="text-[11px] font-medium">{error}</span>
              </div>
            </div>
          )}

          {/* Node count badge */}
          {!loading && (
            <div className="absolute bottom-4 left-4 flex items-center gap-2 text-[10px] text-on-surface-variant/50 uppercase tracking-wider">
              <span>{nodes.length} nodes</span>
              <span className="w-1 h-1 rounded-full bg-on-surface-variant/30" />
              <span>{edges.length} edges</span>
            </div>
          )}
        </div>
      </div>

      {/* === RIGHT: CONTEXT PANEL === */}
      <div className="w-[380px] flex-shrink-0 bg-surface-container-lowest border-l border-outline-variant/20 flex flex-col overflow-hidden">
        {selectedNode ? (
          /* -- Selected Node Dossier -- */
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-5 border-b border-outline-variant/10">
              <div className="flex items-center justify-between mb-2">
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    color: NODE_TYPE_META[selectedNode.type].color,
                    backgroundColor: `${NODE_TYPE_META[selectedNode.type].color}15`,
                  }}
                >
                  {NODE_TYPE_META[selectedNode.type].label.slice(0, -1)}
                </span>
                <span className="text-[10px] text-on-surface-variant/50 font-mono">{selectedNode.mitre_id}</span>
              </div>
              <h2 className="text-lg font-bold text-on-surface leading-tight">{selectedNode.name}</h2>

              {/* Coverage bar */}
              {selectedEntityCoverage && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider font-bold">
                      Technique Coverage
                    </span>
                    <span className="text-[11px] font-bold text-on-surface">
                      {selectedEntityCoverage.covered}/{selectedEntityCoverage.total}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${selectedEntityCoverage.pct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Technique gap/covered status */}
              {selectedNode.type === 'technique' && (
                <div className="mt-3">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      selectedNode.covered
                        ? 'bg-primary/10 text-primary'
                        : 'bg-red-400/10 text-red-400'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${selectedNode.covered ? 'bg-primary' : 'bg-red-400'}`} />
                    {selectedNode.covered ? 'Covered' : 'Gap — No Detection'}
                  </span>
                </div>
              )}
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {/* Description */}
              {selectedNode.description && (
                <div className="p-5 border-b border-outline-variant/10">
                  <h3 className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider font-bold mb-2">
                    Description
                  </h3>
                  <p className="text-[12px] text-on-surface-variant leading-relaxed">
                    {selectedNode.description.length > 300
                      ? selectedNode.description.substring(0, 300) + '...'
                      : selectedNode.description}
                  </p>
                </div>
              )}

              {/* Connected entities */}
              {connectedNodes.length > 0 && (
                <div className="p-5 border-b border-outline-variant/10">
                  <h3 className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider font-bold mb-3">
                    Connected Entities ({connectedNodes.length})
                  </h3>
                  <div className="space-y-1.5 max-h-[240px] overflow-y-auto custom-scrollbar">
                    {connectedNodes.slice(0, 20).map((node) => (
                      <button
                        key={node.id}
                        onClick={() => {
                          setSelectedNodeId(node.id);
                          graphRef.current?.setSelectedNode(node.id);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-container transition-colors group"
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${NODE_TYPE_META[node.type].dotClass}`} />
                        <span className="text-[11px] text-on-surface truncate group-hover:text-primary transition-colors">
                          {node.name}
                        </span>
                        {node.type === 'technique' && (
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${node.covered ? 'bg-primary' : 'bg-red-400'}`} />
                        )}
                        <span className="text-[10px] text-on-surface-variant/40 ml-auto flex-shrink-0">
                          {node.mitre_id}
                        </span>
                      </button>
                    ))}
                    {connectedNodes.length > 20 && (
                      <p className="text-[10px] text-on-surface-variant/40 px-3 pt-1">
                        +{connectedNodes.length - 20} more
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Detection info for detection nodes */}
              {selectedNode.type === 'detection' && (
                <div className="p-5 border-b border-outline-variant/10">
                  <h3 className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider font-bold mb-3">
                    Detection Details
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] text-on-surface-variant/50 uppercase tracking-wider mb-0.5">Quality</div>
                      <div className="text-lg font-bold text-on-surface">{selectedNode.quality_score ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-on-surface-variant/50 uppercase tracking-wider mb-0.5">Status</div>
                      <div className="text-[11px] font-medium text-on-surface capitalize">{selectedNode.status ?? 'Unknown'}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-5 border-t border-outline-variant/10 space-y-2">
              {/* Focus/Unfocus button — highlights this node's children */}
              {selectedNode.expandable && selectedNode.type !== 'detection' && (
                <button
                  onClick={handleExpandCollapse}
                  className={`w-full py-2.5 text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all ${
                    selectedNode.expanded
                      ? 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                      : 'bg-primary hover:bg-primary/90 text-on-primary'
                  }`}
                >
                  {selectedNode.expanded ? 'Unfocus' : 'Focus Children'}
                </button>
              )}

              {/* Navigate to dossier */}
              {(selectedNode.type === 'group' || selectedNode.type === 'software' || selectedNode.type === 'technique') && (
                <button
                  onClick={() => onNavigate(
                    selectedNode.type as 'group' | 'software' | 'technique',
                    selectedNode.mitre_id,
                  )}
                  className={`w-full py-2.5 text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all ${
                    selectedNode.expandable
                      ? 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                      : 'bg-primary hover:bg-primary/90 text-on-primary'
                  }`}
                >
                  View Full Dossier
                </button>
              )}

              <button
                onClick={handleFocusGraph}
                className="w-full py-2.5 bg-surface-container hover:bg-surface-container-high text-on-surface text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all"
              >
                Focus Graph
              </button>
            </div>
          </div>
        ) : (
          /* -- Default: Instructions + Legend + Stats -- */
          <div className="flex flex-col h-full">
            <div className="p-5 border-b border-outline-variant/10">
              <h2 className="text-lg font-bold text-on-surface mb-1">Intelligence Graph</h2>
              <p className="text-[11px] text-on-surface-variant/60">
                Explore threat relationships across MITRE ATT&CK entities. Double-click a node to focus on its children.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {/* Legend */}
              <div className="p-5 border-b border-outline-variant/10">
                <h3 className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider font-bold mb-3">
                  Legend
                </h3>
                <div className="space-y-2">
                  {NODE_TYPES.map((type) => (
                    <div key={type} className="flex items-center gap-2.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${NODE_TYPE_META[type].dotClass}`} />
                      <span className="text-[11px] text-on-surface-variant">
                        {NODE_TYPE_META[type].label}
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-outline-variant/10 pt-2 mt-2 space-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-primary/30" />
                      <span className="text-[11px] text-on-surface-variant">Covered technique</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-red-400/50" />
                      <span className="text-[11px] text-on-surface-variant">Gap — no detection</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] text-on-surface-variant/40 font-mono">+</span>
                      <span className="text-[11px] text-on-surface-variant">Expandable node</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Node Counts */}
              <div className="p-5 border-b border-outline-variant/10">
                <h3 className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider font-bold mb-3">
                  Loaded Entities
                </h3>
                <div className="space-y-2">
                  {NODE_TYPES.map((type) => {
                    const count =
                      type === 'group' ? stats.groups
                      : type === 'software' ? stats.software
                      : type === 'technique' ? stats.techniques
                      : type === 'campaign' ? stats.campaigns
                      : stats.detections;
                    if (count === 0) return null;
                    return (
                      <div key={type} className="flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full ${NODE_TYPE_META[type].dotClass}`} />
                        <span className="text-[11px] text-on-surface-variant flex-1">
                          {NODE_TYPE_META[type].label}
                        </span>
                        <span className="text-[11px] font-bold text-on-surface tabular-nums">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Coverage (only when techniques are loaded) */}
              {stats.totalTechniques > 0 && (
                <div className="p-5 border-b border-outline-variant/10">
                  <h3 className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider font-bold mb-3">
                    Visible Coverage
                  </h3>
                  <div className="flex items-center gap-5">
                    <div className="relative w-16 h-16 flex-shrink-0">
                      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                        <circle
                          cx="18" cy="18" r="15.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          className="text-surface-container"
                        />
                        <circle
                          cx="18" cy="18" r="15.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeDasharray={`${coveragePct} ${100 - coveragePct}`}
                          strokeLinecap="round"
                          className="text-primary"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold text-on-surface">{coveragePct}%</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-on-surface-variant">
                        <strong className="text-on-surface">{stats.coveredTechniques}</strong> of{' '}
                        <strong className="text-on-surface">{stats.totalTechniques}</strong> visible techniques covered
                      </div>
                      {stats.detections > 0 && (
                        <div className="text-[10px] text-on-surface-variant/50 mt-1">
                          {stats.detections} detection rules visible
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
