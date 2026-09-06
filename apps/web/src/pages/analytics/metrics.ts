import { useMemo } from "react";
import { useApiClients } from "@/lib/api/clients";
import { useApiPayments } from "@/lib/api/payments";
import { useRepairJobs } from "@/lib/api/repair-jobs";
import { useSaleDeals } from "@/lib/api/sales";
import { useBuyoutDeals } from "@/lib/api/buyout";
import { usePartnerInfo } from "@/lib/partner";
import { useRentals } from "@/pages/rentals/rentalsStore";
import { useArchivedRentals } from "@/pages/rentals/rentalsStore";
import { useDashboardMetrics } from "@/pages/dashboard/useDashboardMetrics";
import type { BoardPeriod } from "./board";

/**
 * Каталог показателей аналитики (06.09).
 *
 * Каждый показатель — ответ на один вопрос директора. Считаем из тех же
 * данных, что и остальные разделы, чтобы цифры не разъезжались: дашборд,
 * платежи, продажи, выкупы, ремонты.
 */

export type MetricGroup = "rent" | "sales" | "service" | "buyout" | "plan";

export type MetricDef = {
  id: string;
  group: MetricGroup;
  title: string;
  /** Короткое пояснение в каталоге. */
  about: string;
  /** Можно задать план вручную. */
  planable?: boolean;
  /** Считается за период (иначе — «прямо сейчас»). */
  periodic?: boolean;
  /** Период по умолчанию, если показатель периодический. */
  defaultPeriod?: BoardPeriod;
  /** Прибыль и закуп — только по ключу директора. */
  sensitive?: boolean;
  /** Данных пока нет (раздел не запущен). */
  comingSoon?: boolean;
  /**
   * Значение само по себе процент (загрузка парка). Тогда кольцо показывает
   * не выполнение плана, а сам показатель, а план — засечкой: иначе на
   * плитке два разных процента и непонятно, какой из них главный.
   */
  percentValue?: boolean;
  /** Как показать число (и план). */
  format: (n: number) => string;
};

export type MetricValue = {
  value: number;
  display: string;
  caption?: string;
  extra?: string;
  tone?: "good" | "warn" | "bad" | "neutral";
};

const money = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;
const count = (n: number) => Math.round(n).toLocaleString("ru-RU");
const percent = (n: number) => `${Math.round(n)}%`;

export const METRIC_GROUP_LABEL: Record<MetricGroup, string> = {
  rent: "Аренда",
  sales: "Продажи",
  service: "Ремонты",
  buyout: "Выкуп",
  plan: "Сводка",
};

