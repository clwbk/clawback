import { describe, expect, it } from "vitest";
import {
  buildChatLocation,
  pathToWorkspaceSection,
  resolvePreferredSelectionId,
  workspaceSectionToPath,
} from "./workspace-navigation";

describe("workspaceNavigation", () => {
  it("maps workspace paths to the expected 1.0 shell sections", () => {
    expect(pathToWorkspaceSection("/workspace")).toBe("today");
    expect(pathToWorkspaceSection("/workspace/workers")).toBe("workers");
    expect(pathToWorkspaceSection("/workspace/workers/wkr_123")).toBe("workers");
    expect(pathToWorkspaceSection("/workspace/inbox")).toBe("inbox");
    expect(pathToWorkspaceSection("/workspace/work")).toBe("work");
    expect(pathToWorkspaceSection("/workspace/work/wi_123")).toBe("work");
    expect(pathToWorkspaceSection("/workspace/connectors")).toBe("connectors");
    expect(pathToWorkspaceSection("/workspace/connections")).toBe("connections");
    expect(pathToWorkspaceSection("/workspace/activity")).toBe("activity");
    expect(pathToWorkspaceSection("/workspace/chat")).toBe("chat");
    expect(pathToWorkspaceSection("/workspace/chat?agent=a")).toBe("chat");
    expect(pathToWorkspaceSection("/workspace/runs/run_123")).toBe("chat");
  });

  it("maps 1.0 shell sections to workspace routes", () => {
    expect(workspaceSectionToPath("today")).toBe("/workspace");
    expect(workspaceSectionToPath("workers")).toBe("/workspace/workers");
    expect(workspaceSectionToPath("inbox")).toBe("/workspace/inbox");
    expect(workspaceSectionToPath("work")).toBe("/workspace/work");
    expect(workspaceSectionToPath("connectors")).toBe("/workspace/connectors");
    expect(workspaceSectionToPath("connections")).toBe("/workspace/connections");
    expect(workspaceSectionToPath("activity")).toBe("/workspace/activity");
    expect(workspaceSectionToPath("chat")).toBe("/workspace/chat");
    expect(workspaceSectionToPath("unknown")).toBe("/workspace");
  });

  it("builds normalized chat URLs", () => {
    expect(buildChatLocation(null, null)).toBe("/workspace/chat");
    expect(buildChatLocation("agent_1", null)).toBe("/workspace/chat?agent=agent_1");
    expect(buildChatLocation("agent_1", "conv_1")).toBe(
      "/workspace/chat?agent=agent_1&conversation=conv_1",
    );
  });

  it("prefers requested ids, then current ids, then the first available id", () => {
    const availableIds = ["one", "two", "three"];

    expect(
      resolvePreferredSelectionId(availableIds, {
        requestedId: "two",
        currentId: "one",
      }),
    ).toBe("two");

    expect(
      resolvePreferredSelectionId(availableIds, {
        requestedId: "missing",
        currentId: "three",
      }),
    ).toBe("three");

    expect(
      resolvePreferredSelectionId(availableIds, {
        requestedId: null,
        currentId: "missing",
      }),
    ).toBe("one");

    expect(resolvePreferredSelectionId([], {})).toBeNull();
  });
});
