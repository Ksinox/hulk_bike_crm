import { useMemo, useState } from "react";
import { ChevronDown, Layers, Pencil, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCan } from "@/lib/permissions";
import { useRole } from "@/lib/role";
import { useApiScootersWithArchive } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { dealProfit, useSaleDeals, type SaleDeal } from "@/lib/api/sales";
import type { ApiScooter } from "@/lib/api/types";
import { ScooterName, scooterModelName } from "@/components/ScooterName";
import { suggestKey } from "@/components/SuggestInput";
import { fmtMoney, plural } from "./addScooterDraft";
import { GROUP_LABEL, GROUP_TONE, groupOf, unitHint, type Group } from "./batchGroups";
import { BatchEditSheet } from "./BatchEditSheet";
import { AddScooterModal } from "./AddScooterModal";

/**
 * «Партии» (2.0.1) — как отбилась поставка: сколько единиц на витрине,
 * продано, в аренде, в выкупе; на сколько продали и что осталось.
 * Закуп и прибыль — только директору (как в мастере добавления).
 * Прибыль считается как в «Продажах»: цена сделки − закуп из сделки.
 */

export { groupOf };

export type BatchSummary = {
  key: string;
  label: string;
  units: ApiScooter[];
  models: { name: string; n: number }[];
  purchaseDate: string | null;
  lastAdded: string;
  counts: Record<Group, number>;
  soldDeals: SaleDeal[];
  soldRevenue: number;
  soldProfit: number;
  /** Сделок без закупа — прибыль по ним не посчитать честно. */
  soldNoCost: number;
  showcaseValue: number;
  showcaseNoPrice: number;
  purchaseTotal: number;
  purchaseMissing: number;
};

