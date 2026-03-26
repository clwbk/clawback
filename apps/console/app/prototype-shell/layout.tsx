import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { PrototypeNav } from "./prototype-nav";

export default function PrototypeShellLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f6f3eb] text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-r border-border/70 bg-[#f1ece2] p-5">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Clawback
            </p>
            <p className="text-lg font-semibold text-foreground">Prototype</p>
          </div>

          <div className="mt-8">
            <PrototypeNav />
          </div>

          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">
            Red bubbles are notes about the UI. Everything else is the mock product surface.
          </div>

          <div className="mt-6">
            <Button asChild variant="outline" size="sm" className="w-full justify-start">
              <Link href="/workspace/chat">Back to console</Link>
            </Button>
          </div>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="border-b border-border/70 bg-background/80 px-6 py-4 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Small-business worker prototype</p>
                <p className="text-xs text-muted-foreground">Onboarding first. Product shell second.</p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/prototype-shell">Overview</Link>
              </Button>
            </div>
          </header>

          <div className="flex-1 px-6 py-6 lg:px-8 lg:py-8">{children}</div>
        </div>
      </div>
    </main>
  );
}
