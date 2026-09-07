import type { Board, BoardPeriod } from "./board";
import { METRIC_BY_ID, type MetricValue } from "./metrics";
import { periodProgress, planState } from "./status";

/**
 * Советы на «Обзоре» (07.09, задание заказчика: «в дальнейшем аналитика
 * должна давать советы, что и как лучше двигаться»).
 *
 * Первая версия — честные правила без магии: смотрим на просрочки, простой
 * парка, темп по планам и неоплаченные ремонты и говорим, что делать
 * сегодня и сколько не хватает до плана. Каждый совет — одно действие
 * с цифрой, а не «обратите внимание».
 */

export type Advice = {
  tone: "bad" | "warn" | "good";
  /** Короткая суть — читается первой. */
  title: string;
  /** Что именно сделать и почему. */
  text: string;
};

const money = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;

function daysLeft(period: BoardPeriod, now = new Date()): number {
  if (period === "week") return 0;
  if (period === "today") return 1;
  if (period === "month") {
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Math.max(1, days - now.getDate() + 1);
  }
  const end = new Date(now.getFullYear() + 1, 0, 1).getTime();
  return Math.max(1, Math.round((end - now.getTime()) / 86_400_000));
}

export function buildAdvice(
  values: Record<string, MetricValue>,
  board: Board,
  periodOf: (metricId: string) => BoardPeriod,
  now = new Date(),
): Advice[] {
  const out: Advice[] = [];
  const v = (id: string) => values[id];

  /* --- горит сегодня --- */
  const overdue = v("rent.overdue");
  if (overdue && overdue.value > 0) {
    out.push({
      tone: "bad",
      title: `${overdue.display} просроч. аренд — обзвонить сегодня`,
      text: overdue.raw?.debt
        ? `Под риском ${money(overdue.raw.debt)}. Каждый день просрочки — минус к загрузке и к сумме, которую реально вернут.`
        : "Чем раньше звонок, тем выше шанс вернуть технику и деньги без досудебки.",
    });
  }

  const bOverdue = v("buyout.overdue");
  if (bOverdue && bOverdue.value > 0) {
    out.push({
      tone: "bad",
      title: `${bOverdue.display} выкупа с просрочкой платежа`,
      text: bOverdue.raw?.amount
        ? `Не пришло ${money(bOverdue.raw.amount)} по графику. Напомнить о платеже — обычно хватает одного звонка.`
        : "Напомнить о платеже по графику.",
    });
  }

  /* --- простой парка --- */
  const load = v("rent.park_load");
  const loadTile = board.tiles.find((t) => t.metric === "rent.park_load");
  if (load) {
    const idle = load.raw?.idle ?? 0;
    const plan = loadTile?.plan ?? null;
    if (plan != null && plan > 0 && load.value < plan) {
      out.push({
        tone: load.value < plan - 20 ? "bad" : "warn",
        title: `Загрузка ${load.display} при норме ${plan}%`,
        text:
          idle > 0
            ? `Простаивает ${idle} ${plural(idle, "скутер", "скутера", "скутеров")}. Посмотрите свежие заявки и цену дня — простой не возвращается.`
            : "Проверьте заявки: техника свободна, а норма не добрана.",
      });
    } else if (idle === 0 && load.value >= 100) {
      out.push({
        tone: "good",
        title: "Парк загружен полностью",
        text: "Свободной техники нет — самое время думать о докупке или о выкупах.",
      });
    }
  }

  /* --- темп по планам --- */
  for (const t of board.tiles) {
    const def = METRIC_BY_ID.get(t.metric);
    const val = values[t.metric];
    if (!def || !val || !def.periodic || def.comingSoon || t.plan == null || t.plan <= 0) continue;
    const period = periodOf(t.metric);
    const st = planState(val.value, t.plan, true, period, now);
    const left = daysLeft(period, now);
    const remaining = Math.max(0, t.plan - val.value);
    if (st.pct >= 100) continue;
    if (st.pace < 0.85 && left > 0) {
      const perDay = remaining / left;
      out.push({
        tone: st.pace < 0.6 ? "bad" : "warn",
        title: `${def.title}: ${st.pct}% плана, отстаём`,
        text: `До плана не хватает ${def.format(remaining)}. Чтобы закрыть его в срок, нужно примерно ${def.format(perDay)} в день ${left} ${plural(left, "день", "дня", "дней")}.`,
      });
    } else if (st.pace >= 1.15 && periodProgress(period, now) < 0.95) {
      out.push({
        tone: "good",
        title: `${def.title}: идём с опережением`,
        text: `Темп выше плана на ${Math.round((st.pace - 1) * 100)}% — при таком ходе план закроется раньше срока.`,
      });
    }
  }

  /* --- неоплаченные ремонты --- */
  const svc = v("service.count");
  if (svc?.raw?.unpaid) {
    out.push({
      tone: "warn",
      title: `${svc.raw.unpaid} ${plural(svc.raw.unpaid, "ремонт", "ремонта", "ремонтов")} ждут оплату`,
      text: `Не подтверждено ${money(svc.raw.unpaidSum ?? 0)}. Напомнить клиентам и отметить оплату — иначе выручка блока занижена.`,
    });
  }

  if (out.length === 0) {
    out.push({
      tone: "good",
      title: "Всё по плану",
      text: "Просрочек нет, планы в темпе. Хороший момент проверить, не пора ли поднять планку.",
    });
  }

  const order = { bad: 0, warn: 1, good: 2 } as const;
  return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 6);
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
