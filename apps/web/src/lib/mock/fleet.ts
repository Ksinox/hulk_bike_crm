import type { ScooterModel } from "./rentals";

/**
 * Базовый статус скутера (что с ним с точки зрения компании).
 * Статус «в аренде» вычисляется динамически из rentalsStore — не хранится здесь.
 */
export type ScooterBaseStatus =
  | "ready" // «Не распределён» — только что завели, админ ещё не решил что с ним
  | "rental_pool" // «Парк аренды» — в пуле сдачи, готов к следующей аренде
  | "repair" // на ремонте
  | "buyout" // передан клиенту в рассрочку (выкуп)
  | "for_sale" // выставлен на продажу
  | "sold" // продан, в обороте не участвует
  | "disassembly"; // «В разборке» — на запчасти, учитывается в парке

export type ScooterDisplayStatus = ScooterBaseStatus | "rented";

export const SCOOTER_STATUS_LABEL: Record<ScooterDisplayStatus, string> = {
  ready: "Не распределён",
  rental_pool: "Парк аренды",
  rented: "В аренде",
  repair: "Ремонт",
  buyout: "Выкуп",
  for_sale: "Продаётся",
  sold: "Продан",
  disassembly: "В разборке",
};

export type FleetScooter = {
  id: number;
  /** отображаемое имя: «Jog #07» */
  name: string;
  model: ScooterModel;
  /** пробег в км */
  mileage: number;
  /** базовый статус — без учёта текущих аренд */
  baseStatus: ScooterBaseStatus;
  vin?: string;
  engineNo?: string;
  /** дата покупки, DD.MM.YYYY */
  purchaseDate?: string;
  /** цена закупа, ₽ (виден только директору) */
  purchasePrice?: number;
  /** Пробег скутера на момент последней замены масла, км */
  lastOilChangeMileage?: number;
  /**
   * Накопленные расходы на обслуживание, ₽ — ремонты, ТО, запчасти, масло.
   * В демо-моке — просто правдоподобные цифры, дальше заполнится из истории ремонтов.
   */
  maintenanceCostTotal?: number;
  note?: string;
};

/**
 * Интервал замены масла (км) по модели.
 * Данные основаны на рекомендациях производителей:
 * — Yamaha Jog (2T): трансмиссионное масло каждые 5 000 км
 * — Yamaha Gear, Honda DIO (4T): моторное масло каждые 3 000 км
 * — Tank (4T, крупная кубатура): моторное масло каждые 3 000 км
 */
export const OIL_INTERVAL_KM: Record<ScooterModel, number> = {
  jog: 5_000,
  gear: 3_000,
  honda: 3_000,
  tank: 3_000,
};

/**
 * Вычисляет «следующее ТО по маслу» и остаток до него.
 * Возвращает отрицательный remainKm, если обслуживание просрочено.
 */
export function oilServiceInfo(s: FleetScooter): {
  intervalKm: number;
  lastMileage: number;
  nextMileage: number;
  remainKm: number;
  /** 0..1, 1 — пора менять / просрочка */
  usedRatio: number;
} {
  const intervalKm = OIL_INTERVAL_KM[s.model];
  // Если не задано — псевдо-случайное значение в пределах интервала+буфер,
  // чтобы часть скутеров подошла близко к сроку, а кто-то просрочен.
  const fallbackPartial = (s.id * 317) % (intervalKm + 900);
  const lastMileage =
    s.lastOilChangeMileage != null
      ? s.lastOilChangeMileage
      : Math.max(0, s.mileage - fallbackPartial);
  const nextMileage = lastMileage + intervalKm;
  const remainKm = nextMileage - s.mileage;
  const used = Math.max(0, s.mileage - lastMileage);
  const usedRatio = Math.min(1, used / intervalKm);
  return { intervalKm, lastMileage, nextMileage, remainKm, usedRatio };
}

/** Детерминированные накопленные траты на обслуживание (пока моки). */
export function maintenanceCost(s: FleetScooter): number {
  if (s.maintenanceCostTotal != null) return s.maintenanceCostTotal;
  // базово: 3 ₽/км эксплуатации + плавающий бонус по id
  const base = Math.round(s.mileage * 3);
  const variance = (s.id * 731) % 9_000;
  return base + variance;
}

function mk(
  id: number,
  name: string,
  model: ScooterModel,
  mileage: number,
  baseStatus: ScooterBaseStatus = "ready",
  extra?: Partial<FleetScooter>,
): FleetScooter {
  return {
    id,
    name,
    model,
    mileage,
    baseStatus,
    vin: `VIN${String(id).padStart(4, "0")}HLK2026`,
    engineNo: `E-${1000 + id}`,
    purchaseDate: "15.03.2026",
    purchasePrice: model === "jog" ? 85_000 : model === "gear" ? 95_000 : 130_000,
    ...extra,
  };
}

