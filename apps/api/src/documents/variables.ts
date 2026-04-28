/**
 * Подстановка переменных в пользовательские HTML-шаблоны.
 *
 * В HTML переменные представлены как:
 *   <span data-var="client.name">{{client.name}}</span>
 *
 * Тут мы парсим этот HTML, заменяя каждый `<span data-var="...">...</span>`
 * на реальное значение из bundle. Если переменная не найдена — оставляем
 * метку «—» чтобы документ не разваливался визуально.
 */
import type { Bundle } from "./render.js";
import { LANDLORD } from "./landlord.js";

/** Описание одной переменной для UI sidebar в редакторе. */
export type VariableDescriptor = {
  /** ключ — `client.name`, `rental.startDate`, ... */
  key: string;
  /** Человеческое название — «ФИО», «Дата выдачи», ... */
  label: string;
  /** Подсказка / пример */
  hint?: string;
};

export type VariableGroup = {
  id: string;
  label: string;
  variables: VariableDescriptor[];
};

/**
 * Полный каталог переменных, доступных в редакторе шаблонов.
 * Используется и UI (для sidebar), и движком подстановки.
 */
export const VARIABLE_CATALOG: VariableGroup[] = [
  {
    id: "client",
    label: "Арендатор (клиент)",
    variables: [
      { key: "client.name", label: "ФИО арендатора" },
      { key: "client.phone", label: "Телефон" },
      { key: "client.birthDate", label: "Дата рождения" },
      { key: "client.passportSeries", label: "Серия паспорта" },
      { key: "client.passportNumber", label: "Номер паспорта" },
      { key: "client.passportIssuedOn", label: "Дата выдачи паспорта" },
      { key: "client.passportIssuer", label: "Кем выдан паспорт" },
      { key: "client.passportDivisionCode", label: "Код подразделения" },
      { key: "client.passportRegistration", label: "Адрес регистрации" },
    ],
  },
  {
    id: "landlord",
    label: "Арендодатель",
    variables: [
      { key: "landlord.fullName", label: "ФИО арендодателя" },
      { key: "landlord.passportSeries", label: "Серия паспорта" },
      { key: "landlord.passportNumber", label: "Номер паспорта" },
      { key: "landlord.passportIssuedOn", label: "Дата выдачи" },
      { key: "landlord.passportIssuer", label: "Кем выдан" },
      { key: "landlord.passportDivisionCode", label: "Код подразделения" },
      { key: "landlord.registrationAddress", label: "Адрес регистрации" },
      { key: "landlord.phone", label: "Телефон" },
      { key: "landlord.inn", label: "ИНН" },
      { key: "landlord.city", label: "Город" },
    ],
  },
  {
    id: "scooter",
    label: "Скутер",
    variables: [
      { key: "model.name", label: "Модель (Yamaha Gear / Jog)" },
      { key: "scooter.name", label: "Внутренний номер (Gear #22)" },
      { key: "scooter.frameNumber", label: "Номер рамы / шасси" },
      { key: "scooter.engineNo", label: "Номер двигателя" },
      { key: "scooter.year", label: "Год выпуска" },
      { key: "scooter.color", label: "Цвет" },
      { key: "scooter.mileage", label: "Пробег, км" },
      { key: "scooter.purchasePrice", label: "Стоимость скутера, ₽" },
      { key: "scooter.purchasePriceWords", label: "Стоимость прописью" },
    ],
  },
  {
    id: "rental",
    label: "Аренда",
    variables: [
      { key: "rental.id", label: "Номер договора" },
      { key: "rental.startDate", label: "Дата выдачи (ДД.ММ.ГГГГ)" },
      { key: "rental.startDateShort", label: "Дата выдачи (ДД.ММ.ГГ)" },
      { key: "rental.startTime", label: "Время выдачи" },
      { key: "rental.endDate", label: "Плановая дата возврата" },
      { key: "rental.endDateShort", label: "Дата возврата (ДД.ММ.ГГ)" },
      { key: "rental.endTime", label: "Время возврата" },
      { key: "rental.days", label: "Количество дней аренды" },
      { key: "rental.sum", label: "Сумма аренды, ₽" },
      { key: "rental.sumWords", label: "Сумма аренды прописью" },
      { key: "rental.deposit", label: "Залог, ₽" },
      { key: "rental.depositWords", label: "Залог прописью" },
      { key: "rental.rate", label: "Тариф ₽/сутки" },
      { key: "rental.weeklyAmount", label: "Сумма за неделю (тариф×7)" },
      { key: "rental.contractDate", label: "Дата составления договора" },
    ],
  },
];

