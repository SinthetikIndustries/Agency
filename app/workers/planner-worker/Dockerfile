FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/config/package.json ./packages/config/
COPY packages/tool-registry/package.json ./packages/tool-registry/
COPY services/model-router/package.json ./services/model-router/
COPY workers/shared-worker/package.json ./workers/shared-worker/
COPY workers/planner-worker/package.json ./workers/planner-worker/

RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY services/ ./services/
COPY workers/shared-worker/ ./workers/shared-worker/
COPY workers/planner-worker/ ./workers/planner-worker/

RUN pnpm --filter "@agency/planner-worker..." build

FROM node:22-alpine AS production

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/config/package.json ./packages/config/
COPY packages/tool-registry/package.json ./packages/tool-registry/
COPY services/model-router/package.json ./services/model-router/
COPY workers/shared-worker/package.json ./workers/shared-worker/
COPY workers/planner-worker/package.json ./workers/planner-worker/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/tool-registry/dist ./packages/tool-registry/dist
COPY --from=builder /app/services/model-router/dist ./services/model-router/dist
COPY --from=builder /app/workers/shared-worker/dist ./workers/shared-worker/dist
COPY --from=builder /app/workers/planner-worker/dist ./workers/planner-worker/dist

ENV NODE_ENV=production

CMD ["node", "workers/planner-worker/dist/index.js"]
