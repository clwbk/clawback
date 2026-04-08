ARG NEXT_PUBLIC_PUBLIC_DEMO_MODE=false

# ---- Stage 1: Dependencies ----
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
WORKDIR /app

# Copy workspace root files needed for install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/console/package.json apps/console/package.json
# Copy workspace packages that console depends on
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile

# ---- Stage 2: Build ----
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
WORKDIR /app

ARG NEXT_PUBLIC_PUBLIC_DEMO_MODE
ENV NEXT_PUBLIC_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_PUBLIC_DEMO_MODE

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/console/node_modules ./apps/console/node_modules
COPY --from=deps /app/packages/contracts/node_modules ./packages/contracts/node_modules

# Copy source
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY docs/guides docs/guides
COPY packages/contracts packages/contracts
COPY apps/console apps/console

# Build packages first, then console
RUN pnpm --filter @clawback/contracts build
RUN pnpm --filter @clawback/console build

# ---- Stage 3: Runtime ----
FROM node:22-alpine AS runner
WORKDIR /app

ARG NEXT_PUBLIC_PUBLIC_DEMO_MODE
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_PUBLIC_DEMO_MODE

RUN addgroup --system --gid 1001 clawback && \
    adduser --system --uid 1001 clawback

# Copy standalone output
COPY --from=builder /app/apps/console/.next/standalone ./
COPY --from=builder /app/apps/console/.next/static ./apps/console/.next/static
COPY --from=builder /app/apps/console/public ./apps/console/public
COPY --from=builder /app/docs/guides ./docs/guides

USER clawback

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "apps/console/server.js"]