/* ============ helpers ============ */

function fmtDateRu(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${dt.getFullYear()}`;
}
function fmtDateShort(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${String(dt.getFullYear()).slice(-2)}г.`;
}
function fmtTimeMsk(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  const msk = new Date(dt.getTime() + 3 * 3600 * 1000);
  return `${String(msk.getUTCHours()).padStart(2, "0")}:${String(msk.getUTCMinutes()).padStart(2, "0")}`;
}
function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "0";
  return Math.abs(Math.round(n)).toLocaleString("ru-RU");
}

/** Упрощённое словесное представление чисел до 9 999 999. */
function moneyWords(n: number | null | undefined): string {
  if (!n) return "ноль";
  const num = Math.abs(Math.round(n));
  if (num === 0) return "ноль";
  const u = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const t = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const h = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];
  const triple = (n3: number, fem = false): string => {
    const out: string[] = [];
    if (n3 >= 100) out.push(h[Math.floor(n3 / 100)] ?? "");
    const rem = n3 % 100;
    if (rem >= 10 && rem < 20) out.push(teens[rem - 10] ?? "");
    else {
      if (rem >= 20) out.push(t[Math.floor(rem / 10)] ?? "");
      const last = rem % 10;
      if (last) {
        if (fem && last === 1) out.push("одна");
        else if (fem && last === 2) out.push("две");
        else out.push(u[last] ?? "");
      }
    }
    return out.filter(Boolean).join(" ");
  };
  const millions = Math.floor(num / 1_000_000);
  const thousands = Math.floor((num % 1_000_000) / 1_000);
  const ones = num % 1_000;
  const parts: string[] = [];
  if (millions > 0) {
    const w = millions % 10 === 1 && millions % 100 !== 11 ? "миллион" : millions % 10 >= 2 && millions % 10 <= 4 && (millions % 100 < 12 || millions % 100 > 14) ? "миллиона" : "миллионов";
    parts.push(`${triple(millions)} ${w}`);
  }
  if (thousands > 0) {
    const w = thousands % 10 === 1 && thousands % 100 !== 11 ? "тысяча" : thousands % 10 >= 2 && thousands % 10 <= 4 && (thousands % 100 < 12 || thousands % 100 > 14) ? "тысячи" : "тысяч";
    parts.push(`${triple(thousands, true)} ${w}`);
  }
  if (ones > 0 || parts.length === 0) {
    parts.push(triple(ones));
  }
  const result = parts.join(" ").trim();
  return result.charAt(0).toUpperCase() + result.slice(1);
}

/**
 * Резолвит значение переменной по ключу из bundle.
 * Возвращает строку для подстановки в HTML.
 */
