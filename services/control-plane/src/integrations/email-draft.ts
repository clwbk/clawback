function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function guessNameFromEmail(address: string) {
  const localPart = address.trim().split("@")[0] ?? "";
  const cleaned = localPart.replace(/[._-]+/g, " ").trim();
  return cleaned ? titleCase(cleaned) : "there";
}

export function guessNameFromSender(sender: string) {
  const trimmed = sender.trim();
  const displayNameMatch = trimmed.match(/^(.*?)\s*<[^>]+>$/);
  if (displayNameMatch?.[1]) {
    const displayName = displayNameMatch[1].trim().replace(/^["']|["']$/g, "");
    return displayName.length > 0 ? displayName : "there";
  }

  const emailMatch = trimmed.match(/<([^>]+)>/);
  if (emailMatch?.[1]) {
    return guessNameFromEmail(emailMatch[1]);
  }

  if (trimmed.includes("@")) {
    return guessNameFromEmail(trimmed);
  }

  return trimmed.length > 0 ? trimmed : "there";
}

export function buildReplySubject(subject: string) {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

export function buildReplyDraft(params: {
  from: string;
  subject: string;
  bodyText?: string | null;
  threadSummary?: string | null;
  proactive?: boolean;
}) {
  const recipientName = guessNameFromSender(params.from);
  const replySubject = buildReplySubject(params.subject);

  const draftBody = [
    `Hi ${recipientName},`,
    "",
    `Thanks for your note about "${params.subject}".`,
    params.proactive
      ? "I drafted this proactively from recent inbox activity and can adjust the wording before anything goes out."
      : "I drafted a quick follow-up based on your message and can adjust the tone or details if needed.",
    "",
    "Best,",
    "Clawback team",
  ].join("\n");

  return {
    to: params.from,
    subject: replySubject,
    body: draftBody,
  };
}
