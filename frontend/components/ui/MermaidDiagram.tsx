"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface MermaidDiagramProps {
  chart: string;
  isDedicatedView?: boolean;
}

/**
 * Renders a Mermaid.js diagram with interactive pan & zoom controls.
 * Dynamically imports mermaid to keep the bundle lightweight.
 * Supports dedicated full-size panel layout or inline expandable preview cards.
 */
export function MermaidDiagram({ chart, isDedicatedView = false }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!chart || typeof window === "undefined") return;

    let isMounted = true;
    setError("");
    setZoom(1);
    setPan({ x: 0, y: 0 });

    async function renderChart() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "loose",
        });

        const id = `mermaid-${Math.floor(Math.random() * 100000)}`;
        const { svg: renderedSvg } = await mermaid.render(id, chart);

        if (isMounted) {
          setSvg(renderedSvg);
        }
      } catch (err) {
        console.error("Mermaid render error:", err);
        if (isMounted) {
          setError("Failed to parse diagram.");
        }
      }
    }

    renderChart();
    return () => {
      isMounted = false;
    };
  }, [chart]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = 1.1;
    if (e.deltaY < 0) {
      setZoom((prev) => Math.min(3, prev * factor));
    } else {
      setZoom((prev) => Math.max(0.3, prev / factor));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  if (error) {
    return (
      <div
        style={{
          color: "var(--color-danger)",
          fontSize: "0.75rem",
          fontFamily: "var(--font-mono)",
          whiteSpace: "pre-wrap",
          width: "100%",
          padding: 16,
          overflow: "auto",
          background: "rgba(239, 68, 68, 0.04)",
          border: "0.5px solid rgba(239, 68, 68, 0.15)",
          borderRadius: "var(--radius-md)",
        }}
      >
        {error}
        <pre style={{ marginTop: 8, fontSize: "0.6875rem", opacity: 0.7 }}>
          {chart}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
          color: "var(--color-text-tertiary)",
          fontSize: "0.75rem",
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            border: "2px solid rgba(255,255,255,0.1)",
            borderTopColor: "#c8ccd4",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
      </div>
    );
  }

  // ── Dedicated View Mode ──
  if (isDedicatedView) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: `
          .mermaid-diagram-container svg {
            max-width: none !important;
            height: auto !important;
          }
        `}} />
        <div
          style={{
            width: "100%",
            height: "65vh",
            position: "relative",
            overflow: "hidden",
            background: "rgba(255, 255, 255, 0.015)",
            border: "0.5px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "var(--radius-xl)",
            boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.04), 0 4px 24px rgba(0,0,0,0.4)",
            cursor: isPanning ? "grabbing" : "grab",
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Controls hint */}
          <div style={{
            position: "absolute",
            top: 12,
            left: 16,
            zIndex: 10,
            fontSize: "0.6875rem",
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-secondary)",
            letterSpacing: "0.05em",
          }}>
            Drag to pan, scroll to zoom
          </div>

          {/* Full size Diagram rendering */}
          <div
            className="mermaid-diagram-container"
            ref={ref}
            dangerouslySetInnerHTML={{ __html: svg }}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              width: "100%",
              height: "100%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          />

          {/* Direct Controls overlay */}
          <div style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            display: "flex",
            gap: 6,
            zIndex: 10,
          }}>
            {[
              { label: "+", action: () => setZoom(z => Math.min(3, z * 1.2)) },
              { label: "−", action: () => setZoom(z => Math.max(0.3, z / 1.2)) },
              { label: "⟲", action: () => { setZoom(1); setPan({ x: 0, y: 0 }); } },
            ].map((btn, i) => (
              <button key={i} onClick={btn.action} style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "0.5px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.6)",
                color: "rgba(255,255,255,0.7)",
                fontSize: "0.875rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(8px)",
              }}>
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }

  // ── Standard/Chat Preview & Modal Mode ──
  const modalJSX = (
    <div
      className="mermaid-modal-backdrop"
      onClick={() => setIsModalOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(10, 10, 12, 0.6)",
        backdropFilter: "blur(16px) saturate(140%)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        animation: "fadeIn 200ms ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "92vw",
          height: "88vh",
          position: "relative",
          overflow: "hidden",
          background: "rgba(20, 20, 25, 0.65)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          backdropFilter: "blur(20px)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
          cursor: isPanning ? "grabbing" : "grab",
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Modal header bar */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          zIndex: 10,
          background: "linear-gradient(to bottom, rgba(8,8,10,0.9) 0%, transparent 100%)",
        }}>
          <span style={{
            fontSize: "0.6875rem",
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-secondary)",
            letterSpacing: "0.05em",
          }}>
            DIAGRAM — Pan to move, scroll to zoom
          </span>
          
          <button
            onClick={() => setIsModalOpen(false)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "0.5px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.05)",
              color: "var(--color-text)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 200ms",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Full-viewport diagram with pan/zoom */}
        <div
          className="mermaid-diagram-container"
          dangerouslySetInnerHTML={{ __html: svg }}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            width: "100%",
            height: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        />

        {/* Zoom controls (bottom-right) */}
        <div style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          display: "flex",
          gap: 6,
          zIndex: 10,
        }}>
          {[
            { label: "+", action: () => setZoom(z => Math.min(3, z * 1.2)) },
            { label: "−", action: () => setZoom(z => Math.max(0.3, z / 1.2)) },
            { label: "⟲", action: () => { setZoom(1); setPan({ x: 0, y: 0 }); } },
          ].map((btn, i) => (
            <button key={i} onClick={btn.action} style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "0.5px solid rgba(255,255,255,0.1)",
              background: "rgba(0,0,0,0.6)",
              color: "rgba(255,255,255,0.7)",
              fontSize: "0.875rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(8px)",
            }}>
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .mermaid-diagram-container svg {
          max-width: none !important;
          height: auto !important;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}} />

      {/* ── Inline Elegant Preview Card ── */}
      <div
        className="mermaid-preview-card"
        onClick={() => {
          setZoom(1);
          setPan({ x: 0, y: 0 });
          setIsModalOpen(true);
        }}
        style={{
          width: "100%",
          height: "320px",
          position: "relative",
          overflow: "hidden",
          cursor: "pointer",
          background: "rgba(255, 255, 255, 0.015)",
          border: "0.5px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "var(--radius-lg)",
          boxShadow: 
            "inset 0 1px 0 0 rgba(255, 255, 255, 0.04)," +
            "inset 0 -1px 0 0 rgba(0, 0, 0, 0.2)," +
            "0 4px 24px -8px rgba(0, 0, 0, 0.4)",
          transition: "all 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "rgba(200, 204, 212, 0.2)";
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.015)";
        }}
      >
        {/* Premium header bar */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 14px",
          borderBottom: "0.5px solid rgba(255, 255, 255, 0.04)",
          background: "rgba(255, 255, 255, 0.02)",
        }}>
          <span style={{
            fontSize: "0.625rem",
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="8" y="14" width="7" height="7" rx="1"/>
            </svg>
            DIAGRAM
          </span>
          
          {/* Expand icon hint */}
          <span style={{
            fontSize: "0.5625rem",
            color: "var(--color-text-tertiary)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            opacity: 0.6,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 3 21 3 21 9"/>
              <polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/>
              <line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
            Click to expand
          </span>
        </div>

        {/* Diagram render (preview scale) */}
        <div
          dangerouslySetInnerHTML={{ __html: svg }}
          style={{
            width: "100%",
            height: "calc(100% - 32px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            overflow: "hidden",
            transform: "scale(0.85)",
            transformOrigin: "center center",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Render modal in portal on body */}
      {isModalOpen && mounted && typeof document !== "undefined" && createPortal(modalJSX, document.body)}
    </>
  );
}
