/**
 * ActivityEventRow — единый визуальный рендер события activity-журнала
 * во всей CRM (v0.7.15). Раньше визуальный формат «было → стало» жил
 * только локально в RentalCardTabs.tsx (ActivityVisualRow). Теперь вынесен
 * сюда и применяется везде, где показывается лента действий: дашборд
 * («Последние действия» / «Весь журнал»), inline-история под календарём
 * аренды, лента событий в карточках аренды / клиента / скутера.
 *
 * Единый визуальный язык:
 *   • круглая иконка типа события (цвет по тону);
 *   • основное «было → стало» — две пилюли + стрелка;
 *   • строки-последствия (доплата, новая сумма аренды, пробег);
 *   • дата/время + автор.
 *
 * Режим compact (дашборд, inline-история): иконка + краткое «было → стало»
 * в одну строку + дата. Без строк-последствий — минимально плотно.
 */
import { Fragment, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  CheckCircle2,
  Clock,
  FileText,
  Flag,
  Gift,
  HardHat,
  Pencil,
  Repeat,
  RotateCcw,
  Sparkles,
  SquareParking,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiActivityItem } from "@/lib/api/activity";
import { useApiEquipment } from "@/lib/api/equipment";
import { fileUrl } from "@/lib/files";

/* ============================ Категории / фильтры ============================ */

export type ActivityCategory = "extend" | "swap" | "equipment" | "money";

/** Маппинг action → категория фильтра (используется в полной ленте). */
export function actionCategory(action: string): ActivityCategory | null {
  if (action.includes("rolled_back")) return "extend";
  if (action.includes("extend")) return "extend";
  if (action.includes("scooter_swap") || action === "scooter_swapped")
    return "swap";
  if (action.includes("equipment")) return "equipment";
  if (
    action.includes("payment") ||
    action.includes("paid") ||
    action.includes("debt") ||
    action.includes("overdue") ||
    action.includes("forgiv") ||
    action.includes("damage") ||
    action.includes("refund") ||
    action.includes("security")
  )
    return "money";
  return null;
}

/* ============================ Иконки / тона ============================ */

type EventTone = "green" | "red" | "blue" | "orange" | "ink" | "amber" | "yellow";

const EVENT_TONE_CLASS: Record<EventTone, string> = {
  green: "bg-green-soft text-green-ink",
  red: "bg-red-soft text-red-ink",
  blue: "bg-blue-50 text-blue-700",
  orange: "bg-orange-soft text-orange-ink",
  amber: "bg-amber-100 text-amber-800",
  yellow: "bg-yellow-100 text-yellow-700",
  ink: "bg-surface-soft text-ink-2",
};

function eventVisual(
  action: string,
  entity?: string,
): { icon: LucideIcon; tone: EventTone } {
  // Акт ущерба (entity=damage_report, action=created) — иконка-предупреждение,
  // а не синяя «искра» создания.
  if (entity === "damage_report") return { icon: AlertTriangle, tone: "amber" };
  if (action.includes("rolled_back")) return { icon: RotateCcw, tone: "amber" };
  // «Перевести в активную» — по сути откат завершения, тот же визуальный язык.
  if (action === "revert_completion") return { icon: RotateCcw, tone: "amber" };
  if (action.includes("parking")) return { icon: SquareParking, tone: "yellow" };
  if (action.includes("equipment")) return { icon: HardHat, tone: "orange" };
  if (action.includes("scooter_swap") || action === "scooter_swapped")
    return { icon: Bike, tone: "ink" };
  if (action.includes("extend")) return { icon: Repeat, tone: "blue" };
  if (action === "created" || action.includes("activate"))
    return { icon: Sparkles, tone: "blue" };
  if (action.includes("forgiv")) return { icon: Gift, tone: "green" };
  if (
    action.includes("payment") ||
    action.includes("paid") ||
    action === "debt_payment"
  )
    return { icon: Wallet, tone: "green" };
  if (action.includes("refund") || action.includes("security"))
    return { icon: RotateCcw, tone: "green" };
  if (action.includes("damage")) return { icon: AlertTriangle, tone: "amber" };
  if (action.includes("debt") || action.includes("overdue"))
    return { icon: AlertTriangle, tone: "red" };
  if (action.includes("document")) return { icon: FileText, tone: "blue" };
  if (action.includes("complet")) return { icon: Flag, tone: "green" };
  if (action.includes("status"))
    return { icon: CheckCircle2, tone: "ink" };
  if (action.includes("archived") || action.includes("deleted"))
    return { icon: X, tone: "ink" };
  return { icon: Pencil, tone: "ink" };
}

export function entityLabel(entity: string): string {
  switch (entity) {
    case "rental":
      return "аренда";
    case "scooter":
      return "скутер";
    case "client":
      return "клиент";
    case "damage_report":
      return "акт ущерба";
    case "payment":
      return "платёж";
    case "repair_job":
      return "ремонт";
    case "user":
      return "пользователь";
    default:
      return entity;
  }
}

/* ============================ Разбор meta.diff ============================ */

type ChangeView = {
  from?: string | null;
  to?: string | null;
  tone?: "blue" | "green" | "red";
};

/**
 * v0.7.16: визуальное изменение экипировки как пара медиа-миниатюр
 * «было → стало». name — подпись, from/to — название экипировки для
 * матчинга миниатюры (или null = пустой квадрат-заглушка).
 */
export type EquipmentChangeView = {
  kind: "added" | "removed" | "replaced";
  /** Название для матчинга миниатюры слева (null = заглушка). */
  fromName: string | null;
  /** Название для матчинга миниатюры справа (null = заглушка). */
  toName: string | null;
  /** Подпись под парой (название + сумма). */
  caption: string;
};

export type ActivitySummaryView = {
  title: string;
  change: ChangeView | null;
  extras: string[];
  /** v0.7.16: изменения экипировки с миниатюрами (вместо change-пилюль). */
  equipment?: EquipmentChangeView[];
  /**
   * #20: денежный «заголовок» события для правой колонки ленты (вариант B) —
   * одно число, которое глаз ловит первым: «+4 900 ₽» / «−5 500 ₽» / «3 500 ₽».
   * tone: green — пришло, red — списано/прощено/долг, ink — нейтрально (сумма аренды).
   */
  headline?: { text: string; tone: "green" | "red" | "ink" };
};

/**
 * #20: структурированный контекст события для кликабельных сущностей в ленте.
 * Каждая часть открывает свою карточку: имя → клиент, скутер → скутер, #N → аренда.
 */
export type ActivityContextParts = {
  client?: { id: number; name: string };
  scooter?: { id: number; label: string };
  rental?: { id: number; label: string };
};

