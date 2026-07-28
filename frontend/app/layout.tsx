import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit, JetBrains_Mono } from "next/font/google";
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

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
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
  title: "GitDecode | Understand Any Codebase",
  description:
    "AI-powered codebase intelligence. GitDecode parses your repository, builds a knowledge graph, and lets you explore it through interactive architecture diagrams and natural conversation.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  keywords: [
    "codebase visualization",
    "code understanding",
    "AI code assistant",
    "architecture diagrams",
    "knowledge graph",
    "developer tools",
  ],
  authors: [{ name: "GitDecode" }],
  openGraph: {
    title: "GitDecode — Understand Any Codebase",
    description:
      "Parse your GitHub repository ASTs, trace call dependencies, and generate interactive architecture maps in seconds.",
    type: "website",
    siteName: "GitDecode",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

import AnalyticsTracker from "./components/AnalyticsTracker";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} ${gtWalsheim.variable} ${jetbrainsMono.variable} dark`}
    >
      <body>
        <AnalyticsTracker />
        <div className="noise-overlay" />
        {children}
      </body>
    </html>
  );
}

