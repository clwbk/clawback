import { describe, it, expect } from "vitest";
import {
  SenderResolutionService,
  type ContactForResolution,
  type AccountForResolution,
  type ContactLookup,
  type AccountLookup,
} from "./service.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const WORKSPACE = "ws_test_01";

const CONTACT_SARAH: ContactForResolution = {
  id: "cot_sarah_01",
  accountId: "acc_acme_01",
  relationshipClass: "customer",
  ownerUserId: "usr_dave_01",
  handlingNote: "Key account, handle with care",
  doNotAutoReply: false,
};

const CONTACT_BLOCKED: ContactForResolution = {
  id: "cot_blocked_01",
  accountId: null,
  relationshipClass: "blocked",
  ownerUserId: null,
  handlingNote: null,
  doNotAutoReply: true,
};

const ACCOUNT_ACME: AccountForResolution = {
  id: "acc_acme_01",
  primaryDomain: "acmecorp.com",
  relationshipClass: "customer",
  ownerUserId: "usr_dave_01",
  handlingNote: "Acme Corp - Q3 renewal pending",
};

const ACCOUNT_GLOBEX: AccountForResolution = {
  id: "acc_globex_01",
  primaryDomain: "globex.io",
  relationshipClass: "prospect",
  ownerUserId: "usr_emma_01",
  handlingNote: null,
};

// ---------------------------------------------------------------------------
// Fake lookups
// ---------------------------------------------------------------------------

function fakeContactLookup(contacts: Map<string, ContactForResolution>): ContactLookup {
  return {
    async findByEmail(_workspaceId: string, email: string) {
      return contacts.get(email.toLowerCase()) ?? null;
    },
  };
}

function fakeAccountLookup(
  byId: Map<string, AccountForResolution>,
  byDomain: Map<string, AccountForResolution>,
): AccountLookup {
  return {
    async findById(_workspaceId: string, id: string) {
      return byId.get(id) ?? null;
    },
    async findByDomain(_workspaceId: string, domain: string) {
      return byDomain.get(domain.toLowerCase()) ?? null;
    },
  };
}

function createService(opts?: {
  contacts?: Map<string, ContactForResolution>;
  accountsById?: Map<string, AccountForResolution>;
  accountsByDomain?: Map<string, AccountForResolution>;
  internalDomains?: string[];
}) {
  return new SenderResolutionService({
    contactLookup: fakeContactLookup(opts?.contacts ?? new Map()),
    accountLookup: fakeAccountLookup(
      opts?.accountsById ?? new Map(),
      opts?.accountsByDomain ?? new Map(),
    ),
    internalDomains: opts?.internalDomains,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SenderResolutionService", () => {
  it("resolves exact contact with linked account", async () => {
    const service = createService({
      contacts: new Map([["sarah@acmecorp.com", CONTACT_SARAH]]),
      accountsById: new Map([["acc_acme_01", ACCOUNT_ACME]]),
    });

    const result = await service.resolve(WORKSPACE, "sarah@acmecorp.com");

    expect(result.resolution_method).toBe("exact_contact");
    expect(result.contact_id).toBe("cot_sarah_01");
    expect(result.account_id).toBe("acc_acme_01");
    expect(result.relationship_class).toBe("customer");
    expect(result.owner_user_id).toBe("usr_dave_01");
    expect(result.handling_note).toBe("Key account, handle with care");
    expect(result.do_not_auto_reply).toBe(false);
  });

  it("resolves exact contact without linked account", async () => {
    const contactNoAccount: ContactForResolution = {
      ...CONTACT_SARAH,
      accountId: null,
    };
    const service = createService({
      contacts: new Map([["sarah@acmecorp.com", contactNoAccount]]),
    });

    const result = await service.resolve(WORKSPACE, "sarah@acmecorp.com");

    expect(result.resolution_method).toBe("exact_contact");
    expect(result.contact_id).toBe("cot_sarah_01");
    expect(result.account_id).toBeNull();
    expect(result.relationship_class).toBe("customer");
  });

  it("contact relationship takes precedence over account relationship", async () => {
    const contactProspect: ContactForResolution = {
      ...CONTACT_SARAH,
      relationshipClass: "prospect",
      accountId: "acc_acme_01",
    };
    const service = createService({
      contacts: new Map([["sarah@acmecorp.com", contactProspect]]),
      accountsById: new Map([["acc_acme_01", { ...ACCOUNT_ACME, relationshipClass: "customer" }]]),
    });

    const result = await service.resolve(WORKSPACE, "sarah@acmecorp.com");

    expect(result.relationship_class).toBe("prospect");
  });

  it("falls through to account domain match when no contact exists", async () => {
    const service = createService({
      accountsByDomain: new Map([["globex.io", ACCOUNT_GLOBEX]]),
    });

    const result = await service.resolve(WORKSPACE, "unknown@globex.io");

    expect(result.resolution_method).toBe("account_domain");
    expect(result.contact_id).toBeNull();
    expect(result.account_id).toBe("acc_globex_01");
    expect(result.relationship_class).toBe("prospect");
    expect(result.owner_user_id).toBe("usr_emma_01");
  });

  it("resolves internal domain", async () => {
    const service = createService({
      internalDomains: ["agenthands.io"],
    });

    const result = await service.resolve(WORKSPACE, "coworker@agenthands.io");

    expect(result.resolution_method).toBe("internal_domain");
    expect(result.relationship_class).toBe("internal");
    expect(result.contact_id).toBeNull();
    expect(result.account_id).toBeNull();
  });

  it("returns none when nothing matches", async () => {
    const service = createService();

    const result = await service.resolve(WORKSPACE, "stranger@random.com");

    expect(result.resolution_method).toBe("none");
    expect(result.relationship_class).toBe("unknown");
    expect(result.contact_id).toBeNull();
    expect(result.account_id).toBeNull();
    expect(result.do_not_auto_reply).toBe(false);
  });

  it("honors do_not_auto_reply on contact", async () => {
    const service = createService({
      contacts: new Map([["spammer@bad.com", CONTACT_BLOCKED]]),
    });

    const result = await service.resolve(WORKSPACE, "spammer@bad.com");

    expect(result.do_not_auto_reply).toBe(true);
    expect(result.relationship_class).toBe("blocked");
  });

  it("normalizes email case", async () => {
    const service = createService({
      contacts: new Map([["sarah@acmecorp.com", CONTACT_SARAH]]),
      accountsById: new Map([["acc_acme_01", ACCOUNT_ACME]]),
    });

    const result = await service.resolve(WORKSPACE, "Sarah@AcmeCorp.com");

    expect(result.resolution_method).toBe("exact_contact");
    expect(result.contact_id).toBe("cot_sarah_01");
  });

  it("account domain match does not set do_not_auto_reply", async () => {
    const service = createService({
      accountsByDomain: new Map([["acmecorp.com", ACCOUNT_ACME]]),
    });

    const result = await service.resolve(WORKSPACE, "new-person@acmecorp.com");

    expect(result.do_not_auto_reply).toBe(false);
  });
});
