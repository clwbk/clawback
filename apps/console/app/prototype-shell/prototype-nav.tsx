"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/prototype-shell", label: "Get started" },
  { href: "/prototype-shell/home", label: "Today" },
  { href: "/prototype-shell/assistants", label: "Workers" },
  { href: "/prototype-shell/chat", label: "Workspace" },
  { href: "/prototype-shell/reviews", label: "Inbox" },
  { href: "/prototype-shell/artifacts", label: "Work" },
];

export function PrototypeNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-2">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "block rounded-2xl px-4 py-3 text-sm font-medium transition",
              active
                ? "bg-foreground text-background"
                : "text-foreground/70 hover:bg-muted/40 hover:text-foreground",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
