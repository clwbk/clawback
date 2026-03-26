import type { ReactNode } from "react";

import { ArrowRight, Mail, MessageSquare, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function HelpBubble({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
      {children}
    </div>
  );
}

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border/70 bg-background p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h2>
        {hint ? (
          <div className="max-w-[260px]">
            <HelpBubble>{hint}</HelpBubble>
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function TinyBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-border/70 bg-muted/20 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function MailPreview() {
  return (
    <div className="rounded-2xl border border-border/70 bg-[#fcfbf7] p-4">
      <div className="space-y-2 border-b border-border/70 pb-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <TinyBadge>To: Hartwell Studio</TinyBadge>
          <TinyBadge>Subject: next steps after today&apos;s review</TinyBadge>
        </div>
      </div>
      <div className="space-y-3 pt-4 text-sm leading-6 text-foreground">
        <p>Thanks again for the review today.</p>
        <p>
          We&apos;ve updated the timeline, clarified the homepage scope, and added the analytics
          workstream you asked for.
        </p>
        <p>
          If this looks right, we&apos;ll send the revised proposal tomorrow morning and start design
          on Monday.
        </p>
        <p>Best, Dave</p>
      </div>
    </div>
  );
}

export function TodayScreen() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-[#1f2937] p-6 text-white shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
              Next up
            </p>
            <p className="mt-3 text-2xl font-semibold">Send project update to Hartwell Studio</p>
            <p className="mt-2 text-sm text-white/70">Draft is ready. Needs one sign-off.</p>
            <Button className="mt-5 bg-white text-slate-900 hover:bg-white/90">Open review</Button>
          </div>
          <div className="rounded-3xl border border-border/70 bg-background p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              In progress
            </p>
            <p className="mt-3 text-xl font-semibold text-foreground">Client Follow-Up Worker</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Using meeting notes, project brief, and recent email thread.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <TinyBadge>3 sources connected</TinyBadge>
              <TinyBadge>1 draft open</TinyBadge>
            </div>
          </div>
        </div>

        <Section
          title="Recent work"
          hint="Start with the work itself, not admin or system status."
        >
          <div className="space-y-3">
            {[
              ["Draft ready", "Project update for Hartwell Studio", "2 minutes ago"],
              ["Proposal saved", "Homepage redesign v2", "Yesterday"],
              ["Notes synced", "Client call transcript imported", "Yesterday"],
            ].map(([label, name, when]) => (
              <div
                key={name}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{name}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
                <p className="text-xs text-muted-foreground">{when}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="space-y-6">
        <Section title="Needs review" hint="The next real-world action should be easy to spot.">
          <div className="space-y-3">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-900">Approve and send update</p>
              <p className="mt-1 text-xs text-amber-800">Hartwell Studio</p>
            </div>
          </div>
        </Section>

        <Section title="Connected knowledge">
          <div className="space-y-2">
            {["Meeting notes", "Project brief", "Recent client emails"].map((item) => (
              <div key={item} className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-foreground">
                {item}
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

export function AssistantScreen() {
  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Section title="Template">
        <div className="space-y-3">
          {[
            "Client Follow-Up Worker",
            "Proposal Worker",
            "Bugfix Worker",
          ].map((item, index) => (
            <div
              key={item}
              className={[
                "rounded-2xl border px-4 py-3 text-sm font-medium",
                index === 0
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/70 bg-muted/20 text-foreground",
              ].join(" ")}
            >
              {item}
            </div>
          ))}
        </div>
      </Section>

      <div className="space-y-6">
        <Section title="Setup" hint="Keep setup to a few concrete decisions.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="mt-1 text-sm font-medium text-foreground">Client Follow-Up Worker</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Model</p>
              <p className="mt-1 text-sm font-medium text-foreground">gpt-4.1-mini</p>
            </div>
          </div>
        </Section>

        <Section title="Knowledge" hint="Users should pick sources, not configure retrieval.">
          <div className="grid gap-3 md:grid-cols-3">
            {["Meeting notes", "Project brief", "Email thread"].map((item) => (
              <div key={item} className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-foreground">
                {item}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Boundaries" hint="One simple rule set: Auto, Ask me, Never.">
          <div className="space-y-3">
            {[
              ["Draft replies", "Auto", "bg-emerald-100 text-emerald-700"],
              ["Send email", "Ask me", "bg-amber-100 text-amber-800"],
              ["Touch billing", "Never", "bg-zinc-200 text-zinc-700"],
            ].map(([label, mode, tone]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3"
              >
                <p className="text-sm text-foreground">{label}</p>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${tone}`}>{mode}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

export function WorkspaceScreen() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
      <Section title="Conversation">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <p className="text-xs text-muted-foreground">You</p>
            <p className="mt-1 text-sm text-foreground">
              Draft a client update from today&apos;s call. Keep it concise and mention the timeline change.
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Client Follow-Up Worker</p>
            </div>
            <div className="mt-3 space-y-2 text-sm text-foreground">
              <p>I pulled from:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>meeting notes from today</li>
                <li>project brief v3</li>
                <li>last email thread with Hartwell Studio</li>
              </ul>
              <p className="pt-1">Draft is ready on the right.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-border/80 bg-background px-4 py-3 text-sm text-muted-foreground">
            Type a follow-up question…
          </div>
        </div>
      </Section>

      <div className="space-y-6">
        <Section title="Draft" hint="Keep the draft visible while the user chats.">
          <MailPreview />
        </Section>

        <Section title="Next action" hint="If it will send something real, put the action here.">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-amber-800" />
              <p className="text-sm font-medium text-amber-900">Approve and send</p>
            </div>
            <p className="mt-2 text-xs text-amber-800">
              Recipient: emma@hartwellstudio.com
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}

export function ReviewScreen() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Section
        title="Review draft"
        hint="This should be one decision. Approve and send, or request changes."
      >
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">To</p>
              <p className="mt-1 text-sm font-medium text-foreground">Emma, Hartwell Studio</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Trigger</p>
              <p className="mt-1 text-sm font-medium text-foreground">Send outbound email</p>
            </div>
          </div>

          <MailPreview />

          <div className="flex flex-wrap gap-3">
            <Button>Approve and send</Button>
            <Button variant="outline">Request changes</Button>
          </div>
        </div>
      </Section>
    </div>
  );
}

export function SentArtifactScreen() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Section title="Sent artifact" hint="Sent work should stay easy to reopen later.">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <TinyBadge>Sent</TinyBadge>
            <TinyBadge>Hartwell Studio</TinyBadge>
            <TinyBadge>Today 4:18 PM</TinyBadge>
          </div>

          <MailPreview />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Created from</p>
              <p className="mt-1 text-sm font-medium text-foreground">Client Follow-Up Copilot</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Linked review</p>
              <p className="mt-1 text-sm font-medium text-foreground">Approved — sent via SMTP</p>
            </div>
          </div>
        </div>
      </Section>

      <div className="space-y-6">
        <Section title="Source context">
          <div className="space-y-2">
            {["Meeting notes", "Project brief", "Recent email thread"].map((item) => (
              <div key={item} className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-foreground">
                {item}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Next">
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-foreground">Open proposal draft</p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

export function OverviewGrid() {
  const pages = [
    {
      title: "Get started",
      path: "/prototype-shell",
      icon: Sparkles,
      note: "Pick a role, add context, see useful work immediately.",
    },
    {
      title: "Today",
      path: "/prototype-shell/home",
      icon: MessageSquare,
      note: "What matters now once workers are active.",
    },
    {
      title: "Workers",
      path: "/prototype-shell/assistants",
      icon: Sparkles,
      note: "Install and shape role-based workers.",
    },
    {
      title: "Inbox",
      path: "/prototype-shell/reviews",
      icon: ShieldCheck,
      note: "One clean review decision before meaningful actions.",
    },
    {
      title: "Work",
      path: "/prototype-shell/artifacts",
      icon: Mail,
      note: "Keep durable records of what the workers produced.",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {pages.map(({ title, path, icon: Icon, note }) => (
        <a
          key={path}
          href={path}
          className="rounded-3xl border border-border/70 bg-background p-5 shadow-sm transition hover:border-foreground/30 hover:shadow-md"
        >
          <Icon className="h-5 w-5 text-foreground" />
          <p className="mt-4 text-lg font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{note}</p>
          <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-foreground">
            Open
            <ArrowRight className="h-4 w-4" />
          </div>
        </a>
      ))}
    </div>
  );
}
