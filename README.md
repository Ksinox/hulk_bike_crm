# Халк Байк CRM

CRM-система для компании «Халк Байк» — прокат и обслуживание скутеров.

## Структура

```
apps/
  web/       — React + Vite + TS + Tailwind + shadcn/ui (фронтенд, работает и в браузере, и внутри Electron)
  desktop/   — Electron-обёртка с авто-обновлением через GitHub Releases

design/
  claude-design/  — исходники дизайна (Dashboard Hi-Fi из Claude Design)
```

## Разработка

```bash
pnpm install
pnpm --filter web dev        # веб-версия: http://localhost:5173
pnpm --filter desktop dev    # Electron в dev-режиме (загружает localhost:5173)
```

## Релиз desktop-версии

1. Обнови версию в `apps/desktop/package.json` (и `apps/web/public/version.json` для web).
2. Закоммить, пушни тег `vX.Y.Z` — GitHub Action соберёт Windows-установщик и опубликует Release.
3. У установленных клиентов обновление подхватится автоматически при следующем запуске.

Подробности — в [CLAUDE.md](CLAUDE.md).
