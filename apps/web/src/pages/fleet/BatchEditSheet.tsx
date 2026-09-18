import { useMemo, useState } from "react";
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
import { useEditBatch, useRentalSlots, type BatchEditInput, type BatchTarget } from "@/lib/api/scooters";
import type { ApiScooter } from "@/lib/api/types";
import { ScooterName } from "@/components/ScooterName";
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
 * закуп. Статус — у выбранных единиц: кто продан, в аренде по договору или
 * в архиве, остаётся как есть, и окно говорит почему. Смена статуса — один
 * ключ директора на всю партию. Правила — те же, что в карточке техники.
 */

const TARGETS: { id: BatchTarget; title: string; lead: string; icon: typeof Key }[] = [
  { id: "rental_pool", title: "В аренду", lead: "получат арендные номера", icon: Key },
  { id: "for_sale", title: "На продажу", lead: "на витрину «Продаж»", icon: Tag },
  { id: "buyout", title: "В выкуп", lead: "договор — в «Выкупе»", icon: HandCoins },
  { id: "ready", title: "Пока не решили", lead: "в «Не распределены»", icon: HelpCircle },
];

const TARGET_DONE: Record<BatchTarget, string> = {
  rental_pool: "в аренду",
  for_sale: "на продажу",
  buyout: "в выкуп",
  ready: "в «Не распределены»",
};

const IN_CARD: Record<string, string> = {
  repair: "на ремонте — меняется в карточке",
  dtp: "после ДТП — меняется в карточке",
  disassembly: "в разборке — меняется в карточке",
};

const holdsSlot = (s: string) => s === "rental_pool" || s === "repair" || s === "dtp";
const dayRu = (iso: string | null) => (iso ? iso.split("-").reverse().join(".") : "—");

