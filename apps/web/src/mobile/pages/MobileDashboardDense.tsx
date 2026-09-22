import { AlarmClock, AlertTriangle, ArrowRight, Clock, Phone } from "lucide-react";
import { useMe } from "@/lib/api/auth";
import { useReminders } from "@/lib/api/reminders";
import { useApiScooters } from "@/lib/api/scooters";
import { PARK_LEGEND, PARK_TILE_CLS, parkTileOf } from "./MobileDashboard";
import { navigate } from "@/app/navigationStore";
import { ParkLoadGauge } from "@/pages/dashboard/ParkLoadGauge";
import { ActivityFeed } from "@/pages/dashboard/ActivityFeed";
import { useBillingPeriodRevenue } from "@/lib/useRevenue";
import {
  formatRub,
  greetingByHour,
  useDashboardMetrics,
} from "@/pages/dashboard/useDashboardMetrics";
import { useScooterNaming } from "@/lib/scooterNaming";
import { useCallClient } from "../call";
import { cn } from "@/lib/utils";
import type { RouteId } from "@/app/route";

/**
 * Дашборд планшета — вариант «спокойнее и плотнее» (проба, 22.09).
 *
 * Чем отличается от основного:
 *   • нет восьми белых карточек на сером: фон один, блоки отделяет воздух и
 *     тонкая линия — глазу есть за что зацепиться, потому что рамка теперь
 *     означает «сюда можно нажать», а не «здесь просто текст»;
 *   • строки однострочные и плотные (40px вместо 60): на том же экране видно
 *     не пять должников, а десять — для рабочего стола это важнее воздуха;
 *   • выручка — плоская строка с крупной цифрой, а не синий градиентный
 *     баннер, который выглядел как реклама поверх рабочего экрана;
 *   • круги загрузки остались крупными (заказчик 21.09), но без своих
 *     карточек — они и так самодостаточные.
 *
 * Включается флагом `?dash=dense` (или localStorage hulk-dash-dense=1) —
 * это проба для сравнения, а не замена. Данные те же самые: хук
 * useDashboardMetrics общий с компьютером и основным дашбордом.
 */
export function isDenseDashboard(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("dash");
    if (q === "dense") localStorage.setItem("hulk-dash-dense", "1");
    if (q === "normal") localStorage.removeItem("hulk-dash-dense");
    return localStorage.getItem("hulk-dash-dense") === "1";
  } catch {
    return false;
  }
}

