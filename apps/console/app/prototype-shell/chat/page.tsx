import { PageHeader, WorkspaceScreen } from "../prototype-kit";

export default function PrototypeChatWorkbenchPage() {
  return (
    <div>
      <PageHeader title="Workspace" subtitle="Chat on the left. Draft on the right." />
      <WorkspaceScreen />
    </div>
  );
}
