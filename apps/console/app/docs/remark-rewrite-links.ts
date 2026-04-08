import type { Root } from "mdast";
import { visit } from "unist-util-visit";

/**
 * Remark plugin that rewrites relative markdown links (e.g. ./admin-guide.md)
 * to in-console /docs/ routes (e.g. /docs/admin-guide).
 *
 * Self-contained — no imports from the main app.
 */
export function remarkRewriteDocLinks() {
  return (tree: Root) => {
    visit(tree, "link", (node) => {
      const href = node.url;
      // Match ./slug.md, slug.md, or ../guides/slug.md with an optional anchor.
      const match = href.match(
        /^(?:\.\/|(?:\.\.\/guides\/))?([a-z][a-z0-9-]*)\.md(#.+)?$/,
      );
      if (match) {
        node.url = `/docs/${match[1]}${match[2] ?? ""}`;
      }
    });
  };
}
