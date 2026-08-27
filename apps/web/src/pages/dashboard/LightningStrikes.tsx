/**
 * Разряды молний для круга загрузки электротранспорта.
 *
 * Сделано по тому, как молния устроена на самом деле (NOAA / Environment
 * Canada), — заказчик просил именно настоящий эффект, а не иконку:
 *
 *  1. СТУПЕНЧАТЫЙ ЛИДЕР — тусклый канал идёт сверху вниз ступенями и ветвится
 *     в стороны. Его почти не видно.
 *  2. ВОЗВРАТНЫЙ УДАР — как только канал замкнулся, по нему СНИЗУ ВВЕРХ бьёт
 *     яркая вспышка. Это и есть та молния, которую мы видим.
 *  3. МЕРЦАНИЕ — несколько возвратных ударов подряд с промежутком 1/20–1/10
 *     секунды; глаз различает их как мигание.
 *  4. Затухание, пауза — и следующий разряд бьёт уже в другом месте.
 *
 * Технически: пути с pathLength=1 и анимацией stroke-dashoffset. У лидера
 * offset идёт −1 → 0 (прорисовка от верхнего конца вниз), у возвратного удара
 * 1 → 0 (снизу вверх). Под яркими путями лежат размытые копии — свечение.
 *
 * Слой рисуется ПОВЕРХ центрального круга: иначе разряд помещался бы только в
 * узкое кольцо и читался бы как иконка, а не как молния. Текст — выше слоя.
 */

/** Канал разряда: снизу (y=100) вверх (y≈4), с изломами-ступенями. */
const TRUNK = "M50 100 L43 82 L55 73 L45 55 L58 45 L47 24 L53 4";
/** Ответвления — отходят от изломов канала в стороны и обрываются. */
const BRANCHES = [
  "M45 55 L29 46 L33 31",
  "M58 45 L73 40 L68 25",
  "M43 82 L31 76 L34 66",
];

function Strike({
  transform,
  delay,
  dur,
  width,
}: {
  transform: string;
  delay: number;
  dur: number;
  width: number;
}) {
  const leader = (extra: number) => ({
    animation: `pkLeader ${dur}s linear infinite`,
    animationDelay: `${delay + extra}s`,
  });
  const stroke = (extra: number) => ({
    animation: `pkReturn ${dur}s linear infinite`,
    animationDelay: `${delay + extra}s`,
  });
  const common = {
    pathLength: 1,
    strokeDasharray: 1,
    fill: "none" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <g transform={transform}>
      {/* 1. Ступенчатый лидер — тусклый, идёт сверху вниз, ветвится */}
      <path
        {...common}
        d={TRUNK}
        stroke="#DBEAFE"
        strokeWidth={width * 0.5}
        style={leader(0)}
      />
      {BRANCHES.map((d, i) => (
        <path
          {...common}
          key={`l-${d}`}
          d={d}
          stroke="#DBEAFE"
          strokeWidth={width * 0.4}
          style={leader(0.05 + i * 0.03)}
        />
      ))}

      {/* 2. Возвратный удар — яркая вспышка снизу вверх по тому же каналу */}
      <path
        {...common}
        d={TRUNK}
        stroke="#BAE6FD"
        strokeWidth={width * 3.6}
        opacity={0.55}
        filter="url(#pkGlow)"
        style={stroke(0)}
      />
      <path
        {...common}
        d={TRUNK}
        stroke="#ffffff"
        strokeWidth={width}
        style={stroke(0)}
      />
      {/* Ветки вспыхивают следом за каналом и обрываются */}
      {BRANCHES.map((d, i) => (
        <g key={`r-${d}`}>
          <path
            {...common}
            d={d}
            stroke="#BAE6FD"
            strokeWidth={width * 2.2}
            opacity={0.4}
            filter="url(#pkGlow)"
            style={stroke(0.04 + i * 0.02)}
          />
          <path
            {...common}
            d={d}
            stroke="#ffffff"
            strokeWidth={width * 0.65}
            opacity={0.9}
            style={stroke(0.04 + i * 0.02)}
          />
        </g>
      ))}
    </g>
  );
}

export default function LightningStrikes() {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {/* Цикл 4.2 с. Лидер ползёт вниз 0–7%, возвратный удар бьёт на 7–9%,
          дальше три мерцания (отдельные возвратные удары) и затухание. */}
      <style>{`@keyframes pkLeader{0%{stroke-dashoffset:-1;opacity:0}1%{opacity:.5}7%{stroke-dashoffset:0;opacity:.55}9%{opacity:0}100%{opacity:0;stroke-dashoffset:-1}}@keyframes pkReturn{0%,6.9%{stroke-dashoffset:1;opacity:0}7%{opacity:1}9%{stroke-dashoffset:0;opacity:1}10.5%{opacity:.12}12%{opacity:.95}13.5%{opacity:.1}15%{opacity:.8}17%{opacity:.06}19%{opacity:.45}23%{opacity:0;stroke-dashoffset:0}100%{opacity:0;stroke-dashoffset:1}}`}</style>
      <defs>
        <filter id="pkGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.8" />
        </filter>
      </defs>
      {/* Бьют вразнобой и каждый раз в другом месте круга */}
      <Strike transform="translate(0 0)" delay={0} dur={4.2} width={1.6} />
      <Strike
        transform="translate(-27 6) scale(.74) rotate(-9 50 60)"
        delay={1.5}
        dur={4.2}
        width={1.9}
      />
      <Strike
        transform="translate(29 10) scale(.66) rotate(11 50 60)"
        delay={2.9}
        dur={4.2}
        width={2.1}
      />
    </svg>
  );
}
