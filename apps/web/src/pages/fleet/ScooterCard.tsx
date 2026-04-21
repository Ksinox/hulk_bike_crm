import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bell,
  Calendar,
  ImageOff,
  Info,
  Pencil,
  Phone,
  RefreshCcw,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SCOOTER_STATUS_LABEL,
  type FleetScooter,
  type ScooterDisplayStatus,
} from "@/lib/mock/fleet";
import { MODEL_LABEL, type ScooterModel } from "@/lib/mock/rentals";
import { CLIENTS } from "@/lib/mock/clients";
import { useRentals } from "@/pages/rentals/rentalsStore";
import { navigate } from "@/app/navigationStore";
import { Topbar } from "@/pages/dashboard/Topbar";

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

function warrantyLabel(purchase?: string): string {
  if (!purchase) return "—";
  const d = parseDate(purchase);
  if (!d) return "—";
  const end = new Date(d);
  end.setFullYear(end.getFullYear() + 2);
  return `Активна до ${MONTH_RU[end.getMonth()]}. ${end.getFullYear()}`;
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
}: {
  scooter: FleetScooter;
  status: ScooterDisplayStatus;
  onBack: () => void;
}) {
  const rentals = useRentals();
  const [tab, setTab] = useState<TabId>("history");

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
    ? CLIENTS.find((c) => c.id === activeRental.clientId)
    : null;

  const repairsCount = 0; // пока нет справочника ремонтов
  const incidentsCount = 0;

  // «Топливо» — просто декоративное значение, зависящее от id (до появления телеметрии)
  const fuelLevel = 40 + ((scooter.id * 13) % 55);
  const nextServiceIn = 2_000 - (scooter.mileage % 2_000);

  const statusPill = statusPillClass(status);

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

      {/* ======== HEADER ======== */}
      <header className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          title="Назад к списку"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface shadow-card-sm transition-colors hover:bg-surface-soft"
        >
          <ArrowLeft size={18} />
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
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-surface-soft"
          title="Скоро"
        >
          <RefreshCcw size={14} /> Изменить статус
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700"
          title="Скоро"
        >
          <Pencil size={14} /> Редактировать
        </button>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted shadow-card-sm hover:text-ink"
          title="Уведомления"
        >
          <Bell size={18} />
        </button>
      </header>

      {/* ======== MAIN GRID ======== */}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* ========== ЛЕВЫЙ БЛОК: ФОТО + ТЕХНИЧКА ========== */}
        <section className="grid gap-0 overflow-hidden rounded-2xl bg-surface shadow-card-sm md:grid-cols-[260px_1fr]">
          {/* фото */}
          <div className="relative flex min-h-[320px] flex-col items-center justify-center gap-2 bg-surface-soft p-5 text-muted-2 md:border-r md:border-border">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-surface text-muted-2 shadow-card-sm">
              <ImageOff size={36} strokeWidth={1.5} />
            </div>
            <div className="text-[13px] font-semibold text-ink-2">Нет фото</div>
            <div className="max-w-[180px] text-center text-[11px] leading-snug text-muted-2">
              Загрузите аватарку модели {MODEL_LABEL[scooter.model]} — появится
              здесь для всех {scooter.name.split(" ")[0]}-скутеров
            </div>
            <button
              type="button"
              className="mt-2 rounded-full bg-surface px-3 py-1 text-[11px] font-semibold text-blue-600 shadow-card-sm hover:bg-blue-50"
              title="Скоро"
            >
              360° осмотр
            </button>
          </div>

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
              <SpecCell
                label="Гарантия"
                value={warrantyLabel(scooter.purchaseDate)}
                accent="blue"
              />
              {scooter.purchasePrice && (
                <SpecCell
                  label="Цена закупа"
                  value={`${fmt(scooter.purchasePrice)} ₽`}
                  hint="видно директору"
                />
              )}
              {scooter.note && (
                <SpecCell label="Комментарий" value={scooter.note} />
              )}
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
                    status === "ready"
                      ? "bg-green-soft text-green-ink"
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
                {status === "ready"
                  ? "Готов к аренде"
                  : status === "repair"
                    ? "На ремонте"
                    : status === "for_sale"
                      ? "Выставлен на продажу"
                      : status === "buyout"
                        ? "Передан в выкуп"
                        : "Продан"}
              </div>
              <div className="mt-2 text-[12px] leading-relaxed text-muted">
                {status === "ready"
                  ? "Скутер свободен. Создайте аренду из списка клиентов или с этой карточки."
                  : scooter.note || "—"}
              </div>
              {status === "ready" && (
                <button
                  type="button"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-blue-700"
                  title="Скоро"
                >
                  Оформить аренду <ArrowRight size={14} />
                </button>
              )}
            </div>
          )}

          {/* Maintenance Overview */}
          <div className="rounded-2xl bg-surface p-5 shadow-card-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Обслуживание
            </div>
            <div className="mt-3 flex items-center justify-between text-[13px]">
              <span className="text-ink-2">Топливо</span>
              <span className="font-bold tabular-nums text-blue-600">
                {fuelLevel}%
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-soft">
              <div
                className="h-full rounded-full bg-blue-600"
                style={{ width: `${fuelLevel}%` }}
              />
            </div>
            <div className="mt-4 flex items-center justify-between text-[13px]">
              <span className="text-ink-2">Следующее ТО</span>
              <span
                className={cn(
                  "font-bold tabular-nums",
                  nextServiceIn < 500 ? "text-orange-ink" : "text-ink",
                )}
              >
                через {fmt(nextServiceIn)} км
              </span>
            </div>
          </div>
        </aside>
      </div>

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
        {tab === "repairs" && (
          <Empty text="По этому скутеру не зафиксировано ремонтов" />
        )}
        {tab === "incidents" && (
          <Empty text="По этому скутеру не было инцидентов" />
        )}
        {tab === "docs" && (
          <Empty text="Документы скутера появятся после загрузки (ПТС/СТС/страховка)" />
        )}
      </div>
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
        const client = CLIENTS.find((c) => c.id === r.clientId);
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
