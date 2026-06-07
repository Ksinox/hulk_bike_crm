import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Bike,
  Gauge,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RevenueAnalytics } from "@/lib/useRevenueAnalytics";

const fmt = (n: number) => n.toLocaleString("ru-RU");

/**
 * v0.9.3: «банковская» сводка выручки для полноэкранного окна.
 * Директор смотрит на показатели и сразу понимает, как дела:
 *  • большая выручка + Δ% к прошлому периоду;
 *  • нал/безнал (пончик);
 *  • динамика по дням (площадной график);
 *  • метрики: средний чек, активные аренды, загрузка парка, долг (риск);
 *  • структура выручки по типам + топ-клиенты.
 */
export function RevenueDashboard({
  a,
  periodLabel,
  scopeLabel,
}: {
  a: RevenueAnalytics;
  periodLabel: string;
  scopeLabel: string;
}) {
  const cashPct =
    a.total > 0 ? Math.round((a.cashTotal / a.total) * 100) : 0;
  const donut = useMemo(
    () => [
      { name: "Наличные", value: a.cashTotal, color: "#16A34A" },
      { name: "Безнал", value: a.cashlessTotal, color: "#2563EB" },
    ],
    [a.cashTotal, a.cashlessTotal],
  );
  const maxType = Math.max(1, ...a.byType.map((t) => t.sum));
  const maxClient = Math.max(1, ...a.topClients.map((c) => c.sum));
  const up = (a.deltaPct ?? 0) >= 0;

  return (
    <div className="flex flex-col gap-3">
      {/* ─── HERO: выручка + Δ% + нал/безнал ─── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white shadow-card-md">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-white/70">
            Выручка · {scopeLabel}
          </div>
          <div className="mt-1 flex items-end gap-3">
            <div className="font-display text-[40px] font-extrabold leading-none tabular-nums">
              {fmt(a.total)} <span className="text-[24px]">₽</span>
            </div>
            {a.deltaPct !== null && (
              <div
                className={cn(
                  "mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold",
                  up
                    ? "bg-green-400/25 text-green-100"
                    : "bg-red-400/25 text-red-100",
                )}
                title="К предыдущему периоду такой же длины"
              >
                {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {up ? "+" : ""}
                {Math.round(a.deltaPct)}%
              </div>
            )}
          </div>
          <div className="mt-1 text-[12px] text-white/70">
            {periodLabel} · {a.count}{" "}
            {plural(a.count, ["платёж", "платежа", "платежей"])} · средний чек{" "}
            <b className="text-white">{fmt(a.avgCheck)} ₽</b>
          </div>
          {a.prevTotal > 0 && (
            <div className="mt-0.5 text-[11px] text-white/55">
              прошлый период: {fmt(a.prevTotal)} ₽
            </div>
          )}
        </div>

        {/* Нал/безнал пончик */}
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-2">
            Наличные / Безнал
          </div>
          <div className="mt-1 flex items-center gap-3">
            <div className="relative h-[92px] w-[92px] shrink-0">
              {a.total > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donut}
                      dataKey="value"
                      innerRadius={30}
                      outerRadius={45}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {donut.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full border-4 border-border" />
              )}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-[16px] font-extrabold leading-none text-ink">
                  {cashPct}%
                </span>
                <span className="text-[9px] text-muted-2">нал</span>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <SplitRow
                color="#16A34A"
                label="Наличные"
                value={a.cashTotal}
              />
              <SplitRow
                color="#2563EB"
                label="Безнал"
                value={a.cashlessTotal}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── МЕТРИКИ (плитки) ─── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          icon={<Wallet size={15} />}
          label="Средний чек"
          value={`${fmt(a.avgCheck)} ₽`}
          tone="blue"
        />
        <Metric
          icon={<Bike size={15} />}
          label="Активные аренды"
          value={String(a.activeRentals)}
          tone="green"
        />
        <Metric
          icon={<Gauge size={15} />}
          label="Загрузка парка"
          value={`${a.parkUtil}%`}
          sub={`${a.activeRentals} из ${a.totalScooters}`}
          tone="purple"
        />
        <Metric
          icon={<AlertTriangle size={15} />}
          label="Долг / просрочка"
          value={`${fmt(a.debtTotal)} ₽`}
          tone={a.debtTotal > 0 ? "red" : "neutral"}
        />
      </div>

      {/* ─── ГРАФИК ВЫРУЧКИ ПО ДНЯМ ─── */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-muted-2">
          Выручка по дням
        </div>
        {a.byDay.some((d) => d.sum > 0) ? (
          <div className="h-[150px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={a.byDay}
                margin={{ top: 6, right: 4, bottom: 0, left: 4 }}
              >
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <Tooltip
                  cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                    padding: "6px 10px",
                  }}
                  formatter={(v: number) => [`${fmt(v)} ₽`, "Выручка"]}
                  labelFormatter={(l) => `${l}`}
                />
                <Area
                  type="monotone"
                  dataKey="sum"
                  stroke="#2563EB"
                  strokeWidth={2}
                  fill="url(#revFill)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[150px] items-center justify-center text-[12px] text-muted-2">
            За период платежей не было
          </div>
        )}
      </div>

      {/* ─── СТРУКТУРА + ТОП-КЛИЕНТЫ ─── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-2">
            Структура выручки
          </div>
          {a.byType.length > 0 ? (
            <div className="flex flex-col gap-2">
              {a.byType.map((t) => (
                <div key={t.key} className="flex items-center gap-2">
                  <div className="w-[92px] shrink-0 text-[12px] text-ink-2">
                    {t.label}
                  </div>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-soft">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(4, (t.sum / maxType) * 100)}%`,
                        background: t.color,
                      }}
                    />
                  </div>
                  <div className="w-[78px] shrink-0 text-right text-[12px] font-bold tabular-nums text-ink">
                    {fmt(t.sum)} ₽
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-[12px] text-muted-2">
              Нет данных
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-2">
            Топ-клиенты за период
          </div>
          {a.topClients.length > 0 ? (
            <div className="flex flex-col gap-2">
              {a.topClients.map((c, i) => (
                <div key={c.name + i} className="flex items-center gap-2">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-700">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1 truncate text-[12px] text-ink-2">
                    {c.name}
                  </div>
                  <div className="h-2.5 w-[40%] overflow-hidden rounded-full bg-surface-soft">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{
                        width: `${Math.max(4, (c.sum / maxClient) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="w-[78px] shrink-0 text-right text-[12px] font-bold tabular-nums text-ink">
                    {fmt(c.sum)} ₽
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-[12px] text-muted-2">
              Нет данных
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SplitRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span className="min-w-0 flex-1 truncate text-[12px] text-muted-2">
        {label}
      </span>
      <span className="text-[13px] font-bold tabular-nums text-ink">
        {fmt(value)} ₽
      </span>
    </div>
  );
}

const METRIC_TONES: Record<string, string> = {
  blue: "text-blue-700 bg-blue-50",
  green: "text-green-ink bg-green-soft/60",
  purple: "text-purple-700 bg-purple-soft/60",
  red: "text-red-ink bg-red-soft/60",
  neutral: "text-muted-2 bg-surface-soft",
};

function Metric({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "blue" | "green" | "purple" | "red" | "neutral";
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3.5">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-lg",
            METRIC_TONES[tone],
          )}
        >
          {icon}
        </span>
        <span className="text-[11px] font-semibold text-muted-2">{label}</span>
      </div>
      <div className="mt-2 font-display text-[24px] font-extrabold leading-none tabular-nums text-ink">
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-muted-2">{sub}</div>}
    </div>
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}
