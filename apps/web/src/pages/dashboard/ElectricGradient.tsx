/**
 * Электрический наполнитель круга загрузки электротранспорта — пара к
 * LiquidGradient. У бензиновой техники в круге плещется «топливо», у электро
 * логика другая: копится ЭНЕРГИЯ. Поэтому вместо мягкого зелёно-бирюзового
 * градиента здесь холодный синий поток, по которому бегут линии заряда.
 *
 * Чистый CSS + inline-SVG: без WebGL и библиотек, чтобы карточка оставалась
 * лёгкой (компонент грузится через React.lazy отдельным чанком).
 */
export default function ElectricGradient() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <style>{`@keyframes pkEnergyFlow{0%{background-position:0% 0%}25%{background-position:100% 0%}50%{background-position:100% 100%}75%{background-position:0% 100%}100%{background-position:0% 0%}}@keyframes pkEnergyScan{from{background-position:0 0}to{background-position:0 -22px}}@keyframes pkEnergyRise{0%{transform:translateY(70%);opacity:0}30%{opacity:.6}100%{transform:translateY(-130%);opacity:0}}`}</style>

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
    </div>
  );
}
