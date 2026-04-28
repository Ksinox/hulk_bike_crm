/**
 * Схематичные образцы для шагов с фотографиями.
 * Показываются клиенту над кнопкой «Сфотографировать» — чтобы было
 * понятно как должен выглядеть кадр.
 *
 * Рисуем в SVG, без растровых assets — чтобы не тащить картинки в бандл.
 */

export function PassportMainSample() {
  return (
    <svg
      viewBox="0 0 240 160"
      className="h-auto w-full max-w-[300px]"
      role="img"
      aria-label="Паспорт — главный разворот"
    >
      {/* Внешняя рамка — паспорт развёрнут */}
      <rect x="6" y="10" width="228" height="140" rx="8" fill="#fff" stroke="#94a3b8" strokeWidth="2" />
      {/* Корешок по центру */}
      <line x1="120" y1="14" x2="120" y2="146" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
      {/* Левая страница: фото клиента */}
      <rect x="18" y="22" width="60" height="80" rx="4" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" />
      <circle cx="48" cy="50" r="11" fill="#94a3b8" />
      <path d="M30 92 q18 -22 36 0" fill="#94a3b8" />
      {/* Левая страница: текст под фото */}
      <line x1="18" y1="112" x2="78" y2="112" stroke="#94a3b8" strokeWidth="2" />
      <line x1="18" y1="120" x2="68" y2="120" stroke="#94a3b8" strokeWidth="2" />
      <line x1="18" y1="128" x2="74" y2="128" stroke="#94a3b8" strokeWidth="2" />
      {/* Правая страница: серия/номер сверху и блоки текста */}
      <text x="180" y="34" textAnchor="middle" fontSize="10" fill="#dc2626" fontWeight="700">
        1234 567890
      </text>
      <line x1="130" y1="50" x2="222" y2="50" stroke="#94a3b8" strokeWidth="2" />
      <line x1="130" y1="60" x2="218" y2="60" stroke="#94a3b8" strokeWidth="2" />
      <line x1="130" y1="74" x2="222" y2="74" stroke="#94a3b8" strokeWidth="2" />
      <line x1="130" y1="84" x2="210" y2="84" stroke="#94a3b8" strokeWidth="2" />
      <line x1="130" y1="98" x2="222" y2="98" stroke="#94a3b8" strokeWidth="2" />
      <line x1="130" y1="108" x2="200" y2="108" stroke="#94a3b8" strokeWidth="2" />
      {/* Подсказка снизу */}
      <text x="120" y="158" textAnchor="middle" fontSize="9" fill="#64748b">
        весь разворот в кадре, без бликов
      </text>
    </svg>
  );
}

export function PassportRegSample() {
  return (
    <svg
      viewBox="0 0 240 160"
      className="h-auto w-full max-w-[300px]"
      role="img"
      aria-label="Паспорт — страница с пропиской"
    >
      <rect x="6" y="10" width="228" height="140" rx="8" fill="#fff" stroke="#94a3b8" strokeWidth="2" />
      <line x1="120" y1="14" x2="120" y2="146" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
      {/* Левая страница: заголовок «Место жительства» */}
      <text x="68" y="34" textAnchor="middle" fontSize="9" fill="#475569" fontWeight="700">
        МЕСТО ЖИТЕЛЬСТВА
      </text>
      {/* Штамп прописки — пунктирная рамка */}
      <rect x="22" y="44" width="92" height="60" rx="2" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3 2" />
      <text x="68" y="60" textAnchor="middle" fontSize="7" fill="#3b82f6">
        ОВД района
      </text>
      <text x="68" y="74" textAnchor="middle" fontSize="6" fill="#3b82f6">
        зарегистрирован
      </text>
      <line x1="30" y1="84" x2="106" y2="84" stroke="#3b82f6" strokeWidth="1" />
      <line x1="30" y1="92" x2="100" y2="92" stroke="#3b82f6" strokeWidth="1" />
      {/* Правая страница: тоже линии */}
      <line x1="130" y1="40" x2="222" y2="40" stroke="#94a3b8" strokeWidth="2" />
      <line x1="130" y1="50" x2="218" y2="50" stroke="#94a3b8" strokeWidth="2" />
      <line x1="130" y1="64" x2="222" y2="64" stroke="#94a3b8" strokeWidth="2" />
      <line x1="130" y1="74" x2="200" y2="74" stroke="#94a3b8" strokeWidth="2" />
      <line x1="130" y1="88" x2="222" y2="88" stroke="#94a3b8" strokeWidth="2" />
      <line x1="130" y1="98" x2="216" y2="98" stroke="#94a3b8" strokeWidth="2" />
      <text x="120" y="158" textAnchor="middle" fontSize="9" fill="#64748b">
        штамп прописки целиком виден
      </text>
    </svg>
  );
}

