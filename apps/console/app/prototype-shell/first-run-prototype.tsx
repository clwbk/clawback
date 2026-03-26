"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bug,
  Check,
  FileText,
  Headphones,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { HelpBubble, TinyBadge } from "./prototype-kit";

type TemplateId = "follow-up" | "proposal" | "support" | "bugfix";
type Stage = "landing" | "role" | "context" | "output" | "sent";

type TemplateDefinition = {
  id: TemplateId;
  name: string;
  shortName: string;
  description: string;
  icon: LucideIcon;
  sourcePrompt: string;
  sampleText: string;
  outputTitle: string;
  outputKind: string;
  actionLabel: string;
  body: string[];
};

const templates: TemplateDefinition[] = [
  {
    id: "follow-up",
    name: "Client Follow-Up",
    shortName: "Follow-Up",
    description: "Drafts clear client updates from call notes and project context.",
    icon: Mail,
    sourcePrompt: "Paste meeting notes",
    sampleText:
      "Hartwell Studio review. Timeline moved by one week because analytics work needs extra design time. Client asked for a revised proposal tomorrow morning and wants weekly updates until launch.",
    outputTitle: "Follow-up draft for Hartwell Studio",
    outputKind: "Email draft",
    actionLabel: "Approve and send",
    body: [
      "Thanks again for the review today.",
      "We updated the timeline by one week to account for the added analytics workstream. We will send the revised proposal tomorrow morning and keep you posted with weekly updates until launch.",
      "If that plan looks right, we can start design on Monday.",
      "Best, Dave",
    ],
  },
  {
    id: "proposal",
    name: "Proposal Writer",
    shortName: "Proposal",
    description: "Turns discovery notes into a scoped proposal and open-questions list.",
    icon: FileText,
    sourcePrompt: "Paste discovery notes",
    sampleText:
      "Prospect wants a marketing site refresh plus onboarding funnel. Budget around $18k. Needs launch before June conference. Biggest unknown is CRM integration scope.",
    outputTitle: "Proposal outline for June launch",
    outputKind: "Proposal draft",
    actionLabel: "Approve and save",
    body: [
      "Scope: marketing site refresh, onboarding funnel, CRM integration discovery.",
      "Timeline: discovery this week, design sprint next week, launch before the June conference.",
      "Open question: define CRM integration boundaries before final pricing.",
    ],
  },
  {
    id: "support",
    name: "Support Triage",
    shortName: "Support",
    description: "Summarizes inbound issues and drafts the first customer response.",
    icon: Headphones,
    sourcePrompt: "Paste customer message",
    sampleText:
      "Customer says they were charged twice and needs a correction before the end of day. Wants confirmation that the second charge will be reversed.",
    outputTitle: "Draft customer reply",
    outputKind: "Reply draft",
    actionLabel: "Approve and send",
    body: [
      "Thanks for flagging this. We found the duplicate charge and have started the reversal.",
      "You should see the correction reflected shortly, and we'll confirm once it is complete.",
      "If anything still looks wrong by end of day, reply here and we will jump on it.",
    ],
  },
  {
    id: "bugfix",
    name: "Bugfix Helper",
    shortName: "Bugfix",
    description: "Turns bug reports into a patch summary and PR-ready next step.",
    icon: Bug,
    sourcePrompt: "Paste bug report",
    sampleText:
      "Checkout button spins forever after promo code is applied. Repro on mobile Safari. Started after yesterday's pricing widget change.",
    outputTitle: "Patch plan for promo-code checkout bug",
    outputKind: "PR draft",
    actionLabel: "Approve and open PR",
    body: [
      "Likely cause: pricing widget change leaves the checkout mutation waiting on a stale discount payload.",
      "Plan: guard the widget callback, normalize promo payload on mobile Safari, add regression test for discounted checkout.",
      "Ready to open a PR draft once reviewed.",
    ],
  },
];

