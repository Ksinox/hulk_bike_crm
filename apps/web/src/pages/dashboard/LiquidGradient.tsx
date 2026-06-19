/**
 * Морфящийся зелёно-синий градиент-наполнитель круга загрузки парка — чистый
 * CSS (без библиотек/three/WebGL/водяных знаков; лёгкий, без лага). Эффект —
 * mesh-градиент из цветовых пятен, которые «плавают» по кругу (анимация
 * background-position). Обрезка по волне-уровню (на % загрузки) живёт в
 * ParkLoadGauge (clip-path). Default-export сохранён ради React.lazy.
 */
export default function LiquidGradient() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <style>{`@keyframes parkLiquidFlow{0%{background-position:0% 0%}25%{background-position:100% 0%}50%{background-position:100% 100%}75%{background-position:0% 100%}100%{background-position:0% 0%}}`}</style>
      <div
        className="absolute inset-[-30%]"
        style={{
          background: [
            "radial-gradient(circle at 25% 25%, #34D399 0%, transparent 45%)",
            "radial-gradient(circle at 80% 30%, #17E7FF 0%, transparent 45%)",
            "radial-gradient(circle at 70% 80%, #2F86DB 0%, transparent 50%)",
            "radial-gradient(circle at 25% 75%, #1D9E75 0%, transparent 50%)",
            "#22A8C0",
          ].join(","),
          backgroundSize: "200% 200%",
          animation: "parkLiquidFlow 9s ease-in-out infinite",
        }}
      />
    </div>
  );
}
