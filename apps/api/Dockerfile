# syntax=docker/dockerfile:1.7
#
# Dockerfile для apps/api. Контекст сборки = корень репо.
#   docker build -f apps/api/Dockerfile -t hulk-api .
#
# На Dokploy: в UI сервиса выставить
#   • Build Type: Dockerfile
#   • Build Path: /
#   • Dockerfile Path: apps/api/Dockerfile
#   • Pre Deployment: node /app/apps/api/dist/db/migrate.js

# ---------- builder: компилируем TS → dist/ ----------
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json

RUN pnpm install --frozen-lockfile --filter api

COPY apps/api ./apps/api
RUN pnpm --filter api build

# ---------- runtime: только prod deps + скомпилированный dist ----------
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache tini && corepack enable
ENTRYPOINT ["/sbin/tini", "--"]

# Ставим prod-зависимости заново — чистый node_modules без dev-пакетов
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile --filter api --prod

# Подтягиваем билд и миграции
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/drizzle ./apps/api/drizzle

WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/health').then(r => r.ok ? 0 : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
