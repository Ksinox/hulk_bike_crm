import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Card } from "./KpiCard";
import { cn } from "@/lib/utils";
import { ElectricMark, PetrolMark } from "@/components/PowerTypeBadge";

const LiquidGradient = lazy(() => import("./LiquidGradient"));
const ElectricGradient = lazy(() => import("./ElectricGradient"));
const LightningStrikes = lazy(() => import("./LightningStrikes"));

/**
 * Круговая загрузка парка — KPI-карточка-герой. Светлый круг, внутри
 * морфящийся градиент, залитый снизу на % загрузки; по центру белый круг с
 * крупным % → донат-диаграмма. Градиент ленив (отдельный чанк) +
 * ErrorBoundary с CSS-градиент-фолбэком.
 *
 * ДВА ХАРАКТЕРА заливки — по типу техники (правка 27.08):
 *  • petrol  — «жидкость»: зелёно-бирюзовый градиент, поверхность из двух
 *    бегущих синусоид (разная длина/скорость/направление → параллакс);
 *  • electro — «энергия»: холодный синий поток, бегущие вверх линии заряда и
 *    вспышки молний, а поверхность — рваная дуга разряда вместо волны.
 * Логика одна, отличаются форма кромки и наполнитель.
 *
 * size  — диаметр круга (десктоп 110, мобила компактнее).
 * layout — "row" (круг + подписи сбоку, десктоп) | "stack" (круг сверху,
 *          подписи под ним по центру — для узкой мобильной колонки).
 */

/** Запасной CSS-градиент — пока грузится наполнитель / если он упал. */
function GradientFallback({ electro }: { electro?: boolean }) {
  return (
    <div
      className="absolute inset-0"
      style={{
        background: electro
          ? "linear-gradient(155deg, #4F46E5 0%, #2563EB 50%, #22D3EE 100%)"
          : "linear-gradient(155deg, #1D9E75 0%, #22A8C0 50%, #2F86DB 100%)",
      }}
    />
  );
}

class GLBoundary extends Component<
  { children: React.ReactNode; electro?: boolean },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <GradientFallback electro={this.props.electro} />
    ) : (
      this.props.children
    );
  }
}

