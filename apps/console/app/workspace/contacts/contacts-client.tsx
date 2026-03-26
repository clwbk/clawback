"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  createWorkspaceContact,
  updateWorkspaceContact,
  createWorkspaceAccount,
  updateWorkspaceAccount,
  type ContactRecord,
  type AccountRecord,
} from "@/lib/control-plane";
import { useSession } from "@/hooks/use-session";
import { humanizeLabel } from "../_lib/presentation";

const RELATIONSHIP_OPTIONS = [
  { value: "", label: "None" },
  { value: "customer", label: "Customer" },
  { value: "prospect", label: "Prospect" },
  { value: "vendor", label: "Vendor" },
  { value: "internal", label: "Internal" },
  { value: "blocked", label: "Blocked" },
  { value: "unknown", label: "Unknown" },
];

type PersonEntry = { id: string; name: string };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type ContactsClientProps = {
  contacts: ContactRecord[];
  accounts: AccountRecord[];
  accountMap: Record<string, AccountRecord>;
  people: PersonEntry[];
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ContactsClient({
  contacts: initialContacts,
  accounts: initialAccounts,
  accountMap,
  people,
}: ContactsClientProps) {
  const [tab, setTab] = useState<"contacts" | "accounts">("contacts");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "contacts" | "accounts")}>
      <TabsList>
        <TabsTrigger value="contacts">
          Contacts{initialContacts.length > 0 ? ` (${initialContacts.length})` : ""}
        </TabsTrigger>
        <TabsTrigger value="accounts">
          Accounts{initialAccounts.length > 0 ? ` (${initialAccounts.length})` : ""}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="contacts" className="mt-4 space-y-4">
        <ContactList
          contacts={initialContacts}
          accountMap={accountMap}
          people={people}
          accounts={initialAccounts}
        />
      </TabsContent>

      <TabsContent value="accounts" className="mt-4 space-y-4">
        <AccountList accounts={initialAccounts} people={people} />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Contact list
// ---------------------------------------------------------------------------

