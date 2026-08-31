import type { SaleDeal, SaleManager } from "@/lib/api/sales";
import { dealProfit } from "@/lib/api/sales";

/**
 * Расчёты блока «Продажи»: периоды, разрезы динамики, рейтинги, прогноз.
 * Всё считается на клиенте по списку сделок — переключение фильтров
 * мгновенное, без похода на сервер.
 */

export type PeriodPreset = "today" | "week" | "month" | "year" | "custom";
export type Bucket = "hour" | "day" | "week" | "month" | "year";

export type Range = { from: Date; to: Date; label: string };

const MS_DAY = 86_400_000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export function ruDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getDate()} ${MONTHS_GEN[date.getMonth()]} ${date.getFullYear()}`;
}

export function ruDateShort(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

/** Человеческое имя разреза — для подписи оси графика. */
export const BUCKET_AXIS: Record<string, string> = {
  hour: "по часам",
  day: "по дням",
  week: "по неделям",
  month: "по месяцам",
  year: "по годам",
};

/** Склонение: plural(3, ["сделка","сделки","сделок"]) → «сделки». */
export function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

/**
 * Компактно: 1 250 000 → «1,25 млн». Сокращаем только миллионы — иначе в
 * одной строке соседствуют «218 тыс» и «75 000», и читается это рвано.
 */
export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} млн`;
  }
  return fmt(n);
}

/** Диапазон по пресету. custom обслуживается вызывающим кодом. */
export function presetRange(preset: PeriodPreset, now = new Date()): Range {
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now), label: "сегодня" };
    case "week": {
      // Понедельник текущей недели.
      const dow = (now.getDay() + 6) % 7;
      const from = startOfDay(new Date(now.getTime() - dow * MS_DAY));
      return { from, to: endOfDay(now), label: "эта неделя" };
    }
    case "year":
      return {
        from: startOfDay(new Date(now.getFullYear(), 0, 1)),
        to: endOfDay(now),
        label: `${now.getFullYear()} год`,
      };
    case "month":
    default:
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: endOfDay(now),
        label: now.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }),
      };
  }
}

/** Предыдущий сопоставимый период — для дельты «было / стало». */
export function previousRange(r: Range): Range {
  const len = r.to.getTime() - r.from.getTime();
  return {
    from: new Date(r.from.getTime() - len - 1),
    to: new Date(r.from.getTime() - 1),
    label: "прошлый период",
  };
}

export function inRange(iso: string | null, r: Range): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= r.from.getTime() && t <= r.to.getTime();
}

/** Проданные сделки периода, опционально по одному менеджеру. */
export function soldIn(
  deals: SaleDeal[],
  r: Range,
  managerId: number | null,
): SaleDeal[] {
  return deals.filter(
    (d) =>
      d.status === "signed" &&
      inRange(d.soldAt, r) &&
      (managerId == null || d.managerId === managerId),
  );
}

export type Totals = {
  units: number;
  revenue: number;
  profit: number;
  marginPct: number;
  avgCheck: number;
  commission: number;
};

export function totals(deals: SaleDeal[]): Totals {
  const revenue = deals.reduce((s, d) => s + d.price, 0);
  const profit = deals.reduce((s, d) => s + dealProfit(d), 0);
  return {
    units: deals.length,
    revenue,
    profit,
    marginPct: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
    avgCheck: deals.length ? Math.round(revenue / deals.length) : 0,
    commission: deals.reduce((s, d) => s + (d.managerCommission ?? 0), 0),
  };
}

/** Дельта в процентах: сколько прибавили к прошлому периоду. */
export function deltaPct(now: number, before: number): number | null {
  if (before === 0) return now === 0 ? 0 : null; // null → «нет базы для сравнения»
  return Math.round(((now - before) / before) * 100);
}

/* ==================== динамика ==================== */

export type Point = {
  key: string;
  /** Подпись под столбиком. */
  label: string;
  units: number;
  revenue: number;
  profit: number;
  /** true для прогнозного столбика. */
  forecast?: boolean;
};

function bucketKey(d: Date, b: Bucket): string {
  switch (b) {
    case "hour":
      return `${isoDate(d)}T${String(d.getHours()).padStart(2, "0")}`;
    case "day":
      return isoDate(d);
    case "week": {
      const dow = (d.getDay() + 6) % 7;
      return isoDate(new Date(d.getTime() - dow * MS_DAY));
    }
    case "month":
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    case "year":
      return String(d.getFullYear());
  }
}

