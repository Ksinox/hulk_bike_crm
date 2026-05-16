# Модуль «Должники» — план реализации

База: дизайн-mockup в `design/debtors/flow.html`. Этот документ — мост от
дизайна к коду: какие экраны нужны, какая логика связывает все точки,
в каком порядке делать.

## Архитектурные принципы

1. **Standalone-модуль.** Должники не лезут в существующие clients/rentals напрямую. У должника может быть `clientId` (ссылка на клиента CRM), может не быть (внешний человек). Привязка к rental — только через `relatedRentalId` опционально.
2. **State machine в коде, не в БД.** Стадии описаны Typescript-функцией с переходами. БД хранит текущую стадию строкой. Переходы валидируются на бэке.
3. **Двойные расчёты (фронт + бэк) синхронны.** Резолверы стадий, приоритета, графика — на обеих сторонах с одинаковыми юнит-тестами. Как было сделано для `billingPeriod`.
4. **Одна большая кнопка на экран.** Каждый экран знает свой главный шаг. State machine подсказывает следующий шаг — он рендерится primary action.
5. **Activity log** для каждого изменения стадии, платежа, звонка. Полная аудит-история.

---

## Экраны (16 шт)

### Группа A: Вход и навигация (4 экрана)

| # | Экран | Маршрут | Назначение |
|---|---|---|---|
| A1 | **Утро** | `/debtors` | Точка входа: hero-карточка самого срочного + 3 second-tier задачи + сводка |
| A2 | **Список** | `/debtors/list` | Полная таблица всех активных дел с фильтрами/сортировкой |
| A3 | **Pipeline** | `/debtors/pipeline` | Kanban по стадиям, drag-and-drop |
| A4 | **Архив** | `/debtors/archive` | Закрытые дела + ежемесячная статистика |

### Группа B: Создание (1 экран-wizard из 4 шагов)

| # | Экран | Маршрут | Шаги |
|---|---|---|---|
| B1 | **Новое дело** | `/debtors/new` | (1) Клиент существующий/новый → (2) Тип долга → (3) Подветка типа → (4) Сумма + психо-портрет + статус + комментарий |

### Группа C: Работа с делом (7 экранов)

| # | Экран | Маршрут | Назначение |
|---|---|---|---|
| C1 | **Дело** | `/debtors/:id` | Главная рабочая область: дерево стадий + decision panel + детали |
| C2 | **Платёж** | `/debtors/:id/payment` | Один шаг — зафиксировать платёж, live-предпросмотр |
| C3 | **Звонок** | `/debtors/:id/call` | Результат звонка: ответил/не дозвонился/обещал/отказался + дата напоминания |
| C4 | **Создать график** | `/debtors/:id/schedule` | Конструктор графика платежей (сумма/количество/частота → таблица) |
| C5 | **К юристу** | `/debtors/:id/transfer-lawyer` | Выбор юриста + причина + дедлайн |
| C6 | **Запись от юриста** | `/debtors/:id/lawyer-update` | Лог обновления от юриста: цитата/смета/следующий шаг |
| C7 | **Закрыть дело** | `/debtors/:id/close` | Причина закрытия (оплата/списание/мировая/суд) + фин. итоги |

### Группа D: Особые состояния (4 рендеринга экрана C1)

`Дело` физически один компонент, но рендерится по-разному в зависимости от `type`:

| # | Подтип | Особенности рендера |
|---|---|---|
| D1 | **ДТП виновник** | Tree с веткой признал/не признал, decision panel с эскалацией к юристу |
| D2 | **ДТП потерпевший** | Tree с веткой страховой, **блок «Финансовый прогноз»** (выплата − себестоимость = прибыль) |
| D3 | **Угон уголовный** | Тёмная шапка карточки, decision panel приглушённый («ждём приговор»), нет графика |
| D4 | **Просрочка аренды** | Tree с одной стадией, ссылка на rental, синхронизация с rental.debt |

### Группа E: Интеграция (2 точки)

| # | Точка | Где |
|---|---|---|
| E1 | **Dashboard widget** | Блок «Просроченные платежи» на главном дашборде CRM (`/dashboard`). 3 ведра: аренда / ущерб / рассрочка-выкуп. Клик → ведёт в `/debtors/list?filter=...` |
| E2 | **Linkback от rental** | На карточке аренды с хроническими просрочками появляется кнопка «Завести должника» — открывает wizard B1 с пре-заполненными полями |

