# Деплой на Dokploy

Памятка по развёртыванию Халк Байк CRM на сервере под управлением [Dokploy](https://docs.dokploy.com).

## Архитектура в проде

Три независимых сервиса в одном Dokploy-проекте:

```
┌─────────────┐        ┌──────────┐        ┌────────────┐
│    web      │───────▶│   api    │───────▶│  postgres  │
│  (nginx)    │  CORS  │ (node)   │        │            │
│  :80        │        │  :4000   │        │   :5432    │
└─────────────┘        └──────────┘        └────────────┘
     ▲                      ▲
     │                      │
 crm.hulk.ru          api.hulk.ru    (Traefik + Let's Encrypt от Dokploy)
```

- **web** — статика из `apps/web/dist`, раздаётся nginx.
- **api** — Fastify, ходит в Postgres, отвечает на `/api/*` и `/health`.
- **postgres** — из шаблонов самого Dokploy (не из нашего репо).

## Сначала — проверка локально через docker-compose

Чтобы убедиться что Dockerfile'ы живые ещё до Dokploy:

```bash
# Остановить dev-стек если запущен
pnpm db:down

# Собрать и поднять всё разом: postgres + api + web
pnpm stack:build
pnpm stack:up

# Прогнать seed (разово — после первого up)
pnpm db:seed

# Открыть http://localhost:8080 — web на nginx
# Открыть http://localhost:4000/health — api
# Проверить связку: список клиентов должен прийти из API
```

Если всё ок — идём на Dokploy.

## Dokploy: пошагово

### 1. Проект

В UI Dokploy:
**Projects → Create Project** → имя `hulk-bike-crm`.

### 2. Postgres

**+ Add Service → Database → PostgreSQL**:
- Name: `hulk-postgres`
- Database: `hulk`
- Username: `hulk`
- Password: сгенерировать сильный (сохранить — понадобится для api)
- Image: `postgres:16-alpine`
- External Port: не нужно (сервисы ходят по внутренней сети Dokploy)

После создания — Dokploy даст `DATABASE_URL` во внутренних env (`${{project.hulk-postgres.DATABASE_URL}}`), привязывается к любому сервису проекта.

### 3. API

**+ Add Service → Application → Git Provider**:
- Provider: GitHub → выбрать репо `Ksinox/hulk_bike_crm`
- Branch: `main`
- Build Type: **Dockerfile**
- Build Path: `/`
- Dockerfile Path: `apps/api/Dockerfile`

**Environment Variables** (вкладка Environment):
```
NODE_ENV=production
PORT=4000
HOST=0.0.0.0
DATABASE_URL=${{project.hulk-postgres.DATABASE_URL}}
CORS_ORIGINS=https://crm.hulk-bike.ru
```
(замени `crm.hulk-bike.ru` на реальный домен web)

**Pre Deployment Command** (вкладка Deployments) — применяет миграции перед стартом:
```
node dist/db/migrate.js
```

**Domains** (вкладка Domains):
- Host: `api.hulk-bike.ru`
- Port: `4000`
- HTTPS: включить (Let's Encrypt автоматом)

Нажать **Deploy**. Первая сборка займёт ~3–5 мин.

### 4. Web

**+ Add Service → Application → Git Provider**:
- Provider: GitHub, тот же репо
- Branch: `main`
- Build Type: **Dockerfile**
- Build Path: `/`
- Dockerfile Path: `apps/web/Dockerfile`

**Build Arguments** (важно — **build args**, не env):
```
VITE_API_URL=https://api.hulk-bike.ru
```
(впекается в JS-бандл при сборке — отсюда web знает куда ходить за данными)

**Domains**:
- Host: `crm.hulk-bike.ru`
- Port: `80`
- HTTPS: включить

**Deploy**.

### 5. Первый seed (разово)

После первой успешной миграции зайди в shell api-контейнера (в Dokploy UI есть Terminal) и запусти:

```bash
# ВНИМАНИЕ: в prod seed запрещён (проверяется по NODE_ENV).
# Если хочешь реально залить демо-данные в prod — переопредели переменную
#   NODE_ENV=development  в api-контейнере на время одного запуска
# ИЛИ лучше — запусти seed из локальной машины против prod DATABASE_URL:
#
#   export DATABASE_URL="postgres://..."  # из Dokploy Postgres
#   pnpm --filter api db:seed
```

В большинстве случаев prod стартует **с пустой БД** и первые данные добавляют через UI.

### 6. Auto-deploy

В Dokploy для каждого сервиса включить **Auto Deploy** → на push в `main` пересоберётся. Зависимости между web и api нет — api не ломает web и наоборот.

## Изменение схемы БД в проде

1. Локально: правим `apps/api/src/db/schema.ts`
2. `pnpm db:generate` — появляется миграция в `apps/api/drizzle/`
3. **Смотрим SQL глазами** — Drizzle может сгенерить неожиданное, особенно на дроп колонок
4. Коммит + push
5. Dokploy пересоберёт api → Pre Deployment `node dist/db/migrate.js` применит миграцию до старта
6. Если миграция падает — api не стартует, старая версия продолжает работать

## Бэкапы Postgres

В UI Dokploy у сервиса Postgres есть вкладка **Backups**. Настраивается:
- S3-совместимый бакет (Backblaze B2 / R2 / свой MinIO)
- Расписание: daily в 3:00 MSK
- Retention: 30 дней

**Обязательно** настроить до реального запуска. Бекап один раз стоит копейки, восстановление без бекапа — невозможно.

## Переменные окружения — шпаргалка

### API (`apps/api`)
| Переменная | Пример | Описание |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://...` | из Dokploy Postgres |
| `PORT` | `4000` | порт api |
| `HOST` | `0.0.0.0` | интерфейс |
| `NODE_ENV` | `production` | режим |
| `CORS_ORIGINS` | `https://crm.hulk-bike.ru` | через запятую, домены web |

### WEB (`apps/web`)
| Build arg | Пример | Описание |
| --- | --- | --- |
| `VITE_API_URL` | `https://api.hulk-bike.ru` | адрес API, впекается в JS |

## Что пока НЕ работает в прод-режиме

- **Загрузка документов** (ПТС/СТС/фото клиентов) — сейчас блоб-урлы, пропадают при перезагрузке. Нужен object storage (MinIO в Dokploy + endpoint `/api/upload`). Отдельная итерация.
- **Write-операции**: создание клиента, патч скутера, смена статуса аренды, платежи — пока только в локальной памяти браузера. API-эндпоинты будут добавлены следующими итерациями.
- **Auth** — пока одна анонимная сессия. Логин/пароль директор/админ — отдельно.

На данном этапе деплой имеет смысл чтобы убедиться что **read-слой** работает end-to-end и показать заказчику/себе готовую картинку.