/**
 * Парк: 54 скутера.
 * - Yamaha Jog: 30 шт. (основной флот, легкие)
 * - Yamaha Gear: 18 шт. (комфорт-класс)
 * - Tank: 6 шт. (тяжёлые, для дальняков и курьеров)
 *
 * Статусы проставлены руками под реальный срез демо-таймлайна 13.10.2026,
 * чтобы счётчики совпадали с бизнес-показателями (~44 клиента, ~34 в аренде,
 * 3–5 в ремонте, 3 на продаже).
 */
export const FLEET: FleetScooter[] = [
  // ===== Jog 01–30 =====
  mk(1, "Jog #01", "jog", 9_450, "ready"),
  mk(2, "Jog #02", "jog", 12_100, "ready"),
  mk(3, "Jog #03", "jog", 7_800, "ready"),
  mk(4, "Jog #04", "jog", 18_400, "repair", {
    note: "замена ЦПГ, ожидается поршневая",
  }),
  mk(5, "Jog #05", "jog", 6_320, "ready"),
  mk(6, "Jog #06", "jog", 11_250, "ready"),
  mk(7, "Jog #07", "jog", 4_120, "ready"),
  mk(8, "Jog #08", "jog", 8_840, "ready"),
  mk(9, "Jog #09", "jog", 14_700, "ready"),
  mk(10, "Jog #10", "jog", 5_600, "for_sale", {
    note: "после ДТП, косметика — 45 000 ₽",
  }),
  mk(11, "Jog #11", "jog", 10_120, "ready"),
  mk(12, "Jog #12", "jog", 22_800, "sold", { note: "продан 08.2026" }),
  mk(13, "Jog #13", "jog", 13_450, "ready"),
  mk(14, "Jog #14", "jog", 7_700, "ready"),
  mk(15, "Jog #15", "jog", 9_100, "buyout", {
    note: "выкуп в рассрочку, клиент #29",
  }),
  mk(16, "Jog #16", "jog", 15_600, "ready"),
  mk(17, "Jog #17", "jog", 8_250, "ready"),
  mk(18, "Jog #18", "jog", 11_900, "ready"),
  mk(19, "Jog #19", "jog", 3_400, "ready"),
  mk(20, "Jog #20", "jog", 17_800, "ready"),
  mk(21, "Jog #21", "jog", 6_950, "ready"),
  mk(22, "Jog #22", "jog", 10_400, "ready"),
  mk(23, "Jog #23", "jog", 8_100, "ready"),
  mk(24, "Jog #24", "jog", 12_500, "ready"),
  mk(25, "Jog #25", "jog", 9_980, "ready"),
  mk(26, "Jog #26", "jog", 5_800, "for_sale", {
    note: "сильный пробег, цена 68 000 ₽",
  }),
  mk(27, "Jog #27", "jog", 13_150, "ready"),
  mk(28, "Jog #28", "jog", 7_050, "ready"),
  mk(29, "Jog #29", "jog", 14_000, "ready"),
  mk(30, "Jog #30", "jog", 6_700, "ready"),

  // ===== Gear 01–18 =====
  mk(31, "Gear #01", "gear", 11_450, "ready"),
  mk(32, "Gear #02", "gear", 16_800, "ready"),
  mk(33, "Gear #03", "gear", 9_900, "ready"),
  mk(34, "Gear #04", "gear", 13_200, "ready"),
  mk(35, "Gear #05", "gear", 21_400, "repair", { note: "ТО, замена ремня" }),
  mk(36, "Gear #06", "gear", 18_500, "ready"),
  mk(37, "Gear #07", "gear", 8_250, "ready"),
  mk(38, "Gear #08", "gear", 12_050, "ready"),
  mk(39, "Gear #09", "gear", 14_800, "ready"),
  mk(40, "Gear #10", "gear", 7_400, "for_sale", {
    note: "свежая, цена 89 000 ₽",
  }),
  mk(41, "Gear #11", "gear", 10_900, "ready"),
  mk(42, "Gear #12", "gear", 13_600, "ready"),
  mk(43, "Gear #13", "gear", 15_200, "ready"),
  mk(44, "Gear #14", "gear", 9_800, "ready"),
  mk(45, "Gear #15", "gear", 6_700, "ready"),
  mk(46, "Gear #16", "gear", 11_100, "buyout", {
    note: "выкуп в рассрочку, клиент #37",
  }),
  mk(47, "Gear #17", "gear", 8_900, "ready"),
  mk(48, "Gear #18", "gear", 12_300, "ready"),

  // ===== Tank 01–06 =====
  mk(49, "Tank #01", "tank", 24_500, "ready"),
  mk(50, "Tank #02", "tank", 19_800, "ready"),
  mk(51, "Tank #03", "tank", 31_200, "repair", {
    note: "карбюратор после бездорожья",
  }),
  mk(52, "Tank #04", "tank", 17_600, "ready"),
  mk(53, "Tank #05", "tank", 22_900, "ready"),
  mk(54, "Tank #06", "tank", 14_300, "ready"),
];
