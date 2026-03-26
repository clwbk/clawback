"use client";

import { useEffect, useState } from "react";
import { listApprovals } from "@/lib/control-plane";

export function useApprovalSummary(role: "admin" | "user" | null | undefined) {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (role !== "admin") {
      setPendingCount(0);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const result = await listApprovals();
        if (!cancelled) {
          setPendingCount(result.approvals.filter((approval) => approval.status === "pending").length);
        }
      } catch {
        if (!cancelled) {
          setPendingCount(0);
        }
      }
    };

    void load();
    const intervalId = window.setInterval(() => {
      void load();
    }, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [role]);

  return { pendingCount };
}
