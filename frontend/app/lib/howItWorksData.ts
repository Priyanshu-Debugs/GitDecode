export interface StepItem {
  id: number;
  stepNumber: string;
  title: string;
  headline: string;
  description: string;
  tech: string[];
  codePreview: string;
}

export interface HowItWorksData {
  sectionLabel: string;
  title: string;
  subtitle: string;
  steps: StepItem[];
}

export const howItWorksData: HowItWorksData = {
  sectionLabel: "system_architecture",
  title: "From repo URL to full understanding.",
  subtitle: "How GitDecode leverages Tree-sitter syntax graphs, deterministic BFS traversals, and multi-agent systems to perform codebase QA without lossy embeddings.",
  steps: [
    {
      id: 1,
      stepNumber: "01",
      title: "Connect & Import",
      headline: "Shallow clone and workspace detection",
      description: "Paste a public or private GitHub repository URL. GitDecode performs a shallow clone (git clone --depth 1) of the target branch to retrieve the active codebase state. It runs ingestion diagnostics to analyze project files, detect monorepos, locate package configs, and identify all active programming languages.",
      tech: ["GitHub REST API", "Shallow Clone (Depth-1)", "Monorepo Detection", "Workspace Ingestion"],
      codePreview: "$ git clone --depth 1 --branch main https://github.com/owner/repo"
    },
    {
      id: 2,
      stepNumber: "02",
      title: "AST Parse & Graph Compile",
      headline: "Tree-sitter syntactic extraction",
      description: "Code files are processed using language-specific Tree-sitter parsers (such as ts_parser.py and python_parser.py). The system extracts structural declaration nodes: classes, functions, import directives, variable declarations, and associated docstrings. By mapping import paths to actual file definitions, it builds a multi-file dependency graph of nodes and relational call edges.",
      tech: ["Tree-sitter Parsers", "ts_parser.py", "python_parser.py", "Abstract Syntax Trees (AST)", "Dependency Graph Creation"],
      codePreview: "parse_source_file(file_content) → { classes, functions, imports, docstrings }"
    },
    {
      id: 3,
      stepNumber: "03",
      title: "Vectorless RAG Routing",
      headline: "Bi-directional Graph BFS & Hybrid Context",
      description: "Unlike traditional vector database RAG, GitDecode does not chunk files or store embeddings. First, it uses Gemini LLM structured outputs to map the user query to TargetEntities (target file paths and symbols). It then executes a Breadth-First Search (BFS) graph walk traversing import and dependent relationships. Depth-0 & Depth-1 files load full source code; Depth-2 files load AST outlines (signatures & docstrings only) for import validation. Depth-3 and above are excluded to save tokens.",
      tech: ["TargetEntities Mapping", "Bi-directional BFS Walk", "Hybrid Context Stuffing", "AST Signatures Outline", "Gemini Context Cache"],
      codePreview: "ASTRouter.walk_graph(target_files, graph_data, max_depth=2) → (depth_1_full, depth_2_signatures)"
    },
    {
      id: 4,
      stepNumber: "04",
      title: "Multi-Agent Pipeline",
      headline: "LangGraph supervisor coordination",
      description: "The compiled hybrid context is fed to a multi-agent pipeline choreographed using LangGraph. A supervisor agent node acts as the central router, classifying the user's intent and delegating code retrieval to specialized worker nodes: Code QA for direct questions, Visualizer for Mermaid flowchart rendering, Blast Radius for change-impact diffing, and Repo Summary for codebase overviews.",
      tech: ["LangGraph Orchestration", "Supervisor Agent Pattern", "Worker Specialist Agents", "Structured JSON Tool Outputs"],
      codePreview: "workflow: START → Supervisor → { CodeQA, Visualizer, BlastRadius, RepoSummary } → END"
    },
    {
      id: 5,
      stepNumber: "05",
      title: "SSE Stream & Visualization",
      headline: "SSE text streaming and interactive layouts",
      description: "Response outputs are streamed dynamically back to the client console via Server-Sent Events (SSE). The stream broadcasts live agent execution logs (thought chains), final markdown answers, specific code citations linked to file line ranges, and interactive visualizations such as dependency graphs and Mermaid class flowcharts.",
      tech: ["SSE (Server-Sent Events)", "Mermaid.js Flowcharts", "Interactive Graph Viewer", "Source Line Citations"],
      codePreview: "data: { \"type\": \"thought\", \"content\": \"Supervisor routing query to QA specialist...\" }"
    }
  ]
};
