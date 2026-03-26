import { Card, CardContent } from "@/components/ui/card";
import { InviteClaimForm } from "./invite-claim-form";

type InviteClaimPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function InviteClaimPage({ params }: InviteClaimPageProps) {
  const { token } = await params;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Join Workspace
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Set your display name and password to complete your invitation.
              </p>
            </div>
            <InviteClaimForm token={token} />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
