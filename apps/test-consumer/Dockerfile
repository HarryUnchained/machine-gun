# syntax=docker/dockerfile:1.7

# Stage 0: Base with build tools
FROM dhi.io/node:24-dev AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PNPM_HOME:$PATH"
RUN corepack enable
RUN pnpm add -g turbo

# Stage 1: Prune the monorepo
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune --scope=test-consumer --docker

# Stage 2: Build stage
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
# Build
RUN turbo build --filter=test-consumer

# Stage 3: Production Dependencies
FROM base AS prod-deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,sharing=locked,target=/pnpm/store \
  pnpm install --prod --no-frozen-lockfile --filter test-consumer...
RUN mkdir -p /app/packages/common/node_modules

# Stage 4: Final Production Image (Hardened)
FROM dhi.io/node:24 AS production
WORKDIR /app
ENV NODE_ENV=production

LABEL org.opencontainers.image.title="Machine Gun Test Consumer" \
      org.opencontainers.image.description="Reference consumer for validating Machine Gun delivery" \
      org.opencontainers.image.url="https://github.com/HarryUnchained/machine-gun" \
      org.opencontainers.image.source="https://github.com/HarryUnchained/machine-gun" \
      org.opencontainers.image.vendor="HarryUnchained" \
      org.opencontainers.image.licenses="Apache-2.0"

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/test-consumer/node_modules ./apps/test-consumer/node_modules
COPY --from=prod-deps /app/packages/common/node_modules ./packages/common/node_modules

# Copy built artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/common/package.json ./packages/common/
COPY --from=builder /app/packages/common/dist ./packages/common/dist
COPY --from=builder /app/apps/test-consumer/package.json ./apps/test-consumer/
COPY --from=builder /app/apps/test-consumer/dist ./apps/test-consumer/dist

EXPOSE 3001
CMD ["node", "apps/test-consumer/dist/main.js"]
