import type { GraphNode, GraphEdge } from '@/hooks/useGraphData';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface ForceGraphOptions {
  width: number;
  height: number;
  onNodeClick?: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  onBackgroundClick?: () => void;
}

export interface VisibilityFilter {
  group: boolean;
  software: boolean;
  technique: boolean;
  campaign: boolean;
  detection: boolean;
}

// ---------------------------------------------------------------------------
// Edge color palettes (normal / highlighted) by relationship type
// ---------------------------------------------------------------------------

const EDGE_COLORS: Record<string, { normal: string; highlight: string }> = {
  uses: {
    normal: 'rgba(148, 163, 184, 0.25)',
    highlight: 'rgba(148, 163, 184, 0.7)',
  },
  'attributed-to': {
    normal: 'rgba(192, 132, 252, 0.25)',
    highlight: 'rgba(192, 132, 252, 0.7)',
  },
  detects: {
    normal: 'rgba(96, 165, 250, 0.25)',
    highlight: 'rgba(96, 165, 250, 0.7)',
  },
};

const DEFAULT_EDGE_COLOR = {
  normal: 'rgba(148, 163, 184, 0.25)',
  highlight: 'rgba(148, 163, 184, 0.7)',
};

// ---------------------------------------------------------------------------
// Physics constants
// ---------------------------------------------------------------------------

const REPULSION = 800;
const ALPHA = 0.3;
const SPRING_STRENGTH = 0.005;
const GRAVITY = 0.01;
const DAMPING = 0.9;

// ---------------------------------------------------------------------------
// Interaction constants
// ---------------------------------------------------------------------------

const DOUBLE_CLICK_MS = 400;
const ZOOM_IN_FACTOR = 1.08;
const ZOOM_OUT_FACTOR = 0.92;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const MIN_HIT_RADIUS = 8;

// Gap technique visual constants
const GAP_RING_COLOR = 'rgba(248, 113, 113, 0.8)';
const GAP_PULSE_SPEED = 0.002;

// ---------------------------------------------------------------------------
// ForceGraph class
// ---------------------------------------------------------------------------

export class ForceGraph {
  // Canvas / context
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private dpr: number;

  // Callbacks
  private onNodeClick?: (node: GraphNode) => void;
  private onNodeHover?: (node: GraphNode | null) => void;
  private onNodeDoubleClick?: (node: GraphNode) => void;
  private onBackgroundClick?: () => void;

  // Data
  private nodes: GraphNode[] = [];
  private edges: GraphEdge[] = [];

  // Node lookup for O(1) access in simulation/rendering
  private nodeMap: Map<string, GraphNode> = new Map();

  // Visibility
  private visibility: VisibilityFilter = {
    group: true,
    software: true,
    technique: true,
    campaign: true,
    detection: true,
  };

  // Camera
  private view = { offsetX: 0, offsetY: 0, zoom: 1 };

  // Interaction state
  private isDragging = false;
  private isPanning = false;
  private dragNode: GraphNode | null = null;
  private lastMouse = { x: 0, y: 0 };
  private hoveredNode: GraphNode | null = null;

  // Selection / highlight
  private selectedNodeId: string | null = null;
  private highlightedNodeIds: Set<string> = new Set();
  private highlightDepth = 1;

  // Double-click tracking
  private lastClickNodeId: string | null = null;
  private lastClickTime = 0;

  // Animation
  private animationFrameId: number | null = null;
  private destroyed = false;
  private frameTime = 0;


  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  constructor(canvas: HTMLCanvasElement, options: ForceGraphOptions) {
    this.canvas = canvas;
    this.width = options.width;
    this.height = options.height;
    this.onNodeClick = options.onNodeClick;
    this.onNodeHover = options.onNodeHover;
    this.onNodeDoubleClick = options.onNodeDoubleClick;
    this.onBackgroundClick = options.onBackgroundClick;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D canvas context');
    }
    this.ctx = ctx;

