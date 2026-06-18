import { useEffect, useRef, useState } from "react";
import { Card } from "./KpiCard";
import { cn } from "@/lib/utils";

/**
 * Круговая загрузка парка — KPI-карточка с анимированным градиент-кольцом
 * (заказчик: вместо «Новых заявок», первой в ряду). Кольцо заполняется на
 * процент загрузки (active / rentableFleet), в центре — счётчик %, рядом
 * «N в аренде / из M доступных». loadPercent/rentableFleet берём из метрик.
 */
export function ParkLoadGauge({
  percent,
  active,
  rentable,
  onClick,
  className,
}: {
  percent: number;
  active: number;
  rentable: number;
  onClick?: () => void;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const R = 30;
  const C = 2 * Math.PI * R;
  const targetOffset = C * (1 - pct / 100);

  // Анимация: кольцо доезжает до значения, число считается вверх 0→pct.
  const [offset, setOffset] = useState(C);
  const [shown, setShown] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOffset(targetOffset));
    return () => cancelAnimationFrame(id);
  }, [targetOffset]);
  useEffect(() => {
    const start = performance.now();
    const dur = 1100;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setShown(Math.round(p * pct));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [pct]);

  return (
    <Card className={className}>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          "flex w-full items-center gap-3 text-left",
          onClick ? "cursor-pointer" : "cursor-default",
        )}
      >
        <div className="relative h-[70px] w-[70px] shrink-0">
          <svg viewBox="0 0 72 72" className="-rotate-90">
            <defs>
              <linearGradient id="parkLoadGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#378ADD" />
                <stop offset="1" stopColor="#1D9E75" />
              </linearGradient>
            </defs>
            <circle
              cx="36"
              cy="36"
              r={R}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth="7"
            />
            <circle
              cx="36"
              cy="36"
              r={R}
              fill="none"
              stroke="url(#parkLoadGrad)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
              style={{
                transition: "stroke-dashoffset 1.1s cubic-bezier(0.4,0,0.2,1)",
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-[19px] font-extrabold leading-none tabular-nums text-ink">
              {shown}%
            </span>
            <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-muted-2">
              загрузка
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[12px] text-muted-2">Загрузка парка</div>
          <div className="mt-1 font-display text-[16px] font-extrabold leading-tight text-ink">
            {active} в&nbsp;аренде
          </div>
          <div className="mt-0.5 text-[11px] text-muted-2">
            из {rentable} доступных
          </div>
        </div>
      </button>
    </Card>
  );
}