export function buildBatches(
  scooters: ApiScooter[],
  deals: SaleDeal[],
  modelName: (s: ApiScooter) => string,
): BatchSummary[] {
  const byKey = new Map<string, ApiScooter[]>();
  for (const s of scooters) {
    if (s.deletedAt) continue;
    const b = s.purchaseBatch?.trim();
    if (!b) continue;
    const k = suggestKey(b);
    byKey.set(k, [...(byKey.get(k) ?? []), s]);
  }
  const out: BatchSummary[] = [];
  for (const [key, units] of byKey) {
    const spell = new Map<string, number>();
    for (const u of units) spell.set(u.purchaseBatch!.trim(), (spell.get(u.purchaseBatch!.trim()) ?? 0) + 1);
    const label = [...spell.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const models = new Map<string, number>();
    for (const u of units) models.set(modelName(u), (models.get(modelName(u)) ?? 0) + 1);
    const counts: Record<Group, number> = { sale: 0, sold: 0, rent: 0, buyout: 0, other: 0, archive: 0 };
    for (const u of units) counts[groupOf(u)] += 1;
    const ids = new Set(units.map((u) => u.id));
    // Продажи: подписанные сделки по технике партии — по самой технике или
    // по снимку партии в сделке (если карточку потом правили).
    const soldDeals = deals.filter(
      (d) =>
        d.status === "signed" &&
        ((d.scooterId != null && ids.has(d.scooterId)) ||
          (!!d.purchaseBatch && suggestKey(d.purchaseBatch) === key)),
    );
    const showcase = units.filter((u) => groupOf(u) === "sale");
    const dates = units.map((u) => u.purchaseDate).filter((x): x is string => !!x).sort();
    out.push({
      key,
      label,
      units: [...units].sort((a, b) => a.id - b.id),
      models: [...models.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
      purchaseDate: dates[0] ?? null,
      lastAdded: units.map((u) => u.createdAt).sort().slice(-1)[0] ?? "",
      counts,
      soldDeals,
      soldRevenue: soldDeals.reduce((s, d) => s + d.price, 0),
      soldProfit: soldDeals.reduce((s, d) => s + dealProfit(d), 0),
      soldNoCost: soldDeals.filter((d) => d.purchasePrice == null).length,
      showcaseValue: showcase.reduce((s, u) => s + (u.salePrice ?? 0), 0),
      showcaseNoPrice: showcase.filter((u) => !u.salePrice).length,
      purchaseTotal: units.reduce((s, u) => s + (u.purchasePrice ?? 0), 0),
      purchaseMissing: units.filter((u) => u.purchasePrice == null).length,
    });
  }
  return out.sort((a, b) => b.lastAdded.localeCompare(a.lastAdded));
}

export function BatchesPanel({
  touch = false,
  onOpenScooter,
}: {
  touch?: boolean;
  /** Открыть карточку единицы (архивную не открываем). */
  onOpenScooter?: (s: ApiScooter) => void;
}) {
  const role = useRole();
  const canProfit = useCan("data.profit");
  const showCost = role === "director" && canProfit;
  const { data: scooters = [], isLoading } = useApiScootersWithArchive();
  const { data: models = [] } = useApiScooterModels();
  const dealsQ = useSaleDeals();
  const deals = dealsQ.data?.items ?? [];
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  /** Партия в окне правки (2.0.3) — по ключу, чтобы окно видело свежие данные. */
  const [editKey, setEditKey] = useState<string | null>(null);
  /** Правки 7.0 (п.15): «+ Модель» — в какую партию добавляем. */
  const [addTo, setAddTo] = useState<BatchSummary | null>(null);

  const modelName = (s: ApiScooter) =>
    models.find((m) => m.id === s.modelId)?.name ?? scooterModelName(s.name);

  const batches = useMemo(
    () => buildBatches(scooters, deals, modelName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scooters, deals, models],
  );
  const list = useMemo(() => {
    const k = suggestKey(q);
    if (!k) return batches;
    return batches.filter(
      (b) =>
        b.key.includes(k) ||
        b.models.some((m) => suggestKey(m.name).includes(k)) ||
        b.units.some((u) => (u.vin ?? "").toLowerCase().includes(k)),
    );
  }, [batches, q]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-[360px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Партия, модель или рама…"
            className={cn(
              "w-full rounded-full border border-border bg-surface pl-9 pr-8 text-ink outline-none focus:border-blue-600",
              touch ? "h-11 text-[15px]" : "h-9 text-[13px]",
            )}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Очистить"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-2 hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="text-[12.5px] text-muted">
          {isLoading
            ? "Загружаем…"
            : `${batches.length} ${plural(batches.length, ["партия", "партии", "партий"])} · номер, дату, закуп и статус меняют кнопкой «Изменить»`}
        </div>
      </div>

      {!isLoading && list.length === 0 && (
        <div className="rounded-2xl bg-surface px-5 py-10 text-center shadow-card-sm">
          <Layers size={26} className="mx-auto mb-2 text-muted-2" />
          <div className="text-[14px] font-bold text-ink">
            {q ? "Ничего не нашли" : "Партий пока нет"}
          </div>
          <div className="mx-auto mt-1 max-w-[420px] text-[12.5px] text-muted">
            {q
              ? "Ищем по номеру партии, модели и раме."
              : "Укажите «Номер партии», когда добавляете технику, — здесь появится сводка: сколько продано, сколько на витрине и на какую сумму."}
          </div>
        </div>
      )}

      <div className={cn("grid gap-3", !touch && "xl:grid-cols-2")}>
        {list.map((b) => (
          <BatchCard
            key={b.key}
            b={b}
            touch={touch}
            showCost={showCost}
            open={open === b.key}
            onToggle={() => setOpen((k) => (k === b.key ? null : b.key))}
            onOpenScooter={onOpenScooter}
            onEdit={() => setEditKey(b.key)}
            onAddModel={() => setAddTo(b)}
          />
        ))}
      </div>

      {/* Правки 7.0 (п.15): ещё модель в ту же партию — со своим закупом. */}
      {addTo && (
        <AddScooterModal
          presetBatch={{ batch: addTo.label, purchaseDate: addTo.purchaseDate }}
          onClose={() => setAddTo(null)}
        />
      )}

      {editKey && batches.find((x) => x.key === editKey) && (
        <BatchEditSheet
          key={editKey}
          batch={batches.find((x) => x.key === editKey)!}
          batches={batches}
          touch={touch}
          onClose={() => setEditKey(null)}
        />
      )}
    </div>
  );
}

function BatchCard({
  b,
  touch,
  showCost,
  open,
  onToggle,
  onOpenScooter,
  onEdit,
  onAddModel,
}: {
  b: BatchSummary;
  touch: boolean;
  showCost: boolean;
  open: boolean;
  onToggle: () => void;
  onOpenScooter?: (s: ApiScooter) => void;
  onEdit: () => void;
  onAddModel: () => void;
}) {
  const total = b.units.length;
  const soldPct = total ? Math.round((b.counts.sold / total) * 100) : 0;
  const dateRu = b.purchaseDate ? b.purchaseDate.split("-").reverse().join(".") : null;
  const dealBy = new Map(b.soldDeals.filter((d) => d.scooterId != null).map((d) => [d.scooterId!, d]));
  const groups = (Object.keys(GROUP_LABEL) as Group[]).filter((g) => b.counts[g] > 0);

  return (
    <section className="flex min-w-0 flex-col rounded-2xl bg-surface p-4 shadow-card-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <Layers size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[16px] font-extrabold text-ink">{b.label}</h3>
          <div className="truncate text-[12.5px] text-muted">
            {b.models.map((m) => `${m.n} × ${m.name}`).join(" · ")}
            {dateRu && ` · куплена ${dateRu}`}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-[20px] font-extrabold tabular-nums text-ink">{total}</div>
          <div className="text-[11px] text-muted-2">{plural(total, ["единица", "единицы", "единиц"])}</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11.5px] text-muted">
          <span>
            Продано {b.counts.sold} из {total}
          </span>
          <span className="tabular-nums">{soldPct}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-soft">
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${soldPct}%` }} />
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {groups.map((g) => (
          <span key={g} className={cn("rounded-full px-2.5 py-1 text-[11.5px] font-bold", GROUP_TONE[g])}>
            {GROUP_LABEL[g]} · {b.counts[g]}
          </span>
        ))}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        <Money
          label="Продано на"
          value={b.counts.sold || b.soldRevenue ? fmtMoney(b.soldRevenue) : "—"}
          hint={
            b.counts.sold > b.soldDeals.length
              ? `без сделки в CRM: ${b.counts.sold - b.soldDeals.length}`
              : b.soldDeals.length
                ? `${b.soldDeals.length} ${plural(b.soldDeals.length, ["сделка", "сделки", "сделок"])}`
                : "продаж ещё не было"
          }
        />
        <Money
          label="На витрине на"
          value={b.counts.sale ? fmtMoney(b.showcaseValue) : "—"}
          hint={b.showcaseNoPrice ? `без цены: ${b.showcaseNoPrice}` : b.counts.sale ? "по ценам из карточек" : "на витрине пусто"}
        />
        {showCost && (
          <>
            <Money
              label="Закуп партии"
              value={b.purchaseTotal ? fmtMoney(b.purchaseTotal) : "—"}
              hint={b.purchaseMissing ? `не указан у ${b.purchaseMissing}` : "у всех указан"}
            />
            <Money
              label="Прибыль по проданным"
              value={b.soldDeals.length ? fmtMoney(b.soldProfit) : "—"}
              tone={b.soldProfit < 0 ? "red" : b.soldDeals.length ? "green" : undefined}
              hint={b.soldNoCost ? `у ${b.soldNoCost} сделок закуп не указан` : "продажа − закуп"}
            />
          </>
        )}
      </dl>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-1 font-semibold text-blue-700 hover:text-blue-800",
            touch ? "h-11 text-[14px]" : "h-8 text-[12.5px]",
          )}
        >
          <ChevronDown size={15} className={cn("transition-transform", open && "rotate-180")} />
          {open ? "Скрыть единицы" : `Единицы · ${total}`}
        </button>
        <button
          type="button"
          onClick={onAddModel}
          data-batch-add-model
          title="Добавить в партию технику другой модели — со своим закупом"
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-white font-semibold text-ink-2 hover:border-blue-600/50 hover:text-blue-700",
            touch ? "h-11 px-4 text-[14px]" : "h-8 px-3 text-[12.5px]",
          )}
        >
          <Plus size={touch ? 15 : 13} /> Модель
        </button>
        <button
          type="button"
          onClick={onEdit}
          data-batch-edit-open
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border bg-white font-semibold text-ink-2 hover:border-blue-600/50 hover:text-blue-700",
            touch ? "h-11 px-4 text-[14px]" : "h-8 px-3 text-[12.5px]",
          )}
        >
          <Pencil size={touch ? 15 : 13} /> Изменить
        </button>
      </div>

      {open && (
        <ul className="mt-1 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {b.units.map((u) => {
            const g = groupOf(u);
            const deal = dealBy.get(u.id);
            const price = deal ? deal.price : u.salePrice;
            const clickable = !!onOpenScooter && !u.archivedAt;
            return (
              <li key={u.id}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => onOpenScooter?.(u)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 text-left",
                    touch ? "min-h-14 py-2" : "min-h-11 py-1.5",
                    clickable ? "hover:bg-surface-soft" : "cursor-default",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] font-bold text-ink">
                      <ScooterName name={u.name} number={u.rentalSlot} size="sm" />
                      {touch && (
                        <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", GROUP_TONE[g])}>
                          {g === "sold" && deal ? "Продан" : GROUP_LABEL[g]}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11.5px] text-muted">{unitHint(u)}</span>
                  </span>
                  {!touch && (
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold", GROUP_TONE[g])}>
                      {g === "sold" && deal ? "Продан" : GROUP_LABEL[g]}
                    </span>
                  )}
                  <span
                    className={cn(
                      "shrink-0 whitespace-nowrap text-right text-[12.5px] tabular-nums",
                      touch ? "w-auto" : "w-[116px]",
                    )}
                  >
                    {price != null ? (
                      <span className="font-semibold text-ink">{fmtMoney(price)}</span>
                    ) : (
                      <span className="text-muted-2">—</span>
                    )}
                    {showCost && deal && (
                      <span className={cn("block text-[10.5px]", dealProfit(deal) < 0 ? "text-red-600" : "text-green-ink")}>
                        прибыль {fmtMoney(dealProfit(deal))}
                      </span>
                    )}
                    {showCost && !deal && u.purchasePrice != null && (
                      <span className="block text-[10.5px] text-muted-2">закуп {fmtMoney(u.purchasePrice)}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Money({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-soft/70 px-3 py-2">
      <dt className="text-[11px] font-semibold text-muted-2">{label}</dt>
      <dd
        className={cn(
          "truncate font-display text-[16px] font-extrabold tabular-nums",
          tone === "green" ? "text-green-ink" : tone === "red" ? "text-red-600" : "text-ink",
        )}
      >
        {value}
      </dd>
      {hint && <div className="truncate text-[10.5px] text-muted-2">{hint}</div>}
    </div>
  );
}
