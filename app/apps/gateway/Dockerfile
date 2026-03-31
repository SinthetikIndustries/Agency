FROM node:22-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable

# Copy workspace config and package definitions
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/config/package.json ./packages/config/
COPY packages/tool-registry/package.json ./packages/tool-registry/
COPY services/model-router/package.json ./services/model-router/
COPY services/orchestrator/package.json ./services/orchestrator/
COPY workers/shared-worker/package.json ./workers/shared-worker/
COPY apps/gateway/package.json ./apps/gateway/

# Install all dependencies (including dev deps for building)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ ./packages/
COPY services/ ./services/
COPY workers/shared-worker/ ./workers/shared-worker/
COPY apps/gateway/ ./apps/gateway/

# Build all packages in the workspace
RUN pnpm --filter "@agency/gateway..." build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

RUN corepack enable

# Copy minimal files needed for production install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/config/package.json ./packages/config/
COPY packages/tool-registry/package.json ./packages/tool-registry/
COPY services/model-router/package.json ./services/model-router/
COPY services/orchestrator/package.json ./services/orchestrator/
COPY workers/shared-worker/package.json ./workers/shared-worker/
COPY apps/gateway/package.json ./apps/gateway/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy compiled dist directories
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/tool-registry/dist ./packages/tool-registry/dist
COPY --from=builder /app/services/model-router/dist ./services/model-router/dist
COPY --from=builder /app/services/orchestrator/dist ./services/orchestrator/dist
COPY --from=builder /app/workers/shared-worker/dist ./workers/shared-worker/dist
COPY --from=builder /app/services/orchestrator/templates ./services/orchestrator/templates
COPY --from=builder /app/apps/gateway/dist ./apps/gateway/dist
COPY --from=builder /app/apps/gateway/migrations ./apps/gateway/migrations

# Expose Gateway port
EXPOSE 3000

ENV NODE_ENV=production

# Start the Gateway
CMD ["node", "apps/gateway/dist/index.js"]
