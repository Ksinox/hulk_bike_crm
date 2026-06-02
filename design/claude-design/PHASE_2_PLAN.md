# Phase 2 — Редизайн карточки аренды (RentalCard v0.6)

Эта памятка нужна Claude-у при возобновлении работы. В ней — что уже принято,
что в Phase 1 сделано, и что должно появиться в Phase 2.

## Ветка

`feature/redesign-rental-card-v0.6` (от main после Phase 1 мержа `c9d5d1f`)
Откат: `git reset --hard checkpoint/before-phase-1-merge-2026-05-12`

## Preview-окружение (Dokploy)

- API: https://api-preview.104-128-128-96.sslip.io
- Web: https://crm-preview.104-128-128-96.sslip.io
- Учётки: `ruslan / preview2026`, `director / preview2026`, `admin / preview2026`
- Auto-deploy на push в `feature/redesign-rental-card-v0.6`
- Принудительно: `python scripts/redeploy_preview.py`

## Что в проде после Phase 1 (v0.5.9)

Это всё **остаётся**, новая карточка использует:

**БД и API:**
- Статусы в БД только `active` и `completed`. Просрочка/возврат сегодня — computed на фронте через `effectiveRentalStatus()`.
- Удалены мёртвые поля чеклиста (`confirm_contract_signed`, `confirm_rent_paid`, `confirm_deposit_received`, `payment_confirmed_*`).
- Архивация по расчётному периоду — cron `scheduleRentalArchive()` раз в час, переносит completed-аренды прошлого периода в архив (15-е число — граница).
- /complete с `damageAmount > 0` создаёт полноценный damage_report с авто-позицией.
- POST `/api/rentals/:id/revert-completion` — возврат завершённой в active.
- /api/clients возвращает `unpaidDamageDebt` — агрегат непогашенного ущерба по всем арендам клиента.
- `manual_payment` через /debt/payment теперь создаёт payment(type='rent') → попадает в paidIn.
- PaymentAcceptDialog имеет target `security` — пополнение rental.deposit через /security-topup.
- Bootstrap users + price-list для preview (гейтится ALLOW_BOOTSTRAP_USERS=1).

**Залог:**
- `rental.deposit` (текущий) + `rental.depositOriginal` (исходный) — единственный источник правды.
- `depositItem` подтягивается через rentalAdapter.
- SecurityTopupDialog удалён — всё через PaymentAcceptDialog.

**Документы:**
- Досудебная претензия с таблицей позиций и ценами (поля № / Наименование / Цена / Кол-во / Сумма).
- Печать акта возврата автоматом после /complete.

**UI вне карточки:**
- ClientCard: красная плашка «Долг по ущербу: N ₽».
- NewRentalModal: красный бейдж «⚠ долг N ₽» в пикере клиентов.
- AddScooterModal: валидация года 1980..currentYear+1.

## Решения из переговоров (закреплены)

| # | Что | Решение |
|---|---|---|
| 1 | «Склад Северный» | Удалить — это hardcoded остаток. |
| 2 | Рейтинг клиента | Пропустить, проработка позже. |
| 3 | Цвет/фото клиента | Из существующего clientAdapter (как в списке клиентов). |
| 4 | altPhone | Показывать «Доп. телефон — нет» если пусто. |
| 5 | depositSource | Захардкоженный текст «На балансе компании». При предметном залоге → иконка предмета. |
| 6 | Diff payload в активити | Максимально подробный (поле, было, стало, кто, когда). |
| 7 | Tasks drawer | НЕ внедряем. |
| 8 | Документы | DocsInline grid внизу страницы, не вкладка и не drawer. |
| 9 | Вкладки | Полностью отменены. Всё плоско на странице или в drawer'ах. |
| 10 | Vertical action rail | Нет. |
| 11 | Продление | Двумя способами: drag-handle на основном календаре + кнопка «Принять оплату». Оба ведут в bottom drawer (PaymentAcceptDialog). |
| 12 | Кнопки overdue | Наши: «Простить дни / Простить штраф / Простить всё / Принять оплату». Без «паузы». |
| 13 | «Эта аренда» | rental.sum (включает купленные просроченные дни). |
| 14 | Тарифные ярлыки | Наши: short / day / week / month. |
| 15 | extensions count | Число продлений по аренде (chain отменены). |
| 16 | Реакция клиента на акт | Убрана. Претензия печатается всегда, независимо от согласия. |
| 17 | client_applications | Оставляем (публичная анкета по ссылке). |
| 18 | ClientCard в drawer | Реальный полный компонент ClientCard, не урезанный профиль. |

## Дизайн-референсы

Папка `design/claude-design/Hulk Bike CRM/`:
- `rental-card.jsx` — главный layout
- `extension-drawer.jsx` — bottom sheet для продления/оплаты
- `calendar.jsx` — drag-to-extend с тремя зонами (синий/красный/зелёный)
- `activity-feed.jsx` — с diff payload и фильтрами
- `overdue-actions.jsx` — popover для просрочки
- `data.jsx` — mock data shape (полезно сверить поля)

## Структура новой карточки

