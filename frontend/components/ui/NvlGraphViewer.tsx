"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { InteractiveNvlWrapper } from "@neo4j-nvl/react";
import type { MouseEventCallbacks } from "@neo4j-nvl/react";
import type { Node as NvlNode, Relationship as NvlRel, HitTargets } from "@neo4j-nvl/base";
import {
  Search,
  X,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Sliders,
  EyeOff,
  Info,
  ExternalLink,
  Pin,
  HelpCircle,
  Filter,
} from "lucide-react";
import styles from "./NvlGraphViewer.module.css";
import type { GraphNode, GraphEdge } from "@/app/lib/api";

function CustomSelect({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (val: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const selectedOption = options.find((o) => o.value === value) || options[0];

  return (
    <div className={styles.customSelectContainer} ref={containerRef}>
      <button
        type="button"
        className={styles.customSelectTrigger}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{selectedOption.label}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
            opacity: 0.7,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && (
        <div className={styles.customSelectDropdown}>
          {options.map((option) => (
            <div
              key={option.value}
              className={`${styles.customSelectItem} ${option.value === value ? styles.customSelectItemActive : ""}`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface NvlGraphViewerProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  graphType: "overview" | "dep" | "call" | "class";
  repoId: string;
  blastRadiusFiles?: string[];
  searchQuery?: string;
  onNodeSelect?: (node: GraphNode) => void;
}

type LayoutType = "forceDirected" | "hierarchical" | "circular";

export default function NvlGraphViewer({
  nodes,
  edges,
  graphType,
  repoId,
  blastRadiusFiles = [],
  searchQuery: externalSearchQuery = "",
  onNodeSelect,
}: NvlGraphViewerProps) {
  const nvlRef = useRef<any>(null);

  // Layout & Navigation State
  const [currentLayout, setCurrentLayout] = useState<LayoutType>("forceDirected");
  const [currentPerspective, setCurrentPerspective] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ source: string; target: string; type?: string } | null>(null);
  const [hoveredElement, setHoveredElement] = useState<{ type: "node" | "rel"; id: string } | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  // Bloom-style dynamic controls
  const [filterType, setFilterType] = useState({
    file: true,
    class: true,
    function: true,
    route: true,
  });
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());
  const [pinnedNodeIds, setPinnedNodeIds] = useState<Set<string>>(new Set());

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId?: string;
  } | null>(null);

  // Sync external search query
  useEffect(() => {
    if (externalSearchQuery) {
      setSearchQuery(externalSearchQuery);
    }
  }, [externalSearchQuery]);

  // Handle auto-panning/focusing when search matches a node
  useEffect(() => {
    if (!searchQuery || !nvlRef.current || nodes.length === 0) return;

    const matchedNode = nodes.find((n) =>
      n.label.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (matchedNode) {
      nvlRef.current.zoomToNodes([matchedNode.id]);
    }
  }, [searchQuery, nodes]);

  // Color mapping config (Premium solid colors)
  const colors = {
    file: "#0284c7",       // Premium Sky Blue
    class: "#7c3aed",      // Deep Violet
    function: "#d97706",   // Warm Amber
    method: "#d97706",     // Warm Amber (alias for function)
    route: "#059669",      // Solid Emerald Green
    default: "#4b5563",    // Neutral Gray
    highlight: "#ef4444",  // Alert/Blast Red
    blastAffected: "#f87171", // Soft Red
  };

  const edgeColors = {
    IMPORTS: "#38bdf8",     // Sleek slate-blue for imports
    CALLS: "#f59e0b",       // Warm gold for function calls
    HAS_METHOD: "#a78bfa",  // Indigo/Purple for methods
    CONTAINS: "#64748b",    // Medium Gray for folders/files containment
    default: "#475569",
  };

  const getCleanLabel = (label: string, type: string) => {
    if (type === "file") {
      return label.split("/").pop() || label;
    }
    return label;
  };

  // Node size scaling helpers
  const computeNodeSize = (node: GraphNode) => {
    if (node.id === focusNodeId) return 40;
    if (node.id === selectedNode?.id) return 32;

    switch (node.type?.toLowerCase()) {
      case "file":
        const bytes = node.size_bytes || 1000;
        return Math.max(16, Math.min(36, 16 + Math.log2(bytes / 100) * 1.5));
      case "class":
        return 24;
      case "route":
        return 26;
      case "function":
      case "method":
      default:
        return 18;
    }
  };

  // Build filtered node & edge sets based on view configurations (Bloom-like)
  const graphElements = useMemo(() => {
    // 1. Gather all nodes and filter by enabled types and hidden sets
    let filteredNodes = nodes.filter((node) => {
      // Hidden nodes filter
      if (hiddenNodeIds.has(node.id)) return false;

      // Type filter
      const type = (node.type || "file").toLowerCase();
      if (type === "file" && !filterType.file) return false;
      if (type === "class" && !filterType.class) return false;
      if (type === "route" && !filterType.route) return false;
      if ((type === "function" || type === "method") && !filterType.function) return false;

      return true;
    });

    let filteredEdges = edges.filter((edge) => {
      // Edge is only valid if both endpoints exist in filtered nodes
      const sourceExists = filteredNodes.some((n) => n.id === edge.source);
      const targetExists = filteredNodes.some((n) => n.id === edge.target);
      return sourceExists && targetExists;
    });

    // 2. Apply Focus Mode (1-hop highlight) if enabled
    if (focusNodeId) {
      const neighborIds = new Set<string>([focusNodeId]);
      filteredEdges.forEach((edge) => {
        if (edge.source === focusNodeId) neighborIds.add(edge.target);
        if (edge.target === focusNodeId) neighborIds.add(edge.source);
      });

      filteredNodes = filteredNodes.filter((n) => neighborIds.has(n.id));
      filteredEdges = filteredEdges.filter(
        (e) => e.source === focusNodeId || e.target === focusNodeId
      );
    }

    // 3. Format into NVL elements list
    const nvlNodes: NvlNode[] = filteredNodes.map((node, idx) => {
      const type = (node.type || "file").toLowerCase();
      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredElement?.type === "node" && hoveredElement.id === node.id;
      const isBlastTarget = blastRadiusFiles.length > 0 && node.file_path === blastRadiusFiles[0];
      const isBlastAffected = blastRadiusFiles.length > 0 && blastRadiusFiles.includes(node.file_path || "");

      // Color selection logic (keep native type color, only color by blast if active)
      let nodeColor = colors[type as keyof typeof colors] || colors.default;
      if (isBlastAffected) {
        nodeColor = isBlastTarget ? colors.highlight : colors.blastAffected;
      }

      // Search match outline
      const isSearchMatch =
        searchQuery && node.label.toLowerCase().includes(searchQuery.toLowerCase());

      // Pre-position nodes to prevent starting stacked in a single point
      const angle = (idx / filteredNodes.length) * 2 * Math.PI;
      const radius = 150 + Math.sqrt(filteredNodes.length) * 25; // wide spiral/circle
      const initialX = Math.cos(angle) * radius;
      const initialY = Math.sin(angle) * radius;

      // Glow outline for selection
      let strokeColor = "rgba(0,0,0,0.5)";
      let strokeWidth = 1;

      if (isSelected) {
        strokeColor = "#ffffff"; // elegant white border glow
        strokeWidth = 4;
      } else if (isSearchMatch) {
        strokeColor = "#38bdf8"; // search highlight cyan
        strokeWidth = 3;
      } else if (isBlastTarget) {
        strokeColor = "#ef4444"; // blast center red border
        strokeWidth = 4;
      }

      return {
        id: node.id,
        size: computeNodeSize(node),
        color: nodeColor,
        caption: getCleanLabel(node.label, type),
        captionColor: "#ffffff", // high-contrast white name on the node
        captionSize: isSelected || isHovered ? 11 : 9,
        strokeColor,
        strokeWidth,
        pinned: pinnedNodeIds.has(node.id),
        x: initialX,
        y: initialY,
        captionAlign: "center", // Align centered inside the node circle
      };
    });

    const nvlRels: NvlRel[] = filteredEdges.map((edge, idx) => {
      const edgeType = edge.type || "default";
      const isHovered = hoveredElement?.type === "rel" && hoveredElement.id === `${edge.source}-${edge.target}`;
      const relColor = edgeColors[edgeType as keyof typeof edgeColors] || edgeColors.default;

      return {
        id: `${edge.source}-${edge.target}`,
        from: edge.source,
        to: edge.target,
        color: relColor,
        caption: edge.type || "",
        width: isHovered ? 2.5 : 1,
      };
    });

    return { nvlNodes, nvlRels };
  }, [
    nodes,
    edges,
    filterType,
    focusNodeId,
    hiddenNodeIds,
    pinnedNodeIds,
    selectedNode,
    hoveredElement,
    searchQuery,
    blastRadiusFiles,
  ]);

  // ── Handlers ──

  const handleZoom = useCallback((factor: number) => {
    if (!nvlRef.current) return;
    const currentScale = nvlRef.current.getScale() || 1;
    nvlRef.current.setZoom(currentScale * factor);
  }, []);

  const handleFit = useCallback(() => {
    nvlRef.current?.fit();
  }, []);

  const handleNodeClick = useCallback((node: any) => {
    const rawNode = nodes.find((n) => n.id === node.id);
    if (rawNode) {
      setSelectedNode(rawNode);
      setSelectedEdge(null);
      setIsInspectorOpen(true);
      if (onNodeSelect) onNodeSelect(rawNode);
    }
  }, [nodes, onNodeSelect]);

  const handleRelationshipClick = useCallback((rel: any) => {
    const edge = edges.find((e) => `${e.source}-${e.target}` === rel.id);
    if (edge) {
      setSelectedEdge(edge);
      setSelectedNode(null);
      setIsInspectorOpen(true);
    }
  }, [edges]);

  const handleCanvasClick = useCallback(() => {
    setIsInspectorOpen(false);
    setSelectedNode(null);
    setSelectedEdge(null);
    setContextMenu(null);
  }, []);

  // Context Menu logic
  const handleNodeRightClick = useCallback((node: any, hitTargets: HitTargets, evt: MouseEvent) => {
    evt.preventDefault();
    setContextMenu({
      x: evt.clientX,
      y: evt.clientY,
      nodeId: node.id,
    });
  }, []);

  const handleCanvasRightClick = useCallback((evt: MouseEvent) => {
    evt.preventDefault();
    setContextMenu({
      x: evt.clientX,
      y: evt.clientY,
    });
  }, []);

  // Close context menu on click
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const mouseEventCallbacks = useMemo<MouseEventCallbacks>(() => ({
    onNodeClick: handleNodeClick,
    onRelationshipClick: handleRelationshipClick,
    onCanvasClick: handleCanvasClick,
    onNodeRightClick: handleNodeRightClick,
    onCanvasRightClick: handleCanvasRightClick,
    onDrag: true,
    onPan: true,
    onZoom: true,
    onHover: (element: any, hitTargets: HitTargets) => {
      if (element) {
        setHoveredElement({
          type: "from" in element ? "rel" : "node",
          id: element.id,
        });
      } else {
        setHoveredElement(null);
      }
    },
  }), [
    handleNodeClick,
    handleRelationshipClick,
    handleCanvasClick,
    handleNodeRightClick,
    handleCanvasRightClick,
  ]);

  // Perspectives Configuration (Bloom-style Views)
  const handlePerspectiveChange = useCallback((perspective: string) => {
    setFocusNodeId(null);
    setCurrentPerspective(perspective);
    switch (perspective) {
      case "all":
        setFilterType({ file: true, class: true, function: true, route: true });
        setCurrentLayout("forceDirected");
        break;
      case "files":
        setFilterType({ file: true, class: false, function: false, route: false });
        setCurrentLayout("forceDirected");
        break;
      case "class":
        setFilterType({ file: false, class: true, function: true, route: false });
        setCurrentLayout("hierarchical");
        break;
      case "call":
        setFilterType({ file: false, class: false, function: true, route: false });
        setCurrentLayout("forceDirected");
        break;
      default:
        break;
    }
  }, []);

  const nvlOptions = useMemo(() => ({
    layout: currentLayout,
    disableWebWorkers: true,
    initialZoom: 1,
    renderer: "canvas" as const, // Explicitly use canvas renderer to show captions
  }), [currentLayout]);

  const perspectiveOptions = useMemo(() => [
    { value: "all", label: "Full Graph View" },
    { value: "files", label: "File Dependencies" },
    { value: "class", label: "Class Hierarchies" },
    { value: "call", label: "Function Call Flows" },
  ], []);

  const layoutOptions = useMemo(() => [
    { value: "forceDirected", label: "Force-Directed" },
    { value: "hierarchical", label: "Hierarchical" },
    { value: "circular", label: "Circular Layout" },
  ], []);

  return (
    <div className={styles.wrapper}>
      {/* ── Top Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <span className={styles.toolbarLabel}>View Perspective:</span>
          <CustomSelect
            options={perspectiveOptions}
            value={currentPerspective}
            onChange={handlePerspectiveChange}
          />
        </div>

        <div className={styles.toolbarGroup}>
          <span className={styles.toolbarLabel}>Layout:</span>
          <CustomSelect
            options={layoutOptions}
            value={currentLayout}
            onChange={(val) => setCurrentLayout(val as LayoutType)}
          />
        </div>

        {/* Dynamic Filters (Chips) */}
        <div className={styles.filterChips}>
          <button
            className={`${styles.chip} ${filterType.file ? styles.chipActive : styles.chipInactive}`}
            onClick={() => setFilterType((f) => ({ ...f, file: !f.file }))}
          >
            <span className={styles.chipIndicator} style={{ backgroundColor: colors.file }} />
            Files
          </button>
          <button
            className={`${styles.chip} ${filterType.class ? styles.chipActive : styles.chipInactive}`}
            onClick={() => setFilterType((f) => ({ ...f, class: !f.class }))}
          >
            <span className={styles.chipIndicator} style={{ backgroundColor: colors.class }} />
            Classes
          </button>
          <button
            className={`${styles.chip} ${filterType.function ? styles.chipActive : styles.chipInactive}`}
            onClick={() => setFilterType((f) => ({ ...f, function: !f.function }))}
          >
            <span className={styles.chipIndicator} style={{ backgroundColor: colors.function }} />
            Functions
          </button>
          <button
            className={`${styles.chip} ${filterType.route ? styles.chipActive : styles.chipInactive}`}
            onClick={() => setFilterType((f) => ({ ...f, route: !f.route }))}
          >
            <span className={styles.chipIndicator} style={{ backgroundColor: colors.route }} />
            Routes
          </button>
        </div>

        {/* Local Graph Search */}
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon}>
            <Search size={14} />
          </span>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search & Focus node..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{
                position: "absolute",
                right: 8,
                background: "none",
                border: "none",
                color: "rgba(255, 255, 255, 0.4)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── NVL Canvas Container ── */}
      <div className={styles.canvasContainer}>
        {graphElements.nvlNodes.length > 0 ? (
          <InteractiveNvlWrapper
            ref={nvlRef}
            nodes={graphElements.nvlNodes}
            rels={graphElements.nvlRels}
            mouseEventCallbacks={mouseEventCallbacks}
            nvlOptions={nvlOptions}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-tertiary)",
              fontSize: "0.8125rem",
              fontFamily: "var(--font-mono)",
            }}
          >
            No matching nodes. Reset filters or zoom.
          </div>
        )}

        {/* ── Floating Canvas Control buttons ── */}
        <div className={styles.canvasControls}>
          <button className={styles.controlBtn} onClick={() => handleZoom(1.25)} title="Zoom In">
            <ZoomIn size={14} />
          </button>
          <button className={styles.controlBtn} onClick={() => handleZoom(0.8)} title="Zoom Out">
            <ZoomOut size={14} />
          </button>
          <button className={styles.controlBtn} onClick={handleFit} title="Zoom to Fit">
            <Maximize2 size={14} />
          </button>
        </div>

        {/* ── Blast Radius Scan active details ── */}
        {blastRadiusFiles.length > 0 && (
          <div className={styles.blastOverlayInfo}>
            <span className={styles.blastPulseIndicator} />
            <span className={styles.blastText}>
              Blast Radius Highlight Active: {blastRadiusFiles.length} nodes affected
            </span>
          </div>
        )}
      </div>

      {/* ── Bloom Slide-out Inspector Panel ── */}
      <div className={`${styles.inspector} ${isInspectorOpen ? styles.inspectorOpen : ""}`}>
        <div className={styles.inspectorHeader}>
          <span className={styles.inspectorTitle}>Entity Inspector</span>
          <button className={styles.closeButton} onClick={() => setIsInspectorOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.inspectorContent}>
          {selectedNode && (
            <>
              <div className={styles.propertyGroup}>
                <span className={styles.propertyName}>Name</span>
                <span className={styles.propertyValue} style={{ fontWeight: 600, color: "#fff" }}>
                  {selectedNode.label}
                </span>
              </div>
              <div className={styles.propertyGroup}>
                <span className={styles.propertyName}>Type</span>
                <span
                  className={styles.propertyValue}
                  style={{
                    color: colors[(selectedNode.type || "file").toLowerCase() as keyof typeof colors] || "#fff",
                    textTransform: "uppercase",
                    fontSize: "0.75rem",
                    fontWeight: "bold",
                  }}
                >
                  {selectedNode.type || "File"}
                </span>
              </div>
              {selectedNode.file_path && (
                <div className={styles.propertyGroup}>
                  <span className={styles.propertyName}>File Path</span>
                  <span className={styles.propertyValue}>{selectedNode.file_path}</span>
                </div>
              )}
              {selectedNode.language && (
                <div className={styles.propertyGroup}>
                  <span className={styles.propertyName}>Language</span>
                  <span className={styles.propertyValue}>{selectedNode.language}</span>
                </div>
              )}
              {selectedNode.size_bytes && (
                <div className={styles.propertyGroup}>
                  <span className={styles.propertyName}>Size</span>
                  <span className={styles.propertyValue}>
                    {(selectedNode.size_bytes / 1024).toFixed(2)} KB ({selectedNode.size_bytes} bytes)
                  </span>
                </div>
              )}
              {selectedNode.signature && (
                <div className={styles.propertyGroup}>
                  <span className={styles.propertyName}>Signature</span>
                  <pre className={styles.codeSnippet}>{selectedNode.signature}</pre>
                </div>
              )}
            </>
          )}

          {selectedEdge && (
            <>
              <div className={styles.propertyGroup}>
                <span className={styles.propertyName}>Relationship Type</span>
                <span
                  className={styles.propertyValue}
                  style={{
                    color: edgeColors[(selectedEdge.type || "default") as keyof typeof edgeColors] || "#fff",
                    textTransform: "uppercase",
                    fontSize: "0.75rem",
                    fontWeight: "bold",
                  }}
                >
                  {selectedEdge.type || "IMPORTS"}
                </span>
              </div>
              <div className={styles.propertyGroup}>
                <span className={styles.propertyName}>Source node ID</span>
                <span className={styles.propertyValue}>{selectedEdge.source}</span>
              </div>
              <div className={styles.propertyGroup}>
                <span className={styles.propertyName}>Target node ID</span>
                <span className={styles.propertyValue}>{selectedEdge.target}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Context Menu (Sleek Dark Theme) ── */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
          }}
        >
          {contextMenu.nodeId ? (
            <>
              <button
                className={styles.contextMenuItem}
                onClick={() => {
                  setFocusNodeId(contextMenu.nodeId || null);
                  setContextMenu(null);
                }}
              >
                <Filter size={12} />
                Focus Neighborhood
              </button>
              {focusNodeId && (
                <button
                  className={styles.contextMenuItem}
                  onClick={() => {
                    setFocusNodeId(null);
                    setContextMenu(null);
                  }}
                >
                  <RefreshCw size={12} />
                  Reset Focus
                </button>
              )}
              <button
                className={styles.contextMenuItem}
                onClick={() => {
                  const id = contextMenu.nodeId;
                  if (id) {
                    setPinnedNodeIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                  }
                  setContextMenu(null);
                }}
              >
                <Pin size={12} />
                {pinnedNodeIds.has(contextMenu.nodeId) ? "Unpin Node" : "Pin Node"}
              </button>
              <button
                className={styles.contextMenuItem}
                onClick={() => {
                  const id = contextMenu.nodeId;
                  if (id) {
                    setHiddenNodeIds((prev) => {
                      const next = new Set(prev);
                      next.add(id);
                      return next;
                    });
                  }
                  setContextMenu(null);
                }}
              >
                <EyeOff size={12} />
                Hide Node
              </button>
            </>
          ) : (
            <>
              <button
                className={styles.contextMenuItem}
                onClick={() => {
                  setHiddenNodeIds(new Set());
                  setPinnedNodeIds(new Set());
                  setFocusNodeId(null);
                  setContextMenu(null);
                }}
              >
                <RefreshCw size={12} />
                Reset Hidden & Pinned
              </button>
              <button
                className={styles.contextMenuItem}
                onClick={() => {
                  handleFit();
                  setContextMenu(null);
                }}
              >
                <Maximize2 size={12} />
                Zoom to Fit
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
