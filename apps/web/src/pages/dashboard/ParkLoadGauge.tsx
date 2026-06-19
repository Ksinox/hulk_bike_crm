import { Component, Suspense, lazy, useEffect, useRef, useState } from "react";
import { Card } from "./KpiCard";
import { cn } from "@/lib/utils";

const LiquidGradient = lazy(() => import("./LiquidGradient"));

/**
 * Круговая загрузка парка — KPI-карточка-герой. Светлый круг (бело-серый
 * градиент), по КОЛЬЦУ вокруг белого центра течёт анимированный градиент-
 * жидкость (ShaderGradient, зеленовато-синий), залитая снизу на % загрузки
 * с волнистой «живой» поверхностью (две SVG-волны едут по горизонтали).
 * По центру белый круг с крупным % — получается донат-диаграмма.
 * Three.js ленив (LiquidGradient) + ErrorBoundary с CSS-градиент-фолбэком.
 */

const SIZE = 100;
const CENTER = 60; // белый круг по центру → донат

/** Запасной CSS-градиент (зелёно-синий) — пока грузится Three.js / если WebGL упал. */
function GradientFallback() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "linear-gradient(155deg, #1D9E75 0%, #22A8C0 50%, #2F86DB 100%)",
      }}
    />
  );
}

class GLBoundary extends Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <GradientFallback /> : this.props.children;
  }
}

/** Волнистая «живая» поверхность — две SVG-волны (перёд/зад) едут влево с
 *  разной скоростью, слегка заходя за линию уровня (чтобы не была прямой). */
function LiquidWaves({ surfaceTopPct }: { surfaceTopPct: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0"
      style={{ top: `calc(${surfaceTopPct}% - 8px)`, height: 16 }}
    >
      <svg
        viewBox="0 0 200 16"
        preserveAspectRatio="none"
        className="absolute left-0 top-0 h-full"
        style={{ width: "200%", animation: "parkWaveMove 4.5s linear infinite" }}
      >
        <path
          d="M0 8 Q12.5 4 25 8 T50 8 T75 8 T100 8 T125 8 T150 8 T175 8 T200 8 V16 H0 Z"
          fill="#2F86DB"
          opacity="0.4"
        />
      </svg>
      <svg
        viewBox="0 0 200 16"
        preserveAspectRatio="none"
        className="absolute left-0 top-0 h-full"
        style={{ width: "200%", animation: "parkWaveMove 3s linear infinite" }}
      >
        <path
          d="M0 8 Q12.5 12 25 8 T50 8 T75 8 T100 8 T125 8 T150 8 T175 8 T200 8 V16 H0 Z"
          fill="#22A8C0"
        />
      </svg>
    </div>
  );
}

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

  // Число считается вверх 0 → pct.
  const [shown, setShown] = useState(0);
  const rafRef = useRef<number | null>(null);
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
    <Card className={cn("flex h-full items-center", className)}>
      <style>{`@keyframes parkWaveMove{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          "flex w-full items-center gap-4 text-left",
          onClick ? "cursor-pointer" : "cursor-default",
        )}
      >
        {/* Светлый круг с жидкостью по кольцу */}
        <div
          className="relative shrink-0 overflow-hidden rounded-full ring-1 ring-black/[0.06]"
          style={{
            width: SIZE,
            height: SIZE,
            background: "radial-gradient(circle at 50% 30%, #ffffff, #e9edf2)",
            boxShadow: "inset 0 1px 4px rgba(15,23,42,0.08)",
          }}
        >
          {/* Жидкость — шейдер, обрезан снизу на процент загрузки */}
          <div
            className="absolute inset-0 transition-[clip-path] duration-1000 ease-out"
            style={{ clipPath: `inset(${100 - pct}% 0 0 0)` }}
          >
            <GLBoundary>
              <Suspense fallback={<GradientFallback />}>
                <LiquidGradient />
              </Suspense>
            </GLBoundary>
          </div>

          {/* Волнистая поверхность жидкости */}
          {pct > 0 && pct < 100 && <LiquidWaves surfaceTopPct={100 - pct} />}

          {/* Белый круг по центру → донат-диаграмма, % на белом */}
          <div
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-white"
            style={{
              width: CENTER,
              height: CENTER,
              boxShadow: "0 1px 6px rgba(15,23,42,0.13)",
            }}
          >
            <span className="font-display text-[21px] font-extrabold leading-none tabular-nums text-ink">
              {shown}%
            </span>
            <span className="mt-0.5 text-[7.5px] font-bold uppercase tracking-[0.12em] text-muted-2">
              загрузка
            </span>
          </div>
        </div>

        {/* Подписи справа */}
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-muted">Загрузка парка</div>
          <div className="mt-1 font-display text-[19px] font-extrabold leading-tight text-ink">
            {active}&nbsp;в&nbsp;аренде
          </div>
          <div className="mt-0.5 text-[11px] text-muted-2">
            из {rentable} доступных
          </div>
        </div>
      </button>
    </Card>
  );
}
