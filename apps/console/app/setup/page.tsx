import { Card, CardContent } from "@/components/ui/card";
import { SetupForm } from "@/components/onboarding/setup-form";

export default function SetupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="w-full">
          <CardContent className="pt-6">
            <SetupForm />
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardContent className="space-y-5 pt-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                What happens next
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-foreground">
                First admin bootstrap is only step one
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                After this page creates the first admin account, Clawback redirects into the real
                workspace shell. The pilot setup path then continues inside the product.
              </p>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-background/70 p-3">
                <p className="text-sm font-medium text-foreground">1. Connect Gmail read-only</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Validate Google credentials, pick the pilot scope, and attach eligible workers.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background/70 p-3">
                <p className="text-sm font-medium text-foreground">2. Install workers</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Install the Follow-Up or Proposal packs, assign people, and confirm action
                  posture on the worker detail page.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background/70 p-3">
                <p className="text-sm font-medium text-foreground">3. Verify the real flows</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Test forwarded email, watched inbox shadow suggestions, and reviewed SMTP send
                  before inviting a pilot team.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Helpful scripts
              </p>
              <pre className="mt-3 overflow-x-auto text-xs text-foreground">
{`./scripts/test-forward-email.sh
./scripts/test-watched-inbox.sh
./scripts/test-smtp-send.sh
./scripts/pilot-verify.sh`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