/** Способ оплаты cash/transfer/deposit → человекочитаемо (или null). */
function paymentMethodLabel(m: unknown): string | null {
  if (m === "cash") return "наличные";
  if (m === "transfer") return "перевод";
  if (m === "deposit") return "из депозита";
  return null;
}

/**
 * Разбирает событие в визуальную форму:
 *   • title  — короткий заголовок («Изменена экипировка»),
 *   • change — основное «было → стало» (две пилюли + стрелка),
 *   • extras — доп. последствия одной строкой (доплата, новая сумма).
 * Берёт структурированный meta.diff (см. apps/api/.../activityLog.ts).
 *
 * Обёртка над buildActivitySummary: УНИВЕРСАЛЬНО дописывает «Оплата: нал/перевод/
 * из депозита» (meta.method) и «Возврат: …» (meta.refundTo) — чтобы по любому
 * денежному событию хронологии было видно, как двигались деньги (запрос
 * заказчика: восстановить полную картину аренды по событиям).
 */
export function formatActivitySummary(
  item: ApiActivityItem,
): ActivitySummaryView {
  const view = buildActivitySummary(item);
  const m = readRecord(item.meta);
  const method = paymentMethodLabel(m?.method);
  if (method && !view.extras.some((e) => e.startsWith("Оплата:"))) {
    view.extras = [...view.extras, `Оплата: ${method}`];
  }
  const refundTo = m?.refundTo;
  if (
    (refundTo === "cash" || refundTo === "deposit") &&
    !view.extras.some((e) => e.startsWith("Возврат:"))
  ) {
    view.extras = [
      ...view.extras,
      `Возврат: ${refundTo === "cash" ? "налом клиенту" : "в депозит клиента"}`,
    ];
  }
  return view;
}

