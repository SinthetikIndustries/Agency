FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/config/package.json ./packages/config/
COPY packages/tool-registry/package.json ./packages/tool-registry/
COPY workers/shared-worker/package.json ./workers/shared-worker/
COPY workers/code-worker/package.json ./workers/code-worker/

RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY workers/shared-worker/ ./workers/shared-worker/
COPY workers/code-worker/ ./workers/code-worker/

RUN pnpm --filter "@agency/code-worker..." build

FROM node:22-alpine AS production

WORKDIR /app

# Install bash, curl, and python3 for code execution
RUN apk update && apk add --no-cache bash curl python3

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/config/package.json ./packages/config/
COPY packages/tool-registry/package.json ./packages/tool-registry/
COPY workers/shared-worker/package.json ./workers/shared-worker/
COPY workers/code-worker/package.json ./workers/code-worker/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/tool-registry/dist ./packages/tool-registry/dist
COPY --from=builder /app/workers/shared-worker/dist ./workers/shared-worker/dist
COPY --from=builder /app/workers/code-worker/dist ./workers/code-worker/dist

ENV NODE_ENV=production

CMD ["node", "workers/code-worker/dist/index.js"]
