# Disaster Recovery — Халк Байк CRM

**Если что-то сломалось — открой этот файл и иди по шагам.** Документ
написан так, чтобы ты мог восстановить систему **без знания программирования**.
Везде где сложно — есть готовый промпт, который надо скопировать и
отправить Claude/Codex/любому AI-помощнику. Он сделает всё сам.

---

## Что вообще произошло — выбери своё

Найди ситуацию которая ближе всего к тебе и переходи в нужный раздел:

- 🟢 **«Я хочу проверить что бэкапы работают»** → раздел 1
- 🟡 **«CRM не открывается / Bad Gateway / 500»** → раздел 2
- 🟡 **«В CRM пусто, нет клиентов / аренд / скутеров»** → раздел 3
- 🟠 **«Я случайно удалил данные»** → раздел 4
- 🔴 **«Сервер недоступен совсем (украли VPS / заблокировали)»** → раздел 5

---

## 1. Проверить что бэкапы работают

**Раз в 2 недели открывай и проверяй:**

### Шаг 1.1 — посмотреть что бэкапы вообще создаются на GitHub

1. Открой в браузере: https://github.com/Ksinox/hulk_bike_crm/actions
2. Слева в списке найди **«Backup DB»** → кликни
3. Должен быть список запусков. Зелёный кружок ✓ — ОК. Красный ✗ — что-то не так.
4. Кликни последний зелёный → внизу страницы блок **Artifacts** → должен
   быть файл `hulk-backup-...` весом ≥1 КБ.

**Если последний запуск красный** → раздел 6 «Бэкап на GitHub упал».

### Шаг 1.2 — скачать свежий бэкап на свой компьютер

1. На странице последнего успешного запуска **Backup DB** → нажми на файл
   `hulk-backup-<id>` в блоке Artifacts.
2. Скачается .zip файл. Внутри `hulk-backup-YYYY-MM-DD.json.gz`.
3. **Сохрани в надёжное место** на своём компьютере / в облако
   (Google Drive, Яндекс.Диск). Это полная копия БД на эту дату.

**Готово.** У тебя есть страховка на случай катастрофы.

---

## 2. CRM не открывается / 500 / Bad Gateway

### Шаг 2.1 — посмотреть статус API

1. Открой в браузере: https://api.hulkbike.ru/health
2. Должно быть `{"ok":true,"env":"production"}` — значит API работает.
3. Если **502 Bad Gateway** или **503** — API упал. Иди в шаг 2.2.
4. Если **200 ok=true** но CRM не работает — иди в шаг 2.3.

### Шаг 2.2 — поднять упавший API

1. Открой Dokploy: http://104.128.128.96:3000 → войди.
2. Слева **Projects** → `hulk-bike-crm` → **hulk-api**.
3. Найди блок **«Deploy Settings»** (наверху).
4. Нажми **Rebuild** (иконка ключа). Подтверди.
5. Жди 1-2 минуты. Внизу страницы появится статус деплоя — дождись зелёного **Done**.
6. Открой https://api.hulkbike.ru/health → должно быть `{"ok":true}`.

**Если после Rebuild всё ещё 502:**
1. В Dokploy → hulk-api → вкладка **Logs**.
2. Скопируй последние 30 строк лога.
3. **Скопируй и вставь в Claude/Codex этот промпт:**

```
Я разработчик проекта Халк Байк CRM (репо github.com/Ksinox/hulk_bike_crm).
API контейнер не стартует, выдаёт 502 Bad Gateway. Вот логи из Dokploy:

[ВСТАВЬ СЮДА СВОИ ЛОГИ]

Прочитай apps/api/src/index.ts и apps/api/src/db/migrate.ts. Найди
причину почему контейнер падает на старте. Если это рассинхрон схемы БД —
дай SQL который надо применить через psql в контейнере hulk-postgres.
Если это ошибка кода — предложи фикс с конкретным diff.
```

### Шаг 2.3 — API живой но CRM пустая (см. раздел 3)

---

