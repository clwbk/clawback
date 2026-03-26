import { requireConsoleSession } from "@/lib/console-session";

import { WorkspaceShell } from "./workspace-shell";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await requireConsoleSession();

  return <WorkspaceShell initialSession={session}>{children}</WorkspaceShell>;
}
