# syntax=docker/dockerfile:1.7

# Stage 0: Base with build tools
FROM dhi.io/node:24-dev AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PNPM_HOME:$PATH"
RUN corepack enable
RUN pnpm add -g turbo

# Stage 1: Prune
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune --scope=backend --scope=frontend --docker

# Stage 2: Build
FROM base AS builder
WORKDIR /app

# Copy pruned lockfile and package.json
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

# Install dependencies
RUN --mount=type=cache,id=pnpm-store,sharing=locked,target=/pnpm/store \
  pnpm install --no-frozen-lockfile

# Copy source code
COPY --from=pruner /app/out/full/ .
COPY tsconfig.base.json .

# Build apps
RUN turbo build --filter=backend --filter=frontend
RUN mkdir -p /app/apps/backend/data/schemas /app/apps/backend/data/flows && chmod -R 777 /app/apps/backend/data

# Stage 3: Production Dependencies
FROM base AS prod-deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/common/package.json packages/common/package.json
RUN --mount=type=cache,id=pnpm-store,sharing=locked,target=/pnpm/store \
  pnpm install --prod --no-frozen-lockfile --filter backend...
RUN mkdir -p /app/packages/common/node_modules

# Stage 4: Final Production Image (Hardened)
FROM dhi.io/node:24 AS production
WORKDIR /app
ENV NODE_ENV=production

LABEL org.opencontainers.image.title="Machine Gun" \
      org.opencontainers.image.description="Unified load generator and visual dashboard for RabbitMQ and Kafka" \
      org.opencontainers.image.url="https://github.com/HarryUnchained/machine-gun" \
      org.opencontainers.image.source="https://github.com/HarryUnchained/machine-gun" \
      org.opencontainers.image.vendor="HarryUnchained" \
      org.opencontainers.image.licenses="Apache-2.0"

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=prod-deps /app/packages/common/node_modules ./packages/common/node_modules

# Copy built artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/common/package.json ./packages/common/
COPY --from=builder /app/packages/common/dist ./packages/common/dist
COPY --from=builder /app/apps/backend/package.json ./apps/backend/
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/data ./data
COPY --from=builder /app/apps/frontend/dist/frontend/browser ./apps/backend/client

EXPOSE 3000

CMD ["node", "apps/backend/dist/main.js"]
