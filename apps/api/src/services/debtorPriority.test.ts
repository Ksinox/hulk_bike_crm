import { describe, it, expect } from "vitest";
import { sortByPriority, topPriority, type DebtorForPriority } from "./debtorPriority.js";

function d(
  id: number,
  totalAmount: number,
  psyRating: number,
  clientStatus: "active" | "closed",
  stage: DebtorForPriority["stage"] = "payment_schedule",
): DebtorForPriority {
  return { id, totalAmount, psyRating, clientStatus, stage };
}

describe("debtorPriority — основная сортировка", () => {
  it("больше сумма → выше", () => {
    const sorted = sortByPriority([
      d(1, 50_000, 3, "active"),
      d(2, 200_000, 3, "active"),
      d(3, 100_000, 3, "active"),
    ]);
    expect(sorted.map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it("при равной сумме — меньший психо-портрет (сложный) → выше", () => {
    const sorted = sortByPriority([
      d(1, 100_000, 4, "active"),
      d(2, 100_000, 1, "active"),
      d(3, 100_000, 3, "active"),
    ]);
    expect(sorted.map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it("при равной сумме и психо — closed клиент выше", () => {
    const sorted = sortByPriority([
      d(1, 100_000, 3, "active"),
      d(2, 100_000, 3, "closed"),
    ]);
    expect(sorted.map((x) => x.id)).toEqual([2, 1]);
  });

  it("комплексный пример из 8 должников (как на дизайн-mockup'е)", () => {
    // Соответствует данным из flow.html
    const list = [
      d(1, 350_000, 1, "closed"), // Тимур
      d(2, 220_000, 3, "closed"), // Дмитрий
      d(3, 180_000, 2, "active"), // Иван
      d(4, 120_000, 5, "active"), // Сергей
      d(5, 90_000, 3, "closed"),  // Алексей
      d(6, 65_000, 4, "active"),  // Андрей
      d(7, 45_000, 4, "active"),  // Мария
      d(8, 15_000, 1, "active"),  // Артём
    ];
    const sorted = sortByPriority(list);
    expect(sorted.map((x) => x.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("debtorPriority — фильтрация closed_* стадий", () => {
  it("по умолчанию исключает закрытые", () => {
    const sorted = sortByPriority([
      d(1, 100_000, 3, "active", "payment_schedule"),
      d(2, 200_000, 3, "active", "closed_paid"),
      d(3, 50_000, 3, "active", "closed_court"),
    ]);
    expect(sorted.map((x) => x.id)).toEqual([1]);
  });

  it("includeClosed=true возвращает всё", () => {
    const sorted = sortByPriority(
      [
        d(1, 100_000, 3, "active", "payment_schedule"),
        d(2, 200_000, 3, "active", "closed_paid"),
      ],
      { includeClosed: true },
    );
    expect(sorted.map((x) => x.id)).toEqual([2, 1]);
  });
});

describe("debtorPriority — topPriority", () => {
  it("возвращает самого приоритетного", () => {
    const top = topPriority([
      d(1, 50_000, 3, "active"),
      d(2, 200_000, 3, "active"),
      d(3, 100_000, 1, "closed"),
    ]);
    expect(top?.id).toBe(2);
  });

  it("на пустом массиве возвращает null", () => {
    expect(topPriority([])).toBeNull();
  });

  it("игнорирует закрытые при выборе топа", () => {
    const top = topPriority([
      d(1, 500_000, 1, "closed", "closed_paid"), // самая большая сумма, но закрыто
      d(2, 100_000, 3, "active", "payment_schedule"),
    ]);
    expect(top?.id).toBe(2);
  });
});
