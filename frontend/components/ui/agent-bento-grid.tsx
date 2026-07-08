"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ChatCircle,
  Brain,
  Database,
  TerminalWindow,
  Code,
  FileText,
  SlackLogo,
  NotionLogo,
  Check,
  CircleNotch,
  Clock,
  Minus,
  Globe,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────
   Niche: AI Agent Workspace
   Grid: 3 cards top row · 2 cards bottom row
   Each FeatCard takes: title, description, children (visual)
────────────────────────────────────────────────────── */

interface FeatCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
  /** Optional extra classes for sizing/spanning */
  className?: string;
}

export function FeatCard({ title, description, children, className = "" }: FeatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative flex flex-col justify-between rounded-[20px] border border-white/5 bg-[#050505] p-6 h-full gap-4 overflow-hidden group",
        "transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "hover:border-white/[0.10] hover:shadow-[0_0_20px_rgba(176,30,10,0.04),0_20px_60px_-16px_rgba(0,0,0,0.5)]",
        "hover:-translate-y-[2px]",
        className
      )}
    >
      {/* Hover spotlight gradient */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none rounded-[20px] bg-[radial-gradient(600px_circle_at_50%_0%,rgba(176,30,10,0.02),transparent_60%)]" />
      
      <div className="flex flex-col gap-1 z-10">
        <h3 className="font-display font-medium text-white text-sm tracking-tight">{title}</h3>
        <p className="text-zinc-400 text-xs leading-relaxed max-w-[95%] font-light">{description}</p>
      </div>
      <div className="relative mt-2 flex-1 w-full rounded-[14px] overflow-hidden border border-white/5 bg-[#030303] group-hover:border-white/[0.08] transition-colors duration-500">
        {children}
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
   Card1 – Agent Pipeline
   Minimalist precise node graph with real-time task flows
   ───────────────────────────────────────────── */

type ActiveStep = 'request' | 'router' | 'agent' | 'memory' | 'tools' | 'response';

const VW = 320;
const VH = 240;

interface NodeConfig {
  id: string;
  x: number;
  y: number;
  icon?: any;
  label?: string;
  type: 'box' | 'circle';
}

const NODES: NodeConfig[] = [
  { id: 'A', x: 50, y: 120, icon: ChatCircle, label: "SOURCE", type: 'box' },
  { id: 'Router', x: 125, y: 120, type: 'circle' },
  { id: 'C', x: 200, y: 120, icon: Brain, label: "PARSER", type: 'box' },
  { id: 'B', x: 280, y: 50, icon: Database, label: "LINKS", type: 'box' },
  { id: 'D', x: 280, y: 190, icon: TerminalWindow, label: "NODES", type: 'box' },
];

interface FlowPath {
  id: string;
  d: string;
  activeSteps: ActiveStep[];
  flowDirection: 'forward' | 'backward' | 'both';
  colorClass: string;
}

const PATHS: FlowPath[] = [
  {
    id: "a-to-router",
    d: "M 78 120 L 113 120",
    activeSteps: ["request"],
    flowDirection: "forward",
    colorClass: "text-cyan-500 dark:text-cyan-400",
  },
  {
    id: "router-to-agent",
    d: "M 137 120 L 172 120",
    activeSteps: ["agent"],
    flowDirection: "forward",
    colorClass: "text-violet-500 dark:text-violet-400",
  },
  {
    id: "agent-to-memory",
    d: "M 200 92 L 200 50 L 252 50",
    activeSteps: ["memory"],
    flowDirection: "both",
    colorClass: "text-fuchsia-500 dark:text-fuchsia-400",
  },
  {
    id: "agent-to-tools",
    d: "M 200 148 L 200 190 L 252 190",
    activeSteps: ["tools"],
    flowDirection: "both",
    colorClass: "text-emerald-500 dark:text-emerald-400",
  },
  {
    id: "response-flow-1",
    d: "M 172 120 L 137 120",
    activeSteps: ["response"],
    flowDirection: "forward",
    colorClass: "text-cyan-500 dark:text-cyan-400",
  },
  {
    id: "response-flow-2",
    d: "M 113 120 L 78 120",
    activeSteps: ["response"],
    flowDirection: "forward",
    colorClass: "text-cyan-500 dark:text-cyan-400",
  },
];

const NODE_COLORS: Record<string, { bg: string; border: string; text: string; buttonBg: string; buttonBorder: string }> = {
  A: {
    bg: "bg-cyan-500/10 dark:bg-cyan-500/5",
    border: "border-cyan-500/60 dark:border-cyan-400/50",
    text: "text-cyan-600 dark:text-cyan-400",
    buttonBg: "bg-cyan-500",
    buttonBorder: "border-cyan-600",
  },
  Router: {
    bg: "bg-amber-500/10 dark:bg-amber-500/5",
    border: "border-amber-500/60 dark:border-amber-400/50",
    text: "text-amber-600 dark:text-amber-400",
    buttonBg: "bg-amber-500",
    buttonBorder: "border-amber-600",
  },
  C: {
    bg: "bg-violet-500/10 dark:bg-violet-500/5",
    border: "border-violet-500/60 dark:border-violet-400/50",
    text: "text-violet-600 dark:text-violet-400",
    buttonBg: "bg-violet-500",
    buttonBorder: "border-violet-600",
  },
  B: {
    bg: "bg-fuchsia-500/10 dark:bg-fuchsia-500/5",
    border: "border-fuchsia-500/60 dark:border-fuchsia-400/50",
    text: "text-fuchsia-600 dark:text-fuchsia-400",
    buttonBg: "bg-fuchsia-500",
    buttonBorder: "border-fuchsia-600",
  },
  D: {
    bg: "bg-emerald-500/10 dark:bg-emerald-500/5",
    border: "border-emerald-500/60 dark:border-emerald-400/50",
    text: "text-emerald-600 dark:text-emerald-400",
    buttonBg: "bg-emerald-500",
    buttonBorder: "border-emerald-600",
  },
};

export function Card1({ detailedStatus }: { detailedStatus?: string }) {
  const [step, setStep] = useState<ActiveStep>("request");

  useEffect(() => {
    if (detailedStatus) {
      switch (detailedStatus) {
        case "queued":
        case "cloning":
          setStep("request");
          break;
        case "parsing":
          setStep("agent");
          break;
        case "embedding":
          setStep("memory");
          break;
        case "saving":
          setStep("tools");
          break;
        case "diagrams":
        case "completed":
          setStep("response");
          break;
        default:
          setStep("request");
      }
      return;
    }

    const steps: ActiveStep[] = ["request", "router", "agent", "memory", "tools", "response"];
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % steps.length;
      setStep(steps[idx]);
    }, 2000);
    return () => clearInterval(interval);
  }, [detailedStatus]);

  const isNodeActive = (nodeId: string) => {
    switch (step) {
      case 'request':
        return nodeId === 'A';
      case 'router':
        return nodeId === 'Router';
      case 'agent':
        return nodeId === 'C';
      case 'memory':
        return nodeId === 'C' || nodeId === 'B';
      case 'tools':
        return nodeId === 'C' || nodeId === 'D';
      case 'response':
        return nodeId === 'C' || nodeId === 'Router' || nodeId === 'A';
      default:
        return false;
    }
  };

  return (
    <div className="w-full h-full relative overflow-hidden select-none bg-transparent rounded-xl flex items-center justify-center p-2">
      {/* ── Layer 1: Clean dotted grid ── */}
      <svg className="absolute inset-0 w-full h-full" aria-hidden>
        <defs>
          <pattern id="clean-grid" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.75" fill="currentColor" className="text-zinc-200 dark:text-zinc-800/60" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#clean-grid)" />
      </svg>

      {/* ── Layer 2: Connector SVG & Nodes ── */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        {/* Base Static Connection Paths */}
        <path d="M 78 120 L 113 120" fill="none" stroke="currentColor" className="text-zinc-200 dark:text-zinc-800/80" strokeWidth="1" />
        <path d="M 137 120 L 172 120" fill="none" stroke="currentColor" className="text-zinc-200 dark:text-zinc-800/80" strokeWidth="1" />
        <path d="M 200 92 L 200 50 L 252 50" fill="none" stroke="currentColor" className="text-zinc-200 dark:text-zinc-800/80" strokeWidth="1" />
        <path d="M 200 148 L 200 190 L 252 190" fill="none" stroke="currentColor" className="text-zinc-200 dark:text-zinc-800/80" strokeWidth="1" />

        {/* Animated Flow Overlays */}
        {PATHS.map((p) => {
          const isActive = p.activeSteps.includes(step);
          if (!isActive) return null;

          return (
            <g key={p.id}>
              {/* Outer soft glow stroke - travels once */}
              <motion.path
                d={p.d}
                fill="none"
                stroke="currentColor"
                className={p.colorClass}
                strokeWidth="3.5"
                strokeOpacity="0.2"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
              />
              {/* Sharp solid flowing stroke - travels once */}
              <motion.path
                d={p.d}
                fill="none"
                stroke="currentColor"
                className={p.colorClass}
                strokeWidth="1.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
              />
            </g>
          );
        })}

        {/* ForeignObjects for Nodes */}
        {NODES.map((node) => {
          const isBox = node.type === 'box';
          const w = isBox ? 56 : 24;
          const h = isBox ? 56 : 24;
          const isActive = isNodeActive(node.id);
          const colorStyles = NODE_COLORS[node.id];

          return (
            <foreignObject
              key={node.id}
              x={node.x - w / 2}
              y={node.y - h / 2}
              width={w}
              height={h}
              className="overflow-visible"
            >
              <div className="w-full h-full flex items-center justify-center">
                {isBox && node.icon ? (
                  <div
                    className={`w-full h-full rounded-[14px] border flex flex-col items-center justify-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4),inset_4px_4px_0_0_rgba(255,255,255,0.06),inset_6px_6px_0_0_rgba(255,255,255,0.04),inset_8px_8px_0_0_rgba(255,255,255,0.02),0_1px_2px_0_rgba(0,0,0,0.08),0_2px_4px_0_rgba(0,0,0,0.06),0_4px_6px_0_rgba(0,0,0,0.04),0_6px_8px_0_rgba(0,0,0,0.02)] text-white ${colorStyles.buttonBg} ${colorStyles.buttonBorder}`}
                  >
                    {/* Centered Static Icon */}
                    <div className="mb-0.5 flex items-center justify-center">
                      <node.icon className="w-5 h-5" weight="fill" />
                    </div>
                    <span className="text-[8.5px] font-mono font-bold tracking-wider select-none">
                      {node.label}
                    </span>
                  </div>
                ) : (
                  /* Central Router Node Upgrade */
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shadow-sm transition-all duration-300 ${isActive
                      ? "bg-amber-500/20 border-amber-500/70"
                      : "bg-background/80 border-zinc-300 dark:border-zinc-800"
                      }`}
                  >
                    <motion.div
                      className={`w-2.5 h-2.5 rounded-full border border-dashed ${isActive ? "border-amber-500" : "border-zinc-400 dark:border-zinc-600"
                        }`}
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                    />
                  </div>
                )}
              </div>
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Card2 – Live Token / Cost Monitor
───────────────────────────────────────────── */
export function Card2() {
  const bars = [45, 75, 35, 85, 60, 95, 50];
  const days = ["CLON", "PARS", "LINK", "IDX", "VEC", "RAG", "SYNC"];

  const [activeIdx, setActiveIdx] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIdx((prev) => (prev === 0 ? 1 : 0));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full flex flex-col gap-3.5 justify-between">
      {/* Stats row with a 0.5rem slide offset margin to prevent slide-up overflow clipping */}
      <div className="flex gap-4 pt-[0.625rem] pr-[0.625rem] pb-0.5 pl-0.5">
        {[
          { label: "Affected Files", value: "14 files", trend: "+12%" },
          { label: "Blast Radius", value: "84.2%", trend: "HIGH RISK" },
        ].map((s, i) => {
          const isActive = i === activeIdx || hoveredIdx === i;

          return (
            <div key={i} className="flex-1 h-[76px] relative select-none">
              {/* Background Hatched Scale Card */}
              <div
                className="absolute inset-0 rounded-xl border border-border/40 dark:border-border/20 bg-muted/5 text-border/30 dark:text-border/20"
                style={{
                  backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 6px, currentColor 6px, currentColor 7px)",
                }}
              />

              {/* Foreground Card sliding up and right on hover or cycle activation (0.5rem offset) */}
              <motion.div
                className="absolute inset-0 w-full h-full rounded-xl bg-neutral-950/40 border border-white/5 shadow-none p-3 hover:bg-white/2 transition-colors duration-300 backdrop-blur-[2px] flex items-center justify-between gap-3 cursor-pointer"
                animate={{
                  x: isActive ? "0.5rem" : "0rem",
                  y: isActive ? "-0.5rem" : "0rem",
                }}
                transition={{ type: "spring", stiffness: 200, damping: 16 }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Left Column: Metric Details */}
                <div className="flex flex-col min-w-0">
                  <span className="text-[8px] text-muted-foreground/80 font-mono uppercase tracking-widest leading-none">{s.label}</span>
                  <span className="text-base font-bold font-mono text-foreground leading-none mt-1.5 tracking-tight">{s.value}</span>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className={`text-[8px] font-mono font-bold ${s.trend.startsWith("+") ? "text-emerald-500" : "text-rose-400"
                      }`}>
                      {s.trend}
                    </span>
                    <span className="text-[8px] text-muted-foreground/50 font-mono">prev</span>
                  </div>
                </div>

                {/* Right Column: High-Precision Sparkline with Micro Vertices */}
                <div className="w-12 h-6 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 48 24">
                    {/* Connecting Line */}
                    <motion.path
                      d={i === 0
                        ? "M 0 18 L 16 11 L 32 14 L 48 4"
                        : "M 0 4 L 16 12 L 32 8 L 48 18"
                      }
                      fill="none"
                      stroke="currentColor"
                      className="text-muted-foreground/30 dark:text-muted-foreground/20"
                      strokeWidth="1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.8, delay: 0.2 + i * 0.15, ease: "easeOut" }}
                    />

                    {/* Vertex Dots */}
                    {(i === 0
                      ? [{ x: 0, y: 18 }, { x: 16, y: 11 }, { x: 32, y: 14 }, { x: 48, y: 4 }]
                      : [{ x: 0, y: 4 }, { x: 16, y: 12 }, { x: 32, y: 8 }, { x: 48, y: 18 }]
                    ).map((pt, idx) => (
                      <motion.circle
                        key={idx}
                        cx={pt.x}
                        cy={pt.y}
                        r="1.5"
                        className="fill-background stroke-muted-foreground/40 dark:stroke-muted-foreground/30"
                        strokeWidth="1"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.5 + idx * 0.08, duration: 0.25 }}
                      />
                    ))}
                  </svg>
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>

      {/* Bar chart */}
      <div className="flex-1 flex items-end gap-2.5 px-0.5 min-h-[90px]">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 h-full rounded-xl dark:bg-neutral-950/80 border border-border/80 dark:border-border/30 relative overflow-hidden bg-muted/5 text-border/40 dark:text-border/20"
            style={{
              backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 6px, currentColor 6px, currentColor 7px)",
            }}
          >
            {/* Animated Solid Filled Bar at bottom */}
            <motion.div
              className="absolute bottom-0 left-0 right-0 bg-primary border-t border-x border-primary/80 shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.6),inset_0_8px_12px_0_rgba(255,255,255,0.03),inset_0.5px_0_0_0_rgba(255,255,255,0.2),inset_0_2px_6px_0_rgba(255,255,255,0.3),inset_0_-0.5px_0_0_rgba(0,0,0,0.2),inset_-0.5px_0_0_0_rgba(0,0,0,0.1),inset_0_-2px_6px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.08),0_2px_4px_0_rgba(0,0,0,0.06),0_4px_6px_0_rgba(0,0,0,0.04),inset_0_-4px_8px_0_rgba(0,0,0,0.05)] rounded-t-[10px]"
              initial={{ height: "0%" }}
              animate={{
                height: [
                  `${h}%`,
                  `${Math.min(95, h + 15)}%`,
                  `${Math.max(10, h - 20)}%`,
                  `${Math.min(90, h + 8)}%`,
                  `${h}%`
                ],
              }}
              transition={{
                repeat: Infinity,
                duration: 3 + (i % 3) * 0.8,
                ease: "easeInOut",
                delay: i * 0.1,
              }}
            />
          </div>
        ))}
      </div>

      {/* X labels */}
      <div className="flex gap-2.5 px-0.5">
        {days.map((d, i) => (
          <p key={i} className="flex-1 text-center text-[8px] text-muted-foreground font-mono font-medium">{d}</p>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Card3 – Stacked Infinite-Scroll Activity Feed
   ───────────────────────────────────────────── */

const STATUS_ICONS: Record<string, { icon: any; color: string; bg: string; gradient: string; border: string }> = {
  done: { icon: Check, color: "text-lime-500", bg: "bg-lime-500/15", gradient: "bg-gradient-to-b from-lime-400 to-lime-600", border: "border-lime-600" },
  running: { icon: CircleNotch, color: "text-blue-400", bg: "bg-blue-400/15", gradient: "bg-gradient-to-b from-blue-400 to-blue-600", border: "border-blue-600" },
  waiting: { icon: Clock, color: "text-amber-400", bg: "bg-amber-400/15", gradient: "bg-gradient-to-b from-amber-400 to-amber-600", border: "border-amber-600" },
  idle: { icon: Minus, color: "text-muted-foreground/60", bg: "bg-muted/40", gradient: "bg-gradient-to-b from-zinc-400 to-zinc-600", border: "border-zinc-600" },
  failed: { icon: Minus, color: "text-rose-500", bg: "bg-rose-500/15", gradient: "bg-gradient-to-b from-rose-400 to-rose-600", border: "border-rose-600" },
};

export function Card3({ detailedStatus, repoName }: { detailedStatus?: string; repoName?: string }) {
  const name = repoName || "repository";

  const getStatusForStep = (stepName: string) => {
    if (!detailedStatus) return "idle";
    
    const order = ["queued", "cloning", "parsing", "embedding", "saving", "diagrams", "completed"];
    const currentIdx = order.indexOf(detailedStatus);
    const stepIdx = ["cloning", "parsing", "embedding", "saving", "diagrams"].indexOf(stepName);

    if (currentIdx === -1) return "waiting";

    if (currentIdx > stepIdx + 1) {
      return "done";
    } else if (currentIdx === stepIdx + 1) {
      return "running";
    } else {
      return "waiting";
    }
  };

  const getActionForStep = (stepName: string, status: string) => {
    switch (stepName) {
      case "cloning":
        return status === "running" ? `Cloning ${name} from GitHub...` : status === "done" ? `Cloned ${name} successfully.` : `Waiting to clone ${name}...`;
      case "parsing":
        return status === "running" ? "Parsing files and extracting AST token representations..." : status === "done" ? "Abstract Syntax Tree parsing complete." : "Queued for AST parsing.";
      case "embedding":
        return status === "running" ? "Generating code chunk semantic embeddings via Gemini..." : status === "done" ? "Gemini code chunk embeddings generated." : "Queued for vector embedding.";
      case "saving":
        return status === "running" ? "Linking imports and saving to Neo4j graph db..." : status === "done" ? "Graph database sync complete." : "Queued for graph database linking.";
      case "diagrams":
        return status === "running" ? "Generating repository architecture and flow diagrams..." : status === "done" ? "Pre-generated Mermaid diagrams complete." : "Queued for diagram generation.";
      default:
        return "";
    }
  };

  const steps = ["cloning", "parsing", "embedding", "saving", "diagrams"];
  const logs = detailedStatus
    ? steps.map((s, idx) => {
        let status = getStatusForStep(s);
        if (detailedStatus === "failed") {
          const prevSteps = steps.slice(0, idx);
          const allPrevDone = prevSteps.every((ps) => getStatusForStep(ps) === "done");
          if (allPrevDone && getStatusForStep(s) !== "done") {
            status = "failed";
          } else if (!allPrevDone) {
            status = "idle";
          } else {
            status = "done";
          }
        }

        let action = getActionForStep(s, status);
        if (status === "failed") {
          action = `Failed during ${s} stage.`;
        }

        const labelMap: Record<string, string> = {
          cloning: "Cloner",
          parsing: "Lexer",
          embedding: "Embedder",
          saving: "Linker",
          diagrams: "Visuals",
        };

        return {
          agent: labelMap[s],
          action,
          status,
          t: status === "done" ? "Done" : status === "running" ? "Active" : "—",
        };
      })
    : [
        { agent: "Cloner", action: "Cloning github.com/supabase/supabase-js…", status: "done", t: "0.8s" },
        { agent: "Lexer", action: "Parsing syntax trees across 142 source files", status: "done", t: "1.2s" },
        { agent: "Linker", action: "Resolving reference imports & reference bindings", status: "running", t: "2.5s" },
        { agent: "Embedder", action: "Generating chunk embeddings via vector model", status: "waiting", t: "—" },
        { agent: "Indexer", action: "Idle — queuing postgres graph database commit", status: "idle", t: "—" },
      ];

  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (detailedStatus) {
      const runIdx = logs.findIndex((l) => l.status === "running" || l.status === "failed");
      if (runIdx !== -1) {
        setActiveIdx(runIdx);
      } else {
        const allDone = logs.every((l) => l.status === "done");
        if (allDone) {
          setActiveIdx(logs.length - 1);
        } else {
          setActiveIdx(0);
        }
      }
      return;
    }

    const interval = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % logs.length);
    }, 2400);
    return () => clearInterval(interval);
  }, [detailedStatus, logs.length]);

  // Signed slot: 0 = active front, negative = above (upcoming), positive = below (past)
  const getSlot = (i: number) => {
    const N = logs.length;
    let rel = i - activeIdx;
    if (rel > Math.floor(N / 2)) rel -= N;
    if (rel < -Math.floor(N / 2)) rel += N;
    return rel;
  };

  // Fixed y positions: tighter stack, not linear steps
  const Y: Record<string, number> = { "-2": -68, "-1": -38, "0": 0, "1": 38, "2": 68 };

  return (
    <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
      {logs.map((l, i) => {
        const slot = getSlot(i);
        const si = STATUS_ICONS[l.status];
        const abs = Math.abs(slot);
        const isActive = slot === 0;
        const isVisible = abs <= 2;

        const yOffset = Y[String(slot)] ?? (slot < 0 ? -120 : 120);
        const scale = isActive ? 1 : abs === 1 ? 0.93 : 0.87;
        const opacity = isActive ? 1 : abs === 1 ? 0.65 : 0.38;
        const zIndex = isActive ? 30 : abs === 1 ? 20 : 10;

        return (
          <motion.div
            key={l.agent}
            className="absolute left-0 right-0 mx-auto px-1.5"
            style={{ zIndex }}
            animate={{
              y: isVisible ? yOffset : slot < 0 ? -150 : 150,
              scale,
              opacity: isVisible ? opacity : 0,
            }}
            transition={{
              y: { type: "spring", stiffness: 500, damping: 35 },
              scale: { type: "spring", stiffness: 500, damping: 35 },
              opacity: { duration: 0.25, ease: "easeOut" },
            }}
          >
            <div className={`w-full rounded-2xl border flex items-center gap-2.5 ${isActive
              ? "px-3 py-2.5 bg-background border-border"
              : "px-2.5 py-1.5 bg-muted/30 border-border/50"
              }`}>

              {/* Icon badge — full on active, compact on behind */}
              <div className={`shrink-0 rounded-[8px] flex items-center justify-center font-bold text-white transition-all duration-300 ${si.gradient} border ${si.border} shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.6),inset_0.5px_0_0_0_rgba(255,255,255,0.2),inset_0_2px_6px_0_rgba(255,255,255,0.3),inset_0_-0.5px_0_0_rgba(0,0,0,0.3),inset_-0.5px_0_0_0_rgba(0,0,0,0.1),inset_0_-2px_6px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.08),0_2px_4px_0_rgba(0,0,0,0.06),0_4px_6px_0_rgba(0,0,0,0.04)] ${isActive ? "w-8 h-8" : "w-5 h-5"
                }`}>
                <si.icon weight="bold" className={`${isActive ? "w-4 h-4" : "w-2.5 h-2.5"} ${l.status === "running" ? "animate-spin" : ""}`} />
              </div>

              {/* Text — full on active, name-only on behind */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`font-mono font-semibold text-foreground leading-none ${isActive ? "text-[10px]" : "text-[9px]"
                    }`}>{l.agent}</span>
                  <span className={`font-mono uppercase tracking-wide rounded px-1 py-0.5 ${si.bg} ${si.color} ${isActive ? "text-[7px]" : "text-[6px]"
                    }`}>{l.status}</span>
                </div>
                {isActive && (
                  <p className="text-[9px] text-muted-foreground truncate mt-0.5 leading-tight">{l.action}</p>
                )}
              </div>

              {isActive && (
                <span className="text-[9px] font-mono text-muted-foreground shrink-0">{l.t}</span>
              )}
            </div>
          </motion.div>
        );
      })}

      {/* Progress dots */}
      <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-1">
        {logs.map((_, i) => (
          <motion.div
            key={i}
            className="rounded-full bg-foreground/25"
            animate={{
              width: i === activeIdx ? 14 : 4,
              opacity: i === activeIdx ? 0.7 : 0.2,
            }}
            style={{ height: 3 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Card4 – Memory / Knowledge Base Namespaces
   ───────────────────────────────────────────── */

const NS_ICONS: Record<string, React.ElementType> = {
  source_code: Code,
  markdown_docs: FileText,
  commit_logs: TerminalWindow,
  package_deps: Database,
};

const NS_COLORS: Record<string, { bar: string; dot: string; badge: string; buttonBg: string; buttonBorder: string }> = {
  source_code: { bar: "from-violet-500 to-violet-400", dot: "bg-violet-500", badge: "bg-violet-500/15 text-violet-400", buttonBg: "bg-violet-500", buttonBorder: "border-violet-600" },
  markdown_docs: { bar: "from-sky-500    to-sky-400", dot: "bg-sky-500", badge: "bg-sky-500/15 text-sky-400", buttonBg: "bg-sky-500", buttonBorder: "border-sky-600" },
  commit_logs: { bar: "from-emerald-500 to-emerald-400", dot: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-400", buttonBg: "bg-emerald-500", buttonBorder: "border-emerald-600" },
  package_deps: { bar: "from-amber-500  to-amber-400", dot: "bg-amber-500", badge: "bg-amber-500/15 text-amber-400", buttonBg: "bg-amber-500", buttonBorder: "border-amber-600" },
};

const RETRIEVAL_QUERIES = [
  { ns: "source_code", q: "verifyJWTToken middleware handler", t: "0.2s" },
  { ns: "markdown_docs", q: "API rate limiting configuration guide", t: "1.1s" },
  { ns: "source_code", q: "Prisma schema relation constraints mapping", t: "2.4s" },
  { ns: "commit_logs", q: "fix memory leak in websocket reconnection loop", t: "4.0s" },
  { ns: "package_deps", q: "@supabase/supabase-js security patches", t: "5.8s" },
  { ns: "markdown_docs", q: "Docker environment setup configuration", t: "7.2s" },
];

export function Card4() {
  const namespaces = [
    { name: "source_code", hits: 342, fill: 88 },
    { name: "markdown_docs", hits: 218, fill: 56 },
    { name: "commit_logs", hits: 97, fill: 25 },
    { name: "package_deps", hits: 54, fill: 14 },
  ];

  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((prev) => (prev + 1) % RETRIEVAL_QUERIES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const activeNs = RETRIEVAL_QUERIES[tick].ns;
  const recentQueries = [0, 1, 2].map(
    (offset) => RETRIEVAL_QUERIES[(tick - offset + RETRIEVAL_QUERIES.length) % RETRIEVAL_QUERIES.length]
  );

  return (
    <div className="w-full h-full flex gap-5 py-2 px-3">

      {/* ── Left panel: Namespace bars ── */}
      <div className="flex-1 flex flex-col gap-0 min-w-0 pr-2">
        <p className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Namespaces</p>

        <div className="flex flex-col gap-2.5 flex-1">
          {namespaces.map((ns, i) => {
            const c = NS_COLORS[ns.name];
            const isActive = ns.name === activeNs;
            const Icon = (NS_ICONS[ns.name] || Database) as React.ComponentType<{ size?: number; weight?: string; className?: string }>;

            return (
              <div key={ns.name} className="flex items-center gap-3 group relative">

                {/* Icon Container with 3D effect */}
                <div
                  className={`relative flex shrink-0 items-center justify-center w-[30px] h-[30px] rounded-[10px] border transition-all duration-500 ${isActive ? `shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4),0_1px_2px_0_rgba(0,0,0,0.08)] text-white ${c.buttonBg} ${c.buttonBorder} scale-105` : 'bg-white/5 border-white/10 text-zinc-500 shadow-none'}`}
                >
                  <Icon size={14} weight={isActive ? "fill" : "regular"} className="relative z-10" />
                </div>

                {/* Name */}
                <span className={`text-[10px] font-mono w-20 shrink-0 transition-colors duration-400 ${isActive ? "text-foreground font-semibold" : "text-muted-foreground group-hover:text-foreground/70"}`}>
                  {ns.name}
                </span>

                {/* Cyberpunk Bar track */}
                <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden relative backdrop-blur-sm shadow-inner">
                  <motion.div
                    className={`absolute left-0 top-0 bottom-0 rounded-full overflow-hidden bg-gradient-to-r ${c.bar}`}
                    initial={{ width: "0%" }}
                    animate={{ width: `${ns.fill}%`, opacity: isActive ? 1 : 0.25 }}
                    transition={{
                      width: { duration: 1.2, delay: i * 0.1, type: "spring", bounce: 0.2 },
                      opacity: { duration: 0.4 },
                    }}
                  >
                    {/* Scanning light beam effect inside the bar */}
                    {isActive && (
                      <motion.div
                        className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-transparent via-white/50 to-transparent"
                        initial={{ x: "-100%" }}
                        animate={{ x: "100%" }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                      />
                    )}
                  </motion.div>
                </div>

                {/* Hit count */}
                <div className={`flex items-center gap-1.5 w-10 justify-end transition-all duration-500 ${isActive ? "opacity-100 scale-105" : "opacity-60 scale-100"}`}>
                  <span className={`text-[9px] font-mono font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                    {ns.hits}
                  </span>
                  {isActive && (
                    <motion.div
                      className={`w-1 h-1 rounded-full ${c.dot}`}
                      animate={{ opacity: [1, 0.2, 1], scale: [1, 1.5, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2 pt-3 mt-auto">
          <div className="relative flex items-center justify-center w-2 h-2">
            <motion.div
              className="absolute inset-0 rounded-full bg-emerald-400/40"
              animate={{ scale: [1, 2.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            />
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </div>
          <span className="text-[8px] font-mono text-muted-foreground font-medium tracking-wide">Live retrieval active</span>
        </div>
      </div>

      {/* Thin divider */}
      <div className="w-px bg-border/30 self-stretch shrink-0" />

      {/* ── Right panel: Retrieval log ── */}
      <div className="w-[172px] shrink-0 flex flex-col gap-0">
        <p className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground mb-2.5">Retrieval Log</p>

        <div className="flex flex-col gap-1.5 flex-1 overflow-hidden">
          {recentQueries.map((q, qi) => {
            const c = NS_COLORS[q.ns];
            return (
              <motion.div
                key={`${q.ns}-${q.q}-${qi}`}
                className="rounded-xl border border-white/5 bg-white/2 px-2.5 py-2"
                initial={{ opacity: 0, y: -8 }}
                animate={{
                  opacity: qi === 0 ? 1 : qi === 1 ? 0.8 : qi === 2 ? 0.5 : 0.25,
                  y: 0,
                }}
                transition={{ type: "spring", stiffness: 500, damping: 35, delay: qi * 0.05 }}
              >
                <div className="flex items-center gap-1 mb-1">
                  <span className={`text-[6.5px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded-md ${c.badge}`}>
                    {q.ns}
                  </span>
                  <span className="text-[7px] font-mono text-muted-foreground/50 ml-auto tabular-nums">{q.t}</span>
                </div>
                <p className="text-[8px] text-foreground/75 leading-tight font-mono truncate">{q.q}</p>
              </motion.div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

/* ─────────────────────────────────────────────
   Card5 – Tool Call Inspector
───────────────────────────────────────────── */
export function Card5() {
  const tools = [
    { name: "vector_search", calls: 14, icon: Brain, latency: "115ms", color: "bg-gradient-to-b from-sky-400 to-sky-600", borderColor: "border-sky-600" },
    { name: "ast_lookup", calls: 8, icon: Code, latency: "14ms", color: "bg-gradient-to-b from-emerald-400 to-emerald-600", borderColor: "border-emerald-600" },
    { name: "reference_map", calls: 22, icon: FileText, latency: "8ms", color: "bg-gradient-to-b from-amber-400 to-amber-600", borderColor: "border-amber-600" },
    { name: "git_diff_compare", calls: 31, icon: TerminalWindow, latency: "240ms", color: "bg-gradient-to-b from-violet-400 to-violet-600", borderColor: "border-violet-600" },
  ];

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="grid grid-cols-2 gap-2 w-full">
        {tools.map((t, i) => (
          <motion.div
            key={i}
            className="relative rounded-[16px] border border-white/5 bg-[#050505] shadow-none hover:border-white/10 transition-all duration-300 flex flex-col justify-between p-2.5 group"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, type: "spring", stiffness: 300, damping: 25 }}
          >
            {/* Top Row: 3D Icon + Calls */}
            <div className="flex items-start justify-between">
              <div className={`w-[28px] h-[28px] rounded-[8px] flex items-center justify-center text-white ${t.color} border ${t.borderColor} shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.6),inset_0.5px_0_0_0_rgba(255,255,255,0.2),inset_0_2px_6px_0_rgba(255,255,255,0.3),inset_0_-0.5px_0_0_rgba(0,0,0,0.3),inset_-0.5px_0_0_0_rgba(0,0,0,0.1),inset_0_-2px_6px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.08),0_2px_4px_0_rgba(0,0,0,0.06),0_4px_6px_0_rgba(0,0,0,0.04)] group-hover:scale-105 transition-transform duration-300`}>
                <t.icon weight="fill" className="w-3.5 h-3.5 relative z-10" />
              </div>

              <div className="flex flex-col items-end gap-0.5 mt-0.5">
                <span className="text-[12px] font-mono font-bold text-foreground leading-none">{t.calls}</span>
                <span className="text-[7px] font-mono text-muted-foreground/80 uppercase tracking-widest leading-none">Calls</span>
              </div>
            </div>

            {/* Bottom Row: Name + Latency + Progress */}
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-medium text-foreground tracking-tight">{t.name}</span>
                <span className="text-[8px] font-mono text-muted-foreground tabular-nums">{t.latency}</span>
              </div>
              <div className="w-full h-1.5 bg-muted/50 rounded-full overflow-hidden shadow-inner relative">
                <motion.div
                  className={`absolute left-0 top-0 bottom-0 rounded-full ${t.color}`}
                  initial={{ width: "0%" }}
                  animate={{ width: `${(t.calls / 31) * 100}%` }}
                  transition={{ delay: 0.4 + i * 0.1, duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Grid Component
───────────────────────────────────────────── */
export interface AgentBentoGridProps {
  className?: string;
  detailedStatus?: string;
  repoName?: string;
}

export function AgentBentoGrid({ className, detailedStatus, repoName }: AgentBentoGridProps) {
  const CARDS = [
    {
      title: "AST Parser & Linker",
      description: "Generate Abstract Syntax Trees and link reference chains into a unified codebase graph.",
      visual: <Card1 detailedStatus={detailedStatus} />,
      colSpan: "md:col-span-1 lg:col-span-1",
      height: "h-[330px]",
    },
    {
      title: "Blast Radius Analyzer",
      description: "Evaluate commit changes downstream. View affected files and call reference risks.",
      visual: <Card2 />,
      colSpan: "md:col-span-1 lg:col-span-1",
      height: "h-[330px]",
    },
    {
      title: "Repository Sync Log",
      description: "Real-time telemetry showing code cloner, AST tokenizer, and vector database indexing progress.",
      visual: <Card3 detailedStatus={detailedStatus} repoName={repoName} />,
      colSpan: "md:col-span-1 lg:col-span-1",
      height: "h-[330px]",
    },
    {
      title: "Unified Repository Index",
      description: "Instant semantic context retrieval mapping across files, imports, git history, and markdown docs.",
      visual: <Card4 />,
      colSpan: "md:col-span-2 lg:col-span-2",
      height: "h-[330px]",
    },
    {
      title: "Codebase Indexing Queries",
      description: "Track semantic queries, syntactic matches, reference maps, and git diff latency indicators.",
      visual: <Card5 />,
      colSpan: "md:col-span-1 lg:col-span-1",
      height: "h-[330px]",
    }
  ];

  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl mx-auto", className)}>
      {CARDS.map((card, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
          className={cn(card.colSpan, card.height)}
        >
          <FeatCard
            title={card.title}
            description={card.description}
            className="h-full"
          >
            {card.visual}
          </FeatCard>
        </motion.div>
      ))}
    </div>
  );
}

export default AgentBentoGrid;