function StepPill({
  active,
  complete,
  label,
  number,
}: {
  active: boolean;
  complete: boolean;
  label: string;
  number: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={[
          "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
          complete
            ? "bg-emerald-100 text-emerald-700"
            : active
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground",
        ].join(" ")}
      >
        {complete ? <Check className="h-4 w-4" /> : number}
      </div>
      <span className={active ? "text-sm font-medium text-foreground" : "text-sm text-muted-foreground"}>
        {label}
      </span>
    </div>
  );
}

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: TemplateDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = template.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "rounded-3xl border p-5 text-left transition",
        selected
          ? "border-foreground bg-foreground text-background shadow-md"
          : "border-border/70 bg-background hover:border-foreground/30 hover:shadow-sm",
      ].join(" ")}
    >
      <Icon className={selected ? "h-5 w-5 text-background" : "h-5 w-5 text-foreground"} />
      <p className="mt-4 text-lg font-semibold">{template.name}</p>
      <p className={["mt-2 text-sm leading-6", selected ? "text-white/75" : "text-muted-foreground"].join(" ")}>
        {template.description}
      </p>
      <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium">
        Use this
        <ArrowRight className="h-4 w-4" />
      </div>
    </button>
  );
}

function OutputPreview({ template }: { template: TemplateDefinition }) {
  return (
    <div className="rounded-3xl border border-border/70 bg-[#fcfbf7] p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <TinyBadge>{template.outputKind}</TinyBadge>
        <TinyBadge>{template.shortName} worker</TinyBadge>
      </div>
      <p className="mt-4 text-lg font-semibold text-foreground">{template.outputTitle}</p>
      <div className="mt-4 space-y-3 text-sm leading-6 text-foreground">
        {template.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}

function MiniShell({
  template,
  context,
  sent,
}: {
  template: TemplateDefinition;
  context: string;
  sent: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-border/70 bg-white shadow-[0_24px_80px_-40px_rgba(36,39,52,0.28)]">
      <div className="border-b border-border/70 bg-[#f8f5ee] px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">{template.name}</p>
            <p className="text-xs text-muted-foreground">Hartwell Studio workspace</p>
          </div>
          <div className="flex gap-2">
            <TinyBadge>{template.shortName} worker</TinyBadge>
            <TinyBadge>{sent ? "Completed" : "Ready"}</TinyBadge>
          </div>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.1fr)_360px]">
        <div className="space-y-4 border-r border-border/70 p-5">
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <p className="text-xs text-muted-foreground">Context added</p>
            <p className="mt-2 text-sm text-foreground">{context.trim() || template.sampleText}</p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium text-foreground">{template.name}</p>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              I used the context you gave me and prepared the first output right away.
            </p>
          </div>

          {sent ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-900">Done</p>
              <p className="mt-2 text-sm text-emerald-800">
                {template.shortName === "Bugfix"
                  ? "PR draft opened and logged in Work."
                  : `${template.outputKind} completed and recorded in Work.`}
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 p-5">
          <OutputPreview template={template} />
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-800" />
              <p className="text-sm font-medium text-amber-900">
                {sent ? "Reviewed" : template.actionLabel}
              </p>
            </div>
            <p className="mt-2 text-xs leading-5 text-amber-800">
              {sent
                ? "The first trust boundary happened here. The worker showed its work before taking the real action."
                : "This is where the worker checks with you before doing anything important."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FirstRunPrototype() {
  const defaultTemplate = templates[0]!;
  const [stage, setStage] = useState<Stage>("landing");
  const [selectedId, setSelectedId] = useState<TemplateId>("follow-up");
  const [context, setContext] = useState(defaultTemplate.sampleText);
  const [usedSample, setUsedSample] = useState(true);

  const template = useMemo(
    () => templates.find((item) => item.id === selectedId) ?? defaultTemplate,
    [defaultTemplate, selectedId],
  );

  const stepIndex =
    stage === "landing" ? 0 : stage === "role" ? 1 : stage === "context" ? 2 : stage === "output" ? 3 : 4;

  const useTemplate = (id: TemplateId) => {
    const next = templates.find((item) => item.id === id) ?? defaultTemplate;
    setSelectedId(next.id);
    setContext(next.sampleText);
    setUsedSample(true);
    setStage("context");
  };

  if (stage === "landing") {
    return (
      <div className="grid gap-8 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="flex flex-col justify-center space-y-6">
          <div className="space-y-4">
            <TinyBadge>First-run prototype</TinyBadge>
            <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-foreground">
              Add AI teammates to your business.
            </h1>
            <p className="max-w-xl text-lg leading-8 text-muted-foreground">
              Pick a role. Give it context. It starts working and checks with you before doing anything important.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={() => setStage("role")}>
              Get started
            </Button>
            <Button size="lg" variant="outline" onClick={() => setStage("output")}>
              Try sample data
            </Button>
          </div>

          <div className="max-w-md">
            <HelpBubble>
              This flow is the product test: zero to useful output in under a minute.
            </HelpBubble>
          </div>
        </div>

        <MiniShell template={template} context={context} sent={false} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-border/70 bg-background px-5 py-4 shadow-sm">
        <StepPill number={1} label="Pick a role" active={stepIndex === 1} complete={stepIndex > 1} />
        <StepPill number={2} label="Add context" active={stepIndex === 2} complete={stepIndex > 2} />
        <StepPill number={3} label="See the result" active={stepIndex === 3} complete={stepIndex > 3} />
        <StepPill number={4} label="Review the action" active={stepIndex === 4} complete={stepIndex > 4} />
      </div>

      {stage === "role" ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Pick a teammate</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Start with a role, not a blank canvas.
              </p>
            </div>
            <div className="max-w-xs">
              <HelpBubble>Templates should explain outcomes, not technical setup.</HelpBubble>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {templates.map((item) => (
              <TemplateCard
                key={item.id}
                template={item}
                selected={item.id === selectedId}
                onSelect={() => useTemplate(item.id)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {stage === "context" ? (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">What should it know?</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Fastest path first: paste text, upload one file, or use sample data.
                </p>
              </div>
              <div className="max-w-xs">
                <HelpBubble>Make the first run about context, not OAuth and settings.</HelpBubble>
              </div>
            </div>

            <Card className="rounded-3xl border-border/70 shadow-sm">
              <CardContent className="space-y-5 p-5">
                <div>
                  <p className="text-sm font-medium text-foreground">{template.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={usedSample ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setContext(template.sampleText);
                      setUsedSample(true);
                    }}
                  >
                    Use sample data
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setContext("")}>
                    Paste your own notes
                  </Button>
                  <Button variant="outline" size="sm">Upload one file</Button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {template.sourcePrompt}
                  </p>
                  <Textarea
                    value={context}
                    onChange={(event) => {
                      setContext(event.target.value);
                      setUsedSample(false);
                    }}
                    className="min-h-[180px] resize-none rounded-2xl border-border/70 bg-[#fcfbf7] text-sm leading-6"
                    placeholder={`Paste ${template.shortName.toLowerCase()} context here...`}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Review posture</p>
                    <p className="text-xs text-muted-foreground">Default first-run safety</p>
                  </div>
                  <TinyBadge>
                    {template.id === "proposal" ? "Ask before saving externally" : "Ask before sending"}
                  </TinyBadge>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => setStage("role")}>
                    Back
                  </Button>
                  <Button onClick={() => setStage("output")}>Start working</Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <MiniShell template={template} context={context} sent={false} />
        </div>
      ) : null}

      {stage === "output" ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">It started working</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                No blank chat. No extra setup step. The first useful output is already here.
              </p>
            </div>
            <div className="max-w-xs">
              <HelpBubble>The magic moment is immediate useful output, not successful configuration.</HelpBubble>
            </div>
          </div>

          <MiniShell template={template} context={context} sent={false} />

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setStage("context")}>
              Edit context
            </Button>
            <Button onClick={() => setStage("sent")}>{template.actionLabel}</Button>
          </div>
        </div>
      ) : null}

      {stage === "sent" ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Reviewed and done</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                The worker did the work, then checked with you before the real action.
              </p>
            </div>
            <div className="max-w-xs">
              <HelpBubble>Trust should feel like a clean review moment, not bureaucracy.</HelpBubble>
            </div>
          </div>

          <MiniShell template={template} context={context} sent />

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setStage("output")}>
              Back to result
            </Button>
            <Button onClick={() => setStage("role")}>Try another role</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
