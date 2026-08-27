/**
 * Разряды молний для круга загрузки электротранспорта.
 *
 * Сделано по тому, как молния устроена на самом деле (NOAA / Environment
 * Canada), — заказчик просил настоящий эффект, а не иконку:
 *
 *  1. СТУПЕНЧАТЫЙ ЛИДЕР — тусклый канал идёт сверху вниз ступенями и ветвится.
 *     Его почти не видно.
 *  2. ВОЗВРАТНЫЙ УДАР — как только канал замкнулся, по нему СНИЗУ ВВЕРХ бьёт
 *     яркая вспышка. Это и есть та молния, которую мы видим.
 *  3. МЕРЦАНИЕ — несколько возвратных ударов подряд с промежутком 1/20–1/10
 *     секунды; глаз различает их как мигание.
 *  4. Затухание, пауза — и следующий разряд бьёт уже в другом месте.
 *
 * Два приёма, без которых разряд выглядел «трещинами на стекле»:
 *  • канал СУЖАЕТСЯ кверху — он разбит на три сегмента с убывающей толщиной,
 *    и они прорисовываются снизу вверх по очереди (заодно это и есть рост
 *    разряда);
 *  • у каждой линии два ореола свечения (ближний плотный и дальний мягкий) —
 *    именно свечение отличает молнию от простой белой черты.
 *
 * Технически: пути с pathLength=1 и анимацией stroke-dashoffset. У лидера
 * offset идёт −1 → 0 (прорисовка сверху вниз), у возвратного удара 1 → 0.
 *
 * Слой рисуется ПОВЕРХ центрального круга: в узком кольце разряд читался бы
 * иконкой. Текст — выше слоя.
 */

/** Канал, снизу вверх, тремя сегментами: чем выше — тем тоньше. */
const TRUNK = [
  { d: "M50 92 L46 79 L54 71", w: 1.5 },
  { d: "M54 71 L47 59 L55 49", w: 1.05 },
  { d: "M55 49 L49 36", w: 0.7 },
];
/** Ответвления — короткие, отходят от изломов канала и обрываются. */
const BRANCHES = [
  { d: "M47 59 L38 53 L40 45", w: 0.6 },
  { d: "M54 71 L61 66 L59 59", w: 0.55 },
];

function Bolt({
  d,
  w,
  scale,
  delay,
  dur,
  leader,
}: {
  d: string;
  w: number;
  scale: number;
  delay: number;
  dur: number;
  leader?: boolean;
}) {
  const common = {
    d,
    pathLength: 1,
    strokeDasharray: 1,
    fill: "none" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: {
      animation: `${leader ? "pkLeader" : "pkReturn"} ${dur}s linear infinite`,
      animationDelay: `${delay}s`,
    },
  };
  if (leader) {
    return <path {...common} stroke="#DBEAFE" strokeWidth={w * scale * 0.45} />;
  }
  return (
    <>
      {/* Дальний мягкий ореол */}
      <path
        {...common}
        stroke="#7DD3FC"
        strokeWidth={w * scale * 7}
        opacity={0.22}
        filter="url(#pkGlowFar)"
      />
      {/* Ближний плотный ореол */}
      <path
        {...common}
        stroke="#BAE6FD"
        strokeWidth={w * scale * 3}
        opacity={0.6}
        filter="url(#pkGlowNear)"
      />
      {/* Ядро разряда */}
      <path {...common} stroke="#ffffff" strokeWidth={w * scale} />
    </>
  );
}

function Strike({
  transform,
  delay,
  dur,
  scale,
}: {
  transform: string;
  delay: number;
  dur: number;
  scale: number;
}) {
  return (
    <g transform={transform}>
      {/* Лидер: тускло, сверху вниз */}
      {TRUNK.map((s, i) => (
        <Bolt
          key={`l${i}`}
          d={s.d}
          w={s.w}
          scale={scale}
          dur={dur}
          delay={delay + (TRUNK.length - 1 - i) * 0.04}
          leader
        />
      ))}
      {/* Возвратный удар: сегменты вспыхивают снизу вверх → канал «растёт» */}
      {TRUNK.map((s, i) => (
        <Bolt
          key={`t${i}`}
          d={s.d}
          w={s.w}
          scale={scale}
          dur={dur}
          delay={delay + i * 0.035}
        />
      ))}
      {BRANCHES.map((b, i) => (
        <Bolt
          key={`b${i}`}
          d={b.d}
          w={b.w}
          scale={scale}
          dur={dur}
          delay={delay + 0.07 + i * 0.03}
        />
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
      {/* Цикл 5 с. Лидер ползёт вниз 0–6%, возвратный удар бьёт на 6–8%,
          дальше мерцание из нескольких ударов и затухание к 20%. Разряды
          разнесены по времени так, чтобы одновременно бил только один. */}
      <style>{`@keyframes pkLeader{0%{stroke-dashoffset:-1;opacity:0}1%{opacity:.45}6%{stroke-dashoffset:0;opacity:.5}8%{opacity:0}100%{opacity:0;stroke-dashoffset:-1}}@keyframes pkReturn{0%,5.9%{stroke-dashoffset:1;opacity:0}6%{opacity:1}8%{stroke-dashoffset:0;opacity:1}9.5%{opacity:.1}11%{opacity:.9}12.5%{opacity:.08}14%{opacity:.7}16%{opacity:.05}18%{opacity:.35}21%{opacity:0;stroke-dashoffset:0}100%{opacity:0;stroke-dashoffset:1}}`}</style>
      <defs>
        <filter id="pkGlowNear" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <filter id="pkGlowFar" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      {/* Бьют по очереди и каждый раз в другом месте круга */}
      <Strike transform="translate(2 2)" delay={0} dur={5} scale={1} />
      <Strike
        transform="translate(-24 4) rotate(-10 50 60)"
        delay={1.7}
        dur={5}
        scale={0.85}
      />
      <Strike
        transform="translate(25 6) rotate(12 50 60)"
        delay={3.4}
        dur={5}
        scale={0.8}
      />
    </svg>
  );
}