export function LicenseSample() {
  return (
    <svg
      viewBox="0 0 240 160"
      className="h-auto w-full max-w-[300px]"
      role="img"
      aria-label="Водительское удостоверение"
    >
      {/* Карточка ВУ — горизонтальная, скруглённая */}
      <rect x="20" y="22" width="200" height="120" rx="10" fill="#dbeafe" stroke="#3b82f6" strokeWidth="2" />
      <rect x="20" y="22" width="200" height="20" rx="10" fill="#3b82f6" />
      <text x="120" y="36" textAnchor="middle" fontSize="9" fill="#fff" fontWeight="700">
        ВОДИТЕЛЬСКОЕ УДОСТОВЕРЕНИЕ
      </text>
      {/* Фото слева */}
      <rect x="32" y="52" width="56" height="72" rx="4" fill="#fff" stroke="#3b82f6" strokeWidth="1" />
      <circle cx="60" cy="74" r="10" fill="#94a3b8" />
      <path d="M44 116 q16 -20 32 0" fill="#94a3b8" />
      {/* Правая часть: линии и категории */}
      <line x1="100" y1="56" x2="208" y2="56" stroke="#1e40af" strokeWidth="2" />
      <line x1="100" y1="66" x2="200" y2="66" stroke="#1e40af" strokeWidth="2" />
      <line x1="100" y1="76" x2="208" y2="76" stroke="#1e40af" strokeWidth="2" />
      <line x1="100" y1="86" x2="190" y2="86" stroke="#1e40af" strokeWidth="2" />
      {/* Категории A, B, M */}
      <g fontSize="10" fontWeight="700" fill="#1e3a8a">
        <text x="104" y="112">A</text>
        <text x="124" y="112">A1</text>
        <text x="146" y="112">B</text>
        <text x="166" y="112">M</text>
      </g>
      <text x="120" y="158" textAnchor="middle" fontSize="9" fill="#64748b">
        фото лицевой стороны, всё чётко
      </text>
    </svg>
  );
}

export function SelfieSample() {
  return (
    <svg
      viewBox="0 0 240 200"
      className="h-auto w-full max-w-[260px]"
      role="img"
      aria-label="Селфи с паспортом — рамка лица"
    >
      {/* Фон-кадр (как видоискатель) */}
      <rect x="4" y="4" width="232" height="192" rx="12" fill="#0f172a" />
      {/* Углы рамки кадра — как у телефонной камеры */}
      <g stroke="#fff" strokeWidth="3" fill="none">
        <path d="M16 28 L16 16 L28 16" />
        <path d="M212 16 L224 16 L224 28" />
        <path d="M224 172 L224 184 L212 184" />
        <path d="M28 184 L16 184 L16 172" />
      </g>
      {/* Овальная рамка для лица — как в Uber/Я.Такси */}
      <ellipse cx="120" cy="80" rx="46" ry="58" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeDasharray="6 4" />
      {/* Силуэт лица внутри овала */}
      <circle cx="120" cy="68" r="18" fill="#94a3b8" />
      <path d="M92 124 q28 -32 56 0" fill="#94a3b8" />
      {/* Паспорт в руке — рядом с подбородком */}
      <g transform="translate(70 138) rotate(-8)">
        <rect width="100" height="40" rx="3" fill="#fff" stroke="#fbbf24" strokeWidth="1.5" />
        <rect x="6" y="6" width="22" height="28" rx="1" fill="#cbd5e1" />
        <line x1="34" y1="12" x2="92" y2="12" stroke="#94a3b8" strokeWidth="1.5" />
        <line x1="34" y1="20" x2="86" y2="20" stroke="#94a3b8" strokeWidth="1.5" />
        <line x1="34" y1="28" x2="92" y2="28" stroke="#94a3b8" strokeWidth="1.5" />
      </g>
    </svg>
  );
}
