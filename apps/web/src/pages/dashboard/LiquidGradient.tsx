/**
 * Морфящийся зелёно-синий градиент-наполнитель круга загрузки парка — чистый
 * CSS (без библиотек/three/WebGL/водяных знаков; лёгкий, без лага). Эффект —
 * mesh-градиент из цветовых пятен, которые «плавают» по кругу (анимация
 * background-position), плюс поднимающиеся со дна пузырьки: без них заливка
 * читается как просто цветное кольцо, а не как жидкость.
 *
 * Обрезка по уровню (на % загрузки) и бегущие волны живут в ParkLoadGauge
 * (alpha-маска). Default-export сохранён ради React.lazy.
 */

/** Пузырьки: разный размер, скорость и снос вбок — иначе видно «строй». */
const BUBBLES = [
  { left: 22, size: 7, dur: 5.2, delay: 0, drift: 5 },
  { left: 38, size: 4, dur: 4.1, delay: 1.6, drift: -4 },
  { left: 52, size: 9, dur: 6.4, delay: 0.7, drift: 6 },
  { left: 64, size: 5, dur: 4.6, delay: 2.4, drift: -5 },
  { left: 78, size: 6, dur: 5.6, delay: 3.3, drift: 4 },
  { left: 30, size: 3, dur: 3.6, delay: 2.9, drift: 3 },
  { left: 70, size: 3.5, dur: 4.0, delay: 1.1, drift: -3 },
];

export default function LiquidGradient() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <style>{`@keyframes parkLiquidFlow{0%{background-position:0% 0%}25%{background-position:100% 0%}50%{background-position:100% 100%}75%{background-position:0% 100%}100%{background-position:0% 0%}}@keyframes pkBubble{0%{transform:translate(0,0) scale(.7);opacity:0}12%{opacity:.85}70%{opacity:.7}100%{transform:translate(var(--pk-drift),-115%) scale(1.15);opacity:0}}`}</style>
      <div
        className="absolute inset-[-30%]"
        style={{
          background: [
            // Палитра держится в зелёно-бирюзовом: синее пятно убрано —
            // в своей фазе градиент уплывал в синий и путался с электро.
            "radial-gradient(circle at 25% 25%, #34D399 0%, transparent 45%)",
            "radial-gradient(circle at 80% 30%, #5EEAD4 0%, transparent 45%)",
            "radial-gradient(circle at 70% 80%, #0E9F8A 0%, transparent 50%)",
            "radial-gradient(circle at 25% 75%, #1D9E75 0%, transparent 50%)",
            "#16B8A6",
          ].join(","),
          backgroundSize: "200% 200%",
          animation: "parkLiquidFlow 9s ease-in-out infinite",
        }}
      />

      {/* Пузырьки со дна: светлые, полупрозрачные, с бликом сверху */}
      {BUBBLES.map((b) => (
        <span
          key={b.left}
          className="absolute rounded-full"
          style={
            {
              left: `${b.left}%`,
              bottom: "-6%",
              width: `${b.size}%`,
              height: `${b.size}%`,
              background:
                "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.45) 45%, rgba(255,255,255,0.10) 75%, transparent 100%)",
              boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.35)",
              "--pk-drift": `${b.drift}px`,
              animation: `pkBubble ${b.dur}s ease-in infinite`,
              animationDelay: `${b.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
