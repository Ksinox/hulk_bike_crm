import { Component, Suspense, lazy, useEffect, useRef, useState } from "react";
import { Card } from "./KpiCard";
import { cn } from "@/lib/utils";

const LiquidGradient = lazy(() => import("./LiquidGradient"));

/**
 * Круговая загрузка парка — KPI-карточка-герой. Светлый круг (бело-серый
 * градиент), внутри анимированный градиент @firecms/neat (зелёно-синий,
 * плавно перетекающий) залит снизу на % загрузки. Поверхность жидкости —
 * ВОЛНА (clip-path по синусоиде, поднимается с %), а не прямая линия. По
 * центру белый круг с крупным % → донат-диаграмма. Neat ленив (отдельный
 * чанк) + ErrorBoundary с CSS-градиент-фолбэком.
 */

const SIZE = 100;
const CENTER = 60; // белый круг по центру → донат
const CLIP_ID = "parkLiquidClip";

/** Запасной CSS-градиент (зелёно-синий) — пока грузится Neat / если WebGL упал. */
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

  // Уровень поверхности (в координатах круга 0..SIZE) + волна-синусоида.
  const sY = SIZE - (SIZE * pct) / 100;
  const A = 3.5; // амплитуда волны
  const wavePath = `M 0 ${sY} Q ${SIZE * 0.25} ${sY - A} ${SIZE * 0.5} ${sY} T ${SIZE} ${sY} L ${SIZE} ${SIZE} L 0 ${SIZE} Z`;

  return (
    <Card className={cn("flex h-full items-center", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          "flex w-full items-center gap-4 text-left",
          onClick ? "cursor-pointer" : "cursor-default",
        )}
      >
        {/* Светлый круг с жидкостью */}
        <div
          className="relative shrink-0 overflow-hidden rounded-full ring-1 ring-black/[0.06]"
          style={{
            width: SIZE,
            height: SIZE,
            background: "radial-gradient(circle at 50% 30%, #ffffff, #e9edf2)",
            boxShadow: "inset 0 1px 4px rgba(15,23,42,0.08)",
          }}
        >
          {/* clip-path жидкости — волна на уровне % (поднимается с загрузкой) */}
          <svg width="0" height="0" className="absolute" aria-hidden>
            <defs>
              <clipPath id={CLIP_ID} clipPathUnits="userSpaceOnUse">
                <path d={wavePath} />
              </clipPath>
            </defs>
          </svg>

          {/* Жидкость — Neat-градиент, обрезан волной снизу */}
          <div
            className="absolute inset-0"
            style={{ clipPath: `url(#${CLIP_ID})` }}
          >
            <GLBoundary>
              <Suspense fallback={<GradientFallback />}>
                <LiquidGradient />
              </Suspense>
            </GLBoundary>
          </div>

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
