import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { docsNav } from "../docs-nav";
import { loadDoc, getDocTitle } from "../docs-loader";
import { remarkRewriteDocLinks } from "../remark-rewrite-links";
import { DocsSidebar } from "../sidebar";

type Params = { slug: string };

export async function generateStaticParams() {
  return docsNav.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const title = getDocTitle(slug);
  if (!title) return {};
  return { title: `${title} — Clawback Docs` };
}

export default async function DocPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const content = await loadDoc(slug);
  if (!content) notFound();

  return (
    <div className="docs-layout">
      <DocsSidebar />
      <main className="docs-main">
        <article className="docs-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkRewriteDocLinks]}>{content}</ReactMarkdown>
        </article>
      </main>
    </div>
  );
}
