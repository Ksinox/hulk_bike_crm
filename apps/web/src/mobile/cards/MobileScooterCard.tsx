import { useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  BadgeCheck,
  Calendar,
  ChevronDown,
  ChevronLeft,
  Crown,
  Loader2,
  Pencil,
  Phone,
  RefreshCcw,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  oilServiceInfo,
  SCOOTER_STATUS_LABEL,
  type FleetScooter,
  type ScooterDisplayStatus,
} from "@/lib/mock/fleet";
import { useScooterMaintenance } from "@/lib/api/scooter-maintenance";
import { useRepairJobs } from "@/lib/api/repair-jobs";
import { useRole } from "@/lib/role";
import { MODEL_LABEL } from "@/lib/mock/rentals";
import { effectiveRentalStatus } from "@/lib/rentalStatus";
import { STATUS_LABEL as RENTAL_STATUS_LABEL } from "@/lib/mock/rentals";
import { useApiClients } from "@/lib/api/clients";
import { useRentals } from "@/pages/rentals/rentalsStore";
import { navigate } from "@/app/navigationStore";
import { ScooterEditForm } from "@/pages/fleet/ScooterEditForm";
import { ScooterDocumentsTab } from "@/pages/fleet/ScooterDocumentsTab";
import { ScooterPhotosGallery } from "@/pages/fleet/ScooterPhotosGallery";
import { ScooterStatusModal } from "@/pages/fleet/ScooterStatusModal";
import { OilChangeDialog, type OilMode } from "@/pages/fleet/OilChangeDialog";
import { RepairsTab, ExpensesTab } from "@/pages/fleet/MaintenanceTab";
import { useActivityTimeline } from "@/lib/api/activity";
import { ActivityTimelineSection } from "@/pages/rentals/ActivityTimelineSection";
import { useArchiveScooter } from "@/lib/api/scooters";
import { useMe } from "@/lib/api/auth";
import { ApiError } from "@/lib/api";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { fileUrl } from "@/lib/files";
import { NewRentalModal } from "@/pages/rentals/NewRentalModal";
import { EntityNotes } from "@/components/EntityNotes";
import { useCallClient } from "../call";
import { toast } from "@/lib/toast";
import { askArchiveReason } from "@/pages/fleet/archiveReason";
import type { Rental } from "@/lib/mock/rentals";
import type { ApiClient } from "@/lib/api/types";

type TabId = "history" | "timeline" | "repairs" | "expenses" | "docs";

const MONTH_RU = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}
/** «2026-03-15» → «15.03.2026». Дата замены масла из записи обслуживания. */
function fmtOilDate(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd;
  return `${m[3]}.${m[2]}.${m[1]}`;
}
function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
}
function reformatDate(d: string): string {
  const x = parseDate(d);
  if (!x) return d;
  return `${String(x.getDate()).padStart(2, "0")} ${MONTH_RU[x.getMonth()]} ${x.getFullYear()}`;
}
function monthsSincePurchase(p?: string): number {
  if (!p) return 0;
  const d = parseDate(p);
  if (!d) return 0;
  const t = new Date();
  return Math.max(0, (t.getFullYear() - d.getFullYear()) * 12 + (t.getMonth() - d.getMonth()));
}
function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}
function daysWord(n: number): string {
  const a = Math.abs(n);
  const n10 = a % 10;
  const n100 = a % 100;
  if (n10 === 1 && n100 !== 11) return "день";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "дня";
  return "дней";
}

const STATUS_PILL: Record<ScooterDisplayStatus, string> = {
  rented: "bg-blue-50 text-blue-700",
  rental_pool: "bg-green-soft text-green-ink",
  ready: "bg-surface-soft text-muted",
  repair: "bg-red-soft text-red-ink",
  buyout: "bg-purple-soft text-purple-ink",
  for_sale: "bg-orange-soft text-orange-ink",
  sold: "bg-surface-soft text-muted-2",
  disassembly: "bg-red-soft text-red-ink",
  dtp: "bg-red text-white",
};

/**
 * Мобильная карточка скутера — отдельный нативный экран. Те же данные/хуки
 * и под-компоненты (ремонты/расходы/документы/лента), что и десктоп, но
 * вертикальная мобильная вёрстка: фото-герой, статус с действием, техничка
 * списком, обслуживание, ROI (директору, сворачиваемый), заметки, галерея,
 * пилюли-табы. История аренд — раскрывающимися карточками.
 */
