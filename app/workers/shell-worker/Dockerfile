FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/config/package.json ./packages/config/
COPY packages/tool-registry/package.json ./packages/tool-registry/
COPY workers/shared-worker/package.json ./workers/shared-worker/
COPY workers/shell-worker/package.json ./workers/shell-worker/

RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY workers/shared-worker/ ./workers/shared-worker/
COPY workers/shell-worker/ ./workers/shell-worker/

RUN pnpm --filter "@agency/shell-worker..." build

FROM node:22-alpine AS production

WORKDIR /app

# Install bash and curl for shell tool executions
RUN apk update && apk add --no-cache bash curl

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/config/package.json ./packages/config/
COPY packages/tool-registry/package.json ./packages/tool-registry/
COPY workers/shared-worker/package.json ./workers/shared-worker/
COPY workers/shell-worker/package.json ./workers/shell-worker/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/tool-registry/dist ./packages/tool-registry/dist
COPY --from=builder /app/workers/shared-worker/dist ./workers/shared-worker/dist
COPY --from=builder /app/workers/shell-worker/dist ./workers/shell-worker/dist

ENV NODE_ENV=production

CMD ["node", "workers/shell-worker/dist/index.js"]
