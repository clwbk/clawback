"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getControlPlaneUrl } from "@/lib/control-plane";
import { StatusDot } from "@/components/shared/status-dot";

type SystemStatus = "checking" | "connected" | "failed";

export function SetupForm() {
  const router = useRouter();
  const [systemStatus, setSystemStatus] = useState<SystemStatus>("checking");
  const [bootstrapped, setBootstrapped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(getControlPlaneUrl("/api/setup/status"), {
          credentials: "include",
        });
        if (!response.ok) {
          setSystemStatus("failed");
          return;
        }
        const data = (await response.json()) as { bootstrapped: boolean };
        setBootstrapped(data.bootstrapped);
        setSystemStatus("connected");
      } catch {
        setSystemStatus("failed");
      }
    })();
  }, []);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const payload = {
      workspace_name: String(formData.get("workspace_name") ?? ""),
      workspace_slug: String(formData.get("workspace_slug") ?? ""),
      email: String(formData.get("email") ?? ""),
      display_name: String(formData.get("display_name") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    try {
      const response = await fetch(getControlPlaneUrl("/api/setup/bootstrap-admin"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Bootstrap failed.");
        setPending(false);
        return;
      }

      setPending(false);
      startTransition(() => {
        router.push("/workspace");
      });
    } catch {
      setError("Network error. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Set up your workspace
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create the first admin account for this deployment. After bootstrap, the rest of the
          pilot setup happens inside the real workspace shell.
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <StatusDot status={systemStatus} />
        <span>
          {systemStatus === "connected"
            ? "System: Connected"
            : systemStatus === "failed"
              ? "System: Unreachable"
              : "System: Checking..."}
        </span>
      </div>

      {bootstrapped ? (
        <div className="rounded-md border border-green-800/30 bg-green-950/40 px-4 py-3 text-sm text-green-400">
          This deployment is already bootstrapped. Use the login screen instead.
        </div>
      ) : (
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workspace_name">Workspace name</Label>
            <Input
              id="workspace_name"
              name="workspace_name"
              placeholder="Acme Inc."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace_slug">Workspace slug</Label>
            <Input
              id="workspace_slug"
              name="workspace_slug"
              placeholder="acme"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Admin email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="admin@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              name="display_name"
              placeholder="Admin User"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
            />
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <div className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            Fresh install checklist:
            <span className="block mt-1">
              1. Create the admin here. 2. Open Connections and validate Gmail read-only.
              3. Install workers. 4. Run the pilot verification scripts.
            </span>
          </div>

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating..." : "Create Admin Account"}
          </Button>
        </form>
      )}
    </div>
  );
}
