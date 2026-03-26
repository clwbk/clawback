import type { Metadata } from "next";
import "./docs.css";

export const metadata: Metadata = {
  title: "Clawback Documentation",
  description: "Guides and reference for the Clawback AI agent control plane",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
