import { describe, expect, it } from "vitest";

import {
  buildReplyDraft,
  buildReplySubject,
  guessNameFromEmail,
  guessNameFromSender,
} from "./email-draft.js";

describe("email draft helpers", () => {
  it("derives a readable name from a plain email address", () => {
    expect(guessNameFromEmail("otto.von-wachter@example.com")).toBe("Otto Von Wachter");
  });

  it("prefers the display name from a full From header", () => {
    expect(guessNameFromSender("Otto von Wachter <vonwao@gmail.com>")).toBe("Otto von Wachter");
  });

  it("keeps existing reply prefixes intact", () => {
    expect(buildReplySubject("Re: Hello")).toBe("Re: Hello");
    expect(buildReplySubject("Hello")).toBe("Re: Hello");
  });

  it("builds a proactive draft without leaking source message text into the reply body", () => {
    const draft = buildReplyDraft({
      from: "Otto von Wachter <vonwao@gmail.com>",
      subject: "Hello!!",
      bodyText: "Testing. Hey clawback agent, can you send me a reply? Thanks.",
      proactive: true,
    });

    expect(draft.to).toBe("Otto von Wachter <vonwao@gmail.com>");
    expect(draft.subject).toBe("Re: Hello!!");
    expect(draft.body).toContain("Hi Otto von Wachter,");
    expect(draft.body).toContain('Thanks for your note about "Hello!!".');
    expect(draft.body).not.toContain("Testing. Hey clawback agent");
    expect(draft.body).not.toContain("I reviewed");
  });
});
