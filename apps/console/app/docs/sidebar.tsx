"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsNav } from "./docs-nav";

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="docs-sidebar">
      <div className="docs-sidebar-title">Documentation</div>
      {docsNav.map(({ slug, title }) => {
        const href = `/docs/${slug}`;
        const isActive = pathname === href;
        return (
          <Link key={slug} href={href} className={isActive ? "active" : ""}>
            {title}
          </Link>
        );
      })}
    </nav>
  );
}