**Итого: 16 экранов / маршрутов.**

---

## Логика и расчёты (8 модулей)

### 1. State Machine (`services/debtorStages.ts`)

Тип долга диктует конечный автомат. Хранится строкой `type:string` + `stage:string` в БД. Переходы валидируются.

```typescript
type DebtType = 'dtp_guilty' | 'dtp_victim' | 'damage' | 'theft' | 'rental_overdue';

type Stage =
  | 'created'           // только что заведён
  | 'pretrial'          // ДТП-виновник: досудебка
  | 'lawyer'            // у юриста
  | 'court'             // в суде
  | 'insurance_docs'    // ДТП-потерпевший: документы поданы
  | 'insurance_eval'    // оценка
  | 'insurance_wait'    // ждём выплату
  | 'payment_schedule'  // график платежей
  | 'police'            // заявление в полицию
  | 'criminal_case'     // уголовное дело
  | 'closed_paid'       // закрыто оплатой
  | 'closed_written_off'// списано
  | 'closed_settled'    // мировая
  | 'closed_court';     // решением суда

const TRANSITIONS: Record<DebtType, Record<Stage, Stage[]>> = {
  dtp_guilty: {
    created:           ['pretrial'],
    pretrial:          ['payment_schedule', 'lawyer'],
    lawyer:            ['payment_schedule', 'court'],
    court:             ['closed_court', 'closed_settled'],
    payment_schedule:  ['closed_paid', 'lawyer'],   // если перестал платить
  },
  dtp_victim: {
    created:           ['insurance_docs'],
    insurance_docs:    ['insurance_eval'],
    insurance_eval:    ['insurance_wait'],
    insurance_wait:    ['closed_paid'],
  },
  damage: {
    created:           ['payment_schedule'],
    payment_schedule:  ['closed_paid', 'lawyer'],
  },
  theft: {
    created:           ['pretrial'],
    pretrial:          ['payment_schedule', 'police'],
    payment_schedule:  ['closed_paid'],
    police:            ['criminal_case'],
    criminal_case:     ['closed_court'],
  },
  rental_overdue: {
    created:           ['payment_schedule'],
    payment_schedule:  ['closed_paid', 'lawyer'],
  },
};

function canTransition(type, fromStage, toStage): boolean;
function nextStages(type, stage): Stage[];
function isClosed(stage): boolean;
function isTerminal(stage): boolean; // не закрыт но и без действий (criminal_case)
```

### 2. Priority Sorting (`services/debtorPriority.ts`)

По схеме владельца: **сумма → психо-портрет → статус клиента**.

```typescript
function priorityScore(d: Debtor): [number, number, number] {
  return [
    -d.totalAmount,                            // больше → выше (DESC)
    d.psyRating ?? 3,                          // меньше (сложнее) → выше (ASC)
    d.clientStatus === 'closed' ? 0 : 1,       // закрытые выше
  ];
}

function sortByPriority(debtors: Debtor[]): Debtor[] {
  return [...debtors].sort((a, b) => {
    const sa = priorityScore(a);
    const sb = priorityScore(b);
    return sa[0] - sb[0] || sa[1] - sb[1] || sa[2] - sb[2];
  });
}

function getDailyTaskQueue(debtors: Debtor[]): Debtor[] {
  // На «Утро» — только те где есть hot/warm задача СЕГОДНЯ
  return debtors.filter(d => hasTodayAction(d));
}
```

### 3. Payment Schedule Builder (`services/debtorSchedule.ts`)

```typescript
type ScheduleFrequency = 'weekly' | 'biweekly' | 'monthly';

function buildSchedule(params: {
  totalAmount: number;
  count: number;
  startDate: Date;
  frequency: ScheduleFrequency;
}): { n: number; date: Date; amount: number }[] {
  const base = Math.floor(params.totalAmount / params.count);
  const remainder = params.totalAmount - base * params.count;
  return Array.from({length: params.count}, (_, i) => ({
    n: i + 1,
    date: addPeriod(params.startDate, i, params.frequency),
    amount: base + (i === params.count - 1 ? remainder : 0),
  }));
}

// Если клиент платит больше суммы платежа — распределяем между текущим
// и следующим, или закрываем досрочно (опция на UI).
function applyPayment(schedule, amount, today, mode: 'forward' | 'lump'): UpdatedSchedule;
```

### 4. Overdue Detection (`services/debtorOverdue.ts`)