export function resolveVariable(key: string, b: Bundle): string {
  const { rental, client, scooter, model } = b;

  // landlord.*
  if (key.startsWith("landlord.")) {
    const prop = key.slice("landlord.".length) as keyof typeof LANDLORD;
    const v = LANDLORD[prop];
    return v != null ? String(v) : "—";
  }

  // client.*
  if (key.startsWith("client.")) {
    const prop = key.slice("client.".length);
    if (prop === "birthDate") return fmtDateRu(client.birthDate);
    if (prop === "passportIssuedOn") return fmtDateRu(client.passportIssuedOn);
    const v = (client as unknown as Record<string, unknown>)[prop];
    return v != null && v !== "" ? String(v) : "—";
  }

  // model.*
  if (key.startsWith("model.")) {
    const prop = key.slice("model.".length);
    if (prop === "name") {
      if (model?.name) return model.name;
      const map: Record<string, string> = {
        jog: "Yamaha Jog",
        gear: "Yamaha Gear",
        honda: "Honda Dio",
        tank: "Tank T150",
      };
      return map[scooter?.model ?? ""] ?? "—";
    }
    const v = (model as unknown as Record<string, unknown> | null)?.[prop];
    return v != null ? String(v) : "—";
  }

  // scooter.*
  if (key.startsWith("scooter.")) {
    const prop = key.slice("scooter.".length);
    if (prop === "purchasePrice") return fmtMoney(scooter?.purchasePrice ?? 0);
    if (prop === "purchasePriceWords") return moneyWords(scooter?.purchasePrice ?? 0);
    if (prop === "mileage") return scooter?.mileage != null ? String(scooter.mileage) : "—";
    const v = (scooter as unknown as Record<string, unknown> | null)?.[prop];
    return v != null && v !== "" ? String(v) : "—";
  }

  // rental.*
  if (key.startsWith("rental.")) {
    const prop = key.slice("rental.".length);
    switch (prop) {
      case "id":
        return String(rental.id);
      case "startDate":
        return fmtDateRu(rental.startAt);
      case "startDateShort":
        return fmtDateShort(rental.startAt);
      case "startTime":
        return fmtTimeMsk(rental.startAt);
      case "endDate":
        return fmtDateRu(rental.endPlannedAt);
      case "endDateShort":
        return fmtDateShort(rental.endPlannedAt);
      case "endTime":
        return fmtTimeMsk(rental.endPlannedAt);
      case "days":
        return String(rental.days ?? "—");
      case "sum":
        return fmtMoney(rental.sum);
      case "sumWords":
        return moneyWords(rental.sum);
      case "deposit":
        return fmtMoney(rental.deposit);
      case "depositWords":
        return moneyWords(rental.deposit);
      case "rate":
        return fmtMoney(rental.rate);
      case "weeklyAmount":
        return fmtMoney((rental.rate ?? 0) * 7);
      case "contractDate":
        return fmtDateRu(rental.startAt);
      default: {
        const v = (rental as unknown as Record<string, unknown>)[prop];
        return v != null ? String(v) : "—";
      }
    }
  }

  return "—";
}

/**
 * Подставляет в HTML значения переменных. Поддерживает два формата:
 *
 *   1. <span data-var="client.name">{{client.name}}</span>
 *      → значение
 *   2. {{client.name}} (просто метки в тексте)
 *      → значение
 *
 * Возвращает HTML без меток переменных, готовый к вставке в финальный
 * шаблон документа.
 */
export function substituteVariables(html: string, b: Bundle): string {
  // Сначала <span data-var="...">...</span>
  const spanRe = /<span\s+data-var="([^"]+)"[^>]*>[\s\S]*?<\/span>/g;
  let out = html.replace(spanRe, (_match, key: string) =>
    escapeForHtml(resolveVariable(key, b)),
  );
  // Затем простые метки {{X.Y}}
  const mustacheRe = /\{\{\s*([\w.]+)\s*\}\}/g;
  out = out.replace(mustacheRe, (_m, key: string) =>
    escapeForHtml(resolveVariable(key, b)),
  );
  return out;
}