## 3. CRM открывается но в ней пусто — нет клиентов / аренд / скутеров

Это значит **БД схема рассинхронизирована** — добавлены новые колонки в
коде, но в БД их нет, API ругается 500 на запросах.

### Шаг 3.1 — проверь что данные физически в БД

1. Зайди в CRM как **создатель** (creator).
2. Нажми **F12** (откроется DevTools).
3. Перейди на вкладку **Console** в DevTools.
4. Если попросит «введите разрешить вставку» — введи и нажми Enter.
5. Скопируй и вставь:

```javascript
fetch('https://api.hulkbike.ru/api/_diag/counts', {credentials: 'include'}).then(r => r.json()).then(console.log)
```

6. Жми Enter. Должен вывести что-то типа:
   `{users: 3, clients: 5, scooters: 4, rentals: 7, ...}`
7. **Если числа > 0** — данные на месте, проблема в схеме. Иди в шаг 3.2.
8. **Если все нули или ошибка** — данные потеряны, иди в раздел 4 (восстановление).

### Шаг 3.2 — починить схему БД

1. Открой Dokploy: http://104.128.128.96:3000.
2. Слева **Projects** → `hulk-bike-crm` → **hulk-postgres**.
3. Нажми **«Open Terminal»** или похожую кнопку (терминал в контейнере БД).
4. В терминале набери и нажми Enter:
   ```
   psql -U hulk -d hulk
   ```
5. Должно появиться приглашение `hulk=#`.
6. **Скопируй и вставь весь блок ниже** одним куском, потом Enter:

```sql
ALTER TABLE clients ADD COLUMN IF NOT EXISTS source_custom text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_foreigner boolean DEFAULT false NOT NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS passport_raw text;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS archived_by text;
ALTER TABLE scooter_models ADD COLUMN IF NOT EXISTS fuel_l_per_100km numeric(4, 2);
ALTER TABLE scooter_models ADD COLUMN IF NOT EXISTS day_rate integer DEFAULT 1300 NOT NULL;
ALTER TABLE scooter_models ALTER COLUMN short_rate SET DEFAULT 700;
ALTER TABLE scooter_models ADD COLUMN IF NOT EXISTS active boolean DEFAULT true NOT NULL;
\q
```

7. Закрой терминал. Обнови страницу CRM (Ctrl+Shift+R).
8. Всё должно появиться.

**Если в коде появились НОВЫЕ миграции после этого документа** — открой
любой Claude и отправь:

```
Открой файлы apps/api/drizzle/*.sql в репо github.com/Ksinox/hulk_bike_crm.
Дай мне один блок SQL со всеми ALTER TABLE из этих файлов, обёрнутыми
в IF NOT EXISTS, чтобы я мог скопировать его в psql на проде и догнать
схему БД. Только ALTER TABLE и ADD COLUMN, без CREATE TABLE.
```

Получишь свежий блок — скопируй в psql как в шаге 6.

---

## 4. Я случайно удалил данные — нужно откатиться

### Шаг 4.1 — какие данные потеряны

- **Аренда / клиент / скутер был удалён через UI** — посмотри в архиве
  (CRM → Аренды → фильтр «Архив» / Скутеры → вкладка Архив). Если там —
  кнопка «Восстановить».
- **Целая таблица пуста / половина записей пропала** — нужен бэкап,
  иди в шаг 4.2.

### Шаг 4.2 — восстановить из бэкапа

⚠ **Это сотрёт текущие данные в таблицах** и заменит их данными из бэкапа.
Если что-то полезное было создано после бэкапа — оно потеряется.

#### Сначала сохрани текущее состояние (на всякий случай)
В CRM → DevTools → Console:
```javascript
fetch('https://api.hulkbike.ru/api/_diag/backup', {method:'POST', credentials:'include'}).then(r => r.json()).then(console.log)
```
Это создаст «снимок до восстановления». Если ошибётся — есть к чему вернуться.