function ContactList({
  contacts,
  accountMap,
  people,
  accounts,
}: {
  contacts: ContactRecord[];
  accountMap: Record<string, AccountRecord>;
  people: PersonEntry[];
  accounts: AccountRecord[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(contacts[0]?.id ?? null);
  const [showCreate, setShowCreate] = useState(false);
  const selected = contacts.find((c) => c.id === selectedId) ?? null;

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {contacts.length === 0
            ? "No contacts yet. Create one to start building relationship memory."
            : `${contacts.length} contact${contacts.length === 1 ? "" : "s"}`}
        </p>
        <Button variant="outline" size="sm" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "Add contact"}
        </Button>
      </div>

      {showCreate ? (
        <ContactForm
          accounts={accounts}
          people={people}
          onDone={() => setShowCreate(false)}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {contacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => setSelectedId(contact.id)}
                    className={[
                      "block w-full p-4 text-left transition-colors hover:bg-muted/50",
                      selectedId === contact.id ? "bg-muted/50" : "",
                    ].join(" ")}
                  >
                    <p className="text-sm font-medium text-foreground">
                      {contact.display_name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {contact.primary_email}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {contact.relationship_class ? (
                        <Badge variant="outline" className="text-[10px]">
                          {humanizeLabel(contact.relationship_class)}
                        </Badge>
                      ) : null}
                      {contact.do_not_auto_reply ? (
                        <Badge variant="destructive" className="text-[10px]">
                          no auto-reply
                        </Badge>
                      ) : null}
                      {contact.account_id && accountMap[contact.account_id] ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {accountMap[contact.account_id]!.name}
                        </Badge>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          {selected ? (
            <ContactDetailPanel
              contact={selected}
              accountMap={accountMap}
              people={people}
              accounts={accounts}
            />
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">
                  {contacts.length === 0
                    ? "Add a contact to see details here."
                    : "Select a contact to view and edit."}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Contact detail + inline edit
// ---------------------------------------------------------------------------

function ContactDetailPanel({
  contact,
  accountMap,
  people,
  accounts,
}: {
  contact: ContactRecord;
  accountMap: Record<string, AccountRecord>;
  people: PersonEntry[];
  accounts: AccountRecord[];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ContactEditForm
        contact={contact}
        accounts={accounts}
        people={people}
        onDone={() => setEditing(false)}
      />
    );
  }

  const account = contact.account_id ? accountMap[contact.account_id] : null;
  const ownerName = contact.owner_user_id
    ? people.find((p) => p.id === contact.owner_user_id)?.name ?? contact.owner_user_id
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{contact.display_name}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Detail label="Email" value={contact.primary_email} />
          <Detail label="Relationship" value={contact.relationship_class ? humanizeLabel(contact.relationship_class) : "Not set"} />
          <Detail label="Account" value={account?.name ?? "None"} />
          <Detail label="Owner" value={ownerName ?? "Unassigned"} />
        </div>

        <div className="flex flex-wrap gap-2">
          {contact.do_not_auto_reply ? (
            <Badge variant="destructive">Do not auto-reply</Badge>
          ) : (
            <Badge variant="outline">Auto-reply allowed</Badge>
          )}
        </div>

        {contact.handling_note ? (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Handling note</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{contact.handling_note}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Contact create form
// ---------------------------------------------------------------------------

function ContactForm({
  accounts,
  people,
  onDone,
}: {
  accounts: AccountRecord[];
  people: PersonEntry[];
  onDone: () => void;
}) {
  const { session } = useSession();
  const csrfToken = session?.csrf_token ?? null;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    try {
      await createWorkspaceContact({
        csrfToken: csrfToken ?? "",
        primary_email: form.get("primary_email") as string,
        display_name: form.get("display_name") as string,
        account_id: (form.get("account_id") as string) || null,
        relationship_class: (form.get("relationship_class") as string) || null,
        owner_user_id: (form.get("owner_user_id") as string) || null,
        handling_note: (form.get("handling_note") as string) || null,
        do_not_auto_reply: form.get("do_not_auto_reply") === "on",
      });
      startTransition(() => {
        router.refresh();
        onDone();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create contact.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New contact</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="display_name">Name</Label>
              <Input id="display_name" name="display_name" required />
            </div>
            <div>
              <Label htmlFor="primary_email">Email</Label>
              <Input id="primary_email" name="primary_email" type="email" required />
            </div>
            <div>
              <Label htmlFor="relationship_class">Relationship</Label>
              <select
                id="relationship_class"
                name="relationship_class"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="account_id">Account</Label>
              <select
                id="account_id"
                name="account_id"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">None</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="owner_user_id">Owner</Label>
              <select
                id="owner_user_id"
                name="owner_user_id"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Unassigned</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="do_not_auto_reply" name="do_not_auto_reply" />
              <Label htmlFor="do_not_auto_reply" className="text-sm">Do not auto-reply</Label>
            </div>
          </div>
          <div>
            <Label htmlFor="handling_note">Handling note</Label>
            <Textarea id="handling_note" name="handling_note" rows={2} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Creating..." : "Create contact"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Contact edit form
// ---------------------------------------------------------------------------

function ContactEditForm({
  contact,
  accounts,
  people,
  onDone,
}: {
  contact: ContactRecord;
  accounts: AccountRecord[];
  people: PersonEntry[];
  onDone: () => void;
}) {
  const { session } = useSession();
  const csrfToken = session?.csrf_token ?? null;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    try {
      await updateWorkspaceContact(contact.id, {
        csrfToken: csrfToken ?? "",
        display_name: form.get("display_name") as string,
        primary_email: form.get("primary_email") as string,
        account_id: (form.get("account_id") as string) || null,
        relationship_class: (form.get("relationship_class") as string) || null,
        owner_user_id: (form.get("owner_user_id") as string) || null,
        handling_note: (form.get("handling_note") as string) || null,
        do_not_auto_reply: form.get("do_not_auto_reply") === "on",
      });
      startTransition(() => {
        router.refresh();
        onDone();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update contact.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Edit {contact.display_name}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="edit_display_name">Name</Label>
              <Input id="edit_display_name" name="display_name" defaultValue={contact.display_name} required />
            </div>
            <div>
              <Label htmlFor="edit_primary_email">Email</Label>
              <Input id="edit_primary_email" name="primary_email" type="email" defaultValue={contact.primary_email} required />
            </div>
            <div>
              <Label htmlFor="edit_relationship_class">Relationship</Label>
              <select
                id="edit_relationship_class"
                name="relationship_class"
                defaultValue={contact.relationship_class ?? ""}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="edit_account_id">Account</Label>
              <select
                id="edit_account_id"
                name="account_id"
                defaultValue={contact.account_id ?? ""}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">None</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="edit_owner_user_id">Owner</Label>
              <select
                id="edit_owner_user_id"
                name="owner_user_id"
                defaultValue={contact.owner_user_id ?? ""}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Unassigned</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="edit_do_not_auto_reply"
                name="do_not_auto_reply"
                defaultChecked={contact.do_not_auto_reply}
              />
              <Label htmlFor="edit_do_not_auto_reply" className="text-sm">Do not auto-reply</Label>
            </div>
          </div>
          <div>
            <Label htmlFor="edit_handling_note">Handling note</Label>
            <Textarea
              id="edit_handling_note"
              name="handling_note"
              rows={2}
              defaultValue={contact.handling_note ?? ""}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Account list
// ---------------------------------------------------------------------------

function AccountList({
  accounts,
  people,
}: {
  accounts: AccountRecord[];
  people: PersonEntry[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(accounts[0]?.id ?? null);
  const [showCreate, setShowCreate] = useState(false);
  const selected = accounts.find((a) => a.id === selectedId) ?? null;

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {accounts.length === 0
            ? "No accounts yet. Create one to enable domain-level sender resolution."
            : `${accounts.length} account${accounts.length === 1 ? "" : "s"}`}
        </p>
        <Button variant="outline" size="sm" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "Add account"}
        </Button>
      </div>

      {showCreate ? (
        <AccountForm people={people} onDone={() => setShowCreate(false)} />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => setSelectedId(account.id)}
                    className={[
                      "block w-full p-4 text-left transition-colors hover:bg-muted/50",
                      selectedId === account.id ? "bg-muted/50" : "",
                    ].join(" ")}
                  >
                    <p className="text-sm font-medium text-foreground">{account.name}</p>
                    {account.primary_domain ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {account.primary_domain}
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {account.relationship_class ? (
                        <Badge variant="outline" className="text-[10px]">
                          {humanizeLabel(account.relationship_class)}
                        </Badge>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          {selected ? (
            <AccountDetailPanel account={selected} people={people} />
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">
                  {accounts.length === 0
                    ? "Add an account to see details here."
                    : "Select an account to view and edit."}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Account detail
// ---------------------------------------------------------------------------

function AccountDetailPanel({
  account,
  people,
}: {
  account: AccountRecord;
  people: PersonEntry[];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <AccountEditForm
        account={account}
        people={people}
        onDone={() => setEditing(false)}
      />
    );
  }

  const ownerName = account.owner_user_id
    ? people.find((p) => p.id === account.owner_user_id)?.name ?? account.owner_user_id
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{account.name}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Detail label="Domain" value={account.primary_domain ?? "Not set"} />
          <Detail label="Relationship" value={account.relationship_class ? humanizeLabel(account.relationship_class) : "Not set"} />
          <Detail label="Owner" value={ownerName ?? "Unassigned"} />
        </div>
        {account.handling_note ? (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Handling note</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{account.handling_note}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Account create form
// ---------------------------------------------------------------------------

function AccountForm({
  people,
  onDone,
}: {
  people: PersonEntry[];
  onDone: () => void;
}) {
  const { session } = useSession();
  const csrfToken = session?.csrf_token ?? null;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    try {
      await createWorkspaceAccount({
        csrfToken: csrfToken ?? "",
        name: form.get("name") as string,
        primary_domain: (form.get("primary_domain") as string) || null,
        relationship_class: (form.get("relationship_class") as string) || null,
        owner_user_id: (form.get("owner_user_id") as string) || null,
        handling_note: (form.get("handling_note") as string) || null,
      });
      startTransition(() => {
        router.refresh();
        onDone();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New account</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="acc_name">Name</Label>
              <Input id="acc_name" name="name" required />
            </div>
            <div>
              <Label htmlFor="acc_primary_domain">Domain</Label>
              <Input id="acc_primary_domain" name="primary_domain" placeholder="e.g. acme.com" />
            </div>
            <div>
              <Label htmlFor="acc_relationship_class">Relationship</Label>
              <select
                id="acc_relationship_class"
                name="relationship_class"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="acc_owner_user_id">Owner</Label>
              <select
                id="acc_owner_user_id"
                name="owner_user_id"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Unassigned</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="acc_handling_note">Handling note</Label>
            <Textarea id="acc_handling_note" name="handling_note" rows={2} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Creating..." : "Create account"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Account edit form
// ---------------------------------------------------------------------------

function AccountEditForm({
  account,
  people,
  onDone,
}: {
  account: AccountRecord;
  people: PersonEntry[];
  onDone: () => void;
}) {
  const { session } = useSession();
  const csrfToken = session?.csrf_token ?? null;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    try {
      await updateWorkspaceAccount(account.id, {
        csrfToken: csrfToken ?? "",
        name: form.get("name") as string,
        primary_domain: (form.get("primary_domain") as string) || null,
        relationship_class: (form.get("relationship_class") as string) || null,
        owner_user_id: (form.get("owner_user_id") as string) || null,
        handling_note: (form.get("handling_note") as string) || null,
      });
      startTransition(() => {
        router.refresh();
        onDone();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update account.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Edit {account.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="edit_acc_name">Name</Label>
              <Input id="edit_acc_name" name="name" defaultValue={account.name} required />
            </div>
            <div>
              <Label htmlFor="edit_acc_primary_domain">Domain</Label>
              <Input id="edit_acc_primary_domain" name="primary_domain" defaultValue={account.primary_domain ?? ""} />
            </div>
            <div>
              <Label htmlFor="edit_acc_relationship_class">Relationship</Label>
              <select
                id="edit_acc_relationship_class"
                name="relationship_class"
                defaultValue={account.relationship_class ?? ""}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="edit_acc_owner_user_id">Owner</Label>
              <select
                id="edit_acc_owner_user_id"
                name="owner_user_id"
                defaultValue={account.owner_user_id ?? ""}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Unassigned</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="edit_acc_handling_note">Handling note</Label>
            <Textarea
              id="edit_acc_handling_note"
              name="handling_note"
              rows={2}
              defaultValue={account.handling_note ?? ""}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Detail helper
// ---------------------------------------------------------------------------

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
