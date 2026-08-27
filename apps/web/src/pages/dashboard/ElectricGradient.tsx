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

/**
 * Одна молния. Светится ПОСТОЯННО (базовая прозрачность) и периодически
 * вспыхивает — иначе на статичном кадре круг выглядит просто синим, без
 * намёка на электричество.
 */
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
        filter: "drop-shadow(0 0 6px rgba(191,219,254,0.95))",
      }}
    >
      <path
        d="M13.8 1.4 4.3 13.9h5.5L8.3 22.6l9.5-12.5h-5.6z"
        fill="#ffffff"
        stroke="rgba(219,234,254,0.9)"
        strokeWidth="0.8"
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
      <style>{`@keyframes pkEnergyFlow{0%{background-position:0% 0%}25%{background-position:100% 0%}50%{background-position:100% 100%}75%{background-position:0% 100%}100%{background-position:0% 0%}}@keyframes pkEnergyScan{from{background-position:0 0}to{background-position:0 -22px}}@keyframes pkEnergyRise{0%{transform:translateY(70%);opacity:0}30%{opacity:.6}100%{transform:translateY(-130%);opacity:0}}@keyframes pkBolt{0%,100%{opacity:.34;transform:scale(.94)}40%{opacity:.5;transform:scale(.97)}58%{opacity:1;transform:scale(1.06)}63%{opacity:.36;transform:scale(.96)}72%{opacity:.95;transform:scale(1.03)}80%{opacity:.38;transform:scale(.95)}}`}</style>

      {/* Тело: глубокий синий энергетический поток (холоднее «жидкости») */}
      <div
        className="absolute inset-[-30%]"
        style={{
          background: [
            "radial-gradient(circle at 28% 22%, #38BDF8 0%, transparent 42%)",
            "radial-gradient(circle at 78% 32%, #22D3EE 0%, transparent 40%)",
            "radial-gradient(circle at 68% 82%, #1E3A8A 0%, transparent 55%)",
            "radial-gradient(circle at 20% 78%, #4338CA 0%, transparent 52%)",
            "#1D4ED8",
          ].join(","),
          backgroundSize: "200% 200%",
          animation: "pkEnergyFlow 7s ease-in-out infinite",
        }}
      />

      {/* Тонкие линии заряда, бегущие вверх */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.11) 0 1px, transparent 1px 11px)",
          backgroundSize: "100% 22px",
          animation: "pkEnergyScan 1.7s linear infinite",
          mixBlendMode: "screen",
        }}
      />

      {/* Волна заряда, поднимающаяся снизу вверх — «энергия копится» */}
      <div
        className="absolute inset-x-0 h-1/2"
        style={{
          bottom: 0,
          background:
            "linear-gradient(0deg, transparent 0%, rgba(186,230,253,0.55) 55%, transparent 100%)",
          filter: "blur(5px)",
          animation: "pkEnergyRise 2.8s ease-out infinite",
          mixBlendMode: "screen",
        }}
      />

      {bolts && (
        <>
          {/* Разнесены и по высоте: при неполной заливке нижние всё равно
              попадают в видимую часть круга. */}
          <Bolt left={15} top={46} size={18} delay={0} dur={3.1} />
          <Bolt left={57} top={28} size={13} delay={1.4} dur={2.6} />
          <Bolt left={37} top={68} size={12} delay={2.3} dur={3.6} />
        </>
      )}
    </div>
  );
}