#### Скачай бэкап нужной даты
1. https://github.com/Ksinox/hulk_bike_crm/actions/workflows/backup.yml
2. Кликни run за нужное число (например вчера если сегодня случилось).
3. Скачай .zip из Artifacts → распакуй → получишь .json.gz файл.

#### Запусти восстановление
**У тебя нет программистских знаний — отправь Claude/Codex:**

```
Я администратор Халк Байк CRM. Случайно удалил данные. У меня есть бэкап:
файл `hulk-backup-2026-04-26.json.gz` лежит в C:\Users\<твоё-имя>\Downloads\.

Помоги откатить базу данных на проде с этого бэкапа. БД на сервере
104.128.128.96 порт 5432. Креды есть в Dokploy → hulk-postgres → env.

В репо github.com/Ksinox/hulk_bike_crm есть скрипт scripts/restore_from_backup.py
— используй его. Шаги распиши прям пошагово что мне нажимать на моём
Windows компьютере.
```

Claude даст команды вида:
```
1. Открой PowerShell
2. cd C:\Users\<...>\hulk_bike_crm
3. pip install psycopg2-binary
4. $env:DATABASE_URL = "postgres://hulk:PASSWORD@104.128.128.96:5432/hulk"
5. python scripts/restore_from_backup.py "C:\...\hulk-backup-2026-04-26.json.gz"
```

Выполни — скрипт сам всё сделает. В конце напишет «✓ Восстановление завершено».

---

## 5. Сервер недоступен совсем — катастрофа

VPS 104.128.128.96 не отвечает. Может быть:
- Хостер заблокировал
- Жёсткий диск умер
- Атака / отказ в обслуживании

Что у тебя ЕСТЬ независимо от сервера:
- ✅ Весь код на GitHub
- ✅ Все бэкапы БД на GitHub Actions Artifacts (последние 90 дней)
- ❌ Файлы клиентов (фото паспорта, документы) — потеряны вместе с MinIO

### Шаг 5.1 — взять новый VPS

1. Купить VPS на любом хостинге (Hetzner / Timeweb / RU-VDS / VK Cloud).
   Минимум: Ubuntu 22.04+, 2 ГБ RAM, 30 ГБ SSD. ~500-800 руб/мес.
2. Получить IP адрес и пароль root.
3. Подключиться по SSH:
   - Скачать **PuTTY** или открыть PowerShell.
   - `ssh root@<новый-ip>` → ввести пароль.

### Шаг 5.2 — установить Dokploy на новый сервер

В SSH-консоли вставь команду и Enter:
```bash
curl -sSL https://dokploy.com/install.sh | sh
```
Жди 5-10 минут. В конце напишет адрес: `http://<ip>:3000`.
Открой его в браузере → создай админ-аккаунт.

### Шаг 5.3 — попроси Claude развернуть всю инфру

**Скопируй и отправь Claude:**

```
Я Руслан, владелец Халк Байк CRM. Старый сервер 104.128.128.96 умер.
Купил новый VPS, IP: <НОВЫЙ-IP>. Установил на нём Dokploy, открыл UI на
http://<НОВЫЙ-IP>:3000, создал админа, получил Dokploy API токен.

Репо проекта: https://github.com/Ksinox/hulk_bike_crm
В нём есть `DISASTER_RECOVERY.md` (этот файл) и папка scripts/ со
скриптами создания сервисов.

Помоги развернуть с нуля:
1. Postgres (имя hulk-postgres, БД hulk, юзер hulk, пароль придумать сильный)
2. MinIO (для файлов и бэкапов)
3. API (apps/api/Dockerfile, env переменные смотри в scripts/deploy_api.py)
4. Web (apps/web/Dockerfile, нужен build arg VITE_API_URL=https://новый-домен-api)
5. Landing (apps/landing/Dockerfile)

Распиши пошагово что делать в Dokploy UI или дай готовые скрипты для
запуска через API. Я не программист, мне нужны клики.

Dokploy токен у меня есть, готов вставить в скрипт.
```

Claude проведёт по шагам.

