-- Правки 27.08: выплаты инвестору — от «графика периодов» к «накоплено → выплатили».
--
-- Заказчик: график с нулевыми строками нелогичен, отметить выплату на
-- будущую/дальнюю дату — бред. Правильная механика: доля инвестора копится
-- с каждой арендой его техники, оператор нажимает «Выплатить» — счётчик
-- обнуляется, в истории остаётся запись «такого-то числа выплачено N ₽».
--
-- Период (period_start/period_end) больше не обязателен: выплата — это факт
-- «сейчас», а не закрытие расчётного периода. Старые строки с периодами
-- остаются в истории как есть.
ALTER TABLE "investor_payouts" DROP CONSTRAINT IF EXISTS "investor_payouts_period_uniq";
ALTER TABLE "investor_payouts" ALTER COLUMN "period_start" DROP NOT NULL;
ALTER TABLE "investor_payouts" ALTER COLUMN "period_end" DROP NOT NULL;

-- Правка 27.08: процент — свойство ИНВЕСТОРА, не единицы техники.
-- Задаётся при добавлении/изменении инвестора; его техника наследует
-- процент автоматически. Старое поле scooters.partner_share остаётся
-- только как fallback для партнёрских единиц без инвестора (legacy).
ALTER TABLE "investors" ADD COLUMN IF NOT EXISTS "share" integer NOT NULL DEFAULT 50;
