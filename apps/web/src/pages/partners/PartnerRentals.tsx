import { useMemo, useState } from "react";
import { Bike } from "lucide-react";
import { useApiScooters } from "@/lib/api/scooters";
import { useRentals } from "@/pages/rentals/rentalsStore";
import { useApiInvestors } from "@/lib/api/investors";
import { RentalCard } from "@/pages/rentals/RentalCard";
import { RentalsList } from "@/pages/rentals/RentalsList";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { cn } from "@/lib/utils";

/**
 * Правки 2.0, п.9 и 12 + правки 27-28.08: аренды ПАРТНЁРСКОЙ техники —
 * самостоятельный блок внутри «Партнёрки», «отдельное государство».
 *
 * Список — ТОТ ЖЕ компонент, что на странице «Аренды» (RentalsList): те же
 * колонки (№, клиент, связь, техника, выдан, возврат, дней, сумма, долг,
 * статус), плюс бейдж инвестора у техники. Клик — боковой дровер с той же
 * карточкой аренды (все операции внутри). Наружу, в общие «Аренды», клик не
 * выкидывает: партнёрские аренды изолированы.
 */

export function PartnerRentals() {
  const rentals = useRentals();
  const { data: scooters = [] } = useApiScooters();
  const { data: investorsData } = useApiInvestors();
  const investors = investorsData?.items ?? [];

  /** Открытая в дровере аренда (внутри партнёрки, как в «Арендах»). */
  const [selectedId, setSelectedId] = useState<number | null>(null);

  /** Партнёрская техника: имя → инвестор. */
  const partnerMeta = useMemo(() => {
    const invById = new Map(investors.map((i) => [i.id, i.name]));
    const byName = new Map<string, string | null>();
    for (const s of scooters) {
      if (!s.isPartner) continue;
      byName.set(
        s.name,
        s.investorId != null ? (invById.get(s.investorId) ?? null) : null,
      );
    }
    return byName;
  }, [scooters, investors]);

  /** DD.MM.YYYY → сравнимый ключ. */
  const ymdFromRu = (ru: string): string => {
    const m = ru.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  };

  const items = useMemo(
    () =>
      rentals
        .filter((r) => partnerMeta.has(r.scooter))
        .sort((a, b) => b.id - a.id),
    [rentals, partnerMeta],
  );

  const todayKey = new Date().toISOString().slice(0, 10);
  const active = items.filter(
    (r) => r.status === "active" || r.status === "returning",
  );
  const overdueCount = items.filter(
    (r) =>
      r.status === "active" &&
      !!ymdFromRu(r.endPlanned) &&
      ymdFromRu(r.endPlanned) < todayKey,
  ).length;

  const selected =
    selectedId != null ? items.find((r) => r.id === selectedId) ?? null : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-start gap-4">
      {/* Левая часть: метрики + список. При открытой карточке сужается. */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile label="Всего аренд" value={String(items.length)} hint="за всё время" />
          <Tile label="Активных" value={String(active.length)} hint="идут сейчас" />
          <Tile
            label="Просрочек"
            value={String(overdueCount)}
            hint="требуют звонка"
            danger
          />
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 rounded-2xl bg-surface px-6 py-14 text-center shadow-card-sm">
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
          /* Тот же список, что в «Арендах»: все колонки + бейдж инвестора.
             overflow-x-auto — при открытом дровере таблице может быть тесно. */
          <div
            className={cn(
              "overflow-hidden rounded-2xl bg-surface shadow-card-sm",
              selected && "overflow-x-auto",
            )}
          >
            <RentalsList
              items={items}
              selectedId={selectedId}
              onSelect={(id) =>
                setSelectedId(selectedId === id ? null : id)
              }
              viewMode="list"
              investorOf={(name) => partnerMeta.get(name) ?? null}
            />
          </div>
        )}
      </div>

      {/* Боковой дровер: ТА ЖЕ карточка аренды, что в «Арендах» (drawerChrome).
          Оплату/завершение/историю карточка ведёт сама (внутренние overlay).
          Sticky + своя высота → скроллится независимо от списка. Появление —
          с той же плавностью, что и в «Арендах» (slide-in). */}
      {selected && (
        <div className="drawer-slide-in sticky top-4 hidden h-[calc(100dvh-32px)] w-[480px] shrink-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-card lg:flex xl:w-[560px]">
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
