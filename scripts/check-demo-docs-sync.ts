import { buildPublicDocsVersion } from "../apps/console/app/docs/public-docs-server";

type Options = {
  baseUrl: string;
};

function parseArgs(argv: string[]): Options {
  let baseUrl = "https://demo.clawback.team";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--base-url") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--base-url requires a value.");
      }
      baseUrl = next;
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: pnpm check:demo-docs-sync [-- --base-url https://demo.clawback.team]",
      );
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { baseUrl };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const localVersion = await buildPublicDocsVersion({ publicDemoMode: true });
  const endpoint = new URL("/api/docs/version", options.baseUrl);
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`Docs version endpoint returned ${response.status} ${response.statusText}.`);
  }

  const remoteVersion = (await response.json()) as {
    hash?: string;
    publicDemoMode?: boolean;
    docs?: Array<{ slug: string; title: string }>;
  };

  if (remoteVersion.publicDemoMode !== true) {
    throw new Error(
      `Remote docs are not in public-demo mode at ${options.baseUrl}. Redeploy the console/docs first.`,
    );
  }

  if (remoteVersion.hash !== localVersion.hash) {
    throw new Error(
      [
        `Public docs are out of sync at ${options.baseUrl}.`,
        `local hash:  ${localVersion.hash}`,
        `remote hash: ${remoteVersion.hash ?? "missing"}`,
        "Redeploy the demo/console docs before deploying the site.",
      ].join("\n"),
    );
  }

  console.log(`Public docs match ${options.baseUrl}`);
  console.log(`hash: ${localVersion.hash}`);
  console.log(`docs: ${localVersion.docs.map((doc) => doc.slug).join(", ")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
