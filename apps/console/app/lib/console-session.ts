import "server-only";

import { redirect } from "next/navigation";

import {
  ControlPlaneRequestError,
  getSession,
  getSetupStatus,
  type AuthenticatedSession,
} from "@/lib/control-plane";

export async function requireConsoleSession(): Promise<AuthenticatedSession> {
  try {
    return await getSession();
  } catch (error) {
    if (error instanceof ControlPlaneRequestError && error.statusCode === 401) {
      try {
        const status = await getSetupStatus();
        redirect(status.bootstrapped ? "/login" : "/setup");
      } catch {
        redirect("/login");
      }
    }

    throw error;
  }
}