```typescript
function isPaymentOverdue(p: Payment, today: Date): boolean {
  return !p.paidAt && new Date(p.scheduledDate) < today;
}

function getOverduePayments(debtor): Payment[];

function getConsecutiveOverdueCount(debtor): number {
  // Сколько просрочек подряд начиная от свежей неоплаченной
}

function hasSystematicViolations(debtor): boolean {
  return getConsecutiveOverdueCount(debtor) >= 3;
}

function overdueDays(debtor): number {
  // Дней с момента самого первого просроченного платежа
}
```

### 5. Lawyer Recommendation (`services/debtorRecommend.ts`)

```typescript
type Recommendation =
  | { kind: 'transfer_lawyer'; reason: string }
  | { kind: 'request_estimate'; reason: string }
  | { kind: 'close_paid'; reason: string }
  | { kind: 'call_again'; reason: string }
  | null;

function recommendNextAction(d: Debtor): Recommendation {
  // Правило 1: систематические нарушения на графике
  if (d.stage === 'payment_schedule' && hasSystematicViolations(d)) {
    return { kind: 'transfer_lawyer', reason: '3 просрочки подряд' };
  }
  // Правило 2: pretrial > 14 дней без подвижек
  if (d.stage === 'pretrial' && daysSince(d.stageEnteredAt) > 14) {
    return { kind: 'transfer_lawyer', reason: '14+ дней в досудебке' };
  }
  // Правило 3: lawyer > 21 день без подвижек
  if (d.stage === 'lawyer' && daysSince(d.lastLawyerUpdateAt) > 21) {
    return { kind: 'request_estimate', reason: '21+ день без отчёта юриста' };
  }
  // Правило 4: всё оплачено по графику
  if (d.stage === 'payment_schedule' && isFullyPaid(d)) {
    return { kind: 'close_paid', reason: 'все платежи закрыты' };
  }
  return null;
}
```

### 6. Profit Calculation (`services/debtorProfit.ts`)

Только для `dtp_victim`. Бизнес-смысл: страховая выплачивает по оценке, мы ремонтим скутер по себестоимости (она ниже), разница — наша прибыль.

```typescript
function calculateInsuranceProfit(d: Debtor): {
  estimate: number;       // оценка страховой
  payout: number;         // фактическая выплата
  repairCost: number;     // себестоимость ремонта
  profit: number;         // payout - repairCost
} | null {
  if (d.type !== 'dtp_victim') return null;
  if (!d.insurancePayout || !d.repairCost) return null;
  return {
    estimate: d.insuranceEstimate ?? 0,
    payout: d.insurancePayout,
    repairCost: d.repairCost,
    profit: d.insurancePayout - d.repairCost,
  };
}
```

### 7. Today's Action Resolver (`services/debtorToday.ts`)

Для «Утра»: что сегодня требует внимания?

```typescript
type TodayAction = {
  kind: 'overdue' | 'reminder' | 'lawyer_check' | 'payment_due' | 'systematic';
  priority: 'hot' | 'warm' | 'cool';
  text: string;
  primaryAction: { label: string; route: string };
};

function getTodayAction(d: Debtor, today: Date): TodayAction | null {
  // Hot: систематическое нарушение
  if (hasSystematicViolations(d)) return {
    kind: 'systematic',
    priority: 'hot',
    text: '3-я просрочка подряд · рекомендация юристу',
    primaryAction: { label: 'Передать юристу', route: `/debtors/${d.id}/transfer-lawyer` },
  };
  // Hot: длинная просрочка платежа
  if (getOverdueDays(d) >= 3) return {
    kind: 'overdue',
    priority: 'hot',
    text: `Просрочка ${getOverdueDays(d)} дня · позвонить`,
    primaryAction: { label: 'Открыть и разобраться', route: `/debtors/${d.id}` },
  };
  // Warm: напоминание (звонок в страховую, follow-up)
  if (hasReminderToday(d, today)) return { ... };
  // Cool: плановый платёж сегодня
  if (hasPaymentToday(d, today)) return { ... };
  return null;
}

function getHottest(debtors, today) {
  // Возвращает 1 самый горячий кейс — это становится hero-карточкой
}
```

### 8. Dashboard Widget Stats (`services/debtorDashboard.ts`)

Для виджета в существующем дашборде CRM:

```typescript
function getDashboardOverdueStats(debtors, today) {
  return {
    buckets: {
      rental: filterOverdue(debtors, 'rental_overdue'),
      damage: filterOverdue(debtors, ['damage', 'dtp_guilty']),
      installment: filterOverdue(debtors, 'installment'), // если будут
    },
    totalSum: sumBy(allOverdue, 'remainingAmount'),
    topByBucket: pickTop3PerBucket(debtors),
  };
}
```

---

## Схема БД (миграция `0044_debtors.sql`)

```sql
-- enums
CREATE TYPE debtor_type AS ENUM (
  'dtp_guilty', 'dtp_victim', 'damage', 'theft', 'rental_overdue'
);

CREATE TYPE debtor_stage AS ENUM (
  'created', 'pretrial', 'lawyer', 'court',
  'insurance_docs', 'insurance_eval', 'insurance_wait',
  'payment_schedule', 'police', 'criminal_case',
  'closed_paid', 'closed_written_off', 'closed_settled', 'closed_court'
);

CREATE TYPE debtor_client_status AS ENUM ('active', 'closed');

-- основная таблица
CREATE TABLE debtors (
  id              BIGSERIAL PRIMARY KEY,
  case_number     TEXT NOT NULL UNIQUE,        -- D-001, D-002 и т.д.
  client_id       BIGINT REFERENCES clients(id) ON DELETE SET NULL,
  external_name   TEXT,                         -- если не в CRM
  external_phone  TEXT,
  type            debtor_type NOT NULL,
  stage           debtor_stage NOT NULL DEFAULT 'created',
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_amount    INTEGER NOT NULL,             -- ₽
  psy_rating      INTEGER NOT NULL CHECK (psy_rating BETWEEN 1 AND 5),
  client_status   debtor_client_status NOT NULL DEFAULT 'active',
  comment         TEXT,
  -- insurance specific
  insurance_company    TEXT,
  insurance_estimate   INTEGER,
  insurance_payout     INTEGER,
  repair_cost          INTEGER,
  -- lawyer
  lawyer_name          TEXT,
  last_lawyer_update_at TIMESTAMPTZ,
  -- related entities
  related_rental_id    BIGINT REFERENCES rentals(id) ON DELETE SET NULL,
  -- closing
  closed_at            TIMESTAMPTZ,
  closed_reason        TEXT,
  -- audit
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
);

-- платежи
CREATE TABLE debtor_payments (
  id              BIGSERIAL PRIMARY KEY,
  debtor_id       BIGINT NOT NULL REFERENCES debtors(id) ON DELETE CASCADE,
  n               INTEGER NOT NULL,             -- номер в графике
  scheduled_date  DATE NOT NULL,
  scheduled_amount INTEGER NOT NULL,
  paid_at         TIMESTAMPTZ,
  paid_amount     INTEGER,
  paid_method     TEXT CHECK (paid_method IN ('transfer', 'cash')),
  paid_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (debtor_id, n)
);

-- лог звонков
CREATE TABLE debtor_calls (
  id            BIGSERIAL PRIMARY KEY,
  debtor_id     BIGINT NOT NULL REFERENCES debtors(id) ON DELETE CASCADE,
  outcome       TEXT NOT NULL CHECK (outcome IN ('answered','no_answer','promised','refused')),
  promised_date DATE,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id       BIGINT REFERENCES users(id) ON DELETE SET NULL
);

-- журнал смены стадий
CREATE TABLE debtor_stage_events (
  id          BIGSERIAL PRIMARY KEY,
  debtor_id   BIGINT NOT NULL REFERENCES debtors(id) ON DELETE CASCADE,
  from_stage  debtor_stage,
  to_stage    debtor_stage NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL
);

-- произвольные заметки
CREATE TABLE debtor_notes (
  id          BIGSERIAL PRIMARY KEY,
  debtor_id   BIGINT NOT NULL REFERENCES debtors(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL
);

-- индексы
CREATE INDEX idx_debtors_stage ON debtors(stage) WHERE NOT stage::text LIKE 'closed_%';
CREATE INDEX idx_debtors_client ON debtors(client_id);
CREATE INDEX idx_debtors_rental ON debtors(related_rental_id);
CREATE INDEX idx_debtor_payments_due ON debtor_payments(scheduled_date) WHERE paid_at IS NULL;
```

---

## API endpoints