/** Экранирует значение для безопасной вставки в HTML (без потерь форматирования). */
function escapeForHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Экранирует значение для использования внутри атрибута HTML. */
function escapeAttr(s: string): string {
  return escapeForHtml(s).replace(/"/g, "&quot;");
}

/**
 * Делает «фикстура»-Bundle где каждое поле имеет уникальное значение —
 * специальный маркер. После прогона через системный шаблон договора в
 * HTML появятся эти маркеры; их потом заменяем на пилюли <span data-var>
 * через replaceFixtureWithPlaceholders() ниже. Это даёт «голый» шаблон
 * для редактора (с переменными вместо подставленных значений).
 *
 * Уникальные даты подобраны не пересекающимися — чтобы fmtDateRu/Short
 * выдавали разные строки для разных полей (client.birthDate ≠
 * client.passportIssuedOn ≠ rental.startAt и т.д.).
 */
export function makeFixtureBundle(): Bundle {
  // Каждой дате — свой день, чтобы строки 01.01.1990, 02.02.1990 и т.д.
  // не сталкивались. Важно для replaceFixtureWithPlaceholders.
  const dt = (m: number, d: number, h = 12, mm = 0) =>
    new Date(`1990-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00.000Z`);

  return {
    rental: {
      id: 1234567,
      clientId: 0,
      scooterId: 0,
      parentRentalId: null,
      status: "active",
      startAt: dt(3, 3, 9, 0),
      endPlannedAt: dt(4, 4, 9, 0),
      endActualAt: null,
      tariffPeriod: "week",
      rate: 5555,
      days: 4242,
      sum: 7777777,
      deposit: 8888888,
      depositReturned: false,
      depositItem: null,
      paymentMethod: "cash",
      paymentConfirmed: false,
      paymentConfirmedAt: null,
      paymentConfirmerRole: null,
      damageAmount: 0,
      paidTowardDamage: 0,
      sourceChannel: null,
      note: null,
      archivedAt: null,
      archivedBy: null,
      contractNumber: null,
      equipmentJson: null,
      confirmDepositReceived: false,
      createdAt: dt(1, 1),
      updatedAt: dt(1, 2),
    } as unknown as Bundle["rental"],
    client: {
      id: 0,
      name: "__PH_clientName__",
      phone: "__PH_clientPhone__",
      extraPhone: null,
      birthDate: dt(5, 5).toISOString().slice(0, 10),
      passportSeries: "__PH_clientPassSeries__",
      passportNumber: "__PH_clientPassNumber__",
      passportIssuedOn: dt(6, 6).toISOString().slice(0, 10),
      passportIssuer: "__PH_clientPassIssuer__",
      passportDivisionCode: "__PH_clientPassDivCode__",
      passportRegistration: "__PH_clientPassReg__",
      rating: 0,
      sourceCustom: null,
      source: null,
      sourceUpdatedAt: null,
      tags: null,
      notes: null,
      addressActual: null,
      mustChangePassword: false,
      createdAt: dt(1, 1),
      updatedAt: dt(1, 2),
    } as unknown as Bundle["client"],
    scooter: {
      id: 0,
      name: "__PH_scooterName__",
      modelId: 0,
      model: "gear",
      mileage: 1234567,
      baseStatus: "rental_pool",
      vin: "__PH_scooterVin__",
      engineNo: "__PH_scooterEngineNo__",
      frameNumber: "__PH_scooterFrameNumber__",
      year: 1989,
      color: "__PH_scooterColor__",
      plate: "__PH_scooterPlate__",
      purchasePrice: 9999999,
      avatarKey: null,
      archivedAt: null,
      createdAt: dt(1, 1),
      updatedAt: dt(1, 2),
    } as unknown as Bundle["scooter"],
    model: {
      id: 0,
      name: "__PH_modelName__",
      avatarKey: null,
      avatarFileName: null,
      quickPick: false,
      active: true,
      dayRate: 0,
      shortRate: 0,
      weekRate: 0,
      monthRate: 0,
      maxSpeedKmh: null,
      tankVolumeL: null,
      fuelLPer100Km: null,
      coolingType: null,
      note: null,
      createdAt: dt(1, 1),
      updatedAt: dt(1, 2),
    } as unknown as Bundle["model"],
  };
}

/**
 * После рендера системного шаблона на fixture-bundle проходим регексом
 * по HTML и заменяем все маркеры/специальные значения на пилюли
 * <span data-var="X.Y" class="tpl-var">{{X.Y}}</span>.
 *
 * Замены упорядочены так, чтобы более длинные/специфичные шли первыми
 * (например «8 888 888» — депозит, не пересекается с другими цифрами).
 */
export function replaceFixtureWithPlaceholders(html: string): string {
  // Ищем человеческое название переменной по ключу — чтобы внутри пилюли
  // отображалось «Серия паспорта», а не {{client.passportSeries}}.
  const labelByKey = new Map<string, string>();
  for (const g of VARIABLE_CATALOG) {
    for (const v of g.variables) {
      labelByKey.set(v.key, v.label);
    }
  }
  const pill = (key: string) => {
    const label = labelByKey.get(key) ?? key;
    return `<span data-var="${key}" data-label="${escapeAttr(label)}" class="tpl-var">${escapeForHtml(label)}</span>`;
  };

  // Текстовые маркеры — простой replaceAll.
  const textMap: Record<string, string> = {
    "__PH_clientName__": "client.name",
    "__PH_clientPhone__": "client.phone",
    "__PH_clientPassSeries__": "client.passportSeries",
    "__PH_clientPassNumber__": "client.passportNumber",
    "__PH_clientPassIssuer__": "client.passportIssuer",
    "__PH_clientPassDivCode__": "client.passportDivisionCode",
    "__PH_clientPassReg__": "client.passportRegistration",
    "__PH_scooterName__": "scooter.name",
    "__PH_scooterVin__": "scooter.frameNumber",
    "__PH_scooterEngineNo__": "scooter.engineNo",
    "__PH_scooterFrameNumber__": "scooter.frameNumber",
    "__PH_scooterColor__": "scooter.color",
    "__PH_scooterPlate__": "scooter.frameNumber",
    "__PH_modelName__": "model.name",
  };

  let out = html;
  for (const [marker, key] of Object.entries(textMap)) {
    out = out.split(marker).join(pill(key));
  }

  // Численные маркеры — частоты «4 242», «5 555», «7 777 777», «8 888 888»,
  // «9 999 999», «1 234 567», «1989» — типичны и могут пересечься с другими
  // цифрами. Делаем замену с учётом возможных пробелов между разрядами
  // (toLocaleString ставит non-breaking space).
  const numericMap: Array<[string, string]> = [
    ["1234567", "rental.id"],          // rental.id (без форматирования)
    ["1 234 567", "scooter.mileage"], // mileage
    ["1 234 567", "scooter.mileage"],
    ["9 999 999", "scooter.purchasePrice"],
    ["9 999 999", "scooter.purchasePrice"],
    ["8 888 888", "rental.deposit"],
    ["8 888 888", "rental.deposit"],
    ["7 777 777", "rental.sum"],
    ["7 777 777", "rental.sum"],
    ["5 555", "rental.rate"],
    ["5 555", "rental.rate"],
    ["4 242", "rental.days"],
    ["4 242", "rental.days"],
    ["38 885", "rental.weeklyAmount"], // 5555*7=38885
    ["38 885", "rental.weeklyAmount"],
    ["1989", "scooter.year"],
  ];
  for (const [marker, key] of numericMap) {
    out = out.split(marker).join(pill(key));
  }

  // Денежные «прописью» — moneyWords(7777777) даёт длинную фразу «Семь миллионов...»
  // Их сложно надёжно ловить regex. Оставляем как есть в тексте — пользователь
  // увидит дублирующее представление и сам заменит на нужную переменную через
  // sidebar (rental.sumWords / depositWords / scooter.purchasePriceWords).

  // Даты — порядок важен (длинные форматы раньше, чтобы не сожрало "03.03"
  // от "03.03.1990г." при раннем match).
  const dateMap: Array<[string, string]> = [
    ["03.03.90г.", "rental.startDateShort"],
    ["04.04.90г.", "rental.endDateShort"],
    ["05.05.90г.", "client.birthDate"],
    ["06.06.90г.", "client.passportIssuedOn"],
    ["03.03.1990", "rental.startDate"],
    ["04.04.1990", "rental.endDate"],
    ["05.05.1990", "client.birthDate"],
    ["06.06.1990", "client.passportIssuedOn"],
  ];
  for (const [marker, key] of dateMap) {
    out = out.split(marker).join(pill(key));
  }

  // Время (МСК) — fmtTimeMsk прибавляет 3ч к UTC. dt(3,3,9,0) = 09:00 UTC = 12:00 МСК.
  const timeMap: Array<[string, string]> = [
    ["12:00", "rental.startTime"],
    // endPlannedAt тоже 09:00 UTC = 12:00 МСК — совпадает; берём один.
  ];
  for (const [marker, key] of timeMap) {
    out = out.split(marker).join(pill(key));
  }

  return out;
}
