/**
 * v0.4.9 — компактный быстрый просмотр скутера для drawer-стека.
 *
 * Раньше при клике на скутер из drawer открывалась полная ScooterCard
 * (со своим хедером, KPI, табами, фотогалереей). Это занимало много
 * места и при закрытии возвращало пользователя в /fleet — он терял
 * цепочку расследования. Теперь — компактный layout: аватар + имя +
 * статус + ключевые цифры + Лента событий. Если оператору нужны
 * детали — кнопка «На полную» в шапке drawer'а.
 */
import { useMemo } from "react";
import {
  Bike,
  Calendar,
  Gauge,
  History as HistoryIcon,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MODEL_LABEL } from "@/lib/mock/rentals";
import { useFleetScooters } from "./fleetStore";
import { useApiClients } from "@/lib/api/clients";
import { useRentals, useArchivedRentals } from "@/pages/rentals/rentalsStore";
import { useActivityTimeline } from "@/lib/api/activity";
import { ActivityTimelineSection } from "@/pages/rentals/RentalCardTabs";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { fileUrl } from "@/lib/files";

const STATUS_LABEL: Record<string, string> = {
  ready: "Не распределён",
  rental_pool: "Парк аренды",
  repair: "На ремонте",
  buyout: "Передан в выкуп",
  for_sale: "Продаётся",
  sold: "Продан",
  disassembly: "В разборке",
};
const STATUS_TONE: Record<string, string> = {
  ready: "bg-surface-soft text-muted",
  rental_pool: "bg-green-soft text-green-ink",
  repair: "bg-red-soft text-red-ink",
  buyout: "bg-purple-soft text-purple-ink",
  for_sale: "bg-blue-50 text-blue-700",
  sold: "bg-surface-soft text-muted-2",
  disassembly: "bg-orange-soft text-orange-ink",
};

export function ScooterQuickView({ scooterId }: { scooterId: number }) {
  const fleet = useFleetScooters();
  const scooter = fleet.find((s) => s.id === scooterId) ?? null;
  const { data: models = [] } = useApiScooterModels();
  const active = useRentals();
  const archived = useArchivedRentals();
  const { data: clients = [] } = useApiClients();
  const timelineQ = useActivityTimeline("scooter", scooterId);

  // Все аренды на этот скутер — для секции «Кто катался»
  const allRentals = useMemo(
    () => [...active, ...archived].filter((r) => r.scooterId === scooterId),
    [active, archived, scooterId],
  );
  const currentRental = allRentals.find(
    (r) =>
      r.status === "active" ||
      r.status === "overdue" ||
      r.status === "returning",
  );
  const currentClient = currentRental
    ? clients.find((c) => c.id === currentRental.clientId)
    : null;

  // Поиск аватарки модели
  const modelAvatar = useMemo(() => {
    if (!scooter) return null;
    const m = models.find((m) => m.id === scooter.modelId);
    if (!m) return null;
    if (m.avatarThumbKey) return fileUrl(m.avatarThumbKey);
    if (m.avatarKey) return fileUrl(m.avatarKey);
    return null;
  }, [scooter, models]);

  if (!scooter) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Скутер не найден.
      </div>
    );
  }

  const tone = STATUS_TONE[scooter.baseStatus] ?? "bg-surface-soft text-muted";

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* Шапка с аватаркой */}
      <div className="flex items-start gap-4 rounded-2xl bg-surface p-4 shadow-card-sm">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-soft">
          {modelAvatar ? (
            <img src={modelAvatar} alt="" className="h-full w-full object-contain" />
          ) : (
            <Bike size={36} className="text-muted-2" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-[24px] font-extrabold leading-tight text-ink">
              {scooter.name}
            </h2>
            <span className="text-[13px] text-muted">
              · {MODEL_LABEL[scooter.model]}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* v0.4.12: если идёт аренда — синяя «В аренде», иначе
                baseStatus. Раньше показывал «Парк аренды/готов» даже
                когда скутер фактически у клиента. */}
            {currentRental ? (
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-700">
                В аренде
              </span>
            ) : (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider",
                  tone,
                )}
              >
                {STATUS_LABEL[scooter.baseStatus] ?? scooter.baseStatus}
              </span>
            )}
            {scooter.baseStatus === "repair" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                <Wrench size={10} /> в работе у мастера
              </span>
            )}
          </div>
          {scooter.note && (
            <div className="mt-1 text-[12px] text-muted">{scooter.note}</div>
          )}
        </div>
      </div>

      {/* KPI строка */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Mini
          icon={<Gauge size={12} />}
          label="Пробег"
          value={`${scooter.mileage.toLocaleString("ru-RU")} км`}
        />
        <Mini
          icon={<Calendar size={12} />}
          label="Год"
          value={scooter.year ? String(scooter.year) : "—"}
        />
        <Mini
          icon={<Bike size={12} />}
          label="VIN"
          value={scooter.vin ? scooter.vin.slice(-6) : "—"}
          hint={scooter.vin ?? undefined}
        />
        <Mini
          icon={<HistoryIcon size={12} />}
          label="Аренд"
          value={String(allRentals.length)}
        />
      </div>

      {/* Текущая аренда (если есть) */}
      {currentRental && (
        <div className="rounded-[14px] border border-blue-200 bg-blue-50 p-3 text-[13px]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
            Сейчас в аренде
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="font-semibold text-ink">
              {currentClient?.name ?? `Клиент #${currentRental.clientId}`}
            </span>
            <span className="text-muted">
              · аренда #{String(currentRental.id).padStart(4, "0")}
            </span>
            <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
              до {currentRental.endPlanned}
            </span>
          </div>
          {currentClient?.phone && (
            <div className="mt-1 text-[11px] text-muted">
              {currentClient.phone}
            </div>
          )}
        </div>
      )}

      {/* Лента событий — клик ведёт в drawer-стек */}
      <ActivityTimelineSection
        items={timelineQ.data?.items ?? []}
        loading={timelineQ.isLoading}
      />
    </div>
  );
}

function Mini({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-[10px] bg-surface-soft px-3 py-2"
      title={hint}
    >
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-2">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate font-display text-[16px] font-extrabold tabular-nums text-ink">
        {value}
      </div>
    </div>
  );
}
