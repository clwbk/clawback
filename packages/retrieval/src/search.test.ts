import { describe, expect, it } from "vitest";

import {
  buildCitationSnippet,
  buildRetrievalAugmentedPrompt,
  buildRetrievalQueryTokens,
} from "./search.js";

describe("buildRetrievalQueryTokens", () => {
  it("normalizes punctuation-heavy queries into safe search tokens", () => {
    expect(buildRetrievalQueryTokens("Why did checkout-api fail after OPS-241?")).toEqual([
      "checkout",
      "api",
      "fail",
      "ops",
      "241",
    ]);
  });

  it("removes stopwords and single-character tokens", () => {
    expect(buildRetrievalQueryTokens("what is the budget for a new project?")).toEqual([
      "budget",
      "new",
      "project",
    ]);
  });

  it("deduplicates repeated tokens", () => {
    expect(buildRetrievalQueryTokens("api api api")).toEqual(["api"]);
  });

  it("returns empty array for all-stopword input", () => {
    expect(buildRetrievalQueryTokens("what is the")).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(buildRetrievalQueryTokens("")).toEqual([]);
  });
});

describe("buildCitationSnippet", () => {
  it("anchors the snippet around the matched query terms when possible", () => {
    const content = [
      "Overview text that is not very relevant to the user question and keeps going with setup detail that should not dominate the citation preview.",
      "More preface text about dashboards, handoffs, and observer notes before the diagnostic section appears.",
      "The likely cause was checkout-api retaining a stale primary target after payments-db failover.",
      "Additional notes follow after the diagnostic section.",
    ].join(" ");

    expect(buildCitationSnippet(content, "Why did checkout fail last night?")).toContain(
      "checkout-api retaining a stale primary target",
    );
    expect(buildCitationSnippet(content, "Why did checkout fail last night?").startsWith("...")).toBe(true);
  });

  it("returns empty string for empty content", () => {
    expect(buildCitationSnippet("", "some query")).toBe("");
  });

  it("returns empty string for whitespace-only content", () => {
    expect(buildCitationSnippet("   \n\t  ", "some query")).toBe("");
  });

  it("returns the full text when content is shorter than max length", () => {
    expect(buildCitationSnippet("Short answer.", "query")).toBe("Short answer.");
  });

  it("truncates from the start when no query token anchors in the content", () => {
    const content = "A".repeat(400);
    const snippet = buildCitationSnippet(content, "zzz_not_found");
    expect(snippet.endsWith("...")).toBe(true);
    expect(snippet.length).toBeLessThanOrEqual(284); // 280 + "..."
  });

  it("collapses internal whitespace to single spaces", () => {
    const snippet = buildCitationSnippet("word1   word2\n\nword3\tword4", "word1");
    expect(snippet).toBe("word1 word2 word3 word4");
  });

  it("respects custom maxLength", () => {
    const content = "alpha bravo charlie delta echo foxtrot golf hotel india";
    const snippet = buildCitationSnippet(content, "alpha", 20);
    expect(snippet.length).toBeLessThanOrEqual(24); // 20 + ellipsis
  });
});

