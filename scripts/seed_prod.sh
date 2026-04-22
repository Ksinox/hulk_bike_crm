#!/usr/bin/env bash
# Разово сидит прод-БД. Стартует временный Node-контейнер с клонированным репо
# и переменной DATABASE_URL, запускает pnpm db:seed внутри.

set -e

cd /tmp
rm -rf hulk_bike_crm 2>/dev/null || true
git clone --depth 1 https://github.com/Ksinox/hulk_bike_crm.git
cd hulk_bike_crm

# Создаём .env для api чтобы seed нашёл DATABASE_URL
cat > apps/api/.env <<EOF
DATABASE_URL=postgres://hulk:hulk_strong_prod_pw_2026@hulk-postgres-rlecri:5432/hulk
NODE_ENV=development
PORT=4000
HOST=0.0.0.0
CORS_ORIGINS=https://crm.104-128-128-96.sslip.io
S3_ENDPOINT=hulk-minio-1f30mp-minio-1
S3_PORT=9000
S3_USE_SSL=false
S3_ACCESS_KEY=hulkminio
S3_SECRET_KEY=hulkminio_strong_prod_2026
S3_BUCKET=hulk-docs
EOF

docker run --rm \
  --network dokploy-network \
  -v "$(pwd)":/app \
  -w /app \
  node:20-alpine \
  sh -c "corepack enable && pnpm install --frozen-lockfile --filter api && pnpm --filter api db:seed"
