import { useMemo, useState } from "react";
import { Bike } from "lucide-react";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiClients } from "@/lib/api/clients";
import { useRentals } from "@/pages/rentals/rentalsStore";
import { useApiInvestors } from "@/lib/api/investors";
import { RentalCard } from "@/pages/rentals/RentalCard";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { ScooterName } from "@/components/ScooterName";
import { ElectricMark } from "@/components/PowerTypeBadge";
import { cn } from "@/lib/utils";

/**
 * Правки 2.0, п.9 и 12 + правка 27.08: аренды ПАРТНЁРСКОЙ техники —
 * самостоятельный блок внутри «Партнёрки», «отдельное государство».
 *
 * Механика та же, что на странице «Аренды»: список + боковой дровер с ТОЙ ЖЕ
 * карточкой аренды (RentalCard, все операции внутри — оплата, продление,
 * замена, завершение, история). Но открывается всё ЗДЕСЬ, внутри партнёрки —
 * наружу, в общие «Аренды», клик не выкидывает: там партнёрских аренд нет
 * вовсе, они изолированы.
 *
 * Отличие от общего списка — колонка «Техника · инвестор»: видно, чья
 * единица катается в аренде.
 */

const fmt = (n: number) => n.toLocaleString("ru-RU");

/** DD.MM.YYYY → сравнимый ключ. */
function ymdFromRu(ru: string): string {
  const m = ru.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

export function PartnerRentals() {
  const rentals = useRentals();
  const { data: scooters = [] } = useApiScooters();
  const { data: clients = [] } = useApiClients();
  const { data: investorsData } = useApiInvestors();
  const investors = investorsData?.items ?? [];

  /** Открытая в дровере аренда (внутри партнёрки, как в «Арендах»). */
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const rows = useMemo(() => {
    const partnerByName = new Map<
      string,
      { investorId: number | null; rentalSlot?: number; exRentalSlot?: number; uid?: string }
    >();
    for (const s of scooters) {
      if (!s.isPartner) continue;
      partnerByName.set(s.name, {
        investorId: s.investorId ?? null,
        rentalSlot: s.rentalSlot ?? undefined,
        exRentalSlot: s.exRentalSlot ?? undefined,
        uid: s.uid ?? undefined,
      });
    }
    const invById = new Map(investors.map((i) => [i.id, i.name]));
    const todayKey = new Date().toISOString().slice(0, 10);
    return rentals
      .filter((r) => partnerByName.has(r.scooter))
      .map((r) => {
        const meta = partnerByName.get(r.scooter)!;
        const client = clients.find((c) => c.id === r.clientId);
        const endKey = ymdFromRu(r.endPlanned);
        return {
          rental: r,
          meta,
          clientName: client?.name ?? "—",
          investorName: meta.investorId ? invById.get(meta.investorId) : null,
          overdue: r.status === "active" && !!endKey && endKey < todayKey,
        };
      })
      .sort((a, b) => b.rental.id - a.rental.id);
  }, [rentals, scooters, clients, investors]);

  const active = rows.filter(
    (r) => r.rental.status === "active" || r.rental.status === "returning",
  );

  const selected = selectedId != null
    ? rows.find((r) => r.rental.id === selectedId)?.rental ?? null
    : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-start gap-4">
      {/* Левая часть: метрики + список. При открытой карточке сужается. */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div
          className={cn(
            "grid gap-3",
            selected ? "sm:grid-cols-3 xl:grid-cols-3" : "sm:grid-cols-3",
          )}
        >
          <Tile label="Всего аренд" value={String(rows.length)} hint="за всё время" />
          <Tile label="Активных" value={String(active.length)} hint="идут сейчас" />
          <Tile
            label="Просрочек"
            value={String(rows.filter((r) => r.overdue).length)}
            hint="требуют звонка"
            danger
          />
        </div>

        <div className="overflow-hidden rounded-2xl bg-surface shadow-card-sm">
          <div className="border-b border-border px-4 py-3 text-[13px] font-bold text-ink">
            Аренды партнёрской техники
          </div>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
                <Bike size={22} />
              </div>
              <div className="text-[15px] font-bold text-ink">
                Аренд партнёрской техники пока нет
              </div>
              <div className="max-w-[440px] text-[13px] leading-relaxed text-muted">
                Оформляются они как обычные — через «Новую сделку». Как только
                партнёрская единица уедет к клиенту, аренда появится здесь, а в
                общий дашборд попадёт только долг по ней (с пометкой, что это
                электричка).
              </div>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "hidden gap-3 border-b border-border/60 px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-2 lg:grid",
                  selected
                    ? "grid-cols-[auto_1.2fr_1.4fr_auto]"
                    : "grid-cols-[auto_1.4fr_1.4fr_1fr_1fr]",
                )}
              >
                <span>№</span>
                <span>Клиент</span>
                <span>Техника · инвестор</span>
                <span className={selected ? "text-right" : ""}>Возврат</span>
                {!selected && <span className="text-right">Сумма</span>}
              </div>
              {rows.map(({ rental, meta, clientName, investorName, overdue }) => (
                <button
                  key={rental.id}
                  type="button"
                  onClick={() =>
                    setSelectedId(selectedId === rental.id ? null : rental.id)
                  }
                  className={cn(
                    "grid w-full grid-cols-2 gap-x-3 gap-y-1 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 lg:items-center",
                    selected
                      ? "lg:grid-cols-[auto_1.2fr_1.4fr_auto]"
                      : "lg:grid-cols-[auto_1.4fr_1.4fr_1fr_1fr]",
                    selectedId === rental.id
                      ? "bg-blue-50/70"
                      : "hover:bg-surface-soft/50",
                  )}
                >
                  <span className="font-mono text-[12px] tabular-nums text-muted-2">
                    #{String(rental.id).padStart(4, "0")}
                  </span>
                  <span className="truncate text-[13.5px] font-bold text-ink">
                    {clientName}
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <ElectricMark size="sm" />
                    <ScooterName
                      name={rental.scooter}
                      number={meta.rentalSlot}
                      exNumber={meta.exRentalSlot}
                      size="sm"
                      className="text-[13px] font-semibold text-ink"
                    />
                    {investorName && (
                      <span className="truncate rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                        {investorName}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-[13px] tabular-nums",
                      selected && "lg:text-right",
                      overdue ? "font-bold text-red-ink" : "text-ink-2",
                    )}
                  >
                    {rental.endPlanned}
                    {overdue && (
                      <span className="ml-1 text-[10.5px] font-bold uppercase">
                        просрочка
                      </span>
                    )}
                  </span>
                  {!selected && (
                    <span className="text-[13px] font-bold tabular-nums text-ink lg:text-right">
                      {fmt(rental.sum ?? 0)} ₽
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Боковой дровер: ТА ЖЕ карточка аренды, что в «Арендах» (drawerChrome).
          Оплату/завершение/историю карточка ведёт сама (внутренние overlay).
          Sticky + своя высота → скроллится независимо от списка. */}
      {selected && (
        <div className="sticky top-4 hidden h-[calc(100dvh-32px)] w-[560px] shrink-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-card lg:flex">
          <ErrorBoundary key={selected.id}>
            <RentalCard
              rental={selected}
              drawerChrome
              onClose={() => setSelectedId(null)}
              onSwapped={(newId) => setSelectedId(newId)}
            />
          </ErrorBoundary>
        </div>
      )}

      {/* Мобила: та же карточка, но полноэкранно (как в мобильных «Арендах»). */}
      {selected && (
        <div className="fixed inset-0 z-[55] flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-surface animate-slide-in-right lg:hidden">
          <ErrorBoundary key={`m-${selected.id}`}>
            <RentalCard
              rental={selected}
              drawerChrome
              onClose={() => setSelectedId(null)}
              onSwapped={(newId) => setSelectedId(newId)}
            />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-surface px-4 py-3 shadow-card-sm">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-[24px] font-extrabold leading-none tabular-nums",
          danger && value !== "0" ? "text-red-ink" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[11.5px] text-muted-2">{hint}</div>
    </div>
  );
}