### Шаг 5.4 — восстановить данные из бэкапа

После того как новый сервер поднят и API работает на новом домене —
смотри **раздел 4.2** «Восстановить из бэкапа». БД на новом сервере
будет пустая, скрипт `restore_from_backup.py` загрузит данные из
последнего GitHub Artifact.

### Шаг 5.5 — переключить домены

Если домены `crm.hulkbike.ru`, `api.hulkbike.ru`, `hulkbike.ru`
управляются через Reg.ru / Beget / другой регистратор:
1. Зайди в личный кабинет регистратора.
2. **DNS-записи** → найди A-записи всех 3 доменов.
3. Поменяй IP с `104.128.128.96` на **новый IP** сервера.
4. Сохрани. Через 5-15 минут DNS обновится.

Также в Dokploy на новом сервере — для каждого приложения добавь
домены вручную (Domains → Add) и Let's Encrypt сертификат.

---

## 6. Бэкап на GitHub упал

Если в **github.com/Ksinox/hulk_bike_crm/actions** workflow «Backup DB»
несколько дней подряд красный:

### Шаг 6.1 — посмотреть причину
1. Кликни последний красный run.
2. Открой шаг с ❌.
3. Прочитай ошибку.

### Шаг 6.2 — типичные причины

- **«BACKUP_TOKEN secret не задан»** → нужно добавить:
  - GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
  - Name: `BACKUP_TOKEN`
  - Value: значение env переменной `BACKUP_TOKEN` из Dokploy → hulk-api → Environment.
  - Если в Dokploy её тоже нет — добавь там новую (придумай длинный случайный
    токен), сделай Rebuild API, потом скопируй то же значение в GitHub Secret.

- **«HTTP 503 / no_backup_available»** → API не отвечает или MinIO упал.
  Сначала проверь раздел 2 (API).

- **«curl: SSL certificate problem»** → проблема с сертификатом домена
  api.hulkbike.ru. Открой Dokploy → hulk-api → Domains → перевыпусти Let's Encrypt.

**Если ничего из этого не помогло — отправь Claude:**

```
В моём проекте github.com/Ksinox/hulk_bike_crm есть workflow
.github/workflows/backup.yml. Он падает с ошибкой:

[ВСТАВЬ ОШИБКУ ИЗ GITHUB ACTIONS]

Помоги починить. Я не программист, нужны конкретные шаги.
```

---

## Полезные ссылки одной кучей

| Что | Где |
|---|---|
| Код проекта | https://github.com/Ksinox/hulk_bike_crm |
| Бэкапы (свежие) | https://github.com/Ksinox/hulk_bike_crm/actions/workflows/backup.yml → Artifacts |
| Dokploy UI | http://104.128.128.96:3000 |
| CRM (web) | https://crm.hulkbike.ru |
| API | https://api.hulkbike.ru |
| Лендинг | https://hulkbike.ru |
| Логи API | Dokploy → hulk-api → Logs |
| psql в Postgres | Dokploy → hulk-postgres → Open Terminal → `psql -U hulk -d hulk` |

---

## Универсальный промпт для любой проблемы

Если не знаешь что делать — отправь Claude/Codex/другому AI:

```
Я Руслан, владелец Халк Байк CRM. Проект в github.com/Ksinox/hulk_bike_crm.
Стек: React + Fastify + Postgres + MinIO, всё на Dokploy на VPS 104.128.128.96.

Проблема:
[ОПИШИ ЧТО НЕ РАБОТАЕТ — что нажал, что увидел, скриншот ошибки если есть]

Прочитай DISASTER_RECOVERY.md в репо — там описаны типовые ситуации.
Если моя проблема похожа на одну из них — скажи на какую и проведи
по шагам. Если не похожа — посмотри код в репо, найди причину, предложи
конкретные действия. Я НЕ программист, мне нужны клики и готовые
команды для копипаста.
```

Этот промпт работает в Claude (claude.ai), GitHub Copilot Chat,
Codex CLI и большинстве других AI-помощников.
