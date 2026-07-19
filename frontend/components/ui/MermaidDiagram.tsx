"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface MermaidDiagramProps {
  chart: string;
  isDedicatedView?: boolean;
  isGenerating?: boolean;
}

/**
 * Renders a Mermaid.js diagram with interactive pan & zoom controls.
 * Dynamically imports mermaid to keep the bundle lightweight.
 * Supports dedicated full-size panel layout or inline expandable preview cards.
 */
export function MermaidDiagram({ chart, isDedicatedView = false, isGenerating = false }: MermaidDiagramProps) {
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

  const LOADING_PHRASES = [
    "Analyzing architecture...",
    "Mapping code dependencies...",
    "Rendering nodes...",
    "Generating diagram..."
  ];
  
  const [loadingText, setLoadingText] = useState(LOADING_PHRASES[0]);
  const [delayedIsGenerating, setDelayedIsGenerating] = useState(isGenerating);

  useEffect(() => {
    if (isGenerating) {
      setDelayedIsGenerating(true);
    } else {
      const timeout = setTimeout(() => {
        setDelayedIsGenerating(false);
      }, 6000);
      return () => clearTimeout(timeout);
    }
  }, [isGenerating]);

  useEffect(() => {
    if (!delayedIsGenerating) return;
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % LOADING_PHRASES.length;
      setLoadingText(LOADING_PHRASES[idx]);
    }, 1500);
    return () => clearInterval(interval);
  }, [delayedIsGenerating]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!chart || typeof window === "undefined" || delayedIsGenerating) return;

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
          suppressErrorRendering: true,
        });

        const id = `mermaid-${Math.floor(Math.random() * 100000)}`;
        
        // Silence console.error temporarily because Mermaid spams it on incomplete syntax during streaming
        const originalConsoleError = console.error;
        console.error = () => {};
        
        let renderedSvg;
        try {
          const result = await mermaid.render(id, chart);
          renderedSvg = result.svg;
        } catch (renderError) {
          // It's expected to fail while streaming incomplete syntax, so we fail silently
          return;
        } finally {
          console.error = originalConsoleError;
        }

        if (isMounted && renderedSvg) {
          setSvg(renderedSvg);
          setError("");
        }
      } catch (err) {
        if (isMounted) {
          setError("Failed to initialize Mermaid.");
        }
      }
    }

    renderChart();
    return () => {
      isMounted = false;
    };
  }, [chart, delayedIsGenerating]);

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

  if (delayedIsGenerating) {
    return (
      <div
        style={{
          width: "480px",
          maxWidth: "100%",
          aspectRatio: "1 / 1",
          margin: "0",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255, 255, 255, 0.02)",
          borderRadius: "var(--radius-lg)",
          border: "1px dashed rgba(255, 255, 255, 0.1)",
          color: "var(--color-text-dim)",
          gap: "12px",
          fontFamily: "var(--font-sans)",
        }}
      >
        <div
          className="animate-spin"
          style={{
            width: "24px",
            height: "24px",
            border: "2.5px solid rgba(255,255,255,0.1)",
            borderTop: "2.5px solid #a8b1ff",
            borderRadius: "50%"
          }}
        />
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes textSlideUp {
            0% { opacity: 0; transform: translateY(8px); }
            100% { opacity: 1; transform: translateY(0); }
          }
        `}} />
        <div style={{ position: "relative", width: "100%", height: "20px" }}>
          <div 
            key={loadingText}
            style={{ 
              position: "absolute",
              width: "100%",
              textAlign: "center",
              fontSize: "0.85rem", 
              letterSpacing: "0.02em",
              animation: "textSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards"
            }}
          >
            {loadingText}
          </div>
        </div>
      </div>
    );
  }

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
            max-width: 100% !important;
            height: auto !important;
          }
          @keyframes diagramReveal {
            0% { opacity: 0; transform: scale(0.97) translateY(10px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
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
            animation: "diagramReveal 2.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
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
        @keyframes diagramReveal {
          0% { opacity: 0; transform: scale(0.97) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}} />

      {/* ── Inline Full-Width Preview Card ── */}
      <div
        className="mermaid-preview-card"
        onClick={() => {
          setZoom(1);
          setPan({ x: 0, y: 0 });
          setIsModalOpen(true);
        }}
        style={{
          width: "100%",
          margin: "32px 0",
          position: "relative",
          cursor: "pointer",
          background: "rgba(255, 255, 255, 0.015)",
          border: "0.5px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "var(--radius-lg)",
          boxShadow: 
            "inset 0 1px 0 0 rgba(255, 255, 255, 0.04)," +
            "inset 0 -1px 0 0 rgba(0, 0, 0, 0.2)," +
            "0 4px 24px -8px rgba(0, 0, 0, 0.4)",
          transition: "all 300ms cubic-bezier(0.32, 0.72, 0, 1)",
          overflow: "hidden",
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
        <div className="mermaid-card-header" style={{
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
          
          <span className="mermaid-expand-hint" style={{
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

        {/* Diagram render (full width, natural height) */}
        <div
          dangerouslySetInnerHTML={{ __html: svg }}
          style={{
            width: "100%",
            padding: "24px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
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