function buildActivitySummary(
  item: ApiActivityItem,
): ActivitySummaryView {
  const action = item.action;
  const diff = readRecord(readRecord(item.meta)?.diff);
  const money = (v: unknown): string =>
    `${Number(v ?? 0).toLocaleString("ru-RU")} ₽`;
  const fee = readRecord(diff?.fee);
  const feeLine = (): string | null => {
    if (!fee) return null;
    const label = typeof fee.label === "string" ? fee.label : "Доплата";
    return `${label}: ${money(fee.to)}`;
  };

  // ── Заметка-стикер (v0.8.14+) ──
  if (action.startsWith("note_")) {
    const m = readRecord(item.meta);
    const text = typeof m?.text === "string" ? m.text : "";
    const isContact = m?.kind === "contact";
    const what = isContact ? "Комментарий по связи" : "Заметка";
    const verb =
      action === "note_added"
        ? "добавлена"
        : action === "note_unpinned" || action === "note_removed"
          ? "откреплена"
          : action === "note_deleted"
            ? "удалена"
            : "изменена";
    return {
      title: `${what} ${verb}`,
      change: null,
      extras: text ? [`«${text}»`] : [],
    };
  }

  // ── Паркинг ──
  if (action.includes("parking")) {
    const p = readRecord(readRecord(item.meta)?.parking);
    const short = (s: unknown) => {
      const m = String(s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? `${m[3]}.${m[2]}` : String(s ?? "");
    };
    const title =
      action === "parking_set"
        ? "Поставлен на паркинг"
        : action === "parking_ended"
          ? "Снят с паркинга"
          : action === "parking_edited"
            ? "Паркинг изменён"
            : action === "parking_deleted"
              ? "Паркинг удалён"
              : action === "parking_paid"
                ? "Оплата паркинга"
                : "Паркинг";
    const extras: string[] = [];
    if (p?.startDate && p?.endDate)
      extras.push(`${short(p.startDate)}–${short(p.endDate)}`);
    if (p?.days != null) extras.push(`${Number(p.days)} дн`);
    if (p?.amount != null) extras.push(money(p.amount));
    // Досрочное снятие предоплаченного паркинга — излишек уходит в депозит.
    const pm = readRecord(item.meta);
    if (
      action === "parking_ended" &&
      pm?.refund != null &&
      Number(pm.refund) > 0
    )
      extras.push(`Излишек ${money(pm.refund)} → депозит клиента`);
    return { title, change: null, extras };
  }

  // ── Экипировка ──
  if (action.includes("equipment")) {
    const eq = readRecord(diff?.items);
    const from = readStringList(eq?.from);
    const to = readStringList(eq?.to);
    const added = to.filter((n) => !from.includes(n));
    const removed = from.filter((n) => !to.includes(n));
    const extras: string[] = [];
    const fl = feeLine();
    // подпись суммы для пары миниатюр: «+N ₽» / «−N ₽» / «сумма не изменилась»
    const feeAmount = fee && fee.to != null ? Number(fee.to) : 0;
    const isRefund = fee?.label === "Возврат";
    const feeCaption =
      feeAmount !== 0
        ? `${isRefund ? "−" : "+"}${money(feeAmount)}`
        : "сумма не изменилась";

    const equipment: EquipmentChangeView[] = [];
    // Замена 1↔1 — одна пара «старая → новая».
    if (added.length === 1 && removed.length === 1) {
      equipment.push({
        kind: "replaced",
        fromName: removed[0]!,
        toName: added[0]!,
        caption: `${removed[0]} → ${added[0]}`,
      });
    } else {
      // Добавленные: пустой квадрат → миниатюра.
      for (const n of added) {
        equipment.push({
          kind: "added",
          fromName: null,
          toName: n,
          caption: `${n} · ${feeCaption}`,
        });
      }
      // Убранные: миниатюра → пустой квадрат.
      for (const n of removed) {
        equipment.push({
          kind: "removed",
          fromName: n,
          toName: null,
          caption: n,
        });
      }
    }

    const title =
      added.length === 1 && removed.length === 1
        ? "Заменена экипировка"
        : added.length > 0 && removed.length === 0
          ? "Добавлена экипировка"
          : removed.length > 0 && added.length === 0
            ? "Убрана экипировка"
            : "Изменена экипировка";

    // fee показываем строкой только если миниатюр нет (нет diff.items).
    if (equipment.length === 0 && fl) extras.push(fl);

    return {
      title,
      change:
        equipment.length === 0
          ? {
              from: from.length ? from.join(", ") : "—",
              to: to.length ? to.join(", ") : "—",
              tone: "blue",
            }
          : null,
      extras,
      equipment: equipment.length ? equipment : undefined,
      headline:
        feeAmount !== 0
          ? {
              text: `${isRefund ? "−" : "+"}${money(feeAmount)}`,
              tone: isRefund ? "red" : "green",
            }
          : undefined,
    };
  }

  // ── Замена скутера ──
  if (action.includes("scooter_swap") || action === "scooter_swapped") {
    const sc = readRecord(diff?.scooter);
    const from = typeof sc?.from === "string" ? sc.from : null;
    const to = typeof sc?.to === "string" ? sc.to : null;
    const m = readRecord(item.meta);
    const extras: string[] = [];
    const fl = feeLine();
    if (fl) extras.push(fl);
    // Возврат разницы при замене на дешевле — уходит в депозит клиента.
    const swapRefund = readRecord(diff?.refund);
    if (swapRefund && swapRefund.to != null && Number(swapRefund.to) > 0)
      extras.push(`Возврат ${money(swapRefund.to)} → депозит клиента`);
    // #20: причина замены — категория (reasonLabel) как основное «почему» +
    // необязательный комментарий-цитата. Legacy-свапы без категории
    // показывают старый свободный текст как и раньше.
    const reasonLabel = typeof m?.reasonLabel === "string" ? m.reasonLabel : null;
    const reasonComment =
      typeof m?.reason === "string" && m.reason.trim() ? m.reason.trim() : null;
    if (reasonLabel) {
      extras.push(`Причина: ${reasonLabel}`);
      if (reasonComment) extras.push(`«${reasonComment}»`);
    } else if (reasonComment) {
      extras.push(`Причина: ${reasonComment}`);
    }
    if (typeof m?.oldScooterDestination === "string") {
      const dest =
        m.oldScooterDestination === "repair"
          ? "в ремонт"
          : m.oldScooterDestination === "rental_pool"
            ? "обратно в парк"
            : null;
      if (dest) extras.push(`Старый скутер: ${dest}`);
    }
    return {
      title: "Замена скутера",
      change: from || to ? { from, to, tone: "blue" } : null,
      extras,
      headline:
        fee && fee.to != null && Number(fee.to) > 0
          ? { text: `+${money(fee.to)}`, tone: "green" }
          : undefined,
    };
  }

  // ── Продление ──
  if (action.includes("extend")) {
    const days = readRecord(diff?.days);
    const extras: string[] = [];
    let change: ChangeView | null = null;
    if (days && typeof days.from === "number" && typeof days.to === "number") {
      const delta = days.to - days.from;
      change = {
        from: `${days.from} дн`,
        to: `${days.to} дн${delta > 0 ? ` (+${delta})` : ""}`,
        tone: "blue",
      };
    } else if (days && typeof days.to === "number") {
      change = { from: "—", to: `${days.to} дн`, tone: "blue" };
    }
    // v0.8.14 (ревизор): период возврата «было → стало» по датам.
    const endp = readRecord(diff?.endPlannedAt);
    if (endp && (endp.from != null || endp.to != null)) {
      extras.push(
        `Возврат: ${formatDateLabel(endp.from)} → ${formatDateLabel(endp.to)}`,
      );
    }
    const sum = readRecord(diff?.sum);
    if (sum && (sum.from != null || sum.to != null)) {
      extras.push(`Сумма аренды: ${money(sum.from)} → ${money(sum.to)}`);
    }
    const fl = feeLine();
    if (fl) extras.push(fl);
    return { title: "Продление аренды", change, extras };
  }

  // ── Откат продления («отменить действие» в день совершения) ──
  // Бэк (rentals.ts, лог payment_rolled_back) кладёт diff.endPlannedAt (date)
  // + diff.sum (money) и meta.extraDays. Должно матчиться ДО ветки «Платёж»,
  // иначе action.includes("payment") покажет «Принят платёж».
  if (action.includes("rolled_back")) {
    const m = readRecord(item.meta);
    const kind = typeof m?.kind === "string" ? m.kind : null;
    // Откат изменения экипировки — показываем «набор после → прежний набор».
    if (kind === "equipment") {
      const eq = readRecord(diff?.items);
      const from = readStringList(eq?.from);
      const to = readStringList(eq?.to);
      return {
        title: "Откат изменения экипировки",
        change: {
          from: from.length ? from.join(", ") : "—",
          to: to.length ? to.join(", ") : "—",
          tone: "blue",
        },
        extras: [],
      };
    }
    // Откат создания аренды — аренда ушла в архив.
    if (kind === "created") {
      return {
        title: "Откат создания аренды",
        change: null,
        extras: ["Аренда отправлена в архив"],
      };
    }
    // Откат приёма оплаты (выкуп просрочки / штраф / долг).
    if (kind === "payment") {
      const payKind = typeof m?.payKind === "string" ? m.payKind : null;
      const title =
        payKind === "overdue_days"
          ? "Откат выкупа просрочки"
          : payKind === "overdue_fine"
            ? "Откат оплаты штрафа"
            : "Откат оплаты долга";
      const endpP = readRecord(diff?.endPlannedAt);
      const sumP = readRecord(diff?.sum);
      const payP = readRecord(diff?.payment);
      let pchange: ChangeView | null = null;
      const pextras: string[] = [];
      if (endpP && (endpP.from != null || endpP.to != null)) {
        pchange = {
          from: formatDateLabel(endpP.from),
          to: formatDateLabel(endpP.to),
          tone: "blue",
        };
      }
      if (sumP && (sumP.from != null || sumP.to != null))
        pextras.push(`Сумма аренды: ${money(sumP.from)} → ${money(sumP.to)}`);
      if (payP && payP.from != null) pextras.push(`Снято: ${money(payP.from)}`);
      return { title, change: pchange, extras: pextras };
    }
    // Откат пополнения залога — залог вернулся к прежней сумме.
    if (kind === "security") {
      const dep = readRecord(diff?.deposit);
      return {
        title: "Откат пополнения залога",
        change:
          dep && (dep.from != null || dep.to != null)
            ? { from: money(dep.from), to: money(dep.to), tone: "blue" }
            : null,
        extras: ["Платёж пополнения удалён"],
      };
    }
    // Откат оплаты паркинга — долг по паркингу снова открыт.
    if (kind === "parking") {
      const payP = readRecord(diff?.payment);
      return {
        title: "Откат оплаты паркинга",
        change: null,
        extras:
          payP && payP.from != null
            ? [`Снято: ${money(payP.from)} — долг по паркингу снова открыт`]
            : ["Долг по паркингу снова открыт"],
      };
    }
    // Откат замены скутера / паркинг-операций (action_rolled_back).
    if (kind === "swap") {
      const sc = readRecord(diff?.scooter);
      return {
        title: "Откат замены скутера",
        change:
          sc && (sc.from != null || sc.to != null)
            ? { from: String(sc.from ?? "—"), to: String(sc.to ?? "—"), tone: "blue" }
            : null,
        extras: [],
      };
    }
    if (kind === "parking_set") {
      return {
        title: "Откат постановки на паркинг",
        change: null,
        extras: ["Сессия паркинга удалена, сдвиг возврата отменён"],
      };
    }
    if (kind === "parking_end") {
      return {
        title: "Откат снятия с паркинга",
        change: null,
        extras: ["Сессия паркинга снова открыта"],
      };
    }
    // Откат безденежных операций (rollback-action): начисление / прощения.
    if (
      kind === "manual_debt" ||
      kind === "forgive_fine" ||
      kind === "forgive_days" ||
      kind === "forgive_all"
    ) {
      const titles: Record<string, string> = {
        manual_debt: "Откат начисления долга",
        forgive_fine: "Откат прощения штрафа",
        forgive_days: "Откат прощения дней просрочки",
        forgive_all: "Откат прощения просрочки",
      };
      const debt = readRecord(diff?.debt);
      const endpA = readRecord(diff?.endPlannedAt);
      const extras: string[] = [];
      if (debt && debt.from != null) {
        extras.push(
          kind === "manual_debt"
            ? `Начисление ${money(debt.from)} удалено`
            : `${money(debt.from)} вернулось в долг`,
        );
      }
      return {
        title: titles[kind] ?? "Откат операции",
        change:
          endpA && (endpA.from != null || endpA.to != null)
            ? {
                from: formatDateLabel(endpA.from),
                to: formatDateLabel(endpA.to),
                tone: "blue",
              }
            : null,
        extras,
      };
    }
    const endp = readRecord(diff?.endPlannedAt);
    const sum = readRecord(diff?.sum);
    const extraDays = typeof m?.extraDays === "number" ? m.extraDays : null;
    let change: ChangeView | null = null;
    if (endp && (endp.from != null || endp.to != null)) {
      change = {
        from: formatDateLabel(endp.from),
        to: formatDateLabel(endp.to),
        tone: "blue",
      };
    }
    const extras: string[] = [];
    if (sum && (sum.from != null || sum.to != null)) {
      extras.push(`Сумма аренды: ${money(sum.from)} → ${money(sum.to)}`);
      const back = Number(sum.from ?? 0) - Number(sum.to ?? 0);
      if (back > 0) extras.push(`Вернулось ${money(back)}`);
    }
    if (extraDays)
      extras.push(
        `Убрано продление: ${extraDays} ${plural(extraDays, "день", "дня", "дней")}`,
      );
    return { title: "Откат продления", change, extras };
  }

  // ── Платёж / выдача средств ──
  if (
    action.includes("payment") ||
    action.includes("paid") ||
    action === "debt_payment"
  ) {
    const pay = readRecord(diff?.payment);
    const m = readRecord(item.meta);
    // Сумма: diff.payment.to → meta.amount → Σ meta.applied[].amount → из summary.
    // (У платежей по клиенту/делу/депозиту структурной суммы нет — раньше из-за
    //  этого показывался голый «Принят платёж» без суммы и назначения.)
    let amount: number | null =
      typeof pay?.to === "number"
        ? pay.to
        : typeof m?.amount === "number"
          ? m.amount
          : null;
    const applied = m?.applied;
    if (amount == null && Array.isArray(applied)) {
      const s = (applied as unknown[]).reduce(
        (acc: number, a) => acc + (Number(readRecord(a)?.amount) || 0),
        0,
      );
      if (s > 0) amount = s;
    }
    if (amount == null) {
      const mm = /(\d[\d\s ]*)\s*₽/.exec(item.summary || "");
      if (mm) amount = Number(mm[1].replace(/[\s ]/g, "")) || null;
    }
    const isPayout = /paid_out|payout/.test(action);
    const kind = typeof m?.kind === "string" ? m.kind : null;
    // v0.8.25 (F9): назначение платежа — чтобы было видно «за что».
    const KIND_LABEL: Record<string, string> = {
      overdue_days_payment: "за просроченные дни",
      overdue_fine_payment: "за штраф просрочки",
      manual_payment: "по ручному долгу",
      rent: "за аренду",
      parking: "за паркинг",
      damage: "по акту ущерба",
    };

    // Платёж по аренде со структурой — привычный вид «Принят платёж» + назначение.
    if (item.entity === "rental" && (kind != null || pay?.to != null)) {
      const extras: string[] = [];
      if (kind && KIND_LABEL[kind]) extras.push(`Назначение: ${KIND_LABEL[kind]}`);
      if (typeof m?.comment === "string" && m.comment.trim())
        extras.push(`«${m.comment.trim()}»`);
      if (typeof m?.endPlannedShift === "number" && m.endPlannedShift > 0)
        extras.push(`Возврат сдвинут на ${m.endPlannedShift} дн`);
      if (typeof m?.residualToDeposit === "number" && m.residualToDeposit > 0)
        extras.push(`Остаток ${money(m.residualToDeposit)} → депозит клиента`);
      return {
        title: "Принят платёж",
        change:
          amount != null
            ? { from: null, to: money(amount), tone: "green" }
            : null,
        extras,
        headline:
          amount != null
            ? { text: `+${money(amount)}`, tone: "green" }
            : undefined,
      };
    }

    // Прочие денежные движения (клиент/дело/депозит): summary самодостаточен
    // («Погашение сквозного долга по ущербу 3000 ₽», «D-009: платёж 10 000 ₽…»,
    //  «Депозит выдан клиенту −2500 ₽…») — он и есть заголовок. Выдача — красным.
    return {
      title:
        (item.summary || "").trim() ||
        (isPayout ? "Выдача средств" : "Принят платёж"),
      change: null,
      extras: [],
      headline:
        amount != null
          ? {
              text: `${isPayout ? "−" : "+"}${money(amount)}`,
              tone: isPayout ? "red" : "green",
            }
          : undefined,
    };
  }

  // ── Прощение долга ──
  if (action.includes("forgiv")) {
    // diff может содержать: debt/fine (money) + overdueDays (number, дни).
    const m = readRecord(item.meta);
    const debt = readRecord(diff?.debt);
    const fine = readRecord(diff?.fine);
    const overdueDays = readRecord(diff?.overdueDays);
    const amountRec = debt ?? fine;
    // Заголовок поясняет ЧТО прощено.
    const title = fine
      ? "Прощён штраф просрочки"
      : action.includes("days")
        ? "Прощены дни просрочки"
        : "Прощена просрочка";
    const extras: string[] = [];
    // #20: «за сколько» — сколько дней просрочки списано. Берём из diff.overdueDays,
    // иначе из meta (daysToShift при прощении дней / daysCount при штрафе). Отвечает
    // на вопрос заказчика «прощена просрочка — а за какой период?».
    const daysForgiven =
      overdueDays && typeof overdueDays.from === "number" && overdueDays.from > 0
        ? overdueDays.from
        : typeof m?.daysToShift === "number" && m.daysToShift > 0
          ? m.daysToShift
          : typeof m?.daysCount === "number" && m.daysCount > 0
            ? m.daysCount
            : null;
    if (daysForgiven != null)
      extras.push(
        `Просрочка: ${daysForgiven} ${plural(daysForgiven, "день", "дня", "дней")}`,
      );
    const fineLineForgiven = readRecord(diff?.fine);
    if (debt && fineLineForgiven && fineLineForgiven !== amountRec) {
      // target='all' иногда кладёт и debt, и fine — покажем штраф отдельно.
      extras.push(`Штраф: ${money(fineLineForgiven.from)}`);
    }
    const forgivenAmount =
      amountRec && amountRec.from != null ? Number(amountRec.from) : null;
    return {
      title,
      change: amountRec
        ? { from: money(amountRec.from), to: "0 ₽", tone: "green" }
        : null,
      extras,
      headline:
        forgivenAmount != null && forgivenAmount > 0
          ? { text: `−${money(forgivenAmount)}`, tone: "red" }
          : undefined,
    };
  }

  // ── Начисление долга / ущерб / просрочка ──
  // Акт ущерба логируется как entity='damage_report' action='created' — ловим
  // по entity, иначе он проваливался в «Отредактирована аренда» с непонятным
  // «Позиции: → Приборная панель» (фикс самодостаточности записей журнала).
  if (
    action.includes("debt") ||
    action.includes("overdue") ||
    action.includes("damage") ||
    item.entity === "damage_report"
  ) {
    const key = ["debt", "damage", "fine"].find((k) => diff?.[k]);
    const d = key ? readRecord(diff?.[key]) : null;
    const isDamage =
      action.includes("damage") || item.entity === "damage_report";
    const title = isDamage ? "Зафиксирован ущерб" : "Начислен долг";
    // Позиции повреждений (diff.items.to) — человекочитаемой строкой.
    const itemsRec = readRecord(diff?.items);
    const damaged = itemsRec ? readStringList(itemsRec.to) : [];
    const extras: string[] = [];
    if (damaged.length) extras.push(`Повреждения: ${damaged.join(", ")}`);
    return {
      title,
      change: d ? { from: "—", to: money(d.to), tone: "red" } : null,
      extras,
      headline: d && d.to != null ? { text: `+${money(d.to)}`, tone: "red" } : undefined,
    };
  }

  // ── Пополнение залога ──
  if (action.includes("security")) {
    const dep = readRecord(diff?.deposit);
    const m = readRecord(item.meta);
    const amount = typeof m?.amount === "number" ? m.amount : null;
    return {
      title: "Пополнен залог",
      change:
        dep && (dep.from != null || dep.to != null)
          ? { from: money(dep.from), to: money(dep.to), tone: "green" }
          : null,
      extras: [],
      headline:
        amount != null && amount > 0
          ? { text: `+${money(amount)}`, tone: "green" }
          : undefined,
    };
  }

  // ── Завершение / возврат завершения / статус ──
  if (action.includes("complet") || action.includes("status")) {
    const st = readRecord(diff?.status);
    const fromS = typeof st?.from === "string" ? statusLabel(st.from) : null;
    const toS = typeof st?.to === "string" ? statusLabel(st.to) : null;
    const extras: string[] = [];
    const mileage = readRecord(diff?.mileage);
    if (mileage && mileage.from != null && mileage.to != null) {
      extras.push(
        `Пробег: ${Number(mileage.from).toLocaleString("ru-RU")} → ${Number(
          mileage.to,
        ).toLocaleString("ru-RU")} км`,
      );
    }
    // Судьба залога при сдаче (meta.deposit) — вернули клиенту или удержали.
    const dep = readRecord(readRecord(item.meta)?.deposit);
    if (dep && dep.returned != null) {
      const amt = Number(dep.amount ?? 0);
      extras.push(
        dep.returned
          ? `Залог возвращён клиенту${amt > 0 ? `: ${money(amt)}` : ""}`
          : `Залог удержан${amt > 0 ? `: ${money(amt)}` : ""}`,
      );
    }
    // #20: «Аренда завершена» вместо безликого «Изменён статус» — заказчик
    // отдельно отметил, что этот заголовок с флагом ему нравится.
    const toRaw = typeof st?.to === "string" ? st.to : null;
    const title =
      toRaw === "completed"
        ? "Аренда завершена"
        : toRaw === "active"
          ? "Аренда возобновлена"
          : "Изменён статус";
    return {
      title,
      change: fromS || toS ? { from: fromS, to: toS, tone: "blue" } : null,
      extras,
    };
  }

  // ── Изменён период продления (безопасный инструмент «Изменить период») ──
  // Бэк кладёт diff.branchPeriod = { from:"12.06–19.06", to:"12.06–16.06" } —
  // период ПОСЛЕДНЕЙ ВЕТКИ продления «от-и-до». Показываем его пилюлей
  // «было → стало» + новую сумму аренды. Чёткий период — главное требование.
  const branchPeriod = readRecord(diff?.branchPeriod);
  if (branchPeriod && (branchPeriod.from != null || branchPeriod.to != null)) {
    const extras: string[] = [];
    const sum = readRecord(diff?.sum);
    if (sum && (sum.from != null || sum.to != null))
      extras.push(`Сумма аренды: ${money(sum.from)} → ${money(sum.to)}`);
    return {
      title: "Изменён период продления",
      change: {
        from: branchPeriod.from != null ? String(branchPeriod.from) : null,
        to: branchPeriod.to != null ? String(branchPeriod.to) : null,
        tone: "blue",
      },
      extras,
    };
  }

  // ── Создание аренды: показываем «тело» — из чего складывается сумма
  //    (аренда + экипировка + залог). Снимок берётся из meta.composition
  //    (см. бэкенд rentals.ts, лог rental_created). ──
  if (action === "created" && item.entity === "rental") {
    const comp = readRecord(readRecord(item.meta)?.composition);
    if (!comp) return { title: "Аренда создана", change: null, extras: [] };
    const extras: string[] = [];
    const days = typeof comp.days === "number" ? comp.days : 0;
    const rate = typeof comp.rate === "number" ? comp.rate : null;
    const rateUnit = comp.rateUnit === "week" ? "нед" : "сут";
    const sum = typeof comp.sum === "number" ? comp.sum : null;
    const deposit = typeof comp.deposit === "number" ? comp.deposit : null;
    const equip = Array.isArray(comp.equipment) ? comp.equipment : [];
    // Платная экипировка за весь срок (цена/сут × дни) — «Аренда» показывает
    // базу без задвоения (sum уже включает экипировку).
    let paidEquipTotal = 0;
    for (const raw of equip) {
      const e = readRecord(raw);
      if (e && e.free !== true && typeof e.price === "number" && e.price > 0)
        paidEquipTotal += e.price * days;
    }
    if (sum != null) {
      const base = sum - paidEquipTotal;
      const tariff =
        days && rate
          ? ` · ${days} ${plural(days, "день", "дня", "дней")} · ${money(rate)}/${rateUnit}`
          : "";
      // #168: пометка «свой тариф» — ставка задана вручную, не по стандарту.
      const customNote = comp.customTariff === true ? " · свой тариф" : "";
      extras.push(`Аренда${tariff}${customNote}: ${money(base)}`);
    }
    for (const raw of equip) {
      const e = readRecord(raw);
      if (!e || typeof e.name !== "string" || !e.name.trim()) continue;
      const free = e.free === true || !e.price;
      extras.push(
        `Экипировка · ${e.name}: ${free ? "бесплатно" : money((e.price as number) * days)}`,
      );
    }
    if (deposit != null && deposit > 0) {
      extras.push(`Залог (возвратный): ${money(deposit)}`);
    }
    if (sum != null) extras.push(`Итого аренды: ${money(sum)}`);
    return {
      title: "Аренда создана",
      change: null,
      extras,
      headline: sum != null ? { text: money(sum), tone: "ink" } : undefined,
    };
  }

  // ── Редактирование (есть diff, но не покрыто выше) ──
  const keys = Object.keys(diff ?? {});
  if (keys.length > 0) {
    const extras = keys
      .map((k) => {
        const f = readRecord(diff?.[k]);
        if (!f || typeof f.label !== "string") return null;
        const fmt = (v: unknown): string => {
          if (v == null || v === "") return "—";
          switch (f.kind) {
            case "money":
              return money(v);
            case "number":
              return `${Number(v).toLocaleString("ru-RU")}${f.suffix ? ` ${f.suffix}` : ""}`;
            case "date":
              return formatDateLabel(v);
            case "list":
              return Array.isArray(v) ? (v.length ? v.join(", ") : "—") : String(v);
            default:
              return String(v);
          }
        };
        return `${f.label}: ${fmt(f.from)} → ${fmt(f.to)}`;
      })
      .filter((x): x is string => x != null)
      .slice(0, 5);
    // Если diff не дал человекочитаемых полей — оставляем заголовок без хвоста.
    return { title: "Отредактирована аренда", change: null, extras };
  }

  // ── Fallback — короткий заголовок без «#N · Имя · Модель» ──
  return { title: shortSummary(item.summary), change: null, extras: [] };
}

/** Короткий заголовок из summary — режем хвост «по аренде #N · Имя · Модель». */
function shortSummary(summary: string): string {
  let s = summary || "";
  s = s.replace(/\s+по\s+аренде\s+#?\d+(?:\s.*)?$/i, "");
  s = s.replace(/\s+по\s+скутеру\s+#?\d+(?:\s.*)?$/i, "");
  s = s.replace(/\s*[·•|]\s*Аренда\s+#?\d+.*$/i, "");
  s = s.replace(/\s*[·•|]\s*(?:Jog|Gear)[^·•|]*$/i, "");
  s = s.replace(
    /\s*[·•|]\s*[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)+(?=\s*(?:[·•|]|$))/g,
    "",
  );
  return s.trim() || summary;
}

function statusLabel(s: string): string {
  switch (s) {
    case "active":
      return "активна";
    case "completed":
      return "завершена";
    case "reserved":
      return "бронь";
    default:
      return s;
  }
}

/** Склонение по числу: 1 день, 2 дня, 5 дней. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** Дата «дд.мм» для diff-полей (бэк кладёт YYYY-MM-DD или ISO). */
function formatDateLabel(v: unknown): string {
  if (typeof v !== "string" && typeof v !== "number") return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      )
    : [];
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** #20: полная дата+время «18.06.2026, 14:33» — точный момент для аудита. */
function formatDateTimeFull(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** #20: относительное время «5 минут назад» — для удобства, рядом с точным. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 45) return "только что";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} ${plural(m, "минуту", "минуты", "минут")} назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${plural(h, "час", "часа", "часов")} назад`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} ${plural(d, "день", "дня", "дней")} назад`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} ${plural(mo, "месяц", "месяца", "месяцев")} назад`;
  const y = Math.round(mo / 12);
  return `${y} ${plural(y, "год", "года", "лет")} назад`;
}

/* ============================ Пилюля «было → стало» ============================ */

function ChangePills({
  change,
  size = "md",
}: {
  change: ChangeView;
  size?: "sm" | "md";
}) {
  const fromText =
    size === "sm"
      ? "rounded bg-white px-1 py-px text-[10.5px] font-semibold text-muted-2 line-through ring-1 ring-inset ring-border"
      : "rounded-md bg-white px-1.5 py-0.5 font-semibold text-muted-2 line-through ring-1 ring-inset ring-border";
  const toBase =
    size === "sm"
      ? "rounded px-1 py-px text-[10.5px] font-bold ring-1 ring-inset"
      : "rounded-md px-1.5 py-0.5 font-bold ring-1 ring-inset";
  const toTone =
    change.tone === "red"
      ? "bg-red-soft text-red-ink ring-red-soft"
      : change.tone === "green"
        ? "bg-green-soft text-green-ink ring-green-soft"
        : "bg-blue-50 text-blue-700 ring-blue-200";
  return (
    <>
      {change.from != null && <span className={fromText}>{change.from}</span>}
      {change.from != null && change.to != null && (
        <ArrowRight size={size === "sm" ? 10 : 12} className="text-muted-2" />
      )}
      {change.to != null && (
        <span className={cn(toBase, toTone)}>{change.to}</span>
      )}
    </>
  );
}

/* ============================ Миниатюры экипировки ============================ */

/**
 * Квадрат-миниатюра экипировки. name=null → пустой квадрат-заглушка
 * (пунктир + иконка). Иначе — фото экипировки (bg-white object-contain),
 * fallback на иконку HardHat если миниатюры нет.
 */
function EquipmentThumb({
  name,
  resolveThumb,
  size = 30,
}: {
  name: string | null;
  resolveThumb: (name: string) => string | null;
  size?: number;
}) {
  const dim = { width: size, height: size };
  if (!name) {
    return (
      <span
        style={dim}
        className="flex shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-surface-soft text-muted-2"
      >
        <X size={size <= 24 ? 11 : 13} />
      </span>
    );
  }
  const url = resolveThumb(name);
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={dim}
        className="shrink-0 rounded-md bg-white object-contain ring-1 ring-inset ring-border"
      />
    );
  }
  return (
    <span
      style={dim}
      className="flex shrink-0 items-center justify-center rounded-md bg-orange-soft text-orange-ink ring-1 ring-inset ring-border"
    >
      <HardHat size={size <= 24 ? 12 : 15} />
    </span>
  );
}

/** Миниатюра экипировки + подпись ПОД ней (название или «пусто»). */
function EquipmentThumbLabeled({
  name,
  resolveThumb,
  size,
}: {
  name: string | null;
  resolveThumb: (name: string) => string | null;
  size: number;
}) {
  return (
    <div
      className="flex shrink-0 flex-col items-center gap-1 text-center"
      style={{ width: size + 18 }}
    >
      <EquipmentThumb name={name} resolveThumb={resolveThumb} size={size} />
      <span
        className={cn(
          "leading-tight",
          name ? "font-semibold text-ink-2" : "italic text-muted-2",
          size <= 24 ? "text-[9.5px]" : "text-[10.5px]",
        )}
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {name ?? "пусто"}
      </span>
    </div>
  );
}

function EquipmentChangeBlock({
  items,
  resolveThumb,
  compact = false,
}: {
  items: EquipmentChangeView[];
  resolveThumb: (name: string) => string | null;
  compact?: boolean;
}) {
  const thumbSize = compact ? 28 : 36;
  return (
    <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2")}>
      {items.map((it, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {/* Пары: [миниатюра + подпись] → [миниатюра + подпись] */}
          <div className="flex items-start gap-2">
            <EquipmentThumbLabeled
              name={it.fromName}
              resolveThumb={resolveThumb}
              size={thumbSize}
            />
            <ArrowRight
              size={compact ? 12 : 14}
              className={cn(
                "mt-2 shrink-0",
                it.kind === "added"
                  ? "text-green-ink"
                  : it.kind === "removed"
                    ? "text-red-ink"
                    : "text-muted-2",
              )}
            />
            <EquipmentThumbLabeled
              name={it.toName}
              resolveThumb={resolveThumb}
              size={thumbSize}
            />
          </div>
          {/* Сумма — отдельной строкой под парой. */}
          {it.caption && (
            <span
              className={cn(
                "text-muted",
                compact ? "text-[10.5px]" : "text-[11px]",
              )}
            >
              {it.caption}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ============================ Кликабельный контекст ============================ */

/**
 * #20: «Клиент · Скутер · #аренды» — каждая часть кликабельна и открывает свою
 * карточку (имя → клиент, скутер → скутер, #N → аренда). Если опенер не передан
 * (или нет id) — рендерим как обычный текст, без клика.
 */
function ContextChips({
  parts,
  onOpenClient,
  onOpenScooter,
  onOpenRental,
}: {
  parts: ActivityContextParts;
  onOpenClient?: (id: number) => void;
  onOpenScooter?: (id: number) => void;
  onOpenRental?: (id: number) => void;
}) {
  const link =
    "rounded font-semibold text-ink-2 transition-colors hover:text-blue-700 hover:underline underline-offset-2";
  const plain = "font-semibold text-ink-2";
  const nodes: ReactNode[] = [];
  if (parts.client) {
    const c = parts.client;
    nodes.push(
      onOpenClient ? (
        <button key="c" type="button" onClick={() => onOpenClient(c.id)} className={link}>
          {c.name}
        </button>
      ) : (
        <span key="c" className={plain}>
          {c.name}
        </span>
      ),
    );
  }
  if (parts.scooter) {
    const s = parts.scooter;
    nodes.push(
      onOpenScooter && s.id ? (
        <button key="s" type="button" onClick={() => onOpenScooter(s.id)} className={link}>
          {s.label}
        </button>
      ) : (
        <span key="s" className={plain}>
          {s.label}
        </span>
      ),
    );
  }
  if (parts.rental) {
    const r = parts.rental;
    nodes.push(
      onOpenRental ? (
        <button
          key="r"
          type="button"
          onClick={() => onOpenRental(r.id)}
          className={cn(link, "tabular-nums")}
        >
          {r.label}
        </button>
      ) : (
        <span key="r" className={cn(plain, "tabular-nums")}>
          {r.label}
        </span>
      ),
    );
  }
  return (
    <>
      {nodes.map((n, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-muted-2 opacity-50">·</span>}
          {n}
        </Fragment>
      ))}
    </>
  );
}

/* ============================ Основной компонент ============================ */

export function ActivityEventRow({
  item,
  clickable = false,
  onOpen,
  compact = false,
  context,
  feed = false,
  contextParts,
  onOpenClient,
  onOpenScooter,
  onOpenRental,
  maxExtras,
}: {
  item: ApiActivityItem;
  /** Кликабельна ли строка (открыть связанную сущность). */
  clickable?: boolean;
  onOpen?: () => void;
  /** Плотный режим: одна строка, без extras (дашборд, inline-история). */
  compact?: boolean;
  /** #20: строка контекста «Клиент · Скутер · #аренды» (резолвится в родителе,
   *  показывается в compact-ленте дашборда/журнала, чтобы было видно кто/что). */
  context?: string;
  /** #20: просторная раскладка ленты (вариант B) — десктоп «Последние действия»:
   *  слева суть + кликабельный контекст, справа сумма + дата/время + кто. */
  feed?: boolean;
  /** #20: структурированный контекст для кликабельных сущностей (feed-режим). */
  contextParts?: ActivityContextParts;
  onOpenClient?: (id: number) => void;
  onOpenScooter?: (id: number) => void;
  onOpenRental?: (id: number) => void;
  /** #20: ограничить число строк-последствий (feed-режим: дашборд=3, журнал=все). */
  maxExtras?: number;
}) {
  const vis = eventVisual(item.action, item.entity);
  const Icon = vis.icon;
  const view = formatActivitySummary(item);
  const interactive = clickable && !!onOpen;
  // #20: ручные/нестандартные операции (прощение, ручное начисление, откат,
  // возврат) — помечаем флагом, чтобы при аудите глаз цеплял их среди рутины.
  const isManual = /forgiv|manual|rolled_back|refund/.test(item.action);

  // v0.7.16: резолвер миниатюры экипировки по названию.
  // Матчим название из meta.diff.items → equipment row → thumb-ключ → URL.
  // (а) из task: подтягиваем avatarThumbKey/avatarKey по уникальному названию.
  const { data: equipmentList } = useApiEquipment();
  const resolveThumb = (name: string): string | null => {
    const eq = equipmentList?.find(
      (e) => e.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (!eq) return null;
    return fileUrl(eq.avatarThumbKey ?? eq.avatarKey, { variant: "thumb" });
  };

  // #20: просторная лента (вариант B) — десктоп «Последние действия».
  // Слева: иконка + заголовок (+ флаг «ручное») + кликабельный контекст +
  // экипировка-миниатюры / смысловое «было → стало» + пояснения.
  // Справа: денежный заголовок (если есть) + точная дата/время + «N назад · кто».
  if (feed) {
    const extrasToShow =
      maxExtras != null ? view.extras.slice(0, maxExtras) : view.extras;
    const openPrimary = () => {
      if (item.entityId == null) return;
      if (item.entity === "rental") onOpenRental?.(item.entityId);
      else if (item.entity === "scooter") onOpenScooter?.(item.entityId);
      else if (item.entity === "client") onOpenClient?.(item.entityId);
    };
    const primaryClickable =
      item.entityId != null &&
      ((item.entity === "rental" && !!onOpenRental) ||
        (item.entity === "scooter" && !!onOpenScooter) ||
        (item.entity === "client" && !!onOpenClient));
    const headlineTone =
      view.headline?.tone === "green"
        ? "text-green-ink"
        : view.headline?.tone === "red"
          ? "text-red-ink"
          : "text-ink";
    return (
      <div className="flex w-full items-start gap-3 rounded-[12px] px-2.5 py-3 transition-colors hover:bg-surface-soft">
        <span
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            EVENT_TONE_CLASS[vis.tone],
          )}
        >
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {primaryClickable ? (
              <button
                type="button"
                onClick={openPrimary}
                className="rounded text-left text-[14px] font-bold leading-tight text-ink transition-colors hover:text-blue-700 hover:underline underline-offset-2"
              >
                {view.title}
              </button>
            ) : (
              <span className="text-[14px] font-bold leading-tight text-ink">
                {view.title}
              </span>
            )}
            {isManual && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-800">
                ручное
              </span>
            )}
          </div>
          {contextParts && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] leading-tight">
              <ContextChips
                parts={contextParts}
                onOpenClient={onOpenClient}
                onOpenScooter={onOpenScooter}
                onOpenRental={onOpenRental}
              />
            </div>
          )}
          {view.equipment && view.equipment.length > 0 && (
            <div className="mt-1.5">
              <EquipmentChangeBlock
                items={view.equipment}
                resolveThumb={resolveThumb}
              />
            </div>
          )}
          {/* В правую колонку уезжает только денежное «было → стало»; смысловое
              (скутер/статус/период — синий тон) остаётся слева как пилюли. */}
          {view.change && view.change.tone === "blue" && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] leading-snug">
              <ChangePills change={view.change} size="md" />
            </div>
          )}
          {extrasToShow.length > 0 && (
            <div className="mt-1 flex flex-col gap-0.5">
              {extrasToShow.map((ex, i) => (
                <div key={i} className="text-[12px] text-ink-2">
                  {ex}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 pl-2 text-right">
          {view.headline && (
            <div
              className={cn(
                "text-[16px] font-bold leading-none tabular-nums",
                headlineTone,
              )}
            >
              {view.headline.text}
            </div>
          )}
          <div className="text-[11.5px] leading-tight text-muted-2">
            <div className="whitespace-nowrap tabular-nums">
              {formatDateTimeFull(item.createdAt)}
            </div>
            <div className="mt-0.5 whitespace-nowrap">
              <span>{relativeTime(item.createdAt)}</span>
              {item.userName && item.userName !== "система" && (
                <>
                  <span className="px-1 opacity-40">·</span>
                  <span className="font-semibold text-ink-2">
                    {item.userName}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={onOpen}
        disabled={!interactive}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-left transition-colors",
          "hover:bg-surface-soft",
          interactive ? "cursor-pointer" : "cursor-default",
        )}
        title={
          interactive ? `Открыть ${entityLabel(item.entity)}` : undefined
        }
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            EVENT_TONE_CLASS[vis.tone],
          )}
        >
          <Icon size={12} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12px] font-bold leading-tight text-ink">
              {view.title}
            </span>
            {isManual && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-800">
                ручное
              </span>
            )}
          </div>
          {context && (
            <div className="mt-0.5 truncate text-[11px] font-medium text-ink-2">
              {context}
            </div>
          )}
          {view.equipment && view.equipment.length > 0 && (
            <div className="mt-1">
              <EquipmentChangeBlock
                items={view.equipment}
                resolveThumb={resolveThumb}
                compact
              />
            </div>
          )}
          {view.change && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1 leading-tight">
              <ChangePills change={view.change} size="sm" />
            </div>
          )}
          {/* v0.7.16: краткое первое последствие (доплата/сумма) и в compact */}
          {view.extras.length > 0 && (
            <div className="mt-0.5 truncate text-[10.5px] font-semibold leading-tight text-ink-2">
              {view.extras[0]}
            </div>
          )}
          {/* #20: точная дата+время (момент для аудита) + относительное «N назад». */}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[10px] leading-tight text-muted">
            <span className="tabular-nums">
              {formatDateTimeFull(item.createdAt)}
            </span>
            <span className="opacity-40">·</span>
            <span>{relativeTime(item.createdAt)}</span>
            {item.userName && item.userName !== "система" && (
              <>
                <span className="opacity-40">·</span>
                <span>{item.userName}</span>
              </>
            )}
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!interactive}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-[12px] px-3 py-2.5 text-left transition-colors",
        "bg-surface-soft hover:bg-blue-50",
        interactive ? "cursor-pointer" : "cursor-default",
      )}
      title={interactive ? `Открыть ${entityLabel(item.entity)}` : undefined}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          EVENT_TONE_CLASS[vis.tone],
        )}
      >
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold leading-snug text-ink">
          {view.title}
        </div>
        {/* v0.7.16: экипировка — медиа-миниатюры «было → стало» */}
        {view.equipment && view.equipment.length > 0 && (
          <div className="mt-1.5">
            <EquipmentChangeBlock
              items={view.equipment}
              resolveThumb={resolveThumb}
            />
          </div>
        )}
        {/* основное «было → стало» */}
        {view.change && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] leading-snug">
            <ChangePills change={view.change} size="md" />
          </div>
        )}
        {/* доп. строки последствий (доплата, новая сумма аренды и т.п.) */}
        {view.extras.length > 0 && (
          <div className="mt-1 flex flex-col gap-0.5">
            {view.extras.map((ex, i) => (
              <div key={i} className="text-[11.5px] font-semibold text-ink-2">
                {ex}
              </div>
            ))}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-2">
          <Clock size={10} />
          {formatDateTime(item.createdAt)}
          {item.userName && item.userName !== "система" && (
            <>
              <span className="opacity-40">·</span>
              <span>{item.userName}</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
