# apps/api — Халк Байк Backend

Fastify + Drizzle + Postgres.

## Локальный старт

```bash
# 1. Поднять Postgres (в корне репозитория)
pnpm db:up

# 2. Установить зависимости (если ещё не делали)
pnpm install

# 3. Скопировать env
cp apps/api/.env.example apps/api/.env

# 4. Сгенерировать первую SQL-миграцию из schema.ts
pnpm db:generate

# 5. Применить миграции к локальной БД
pnpm db:migrate

# 6. Запустить сервер в режиме watch
pnpm dev:api
```

Сервер слушает на `http://localhost:4000`, проверка: `curl http://localhost:4000/health`.

## Структура

```
apps/api/
├── drizzle/              # сгенерированные SQL-миграции (коммитятся!)
├── src/
│   ├── config.ts         # загрузка .env
│   ├── db/
│   │   ├── schema.ts     # ↖ источник истины по схеме БД
│   │   ├── index.ts      # подключение (drizzle + postgres-js)
│   │   ├── migrate.ts    # скрипт применения миграций
│   │   └── reset.ts      # полный сброс dev-БД
│   └── index.ts          # Fastify bootstrap
├── drizzle.config.ts
├── .env.example
└── package.json
```

## Команды

| Команда (из корня)     | Что делает                                      |
| ---------------------- | ----------------------------------------------- |
| `pnpm db:up`           | поднять Postgres в Docker                       |
| `pnpm db:down`         | остановить Postgres                             |
| `pnpm db:logs`         | посмотреть логи Postgres                        |
| `pnpm db:generate`     | сгенерировать SQL из schema.ts                  |
| `pnpm db:migrate`      | применить миграции                              |
| `pnpm db:reset`        | DROP+CREATE schema public (**только dev!**)     |
| `pnpm db:studio`       | открыть Drizzle Studio (GUI для БД)             |
| `pnpm dev:api`         | запустить API в watch-режиме                    |
| `pnpm build:api`       | скомпилировать в dist/                          |

## Как меняем схему

1. Правим `src/db/schema.ts`
2. `pnpm db:generate` → появляется новая миграция в `drizzle/`
3. **Проверяем SQL глазами** — Drizzle иногда генерит неожиданное
4. Коммитим миграцию в git
5. `pnpm db:migrate` — применяем локально
6. На проде миграции применятся автоматически при деплое (pre-start шаг)

## Prod (Dokploy)

Переменные, которые надо задать в UI Dokploy для api-сервиса:

- `DATABASE_URL` — привяжется автоматически от Postgres-сервиса
- `PORT` — `4000`
- `HOST` — `0.0.0.0`
- `NODE_ENV` — `production`
- `CORS_ORIGINS` — `https://crm.hulk-bike.ru` (реальный домен фронта)