describe("buildRetrievalAugmentedPrompt", () => {
  it("builds an explicit no-results fallback prompt", () => {
    expect(
      buildRetrievalAugmentedPrompt({
        question: "What is our snack budget policy?",
        results: [],
        status: "no_results",
      }),
    ).toContain("No matching workspace documents were found in the selected connector scope for this turn.");
  });

  it("builds an explicit retrieval-failure fallback prompt", () => {
    expect(
      buildRetrievalAugmentedPrompt({
        question: "What is our snack budget policy?",
        results: [],
        status: "failed",
      }),
    ).toContain("Workspace retrieval was unavailable for this turn.");
  });

  it("includes user question in failed prompt", () => {
    const prompt = buildRetrievalAugmentedPrompt({
      question: "What is the deploy runbook?",
      results: [],
      status: "failed",
    });
    expect(prompt).toContain("User question:");
    expect(prompt).toContain("What is the deploy runbook?");
  });

  it("includes user question in no_results prompt", () => {
    const prompt = buildRetrievalAugmentedPrompt({
      question: "What is the deploy runbook?",
      results: [],
      status: "no_results",
    });
    expect(prompt).toContain("User question:");
    expect(prompt).toContain("What is the deploy runbook?");
  });

  it("returns the bare question when status is applied but results are empty", () => {
    const prompt = buildRetrievalAugmentedPrompt({
      question: "Hello there",
      results: [],
      status: "applied",
    });
    expect(prompt).toBe("Hello there");
  });

  it("builds a context-augmented prompt for the applied branch with results", () => {
    const prompt = buildRetrievalAugmentedPrompt({
      question: "What is the deploy runbook?",
      results: [
        {
          title: "Deploy Guide",
          path_or_uri: "docs/deploy.md",
          content: "Step 1: run the migration script.",
        },
      ],
    });
    expect(prompt).toContain("Workspace context:");
    expect(prompt).toContain("[1] Deploy Guide (docs/deploy.md)");
    expect(prompt).toContain("Step 1: run the migration script.");
    expect(prompt).toContain("User question:");
    expect(prompt).toContain("What is the deploy runbook?");
  });

  it("formats results without a title using only the path", () => {
    const prompt = buildRetrievalAugmentedPrompt({
      question: "What is the deploy runbook?",
      results: [
        {
          title: null,
          path_or_uri: "docs/deploy.md",
          content: "Step 1: run the migration script.",
        },
      ],
    });
    expect(prompt).toContain("[1] docs/deploy.md");
    expect(prompt).not.toContain("null");
  });

  it("numbers multiple results sequentially", () => {
    const prompt = buildRetrievalAugmentedPrompt({
      question: "How do I onboard?",
      results: [
        { title: "Onboarding", path_or_uri: "onboarding.md", content: "Welcome!" },
        { title: "FAQ", path_or_uri: "faq.md", content: "Questions." },
        { title: null, path_or_uri: "misc/notes.md", content: "Notes." },
      ],
    });
    expect(prompt).toContain("[1] Onboarding (onboarding.md)");
    expect(prompt).toContain("[2] FAQ (faq.md)");
    expect(prompt).toContain("[3] misc/notes.md");
  });

  it("infers applied status when results are present and no explicit status given", () => {
    const prompt = buildRetrievalAugmentedPrompt({
      question: "Tell me about X.",
      results: [
        { title: "X", path_or_uri: "x.md", content: "X is great." },
      ],
    });
    expect(prompt).toContain("Workspace context:");
  });

  it("infers no_results status when results are empty and no explicit status given", () => {
    const prompt = buildRetrievalAugmentedPrompt({
      question: "Tell me about X.",
      results: [],
    });
    // With no status and empty results, the function returns bare question
    // because the inferred status is "no_results" but results.length === 0 triggers
    // the no_results branch
    expect(prompt).toContain("No matching workspace documents were found");
  });

  it("instructs the model to cite sources only from workspace context", () => {
    const prompt = buildRetrievalAugmentedPrompt({
      question: "Explain our SLA.",
      results: [
        { title: "SLA Doc", path_or_uri: "sla.md", content: "99.9% uptime." },
      ],
    });
    expect(prompt).toContain("Only cite source numbers when you rely on the provided workspace context.");
  });

  it("instructs the model not to invent facts in the failed branch", () => {
    const prompt = buildRetrievalAugmentedPrompt({
      question: "What about security?",
      results: [],
      status: "failed",
    });
    expect(prompt).toContain("Do not claim you checked workspace documents");
  });

  it("instructs the model not to imply grounding in the no_results branch", () => {
    const prompt = buildRetrievalAugmentedPrompt({
      question: "What about security?",
      results: [],
      status: "no_results",
    });
    expect(prompt).toContain("Do not imply workspace grounding or citations");
  });
});
