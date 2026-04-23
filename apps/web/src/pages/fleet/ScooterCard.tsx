import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Calendar,
  Crown,
  ImageOff,
  Info,
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
import { useRole } from "@/lib/role";
import { MODEL_LABEL, type ScooterModel } from "@/lib/mock/rentals";
import { useApiClients } from "@/lib/api/clients";
import { useRentals } from "@/pages/rentals/rentalsStore";
import { navigate } from "@/app/navigationStore";
import { Topbar } from "@/pages/dashboard/Topbar";
import { ScooterEditForm } from "./ScooterEditForm";
import { ScooterDocumentsTab } from "./ScooterDocumentsTab";
import { ScooterPhotosGallery } from "./ScooterPhotosGallery";
import { ScooterStatusModal } from "./ScooterStatusModal";
import { MaintenanceTab } from "./MaintenanceTab";
import { useArchiveScooter } from "@/lib/api/scooters";
import { useMe } from "@/lib/api/auth";
import { Archive, Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { fileUrl } from "@/lib/files";
import { NewRentalModal } from "@/pages/rentals/NewRentalModal";

type TabId = "history" | "repairs" | "incidents" | "docs";
const TABS: { id: TabId; label: string; count?: number }[] = [
  { id: "history", label: "История аренд" },
  { id: "repairs", label: "Ремонты" },
  { id: "incidents", label: "Инциденты" },
  { id: "docs", label: "Документы" },
];

const MONTH_RU = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function ScooterCard({
  scooter,
  status,
  onBack,
  backLabel,
}: {
  scooter: FleetScooter;
  status: ScooterDisplayStatus;
  onBack: () => void;
  backLabel?: string;
}) {
  const rentals = useRentals();
  const { data: apiClients } = useApiClients();
  const role = useRole();
  const [tab, setTab] = useState<TabId>("history");
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [newRentalOpen, setNewRentalOpen] = useState(false);
  const { data: me } = useMe();
  const canArchive = me?.role === "director" || me?.role === "creator";
  const archiveMut = useArchiveScooter();

  const doArchive = async () => {
    if (!confirm(`Перенести «${scooter.name}» в архив?`)) return;
    try {
      await archiveMut.mutateAsync(scooter.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        alert(
          "У скутера есть активная аренда. Сначала завершите/отмените её, затем попробуйте снова.",
        );
      } else if (e instanceof ApiError && e.status === 403) {
        alert("Перенос в архив доступен только директору и создателю.");
      } else {
        alert("Не удалось отправить в архив.");
      }
    }
  };

  // Все аренды по этому скутеру (включая историю)
  const scooterRentals = useMemo(
    () => rentals.filter((r) => r.scooter === scooter.name),
    [rentals, scooter.name],
  );

  const activeRental = useMemo(
    () =>
      scooterRentals.find(
        (r) =>
          r.status === "active" ||
          r.status === "overdue" ||
          r.status === "returning",
      ) ?? null,
    [scooterRentals],
  );

  const activeClient = activeRental
    ? apiClients?.find((c) => c.id === activeRental.clientId) ?? null
    : null;

  const repairsCount = 0; // пока нет справочника ремонтов
  const incidentsCount = 0;

  // Информация по замене масла — интервал зависит от модели (Jog — 5000 км, остальные — 3000 км).
  // Рассчитывается от пробега на момент прошлой замены и текущего пробега.
  const oil = oilServiceInfo(scooter);
  const oilOverdue = oil.remainKm < 0;
  const oilWarn = !oilOverdue && oil.remainKm <= 300;

  // Экономика — считается по реальным данным: сумма аренд + записи обслуживания из API.
  const lifetimeRevenue = scooterRentals.reduce((s, r) => s + (r.sum || 0), 0);
  const { data: maintenanceRows = [] } = useScooterMaintenance(scooter.id);
  const maintTotal = maintenanceRows.reduce((s, m) => s + (m.amount || 0), 0);

  const purchase = scooter.purchasePrice || 0;
  const hasPurchasePrice = purchase > 0;
  const hasPurchaseDate = !!scooter.purchaseDate;

  // Покрытие цены закупа — только если цена указана
  const coveragePct = hasPurchasePrice
    ? Math.round((lifetimeRevenue / purchase) * 100)
    : null;
  const covered = (coveragePct ?? 0) >= 100;

  // Чистая прибыль: все аренды − обслуживание − закуп (если указан)
  const netProfit = lifetimeRevenue - maintTotal - purchase;
  const netMarginPct = lifetimeRevenue
    ? Math.round(((lifetimeRevenue - maintTotal) / lifetimeRevenue) * 100)
    : 0;

  const ageMonths = hasPurchaseDate
    ? monthsSincePurchase(scooter.purchaseDate)
    : 0;
  const serviceLifeMonths = 36; // ожидаемая эксплуатация, мес (типовая для скутеров)
  const lifeProgressPct = hasPurchaseDate
    ? Math.min(100, Math.round((ageMonths / serviceLifeMonths) * 100))
    : 0;
  const remainingMonths = Math.max(0, serviceLifeMonths - ageMonths);

  // «Индекс прибыли» 0..100 — композит покрытия + маржи. Если нет закупа — null.
  const profitIndex =
    coveragePct != null
      ? Math.max(
          0,
          Math.min(100, Math.round(coveragePct * 0.6 + netMarginPct * 0.4)),
        )
      : null;

  const statusPill = statusPillClass(status);

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

      {/* ======== HEADER ======== */}
      <header className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          title={backLabel ? `Назад ${backLabel}` : "Назад к списку"}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface shadow-card-sm transition-colors hover:bg-surface-soft",
            backLabel ? "h-10 px-3 text-[13px] font-semibold" : "h-10 w-10 justify-center",
          )}
        >
          <ArrowLeft size={18} />
          {backLabel}
        </button>
        <h1 className="font-display text-[32px] font-extrabold leading-none text-ink">
          {scooter.name}
        </h1>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold",
            statusPill,
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
          {SCOOTER_STATUS_LABEL[status]}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setStatusOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-surface-soft"
        >
          <RefreshCcw size={14} /> Изменить статус
        </button>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <Pencil size={14} /> Редактировать
        </button>
        {canArchive && (
          <button
            type="button"
            onClick={doArchive}
            disabled={archiveMut.isPending}
            title="Перенести в архив"
            className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-soft px-3 py-2 text-[12px] font-bold text-red-ink transition-colors hover:bg-red hover:text-white"
          >
            {archiveMut.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Archive size={13} />
            )}
            В архив
          </button>
        )}
      </header>

      {/* ======== MAIN GRID ======== */}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* ========== ЛЕВЫЙ БЛОК: ФОТО + ТЕХНИЧКА ========== */}
        <section className="grid gap-0 overflow-hidden rounded-2xl bg-surface shadow-card-sm md:grid-cols-[260px_1fr]">
          {/* фото */}
          <ScooterPhotoArea scooter={scooter} />

          {/* техничка */}
          <div className="flex flex-col gap-0 p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                  <Info size={14} />
                </span>
                <h2 className="font-display text-[18px] font-extrabold text-ink">
                  Технические характеристики
                </h2>
              </div>
              {scooter.vin && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-ink">
                  <BadgeCheck size={11} /> VIN подтверждён
                </span>
              )}
            </div>

            <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <SpecCell label="Модель" value={MODEL_LABEL[scooter.model]} />
              <SpecCell
                label="VIN номер"
                value={scooter.vin ?? "—"}
                mono
              />
              <SpecCell
                label="Номер двигателя"
                value={scooter.engineNo ?? "—"}
                mono
              />
              <SpecCell
                label="Пробег"
                value={`${fmt(scooter.mileage)} км`}
                accent="blue"
              />
              <SpecCell
                label="Дата покупки"
                value={
                  scooter.purchaseDate
                    ? reformatDate(scooter.purchaseDate)
                    : "—"
                }
              />
              {scooter.note && (
                <SpecCell label="Комментарий" value={scooter.note} />
              )}
            </div>

            {/* Галерея фото скутера — внутри основной карточки, под техничкой.
                До 10 штук, клик по фото — предпросмотр модалкой. */}
            <div className="mt-6 border-t border-border pt-5">
              <ScooterPhotosGallery scooterId={scooter.id} />
            </div>
          </div>
        </section>

        {/* ========== ПРАВЫЙ СТОЛБЕЦ ========== */}
        <aside className="flex flex-col gap-4">
          {activeRental && activeClient ? (
            <div className="relative overflow-hidden rounded-2xl bg-blue-600 p-5 text-white shadow-card">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white">
                  {initials(activeClient.name) || "?"}
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  Активная аренда
                </span>
              </div>
              <div className="mt-5 text-[12px] font-semibold uppercase tracking-wider text-white/70">
                Сейчас арендует
              </div>
              <div className="mt-1 font-display text-[22px] font-extrabold leading-tight">
                {activeClient.name}
              </div>

              <div className="mt-4 flex items-center gap-2 text-[13px]">
                <Phone size={14} className="opacity-80" />
                <span className="tabular-nums">{activeClient.phone}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[13px]">
                <Calendar size={14} className="opacity-80" />
                <span className="tabular-nums">
                  {activeRental.start.slice(0, 5)} —{" "}
                  {activeRental.endPlanned.slice(0, 5)}
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  navigate({ route: "rentals", rentalId: activeRental.id })
                }
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-blue-700 transition-colors hover:bg-blue-50"
              >
                Перейти к аренде <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-surface p-5 shadow-card-sm">
              <div className="flex items-start justify-between">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full",
                    status === "rental_pool"
                      ? "bg-green-soft text-green-ink"
                      : status === "ready"
                        ? "bg-surface-soft text-muted"
                        : status === "repair"
                          ? "bg-red-soft text-red-ink"
                          : status === "for_sale"
                            ? "bg-orange-soft text-orange-ink"
                            : "bg-surface-soft text-muted",
                  )}
                >
                  {status === "repair" ? (
                    <Wrench size={18} />
                  ) : (
                    <BadgeCheck size={18} />
                  )}
                </div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    statusPill,
                  )}
                >
                  {SCOOTER_STATUS_LABEL[status]}
                </span>
              </div>
              <div className="mt-5 text-[12px] font-semibold uppercase tracking-wider text-muted-2">
                Текущий статус
              </div>
              <div className="mt-1 font-display text-[20px] font-extrabold leading-tight text-ink">
                {status === "rental_pool"
                  ? "Готов к аренде"
                  : status === "ready"
                    ? "Не распределён"
                    : status === "repair"
                      ? "На ремонте"
                      : status === "for_sale"
                        ? "Выставлен на продажу"
                        : status === "buyout"
                          ? "Передан в выкуп"
                          : "Продан"}
              </div>
              <div className="mt-2 text-[12px] leading-relaxed text-muted">
                {status === "rental_pool"
                  ? "Скутер в пуле аренды. Создайте аренду из списка клиентов или с этой карточки."
                  : status === "ready"
                    ? "Скутер заведён в парк, но ещё не назначен под аренду, ремонт или продажу."
                    : scooter.note || "—"}
              </div>
              {status === "rental_pool" && (
                <button
                  type="button"
                  onClick={() => setNewRentalOpen(true)}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-blue-700"
                >
                  Оформить аренду <ArrowRight size={14} />
                </button>
              )}
            </div>
          )}

          {/* Maintenance Overview — замена масла.
              Показываем только для скутеров «Парк аренды» или «В аренде»
              (только те реально катают и нуждаются в ТО). */}
          {(scooter.baseStatus === "rental_pool" || status === "rented") && (
          <div className="rounded-2xl bg-surface p-5 shadow-card-sm">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Обслуживание
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
                интервал {fmt(oil.intervalKm)} км
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between text-[13px]">
              <span className="font-semibold text-ink">Замена масла</span>
              <span
                className={cn(
                  "font-bold tabular-nums",
                  oilOverdue
                    ? "text-red-ink"
                    : oilWarn
                      ? "text-orange-ink"
                      : "text-blue-600",
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
                  "h-full rounded-full transition-all",
                  oilOverdue
                    ? "bg-red-ink"
                    : oilWarn
                      ? "bg-orange-ink"
                      : "bg-blue-600",
                )}
                style={{ width: `${Math.round(oil.usedRatio * 100)}%` }}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-2">
                  Последняя замена
                </div>
                <div className="mt-0.5 font-bold tabular-nums text-ink">
                  {fmt(oil.lastMileage)} км
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-2">
                  След. замена при
                </div>
                <div className="mt-0.5 font-bold tabular-nums text-ink">
                  {fmt(oil.nextMileage)} км
                </div>
              </div>
            </div>

            <button
              type="button"
              className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink-2 transition-colors hover:bg-surface-soft"
              title="Скоро — откроется форма фиксации замены"
            >
              Зафиксировать замену
            </button>
          </div>
          )}
        </aside>
      </div>

      {/* ======== DIRECTOR-ONLY: ROI ======== */}
      {role === "director" && (
        <section className="relative overflow-hidden rounded-2xl bg-surface p-6 shadow-card-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex items-start gap-2">
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-purple-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-ink">
                <Crown size={11} /> Только директору
              </span>
              <div>
                <h2 className="font-display text-[22px] font-extrabold leading-tight text-ink">
                  Окупаемость и здоровье актива
                </h2>
                <div className="mt-1 text-[13px] text-muted">
                  {hasPurchasePrice
                    ? "Экономическая эффективность vs. ресурс скутера"
                    : "Укажите цену закупа чтобы увидеть окупаемость и прибыль"}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
                Доход за всё время
              </div>
              <div
                className={cn(
                  "mt-1 font-display text-[28px] font-extrabold leading-none tabular-nums",
                  covered ? "text-blue-600" : "text-ink",
                )}
              >
                {fmt(lifetimeRevenue)} ₽
              </div>
              <div className="mt-1 text-[11px] text-muted-2">
                по {scooterRentals.length} {plural(scooterRentals.length, ["аренде", "арендам", "арендам"])}
              </div>
            </div>
          </div>

          {/* Подсказки-плашки что именно нужно ввести */}
          {(!hasPurchasePrice || !hasPurchaseDate) && (
            <div className="mt-4 flex flex-col gap-2">
              {!hasPurchasePrice && (
                <RoiHint
                  title="Укажите цену закупа"
                  hint="Без этого невозможно посчитать окупаемость и чистую прибыль."
                  action="Открыть редактирование"
                  onAction={() => setEditOpen(true)}
                />
              )}
              {!hasPurchaseDate && (
                <RoiHint
                  title="Укажите дату покупки"
                  hint="Нужна для расчёта ресурса эксплуатации (по умолчанию 36 месяцев)."
                  action="Открыть редактирование"
                  onAction={() => setEditOpen(true)}
                />
              )}
            </div>
          )}

          <div className="mt-5 grid gap-5 lg:grid-cols-[260px_1fr]">
            {/* Donut */}
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface-soft p-5">
              {profitIndex != null ? (
                <>
                  <Donut value={profitIndex} />
                  <div className="text-center text-[12px] leading-snug text-muted">
                    {covered
                      ? `Скутер окупился, принёс сверху ${fmt(
                          Math.max(0, lifetimeRevenue - purchase),
                        )} ₽`
                      : `До окупаемости осталось ${fmt(
                          Math.max(0, purchase - lifetimeRevenue),
                        )} ₽`}
                  </div>
                </>
              ) : (
                <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-muted-2">
                    <Info size={22} />
                  </div>
                  <div className="text-[12px] text-muted-2">
                    Индекс прибыли появится после указания цены закупа
                  </div>
                </div>
              )}
            </div>

            {/* Stats column */}
            <div className="flex flex-col gap-5">
              {/* Coverage */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-bold text-ink">
                    Покрытие цены закупа
                  </span>
                  {coveragePct != null ? (
                    <span
                      className={cn(
                        "text-[12px] font-bold",
                        covered ? "text-blue-600" : "text-muted",
                      )}
                    >
                      {coveragePct}% {covered ? "покрыто" : "пока"}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditOpen(true)}
                      className="text-[12px] font-bold text-blue-600 hover:underline"
                    >
                      указать цену →
                    </button>
                  )}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-soft">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${Math.min(100, coveragePct ?? 0)}%` }}
                  />
                </div>
                <div className="mt-1.5 text-[12px] text-muted-2">
                  {hasPurchasePrice ? (
                    <>
                      Цена закупа <b>{fmt(purchase)} ₽</b>
                      {covered
                        ? " — полностью амортизирована."
                        : ` — осталось покрыть ${fmt(
                            Math.max(0, purchase - lifetimeRevenue),
                          )} ₽.`}
                    </>
                  ) : (
                    <>Цена закупа не указана.</>
                  )}
                </div>
              </div>

              {/* Lifecycle */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-bold text-ink">
                    Ресурс эксплуатации
                  </span>
                  {hasPurchaseDate ? (
                    <span className="text-[12px] font-bold text-ink-2 tabular-nums">
                      Месяц {ageMonths} / {serviceLifeMonths}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditOpen(true)}
                      className="text-[12px] font-bold text-blue-600 hover:underline"
                    >
                      указать дату →
                    </button>
                  )}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-soft">
                  <div
                    className="h-full rounded-full bg-ink transition-all"
                    style={{ width: `${lifeProgressPct}%` }}
                  />
                </div>
                <div className="mt-1.5 text-[12px] text-muted-2">
                  {!hasPurchaseDate
                    ? "Дата покупки не указана."
                    : remainingMonths > 0
                      ? `Оставшийся ресурс — ~${remainingMonths} мес. (типовой срок 36 мес).`
                      : "Расчётный ресурс исчерпан — рассмотрите продажу."}
                </div>
              </div>

              {/* Mini stats */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTab("repairs")}
                  className="rounded-2xl bg-surface-soft px-4 py-3 text-left transition-colors hover:bg-blue-50"
                  title="Открыть вкладку «Ремонты» для добавления/редактирования расходов"
                >
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-2">
                    Расходы на обслуживание
                    <span className="text-blue-600">{maintenanceRows.length} зап.</span>
                  </div>
                  <div className="mt-1 font-display text-[20px] font-extrabold tabular-nums text-ink">
                    {fmt(maintTotal)} ₽
                  </div>
                  {maintenanceRows.length === 0 && (
                    <div className="mt-1 text-[11px] text-muted-2">
                      нажмите чтобы добавить первую запись →
                    </div>
                  )}
                </button>
                <div className="rounded-2xl bg-surface-soft px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
                    Чистая маржа
                  </div>
                  <div
                    className={cn(
                      "mt-1 font-display text-[20px] font-extrabold tabular-nums",
                      netMarginPct >= 50
                        ? "text-green-ink"
                        : netMarginPct >= 0
                          ? "text-ink"
                          : "text-red-ink",
                    )}
                  >
                    {lifetimeRevenue > 0 ? `${netMarginPct}%` : "—"}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-2">
                    {lifetimeRevenue > 0
                      ? "(доход − обслуживание) / доход"
                      : "появится после первой аренды"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="rounded-2xl bg-surface-soft px-4 py-3 text-left transition-colors hover:bg-blue-50"
                  title="Редактировать цену закупа"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
                    Цена закупа
                  </div>
                  <div className="mt-1 font-display text-[20px] font-extrabold tabular-nums text-ink">
                    {hasPurchasePrice ? `${fmt(purchase)} ₽` : "—"}
                  </div>
                  {!hasPurchasePrice && (
                    <div className="mt-1 text-[11px] text-blue-600">
                      нажмите чтобы указать →
                    </div>
                  )}
                </button>
                <div className="rounded-2xl bg-surface-soft px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
                    Чистая прибыль
                  </div>
                  {hasPurchasePrice || maintTotal > 0 ? (
                    <div
                      className={cn(
                        "mt-1 font-display text-[20px] font-extrabold tabular-nums",
                        netProfit >= 0 ? "text-green-ink" : "text-red-ink",
                      )}
                    >
                      {netProfit >= 0 ? "+" : "−"}
                      {fmt(Math.abs(netProfit))} ₽
                    </div>
                  ) : (
                    <div className="mt-1 font-display text-[20px] font-extrabold text-muted-2">
                      —
                    </div>
                  )}
                  <div className="mt-1 text-[11px] text-muted-2">
                    доход − обслуживание − закуп
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ======== TABS ======== */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const count =
            t.id === "history"
              ? scooterRentals.length
              : t.id === "repairs"
                ? repairsCount
                : t.id === "incidents"
                  ? incidentsCount
                  : 0;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "relative -mb-px inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold transition-colors",
                tab === t.id
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "border-b-2 border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
              {count > 0 && (
                <span
                  className={cn(
                    "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                    tab === t.id
                      ? "bg-blue-50 text-blue-700"
                      : "bg-surface-soft text-muted",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1">
        {tab === "history" && (
          <HistoryTab rentals={scooterRentals} currentId={activeRental?.id} />
        )}
        {tab === "repairs" && <MaintenanceTab scooterId={scooter.id} />}
        {tab === "incidents" && (
          <Empty text="По этому скутеру не было инцидентов" />
        )}
        {tab === "docs" && <ScooterDocumentsTab scooter={scooter} />}
      </div>

      {editOpen && (
        <ScooterEditForm
          scooter={scooter}
          onClose={() => setEditOpen(false)}
        />
      )}
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
    </main>
  );
}

/* ============ Helpers ============ */

function statusPillClass(status: ScooterDisplayStatus): string {
  return status === "ready"
    ? "bg-green-soft text-green-ink"
    : status === "rented"
      ? "bg-blue-50 text-blue-700"
      : status === "repair"
        ? "bg-red-soft text-red-ink"
        : status === "buyout"
          ? "bg-purple-soft text-purple-ink"
          : status === "for_sale"
            ? "bg-orange-soft text-orange-ink"
            : "bg-surface-soft text-muted";
}

function monthsSincePurchase(purchase?: string): number {
  if (!purchase) return 0;
  const d = parseDate(purchase);
  if (!d) return 0;
  const today = new Date();
  const years = today.getFullYear() - d.getFullYear();
  const months = today.getMonth() - d.getMonth();
  return Math.max(0, years * 12 + months);
}

function Donut({ value }: { value: number }) {
  const size = 180;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(100, value)) / 100);
  const growing = value >= 50;
  return (
    <div className="relative flex h-[180px] w-[180px] items-center justify-center">
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="hsl(var(--border))"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="hsl(var(--blue))"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 500ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
          Индекс прибыли
        </div>
        <div className="mt-0.5 font-display text-[32px] font-extrabold leading-none tabular-nums text-ink">
          {value.toFixed(1)}
        </div>
        <div
          className={cn(
            "mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
            growing
              ? "bg-blue-50 text-blue-700"
              : "bg-surface-soft text-muted",
          )}
        >
          {growing ? "+" : ""}
          {Math.round(value - 50)}% к среднему
        </div>
      </div>
    </div>
  );
}

function reformatDate(ddmmyyyy: string): string {
  const d = parseDate(ddmmyyyy);
  if (!d) return ddmmyyyy;
  return `${String(d.getDate()).padStart(2, "0")} ${MONTH_RU[d.getMonth()]} ${d.getFullYear()}`;
}

function SpecCell({
  label,
  value,
  hint,
  mono,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
  accent?: "blue";
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-[15px] font-bold leading-tight",
          accent === "blue" ? "text-blue-600" : "text-ink",
          mono && "font-mono tracking-tight",
        )}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-2">
          {hint}
        </div>
      )}
    </div>
  );
}

