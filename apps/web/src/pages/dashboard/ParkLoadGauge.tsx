import { Component, Suspense, lazy, useEffect, useRef, useState } from "react";
import { Card } from "./KpiCard";
import { cn } from "@/lib/utils";

const LiquidGradient = lazy(() => import("./LiquidGradient"));

/**
 * Круговая загрузка парка — KPI-карточка-герой. Светлый круг (бело-серый
 * градиент), внутри морфящийся зелёно-синий градиент (LiquidGradient) залит
 * снизу на % загрузки. Поверхность — ДВЕ БЕГУЩИЕ ВОЛНЫ (alpha-маска по
 * тайлу-синусоиде, mask-position-x анимируется; разная длина/скорость/
 * направление → параллакс «живой жидкости»), а не статичная линия. По центру
 * белый круг с крупным % → донат-диаграмма. Градиент ленив (отдельный чанк) +
 * ErrorBoundary с CSS-градиент-фолбэком.
 */

const SIZE = 100;
const CENTER = 60; // белый круг по центру → донат

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

  // Уровень поверхности жидкости (0..SIZE сверху вниз) на % загрузки.
  const sY = SIZE - (SIZE * pct) / 100;
  // Две «живые» волны: разная длина/амплитуда/скорость/направление → параллакс.
  // Маска (alpha) по тайлу-синусоиде, бесшовно повторяется по X; уровень sY
  // вшит в кадры анимации mask-position.
  const W1 = 48,
    A1 = 4.5; // дальняя волна — медленная, влево, основное тело
  const W2 = 32,
    A2 = 3; // ближняя волна — быстрее, вправо, полупрозрачный гребень
  const waveTile = (w: number, a: number) =>
    `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${SIZE}' preserveAspectRatio='none'><path d='M0 ${a} Q${w / 4} 0 ${w / 2} ${a} T${w} ${a} V${SIZE} H0 Z' fill='white'/></svg>`,
    )}")`;
  const waveLayer = (w: number, a: number): React.CSSProperties => ({
    WebkitMaskImage: waveTile(w, a),
    maskImage: waveTile(w, a),
    WebkitMaskRepeat: "repeat-x",
    maskRepeat: "repeat-x",
    WebkitMaskSize: `${w}px ${SIZE}px`,
    maskSize: `${w}px ${SIZE}px`,
  });

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
          {/* Бегущие волны — mask-position-x скроллит тайл-синусоиду (уровень
              sY вшит в кадры по Y). Разные направления → волны расходятся. */}
          <style>{`@keyframes pkWaveA{from{-webkit-mask-position:0 ${sY - A1}px;mask-position:0 ${sY - A1}px}to{-webkit-mask-position:-${W1}px ${sY - A1}px;mask-position:-${W1}px ${sY - A1}px}}@keyframes pkWaveB{from{-webkit-mask-position:0 ${sY - A2}px;mask-position:0 ${sY - A2}px}to{-webkit-mask-position:${W2}px ${sY - A2}px;mask-position:${W2}px ${sY - A2}px}}`}</style>

          {/* Дальняя волна — основное тело жидкости */}
          <div
            className="absolute inset-0"
            style={{ ...waveLayer(W1, A1), animation: "pkWaveA 5s linear infinite" }}
          >
            <GLBoundary>
              <Suspense fallback={<GradientFallback />}>
                <LiquidGradient />
              </Suspense>
            </GLBoundary>
          </div>

          {/* Ближняя волна — полупрозрачный гребень для глубины/параллакса */}
          <div
            className="absolute inset-0"
            style={{
              ...waveLayer(W2, A2),
              opacity: 0.5,
              animation: "pkWaveB 3.4s linear infinite",
            }}
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
