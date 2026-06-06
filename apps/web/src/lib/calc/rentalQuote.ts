/**
 * Чистый расчёт стоимости аренды — ЕДИНЫЙ с публичной анкетой
 * (apps/web/src/public/ApplicationForm.tsx → rateForDays/wishPrice).
 *
 * Калькулятор оператора обязан давать ту же цифру, что увидит клиент в анкете
 * и что выставит CRM при оформлении, поэтому формула здесь — дословная копия:
 *
 *   аренда     = ставка(модель, дней) × дней
 *   экипировка = Σ(платная ₽/сут)     × дней
 *   залог      = фикс (по умолчанию 2000 ₽, можно поправить в окне)
 *   К ВЫДАЧЕ   = аренда + экипировка + залог
 *
 * Ставка ₽/сут берётся из каталога «Модели» по числу дней:
 *   1–2 → dayRate, 3–6 → shortRate, 7–29 → weekRate, 30+ → monthRate.
 */

export const DEFAULT_DEPOSIT = 2000;

export type QuoteModelRates = {
  dayRate: number;
  shortRate: number;
  weekRate: number;
  monthRate: number;
};

/** Ставка ₽/сут модели по числу дней (как в каталоге «Модели» и в анкете). */
export function rateForDays(m: QuoteModelRates, days: number): number {
  if (days <= 2) return m.dayRate;
  if (days <= 6) return m.shortRate;
  if (days <= 29) return m.weekRate;
  return m.monthRate;
}

/** Ярлык тарифной ступени по числу дней (для подписи в окне). */
export function tierLabelForDays(days: number): string {
  if (days <= 2) return "1–2 дня";
  if (days <= 6) return "3–6 дней";
  if (days <= 29) return "7–29 дней";
  return "30+ дней";
}

export type QuoteEquipment = { price: number; isFree: boolean };

export type Quote = {
  days: number;
  /** ₽/сут аренды (по тарифной ступени). */
  rentRate: number;
  /** Аренда за весь период. */
  rentSum: number;
  /** ₽/сут платной экипировки (бесплатная не считается). */
  equipDaily: number;
  /** Экипировка за весь период. */
  equipSum: number;
  /** Залог. */
  deposit: number;
  /** ₽/сут всего (аренда + экипировка). */
  perDay: number;
  /** К ВЫДАЧЕ = аренда + экипировка + залог. */
  total: number;
};

export function computeQuote(args: {
  model: QuoteModelRates | null;
  equipment: QuoteEquipment[];
  days: number;
  deposit?: number;
}): Quote {
  const days = Math.max(1, Math.round(args.days || 0));
  const rentRate = args.model ? rateForDays(args.model, days) : 0;
  const equipDaily = args.equipment
    .filter((e) => !e.isFree)
    .reduce((s, e) => s + (e.price || 0), 0);
  const rentSum = rentRate * days;
  const equipSum = equipDaily * days;
  const deposit = args.deposit ?? DEFAULT_DEPOSIT;
  return {
    days,
    rentRate,
    rentSum,
    equipDaily,
    equipSum,
    deposit,
    perDay: rentRate + equipDaily,
    total: rentSum + equipSum + deposit,
  };
}

/* ───────────────────────── даты ───────────────────────── */

/** Сегодня в ISO YYYY-MM-DD (локальное время). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Прибавить дни к ISO-дате. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate(),
  ).padStart(2, "0")}`;
}

/** Кол-во дней между ISO-датами (to − from). */
export function daysBetweenIso(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const a = new Date(fy!, fm! - 1, fd!).getTime();
  const b = new Date(ty!, tm! - 1, td!).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** ISO → ДД.ММ (компактный показ периода). */
export function isoToDDMM(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}` : iso;
}

/** Множественное «день/дня/дней». */
export function daysWord(n: number): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return "дней";
  if (b > 1 && b < 5) return "дня";
  if (b === 1) return "день";
  return "дней";
}

/** Число → «5 500» (ru-RU, округление до рубля). */
export function rub(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}
