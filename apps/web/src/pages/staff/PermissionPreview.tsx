import { useMemo, useState, type ReactNode } from "react";
import { serviceMoney } from "@/lib/serviceMoney";
import { Bike, Handshake, Users, Wallet, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/Sensitive";
import { computeMetrics, useSaleDeals } from "@/lib/api/sales";
import { useServiceOrders } from "@/lib/api/service-orders";
import { useApiInvestors } from "@/lib/api/investors";
import type { Perms } from "@/lib/permissions";

/**
 * Живой предпросмотр прав (14.09, заказчик: «чтобы директор видел
 * визуально, как меняется»).
 *
 * Те же блоки, что у сотрудника в «Продажах», «Ремонтах» и «Партнёрке», на
 * настоящих цифрах за текущий месяц. Выключил право — блок исчезает, а
 * соседние растягиваются на его место: ровно так станет у человека.
 */
export function PermissionPreview({
  perms,
  personName,
}: {
  perms: Perms;
  personName: string;
}) {
  const [as, setAs] = useState<"staff" | "director">("staff");
  const see = (k: keyof Perms) => as === "director" || perms[k];

  const { data: salesData } = useSaleDeals();
  const { data: orders = [] } = useServiceOrders();
  const { data: investorsData } = useApiInvestors();

  const monthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }, []);
  const monthLabel = new Date().toLocaleDateString("ru-RU", { month: "long" });

  const sales = useMemo(() => {
    const deals = (salesData?.items ?? []).filter((d) => {
      const t = new Date(d.soldAt ?? d.createdAt).getTime();
      return t >= monthStart;
    });
    return computeMetrics(deals);
  }, [salesData, monthStart]);

  // 2.0.2: та же формула, что в блоке «Ремонты» — деньги по дате оплаты.
  const service = useMemo(() => {
    const m = serviceMoney(orders, new Date(monthStart));
    return { count: m.accepted, revenue: m.revenue, profit: m.profit, unpaid: m.waiting };
  }, [orders, monthStart]);

  const investors = investorsData?.items ?? [];
  const firstName = personName.trim().split(/\s+/)[0] || "сотрудник";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
          Живой предпросмотр
        </div>
        <div className="inline-flex rounded-full bg-surface p-0.5 shadow-card-sm" role="group" aria-label="Чьими глазами">
          <SegBtn active={as === "staff"} onClick={() => setAs("staff")}>
            Как увидит {firstName}
          </SegBtn>
          <SegBtn active={as === "director"} onClick={() => setAs("director")}>
            Как видите вы
          </SegBtn>
        </div>
      </div>

      <Block icon={<Wallet size={13} />} title={`Продажи · ${monthLabel}`}>
        <Tiles>
          <Tile label="Продано" value={`${sales.units} ед.`} />
          <Tile label="Выручка" value={`${fmt(sales.revenue)} ₽`} accent />
          {see("data.profit") && (
            <Tile label="Прибыль" value={<Sensitive>{fmt(sales.profit)} ₽</Sensitive>} />
          )}
          {see("data.profit") && (
            <Tile label="Маржа" value={<Sensitive>{sales.marginPct}%</Sensitive>} />
          )}
        </Tiles>
      </Block>

      <Block icon={<Wrench size={13} />} title={`Ремонты · ${monthLabel}`}>
        <Tiles>
          <Tile label="Ремонтов" value={String(service.count)} />
          <Tile label="Выручка" value={`${fmt(service.revenue)} ₽`} accent />
          {see("data.repairProfit") && (
            <Tile label="Прибыль" value={`${fmt(service.profit)} ₽`} />
          )}
          <Tile label="Ждём оплату" value={`${fmt(service.unpaid)} ₽`} />
        </Tiles>
      </Block>

      <Block icon={<Handshake size={13} />} title="Партнёрка">
        <div className="flex flex-wrap gap-1">
          <TabChip icon={<Bike size={12} />}>Аренды</TabChip>
          <TabChip icon={<Handshake size={12} />}>Электротранспорт</TabChip>
          {see("data.partnerShares") && <TabChip icon={<Users size={12} />}>Инвесторы</TabChip>}
        </div>
        <Tiles>
          <Tile label="Инвесторов" value={String(investors.length)} />
          {see("data.partnerShares") && (
            <Tile
              label="Процент"
              value={investors.length ? `${investors[0]!.share} %` : "—"}
            />
          )}
          {see("data.partnerShares") && (
            <Tile
              label="Доход за 30 дней"
              value={`${fmt(investors.reduce((s, i) => s + (i.income ?? 0), 0))} ₽`}
            />
          )}
        </Tiles>
      </Block>

      <p className="text-[12px] leading-snug text-muted">
        {as === "staff"
          ? "Выключенного показателя у сотрудника нет вовсе: ни плашки, ни подписи «скрыто». Соседние плашки занимают его место."
          : "Так раздел выглядит у вас — с полным доступом."}
      </p>
    </div>
  );
}

function fmt(n: number): string {
  return Math.round(Number.isFinite(n) ? n : 0).toLocaleString("ru-RU");
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
        active ? "bg-ink text-white" : "text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Block({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-surface p-3 shadow-card-sm">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

/** Ряд гибких плиток: убрали одну — остальные растягиваются. */
function Tiles({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2 [&>*]:min-w-[108px] [&>*]:flex-1">{children}</div>;
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2 transition-all duration-300",
        accent ? "bg-emerald-600 text-white" : "bg-surface-soft",
      )}
    >
      <div
        className={cn(
          "text-[10px] font-bold uppercase tracking-wider",
          accent ? "text-white/75" : "text-muted-2",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 whitespace-nowrap font-display text-[16px] font-extrabold tabular-nums",
          accent ? "text-white" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function TabChip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-2.5 py-1 text-[11.5px] font-semibold text-ink-2">
      {icon}
      {children}
    </span>
  );
}
