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
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  CheckCircle2,
  Clock,
  FileText,
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

function eventVisual(action: string): { icon: LucideIcon; tone: EventTone } {
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
  if (action.includes("status") || action.includes("complet"))
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
};

/**
 * Разбирает событие в визуальную форму:
 *   • title  — короткий заголовок («Изменена экипировка»),
 *   • change — основное «было → стало» (две пилюли + стрелка),
 *   • extras — доп. последствия одной строкой (доплата, новая сумма).
 * Берёт структурированный meta.diff (см. apps/api/.../activityLog.ts).
 */
export function formatActivitySummary(
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

  // ── Заметка-стикер (v0.8.14) ──
  if (action === "note_added" || action === "note_removed") {
    const m = readRecord(item.meta);
    const text = typeof m?.text === "string" ? m.text : "";
    const isContact = m?.kind === "contact";
    const title =
      action === "note_added"
        ? isContact
          ? "Добавлен комментарий по связи"
          : "Добавлена заметка"
        : isContact
          ? "Снят комментарий по связи"
          : "Снята заметка";
    return { title, change: null, extras: text ? [`«${text}»`] : [] };
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
    // v0.8.14 (ревизор): причина замены и судьба старого скутера на момент.
    if (typeof m?.reason === "string" && m.reason.trim())
      extras.push(`Причина: ${m.reason.trim()}`);
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

  // ── Платёж ──
  if (
    action.includes("payment") ||
    action.includes("paid") ||
    action === "debt_payment"
  ) {
    const pay = readRecord(diff?.payment);
    const amount = pay?.to ?? readRecord(item.meta)?.amount;
    return {
      title: "Принят платёж",
      change:
        amount != null
          ? { from: null, to: money(amount), tone: "green" }
          : null,
      extras: [],
    };
  }

  // ── Прощение долга ──
  if (action.includes("forgiv")) {
    // diff может содержать: debt/fine (money) + overdueDays (number, дни).
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
    if (
      overdueDays &&
      typeof overdueDays.from === "number" &&
      overdueDays.from > 0
    ) {
      const d = overdueDays.from;
      extras.push(`Снято дней просрочки: ${d} ${plural(d, "день", "дня", "дней")}`);
    }
    const fineLineForgiven = readRecord(diff?.fine);
    if (debt && fineLineForgiven && fineLineForgiven !== amountRec) {
      // target='all' иногда кладёт и debt, и fine — покажем штраф отдельно.
      extras.push(`Штраф: ${money(fineLineForgiven.from)}`);
    }
    return {
      title,
      change: amountRec
        ? { from: money(amountRec.from), to: "0 ₽", tone: "green" }
        : null,
      extras,
    };
  }

  // ── Начисление долга / ущерб / просрочка ──
  if (
    action.includes("debt") ||
    action.includes("overdue") ||
    action.includes("damage")
  ) {
    const key = ["debt", "damage", "fine"].find((k) => diff?.[k]);
    const d = key ? readRecord(diff?.[key]) : null;
    const title = action.includes("damage")
      ? "Зафиксирован ущерб"
      : "Начислен долг";
    return {
      title,
      change: d ? { from: "—", to: money(d.to), tone: "red" } : null,
      extras: [],
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
    return {
      title: "Изменён статус",
      change: fromS || toS ? { from: fromS, to: toS, tone: "blue" } : null,
      extras,
    };
  }

  // ── Создание ──
  if (action === "created" && item.entity === "rental") {
    return { title: "Аренда создана", change: null, extras: [] };
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

function formatDateTimeShort(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

/* ============================ Основной компонент ============================ */

export function ActivityEventRow({
  item,
  clickable = false,
  onOpen,
  compact = false,
}: {
  item: ApiActivityItem;
  /** Кликабельна ли строка (открыть связанную сущность). */
  clickable?: boolean;
  onOpen?: () => void;
  /** Плотный режим: одна строка, без extras (дашборд, inline-история). */
  compact?: boolean;
}) {
  const vis = eventVisual(item.action);
  const Icon = vis.icon;
  const view = formatActivitySummary(item);
  const interactive = clickable && !!onOpen;

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
          <div className="truncate text-[12px] font-bold leading-tight text-ink">
            {view.title}
          </div>
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
          <div className="mt-0.5 text-[10px] leading-tight text-muted tabular-nums">
            {formatDateTimeShort(item.createdAt)}
            {item.userName && item.userName !== "система" && (
              <>
                <span className="opacity-40"> · </span>
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
