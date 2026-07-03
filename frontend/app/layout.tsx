import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GitMesh — Understand Any Codebase",
  description:
    "AI-powered codebase intelligence. GitMesh parses your repository, builds a knowledge graph, and lets you explore it through interactive architecture diagrams and natural conversation.",
  keywords: [
    "codebase visualization",
    "code understanding",
    "AI code assistant",
    "architecture diagrams",
    "knowledge graph",
    "developer tools",
  ],
  authors: [{ name: "GitMesh" }],
  openGraph: {
    title: "GitMesh — Understand Any Codebase",
    description:
      "Parse, visualize, and chat with any codebase. AI-powered architecture diagrams and natural language code Q&A.",
    type: "website",
    siteName: "GitMesh",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} dark`}
    >
      <body>{children}</body>
    </html>
  );
}
