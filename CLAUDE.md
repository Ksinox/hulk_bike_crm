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

## Язык

Интерфейс и коммиты — русский. Комментарии в коде — по необходимости, тоже русский. Имена файлов, переменных, функций — английский (стандарт).

## Бизнес-контекст

Бизнес-артефакты (спецификации, промпты экранов, сырые документы) лежат в `Скутеры_CRM_Бизнес/` и `Сырые документы/` — они **не коммитятся** в git (локальные артефакты). Когда нужна спецификация экрана — читаем оттуда.

Ключевые цифры для мок-данных: 54 скутера, ~44 клиента, ~625 000 ₽/мес выручка, 90% — аренда. Ставки: Jog 400–500 ₽/сут, Gear 500–600 ₽/сут, залог 2 000 ₽.
