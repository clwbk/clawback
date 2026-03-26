"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/use-session";

export function AddConnectorButton() {
  const { session, loading } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rootPath, setRootPath] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = session?.membership.role === "admin";

  if (loading || !isAdmin) {
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !rootPath.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": session!.csrf_token,
        },
        body: JSON.stringify({
          name: name.trim(),
          type: "local_directory",
          config: {
            root_path: rootPath.trim(),
            recursive: true,
            include_extensions: [".md", ".mdx", ".txt", ".text", ".json", ".yaml", ".yml", ".csv", ".html"],
          },
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Request failed (${res.status})`);
      }

      setOpen(false);
      setName("");
      setRootPath("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create connector");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add connector</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add local directory connector</DialogTitle>
            <DialogDescription>
              Index files from a local directory for document retrieval. Only the local_directory type is supported.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="connector-name">Name</Label>
              <Input
                id="connector-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Company Docs"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="connector-root-path">Root path</Label>
              <Input
                id="connector-root-path"
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
                placeholder="e.g. ./docs or /absolute/path/to/docs"
                required
              />
              <p className="text-xs text-muted-foreground">
                Path to the directory containing documents to index. Supports .md, .txt, .json, .yaml, .csv, and .html files.
              </p>
            </div>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim() || !rootPath.trim()}>
              {submitting ? "Creating..." : "Create connector"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