function HistoryTab({
  rentals,
  currentId,
}: {
  rentals: ReturnType<typeof useRentals>;
  currentId?: number;
}) {
  const { data: apiClients } = useApiClients();
  const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
    active: { label: "Идёт", tone: "bg-blue-50 text-blue-700" },
    overdue: { label: "Просрочка", tone: "bg-red-soft text-red-ink" },
    returning: { label: "Возврат", tone: "bg-orange-soft text-orange-ink" },
    completed: { label: "Завершена", tone: "bg-surface-soft text-muted" },
    completed_damage: { label: "С ущербом", tone: "bg-red-soft text-red-ink" },
    cancelled: { label: "Отменена", tone: "bg-surface-soft text-muted-2" },
    new_request: { label: "Заявка", tone: "bg-surface-soft text-muted" },
    meeting: { label: "Встреча", tone: "bg-surface-soft text-muted" },
    police: { label: "Полиция", tone: "bg-red-soft text-red-ink" },
    court: { label: "Суд", tone: "bg-red-soft text-red-ink" },
  };

  const sorted = useMemo(
    () =>
      [...rentals].sort((a, b) => {
        // текущая — сверху, затем по id убывания (свежее сверху)
        if (a.id === currentId) return -1;
        if (b.id === currentId) return 1;
        return b.id - a.id;
      }),
    [rentals, currentId],
  );

  if (sorted.length === 0) {
    return <Empty text="По этому скутеру ещё не было аренд" />;
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-surface shadow-card-sm">
      <div className="grid grid-cols-[1.4fr_1.6fr_1fr_1fr_auto] gap-4 border-b border-border bg-surface-soft/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-2">
        <span>Период</span>
        <span>Клиент</span>
        <span className="text-right">Сумма</span>
        <span>Статус</span>
        <span />
      </div>
      {sorted.map((r) => {
        const client = apiClients?.find((c) => c.id === r.clientId);
        const s = STATUS_LABEL[r.status] ?? STATUS_LABEL.completed;
        const isCurrent = r.id === currentId;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => navigate({ route: "rentals", rentalId: r.id })}
            className="grid w-full grid-cols-[1.4fr_1.6fr_1fr_1fr_auto] items-center gap-4 border-b border-border/60 px-5 py-3.5 text-left transition-colors last:border-b-0 hover:bg-surface-soft/50"
          >
            <div>
              <div className="text-[13px] font-semibold text-ink tabular-nums">
                {r.start.slice(0, 5)} —{" "}
                {isCurrent ? "сейчас" : r.endPlanned.slice(0, 5)}
              </div>
              <div className="text-[11px] text-muted-2">
                {r.days} {daysWord(r.days)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-soft text-[11px] font-bold text-ink-2">
                {client ? initials(client.name) : "?"}
              </div>
              <span className="truncate text-[13px] font-semibold text-ink">
                {client?.name ?? "—"}
              </span>
            </div>
            <div className="text-right text-[13px] font-bold tabular-nums text-ink">
              {fmt(r.sum)} ₽
            </div>
            <div>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold",
                  s.tone,
                )}
              >
                {s.label}
              </span>
            </div>
            <ArrowRight size={14} className="text-muted-2" />
          </button>
        );
      })}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-surface/50 text-center">
      <div className="text-[13px] font-semibold text-ink-2">{text}</div>
    </div>
  );
}

