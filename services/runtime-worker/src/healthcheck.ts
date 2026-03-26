import { assertRuntimeWorkerHealthy } from "./status.js";

async function main() {
  try {
    await assertRuntimeWorkerHealthy();
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Runtime worker healthcheck failed.",
    );
    process.exit(1);
  }
}

void main();
