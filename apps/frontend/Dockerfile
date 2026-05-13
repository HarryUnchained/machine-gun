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
RUN turbo prune --scope=frontend --docker

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
RUN turbo build --filter=frontend

FROM nginx:1.25.4-alpine AS production
LABEL org.opencontainers.image.title="Machine Gun Frontend" \
      org.opencontainers.image.description="Real-time dashboard for Machine Gun" \
      org.opencontainers.image.url="https://github.com/HarryUnchained/machine-gun" \
      org.opencontainers.image.source="https://github.com/HarryUnchained/machine-gun" \
      org.opencontainers.image.vendor="HarryUnchained" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/frontend/dist/frontend/browser /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