export function MobileScooterCard({
  scooter,
  status,
  onBack,
}: {
  scooter: FleetScooter;
  status: ScooterDisplayStatus;
  onBack: () => void;
}) {
  const rentals = useRentals();
  const { data: apiClients } = useApiClients();
  const role = useRole();
  const [tab, setTab] = useState<TabId>("history");
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [newRentalOpen, setNewRentalOpen] = useState(false);
  const [oilMode, setOilMode] = useState<OilMode | null>(null);
  const [roiOpen, setRoiOpen] = useState(false);
  const { data: me } = useMe();
  const canArchive = me?.role === "director" || me?.role === "creator";
  const archiveMut = useArchiveScooter();
  const { callClient, callSheet } = useCallClient();

  const doArchive = async () => {
    const reason = await askArchiveReason(scooter.name);
    if (!reason) return;
    try {
      await archiveMut.mutateAsync({ id: scooter.id, reason });
      toast.success(`«${scooter.name}» перенесён в архив`, `Причина: ${reason}`);
      onBack();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409)
        toast.error("Скутер сейчас в аренде", "Сначала завершите или отмените активную аренду.");
      else if (e instanceof ApiError && e.status === 403)
        toast.error("Недостаточно прав", "Архив доступен только директору и создателю.");
      else toast.error("Не удалось отправить в архив");
    }
  };

  const scooterRentals = useMemo(
    () => rentals.filter((r) => r.scooter === scooter.name),
    [rentals, scooter.name],
  );
  const activeRental = useMemo(
    () =>
      scooterRentals.find(
        (r) => r.status === "active" || r.status === "overdue" || r.status === "returning",
      ) ?? null,
    [scooterRentals],
  );
  const activeClient = activeRental
    ? apiClients?.find((c) => c.id === activeRental.clientId) ?? null
    : null;

  const { data: repairJobsList = [] } = useRepairJobs({ scooterId: scooter.id });
  const { data: maintenanceList = [] } = useScooterMaintenance(scooter.id);

  const oil = oilServiceInfo(scooter);
  const oilOverdue = oil.remainKm < 0;
  const oilWarn = !oilOverdue && oil.remainKm <= 300;
  const showOil = scooter.baseStatus === "rental_pool" || status === "rented";

  // История замен масла (kind:"oil"), свежие сверху — чтобы было видно дату.
  const oilChanges = useMemo(
    () =>
      [...maintenanceList]
        .filter((m) => m.kind === "oil")
        .sort((a, b) => (a.performedOn < b.performedOn ? 1 : -1)),
    [maintenanceList],
  );
  const lastOilChange = oilChanges[0] ?? null;

  // Экономика (как на десктопе)
  const lifetimeRevenue = scooterRentals.reduce((s, r) => s + (r.sum || 0), 0);
  const maintTotal = maintenanceList.reduce((s, m) => s + (m.amount || 0), 0);
  const purchase = scooter.purchasePrice || 0;
  const hasPurchasePrice = purchase > 0;
  const coveragePct = hasPurchasePrice
    ? Math.round((lifetimeRevenue / purchase) * 100)
    : null;
  const covered = (coveragePct ?? 0) >= 100;
  const netProfit = lifetimeRevenue - maintTotal - purchase;
  const netMarginPct = lifetimeRevenue
    ? Math.round(((lifetimeRevenue - maintTotal) / lifetimeRevenue) * 100)
    : 0;
  const ageMonths = scooter.purchaseDate ? monthsSincePurchase(scooter.purchaseDate) : 0;
  const serviceLifeMonths = 36;
  const lifeProgressPct = scooter.purchaseDate
    ? Math.min(100, Math.round((ageMonths / serviceLifeMonths) * 100))
    : 0;
  const remainingMonths = Math.max(0, serviceLifeMonths - ageMonths);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "history", label: "История аренд", count: scooterRentals.length },
    { id: "timeline", label: "Лента событий" },
    { id: "repairs", label: "Ремонты", count: repairJobsList.length },
    { id: "expenses", label: "Расходы", count: maintenanceList.length },
    { id: "docs", label: "Документы" },
  ];

  return (
    <div className="fixed inset-0 z-[55] flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-bg animate-slide-in-right">
      {/* Шапка */}
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border bg-surface px-2 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-surface-soft"
          aria-label="Назад"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="min-w-0 flex-1 truncate font-display text-[17px] font-bold text-ink">
          {scooter.name}
        </h1>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-surface-soft"
          aria-label="Редактировать"
        >
          <Pencil size={19} />
        </button>
      </header>

      <main className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-3 pb-8 overscroll-contain">
        {/* ===== Фото-герой ===== */}
        <section className="overflow-hidden rounded-2xl bg-surface shadow-card-sm">
          <ScooterHeroPhoto scooter={scooter} />
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate font-display text-[20px] font-extrabold leading-tight text-ink">
                {scooter.name}
              </div>
              <div className="text-[12px] text-muted">{MODEL_LABEL[scooter.model]}</div>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold",
                STATUS_PILL[status],
              )}
            >
              {SCOOTER_STATUS_LABEL[status]}
            </span>
          </div>
        </section>

        {/* ===== Статус / активная аренда + главное действие ===== */}
        {activeRental && activeClient ? (
          <section className="rounded-2xl bg-blue-600 p-4 text-white shadow-card">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                Сейчас арендует
              </span>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                Активная аренда
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-[13px] font-bold">
                {initials(activeClient.name) || "?"}
              </div>
              <div className="min-w-0">
                <div className="truncate font-display text-[17px] font-extrabold leading-tight">
                  {activeClient.name}
                </div>
                <div className="flex items-center gap-2 text-[12px] text-white/80">
                  <Phone size={12} />
                  <span className="tabular-nums">{activeClient.phone}</span>
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[12px] text-white/80">
              <Calendar size={12} />
              <span className="tabular-nums">
                {activeRental.start.slice(0, 5)} — {activeRental.endPlanned.slice(0, 5)}
              </span>
            </div>
            {/* Быстрые действия: «Позвонить» (зелёная — главное мобильное
                действие, в зоне большого пальца) + переход к аренде. */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  callClient(activeClient.name, [
                    activeClient.phone,
                    activeClient.extraPhone,
                  ])
                }
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-green text-[13px] font-bold text-white shadow-sm active:scale-[0.98]"
              >
                <Phone size={15} /> Позвонить
              </button>
              <button
                type="button"
                onClick={() =>
                  navigate({ route: "rentals", rentalId: activeRental.id })
                }
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-white text-[13px] font-bold text-blue-700 active:scale-[0.98]"
              >
                К аренде <ArrowRight size={14} />
              </button>
            </div>
          </section>
        ) : (
          status === "rental_pool" && (
            <button
              type="button"
              onClick={() => setNewRentalOpen(true)}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-[14px] font-bold text-white shadow-card active:scale-[0.99]"
            >
              Оформить аренду <ArrowRight size={15} />
            </button>
          )
        )}

        {/* ===== Действия: статус / редактировать ===== */}
        <section className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setStatusOpen(true)}
            className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-surface text-[13px] font-semibold text-ink shadow-card-sm active:scale-[0.99]"
          >
            <RefreshCcw size={15} /> Изменить статус
          </button>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-surface text-[13px] font-semibold text-ink shadow-card-sm active:scale-[0.99]"
          >
            <Pencil size={15} /> Редактировать
          </button>
        </section>

        {/* ===== Техничка ===== */}
        <section className="rounded-2xl bg-surface p-4 shadow-card-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[15px] font-extrabold text-ink">
              Технические характеристики
            </h2>
            {scooter.vin && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-ink">
                <BadgeCheck size={11} /> VIN
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            <Spec label="Модель" value={MODEL_LABEL[scooter.model]} />
            <Spec label="Пробег" value={`${fmt(scooter.mileage)} км`} accent />
            <Spec label="VIN номер" value={scooter.vin ?? "—"} mono />
            <Spec label="Двигатель" value={scooter.engineNo ?? "—"} mono />
            <Spec
              label="Дата покупки"
              value={scooter.purchaseDate ? reformatDate(scooter.purchaseDate) : "—"}
            />
            {scooter.note && <Spec label="Комментарий" value={scooter.note} />}
          </div>
        </section>

        {/* ===== Обслуживание (замена масла) ===== */}
        {showOil && (
          <section className="rounded-2xl bg-surface p-4 shadow-card-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Обслуживание
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
                интервал {fmt(oil.intervalKm)} км
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[13px]">
              <span className="font-semibold text-ink">Замена масла</span>
              <span
                className={cn(
                  "font-bold tabular-nums",
                  oilOverdue ? "text-red-ink" : oilWarn ? "text-orange-ink" : "text-blue-600",
                )}
              >
                {oilOverdue
                  ? `просрочено на ${fmt(Math.abs(oil.remainKm))} км`
                  : `через ${fmt(oil.remainKm)} км`}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-soft">
              <div
                className={cn(
                  "h-full rounded-full",
                  oilOverdue ? "bg-red-ink" : oilWarn ? "bg-orange-ink" : "bg-blue-600",
                )}
                style={{ width: `${Math.round(oil.usedRatio * 100)}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[12px] text-muted-2">
              <span>
                Последняя: {fmt(oil.lastMileage)} км
                {lastOilChange && (
                  <span className="text-muted"> · {fmtOilDate(lastOilChange.performedOn)}</span>
                )}
              </span>
              <span>Следующая: {fmt(oil.nextMileage)} км</span>
            </div>

            {/* История замен — когда меняли каждый раз */}
            {oilChanges.length > 0 && (
              <div className="mt-3 border-t border-border pt-2.5">
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-2">
                  История замен · {oilChanges.length}
                </div>
                <div className="flex flex-col gap-1">
                  {oilChanges.slice(0, 3).map((m, i) => {
                    const prev = oilChanges[i + 1];
                    const delta =
                      prev && m.mileage != null && prev.mileage != null
                        ? m.mileage - prev.mileage
                        : null;
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-2 text-[12px]"
                      >
                        <span className="font-semibold text-ink">
                          {fmtOilDate(m.performedOn)}
                        </span>
                        <span className="tabular-nums text-muted">
                          {m.mileage != null ? `${fmt(m.mileage)} км` : "— км"}
                          {delta != null && delta > 0 && (
                            <span className="ml-1 text-muted-2">(+{fmt(delta)})</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setOilMode("change")}
              className="mt-2.5 flex min-h-[44px] w-full items-center justify-center rounded-xl border border-border text-[12px] font-semibold text-ink-2 active:bg-surface-soft"
            >
              Зафиксировать замену
            </button>
            {/* Точка отсчёта по пробегу — последняя замена для счётчика интервала. */}
            <button
              type="button"
              onClick={() => setOilMode("baseline")}
              className="mt-1.5 flex min-h-[40px] w-full items-center justify-center text-[12px] font-semibold text-blue-600 active:opacity-70"
            >
              Указать пробег прошлой замены
            </button>
          </section>
        )}

        {/* ===== ROI (директору, сворачиваемый) ===== */}
        {role === "director" && (
          <section className="overflow-hidden rounded-2xl bg-surface shadow-card-sm">
            <button
              type="button"
              onClick={() => setRoiOpen((o) => !o)}
              className="flex w-full items-center gap-2 p-4 text-left active:bg-surface-soft/50"
            >
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-ink">
                <Crown size={11} /> Директору
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[15px] font-extrabold text-ink">
                  Окупаемость актива
                </div>
                <div className="text-[12px] text-muted">
                  Доход {fmt(lifetimeRevenue)} ₽ · {scooterRentals.length} аренд
                </div>
              </div>
              <ChevronDown
                size={18}
                className={cn("shrink-0 text-muted-2 transition-transform", roiOpen && "rotate-180")}
              />
            </button>
            {roiOpen && (
              <div className="space-y-4 border-t border-border px-4 py-4">
                {/* Покрытие закупа */}
                <div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-bold text-ink">Покрытие цены закупа</span>
                    {coveragePct != null ? (
                      <span className={cn("font-bold", covered ? "text-blue-600" : "text-muted")}>
                        {coveragePct}%
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditOpen(true)}
                        className="font-bold text-blue-600"
                      >
                        указать цену →
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-soft">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${Math.min(100, coveragePct ?? 0)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-2">
                    {hasPurchasePrice
                      ? covered
                        ? `Закуп ${fmt(purchase)} ₽ — амортизирован.`
                        : `Осталось покрыть ${fmt(Math.max(0, purchase - lifetimeRevenue))} ₽.`
                      : "Цена закупа не указана."}
                  </div>
                </div>
                {/* Ресурс */}
                <div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-bold text-ink">Ресурс эксплуатации</span>
                    {scooter.purchaseDate ? (
                      <span className="font-bold tabular-nums text-ink-2">
                        мес {ageMonths} / {serviceLifeMonths}
                      </span>
                    ) : (
                      <button type="button" onClick={() => setEditOpen(true)} className="font-bold text-blue-600">
                        указать дату →
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-soft">
                    <div className="h-full rounded-full bg-ink" style={{ width: `${lifeProgressPct}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-2">
                    {!scooter.purchaseDate
                      ? "Дата покупки не указана."
                      : remainingMonths > 0
                        ? `Оставшийся ресурс ~${remainingMonths} мес.`
                        : "Ресурс исчерпан — рассмотрите продажу."}
                  </div>
                </div>
                {/* Мини-статы */}
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label="Расходы ТО" value={`${fmt(maintTotal)} ₽`} />
                  <MiniStat
                    label="Чистая маржа"
                    value={lifetimeRevenue > 0 ? `${netMarginPct}%` : "—"}
                    tone={netMarginPct >= 50 ? "green" : netMarginPct >= 0 ? "ink" : "red"}
                  />
                  <MiniStat label="Цена закупа" value={hasPurchasePrice ? `${fmt(purchase)} ₽` : "—"} />
                  <MiniStat
                    label="Чистая прибыль"
                    value={
                      hasPurchasePrice || maintTotal > 0
                        ? `${netProfit >= 0 ? "+" : "−"}${fmt(Math.abs(netProfit))} ₽`
                        : "—"
                    }
                    tone={netProfit >= 0 ? "green" : "red"}
                  />
                </div>
              </div>
            )}
          </section>
        )}

        {/* ===== Заметки ===== */}
        <section className="rounded-2xl border border-border bg-surface-soft/40 p-3">
          <EntityNotes entity="scooter" entityId={scooter.id} />
        </section>

        {/* ===== Галерея ===== */}
        <section className="rounded-2xl bg-surface p-4 shadow-card-sm">
          <ScooterPhotosGallery scooterId={scooter.id} />
        </section>

        {/* ===== Пилюли-табы ===== */}
        <div className="no-scrollbar -mx-3 overflow-x-auto px-3">
          <div className="flex w-max gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  tab === t.id ? "bg-ink text-white" : "bg-surface-soft text-muted",
                )}
              >
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span
                    className={cn(
                      "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums",
                      tab === t.id ? "bg-white/20" : "bg-surface text-muted-2",
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <section>
          {tab === "history" && (
            <ScooterHistoryList
              rentals={scooterRentals}
              clients={apiClients ?? []}
              currentId={activeRental?.id}
            />
          )}
          {tab === "timeline" && <ScooterTimeline scooterId={scooter.id} />}
          {tab === "repairs" && (
            <RepairsTab
              scooterId={scooter.id}
              baseStatus={scooter.baseStatus}
              onSendToRepair={() => setStatusOpen(true)}
            />
          )}
          {tab === "expenses" && <ExpensesTab scooterId={scooter.id} />}
          {tab === "docs" && <ScooterDocumentsTab scooter={scooter} />}
        </section>

        {/* ===== В архив — внизу, директору/создателю ===== */}
        {canArchive && (
          <button
            type="button"
            onClick={doArchive}
            disabled={archiveMut.isPending}
            className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-red-400/30 bg-red-soft text-[13px] font-bold text-red-ink active:opacity-80"
          >
            {archiveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
            Перенести в архив
          </button>
        )}
      </main>

      {editOpen && <ScooterEditForm scooter={scooter} onClose={() => setEditOpen(false)} />}
      {statusOpen && (
        <ScooterStatusModal
          scooter={scooter as unknown as import("@/lib/api/types").ApiScooter}
          onClose={() => setStatusOpen(false)}
        />
      )}
      {newRentalOpen && (
        <NewRentalModal
          preselectedScooterName={scooter.name}
          onClose={() => setNewRentalOpen(false)}
          onCreated={(r) => {
            setNewRentalOpen(false);
            navigate({ route: "rentals", rentalId: r.id });
          }}
        />
      )}
      {oilMode && (
        <OilChangeDialog
          scooterId={scooter.id}
          scooterName={scooter.name}
          currentMileage={scooter.mileage}
          initialMode={oilMode}
          onClose={() => setOilMode(null)}
        />
      )}

      {/* Нижний лист выбора номера (если у клиента-арендатора два телефона). */}
      {callSheet}
    </div>
  );
}

// Компактное фото-герой скутера (аватарка модели), без 480px-простыни десктопа.
function ScooterHeroPhoto({ scooter }: { scooter: FleetScooter }) {
  const { data: models = [] } = useApiScooterModels();
  const model = scooter.modelId
    ? models.find((m) => m.id === scooter.modelId)
    : models.find((m) => m.name.toLowerCase().includes(scooter.model));
  const avatar = fileUrl(model?.avatarKey, { variant: "view" });
  return (
    <div className="flex h-44 items-center justify-center bg-white p-3">
      {avatar ? (
        <img src={avatar} alt={scooter.name} className="h-full w-full object-contain" />
      ) : (
        <div className="flex flex-col items-center gap-1 text-muted-2">
          <Wrench size={28} />
          <span className="text-[12px]">Нет фото</span>
        </div>
      )}
    </div>
  );
}

function Spec({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-2">{label}</div>
      <div
        className={cn(
          "mt-0.5 truncate text-[14px] font-bold",
          accent ? "text-blue-600" : "text-ink",
          mono && "font-mono text-[13px]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "green" | "red";
}) {
  return (
    <div className="rounded-xl bg-surface-soft px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">{label}</div>
      <div
        className={cn(
          "mt-1 font-display text-[16px] font-extrabold tabular-nums",
          tone === "green" ? "text-green-ink" : tone === "red" ? "text-red-ink" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

// История аренд скутера — раскрывающиеся карточки (мобильный аналог таблицы).
function ScooterHistoryList({
  rentals,
  clients,
  currentId,
}: {
  rentals: Rental[];
  clients: ApiClient[];
  currentId?: number;
}) {
  const sorted = useMemo(
    () =>
      [...rentals].sort((a, b) => {
        if (a.id === currentId) return -1;
        if (b.id === currentId) return 1;
        return b.id - a.id;
      }),
    [rentals, currentId],
  );
  if (sorted.length === 0) {
    return (
      <div className="flex min-h-[140px] flex-col items-center justify-center rounded-2xl border border-dashed border-border text-center text-[13px] font-semibold text-ink-2">
        По этому скутеру ещё не было аренд
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {sorted.map((r) => (
        <ScooterHistoryRow
          key={r.id}
          r={r}
          client={clients.find((c) => c.id === r.clientId) ?? null}
          isCurrent={r.id === currentId}
        />
      ))}
    </div>
  );
}

function ScooterHistoryRow({
  r,
  client,
  isCurrent,
}: {
  r: Rental;
  client: ApiClient | null;
  isCurrent: boolean;
}) {
  const eff = effectiveRentalStatus(r.status, r.endPlanned);
  return (
    <button
      type="button"
      onClick={() => navigate({ route: "rentals", rentalId: r.id })}
      className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface p-3 text-left active:bg-surface-soft/60"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft text-[12px] font-bold text-ink-2">
        {client ? initials(client.name) : "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-bold text-ink">{client?.name ?? "—"}</div>
        <div className="mt-0.5 text-[12px] text-muted tabular-nums">
          {r.start.slice(0, 5)} — {isCurrent ? "сейчас" : r.endPlanned.slice(0, 5)} · {r.days}{" "}
          {daysWord(r.days)}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-bold tabular-nums text-ink">{fmt(r.sum)} ₽</span>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
            STATUS_PILL_RENTAL[eff] ?? "bg-surface-soft text-muted",
          )}
        >
          {RENTAL_STATUS_LABEL[eff] ?? RENTAL_STATUS_LABEL[r.status]}
        </span>
      </div>
    </button>
  );
}

const STATUS_PILL_RENTAL: Record<string, string> = {
  active: "bg-green-soft text-green-ink",
  overdue: "bg-red-soft text-red-ink",
  returning: "bg-orange-soft text-orange-ink",
  completed: "bg-surface-soft text-muted",
  completed_damage: "bg-red-soft text-red-ink",
  cancelled: "bg-surface-soft text-muted-2",
  new_request: "bg-blue-50 text-blue-700",
  meeting: "bg-blue-50 text-blue-700",
  police: "bg-red-soft text-red-ink",
  court: "bg-purple-soft text-purple-ink",
};

function ScooterTimeline({ scooterId }: { scooterId: number }) {
  const q = useActivityTimeline("scooter", scooterId);
  return <ActivityTimelineSection items={q.data?.items ?? []} loading={q.isLoading} />;
}