/** Заголовок группы: капитель, счётчик и ссылка «все» — без рамки. */
function GroupHead({
  icon,
  title,
  count,
  tone,
  onMore,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  tone?: "red";
  onMore?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-1 pb-1.5">
      <span className={cn("text-muted-2", tone === "red" && "text-red")}>{icon}</span>
      <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-muted-2">
        {title}
      </span>
      {count != null && count > 0 && (
        <span
          className={cn(
            "rounded-full px-1.5 text-[11px] font-bold tabular-nums",
            tone === "red" ? "bg-red-soft text-red-ink" : "bg-surface-soft text-muted",
          )}
        >
          {count}
        </span>
      )}
      {onMore && (
        <button
          type="button"
          onClick={onMore}
          className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-blue-600"
        >
          все <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}

/** Плотная строка списка: имя и подпись в одну строку, сумма справа. */
function DenseRow({
  title,
  meta,
  amount,
  amountTone,
  right,
  onClick,
  onCall,
}: {
  title: string;
  meta: React.ReactNode;
  amount?: string;
  amountTone?: "red" | "ink";
  right?: string;
  onClick?: () => void;
  onCall?: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-baseline gap-2 py-2 pl-1 text-left"
      >
        <span className="shrink-0 truncate text-[14px] font-semibold text-ink">{title}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[12.5px] text-muted-2">
          {meta}
        </span>
        {amount && (
          <span
            className={cn(
              "shrink-0 text-[14px] font-bold tabular-nums",
              amountTone === "red" ? "text-red-ink" : "text-ink",
            )}
          >
            {amount}
          </span>
        )}
        {right && (
          <span className="w-[68px] shrink-0 text-right text-[12px] tabular-nums text-muted-2">
            {right}
          </span>
        )}
      </button>
      {onCall && (
        <button
          type="button"
          onClick={onCall}
          aria-label="Позвонить"
          className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-green-ink transition-colors hover:bg-green-soft"
        >
          <Phone size={16} />
        </button>
      )}
    </div>
  );
}

export function MobileDashboardDense({
  onSelect,
  onOpenRental,
}: {
  onSelect: (id: RouteId) => void;
  onOpenRental: (id: number) => void;
}) {
  const { data: me } = useMe();
  const m = useDashboardMetrics();
  const rev = useBillingPeriodRevenue("all");
  const { data: remindersData } = useReminders();
  const reminders = remindersData?.items ?? [];
  const { callClient, callSheet } = useCallClient();
  const { data: scooters = [] } = useApiScooters();
  const naming = useScooterNaming();
  const live = scooters.filter((s) => !s.archivedAt);
  const hasElectro = m.rentableElectro > 0 || m.activeElectroCount > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Шапка: приветствие и период одной строкой — без отдельного блока. */}
      <div className="flex items-baseline gap-3 px-1">
        <h1 className="font-display text-[22px] font-bold tracking-tight text-ink">
          Сводка на сегодня
        </h1>
        <span className="text-[13px] text-muted-2">
          {greetingByHour()}
          {me?.name ? `, ${me.name.split(" ")[0]}` : ""}
        </span>
      </div>

      {/* Сводка: цифры и круги в одну ленту, разделённые линиями, без карточек. */}
      <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.85fr)] items-center divide-x divide-border border-y border-border py-3">
        <button
          type="button"
          onClick={() => onSelect("rentals")}
          className="min-w-0 px-3 text-left"
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted-2">
            Выручка · {rev.period.label}
          </div>
          <div className="mt-1 font-display text-[34px] font-extrabold leading-none tabular-nums text-ink">
            {rev.total.toLocaleString("ru-RU")} ₽
          </div>
          <div className="mt-1 text-[12px] text-muted-2">{rev.count} платежей за период</div>
        </button>

        <ParkLoadGauge
          title="Бензиновые"
          percent={m.loadPercent}
          active={m.activePetrolCount}
          rentable={m.rentableFleet}
          onClick={() => onSelect("fleet")}
          size={104}
          className="!bg-transparent px-3 !shadow-none"
        />

        {hasElectro && (
          <>
            <ParkLoadGauge
              title="Электро"
              tone="electro"
              percent={m.loadPercentElectro}
              active={m.activeElectroCount}
              rentable={m.rentableElectro}
              onClick={() => onSelect("partners")}
              size={104}
              className="!bg-transparent px-3 !shadow-none"
            />
          </>
        )}

        <div className="min-w-0 px-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted-2">
            Поступит сегодня
          </div>
          <div className="mt-1 font-display text-[28px] font-extrabold leading-none tabular-nums text-ink">
            {m.todayIncoming > 0 ? formatRub(m.todayIncoming) : "0"} ₽
          </div>
          <div className="mt-1 text-[12px] text-muted-2">
            {m.todayIncomingCount > 0
              ? `${m.todayIncomingCount} возврата`
              : "возвратов нет"}
          </div>
        </div>
      </div>

      {/* Работа: две колонки, внутри группы — только линии, без рамок. */}
      <div className="grid grid-cols-2 items-start gap-x-8 gap-y-6">
        <section>
          <GroupHead
            icon={<AlertTriangle size={14} />}
            title="Просрочки"
            count={m.overdueCount}
            tone="red"
            onMore={m.overdueCount > 0 ? () => onSelect("debtors") : undefined}
          />
          {m.overdue.length === 0 ? (
            <div className="px-1 py-2 text-[13px] text-muted-2">
              Просрочек нет — все аренды в графике
            </div>
          ) : (
            m.overdue
              .slice(0, 10)
              .map((o) => (
                <DenseRow
                  key={o.rentalId}
                  title={o.clientName}
                  meta={naming.render(o.scooterName, { size: "sm" })}
                  amount={`${o.debt.toLocaleString("ru-RU")} ₽`}
                  amountTone="red"
                  right={`${o.daysOverdue} дн`}
                  onClick={() => onOpenRental(o.rentalId)}
                  onCall={() => callClient(o.clientName, [o.clientPhone, o.clientPhone2])}
                />
              ))
          )}
        </section>

        <section>
          <GroupHead
            icon={<AlarmClock size={14} />}
            title="Напоминания"
            count={reminders.length}
            tone={remindersData?.counts.overdue ? "red" : undefined}
          />
          {reminders.length === 0 ? (
            <div className="px-1 py-2 text-[13px] text-muted-2">Ничего не ждёт</div>
          ) : (
            reminders.slice(0, 6).map((r) => (
              <DenseRow
                key={r.id}
                title={r.title}
                meta={r.subtitle}
                amount={r.amount != null ? `${r.amount.toLocaleString("ru-RU")} ₽` : undefined}
                onClick={() =>
                  r.link?.section === "rassrochki"
                    ? navigate({ route: "rassrochki", buyoutDealId: r.link.entityId })
                    : navigate({ route: "partners" })
                }
                onCall={r.phone ? () => callClient(r.title, [r.phone!]) : undefined}
              />
            ))
          )}
        </section>

        {m.returnsToday.length > 0 && (
        <section>
          <GroupHead icon={<Clock size={14} />} title="Возвраты сегодня" count={m.returnsToday.length} />
          {m.returnsToday.slice(0, 8).map((r) => (
              <DenseRow
                key={r.rentalId}
                title={r.clientName}
                meta={naming.render(r.scooterName, { size: "sm" })}
                amount={r.sum > 0 ? `${r.sum.toLocaleString("ru-RU")} ₽` : undefined}
                onClick={() => onOpenRental(r.rentalId)}
                onCall={() => callClient(r.clientName, [r.clientPhone, r.clientPhone2])}
              />
          ))}
        </section>
        )}

        <section>
          <GroupHead
            icon={<span className="block h-3 w-3 rounded-[3px] bg-muted-2/40" />}
            title={`Парк · ${live.length} единиц`}
          />
          <div className="flex flex-wrap gap-1.5 px-1 pt-1">
            {live.map((s) => (
              <span
                key={s.id}
                title={s.name}
                className={cn("h-4 w-4 rounded-[4px]", PARK_TILE_CLS[parkTileOf(s, m)])}
              />
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[12px] text-muted-2">
            {PARK_LEGEND.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-[3px]", PARK_TILE_CLS[l.id])} />
                {l.label}
              </span>
            ))}
          </div>
        </section>

        <section className="col-span-2">
          {/* Журнал — тем же плоским видом, что и остальные группы. */}
          <ActivityFeed compact className="!bg-transparent !p-0 !shadow-none" />
        </section>
      </div>

      {callSheet}
    </div>
  );
}
