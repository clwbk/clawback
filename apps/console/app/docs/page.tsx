import Link from "next/link";
import { docsNav } from "./docs-nav";
import { DocsSidebar } from "./sidebar";

export default function DocsIndex() {
  return (
    <div className="docs-layout">
      <DocsSidebar />
      <main className="docs-main">
        <div className="docs-prose">
          <h1>Clawback Documentation</h1>
          <p>
            Guides and reference for deploying, administering, and using
            Clawback — the self-hosted AI agent control plane.
          </p>
          <h2>Guides</h2>
          <ul>
            {docsNav.map(({ slug, title }) => (
              <li key={slug}>
                <Link href={`/docs/${slug}`}>{title}</Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