```
GET    /api/debtors                   список (фильтры по stage, type, search)
GET    /api/debtors/today             dashboard для «Утра» — hottest + queue
GET    /api/debtors/dashboard-stats   виджет для главного дашборда CRM
GET    /api/debtors/:id               детали + payments + stage history
POST   /api/debtors                   создать дело (wizard завершение)
PATCH  /api/debtors/:id               обновить поля (комментарий, психо и т.п.)
DELETE /api/debtors/:id               soft-delete (только creator)

POST   /api/debtors/:id/transition    сменить стадию (валидируется state machine)
POST   /api/debtors/:id/schedule      создать график платежей
POST   /api/debtors/:id/payments      зафиксировать платёж
PATCH  /api/debtors/:id/payments/:pid править/откатить платёж
POST   /api/debtors/:id/calls         залогать звонок
POST   /api/debtors/:id/notes         добавить заметку
POST   /api/debtors/:id/transfer-lawyer  передать юристу
POST   /api/debtors/:id/lawyer-update    запись от юриста
POST   /api/debtors/:id/close            закрыть дело
```

---

## Тесты (по vitest, как для billing-period)

**Unit-tests (бэк + фронт зеркально):**
1. `debtorStages.test.ts` — все переходы для всех 5 типов: разрешённые / запрещённые / финальные
2. `debtorPriority.test.ts` — табличные кейсы сортировки на разных combinations
3. `debtorSchedule.test.ts` — графики (3/5/10 платежей, разные суммы, остаток на последнем)
4. `debtorOverdue.test.ts` — детекция (граничные даты, 0/1/3/5 подряд)
5. `debtorRecommend.test.ts` — все правила эскалации
6. `debtorProfit.test.ts` — прибыль с страховой
7. `debtorToday.test.ts` — hottest pick из набора debtors

**Сценарные тесты:**
8. Полный цикл «ДТП виновник»: created → pretrial → не признал → lawyer → признал → schedule → закрыто
9. Полный цикл «ДТП потерпевший»: created → docs → eval → wait → paid + проверка profit
10. Систематические нарушения: 3 пропущенных платежа → recommend lawyer
11. Drag-drop в pipeline: переход через UI = тот же transition в БД
12. Wizard B1: пред-заполнение из linkback аренды

**Интеграционные:**
13. API CRUD + transition validation
14. Параллельная подача 2 действий: оптимистическая блокировка через `updated_at`

---

## Порядок реализации (фазы)

### Фаза 1 — фундамент (этот заход)
- vitest setup (на этой ветке от main его ещё нет)
- миграция 0044_debtors.sql + schema.ts
- services/debtorStages.ts + tests
- services/debtorPriority.ts + tests
- services/debtorSchedule.ts + tests
- services/debtorOverdue.ts + tests

### Фаза 2 — backend полностью
- services/debtorRecommend, debtorProfit, debtorToday + tests
- routes/debtors.ts полный CRUD + actions
- интеграционные тесты API
- activity log интеграция

### Фаза 3 — фронт core
- React Router routes
- /lib/api/debtors.ts (TanStack Query хуки)
- /lib/debtors/* — зеркальные резолверы + тесты
- Sidebar nav entry
- Empty state экран

### Фаза 4 — главные экраны
- Утро (A1)
- Новое дело wizard (B1)
- Дело — главный workspace (C1)
- Платёж (C2)

### Фаза 5 — вторичные экраны
- Звонок, Создать график, К юристу, Запись от юриста, Закрыть дело
- Полный список (A2)

### Фаза 6 — обзорные и интеграции
- Pipeline (A3)
- Архив (A4)
- Dashboard widget (E1)
- Linkback от rental (E2)

### Фаза 7 — полировка
- Документы / заметки
- Хроника
- Хоткеи
- Preview-тестирование по чеклисту

---

## Чего НЕ делаем в первой версии

- **Множественные должники у одного клиента в едином профиле.** Каждый кейс — отдельная запись. Если у клиента 3 долга — 3 записи. Позже можно сгруппировать.
- **Автоматическая синхронизация с rental.debt.** Пока handled вручную: оператор сам решает завести «должника» из аренды.
- **Лидерборд между админами.** Один оператор = одна работа.
- **Роль юриста как пользователь CRM.** Юрист — текстовое поле в карточке, а не учётка. Доработаем позже.
- **Дашборд по конверсии (% дел дошедших до оплаты).** В Фазе 2/3.
- **Уведомления (email/push) о просрочках.** Только in-app badge через `dot-pulse` на иконке должников в sidenav. Email-уведомления — отдельная задача.

---

Готов плану. Дальше — действия.
