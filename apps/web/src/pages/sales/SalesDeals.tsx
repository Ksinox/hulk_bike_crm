import { useMemo, useState } from "react";
import { FileText, Handshake, Paperclip, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSaleDeals, type SaleDeal } from "@/lib/api/sales";
import { EmptyState, ManagerAvatar, PeriodPicker, SectionCard } from "./SalesUI";
import {
  fmt,
  inRange,
  presetRange,
  ruDateShort,
  STATUS_CLASS,
  STATUS_LABEL,
  type PeriodPreset,
  type Range,
} from "./salesUtils";

/**
 * «Сделки» — детализация продаж за период (31.08).
 *
 * Здесь же живёт поиск по номеру VIN и номеру двигателя: заказчик ищет
 * конкретную машину, а не сделку — поэтому ищем сразу по всем снимкам
 * техники, клиенту, менеджеру и номеру сделки.
 */

type StatusFilter = "all" | "signed" | "inwork" | "cancelled";

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "signed", label: "Продано" },
  { id: "inwork", label: "В работе" },
  { id: "cancelled", label: "Отменённые" },
];

export function SalesDeals({
  onOpenDeal,
  onNewDeal,
}: {
  onOpenDeal: (id: number) => void;
  onNewDeal: () => void;
}) {
  const { data, isLoading } = useSaleDeals();
  const deals = data?.items ?? [];

  const [preset, setPreset] = useState<PeriodPreset>("year");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");

  const range: Range = useMemo(() => {
    if (preset === "custom" && custom.from && custom.to) {
      return {
        from: new Date(`${custom.from}T00:00:00`),
        to: new Date(`${custom.to}T23:59:59`),
        label: `${custom.from} — ${custom.to}`,
      };
    }
    return presetRange(preset === "custom" ? "year" : preset);
  }, [preset, custom]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return deals.filter((d) => {
      // Незавершённые сделки показываем всегда — иначе черновик, начатый в
      // прошлом месяце, пропадёт из списка и его невозможно будет закрыть.
      const dateOk =
        d.status === "signed" || d.status === "cancelled"
          ? inRange(d.soldAt ?? d.updatedAt, range)
          : true;
      if (!dateOk) return false;
      if (status === "signed" && d.status !== "signed") return false;
      if (status === "cancelled" && d.status !== "cancelled") return false;
      if (status === "inwork" && d.status !== "draft" && d.status !== "contract") {
        return false;
      }
      if (!needle) return true;
      const hay = [
        String(d.id),
        d.vin,
        d.engineNo,
        d.frameNumber,
        d.scooterName,
        d.modelName,
        d.purchaseBatch,
        d.clientName,
        d.clientPhone,
        d.managerName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [deals, range, status, q]);

  const sum = useMemo(() => {
    const signed = filtered.filter((d) => d.status === "signed");
    return {
      units: signed.length,
      revenue: signed.reduce((s, d) => s + d.price, 0),
      profit: signed.reduce((s, d) => s + (d.price - (d.purchasePrice ?? 0)), 0),
    };
  }, [filtered]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker
          preset={preset}
          custom={custom}
          onChange={(p, c) => {
            setPreset(p);
            setCustom(c);
          }}
        />
        <div className="flex gap-1 rounded-full bg-surface p-1 shadow-card-sm">
          {STATUS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setStatus(t.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                status === t.id ? "bg-ink text-white" : "text-muted hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по VIN, номеру двигателя, клиенту…"
            className="h-9 w-full rounded-full border border-border bg-surface pl-9 pr-8 text-[13px] outline-none focus:border-emerald-500"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-2 hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <SectionCard
        title="Сделки"
        hint={
          <>
            {range.label} · найдено {filtered.length} · продано {sum.units} ед. на{" "}
            <b className="text-ink-2">{fmt(sum.revenue)} ₽</b> · прибыль{" "}
            <b className="text-emerald-700">{fmt(sum.profit)} ₽</b>
          </>
        }
      >
        {isLoading ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted">Загружаем…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Handshake size={22} />}
            title={q ? "Ничего не нашли" : "Сделок за период нет"}
            text={
              q
                ? "Проверьте номер VIN или двигателя — поиск ищет по всем данным сделки."
                : "Продажа оформляется по шагам: клиент → техника → цена → менеджер → договор → подпись."
            }
            action={
              !q && (
                <button
                  type="button"
                  onClick={onNewDeal}
                  className="mt-1 rounded-full bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white"
                >
                  Новая сделка
                </button>
              )
            }
          />
        ) : (
          <>
            {/* Телефон: карточки — таблица на 8 колонок под палец не годится. */}
            <div className="flex flex-col md:hidden">
              {filtered.map((d) => (
                <DealCard key={d.id} deal={d} onOpen={() => onOpenDeal(d.id)} />
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[880px] text-[12.5px]">
              <thead>
                <tr className="border-b border-border/60 text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
                  <th className="px-4 py-2 text-left font-bold">Сделка</th>
                  <th className="px-2 py-2 text-left font-bold">Техника</th>
                  <th className="px-2 py-2 text-left font-bold">Клиент</th>
                  <th className="px-2 py-2 text-left font-bold">Менеджер</th>
                  <th className="px-2 py-2 text-right font-bold">Закуп</th>
                  <th className="px-2 py-2 text-right font-bold">Продажа</th>
                  <th className="px-2 py-2 text-right font-bold">Прибыль</th>
                  <th className="px-4 py-2 text-right font-bold">Статус</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <DealRow key={d.id} deal={d} onOpen={() => onOpenDeal(d.id)} />
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

/** Карточка сделки для телефона: то же содержимое, но в две строки. */
function DealCard({ deal, onOpen }: { deal: SaleDeal; onOpen: () => void }) {
  const profit = deal.price - (deal.purchasePrice ?? 0);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-1.5 border-b border-border/60 px-4 py-3 text-left last:border-b-0 active:bg-surface-soft/60"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-bold text-muted-2">
          #{String(deal.id).padStart(4, "0")}
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">
          {deal.modelName || deal.scooterName || "Техника"}
        </span>
        <span className="shrink-0 text-[14px] font-bold tabular-nums text-ink">
          {fmt(deal.price)} ₽
        </span>
      </div>
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <span className="min-w-0 flex-1 truncate">
          {deal.clientName ?? "клиент не указан"}
          {deal.vin && ` · VIN ${deal.vin}`}
        </span>
        {deal.purchasePrice != null && (
          <span
            className={cn(
              "shrink-0 tabular-nums",
              profit >= 0 ? "text-emerald-700" : "text-red-ink",
            )}
          >
            {profit >= 0 ? "+" : ""}
            {fmt(profit)} ₽
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-bold",
            STATUS_CLASS[deal.status],
          )}
        >
          {STATUS_LABEL[deal.status]}
        </span>
        <span className="text-[11px] text-muted-2">
          {ruDateShort(deal.soldAt ?? deal.createdAt)}
        </span>
        {deal.managerName && (
          <span className="ml-auto flex items-center gap-1.5">
            <ManagerAvatar name={deal.managerName} color={deal.managerColor} size={20} />
            <span className="max-w-[90px] truncate text-[11.5px] text-muted">
              {deal.managerName}
            </span>
          </span>
        )}
        {deal.status === "signed" && deal.documents.length === 0 && (
          <span className="ml-auto text-[11px] font-semibold text-orange-ink">
            без скана
          </span>
        )}
      </div>
    </button>
  );
}

function DealRow({ deal, onOpen }: { deal: SaleDeal; onOpen: () => void }) {
  const profit = deal.price - (deal.purchasePrice ?? 0);
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-surface-soft/60"
    >
      <td className="px-4 py-2.5">
        <div className="font-bold text-ink">#{String(deal.id).padStart(4, "0")}</div>
        <div className="text-[11px] text-muted-2">
          {ruDateShort(deal.soldAt ?? deal.createdAt)}
        </div>
      </td>
      <td className="px-2 py-2.5">
        <div className="font-semibold text-ink">
          {deal.modelName || deal.scooterName || "—"}
        </div>
        <div className="text-[11px] text-muted-2">
          {deal.vin ? `VIN ${deal.vin}` : "VIN —"}
          {deal.engineNo && ` · двиг. ${deal.engineNo}`}
          {deal.purchaseBatch && ` · ${deal.purchaseBatch}`}
        </div>
      </td>
      <td className="px-2 py-2.5">
        <div className="max-w-[160px] truncate text-ink">{deal.clientName ?? "—"}</div>
        <div className="text-[11px] text-muted-2">{deal.clientPhone ?? ""}</div>
      </td>
      <td className="px-2 py-2.5">
        {deal.managerName ? (
          <span className="flex items-center gap-1.5">
            <ManagerAvatar name={deal.managerName} color={deal.managerColor} size={22} />
            <span className="max-w-[110px] truncate">{deal.managerName}</span>
          </span>
        ) : (
          <span className="text-muted-2">—</span>
        )}
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-muted">
        {deal.purchasePrice != null ? `${fmt(deal.purchasePrice)} ₽` : "—"}
      </td>
      <td className="px-2 py-2.5 text-right font-bold tabular-nums text-ink">
        {fmt(deal.price)} ₽
      </td>
      <td
        className={cn(
          "px-2 py-2.5 text-right tabular-nums",
          profit >= 0 ? "text-emerald-700" : "text-red-ink",
        )}
      >
        {deal.purchasePrice != null ? `${profit >= 0 ? "+" : ""}${fmt(profit)} ₽` : "—"}
      </td>
      <td className="px-4 py-2.5 text-right">
        <span className="inline-flex items-center gap-1.5">
          {deal.documents.length > 0 && (
            <span title="Копия договора приложена" className="text-emerald-600">
              <Paperclip size={13} />
            </span>
          )}
          {deal.status === "signed" && deal.documents.length === 0 && (
            <span title="Копия договора не приложена" className="text-orange-ink">
              <FileText size={13} />
            </span>
          )}
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-bold",
              STATUS_CLASS[deal.status],
            )}
          >
            {STATUS_LABEL[deal.status]}
          </span>
        </span>
      </td>
    </tr>
  );
}
