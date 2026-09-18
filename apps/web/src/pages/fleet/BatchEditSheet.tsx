import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  HandCoins,
  HelpCircle,
  Info,
  Key,
  Layers,
  Loader2,
  Minus,
  Plus,
  Tag,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useRole } from "@/lib/role";
import { useCan } from "@/lib/permissions";
import { ApiError } from "@/lib/api";
import { setNextApprovalContext } from "@/lib/directorGate";
import { useApiRentals } from "@/lib/api/rentals";
import { useBuyoutDeals } from "@/lib/api/buyout";
import { modelForRent, modelForSale, useApiScooterModels } from "@/lib/api/scooter-models";
import {
  useEditBatch,
  useRentalSlots,
  useSetSlotsTotal,
  type BatchEditInput,
  type BatchTarget,
} from "@/lib/api/scooters";
import type { ApiScooter } from "@/lib/api/types";
import { ScooterName, scooterModelName } from "@/components/ScooterName";
import { suggestKey } from "@/components/SuggestInput";
import { TABLET_WIZARD_PANEL } from "@/mobile/tablet";
import { digitsOnly, fmtMoney, plural } from "./addScooterDraft";
import { GROUP_LABEL, GROUP_TONE, UNIT_STATUS_LABEL, groupOf, unitHint, type Group } from "./batchGroups";
import type { BatchSummary } from "./BatchesPanel";

/**
 * Правка партии после создания (2.0.3).
 *
 * Заказчик 18.09: «возможность редактирования партии после её создания,
 * редактировать данные партии, например её статус, партию». Партия — это
 * общий номер у единиц, поэтому общее меняется у всех сразу: номер, дата и
 * закуп. Статус — раскладкой (второй круг 18.09): «двое в аренду, пятеро на
 * продажу, двое в выкуп» за одно сохранение. Выбираешь, куда, — нажимаешь на
 * единицы, они «улетают» туда, на корзине — счётчик. Проданные, занятые по
 * договору и в архиве остаются как есть, окно пишет почему. Смена статуса —
 * один ключ директора на всё сохранение. Номеров аренды не хватает — их можно
 * добавить прямо отсюда.
 */

const TARGETS: { id: BatchTarget; title: string; lead: string; icon: typeof Key }[] = [
  { id: "rental_pool", title: "В аренду", lead: "Получат арендные номера — первые свободные", icon: Key },
  { id: "for_sale", title: "На продажу", lead: "Встанут на витрину «Продаж»", icon: Tag },
  { id: "buyout", title: "В выкуп", lead: "Договор выкупа оформляется в «Выкупе»", icon: HandCoins },
  { id: "ready", title: "Пока не решили", lead: "Вернутся в «Не распределены»", icon: HelpCircle },
];

const TARGET_DONE: Record<BatchTarget, string> = {
  rental_pool: "в аренду",
  for_sale: "на продажу",
  buyout: "в выкуп",
  ready: "в «Не распределены»",
};

/** Цвет направления: точка, рамка, текст, фон. */
const TONE: Record<BatchTarget, { dot: string; border: string; text: string; soft: string }> = {
  rental_pool: { dot: "bg-blue-600", border: "border-blue-600", text: "text-blue-700", soft: "bg-blue-50" },
  for_sale: { dot: "bg-emerald-600", border: "border-emerald-600", text: "text-emerald-700", soft: "bg-emerald-50" },
  buyout: { dot: "bg-violet-600", border: "border-violet-600", text: "text-purple-ink", soft: "bg-purple-soft" },
  ready: { dot: "bg-slate-500", border: "border-slate-500", text: "text-ink-2", soft: "bg-surface-soft" },
};

const IN_CARD: Record<string, string> = {
  repair: "на ремонте — меняется в карточке",
  dtp: "после ДТП — меняется в карточке",
  disassembly: "в разборке — меняется в карточке",
};

const holdsSlot = (s: string) => s === "rental_pool" || s === "repair" || s === "dtp";
const dayRu = (iso: string | null) => (iso ? iso.split("-").reverse().join(".") : "—");
const units3 = (n: number) => plural(n, ["единица", "единицы", "единиц"]);
const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Одинаковое значение у всех единиц — или null, если разное. */
function common<T>(units: ApiScooter[], pick: (u: ApiScooter) => T): { same: boolean; value: T | null } {
  if (!units.length) return { same: true, value: null };
  const first = pick(units[0]!);
  const same = units.every((u) => pick(u) === first);
  return { same, value: same ? first : null };
}

/**
 * Точка «улетает» из строки единицы в корзину направления. Только анимация:
 * состояние меняется сразу, без ожидания полёта.
 */