export const METRICS: MetricDef[] = [
  /* ---------------- Аренда ---------------- */
  {
    id: "rent.park_load",
    percentValue: true,
    group: "rent",
    title: "Загрузка парка",
    about: "Сколько техники в аренде из той, что можно сдавать. План — в процентах.",
    planable: true,
    format: percent,
  },
  {
    id: "rent.active",
    group: "rent",
    title: "Активные аренды",
    about: "Сколько аренд идёт прямо сейчас. План — например 50.",
    planable: true,
    format: count,
  },
  {
    id: "rent.income_today",
    group: "rent",
    title: "Поступит сегодня",
    about: "Сколько ждём от тех, кто сегодня возвращает или продлевает.",
    format: money,
  },
  {
    id: "rent.overdue",
    group: "rent",
    title: "Просрочено",
    about: "Аренды с просрочкой и сумма долга по ним.",
    format: count,
  },
  {
    id: "rent.revenue",
    group: "rent",
    title: "Выручка с аренды",
    about: "Деньги, поступившие за период по арендам (без электро и доли инвестора).",
    planable: true,
    periodic: true,
    defaultPeriod: "week",
    format: money,
  },
  {
    id: "rent.new_clients",
    group: "rent",
    title: "Новые клиенты",
    about: "Сколько клиентов завели за период.",
    planable: true,
    periodic: true,
    defaultPeriod: "week",
    format: count,
  },
  {
    id: "rent.returns",
    group: "rent",
    title: "Вернули аренду",
    about: "Сколько аренд завершилось за период (по фактической дате возврата).",
    planable: true,
    periodic: true,
    defaultPeriod: "week",
    format: count,
  },

  /* ---------------- Продажи ---------------- */
  {
    id: "sales.count",
    group: "sales",
    title: "Продано техники",
    about: "Подписанные сделки продажи за период.",
    planable: true,
    periodic: true,
    defaultPeriod: "month",
    format: count,
  },
  {
    id: "sales.revenue",
    group: "sales",
    title: "Выручка с продаж",
    about: "Сумма подписанных сделок за период.",
    planable: true,
    periodic: true,
    defaultPeriod: "month",
    format: money,
  },
  {
    id: "sales.profit",
    group: "sales",
    title: "Прибыль с продаж",
    about: "Продажа минус закуп. Видно директору по ключу.",
    planable: true,
    periodic: true,
    defaultPeriod: "month",
    sensitive: true,
    format: money,
  },

  /* ---------------- Ремонты ---------------- */
  {
    id: "service.jobs",
    group: "service",
    title: "Ремонты своей техники",
    about: "Сколько ремонтов закрыли за период по своему парку.",
    planable: true,
    periodic: true,
    defaultPeriod: "month",
    format: count,
  },
  {
    id: "service.count",
    group: "service",
    title: "Сторонние ремонты",
    about: "Ремонты чужой техники за период. Раздел ещё не запущен.",
    planable: true,
    periodic: true,
    defaultPeriod: "month",
    comingSoon: true,
    format: count,
  },
  {
    id: "service.revenue",
    group: "service",
    title: "Выручка с ремонтов",
    about: "Деньги со сторонних ремонтов. Раздел ещё не запущен.",
    planable: true,
    periodic: true,
    defaultPeriod: "month",
    comingSoon: true,
    format: money,
  },

  /* ---------------- Выкуп ---------------- */
  {
    id: "buyout.active",
    group: "buyout",
    title: "Активные выкупы",
    about: "Сколько сделок выкупа сейчас выплачивается.",
    planable: true,
    format: count,
  },
  {
    id: "buyout.overdue",
    group: "buyout",
    title: "Выкупы с просрочкой",
    about: "Сделки, по которым платёж не пришёл в срок.",
    format: count,
  },
  {
    id: "buyout.collected",
    group: "buyout",
    title: "Собрано по выкупам",
    about: "Сколько внесли по графикам выкупа за период.",
    planable: true,
    periodic: true,
    defaultPeriod: "month",
    format: money,
  },

  /* ---------------- Сводка ---------------- */
  {
    id: "plan.summary",
    group: "plan",
    title: "План и факт",
    about: "Все показатели с планом одним списком: где идём хорошо, где отстаём.",
    format: count,
  },
];

export const METRIC_BY_ID = new Map(METRICS.map((m) => [m.id, m]));

/* ==================== период ==================== */

export type Range = { from: Date; to: Date; label: string };

export function periodRange(period: BoardPeriod, now = new Date()): Range {
  const end = new Date(now);
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (period === "today") {
    return { from: startOfDay(now), to: end, label: "сегодня" };
  }
  if (period === "week") {
    const from = startOfDay(new Date(now.getTime() - 6 * 86_400_000));
    return { from, to: end, label: "за 7 дней" };
  }
  if (period === "month") {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: end,
      label: now.toLocaleDateString("ru-RU", { month: "long" }),
    };
  }
  return {
    from: new Date(now.getFullYear(), 0, 1),
    to: end,
    label: `${now.getFullYear()} год`,
  };
}

/** «DD.MM.YYYY» → Date. */
function parseRu(d: string | null | undefined): Date | null {
  if (!d) return null;
  const [dd, mm, yy] = d.split(".").map(Number);
  if (!dd || !mm || !yy) return null;
  return new Date(yy, mm - 1, dd);
}

function inRange(d: Date | null, r: Range): boolean {
  if (!d) return false;
  const t = d.getTime();
  return t >= r.from.getTime() && t <= r.to.getTime();
}

/* ==================== значения ==================== */

/**
 * Считает все показатели сразу. Плитки берут готовые значения по id —
 * так одни и те же данные не тянутся по десять раз.
 */
