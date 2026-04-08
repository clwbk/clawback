import Link from "next/link";
import { docsNav, isPublicDemoMode } from "./docs-nav";
import { DocsSidebar } from "./sidebar";

export default function DocsIndex() {
  const demoGuideHref = isPublicDemoMode ? "/docs/public-demo" : "/docs/demo-walkthrough";
  const demoGuideTitle = isPublicDemoMode ? "Public Demo Guide" : "Demo Walkthrough";
  const demoGuideBody = isPublicDemoMode
    ? "Use this if you want to log into the shared demo right away. It gives you the public evaluator login, the first prompts to try, and the separate admin path for trusted walkthroughs."
    : "The fastest path for a friend or evaluator. It tells you exactly what to click, what to ask, and what each step proves.";

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
          <h2>Start Here</h2>
          <div className="not-prose grid gap-4 md:grid-cols-2">
            <Link
              href="/docs/start-here"
              className="rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/50"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Choose A Path
              </p>
              <h3 className="mt-2 text-lg font-semibold text-foreground">Start Here</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                One decision page for the shared demo, local clone, and
                single-node deployment paths, including what each path does and
                does not prove.
              </p>
            </Link>
            <Link
              href={demoGuideHref}
              className="rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/50"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Try The Demo
              </p>
              <h3 className="mt-2 text-lg font-semibold text-foreground">{demoGuideTitle}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{demoGuideBody}</p>
            </Link>
            <Link
              href="/docs/quickstart"
              className="rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/50"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Run It Locally
              </p>
              <h3 className="mt-2 text-lg font-semibold text-foreground">Quickstart</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Clone the repo, start the stack, seed the demo workspace, and
                get to a working local environment quickly.
              </p>
            </Link>
            <Link
              href="/docs/getting-started"
              className="rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/50"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Understand The Product
              </p>
              <h3 className="mt-2 text-lg font-semibold text-foreground">Getting Started</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Start with the product promise, the current shape, and how to
                map your own business workflow onto Clawback.
              </p>
            </Link>
          </div>
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
