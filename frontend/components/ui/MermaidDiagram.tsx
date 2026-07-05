"use client";

import { useState, useEffect, useRef } from "react";

interface MermaidDiagramProps {
  chart: string;
}

/**
 * Renders a Mermaid.js diagram with interactive pan & zoom controls.
 * Dynamically imports mermaid to keep the bundle lightweight.
 */
export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

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
            borderTopColor: "#b01e0a",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "420px",
        position: "relative",
        overflow: "hidden",
        border: "0.5px solid rgba(255, 255, 255, 0.06)",
        borderRadius: "var(--radius-md)",
        background: "rgba(0, 0, 0, 0.2)",
        cursor: isPanning ? "grabbing" : "grab",
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
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
      {/* Zoom controls */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 8,
          display: "flex",
          gap: 4,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: "0.5px solid rgba(255,255,255,0.1)",
            background: "rgba(0,0,0,0.6)",
            color: "rgba(255,255,255,0.7)",
            fontSize: "0.75rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          +
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: "0.5px solid rgba(255,255,255,0.1)",
            background: "rgba(0,0,0,0.6)",
            color: "rgba(255,255,255,0.7)",
            fontSize: "0.75rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          −
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: "0.5px solid rgba(255,255,255,0.1)",
            background: "rgba(0,0,0,0.6)",
            color: "rgba(255,255,255,0.7)",
            fontSize: "0.6875rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ⟲
        </button>
      </div>
    </div>
  );
}
