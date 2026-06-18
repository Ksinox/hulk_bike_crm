import { Component, Suspense, lazy, useEffect, useRef, useState } from "react";
import { Card } from "./KpiCard";
import { cn } from "@/lib/utils";

const LiquidGradient = lazy(() => import("./LiquidGradient"));

/**
 * Круговая загрузка парка — KPI-карточка-герой (заказчик: вместо «Новых
 * заявок», первой в ряду). Тёмный «стеклянный» круг, внутри — анимированный
 * градиент (ShaderGradient), залитый СНИЗУ на процент загрузки (как жидкость
 * в баке). В центре крупный % (count-up), рядом «N в аренде / из M доступных».
 * Three.js ленив (LiquidGradient) + ErrorBoundary: если WebGL недоступен,
 * падаем на статичный CSS-градиент — карточка всё равно красивая.
 */

const SIZE = 100;

/** Запасной CSS-градиент: показывается пока грузится чанк Three.js и если
 *  WebGL упал. Без тяжёлых зависимостей. */
function GradientFallback() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "linear-gradient(155deg, #5606ff 0%, #8b4bff 45%, #fe8989 100%)",
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
    if (this.state.failed) return <GradientFallback />;
    return this.props.children;
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

  return (
    <Card className={cn("flex items-center", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          "flex w-full items-center gap-4 text-left",
          onClick ? "cursor-pointer" : "cursor-default",
        )}
      >
        {/* «Стеклянный» круг с жидкостью */}
        <div
          className="relative shrink-0 overflow-hidden rounded-full ring-1 ring-black/10"
          style={{
            width: SIZE,
            height: SIZE,
            background: "radial-gradient(circle at 50% 32%, #2a2540, #121019)",
            boxShadow: "inset 0 2px 10px rgba(0,0,0,0.45)",
          }}
        >
          {/* Жидкость — градиент, обрезанный снизу на процент загрузки */}
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

          {/* Линия поверхности жидкости */}
          {pct > 0 && pct < 100 && (
            <div
              className="absolute inset-x-0 h-px bg-white/35"
              style={{ top: `${100 - pct}%` }}
            />
          )}

          {/* Блик сверху — стеклянность */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(120% 70% at 50% -10%, rgba(255,255,255,0.25), transparent 55%)",
            }}
          />

          {/* Процент по центру */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="font-display text-[26px] font-extrabold leading-none tabular-nums text-white"
              style={{ textShadow: "0 1px 7px rgba(0,0,0,0.5)" }}
            >
              {shown}%
            </span>
            <span
              className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-white/80"
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.45)" }}
            >
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
