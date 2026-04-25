# apps/landing — лендинг hulkbike.ru

Публичная посадочная страница для клиентов. Один статический `index.html`,
никакой сборки. Карточки скутеров подгружаются на лету из CRM API
(`GET /api/public/scooter-models`).

## Что попадает на лендинг

Только модели из CRM (`Серия → Модели`), у которых **загружена аватарка**.
Если у модели нет аватарки — она на лендинг не идёт. Цены на карточках
(тарифы 1–3 дня / 30+ дней, «от ₽/день») берутся из БД и обновляются при
любом изменении в CRM без передеплоя лендинга.

## Локальный запуск

```bash
# 1. Подними API на :4000 (он отдаёт публичный роут /api/public/*)
pnpm --filter api dev

# 2. Подними лендинг на :5180
pnpm --filter landing dev

# Открой http://localhost:5180 — карточки придут с http://localhost:4000
```

В dev-режиме плейсхолдер `__API_URL__` в `<meta name="api-url">` не
подменён — JS-фолбэк идёт на `http://localhost:4000`.

Чтобы API разрешил CORS-запросы с лендинга, добавь в `apps/api/.env`:

```
CORS_ORIGINS=http://localhost:5173,http://localhost:5180
```

## Прод-сборка

Docker-образ собирается из корня монорепы:

```bash
docker build \
  -f apps/landing/Dockerfile \
  --build-arg API_URL=https://api.hulk-bike.ru \
  -t hulk-landing .
```

`API_URL` подставляется в HTML на этапе сборки — для разных окружений
(staging/prod) собирай отдельные образы.

## Деплой на Dokploy

См. `DEPLOY.md` в корне репо, секция «Landing».