function bucketLabel(key: string, b: Bucket): string {
  switch (b) {
    case "hour":
      return `${key.slice(11)}:00`;
    case "day": {
      const d = new Date(key);
      return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    }
    case "week": {
      const d = new Date(key);
      return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    case "month": {
      const [y, m] = key.split("-");
      const d = new Date(Number(y), Number(m) - 1, 1);
      return d.toLocaleDateString("ru-RU", { month: "short" });
    }
    case "year":
      return key;
  }
}

/** Шаг сетки в миллисекундах — чтобы пустые периоды тоже были на графике. */
function stepDates(r: Range, b: Bucket): Date[] {
  const out: Date[] = [];
  const cur = new Date(r.from);
  if (b === "hour") cur.setMinutes(0, 0, 0);
  while (cur.getTime() <= r.to.getTime() && out.length < 400) {
    out.push(new Date(cur));
    if (b === "hour") cur.setHours(cur.getHours() + 1);
    else if (b === "day") cur.setDate(cur.getDate() + 1);
    else if (b === "week") cur.setDate(cur.getDate() + 7);
    else if (b === "month") cur.setMonth(cur.getMonth() + 1);
    else cur.setFullYear(cur.getFullYear() + 1);
  }
  return out;
}

/**
 * Ряд для графика: все интервалы периода (включая пустые) + прогнозный
 * столбик. Прогноз — линейный тренд (метод наименьших квадратов) по уже
 * закрытым интервалам: показывает, куда идут продажи, а не просто повтор
 * последнего значения.
 */
export function series(
  deals: SaleDeal[],
  r: Range,
  b: Bucket,
  withForecast = true,
): { points: Point[]; forecast: Point | null; trendPct: number | null } {
  const grid = stepDates(r, b);
  const map = new Map<string, Point>();
  for (const d of grid) {
    const key = bucketKey(d, b);
    if (!map.has(key)) {
      map.set(key, { key, label: bucketLabel(key, b), units: 0, revenue: 0, profit: 0 });
    }
  }
  for (const deal of deals) {
    if (!deal.soldAt) continue;
    const key = bucketKey(new Date(deal.soldAt), b);
    const p = map.get(key);
    if (!p) continue;
    p.units += 1;
    p.revenue += deal.price;
    p.profit += dealProfit(deal);
  }
  const points = [...map.values()];

  // Прогноз имеет смысл, только когда есть по чему строить тренд. На одной
  // продаже за месяц линейная регрессия даёт «−87%» — цифру, которая
  // пугает и ничего не значит.
  const filled = points.filter((p) => p.revenue > 0).length;
  if (!withForecast || points.length < 2 || filled < 3) {
    return { points, forecast: null, trendPct: null };
  }
  // Линейный тренд по выручке.
  const n = points.length;
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.revenue);
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const nextRevenue = Math.max(0, Math.round(my + slope * (n - mx)));
  const last = points[n - 1]!;
  const avgUnitPrice =
    deals.length > 0 ? deals.reduce((s, d) => s + d.price, 0) / deals.length : 0;
  const forecast: Point = {
    key: "forecast",
    label: "прогноз",
    units: avgUnitPrice > 0 ? Math.round(nextRevenue / avgUnitPrice) : 0,
    revenue: nextRevenue,
    profit: 0,
    forecast: true,
  };
  const trendPct =
    last.revenue > 0 ? Math.round(((nextRevenue - last.revenue) / last.revenue) * 100) : null;
  return { points, forecast, trendPct };
}

/* ==================== рейтинги ==================== */

export type ManagerRow = {
  manager: SaleManager | null;
  managerId: number | null;
  name: string;
  color: string;
} & Totals;

export function managerRating(
  deals: SaleDeal[],
  managers: SaleManager[],
): ManagerRow[] {
  const byId = new Map<number, SaleDeal[]>();
  const noManager: SaleDeal[] = [];
  for (const d of deals) {
    if (d.managerId == null) noManager.push(d);
    else {
      const list = byId.get(d.managerId) ?? [];
      list.push(d);
      byId.set(d.managerId, list);
    }
  }
  const rows: ManagerRow[] = [];
  for (const m of managers) {
    const list = byId.get(m.id) ?? [];
    rows.push({
      manager: m,
      managerId: m.id,
      name: m.name,
      color: m.avatarColor,
      ...totals(list),
    });
  }
  // Менеджеры из архива, у которых остались сделки в периоде.
  for (const [id, list] of byId) {
    if (managers.some((m) => m.id === id)) continue;
    rows.push({
      manager: null,
      managerId: id,
      name: list[0]?.managerName ?? "Удалённый менеджер",
      color: list[0]?.managerColor ?? "blue",
      ...totals(list),
    });
  }
  if (noManager.length) {
    rows.push({
      manager: null,
      managerId: null,
      name: "Без менеджера",
      color: "blue",
      ...totals(noManager),
    });
  }
  return rows.sort((a, b) => b.revenue - a.revenue || b.units - a.units);
}

export type ModelRow = {
  name: string;
  units: number;
  revenue: number;
  profit: number;
  avgCheck: number;
};

export function modelRating(deals: SaleDeal[]): ModelRow[] {
  const map = new Map<string, SaleDeal[]>();
  for (const d of deals) {
    const key = d.modelName || d.scooterName || "Без модели";
    const list = map.get(key) ?? [];
    list.push(d);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([name, list]) => {
      const t = totals(list);
      return {
        name,
        units: t.units,
        revenue: t.revenue,
        profit: t.profit,
        avgCheck: t.avgCheck,
      };
    })
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue);
}

/** Цвет аватара менеджера → классы плитки. */
export const AVATAR_CLASS: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700",
  purple: "bg-violet-100 text-violet-700",
  green: "bg-emerald-100 text-emerald-700",
  orange: "bg-orange-100 text-orange-700",
  pink: "bg-pink-100 text-pink-700",
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  contract: "Договор сформирован",
  signed: "Продано",
  cancelled: "Отменена",
};

export const STATUS_CLASS: Record<string, string> = {
  draft: "bg-surface-soft text-muted",
  contract: "bg-orange-soft text-orange-ink",
  signed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-soft text-red-ink",
};
