#!/usr/bin/env bash
# Creates a zip of the key project files for AI/human onboarding.
# Output: ../clawback-knowledge-package.zip (one level up, outside the repo)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${REPO_ROOT}/../clawback-knowledge-package.zip"

cd "$REPO_ROOT"

rm -f "$OUT"

zip -r "$OUT" \
  PROJECT_MANIFEST.md \
  README.md \
  AGENTS.md \
  package.json \
  pnpm-workspace.yaml \
  tsconfig.base.json \
  .env.example \
  docs/ \
  packages/contracts/src/ \
  packages/contracts/package.json \
  packages/db/src/schema.ts \
  packages/db/src/queries/ \
  packages/db/src/seed.ts \
  packages/db/src/index.ts \
  packages/db/package.json \
  packages/domain/src/ \
  packages/domain/package.json \
  packages/plugin-sdk/src/ \
  packages/plugin-sdk/package.json \
  packages/plugin-manifests/src/ \
  packages/plugin-manifests/package.json \
  packages/auth/src/ \
  packages/auth/package.json \
  packages/policy/src/ \
  packages/policy/package.json \
  services/control-plane/src/ \
  services/control-plane/package.json \
  services/runtime-worker/src/ \
  services/runtime-worker/package.json \
  apps/console/app/ \
  apps/console/package.json \
  apps/console/tailwind.config.ts \
  apps/console/next.config.ts \
  scripts/ \
  infra/ \
  -x '*/node_modules/*' '*/.next/*' '*/dist/*' '*/.turbo/*' \
     '*/__tests__/*' '*.test.ts' '*.test.tsx' '*.spec.ts'

FILE_COUNT=$(zipinfo -1 "$OUT" | wc -l | tr -d ' ')
FILE_SIZE=$(ls -lh "$OUT" | awk '{print $5}')

echo ""
echo "Created: $OUT"
echo "Size: $FILE_SIZE | Files: $FILE_COUNT"
