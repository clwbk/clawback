# ---- Stage 1: Dependencies ----
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
WORKDIR /app

# Copy workspace root files needed for install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy all package.json files for workspace packages
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/env/package.json packages/env/package.json
COPY packages/policy/package.json packages/policy/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/model-adapters/package.json packages/model-adapters/package.json
COPY packages/retrieval/package.json packages/retrieval/package.json
COPY packages/plugin-sdk/package.json packages/plugin-sdk/package.json
COPY packages/plugin-manifests/package.json packages/plugin-manifests/package.json
COPY services/control-plane/package.json services/control-plane/package.json
COPY services/runtime-worker/package.json services/runtime-worker/package.json
COPY apps/console/package.json apps/console/package.json

RUN pnpm install --frozen-lockfile

# ---- Stage 2: Build ----
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/services ./services
COPY --from=deps /app/apps ./apps

# Copy source
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages packages
COPY services/control-plane services/control-plane

# Build packages first (order matches root package.json build:packages)
RUN pnpm run build:packages
# Build control-plane
RUN pnpm --filter @clawback/control-plane build

# ---- Stage 3: Runtime ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 clawback && \
    adduser --system --uid 1001 clawback

# Copy built output and node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/control-plane ./services/control-plane
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json

USER clawback

EXPOSE 3001

ENV CONTROL_PLANE_PORT=3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/healthz || exit 1

CMD ["node", "services/control-plane/dist/index.js"]