function daysWord(n: number): string {
  const a = Math.abs(n);
  const n10 = a % 10;
  const n100 = a % 100;
  if (n10 === 1 && n100 !== 11) return "день";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "дня";
  return "дней";
}

// Type gymnastics
export type { ScooterModel };

/**
 * Фото-область в шапке карточки скутера.
 * Приоритет: 1) загруженное фото скутера (первое из ScooterPhotos) —
 *            2) аватарка модели (scooter_models.avatarKey) —
 *            3) заглушка «Нет фото».
 */
function ScooterPhotoArea({ scooter }: { scooter: FleetScooter }) {
  const { data: models = [] } = useApiScooterModels();
  // Ищем модель по modelId (новый FK); если нет — по совпадению названия с enum
  const model = scooter.modelId
    ? models.find((m) => m.id === scooter.modelId)
    : models.find((m) => m.name.toLowerCase().includes(scooter.model));
  const modelAvatar = fileUrl(model?.avatarKey);

  return (
    <div className="relative flex min-h-[320px] flex-col items-center justify-center gap-2 bg-surface-soft p-5 text-muted-2 md:border-r md:border-border">
      {modelAvatar ? (
        <>
          <div className="relative h-40 w-40 overflow-hidden rounded-2xl bg-white shadow-card-sm">
            <img
              src={modelAvatar}
              alt={model?.name ?? ""}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="mt-1 text-[12px] font-semibold text-ink-2">
            {model?.name ?? MODEL_LABEL[scooter.model]}
          </div>
          <div className="text-[10px] text-muted-2">аватарка модели</div>
        </>
      ) : (
        <>
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-surface text-muted-2 shadow-card-sm">
            <ImageOff size={36} strokeWidth={1.5} />
          </div>
          <div className="text-[13px] font-semibold text-ink-2">Нет фото</div>
          <div className="max-w-[200px] text-center text-[11px] leading-snug text-muted-2">
            Загрузите аватарку модели {MODEL_LABEL[scooter.model]} в
            «Гараж → Модели» — она появится здесь для всех скутеров этой модели
          </div>
        </>
      )}
    </div>
  );
}

/** Pluralize русских существительных: (1, [шт, штуки, штук]) */
function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** Подсказка-плашка в блоке ROI: «укажите Х, без этого не работает Y». */
function RoiHint({
  title,
  hint,
  action,
  onAction,
}: {
  title: string;
  hint: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-50 px-3 py-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-200 text-amber-800">
        <Info size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-amber-900">{title}</div>
        <div className="text-[11px] text-amber-900/80">{hint}</div>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="shrink-0 rounded-full bg-amber-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-amber-700"
      >
        {action}
      </button>
    </div>
  );
}
