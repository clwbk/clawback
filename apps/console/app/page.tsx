import { redirect } from "next/navigation";

import { requireConsoleSession } from "@/lib/console-session";

export default async function HomePage() {
  await requireConsoleSession();
  redirect("/workspace");
}
