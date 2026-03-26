/**
 * Sender Resolution Service (R2).
 *
 * Resolves an incoming email sender through shared workspace context
 * (contacts, accounts) before worker policy runs triage.
 *
 * This is a shared platform service — NOT a helper hidden in the Gmail
 * poller or a worker-specific module.
 *
 * Resolution precedence (from R0 freeze):
 *   1. Exact contact email match
 *   2. Linked contact → account
 *   3. Account domain match
 *   4. Workspace internal-domain hint
 *   5. Heuristic fallback (current triage defaults)
 *
 * @see docs/implementation/relationship-memory-r0-freeze.md
 */

import type { SenderResolution, RelationshipClass, ResolutionMethod } from "@clawback/contracts";

// ---------------------------------------------------------------------------
// Dependency interfaces (narrow, testable)
// ---------------------------------------------------------------------------

export type ContactForResolution = {
  id: string;
  accountId: string | null;
  relationshipClass: RelationshipClass | null;
  ownerUserId: string | null;
  handlingNote: string | null;
  doNotAutoReply: boolean;
};

export type AccountForResolution = {
  id: string;
  primaryDomain: string | null;
  relationshipClass: RelationshipClass | null;
  ownerUserId: string | null;
  handlingNote: string | null;
};

export interface ContactLookup {
  findByEmail(workspaceId: string, email: string): Promise<ContactForResolution | null>;
}

export interface AccountLookup {
  findById(workspaceId: string, id: string): Promise<AccountForResolution | null>;
  findByDomain(workspaceId: string, domain: string): Promise<AccountForResolution | null>;
}

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export type SenderResolutionServiceOptions = {
  contactLookup: ContactLookup;
  accountLookup: AccountLookup;
  /** Domains considered "internal" for this workspace (e.g., ["acme.com"]) */
  internalDomains?: string[] | undefined;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SenderResolutionService {
  constructor(private readonly options: SenderResolutionServiceOptions) {}

  async resolve(workspaceId: string, senderEmail: string): Promise<SenderResolution> {
    const email = senderEmail.trim().toLowerCase();
    const domain = extractDomain(email);

    // 1. Exact contact email match
    const contact = await this.options.contactLookup.findByEmail(workspaceId, email);
    if (contact) {
      // 2. If contact has a linked account, merge account context
      if (contact.accountId) {
        const account = await this.options.accountLookup.findById(workspaceId, contact.accountId);
        if (account) {
          return buildResolution({
            contactId: contact.id,
            accountId: account.id,
            // Contact relationship takes precedence over account
            relationshipClass: contact.relationshipClass ?? account.relationshipClass ?? "unknown",
            // Contact owner takes precedence over account owner
            ownerUserId: contact.ownerUserId ?? account.ownerUserId,
            handlingNote: contact.handlingNote ?? account.handlingNote,
            doNotAutoReply: contact.doNotAutoReply,
            method: "exact_contact",
          });
        }
      }

      return buildResolution({
        contactId: contact.id,
        accountId: null,
        relationshipClass: contact.relationshipClass ?? "unknown",
        ownerUserId: contact.ownerUserId,
        handlingNote: contact.handlingNote,
        doNotAutoReply: contact.doNotAutoReply,
        method: "exact_contact",
      });
    }

    // 3. Account domain match
    if (domain) {
      const account = await this.options.accountLookup.findByDomain(workspaceId, domain);
      if (account) {
        return buildResolution({
          contactId: null,
          accountId: account.id,
          relationshipClass: account.relationshipClass ?? "unknown",
          ownerUserId: account.ownerUserId,
          handlingNote: account.handlingNote,
          doNotAutoReply: false,
          method: "account_domain",
        });
      }
    }

    // 4. Workspace internal-domain hint
    const internalDomains = this.options.internalDomains ?? [];
    if (domain && internalDomains.some((d) => d.toLowerCase() === domain)) {
      return buildResolution({
        contactId: null,
        accountId: null,
        relationshipClass: "internal",
        ownerUserId: null,
        handlingNote: null,
        doNotAutoReply: false,
        method: "internal_domain",
      });
    }

    // 5. No match — fall through to triage heuristics
    return buildResolution({
      contactId: null,
      accountId: null,
      relationshipClass: "unknown",
      ownerUserId: null,
      handlingNote: null,
      doNotAutoReply: false,
      method: "none",
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractDomain(email: string): string | null {
  const atIndex = email.indexOf("@");
  if (atIndex < 0) return null;
  const domain = email.slice(atIndex + 1);
  return domain.length > 0 ? domain : null;
}

function buildResolution(params: {
  contactId: string | null;
  accountId: string | null;
  relationshipClass: RelationshipClass;
  ownerUserId: string | null;
  handlingNote: string | null;
  doNotAutoReply: boolean;
  method: ResolutionMethod;
}): SenderResolution {
  return {
    contact_id: params.contactId,
    account_id: params.accountId,
    relationship_class: params.relationshipClass,
    owner_user_id: params.ownerUserId,
    handling_note: params.handlingNote,
    do_not_auto_reply: params.doNotAutoReply,
    resolution_method: params.method,
  };
}
