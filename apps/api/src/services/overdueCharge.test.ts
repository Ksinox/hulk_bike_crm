import { describe, it, expect } from "vitest";
import { equipDailyFromJson, overdueDailyRate } from "./overdueCharge.js";

/**
 * Баг-фикс v0.9: долг по просрочке должен учитывать платную экипировку.
 * День просрочки и штраф 50% считаются от суммы аренда/сут + экипировка/сут.
 */
describe("overdueCharge — экипировка в расчёте просрочки", () => {
  const helmet = [{ name: "Шлем", price: 50, free: false }];

  it("equipDailyFromJson суммирует только платные позиции", () => {
    expect(equipDailyFromJson(helmet)).toBe(50);
    expect(
      equipDailyFromJson([
        { name: "Шлем", price: 50, free: false },
        { name: "Дождевик", price: 100, free: true }, // бесплатная — не в долг
        { name: "Бокс", price: 30, free: false },
      ]),
    ).toBe(80);
  });

  it("пустая/невалидная экипировка → 0 (обратная совместимость)", () => {
    expect(equipDailyFromJson([])).toBe(0);
    expect(equipDailyFromJson(null)).toBe(0);
    expect(equipDailyFromJson(undefined)).toBe(0);
    expect(equipDailyFromJson("мусор")).toBe(0);
  });

  it("дневная ставка = аренда/сут + платная экипировка/сут", () => {
    expect(overdueDailyRate(500, "day", helmet)).toBe(550); // 500 + 50
    expect(overdueDailyRate(500, "day", [])).toBe(500); // без экип
  });

  it("ПРИМЕР ЗАКАЗЧИКА: аренда 500 + шлем 50, 1 день просрочки → 550 + 275 = 825", () => {
    const daily = overdueDailyRate(500, "day", helmet); // 550
    const overdueDays = 1;
    const daysCharge = daily * overdueDays;
    const fineCharge = Math.round(daily * 0.5) * overdueDays;
    expect(daysCharge).toBe(550);
    expect(fineCharge).toBe(275);
    expect(daysCharge + fineCharge).toBe(825);
  });

  it("несколько дней просрочки масштабируются линейно", () => {
    const daily = overdueDailyRate(500, "day", helmet); // 550
    const days = 3;
    expect(daily * days).toBe(1650); // дни
    expect(Math.round(daily * 0.5) * days).toBe(825); // штраф
    expect(daily * days + Math.round(daily * 0.5) * days).toBe(2475); // итого
  });

  it("недельный тариф: ставка/7 + экипировка/сут", () => {
    // 3500 ₽/нед = 500 ₽/сут, + шлем 50 = 550 ₽/сут
    expect(overdueDailyRate(3500, "week", helmet)).toBe(550);
  });

  it("несколько платных позиций экипировки", () => {
    const equip = [
      { name: "Шлем", price: 50, free: false },
      { name: "Бокс", price: 30, free: false },
    ];
    // 500 + 80 = 580/сут; 2 дня → 1160 дни + 580 штраф (round(290)=290 ×2)
    const daily = overdueDailyRate(500, "day", equip);
    expect(daily).toBe(580);
    expect(Math.round(daily * 0.5) * 2).toBe(580);
  });
});
