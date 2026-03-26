import {
  listWorkspaceContacts,
  listWorkspaceAccounts,
  listWorkspacePeople,
} from "@/lib/control-plane";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { humanizeLabel } from "../_lib/presentation";
import { ContactsClient } from "./contacts-client";

export default async function ContactsPage() {
  let contacts: Awaited<ReturnType<typeof listWorkspaceContacts>>["contacts"] = [];
  let accounts: Awaited<ReturnType<typeof listWorkspaceAccounts>>["accounts"] = [];
  let people: Map<string, string> = new Map();
  let errorMessage: string | null = null;

  try {
    const [contactResult, accountResult, peopleResult] = await Promise.all([
      listWorkspaceContacts(),
      listWorkspaceAccounts(),
      listWorkspacePeople(),
    ]);
    contacts = contactResult.contacts;
    accounts = accountResult.accounts;
    people = new Map(peopleResult.people.map((p) => [p.id, p.display_name]));
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Failed to load contacts.";
  }

  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const peopleEntries = Array.from(people.entries()).map(([id, name]) => ({ id, name }));

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Contacts & Accounts
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Relationship memory
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Known contacts, accounts, and their relationship context. This data
            informs triage decisions and routing suggestions.
          </p>
        </div>

        {errorMessage ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-destructive">{errorMessage}</p>
            </CardContent>
          </Card>
        ) : (
          <ContactsClient
            contacts={contacts}
            accounts={accounts}
            accountMap={Object.fromEntries(accountMap)}
            people={peopleEntries}
          />
        )}
      </div>
    </div>
  );
}
