/**
 * Электрический наполнитель круга загрузки электротранспорта — пара к
 * LiquidGradient. У бензиновой техники в круге плещется «топливо», у электро
 * логика другая: копится ЭНЕРГИЯ. Поэтому вместо мягкого зелёно-бирюзового
 * градиента здесь холодный синий поток, по которому бегут линии заряда, а
 * внутри вспыхивают разряды-молнии.
 *
 * Чистый CSS + inline-SVG: без WebGL и библиотек, чтобы карточка оставалась
 * лёгкой (компонент грузится через React.lazy отдельным чанком).
 *
 * bolts — рисовать ли молнии. Наполнитель рендерится дважды (тело волны и
 * полупрозрачный гребень); молнии нужны только в теле, иначе двоятся.
 */

/** Одна вспышка-молния: мигает не в такт соседним (свой delay). */
function Bolt({
  left,
  top,
  size,
  delay,
  dur,
}: {
  left: number;
  top: number;
  size: number;
  delay: number;
  dur: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="absolute"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        animation: `pkBolt ${dur}s linear infinite`,
        animationDelay: `${delay}s`,
        filter: "drop-shadow(0 0 5px rgba(186,230,253,0.95))",
      }}
    >
      <path
        d="M13.8 1.4 4.3 13.9h5.5L8.3 22.6l9.5-12.5h-5.6z"
        fill="#ffffff"
      />
    </svg>
  );
}

export default function ElectricGradient({
  bolts = false,
}: {
  bolts?: boolean;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <style>{`@keyframes pkEnergyFlow{0%{background-position:0% 0%}25%{background-position:100% 0%}50%{background-position:100% 100%}75%{background-position:0% 100%}100%{background-position:0% 0%}}@keyframes pkEnergyScan{from{background-position:0 0}to{background-position:0 -26px}}@keyframes pkBolt{0%,70%,100%{opacity:0;transform:scale(.85)}72%{opacity:1;transform:scale(1)}76%{opacity:.12;transform:scale(.96)}80%{opacity:.9;transform:scale(1.05)}86%{opacity:0;transform:scale(.9)}}`}</style>

      {/* Тело: синий энергетический поток (заметно холоднее «жидкости») */}
      <div
        className="absolute inset-[-30%]"
        style={{
          background: [
            "radial-gradient(circle at 25% 25%, #60A5FA 0%, transparent 45%)",
            "radial-gradient(circle at 80% 30%, #22D3EE 0%, transparent 45%)",
            "radial-gradient(circle at 70% 80%, #1D4ED8 0%, transparent 52%)",
            "radial-gradient(circle at 25% 78%, #4F46E5 0%, transparent 50%)",
            "#2563EB",
          ].join(","),
          backgroundSize: "200% 200%",
          animation: "pkEnergyFlow 7s ease-in-out infinite",
        }}
      />

      {/* Линии заряда, бегущие вверх — «энергия копится» */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.18) 0 1px, transparent 1px 13px)",
          backgroundSize: "100% 26px",
          animation: "pkEnergyScan 1.5s linear infinite",
          mixBlendMode: "screen",
        }}
      />

      {bolts && (
        <>
          <Bolt left={16} top={30} size={17} delay={0} dur={3.1} />
          <Bolt left={58} top={16} size={13} delay={1.4} dur={2.6} />
          <Bolt left={38} top={58} size={11} delay={2.3} dur={3.6} />
        </>
      )}
    </div>
  );
}
