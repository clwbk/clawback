"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getControlPlaneUrl } from "@/lib/control-plane";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const demoGuideHref = process.env.NEXT_PUBLIC_PUBLIC_DEMO_MODE === "true"
    ? "/docs/public-demo"
    : "/docs/demo-walkthrough";
  const demoGuideText = process.env.NEXT_PUBLIC_PUBLIC_DEMO_MODE === "true"
    ? "for the public evaluator path and access details."
    : "for the recommended path and demo guidance.";

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(getControlPlaneUrl("/api/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(formData.get("email") ?? ""),
          password: String(formData.get("password") ?? ""),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Login failed.");
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
          Sign in to Clawback
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your credentials to access your workspace.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Trying the shared demo?{" "}
          <a
            href={demoGuideHref}
            className="font-medium text-foreground underline underline-offset-2"
          >
            Open the guide
          </a>{" "}
          {demoGuideText}
        </p>
      </div>

      <form action={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
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

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