```
┌──────────────────────────────────────────────────────────────┐
│ Identity strip (#0042 + статус + бейдж долга если есть)       │
│                                                                │
│ MASTER BLOCK (3 columns, grid-cols-[2fr_1fr_1fr]):            │
│ ┌─ Client ───┐ ┌─ Scooter ──┐ ┌─ Equipment ──┐               │
│ │ photo card │ │ poster img │ │ chips list   │               │
│ │ name link  │ │ Jog #01    │ │ swap inline  │               │
│ │ contacts   │ │ Yamaha Jog │ │ + Add btn    │               │
│ │ deposit    │ │ Тариф      │ │              │               │
│ │ depBalance │ │            │ │              │               │
│ └────────────┘ └────────────┘ └──────────────┘               │
├──────────────────────────────────────────────────────────────┤
│ KPI strip:                                                    │
│ [Срок|осталось N дн] [Эта аренда] [За всё время] [Долг] ...  │
│                              [Принять оплату] [Завершить]    │
├──────────────────────────────────────────────────────────────┤
│ ┌─ Calendar Panel (1fr) ────────┐ ┌─ History Strip (360px) ─┐│
│ │ Месяц с drag-handle           │ │ • Оплата 500₽            ││
│ │ blue = период, red = просрочка│ │ • Замена шлема           ││
│ │ green = preview extension     │ │ ...                      ││
│ └───────────────────────────────┘ └──────────────────────────┘│
├──────────────────────────────────────────────────────────────┤
│ DocsInline grid (4 columns):                                  │
│ [Договор] [Акт П-П] [Паспорт] [Загрузить +]                  │
├──────────────────────────────────────────────────────────────┤
│ (NO TABS — всё через drawers выше)                            │
└──────────────────────────────────────────────────────────────┘

DRAWERS (Sheet from right):
- history  — полная лента с diff/filter/search
- debts    — список долговых периодов + damage_reports
- profile  — полный ClientCard внутри
- (НЕТ tasks drawer)

BOTTOM DRAWER (extending):
- "Принять оплату по аренде #N"
- amount input + method (cash/transfer)
- distribution preview (rent/overdue/fine/damage/manual/security/deposit)
- if overpay: targets [В залог / В депозит / В продление]
- calendar showing extension preview (drag inline)
```

## Хуки и API для новой карточки

```ts
useApiRental(id)            // одна аренда
useRentalDebt(id)           // debtSummary
useApiPayments(rentalId)    // chainPayments
useChainDamageReports(id)   // damage reports + items
useActivityTimeline(id)     // events
useApiClient(clientId)      // full client
useApiScooter(scooterId)    // scooter
useApiEquipment()           // catalog для swap
useDebtAggregate()          // дашбордный агрегат
effectiveRentalStatus()     // computed: active/overdue/returning/completed
useResetRentalChain         // admin: очистить
useDeleteRental             // archive
usePurgeRental              // полное удаление
```

## Открытые items для Phase 2

1. **Выбор статуса скутера при /complete** (ремонт/парк/разборка/активная аренда) — диалог завершения должен спрашивать. Бэк: добавить `scooterNextStatus` в /complete body.
2. **Acт о повреждениях экипировки**: при выборе ущерба экипировки в завершении — автоматически открывать DamageReportDialog с предзаполненными позициями экипировки.
3. **Прейскурант на проде**: нужно один раз дёрнуть /api/price-list/_seed (требует creator-auth) чтобы прейскурант появился.
4. **Унификация «Произвольный тариф»**: показывается только при target=extend в PaymentAcceptDialog (уже сделано в v0.5.9).

## Принципы реализации

- Tailwind 4 + shadcn/ui (как везде в проекте).
- `react-aria-components` для календаря (уже используется в PaymentAcceptDialog v0.4.85).
- `@tanstack/react-router` для навигации.
- `@tanstack/react-query` invalidate после каждой mutation.
- Сохранять drawer-stacking (ClientCard в drawer не теряет контекст аренды).
- Все popover'ы и picker'ы — отдельные мелкие компоненты, не inline в RentalCard.
- Старые диалоги (PaymentAcceptDialog, EquipmentChangeDialog, SwapScooterDialog) — реюзаем, не переписываем.
- RentalCardTabs.tsx и RentalActionDialog.tsx — заменяются полностью.

## Деплой/тестирование

- Push в `feature/redesign-rental-card-v0.6` → auto-deploy preview.
- Workflow: build локально (pnpm --filter web build, не только typecheck!) → commit → push → wait Monitor → user тестирует на preview.
- Перед мержем в main: чекпоинт-тег `checkpoint/before-phase-2-merge-YYYY-MM-DD`.

## Стек коммитов Phase 1 (для контекста)

```
c9d5d1f Merge: Phase 1 — БД, статусы, единый залог, долг клиента (v0.5.0 → v0.5.9)
41dd37b fix(0.5.9): KPI хинт залога-предмета, target «В залог» в overpay, печать акта возврата
fa52edf fix(0.5.8): «Пополнить залог» через PaymentAcceptDialog + чистка билда
fec3c41 fix(0.5.8): «Пополнить» залог теперь через PaymentAcceptDialog (единый поток)
765e349 fix(0.5.7): депозит-предмет + явная подсветка «нужно пополнить»
02e8067 fix(0.5.6): 4 правки по тестированию preview
595f6ad fix(0.5.5): 4 правки UX
5683c1a fix(0.5.4): 3 правки UX/документ
4fd184c fix(0.5.3): убрана реакция клиента
af6e16c fix(0.5.2): «Эта аренда» = rental.sum
0e7384a fix(0.5.1): 5 правок по фидбеку preview
55170f4 feat: упрощение статусов аренды (v0.5.0)
```
