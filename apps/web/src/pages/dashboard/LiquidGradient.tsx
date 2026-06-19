import { useEffect, useRef } from "react";
import { NeatGradient, type NeatConfig } from "@firecms/neat";

/**
 * Анимированный градиент-наполнитель круга загрузки парка на @firecms/neat
 * (заменил ShaderGradient/three+react-three-fiber — тот тормозил и тянул
 * тяжёлый стек). Neat сам по себе на WebGL, плавно перетекающие фирменные
 * зелёно-синие цвета. Заливает весь холст; обрезка по «волне»-уровню (на %
 * загрузки) живёт в ParkLoadGauge (clip-path). Грузится лениво (React.lazy) —
 * Neat уезжает в отдельный чанк.
 */

const NEAT_CONFIG: NeatConfig = {
  colors: [
    { color: "#1D9E75", enabled: true }, // фирменный зелёный
    { color: "#17E7FF", enabled: true }, // циан
    { color: "#2F86DB", enabled: true }, // фирменный синий
    { color: "#22C3A6", enabled: true }, // бирюза
    { color: "#34D399", enabled: true }, // светло-зелёный
  ],
  speed: 4,
  horizontalPressure: 3,
  verticalPressure: 4,
  waveFrequencyX: 2.5,
  waveFrequencyY: 2.5,
  waveAmplitude: 6,
  shadows: 6,
  highlights: 4,
  colorBrightness: 1.05,
  colorSaturation: 3,
  wireframe: false,
  colorBlending: 6,
  backgroundColor: "#1D9E75",
  backgroundAlpha: 1,
  // Маленький холст (≈100px) — низкое разрешение хватает и не грузит GPU.
  resolution: 0.5,
  shapeType: "plane",
};

export default function LiquidGradient() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const gradient = new NeatGradient({ ref: ref.current, ...NEAT_CONFIG });
    return () => gradient.destroy();
  }, []);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}
