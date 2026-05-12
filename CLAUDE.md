# Правила разработки — Халк Байк CRM

## Стек

- **Фронтенд:** React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + shadcn/ui. Роутинг: `@tanstack/react-router`, данные: `@tanstack/react-query`, графики: `recharts`, валидация: `zod`.
- **Десктоп:** Electron 32 + electron-builder (target: `nsis-web`) + electron-updater + electron-log.
- **Пакетный менеджер:** pnpm (workspaces).
- **Backend:** Fastify + Drizzle + Postgres 16 + MinIO (S3). Папка `apps/api/`.
  Web ходит в API через React Query — источник данных **БД**, не моки. Моки остались только как seed для dev-БД (`apps/api/src/seed/`).

## Dual-mode

Один React-бандл используется и для веба, и для Electron. Платформоспецифика — только в `apps/web/src/platform/`. В web-сборке `isElectron === false`, IPC-функции — заглушки.

## Git-дисциплина

- Ветки: `main` (релизы), `develop` (интеграция), `feature/*`, `fix/*`.
- Коммиты — мелкие и осмысленные, **Conventional Commits на русском**: `feat: добавить KPI-карточки`, `fix: починить запуск Electron в prod`, `chore: обновить deps`, `docs: дополнить README`.
- Коммит делается после каждой законченной подзадачи (не копим изменения).
- Перед рискованными изменениями — чекпоинт-тег: `git tag checkpoint/YYYY-MM-DD-описание`.
- Откат локально: `git reflog` + `git reset --hard <sha>`. Эксперименты — через `git worktree add`.
- Не делаем force-push в `main`.

## Релизы desktop

**ВАЖНО — не бампать до деплоя API на сервер.**
Web-бандл внутри Electron ходит в API по `VITE_API_URL`. Если VITE_API_URL не указывает на живой прод-API, auto-updater выкатит клиенту **пустую CRM** с ошибкой «Failed to fetch». Релиз desktop имеет смысл только после того как:
1. API задеплоен на сервер (Dokploy) и доступен по домену (напр. `https://api.hulk-bike.ru`)
2. В `.github/workflows/release-desktop.yml` задан `VITE_API_URL=https://api.hulk-bike.ru` на шаге сборки web
3. Локально проверено что сборка Electron с этим env ходит на реальный API

После этого:
1. Бампнуть версию в `apps/desktop/package.json`.
2. `git tag v0.1.X && git push --tags`.
3. GitHub Action `release-desktop.yml` соберёт установщик и опубликует Release с `latest.yml`, `*.7z`, blockmap.
4. Установленные клиенты при следующем запуске получат уведомление об обновлении.

## Релизы web

Push в `main` → GitHub Action собирает статику. Деплой на хост — через Dokploy (см. `DEPLOY.md`).

## Workflow: preview → prod

Для всех нетривиальных изменений (особенно карточек, финансовых потоков, миграций) — **сначала через preview-окружение**, потом в прод. Прямые коммиты в `main` без обкатки на preview допустимы только для мелочей: typo, текст, версия.

**Preview-окружение:**
- Привязано к ветке `feature/redesign-rental-card-v0.5` (можно поменять branch в Dokploy → hulk-api-preview/hulk-web-preview).
- Отдельный Postgres `hulk-postgres-preview-rk2fcv` — чистая БД, миграции отработают сами.
- Отдельный бакет MinIO `hulk-docs-preview` (создаётся автоматически).
- URLs: `https://api-preview.104-128-128-96.sslip.io` и `https://crm-preview.104-128-128-96.sslip.io`.
- Auto-deploy включён — push в feature-ветку → автодеплой preview.

**Стандартная последовательность:**
1. `git checkout -b feature/<task>` от `main`.
2. Коммиты в feature-ветку → preview автоматически передеплоится.
3. Принудительно: `python scripts/redeploy_preview.py` (api+web) или `redeploy_preview.py api|web`.
4. Тестировать на `crm-preview.104-128-128-96.sslip.io`.
5. Когда всё работает: `git checkout main && git merge feature/<task> && git push` → прод обновится.
6. `python scripts/redeploy_api.py` + `redeploy_web.py` для контроля прод-деплоя.

**Не пушить в `main` напрямую** изменения, которые могли что-то сломать. Все большие фичи — через preview.

## Язык

Интерфейс и коммиты — русский. Комментарии в коде — по необходимости, тоже русский. Имена файлов, переменных, функций — английский (стандарт).

## Бизнес-контекст

Бизнес-артефакты (спецификации, промпты экранов, сырые документы) лежат в `Скутеры_CRM_Бизнес/` и `Сырые документы/` — они **не коммитятся** в git (локальные артефакты). Когда нужна спецификация экрана — читаем оттуда.

Ключевые цифры для мок-данных: 54 скутера, ~44 клиента, ~625 000 ₽/мес выручка, 90% — аренда. Ставки: Jog 400–500 ₽/сут, Gear 500–600 ₽/сут, залог 2 000 ₽.