export function ParkLoadGauge({
  percent,
  active,
  rentable,
  activeElectro = 0,
  title = "Загрузка парка",
  tone = "petrol",
  onClick,
  className,
  size = 110,
  layout = "row",
}: {
  percent: number;
  active: number;
  rentable: number;
  /** Пункт 11: сколько из активных — электротранспорт (0 → не показываем). */
  activeElectro?: number;
  /** Правки 2.0, п.4: свой заголовок — «Загрузка парка» / «Электротранспорт». */
  title?: string;
  /** Характер заливки: топливо (жидкость) или заряд (энергия и молнии). */
  tone?: "petrol" | "electro";
  onClick?: () => void;
  className?: string;
  size?: number;
  layout?: "row" | "stack";
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const SIZE = size;
  // Белый круг по центру — 0.66 диаметра (правка 27.08: и сам круг, и
  // «дырка» доната стали крупнее, круг перестал теряться в карточке).
  const CENTER = Math.round(size * 0.66);
  const stack = layout === "stack";
  const electro = tone === "electro";
  /**
   * Имена keyframes уникальны для КАЖДОГО круга. На дашборде их два, а
   * @keyframes — глобальные: при одинаковых именах побеждало последнее
   * объявление, и электро-круг заливался по проценту бензинового (у нас
   * 100 % рисовался уровнем 83 %, из-за чего сверху лезла зубчатая насечка).
   */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const kA = `pkWaveA${uid}`;
  const kB = `pkWaveB${uid}`;

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

  // Уровень поверхности (0..SIZE сверху вниз) на % загрузки. При 100 %
  // кромку уводим ВЫШЕ круга: иначе гребень волны (или зубцы разряда)
  // прорезали верх залитого круга насечкой.
  const full = pct >= 100;
  const sY = full ? -14 : SIZE - (SIZE * pct) / 100;
  // Две «живые» кромки: разная длина/амплитуда/скорость/направление → параллакс.
  // Маска (alpha) по тайлу, бесшовно повторяется по X; уровень sY вшит в
  // кадры анимации mask-position.
  const W1 = 46,
    A1 = 6.5; // дальняя — медленная, влево, основное тело
  const W2 = 30,
    A2 = 4.5; // ближняя — быстрее, вправо, полупрозрачный гребень

  /**
   * Форма кромки. Жидкость — плавная синусоида; энергия — рваная ломаная
   * (разряд). Тайл бесшовный: и левый, и правый край на высоте a.
   */
  const surfacePath = (w: number, a: number, h: number) =>
    electro
      ? `M0 ${a} L${w * 0.125} ${a * 0.45} L${w * 0.25} ${a * 1.35} L${w * 0.375} ${a * 0.35} L${w * 0.5} ${a * 1.1} L${w * 0.625} ${a * 0.3} L${w * 0.75} ${a * 1.4} L${w * 0.875} ${a * 0.5} L${w} ${a} V${h} H0 Z`
      : `M0 ${a} Q${w / 4} 0 ${w / 2} ${a} T${w} ${a} V${h} H0 Z`;

  /**
   * Тайл маски вдвое выше круга. Маска не повторяется по вертикали, а кадры
   * анимации сдвигают её вверх на амплитуду волны — при заливке под 100 %
   * тайла высотой ровно в круг не хватало, и внизу оставалась непрокрашенная
   * полоса (выглядело как «съехало»). Двойная высота закрывает низ всегда.
   */
  const TILE_H = SIZE * 2;

  const surfaceTile = (w: number, a: number) =>
    `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${TILE_H}' preserveAspectRatio='none'><path d='${surfacePath(w, a, TILE_H)}' fill='white'/></svg>`,
    )}")`;

  const surfaceLayer = (w: number, a: number): React.CSSProperties => ({
    WebkitMaskImage: surfaceTile(w, a),
    maskImage: surfaceTile(w, a),
    WebkitMaskRepeat: "repeat-x",
    maskRepeat: "repeat-x",
    WebkitMaskSize: `${w}px ${TILE_H}px`,
    maskSize: `${w}px ${TILE_H}px`,
    // Уровень заливки задан и СТАТИЧНО, не только в кадрах анимации: при
    // отключённой анимации (prefers-reduced-motion, конвейер скриншотов)
    // mask-position падал в 0 0, кромка уезжала под самый верх круга и
    // выглядела зубчатым срезом.
    WebkitMaskPosition: `0 ${sY - a}px`,
    maskPosition: `0 ${sY - a}px`,
  });

  /** Наполнитель круга — жидкость или энергия. */
  const Fill = () => (
    <GLBoundary electro={electro}>
      <Suspense fallback={<GradientFallback electro={electro} />}>
        {electro ? <ElectricGradient /> : <LiquidGradient />}
      </Suspense>
    </GLBoundary>
  );

  /**
   * Заполнено под завязку — «дырка» доната закрашивается в цвет заливки, а
   * текст инвертируется в белый. Иначе на сплошном круге белый центр выглядел
   * чужеродной заплаткой.
   */
  // Заливка переливается, поэтому фиксированный цвет центра с ней не
  // совпадал бы. Делаем «дырку» прозрачной — это и есть ровно тот же цвет в
  // любой момент, а заодно разряды и пузырьки проходят через весь круг.
  const centerBg = full ? "transparent" : "#ffffff";

  return (
    <Card className={cn("flex h-full items-center", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          "w-full text-left",
          stack
            ? "flex flex-col items-center gap-2 text-center"
            : "flex items-center gap-4",
          onClick ? "cursor-pointer" : "cursor-default",
        )}
      >
        {/* Светлый круг с заливкой */}
        <div
          className={cn(
            "relative shrink-0 overflow-hidden rounded-full ring-1",
            electro ? "ring-sky-500/15" : "ring-black/[0.06]",
          )}
          style={{
            width: SIZE,
            height: SIZE,
            background: electro
              ? "radial-gradient(circle at 50% 30%, #ffffff, #e6ecf6)"
              : "radial-gradient(circle at 50% 30%, #ffffff, #e9edf2)",
            boxShadow: electro
              ? "inset 0 1px 4px rgba(30,58,138,0.10)"
              : "inset 0 1px 4px rgba(15,23,42,0.08)",
          }}
        >
          {/* Бегущая кромка — mask-position-x скроллит тайл (уровень sY вшит
              в кадры по Y). Разные направления → слои расходятся. */}
          <style>{`@keyframes ${kA}{from{-webkit-mask-position:0 ${sY - A1}px;mask-position:0 ${sY - A1}px}to{-webkit-mask-position:-${W1}px ${sY - A1}px;mask-position:-${W1}px ${sY - A1}px}}@keyframes ${kB}{from{-webkit-mask-position:0 ${sY - A2}px;mask-position:0 ${sY - A2}px}to{-webkit-mask-position:${W2}px ${sY - A2}px;mask-position:${W2}px ${sY - A2}px}}`}</style>

          {/* Дальний слой — основное тело (у электро в нём живут молнии) */}
          <div
            className="absolute inset-0"
            style={{
              ...surfaceLayer(W1, A1),
              animation: `${kA} ${electro ? "3.2s" : "5s"} linear infinite`,
            }}
          >
            <Fill />
          </div>

          {/* Ближний слой — полупрозрачный гребень для глубины/параллакса */}
          <div
            className="absolute inset-0"
            style={{
              ...surfaceLayer(W2, A2),
              opacity: 0.5,
              animation: `${kB} ${electro ? "2.1s" : "3.4s"} linear infinite`,
            }}
          >
            <Fill />
          </div>

          {/* Круг по центру → донат-диаграмма */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: CENTER,
              height: CENTER,
              background: centerBg,
              boxShadow: full
                ? "inset 0 0 0 1.5px rgba(255,255,255,0.22)"
                : "0 1px 6px rgba(15,23,42,0.13)",
            }}
          />

          {/* Молнии бьют поверх диска (в кольце они читались бы как иконка),
              но обрезаны по уровню заливки — той же маской, что и энергия. */}
          {electro && (
            <div
              className="absolute inset-0"
              style={{
                ...surfaceLayer(W1, A1),
                animation: `${kA} 3.2s linear infinite`,
              }}
            >
              <Suspense fallback={null}>
                <LightningStrikes />
              </Suspense>
            </div>
          )}

          {/* Текст — поверх всего, чтобы разряды по нему не били */}
          <div
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center"
            style={{ width: CENTER, height: CENTER }}
          >
            <span
              className={cn(
                "font-display font-extrabold leading-none tabular-nums",
                full ? "text-white" : "text-ink",
              )}
              style={{
                fontSize: Math.round(SIZE * 0.2),
                textShadow: full ? "0 1px 6px rgba(15,23,42,0.4)" : undefined,
              }}
            >
              {shown}%
            </span>
            <span
              className={cn(
                "mt-0.5 font-bold uppercase tracking-[0.12em]",
                full ? "text-white/75" : "text-muted-2",
              )}
              style={{ fontSize: Math.max(7, Math.round(SIZE * 0.072)) }}
            >
              загрузка
            </span>
          </div>
        </div>

        {/* Подписи: справа (row) или под кругом по центру (stack) */}
        <div className={cn("min-w-0", stack && "flex flex-col items-center")}>
          {/* Заголовок с меткой типа топлива: в stack-раскладке два чипса
              стоят рядом, и без метки их не различить. */}
          <div
            className={cn(
              "flex items-center gap-1.5 font-medium text-muted",
              stack ? "justify-center text-[11px]" : "text-[12px]",
              !stack && !electro && "text-[12px]",
            )}
          >
            {electro ? (
              <ElectricMark size="sm" />
            ) : stack ? (
              <PetrolMark size="sm" />
            ) : null}
            {title}
          </div>
          <div
            className={cn(
              "font-display font-extrabold leading-tight text-ink",
              stack ? "text-[15px]" : "mt-1 text-[19px]",
            )}
          >
            {active}&nbsp;в&nbsp;аренде
          </div>
          <div className="mt-0.5 text-[11px] text-muted-2">
            из {rentable} {electro ? "в парке" : "доступных"}
          </div>
          {/* Пункт 11: разделение активных на скутеры и электро. */}
          {activeElectro > 0 && (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold">
              <PetrolMark size="sm" />
              <span className="text-ink-2">{active - activeElectro}</span>
              <span className="text-muted-2">·</span>
              <ElectricMark size="sm" />
              <span className="text-emerald-700">{activeElectro}</span>
            </div>
          )}
        </div>
      </button>
    </Card>
  );
}
