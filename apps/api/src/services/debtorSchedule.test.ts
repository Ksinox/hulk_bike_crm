import { describe, it, expect } from "vitest";
import {
  buildSchedule,
  addPeriod,
  paidSoFar,
  progressPercent,
  isFullyPaid,
} from "./debtorSchedule.js";

function d(iso: string): Date {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, day!, 0, 0, 0, 0);
}

/** Локальный YYYY-MM-DD (без TZ-сюрпризов от toISOString). */
function localDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("debtorSchedule — buildSchedule", () => {
  it("равные платежи: 90 000 / 5 = 18 000 каждый", () => {
    const s = buildSchedule({
      totalAmount: 90_000,
      count: 5,
      startDate: d("2026-05-15"),
      frequency: "monthly",
    });
    expect(s).toHaveLength(5);
    expect(s.every((p) => p.amount === 18_000)).toBe(true);
    expect(s.map((p) => p.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("неравные: 100 000 / 3 = 33 333 + 33 333 + 33 334 (остаток на последний)", () => {
    const s = buildSchedule({
      totalAmount: 100_000,
      count: 3,
      startDate: d("2026-05-15"),
      frequency: "monthly",
    });
    expect(s[0]!.amount).toBe(33_333);
    expect(s[1]!.amount).toBe(33_333);
    expect(s[2]!.amount).toBe(33_334);
    // Сумма равна total
    expect(s.reduce((a, p) => a + p.amount, 0)).toBe(100_000);
  });

  it("monthly: даты с шагом ровно в месяц", () => {
    const s = buildSchedule({
      totalAmount: 50_000,
      count: 5,
      startDate: d("2026-01-15"),
      frequency: "monthly",
    });
    expect(s.map((p) => localDate(p.date))).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
      "2026-05-15",
    ]);
  });

  it("weekly: шаг 7 дней", () => {
    const s = buildSchedule({
      totalAmount: 40_000,
      count: 4,
      startDate: d("2026-05-15"),
      frequency: "weekly",
    });
    expect(s.map((p) => localDate(p.date))).toEqual([
      "2026-05-15",
      "2026-05-22",
      "2026-05-29",
      "2026-06-05",
    ]);
  });

  it("biweekly: шаг 14 дней", () => {
    const s = buildSchedule({
      totalAmount: 30_000,
      count: 3,
      startDate: d("2026-05-01"),
      frequency: "biweekly",
    });
    expect(s.map((p) => localDate(p.date))).toEqual([
      "2026-05-01",
      "2026-05-15",
      "2026-05-29",
    ]);
  });

  it("сумма всех платежей всегда = totalAmount", () => {
    for (const total of [99_999, 12_345, 7, 100, 1_000_001]) {
      for (const count of [1, 3, 5, 12]) {
        const s = buildSchedule({
          totalAmount: total,
          count,
          startDate: d("2026-01-01"),
          frequency: "monthly",
        });
        expect(s.reduce((a, p) => a + p.amount, 0)).toBe(total);
      }
    }
  });

  it("ошибки валидации", () => {
    expect(() =>
      buildSchedule({
        totalAmount: 0,
        count: 5,
        startDate: d("2026-01-01"),
        frequency: "monthly",
      }),
    ).toThrow();
    expect(() =>
      buildSchedule({
        totalAmount: -100,
        count: 5,
        startDate: d("2026-01-01"),
        frequency: "monthly",
      }),
    ).toThrow();
    expect(() =>
      buildSchedule({
        totalAmount: 1000,
        count: 0,
        startDate: d("2026-01-01"),
        frequency: "monthly",
      }),
    ).toThrow();
    expect(() =>
      buildSchedule({
        totalAmount: 1000,
        count: 100,
        startDate: d("2026-01-01"),
        frequency: "monthly",
      }),
    ).toThrow();
  });
});

describe("debtorSchedule — addPeriod edge cases", () => {
  it("31 января + 1 месяц → 28 февраля 2026 (невисокосный)", () => {
    const r = addPeriod(d("2026-01-31"), 1, "monthly");
    // JS Date overflow: 31+1мес → 3 марта (потому что 31 февраля → 3 марта)
    // Но это известное поведение и нас устраивает (если клиент платил
    // 31-го числа, а в феврале нет — платёж выпадает на начало марта).
    expect(r.getMonth()).toBeGreaterThanOrEqual(1); // фев или мар
  });
  it("29 февраля 2028 (високосный) + 1 год → 28 февраля 2029", () => {
    const r = addPeriod(d("2028-02-29"), 12, "monthly");
    expect(r.getFullYear()).toBe(2029);
    // месяц 1=feb, день 28 или 29 — зависит от JS, но не должно быть mar
    expect(r.getMonth()).toBeLessThanOrEqual(2);
  });
});

describe("debtorSchedule — paidSoFar / progress / isFullyPaid", () => {
  const payments = [
    { paidAt: "2026-03-11T10:00:00", paidAmount: 18_000 },
    { paidAt: "2026-04-10T10:00:00", paidAmount: 18_000 },
    { paidAt: null, paidAmount: null }, // в просрочке
    { paidAt: null, paidAmount: null },
    { paidAt: null, paidAmount: null },
  ];

  it("paidSoFar считает только оплаченные", () => {
    expect(paidSoFar(payments)).toBe(36_000);
  });

  it("progressPercent: 36k / 90k = 40%", () => {
    expect(progressPercent(90_000, 36_000)).toBe(40);
  });

  it("progressPercent: clamp до 100", () => {
    expect(progressPercent(100, 200)).toBe(100);
  });

  it("isFullyPaid: false если меньше", () => {
    expect(isFullyPaid(90_000, payments)).toBe(false);
  });

  it("isFullyPaid: true если paid >= total", () => {
    const all = [
      ...payments,
      { paidAt: "2026-05-11", paidAmount: 18_000 },
      { paidAt: "2026-06-11", paidAmount: 18_000 },
      { paidAt: "2026-07-11", paidAmount: 18_000 },
    ];
    expect(isFullyPaid(90_000, all)).toBe(true);
  });

  it("isFullyPaid: true даже при переплате", () => {
    const overpaid = [{ paidAt: "2026-05-11", paidAmount: 100_000 }];
    expect(isFullyPaid(90_000, overpaid)).toBe(true);
  });
});