function flyDot(from: Element | null, to: Element | null, dotClass: string) {
  if (!from || !to || reduceMotion()) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if (!a.width || !b.width) return;
  const dot = document.createElement("div");
  dot.className = `pointer-events-none fixed z-[200] h-5 w-5 rounded-full shadow-lg ring-2 ring-white ${dotClass}`;
  dot.style.left = `${a.left + a.width / 2 - 10}px`;
  dot.style.top = `${a.top + a.height / 2 - 10}px`;
  document.body.appendChild(dot);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = dot.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 36}px) scale(1.15)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.45)`, opacity: 0.35 },
    ],
    { duration: 480, easing: "cubic-bezier(.45,0,.25,1)" },
  );
  anim.onfinish = () => dot.remove();
  anim.oncancel = () => dot.remove();
}

/** Счётчик на корзине: подпрыгивает, когда туда прилетела единица. */
function CountBadge({ n, tone, corner }: { n: number; tone: BatchTarget; corner?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(n);
  useEffect(() => {
    if (n > prev.current && ref.current && !reduceMotion()) {
      ref.current.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.45)" }, { transform: "scale(1)" }],
        { duration: 300, delay: 380, easing: "ease-out" },
      );
    }
    prev.current = n;
  }, [n]);
  return (
    <span
      ref={ref}
      data-bin-count
      className={cn(
        "flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[12px] font-extrabold tabular-nums text-white",
        TONE[tone].dot,
        // Телефон: кружок в углу корзины — название получает всю ширину.
        corner && "absolute -right-1.5 -top-1.5 ring-2 ring-surface",
      )}
    >
      {n}
    </span>
  );
}

export function BatchEditSheet({
  batch: b,
  batches,
  touch,
  onClose,
}: {
  batch: BatchSummary;
  /** Все партии — предупредить, что новое название совпадёт с другой. */
  batches: BatchSummary[];
  touch: boolean;
  onClose: () => void;
}) {
  const role = useRole();
  const canProfit = useCan("data.profit");
  const showCost = role === "director" && canProfit;
  const canEditModel = role === "director" || role === "admin" || role === "creator";
  const { data: models = [] } = useApiScooterModels();
  const { data: rentals = [] } = useApiRentals();
  const buyoutQ = useBuyoutDeals();
  const slotsQ = useRentalSlots();
  const edit = useEditBatch();
  const rootRef = useRef<HTMLDivElement>(null);

  const units = b.units;
  const live = units.filter((u) => !u.archivedAt);
  const idx = new Map(units.map((u, i) => [u.id, i + 1]));

  /* ── общее ── */
  const dateC = common(units, (u) => u.purchaseDate ?? null);
  const costC = common(units, (u) => u.purchasePrice ?? null);
  const [name, setName] = useState(b.label);
  const [date, setDate] = useState(dateC.value ?? b.purchaseDate ?? "");
  const [dateTouched, setDateTouched] = useState(false);
  const [cost, setCost] = useState(costC.value != null ? String(costC.value) : "");
  const [costTouched, setCostTouched] = useState(false);

  /* ── раскладка по статусам ── */
  const [active, setActive] = useState<BatchTarget | null>(null);
  const [assign, setAssign] = useState<Map<number, BatchTarget>>(new Map());
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** Единицы, у которых сервер не принял смену статуса, — с причиной. */
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [slotsOpen, setSlotsOpen] = useState(false);

  const rentBy = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of rentals) if (r.status === "active" && r.scooterId != null) m.set(r.scooterId, r.id);
    return m;
  }, [rentals]);
  const buyoutBy = useMemo(() => {
    const s = new Set<number>();
    for (const d of buyoutQ.data?.items ?? [])
      if ((d.status === "contract" || d.status === "active") && d.scooterId != null) s.add(d.scooterId);
    return s;
  }, [buyoutQ.data]);

  /** Почему статус этой единицы сюда не меняется; null — можно. */
  const blockOf = (u: ApiScooter, t: BatchTarget): { text: string; same?: boolean } | null => {
    if (u.archivedAt) return { text: "в архиве" };
    if (u.baseStatus === "sold") return { text: "продана" };
    if (u.baseStatus === t) return { text: "уже здесь", same: true };
    const rent = rentBy.get(u.id);
    if (rent != null) return { text: `в аренде по договору #${String(rent).padStart(4, "0")}` };
    if (buyoutBy.has(u.id)) return { text: "в выкупе по договору — меняется в «Выкупе»" };
    if (IN_CARD[u.baseStatus]) return { text: IN_CARD[u.baseStatus]! };
    if (t === "buyout" && u.isPartner) return { text: "партнёрская — в выкуп нельзя" };
    return null;
  };

  const countOf = (t: BatchTarget) => [...assign.values()].filter((x) => x === t).length;
  const moving = units.filter((u) => assign.has(u.id));
  const to = (u: ApiScooter) => assign.get(u.id) ?? null;

  const binEl = (t: BatchTarget) =>
    rootRef.current?.querySelector(`[data-bin="${t}"] [data-bin-count]`) ??
    rootRef.current?.querySelector(`[data-bin="${t}"] [data-bin-icon]`) ??
    null;

  const clearErrors = () => {
    setSubmitError(null);
    setRowErrors({});
  };

  /** Нажали на единицу: в выбранную корзину или обратно. */
  const tapUnit = (u: ApiScooter, dotEl: Element | null) => {
    if (!active) return;
    const cur = assign.get(u.id);
    const next = new Map(assign);
    if (cur === active) {
      next.delete(u.id);
    } else {
      if (blockOf(u, active)) return;
      next.set(u.id, active);
      flyDot(dotEl, binEl(active), TONE[active].dot);
    }
    setAssign(next);
    clearErrors();
  };

  /** «Все сюда»: все, кого можно, и кто ещё никуда не отправлен. */
  const freeFor = (t: BatchTarget) => units.filter((u) => !assign.has(u.id) && !blockOf(u, t));
  const allHere = () => {
    if (!active) return;
    const list = freeFor(active);
    const next = new Map(assign);
    list.forEach((u, i) => {
      next.set(u.id, active);
      const dotEl = rootRef.current?.querySelector(`[data-unit="${u.id}"] [data-dot]`) ?? null;
      window.setTimeout(() => flyDot(dotEl, binEl(active), TONE[active].dot), i * 60);
    });
    setAssign(next);
    clearErrors();
  };
  const clearHere = () => {
    if (!active) return;
    const next = new Map(assign);
    for (const [id, t] of assign) if (t === active) next.delete(id);
    setAssign(next);
    clearErrors();
  };

  /* ── номера аренды ── */
  const slotsTotal = slotsQ.data?.total ?? 0;
  const freeSlots = slotsQ.data?.free ?? [];
  const entering = moving.filter((u) => holdsSlot(to(u)!) && !holdsSlot(u.baseStatus));
  const leaving = moving.filter((u) => !holdsSlot(to(u)!) && u.rentalSlot != null);
  const slotShort = Math.max(0, entering.length - freeSlots.length);
  const gotSlots = freeSlots.slice(0, entering.length);

  /* ── модель под категорию ── */
  const purposeMissing = useMemo(() => {
    const need = (t: BatchTarget) =>
      new Set(moving.filter((u) => to(u) === t).map((u) => u.modelId).filter((x): x is number => x != null));
    const rent = need("rental_pool");
    const sale = need("for_sale");
    return [
      ...models.filter((m) => rent.has(m.id) && !modelForRent(m)).map((m) => ({ m, what: "«Сдаём в аренду»" })),
      ...models.filter((m) => sale.has(m.id) && !modelForSale(m)).map((m) => ({ m, what: "«Продаём»" })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assign, models]);

  /* ── цена продажи: у тех, кто после правки на витрине ── */
  const showcase = live.filter((u) => (assign.has(u.id) ? to(u) === "for_sale" : u.baseStatus === "for_sale"));
  const saleC = common(showcase, (u) => u.salePrice ?? null);
  const [sale, setSale] = useState("");
  const [saleTouched, setSaleTouched] = useState(false);
  const saleValue = saleTouched ? sale : saleC.value != null ? String(saleC.value) : "";
  const noPrice = showcase.filter((u) => u.salePrice == null).length;

  /* ── что изменится ── */
  const nameTrim = name.trim();
  const nameChanged = nameTrim !== b.label;
  const mergeWith =
    nameChanged && suggestKey(nameTrim) !== b.key
      ? batches.find((x) => x.key === suggestKey(nameTrim)) ?? null
      : null;
  const dateChanged = dateTouched && (!dateC.same || (dateC.value ?? "") !== date);
  const costChanged = showCost && costTouched && (!costC.same || String(costC.value ?? "") !== cost);
  const saleChanged = showcase.length > 0 && saleTouched && (!saleC.same || String(saleC.value ?? "") !== sale);
  const moveParts = TARGETS.filter((t) => countOf(t.id) > 0).map((t) => `${TARGET_DONE[t.id]} ${countOf(t.id)}`);

  const changes = [
    nameChanged && "номер партии",
    dateChanged && "дата закупа",
    costChanged && "закуп",
    ...moveParts,
    saleChanged && `цена продажи у ${showcase.length}`,
  ].filter(Boolean) as string[];

  const problem = !nameTrim
    ? "Впишите номер партии"
    : slotShort
      ? `Не хватает арендных номеров: ${slotShort}`
      : purposeMissing.length && !canEditModel
        ? `Модель ${purposeMissing.map((p) => `«${p.m.name}»`).join(", ")} не отмечена под эту категорию — это меняет директор`
        : null;

  const unitLine = (u: ApiScooter) =>
    `${scooterModelName(u.name)}${u.rentalSlot != null ? ` №${u.rentalSlot}` : ""} · ${unitHint(u)}`;

  const save = async () => {
    if (!changes.length || problem) return;
    const body: BatchEditInput = { ids: units.map((u) => u.id), batch: b.label };
    if (nameChanged) body.rename = nameTrim;
    if (dateChanged) body.purchaseDate = date || null;
    if (costChanged) body.purchasePrice = cost === "" ? null : Number(cost);
    if (saleChanged) body.salePrice = sale === "" ? null : Number(sale);
    if (moving.length) {
      body.moves = TARGETS.filter((t) => countOf(t.id) > 0).map((t) => ({
        to: t.id,
        ids: moving.filter((u) => to(u) === t.id).map((u) => u.id),
      }));
      if (purposeMissing.length) body.enableModelPurpose = true;
      setNextApprovalContext({
        summary: `Партия «${b.label}»: ${TARGETS.filter((t) => countOf(t.id) > 0)
          .map((t) => `${TARGET_DONE[t.id]} — ${countOf(t.id)}`)
          .join(", ")}`,
        details: [
          ...moving.slice(0, 8).map((u) => `${idx.get(u.id)}. ${unitLine(u)} → ${TARGET_DONE[to(u)!]}`),
          ...(moving.length > 8 ? [`и ещё ${moving.length - 8}`] : []),
        ],
      });
    }
    clearErrors();
    try {
      const res = await edit.mutateAsync(body);
      const label = nameChanged ? nameTrim : b.label;
      const bits = [
        nameChanged && (mergeWith ? `объединена с «${mergeWith.label}»` : `новый номер «${nameTrim}»`),
        dateChanged && `дата закупа ${dayRu(date || null)}`,
        costChanged && "закуп обновлён",
        ...TARGETS.filter((t) => countOf(t.id) > 0).map(
          (t) => `${TARGET_DONE[t.id]} — ${countOf(t.id)}${t.id === "rental_pool" && res.slots.length ? ` (номера ${res.slots.join(", ")})` : ""}`,
        ),
        saleChanged && `цена продажи ${sale ? fmtMoney(Number(sale)) : "убрана"}`,
      ].filter(Boolean) as string[];
      toast.success(`Партия «${label}» обновлена`, bits.join(" · "));
      onClose();
    } catch (e) {
      const err = e as ApiError;
      if (err?.status === 428) {
        // Сохранение идёт целиком: без ключа не сохранилось и остальное.
        setSubmitError(
          changes.length > moveParts.length
            ? "Ничего не сохранено: смена статуса — по ключу директора. Нажмите «Сохранить» ещё раз и введите ключ или отправьте запрос директору."
            : "Статус не изменён: нужен ключ директора. Нажмите «Сохранить» ещё раз и введите ключ или отправьте запрос директору.",
        );
        return;
      }
      const bb = (err?.body ?? null) as { rows?: { id: number; message: string }[] } | null;
      if (bb?.rows?.length) {
        const map: Record<number, string> = {};
        for (const r of bb.rows) map[r.id] = r.message.replace(/^[^:]+:\s*/, "");
        setRowErrors(map);
      }
      setSubmitError(err?.message || "Не удалось сохранить партию");
    }
  };

  /* ───────────── вёрстка ───────────── */

  const inputCls = cn(
    "w-full rounded-xl border border-border bg-white px-3 text-ink outline-none focus:border-blue-600",
    touch ? "h-12 text-[16px]" : "h-10 text-[14px]",
  );
  const labelCls = "mb-1 block text-[12px] font-semibold text-muted";
  const groups = (Object.keys(GROUP_LABEL) as Group[]).filter((g) => b.counts[g] > 0);
  const activeT = active ? TARGETS.find((t) => t.id === active)! : null;
  const hereFree = active ? freeFor(active).length : 0;
  const hereCount = active ? countOf(active) : 0;

  const bins = (
    <div
      className={cn("sticky top-0 z-10 bg-surface pb-2 pt-1", touch ? "-mx-4 px-4" : "-mx-6 px-6")}
      data-batch-bins
    >
      <div className={cn("grid gap-2", touch ? "grid-cols-2" : "grid-cols-4")} data-batch-targets>
        {TARGETS.map((t) => {
          const Icon = t.icon;
          const on = active === t.id;
          const n = countOf(t.id);
          const can = units.filter((u) => !blockOf(u, t.id)).length;
          return (
            <button
              key={t.id}
              type="button"
              data-bin={t.id}
              aria-pressed={on}
              onClick={() => setActive(on ? null : t.id)}
              className={cn(
                "relative flex min-w-0 items-center gap-2 rounded-2xl border-2 text-left transition-colors",
                touch ? "min-h-[60px] px-2.5 py-2" : "min-h-[56px] px-2 py-1.5",
                on
                  ? cn(TONE[t.id].border, TONE[t.id].soft)
                  : n > 0
                    ? "border-border bg-white"
                    : "border-border bg-white hover:border-blue-600/40",
              )}
            >
              <span
                data-bin-icon
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                  on ? cn(TONE[t.id].dot, "text-white") : "bg-surface-soft text-ink-2",
                )}
              >
                <Icon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block font-extrabold leading-tight",
                    touch ? "text-[14px]" : "text-[13px]",
                    on ? TONE[t.id].text : "text-ink",
                  )}
                >
                  {t.title}
                </span>
                <span className="block text-[11px] leading-snug text-muted-2">
                  {n > 0 ? `${n} ${units3(n)}` : can ? `можно ${can}` : "некого"}
                </span>
              </span>
              {n > 0 && <CountBadge n={n} tone={t.id} corner={touch} />}
            </button>
          );
        })}
      </div>
      {activeT && (
        <div className="mt-2 flex flex-wrap items-center gap-2" data-batch-here>
          <span className={cn("min-w-0 flex-1 text-[12px] leading-snug", TONE[activeT.id].text)}>
            {activeT.lead}. Нажимайте на единицы ниже — они уходят сюда.
          </span>
          {hereFree > 0 && (
            <button
              type="button"
              onClick={allHere}
              className={cn(
                "shrink-0 rounded-full font-bold text-white",
                TONE[activeT.id].dot,
                touch ? "h-10 px-3.5 text-[13px]" : "h-8 px-3 text-[12px]",
              )}
            >
              Все сюда · {hereFree}
            </button>
          )}
          {hereCount > 0 && (
            <button
              type="button"
              onClick={clearHere}
              className={cn(
                "shrink-0 rounded-full border border-border bg-white font-semibold text-ink-2 hover:bg-surface-soft",
                touch ? "h-10 px-3.5 text-[13px]" : "h-8 px-3 text-[12px]",
              )}
            >
              Вернуть · {hereCount}
            </button>
          )}
        </div>
      )}
    </div>
  );

  const body = (
    <div className="flex flex-col gap-5">
      {/* Партия */}
      <section className="flex flex-col gap-3">
        <h3 className={cn("font-bold text-ink", touch ? "text-[16px]" : "text-[14px]")}>Данные партии</h3>
        <div className={cn("grid gap-3", !touch && "sm:grid-cols-[1fr_180px]")} data-batch-fields>
          <label className="min-w-0">
            <span className={labelCls}>Номер партии</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 120))}
              className={inputCls}
              data-batch-name
            />
          </label>
          <label className="min-w-0">
            <span className={labelCls}>Дата закупа</span>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setDateTouched(true);
              }}
              className={inputCls}
              data-batch-date
            />
          </label>
        </div>
        {!dateC.same && !dateTouched && (
          <p className="-mt-1 text-[12px] text-muted-2">
            Сейчас у единиц разные даты — выберите одну, и она станет у всех.
          </p>
        )}
        {mergeWith && (
          <Note tone="amber" icon={<Layers size={14} />}>
            Партия «{mergeWith.label}» уже есть ({mergeWith.units.length} {units3(mergeWith.units.length)}). Единицы
            объединятся в одну партию.
          </Note>
        )}
        {showCost && (
          <label className={cn("min-w-0", !touch && "sm:max-w-[260px]")}>
            <span className={labelCls}>Закуп за единицу, ₽</span>
            <input
              inputMode="numeric"
              value={cost}
              placeholder={costC.same ? "не указан" : "разный"}
              onChange={(e) => {
                setCost(digitsOnly(e.target.value, 9));
                setCostTouched(true);
              }}
              className={cn(inputCls, "tabular-nums")}
              data-batch-cost
            />
            <span className="mt-1 block text-[11.5px] text-muted-2">
              {costChanged
                ? cost
                  ? `Станет у всех ${units.length}: ${fmtMoney(Number(cost))}. В проданных сделках закуп свой, он не меняется.`
                  : `У всех ${units.length} закуп станет «не указан».`
                : costC.same
                  ? costC.value != null
                    ? `У всех ${units.length} — ${fmtMoney(costC.value)}. В проданных сделках закуп свой, он не меняется.`
                    : "Не указан ни у одной единицы."
                  : "Сейчас у единиц разный закуп — впишите, и он станет у всех."}
            </span>
          </label>
        )}
      </section>

      {/* Статус — раскладка по корзинам */}
      <section className="flex flex-col gap-2" data-batch-status>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn("mr-1 font-bold text-ink", touch ? "text-[16px]" : "text-[14px]")}>Статус</h3>
          {groups.map((g) => (
            <span key={g} className={cn("rounded-full px-2.5 py-1 text-[11.5px] font-bold", GROUP_TONE[g])}>
              {GROUP_LABEL[g]} · {b.counts[g]}
            </span>
          ))}
        </div>
        {bins}
        {!active && (
          <p className="text-[12px] leading-snug text-muted-2">
            Выберите, куда переводить, и нажимайте на единицы. Партию можно разложить по нескольким статусам сразу — например, двое в
            аренду, остальные на продажу. Смена статуса — по ключу директора, один раз на всё сохранение.
          </p>
        )}

        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-white" data-batch-units>
          {units.map((u) => {
            const cur = to(u);
            const blk = active ? blockOf(u, active) : null;
            const can = !!active && (cur === active || !blk);
            const err = rowErrors[u.id];
            const shownBlock = !cur && blk && !blk.same ? blk.text : null;
            return (
              <li key={u.id} data-unit={u.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!!cur}
                  disabled={!can}
                  onClick={(e) => tapUnit(u, e.currentTarget.querySelector("[data-dot]"))}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 text-left transition-colors",
                    touch ? "min-h-[60px] py-2" : "min-h-12 py-1.5",
                    can ? "hover:bg-surface-soft" : "cursor-default",
                    !active && !cur && "opacity-80",
                    blk && !cur && active && "bg-surface-soft/50",
                    err && "bg-red-50",
                  )}
                >
                  <span
                    data-dot
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      cur
                        ? cn(TONE[cur].dot, "border-transparent text-white")
                        : blk && active
                          ? "border-dashed border-border bg-surface-soft"
                          : "border-border-strong bg-white",
                    )}
                  >
                    {cur && (() => {
                      const I = TARGETS.find((t) => t.id === cur)!.icon;
                      return <I size={12} strokeWidth={2.5} />;
                    })()}
                  </span>
                  <span className="w-5 shrink-0 text-right text-[12px] font-bold tabular-nums text-muted-2">
                    {idx.get(u.id)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "flex items-center gap-2 font-bold",
                        touch ? "text-[14.5px]" : "text-[13.5px]",
                        blk && !cur && active ? "text-muted" : "text-ink",
                      )}
                    >
                      <ScooterName name={u.name} number={u.rentalSlot} size="sm" />
                    </span>
                    <span className="block truncate text-[11.5px] text-muted">{unitHint(u)}</span>
                    {(shownBlock || err) && (
                      <span className={cn("block text-[11.5px] font-semibold", err ? "text-red-700" : "text-muted-2")}>
                        {err ?? shownBlock}
                      </span>
                    )}
                    {touch && (
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", GROUP_TONE[groupOf(u)])}>
                          {UNIT_STATUS_LABEL[u.baseStatus] ?? u.baseStatus}
                        </span>
                        {cur && (
                          <span className={cn("flex items-center gap-1 text-[12px] font-bold", TONE[cur].text)}>
                            <ArrowRight size={13} /> {TARGETS.find((x) => x.id === cur)!.title}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                  {!touch && (
                    <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", GROUP_TONE[groupOf(u)])}>
                        {UNIT_STATUS_LABEL[u.baseStatus] ?? u.baseStatus}
                      </span>
                      {cur && (
                        <span className={cn("flex items-center gap-1 text-[11px] font-bold", TONE[cur].text)}>
                          <ArrowRight size={12} /> {TARGETS.find((x) => x.id === cur)!.title}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {entering.length > 0 &&
          (slotShort ? (
            <Note tone="red" icon={<AlertTriangle size={14} />}>
              В аренду переводим {entering.length}, а свободных арендных номеров {freeSlots.length}. Добавьте номера
              или верните часть единиц.
              <span className="mt-1.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSlotsOpen(true)}
                  data-add-slots
                  className={cn(
                    "flex items-center gap-1.5 rounded-full bg-red-600 px-3 font-bold text-white hover:bg-red-700",
                    touch ? "h-10 text-[13px]" : "h-8 text-[12px]",
                  )}
                >
                  <Plus size={14} /> Добавить номера
                </button>
                {freeSlots.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const drop = new Set(entering.slice(freeSlots.length).map((u) => u.id));
                      const next = new Map(assign);
                      for (const id of drop) next.delete(id);
                      setAssign(next);
                    }}
                    className={cn(
                      "flex items-center rounded-full bg-white px-3 font-bold text-red-700 shadow-card-sm hover:bg-red-100",
                      touch ? "h-10 text-[13px]" : "h-8 text-[12px]",
                    )}
                  >
                    Оставить {freeSlots.length}
                  </button>
                )}
              </span>
            </Note>
          ) : (
            <Note tone="blue" icon={<Key size={14} />}>
              Получат арендные номера: <b>{gotSlots.join(", ")}</b> — первые свободные.
            </Note>
          ))}
        {leaving.length > 0 && (
          <Note tone="gray" icon={<Info size={14} />}>
            Освободятся арендные номера: {leaving.map((u) => u.rentalSlot).join(", ")}.
          </Note>
        )}
        {purposeMissing.length > 0 && canEditModel && (
          <Note tone="amber" icon={<Info size={14} />}>
            {purposeMissing.map((p) => `Модель «${p.m.name}» пока не отмечена ${p.what}`).join("; ")} — при сохранении
            отметим.
          </Note>
        )}
      </section>

      {/* Цена продажи */}
      {showcase.length > 0 && (
        <section className="flex flex-col gap-2" data-batch-sale>
          <h3 className={cn("font-bold text-ink", touch ? "text-[16px]" : "text-[14px]")}>Цена продажи</h3>
          <label className={cn("min-w-0", !touch && "sm:max-w-[260px]")}>
            <span className={labelCls}>Для {showcase.length} на витрине, ₽</span>
            <input
              inputMode="numeric"
              value={saleValue}
              placeholder={saleC.same ? "не указана" : "разная"}
              onChange={(e) => {
                setSale(digitsOnly(e.target.value, 9));
                setSaleTouched(true);
              }}
              className={cn(inputCls, "tabular-nums")}
              data-batch-sale-input
            />
          </label>
          <p className="text-[11.5px] text-muted-2">
            {saleChanged
              ? sale
                ? `Станет у всех ${showcase.length} на витрине: ${fmtMoney(Number(sale))}. Проданные не меняются.`
                : `У всех ${showcase.length} на витрине цена станет «не указана».`
              : !saleC.same
                ? "Сейчас цены разные — впишите, и она станет у всех на витрине. Не трогайте — останутся свои."
                : noPrice
                  ? `Без цены: ${noPrice}. Цена видна в «Продажах».`
                  : "Одна цена у всех на витрине. Проданные не меняются."}
          </p>
        </section>
      )}
    </div>
  );

  const errorBar = submitError && (
    <div className="mb-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">{submitError}</span>
    </div>
  );
  const summary = problem ? (
    <span className="font-semibold text-orange-ink">{problem}</span>
  ) : changes.length ? (
    <span>
      Изменится: <b className="text-ink">{changes.join(" · ")}</b>
    </span>
  ) : (
    "Пока без изменений"
  );
  const saveDisabled = !changes.length || !!problem || edit.isPending;
  const title = `Партия «${b.label}»`;
  const sub = `${units.length} ${units3(units.length)} · ${b.models.map((m) => m.name).join(", ")}`;

  const slotsDialog = slotsOpen && (
    <AddSlotsDialog
      touch={touch}
      total={slotsTotal}
      free={freeSlots.length}
      need={slotShort}
      onClose={() => setSlotsOpen(false)}
    />
  );

  if (touch) {
    return (
      <div
        ref={rootRef}
        className="fixed inset-0 z-[130] flex flex-col bg-surface animate-modal-in lg:items-center lg:bg-ink/45 lg:backdrop-blur-sm"
        data-batch-edit
      >
        <div className={TABLET_WIZARD_PANEL}>
          <div className="flex items-center gap-2 border-b border-border bg-surface-soft px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-bold text-ink">{title}</div>
              <div className="truncate text-[12.5px] text-muted-2">{sub}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted active:bg-border"
            >
              <X size={19} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4" data-batch-scroll>
            {body}
          </div>
          <div
            className="border-t border-border bg-white px-4 pt-2.5"
            style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
          >
            {errorBar}
            <div className="mb-2 text-center text-[12.5px] text-muted" data-batch-summary>
              {summary}
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="h-12 shrink-0 rounded-2xl bg-surface-soft px-5 text-[14px] font-semibold text-ink-2 active:bg-surface"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saveDisabled}
                className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-[15px] font-bold text-white active:bg-blue-700 disabled:opacity-45"
              >
                {edit.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Сохранить
              </button>
            </div>
          </div>
        </div>
        {slotsDialog}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/55 p-6 backdrop-blur-sm animate-backdrop-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-batch-edit
    >
      <div className="flex max-h-[92vh] w-full max-w-[800px] flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg animate-modal-in">
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-6 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Layers size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[18px] font-extrabold text-ink">{title}</div>
            <div className="truncate text-[12.5px] text-muted">{sub}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={17} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5" data-batch-scroll>
          {body}
        </div>
        {submitError && <div className="border-t border-border bg-surface-soft px-6 pt-3">{errorBar}</div>}
        <div className={cn("flex items-center gap-3 bg-surface-soft px-6 py-3", !submitError && "border-t border-border")}>
          <div className="min-w-0 flex-1 text-[12.5px] text-muted" data-batch-summary>
            {summary}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-full border border-border bg-surface px-4 text-[13px] font-semibold text-muted hover:bg-border"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saveDisabled}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-blue-600 px-5 text-[13px] font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-muted-2"
          >
            {edit.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Сохранить
          </button>
        </div>
      </div>
      {slotsDialog}
    </div>
  );
}

/**
 * Добавить арендные номера прямо из окна партии (18.09): сколько — выбирает
 * человек, по умолчанию — сколько не хватает. Номера идут следом за
 * последним: было 50 — появятся 51, 52. То же число — на странице «Скутеры».
 */
function AddSlotsDialog({
  touch,
  total,
  free,
  need,
  onClose,
}: {
  touch: boolean;
  total: number;
  free: number;
  need: number;
  onClose: () => void;
}) {
  const setTotal = useSetSlotsTotal();
  const [n, setN] = useState(Math.max(1, need));
  const from = total + 1;
  const till = total + n;
  const add = async () => {
    try {
      await setTotal.mutateAsync(till);
      toast.success(
        `Добавлено ${n} ${plural(n, ["номер", "номера", "номеров"])}`,
        `${n === 1 ? `Номер ${from}` : `Номера ${from}–${till}`} · всего ${till}`,
      );
      onClose();
    } catch (e) {
      toast.error("Не удалось добавить номера", (e as Error).message);
    }
  };
  const stepBtn = cn(
    "flex shrink-0 items-center justify-center rounded-full border border-border bg-white text-ink-2 hover:bg-surface-soft disabled:opacity-40",
    touch ? "h-12 w-12" : "h-10 w-10",
  );
  return (
    <div
      className="fixed inset-0 z-[160] flex items-end justify-center bg-ink/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-add-slots-dialog
    >
      <div
        className="w-full max-w-[420px] rounded-t-3xl bg-surface p-5 shadow-card-lg animate-modal-in sm:rounded-3xl"
        style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Key size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[17px] font-extrabold text-ink">Добавить арендные номера</div>
            <div className="mt-0.5 text-[12.5px] leading-snug text-muted">
              Сейчас номеров {total}, свободно {free}. Для этой партии не хватает {need}.
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-4">
          <button type="button" className={stepBtn} onClick={() => setN((x) => Math.max(1, x - 1))} disabled={n <= 1} aria-label="Меньше">
            <Minus size={18} />
          </button>
          <div className="min-w-[88px] text-center">
            <div className="font-display text-[34px] font-extrabold tabular-nums leading-none text-ink">{n}</div>
            <div className="mt-1 text-[12px] text-muted-2">{plural(n, ["номер", "номера", "номеров"])}</div>
          </div>
          <button type="button" className={stepBtn} onClick={() => setN((x) => Math.min(99, x + 1))} aria-label="Больше">
            <Plus size={18} />
          </button>
        </div>
        <div className="mt-4 rounded-xl bg-surface-soft px-3 py-2 text-center text-[13px] text-ink-2">
          Появятся {n === 1 ? <>номер <b>{from}</b></> : <>номера <b>{from}–{till}</b></>} · всего станет <b>{till}</b>
          {n < need && <div className="mt-0.5 text-[12px] font-semibold text-orange-ink">Не хватит: нужно ещё {need - n}</div>}
        </div>
        <div className="mt-4 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "shrink-0 rounded-2xl bg-surface-soft px-5 font-semibold text-ink-2 hover:bg-border",
              touch ? "h-12 text-[14px]" : "h-10 text-[13px]",
            )}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={add}
            disabled={setTotal.isPending}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 font-bold text-white hover:bg-blue-700 disabled:opacity-50",
              touch ? "h-12 text-[15px]" : "h-10 text-[13.5px]",
            )}
          >
            {setTotal.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Добавить {n}
          </button>
        </div>
      </div>
    </div>
  );
}

function Note({
  tone,
  icon,
  children,
}: {
  tone: "blue" | "amber" | "red" | "gray";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3 py-2 text-[12.5px] leading-snug",
        tone === "blue" && "border-blue-200 bg-blue-50 text-blue-900",
        tone === "amber" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "red" && "border-red-200 bg-red-50 text-red-700",
        tone === "gray" && "border-border bg-surface-soft text-ink-2",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
