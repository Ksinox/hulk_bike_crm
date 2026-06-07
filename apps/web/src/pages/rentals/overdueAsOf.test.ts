import { describe, it, expect } from "vitest";
import {
  parseRuDate,
  ruToIsoDate,
  effectiveOverdueDaysAsOf,
  operatorDelayDays,
} from "./overdueAsOf";

describe("parseRuDate / ruToIsoDate", () => {
  it("парсит корректную дату", () => {
    const d = parseRuDate("06.06.2026");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(5); // июнь = 5
    expect(d?.getDate()).toBe(6);
  });
  it("RU → ISO", () => {
    expect(ruToIsoDate("06.06.2026")).toBe("2026-06-06");
    expect(ruToIsoDate("03.06.2026")).toBe("2026-06-03");
  });
  it("мусор → null", () => {
    expect(parseRuDate("")).toBeNull();
    expect(parseRuDate("2026-06-06")).toBeNull();
    expect(ruToIsoDate("чепуха")).toBeNull();
  });
});

describe("effectiveOverdueDaysAsOf", () => {
  it("оплата в день планового возврата → 0 (в срок)", () => {
    expect(effectiveOverdueDaysAsOf("06.06.2026", "2026-06-06")).toBe(0);
  });
  it("оплата раньше планового возврата → 0", () => {
    expect(effectiveOverdueDaysAsOf("06.06.2026", "2026-06-04")).toBe(0);
  });
  it("оплата на 1 день позже → 1", () => {
    expect(effectiveOverdueDaysAsOf("06.06.2026", "2026-06-07")).toBe(1);
  });
  it("оплата на 3 дня позже → 3", () => {
    expect(effectiveOverdueDaysAsOf("06.06.2026", "2026-06-09")).toBe(3);
  });
  it("переход через месяц", () => {
    expect(effectiveOverdueDaysAsOf("30.06.2026", "2026-07-02")).toBe(2);
  });
});

describe("operatorDelayDays — сценарий Панченко и др.", () => {
  // Панченко: плановый 06.06, сегодня 07.06 → API даёт overdueDays=1.
  // Клиент заплатил 06.06 (в срок) → задержка фиксации = 1 день к прощению,
  // реальная просрочка 0.
  it("заплатил в срок, оператор отметил на след. день → простить 1", () => {
    expect(operatorDelayDays(1, "06.06.2026", "2026-06-06")).toBe(1);
  });
  it("заплатил сегодня (как и просрочка) → прощать нечего", () => {
    expect(operatorDelayDays(1, "06.06.2026", "2026-06-07")).toBe(0);
  });
  // Плановый 05.06, сегодня 07.06 → overdueDays=2. Заплатил 06.06 →
  // реально просрочил 1 день (05→06), задержка фиксации 1 день (06→07).
  it("частичная реальная просрочка: 2 дн всего, оплата на 1-й → простить 1", () => {
    expect(operatorDelayDays(2, "05.06.2026", "2026-06-06")).toBe(1);
  });
  it("заплатил раньше планового возврата → простить всю просрочку", () => {
    expect(operatorDelayDays(2, "05.06.2026", "2026-06-04")).toBe(2);
  });
  it("нет просрочки на сегодня → 0", () => {
    expect(operatorDelayDays(0, "10.06.2026", "2026-06-08")).toBe(0);
  });
  it("дата оплаты в будущем (защита) — не уводит в минус", () => {
    // eff=3, today=1 → 1 - 3 = -2 → clamp 0
    expect(operatorDelayDays(1, "06.06.2026", "2026-06-09")).toBe(0);
  });
});
