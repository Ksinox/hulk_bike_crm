# syntax=docker/dockerfile:1.7
#
# Dockerfile для apps/web. Сборка из корня монорепы (контекст = ./).
#   docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://api.example.com -t hulk-web .
#
# На Dokploy:
#   • Build Type: Dockerfile
#   • Build Path: /
#   • Dockerfile Path: apps/web/Dockerfile
#   • Build Args: VITE_API_URL = https://api.hulk-bike.ru  ← URL бекенда
#
# ВАЖНО: VITE_API_URL «впекается» в JS-бандл на этапе сборки.
# Для разных окружений (staging/prod) — разные build args → разные образы.

# ---------- builder: Vite собирает статику ----------
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile --filter web

COPY apps/web ./apps/web
RUN pnpm --filter web build

# ---------- runtime: nginx раздаёт статику ----------
FROM nginx:alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 --start-period=5s \
  CMD wget --quiet --spider http://127.0.0.1/ || exit 1