    this.dpr = window.devicePixelRatio || 1;
    this.applyCanvasSize();

    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });

    this.tick();
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  setData(nodes: GraphNode[], edges: GraphEdge[]): void {
    this.nodes = nodes;
    this.edges = edges;
    this.rebuildNodeMap();
    this.recomputeHighlights();
  }

  mergeData(newNodes: GraphNode[], newEdges: GraphEdge[]): void {
    const existingIds = this.nodeMap;

    // Add only new nodes, skip existing (preserves x/y/vx/vy)
    for (const node of newNodes) {
      if (!existingIds.has(node.id)) {
        this.nodes.push(node);
        this.nodeMap.set(node.id, node);
      }
    }

    // Add only new edges (skip duplicates)
    const existingEdgeKeys = new Set(
      this.edges.map(e => `${e.source}→${e.target}`),
    );
    for (const edge of newEdges) {
      const key = `${edge.source}→${edge.target}`;
      if (!existingEdgeKeys.has(key)) {
        this.edges.push(edge);
        existingEdgeKeys.add(key);
      }
    }

    this.recomputeHighlights();
  }

  removeNodes(nodeIds: Set<string>): void {
    this.nodes = this.nodes.filter(n => !nodeIds.has(n.id));
    this.edges = this.edges.filter(
      e => !nodeIds.has(e.source) && !nodeIds.has(e.target),
    );
    this.rebuildNodeMap();

    // Clear selection if removed
    if (this.selectedNodeId && nodeIds.has(this.selectedNodeId)) {
      this.selectedNodeId = null;
    }

    this.recomputeHighlights();
  }

  setVisibility(filter: VisibilityFilter): void {
    this.visibility = filter;
  }

  setSelectedNode(id: string | null): void {
    this.selectedNodeId = id;
    this.recomputeHighlights();
  }

  setHighlightDepth(depth: number): void {
    this.highlightDepth = depth;
    this.recomputeHighlights();
  }

  focusOnNode(id: string): void {
    const node = this.nodeMap.get(id);
    if (!node) return;

    this.view.offsetX = -node.x;
    this.view.offsetY = -node.y;
    this.view.zoom = 1.5;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.applyCanvasSize();
  }

  destroy(): void {
    this.destroyed = true;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    this.canvas.removeEventListener('wheel', this.handleWheel);
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  private rebuildNodeMap(): void {
    this.nodeMap.clear();
    for (const node of this.nodes) {
      this.nodeMap.set(node.id, node);
    }
  }

  // ------------------------------------------------------------------
  // Canvas sizing
  // ------------------------------------------------------------------

  private applyCanvasSize(): void {
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // ------------------------------------------------------------------
  // Animation loop
  // ------------------------------------------------------------------

  private tick = (): void => {
    if (this.destroyed) return;

    this.frameTime = performance.now();
    this.simulate();
    this.render();
    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  // ------------------------------------------------------------------
  // Physics simulation
  // ------------------------------------------------------------------

  private isNodeVisible(node: GraphNode): boolean {
    return this.visibility[node.type as keyof VisibilityFilter] ?? true;
  }

  private simulate(): void {
    const visibleNodes = this.nodes.filter((n) => this.isNodeVisible(n));

    // Repulsion between all visible node pairs
    for (let i = 0; i < visibleNodes.length; i++) {
      const a = visibleNodes[i];
      for (let j = i + 1; j < visibleNodes.length; j++) {
        const b = visibleNodes[j];

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy || 1;
        const force = (REPULSION / distSq) * ALPHA;

        const fx = dx * force;
        const fy = dy * force;

        if (a !== this.dragNode) {
          a.vx -= fx;
          a.vy -= fy;
        }
        if (b !== this.dragNode) {
          b.vx += fx;
          b.vy += fy;
        }
      }
    }

    // Spring attraction along edges
    const visibleIds = new Set(visibleNodes.map((n) => n.id));

    for (const edge of this.edges) {
      if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;

      const source = this.nodeMap.get(edge.source);
      const target = this.nodeMap.get(edge.target);
      if (!source || !target) continue;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const fx = dx * SPRING_STRENGTH;
      const fy = dy * SPRING_STRENGTH;

      if (source !== this.dragNode) {
        source.vx += fx;
        source.vy += fy;
      }
      if (target !== this.dragNode) {
        target.vx -= fx;
        target.vy -= fy;
      }
    }

    // Center gravity + velocity integration
    for (const node of visibleNodes) {
      if (node === this.dragNode) continue;

      node.vx -= node.x * GRAVITY;
      node.vy -= node.y * GRAVITY;

      node.vx *= DAMPING;
      node.vy *= DAMPING;

      node.x += node.vx;
      node.y += node.vy;
    }
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  private render(): void {
    const { ctx, width, height, view } = this;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2 + view.offsetX * view.zoom, height / 2 + view.offsetY * view.zoom);
    ctx.scale(view.zoom, view.zoom);

    this.drawEdges();
    this.drawNodes();

    ctx.restore();
  }

  private drawEdges(): void {
    const { ctx } = this;
    const hasSelection = this.selectedNodeId !== null;

    for (const edge of this.edges) {
      const source = this.nodeMap.get(edge.source);
      const target = this.nodeMap.get(edge.target);
      if (!source || !target) continue;
      if (!this.isNodeVisible(source) || !this.isNodeVisible(target)) continue;

      const sourceHighlighted = this.highlightedNodeIds.has(edge.source);
      const targetHighlighted = this.highlightedNodeIds.has(edge.target);
      const isHighlighted = hasSelection && sourceHighlighted && targetHighlighted;
      const isDimmed = hasSelection && !isHighlighted;

      const palette = EDGE_COLORS[edge.type] ?? DEFAULT_EDGE_COLOR;

      ctx.globalAlpha = isDimmed ? 0.03 : 1;
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = isHighlighted ? palette.highlight : palette.normal;
      ctx.lineWidth = isHighlighted ? 1.5 : 0.5;
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  private drawNodes(): void {
    const { ctx, view } = this;
    const hasSelection = this.selectedNodeId !== null;
    const pulsePhase = Math.sin(this.frameTime * GAP_PULSE_SPEED) * 0.3 + 0.7;

    for (const node of this.nodes) {
      if (!this.isNodeVisible(node)) continue;

      const isHighlighted = this.highlightedNodeIds.has(node.id);
      const isDimmed = hasSelection && !isHighlighted;
      const isSelected = node.id === this.selectedNodeId;
      const isHovered = node.id === this.hoveredNode?.id;
      const r = node.radius;

      ctx.globalAlpha = isDimmed ? 0.2 : 1;

      // Detection glow
      if (node.type === 'detection') {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(96, 165, 250, 0.2)';
        ctx.fill();
      }

      // Technique coverage indicators
      if (node.type === 'technique') {
        if (node.covered) {
          // Covered technique — solid green/primary ring
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(96, 165, 250, 0.7)';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          // GAP technique — red pulsing ring (KEY visual)
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 3.5, 0, Math.PI * 2);
          ctx.strokeStyle = GAP_RING_COLOR;
          ctx.lineWidth = 2.5;
          ctx.globalAlpha = isDimmed ? 0.2 : pulsePhase;
          ctx.stroke();
          ctx.globalAlpha = isDimmed ? 0.2 : 1;
        }
      }

      // Expanded node indicator — solid outer ring
      if (node.expanded) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Expandable but not expanded — small + indicator
      if (node.expandable && !node.expanded && node.type !== 'detection') {
        const plusSize = 3;
        const px = node.x + r + 2;
        const py = node.y - r - 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px - plusSize, py);
        ctx.lineTo(px + plusSize, py);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px, py - plusSize);
        ctx.lineTo(px, py + plusSize);
        ctx.stroke();
      }

      // Selected / hovered ring
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 5, 0, Math.PI * 2);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Node fill
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();

      // Label — always show for seed groups (large radius), hovered, or selected
      const showLabel = isSelected || isHovered || r * view.zoom > 8;
      if (showLabel) {
        const fontSize = Math.max(11 / view.zoom, 9);
        ctx.font = `${fontSize}px system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.name, node.x + r + 4, node.y);
      }

      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------
  // Hit testing
  // ------------------------------------------------------------------

  private screenToGraph(screenX: number, screenY: number): { gx: number; gy: number } {
    const { width, height, view } = this;
    const gx = (screenX - width / 2 - view.offsetX * view.zoom) / view.zoom;
    const gy = (screenY - height / 2 - view.offsetY * view.zoom) / view.zoom;
    return { gx, gy };
  }

  private hitTest(screenX: number, screenY: number): GraphNode | null {
    const { gx, gy } = this.screenToGraph(screenX, screenY);

    // Check in reverse order so top-rendered nodes are hit first
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      if (!this.isNodeVisible(node)) continue;

      const hitRadius = Math.max(node.radius, MIN_HIT_RADIUS);
      const dx = gx - node.x;
      const dy = gy - node.y;

      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return node;
      }
    }

    return null;
  }

  // ------------------------------------------------------------------
  // Highlight computation (BFS)
  // ------------------------------------------------------------------

  private recomputeHighlights(): void {
    this.highlightedNodeIds.clear();

    if (this.selectedNodeId === null) return;

    const queue: { id: string; depth: number }[] = [{ id: this.selectedNodeId, depth: 0 }];
    this.highlightedNodeIds.add(this.selectedNodeId);

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (depth >= this.highlightDepth) continue;

      for (const edge of this.edges) {
        let neighborId: string | null = null;

        if (edge.source === id) {
          neighborId = edge.target;
        } else if (edge.target === id) {
          neighborId = edge.source;
        }

        if (neighborId !== null && !this.highlightedNodeIds.has(neighborId)) {
          this.highlightedNodeIds.add(neighborId);
          queue.push({ id: neighborId, depth: depth + 1 });
        }
      }
    }

  }

  // ------------------------------------------------------------------
  // Event handlers (arrow functions to preserve `this`)
  // ------------------------------------------------------------------

  private handleMouseDown = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.lastMouse = { x: e.clientX, y: e.clientY };
    this.isDragging = false;

    const hit = this.hitTest(x, y);
    if (hit) {
      this.dragNode = hit;
    } else {
      this.isPanning = true;
    }
  };

  private handleMouseMove = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const deltaX = e.clientX - this.lastMouse.x;
    const deltaY = e.clientY - this.lastMouse.y;

    if (this.dragNode) {
      this.isDragging = true;
      this.dragNode.x += deltaX / this.view.zoom;
      this.dragNode.y += deltaY / this.view.zoom;
      this.dragNode.vx = 0;
      this.dragNode.vy = 0;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      return;
    }

    if (this.isPanning && (e.buttons & 1) !== 0) {
      this.isDragging = true;
      this.view.offsetX += deltaX / this.view.zoom;
      this.view.offsetY += deltaY / this.view.zoom;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      return;
    }

    // Hover detection
    const hit = this.hitTest(x, y);
    if (hit !== this.hoveredNode) {
      this.hoveredNode = hit;
      this.canvas.style.cursor = hit ? 'pointer' : 'default';
      this.onNodeHover?.(hit);
    }
  };

  private handleMouseUp = (e: MouseEvent): void => {
    const wasDragging = this.isDragging;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.dragNode = null;
    this.isPanning = false;
    this.isDragging = false;

    if (wasDragging) return;

    // This was a click (no drag)
    const hit = this.hitTest(x, y);
    if (hit) {
      const now = Date.now();
      if (this.lastClickNodeId === hit.id && now - this.lastClickTime < DOUBLE_CLICK_MS) {
        // Double-click → expand/collapse (NOT navigate)
        this.onNodeDoubleClick?.(hit);
        this.lastClickNodeId = null;
        this.lastClickTime = 0;
      } else {
        this.onNodeClick?.(hit);
        this.lastClickNodeId = hit.id;
        this.lastClickTime = now;
      }
    } else {
      this.onBackgroundClick?.();
      this.lastClickNodeId = null;
      this.lastClickTime = 0;
    }
  };

  private handleMouseLeave = (): void => {
    this.dragNode = null;
    this.isPanning = false;
    this.isDragging = false;
    if (this.hoveredNode) {
      this.hoveredNode = null;
      this.onNodeHover?.(null);
    }
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();

    const factor = e.deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.view.zoom * factor));
    this.view.zoom = newZoom;
  };
}
