import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const gtWalsheim = localFont({
  src: [
    {
      path: "../public/fonts/GTWalsheimProRegular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/GTWalsheimProBold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-gt-walsheim",
});

export const metadata: Metadata = {
  title: "GitMesh | Understand Any Codebase",
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
      className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} ${gtWalsheim.variable} dark`}
    >
      <body>
        <div className="noise-overlay" />
        {children}
      </body>
    </html>
  );
}