/** Одинаковое значение у всех единиц — или null, если разное. */
function common<T>(units: ApiScooter[], pick: (u: ApiScooter) => T): { same: boolean; value: T | null } {
  if (!units.length) return { same: true, value: null };
  const first = pick(units[0]!);
  const same = units.every((u) => pick(u) === first);
  return { same, value: same ? first : null };
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

  /* ── статус ── */
  const [target, setTarget] = useState<BatchTarget | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** Единицы, у которых сервер не принял смену статуса, — с причиной. */
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

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

  /** Почему статус этой единицы здесь не меняется; null — можно. */
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

  const pickTarget = (t: BatchTarget | null) => {
    setTarget(t);
    setPicked(new Set(t ? units.filter((u) => !blockOf(u, t)).map((u) => u.id) : []));
    setSubmitError(null);
    setRowErrors({});
  };
  const eligible = target ? units.filter((u) => !blockOf(u, target)) : [];
  const moving = units.filter((u) => picked.has(u.id));

  /* ── номера аренды ── */
  const freeSlots = slotsQ.data?.free ?? [];
  const entering = target && holdsSlot(target) ? moving.filter((u) => !holdsSlot(u.baseStatus)) : [];
  const leaving = target && !holdsSlot(target) ? moving.filter((u) => u.rentalSlot != null) : [];
  const slotShort = entering.length > freeSlots.length;
  const gotSlots = freeSlots.slice(0, entering.length);

  /* ── модель под категорию ── */
  const purposeMissing = useMemo(() => {
    if (!target || (target !== "rental_pool" && target !== "for_sale")) return [];
    const ids = [...new Set(moving.map((u) => u.modelId).filter((x): x is number => x != null))];
    return models.filter(
      (m) => ids.includes(m.id) && (target === "rental_pool" ? !modelForRent(m) : !modelForSale(m)),
    );
  }, [target, moving, models]);

  /* ── цена продажи: у тех, кто после правки на витрине ── */
  const showcase = live.filter((u) =>
    picked.has(u.id) ? target === "for_sale" : u.baseStatus === "for_sale",
  );
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
  const statusChanged = !!target && moving.length > 0;

  const changes = [
    nameChanged && "номер партии",
    dateChanged && "дата закупа",
    costChanged && "закуп",
    statusChanged && `статус у ${moving.length}`,
    saleChanged && `цена продажи у ${showcase.length}`,
  ].filter(Boolean) as string[];

  const problem = !nameTrim
    ? "Впишите номер партии"
    : slotShort
      ? `Свободных арендных номеров ${freeSlots.length}, а в аренду переводим ${entering.length}`
      : purposeMissing.length && !canEditModel
        ? `Модель ${purposeMissing.map((m) => `«${m.name}»`).join(", ")} не отмечена ${target === "rental_pool" ? "для аренды" : "для продажи"} — это меняет директор`
        : target && moving.length === 0 && eligible.length > 0
          ? "Выберите единицы, у которых меняем статус"
          : null;

  const unitLine = (u: ApiScooter) =>
    `${u.rentalSlot != null ? `№${u.rentalSlot} · ` : ""}${unitHint(u)}`;

  const save = async () => {
    if (!changes.length || problem) return;
    const body: BatchEditInput = { ids: units.map((u) => u.id), batch: b.label };
    if (nameChanged) body.rename = nameTrim;
    if (dateChanged) body.purchaseDate = date || null;
    if (costChanged) body.purchasePrice = cost === "" ? null : Number(cost);
    if (saleChanged) body.salePrice = sale === "" ? null : Number(sale);
    if (statusChanged && target) {
      body.status = { to: target, ids: moving.map((u) => u.id) };
      if (purposeMissing.length) body.enableModelPurpose = true;
      setNextApprovalContext({
        summary: `Партия «${b.label}»: ${moving.length} ${plural(moving.length, ["единица", "единицы", "единиц"])} — ${TARGET_DONE[target]}`,
        details: [
          ...moving.slice(0, 6).map((u) => `${idx.get(u.id)}. ${unitLine(u)}`),
          ...(moving.length > 6 ? [`и ещё ${moving.length - 6}`] : []),
        ],
      });
    }
    setSubmitError(null);
    setRowErrors({});
    try {
      const res = await edit.mutateAsync(body);
      const label = nameChanged ? nameTrim : b.label;
      const bits = [
        nameChanged && (mergeWith ? `объединена с «${mergeWith.label}»` : `новый номер «${nameTrim}»`),
        dateChanged && `дата закупа ${dayRu(date || null)}`,
        costChanged && "закуп обновлён",
        statusChanged &&
          target &&
          `${res.statusChanged} ${plural(res.statusChanged, ["единица", "единицы", "единиц"])} ${TARGET_DONE[target]}`,
        res.slots.length > 0 && `номера ${res.slots.join(", ")}`,
        saleChanged && `цена продажи ${sale ? fmtMoney(Number(sale)) : "убрана"}`,
      ].filter(Boolean) as string[];
      toast.success(`Партия «${label}» обновлена`, bits.join(" · "));
      onClose();
    } catch (e) {
      const err = e as ApiError;
      if (err?.status === 428) {
        setSubmitError("Статус не изменён: нужен ключ директора. Остальное тоже не сохранено — нажмите «Сохранить» ещё раз.");
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
            Партия «{mergeWith.label}» уже есть ({mergeWith.units.length}{" "}
            {plural(mergeWith.units.length, ["единица", "единицы", "единиц"])}). Единицы объединятся в одну
            партию.
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
              {costC.same
                ? costC.value != null
                  ? `У всех ${units.length} — ${fmtMoney(costC.value)}. В проданных сделках закуп свой, он не меняется.`
                  : "Не указан ни у одной единицы."
                : "Сейчас у единиц разный закуп — впишите, и он станет у всех."}
            </span>
          </label>
        )}
      </section>

      {/* Статус */}
      <section className="flex flex-col gap-3" data-batch-status>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn("mr-1 font-bold text-ink", touch ? "text-[16px]" : "text-[14px]")}>Статус</h3>
          {groups.map((g) => (
            <span key={g} className={cn("rounded-full px-2.5 py-1 text-[11.5px] font-bold", GROUP_TONE[g])}>
              {GROUP_LABEL[g]} · {b.counts[g]}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-batch-targets>
          {TARGETS.map((t) => {
            const Icon = t.icon;
            const active = target === t.id;
            const can = units.filter((u) => !blockOf(u, t.id)).length;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTarget(active ? null : t.id)}
                aria-pressed={active}
                className={cn(
                  "flex min-w-0 flex-col items-start gap-1 rounded-2xl border-2 text-left transition-colors",
                  touch ? "min-h-[84px] p-3" : "p-2.5",
                  active ? "border-blue-600 bg-blue-50" : "border-border bg-white hover:border-blue-600/50",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                      active ? "bg-blue-600 text-white" : "bg-surface-soft text-ink-2",
                    )}
                  >
                    <Icon size={16} />
                  </span>
                  <span className={cn("font-extrabold", touch ? "text-[14.5px]" : "text-[13px]", active ? "text-blue-700" : "text-ink")}>
                    {t.title}
                  </span>
                </span>
                <span className="text-[11.5px] leading-snug text-muted-2">
                  {can ? `можно ${can} из ${units.length}` : "некого перевести"}
                </span>
              </button>
            );
          })}
        </div>
        {!target && (
          <p className="text-[12px] text-muted-2">
            Выберите, куда перевести технику, — ниже отметите, какие единицы. Смена статуса — по ключу директора,
            один раз на всю партию.
          </p>
        )}

        {target && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-ink-2">
                Переводим {moving.length} из {eligible.length}
                {eligible.length < units.length && (
                  <span className="font-normal text-muted-2"> · остальные остаются как есть</span>
                )}
              </span>
              {eligible.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setPicked(new Set(moving.length === eligible.length ? [] : eligible.map((u) => u.id)))
                  }
                  className={cn(
                    "shrink-0 rounded-full px-3 font-semibold text-blue-700 hover:bg-blue-50",
                    touch ? "h-10 text-[13.5px]" : "h-8 text-[12.5px]",
                  )}
                >
                  {moving.length === eligible.length ? "Снять все" : "Выбрать все"}
                </button>
              )}
            </div>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-white" data-batch-units>
              {units.map((u) => {
                const blk = blockOf(u, target);
                const on = picked.has(u.id);
                const err = rowErrors[u.id];
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={!!blk}
                      onClick={() =>
                        setPicked((s) => {
                          const n = new Set(s);
                          if (n.has(u.id)) n.delete(u.id);
                          else n.add(u.id);
                          return n;
                        })
                      }
                      className={cn(
                        "flex w-full items-center gap-3 px-3 text-left",
                        touch ? "min-h-[60px] py-2" : "min-h-12 py-1.5",
                        blk ? "cursor-default bg-surface-soft/50" : "hover:bg-surface-soft",
                        err && "bg-red-50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                          blk
                            ? "border-border bg-surface-soft"
                            : on
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-border-strong bg-white",
                        )}
                      >
                        {on && !blk && <Check size={14} strokeWidth={3} />}
                      </span>
                      <span className="w-5 shrink-0 text-right text-[12px] font-bold tabular-nums text-muted-2">
                        {idx.get(u.id)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("flex items-center gap-2 font-bold", touch ? "text-[14.5px]" : "text-[13.5px]", blk ? "text-muted" : "text-ink")}>
                          <ScooterName name={u.name} number={u.rentalSlot} size="sm" />
                        </span>
                        <span className="block truncate text-[11.5px] text-muted">{unitHint(u)}</span>
                        {(blk && !blk.same) || err ? (
                          <span className={cn("block text-[11.5px] font-semibold", err ? "text-red-700" : "text-muted-2")}>
                            {err ?? blk!.text}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", GROUP_TONE[groupOf(u)])}>
                          {UNIT_STATUS_LABEL[u.baseStatus] ?? u.baseStatus}
                        </span>
                        {on && !blk && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-blue-700">
                            <ArrowRight size={12} /> {TARGETS.find((x) => x.id === target)!.title}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {entering.length > 0 &&
              (slotShort ? (
                <Note tone="red" icon={<AlertTriangle size={14} />}>
                  Свободных арендных номеров {freeSlots.length}, а в аренду переводим {entering.length}. Выберите меньше
                  единиц или увеличьте количество номеров на странице «Скутеры».
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
                Модель {purposeMissing.map((m) => `«${m.name}»`).join(", ")} пока не отмечена{" "}
                {target === "rental_pool" ? "«Сдаём в аренду»" : "«Продаём»"} — при сохранении отметим.
              </Note>
            )}
          </div>
        )}
      </section>

      {/* Цена продажи */}
      {showcase.length > 0 && (
        <section className="flex flex-col gap-2" data-batch-sale>
          <h3 className={cn("font-bold text-ink", touch ? "text-[16px]" : "text-[14px]")}>Цена продажи</h3>
          <label className={cn("min-w-0", !touch && "sm:max-w-[260px]")}>
            <span className={labelCls}>
              Для {showcase.length} на витрине, ₽
            </span>
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
            {!saleC.same
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
  const sub = `${units.length} ${plural(units.length, ["единица", "единицы", "единиц"])} · ${b.models
    .map((m) => m.name)
    .join(", ")}`;

  if (touch) {
    return (
      <div className="fixed inset-0 z-[130] flex flex-col bg-surface animate-modal-in lg:items-center lg:bg-ink/45 lg:backdrop-blur-sm" data-batch-edit>
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
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">{body}</div>
          <div className="border-t border-border bg-white px-4 pt-2.5" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
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
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/55 p-6 backdrop-blur-sm animate-backdrop-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-batch-edit
    >
      <div className="flex max-h-[92vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg animate-modal-in">
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
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{body}</div>
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