export function useMetricValues(periodOf: (metricId: string) => BoardPeriod) {
  const dash = useDashboardMetrics();
  const clientsQ = useApiClients();
  const paymentsQ = useApiPayments();
  const repairsQ = useRepairJobs({ status: "all" });
  const salesQ = useSaleDeals();
  const buyoutQ = useBuyoutDeals();
  const rentals = useRentals();
  const archived = useArchivedRentals();
  const { excludedRentals } = usePartnerInfo();

  return useMemo(() => {
    const out: Record<string, MetricValue> = {};
    const rangeFor = (id: string) => periodRange(periodOf(id));

    /* ---- Аренда ---- */
    out["rent.park_load"] = {
      value: dash.loadPercent,
      display: percent(dash.loadPercent),
      caption: `${dash.activePetrolCount} из ${dash.rentableFleet} в аренде`,
      extra:
        dash.rentableElectro > 0
          ? `электро: ${dash.activeElectroCount} из ${dash.rentableElectro}`
          : undefined,
      tone:
        dash.loadPercent >= 85 ? "good" : dash.loadPercent >= 60 ? "warn" : "bad",
    };
    out["rent.active"] = {
      value: dash.activeRentalsCount,
      display: count(dash.activeRentalsCount),
      caption: "идут прямо сейчас",
      tone: "neutral",
    };
    out["rent.income_today"] = {
      value: dash.todayIncoming,
      display: money(dash.todayIncoming),
      caption:
        dash.todayIncomingCount > 0
          ? `${dash.todayIncomingCount} возврата или продления`
          : "сегодня никто не возвращает",
      tone: dash.todayIncoming > 0 ? "good" : "neutral",
    };
    out["rent.overdue"] = {
      value: dash.overdueCount,
      display: count(dash.overdueCount),
      caption: dash.overdueCount > 0 ? "требуют звонка" : "просрочек нет",
      extra: dash.overdueSum > 0 ? `долг ${money(dash.overdueSum)}` : undefined,
      tone: dash.overdueCount > 0 ? "bad" : "good",
    };

    // Выручка с аренды за период — те же правила, что в блоке «Выручка».
    {
      const r = rangeFor("rent.revenue");
      const payments = paymentsQ.data ?? [];
      let sum = 0;
      let n = 0;
      for (const p of payments) {
        if (!p.paid || !p.paidAt) continue;
        if (p.excludedFromRevenue) continue;
        if (p.type === "deposit" || p.type === "refund") continue;
        if (p.method === "deposit" && p.type !== "deposit_forfeit") continue;
        if (p.rentalId != null && excludedRentals.has(p.rentalId)) continue;
        const t = new Date(p.paidAt).getTime();
        if (t < r.from.getTime() || t > r.to.getTime()) continue;
        sum += p.amount ?? 0;
        n++;
      }
      out["rent.revenue"] = {
        value: sum,
        display: money(sum),
        caption: `${r.label} · ${n} платежей`,
        tone: sum > 0 ? "good" : "neutral",
      };
    }

    // Новые клиенты за период.
    {
      const r = rangeFor("rent.new_clients");
      const clients = clientsQ.data ?? [];
      const n = clients.filter((c) => {
        const added = c.addedOn ? new Date(c.addedOn) : null;
        return inRange(added, r);
      }).length;
      out["rent.new_clients"] = {
        value: n,
        display: count(n),
        caption: r.label,
        tone: n > 0 ? "good" : "neutral",
      };
    }

    // Возвраты за период — по фактической дате возврата, живые + архив.
    {
      const r = rangeFor("rent.returns");
      const seen = new Set<number>();
      let n = 0;
      for (const rent of [...rentals, ...archived]) {
        if (seen.has(rent.id)) continue;
        seen.add(rent.id);
        if (rent.status !== "completed") continue;
        if (inRange(parseRu(rent.endActual), r)) n++;
      }
      out["rent.returns"] = {
        value: n,
        display: count(n),
        caption: r.label,
        tone: "neutral",
      };
    }

    /* ---- Продажи ---- */
    {
      const deals = (salesQ.data?.items ?? []).filter((d) => d.status === "signed");
      const pick = (id: string) => {
        const r = rangeFor(id);
        return deals.filter((d) => {
          const when = d.soldAt ?? d.createdAt;
          const t = when ? new Date(when).getTime() : 0;
          return t >= r.from.getTime() && t <= r.to.getTime();
        });
      };
      const cntDeals = pick("sales.count");
      out["sales.count"] = {
        value: cntDeals.length,
        display: count(cntDeals.length),
        caption: rangeFor("sales.count").label,
        tone: cntDeals.length > 0 ? "good" : "neutral",
      };
      const revDeals = pick("sales.revenue");
      const revenue = revDeals.reduce((s, d) => s + (d.price ?? 0), 0);
      out["sales.revenue"] = {
        value: revenue,
        display: money(revenue),
        caption: `${rangeFor("sales.revenue").label} · ${revDeals.length} сделок`,
        tone: revenue > 0 ? "good" : "neutral",
      };
      const profDeals = pick("sales.profit");
      const profit = profDeals.reduce(
        (s, d) => s + ((d.price ?? 0) - (d.purchasePrice ?? 0)),
        0,
      );
      out["sales.profit"] = {
        value: profit,
        display: money(profit),
        caption: rangeFor("sales.profit").label,
        tone: profit > 0 ? "good" : "neutral",
      };
    }

    /* ---- Ремонты ---- */
    {
      const r = rangeFor("service.jobs");
      const jobs = repairsQ.data ?? [];
      const done = jobs.filter((j) => {
        if (j.status !== "completed" || !j.completedAt) return false;
        const t = new Date(j.completedAt).getTime();
        return t >= r.from.getTime() && t <= r.to.getTime();
      });
      const active = jobs.filter((j) => j.status !== "completed").length;
      out["service.jobs"] = {
        value: done.length,
        display: count(done.length),
        caption: `закрыто ${r.label}`,
        extra: active > 0 ? `в работе сейчас: ${active}` : undefined,
        tone: "neutral",
      };
      out["service.count"] = {
        value: 0,
        display: "—",
        caption: "раздел сторонних ремонтов ещё не запущен",
        tone: "neutral",
      };
      out["service.revenue"] = {
        value: 0,
        display: "—",
        caption: "появится вместе с разделом ремонтов",
        tone: "neutral",
      };
    }

    /* ---- Выкуп ---- */
    {
      const deals = buyoutQ.data?.items ?? [];
      const active = deals.filter((d) => d.status === "active");
      const overdue = active.filter((d) => d.progress.overdueCount > 0);
      out["buyout.active"] = {
        value: active.length,
        display: count(active.length),
        caption: "выплачиваются сейчас",
        extra:
          active.length > 0
            ? `остаток ${money(active.reduce((s, d) => s + d.progress.left, 0))}`
            : undefined,
        tone: "neutral",
      };
      out["buyout.overdue"] = {
        value: overdue.length,
        display: count(overdue.length),
        caption: overdue.length > 0 ? "надо звонить" : "все платят вовремя",
        extra:
          overdue.length > 0
            ? `просрочено ${money(overdue.reduce((s, d) => s + d.progress.overdueAmount, 0))}`
            : undefined,
        tone: overdue.length > 0 ? "bad" : "good",
      };
      const r = rangeFor("buyout.collected");
      // Считаем по закрытым строкам графика: дата закрытия = дата платежа.
      let collected = 0;
      for (const d of deals) {
        for (const row of d.schedule ?? []) {
          if (!row.paidAt) continue;
          const t = new Date(row.paidAt).getTime();
          if (t >= r.from.getTime() && t <= r.to.getTime()) {
            collected += row.paidAmount ?? 0;
          }
        }
      }
      out["buyout.collected"] = {
        value: collected,
        display: money(collected),
        caption: r.label,
        tone: collected > 0 ? "good" : "neutral",
      };
    }

    return out;
  }, [
    dash,
    clientsQ.data,
    paymentsQ.data,
    repairsQ.data,
    salesQ.data,
    buyoutQ.data,
    rentals,
    archived,
    excludedRentals,
    periodOf,
  ]);
}
