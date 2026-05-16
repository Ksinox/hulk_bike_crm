import { describe, it, expect } from "vitest";
import {
  isPaymentOverdue,
  getOverduePayments,
  getConsecutiveOverdueCount,
  hasSystematicViolations,
  overdueDays,
  overdueAmount,
} from "./debtorOverdue.js";

function d(iso: string): Date {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, day!, 12, 0, 0, 0);
}

describe("debtorOverdue — isPaymentOverdue", () => {
  it("плановый в прошлом и не оплачен → overdue", () => {
    expect(
      isPaymentOverdue(
        { scheduledDate: "2026-05-11", scheduledAmount: 18_000, paidAt: null },
        d("2026-05-15"),
      ),
    ).toBe(true);
  });
  it("плановый в будущем → не overdue", () => {
    expect(
      isPaymentOverdue(
        { scheduledDate: "2026-05-20", scheduledAmount: 18_000, paidAt: null },
        d("2026-05-15"),
      ),
    ).toBe(false);
  });
  it("оплаченный плановый в прошлом → не overdue", () => {
    expect(
      isPaymentOverdue(
        {
          scheduledDate: "2026-05-11",
          scheduledAmount: 18_000,
          paidAt: "2026-05-10",
        },
        d("2026-05-15"),
      ),
    ).toBe(false);
  });
  it("ровно на дату today → не overdue (день ещё идёт)", () => {
    expect(
      isPaymentOverdue(
        { scheduledDate: "2026-05-15", scheduledAmount: 18_000, paidAt: null },
        d("2026-05-15"),
      ),
    ).toBe(false);
  });
});

describe("debtorOverdue — getConsecutiveOverdueCount", () => {
  it("кейс Алексея: 2 платежа paid, 1 overdue, 2 будущих → 1 подряд", () => {
    const payments = [
      { scheduledDate: "2026-03-11", scheduledAmount: 18_000, paidAt: "2026-03-11" },
      { scheduledDate: "2026-04-11", scheduledAmount: 18_000, paidAt: "2026-04-10" },
      { scheduledDate: "2026-05-11", scheduledAmount: 18_000, paidAt: null },
      { scheduledDate: "2026-06-11", scheduledAmount: 18_000, paidAt: null },
      { scheduledDate: "2026-07-11", scheduledAmount: 18_000, paidAt: null },
    ];
    expect(getConsecutiveOverdueCount(payments, d("2026-05-15"))).toBe(1);
  });

  it("кейс Артёма: 1 paid, 3 overdue подряд → 3 (триггер юриста)", () => {
    const payments = [
      { scheduledDate: "2026-02-09", scheduledAmount: 5_000, paidAt: "2026-02-09" },
      { scheduledDate: "2026-03-09", scheduledAmount: 5_000, paidAt: null },
      { scheduledDate: "2026-04-09", scheduledAmount: 5_000, paidAt: null },
      { scheduledDate: "2026-05-09", scheduledAmount: 5_000, paidAt: null },
    ];
    expect(getConsecutiveOverdueCount(payments, d("2026-05-16"))).toBe(3);
    expect(hasSystematicViolations(payments, d("2026-05-16"))).toBe(true);
  });

  it("все оплачены вовремя → 0", () => {
    const payments = [
      { scheduledDate: "2026-03-11", scheduledAmount: 18_000, paidAt: "2026-03-11" },
      { scheduledDate: "2026-04-11", scheduledAmount: 18_000, paidAt: "2026-04-11" },
    ];
    expect(getConsecutiveOverdueCount(payments, d("2026-05-16"))).toBe(0);
    expect(hasSystematicViolations(payments, d("2026-05-16"))).toBe(false);
  });

  it("платёж был просрочен, потом догнал — серия прерывается", () => {
    const payments = [
      { scheduledDate: "2026-01-11", scheduledAmount: 18_000, paidAt: "2026-01-15" }, // догнал
      { scheduledDate: "2026-02-11", scheduledAmount: 18_000, paidAt: "2026-02-11" },
      { scheduledDate: "2026-03-11", scheduledAmount: 18_000, paidAt: null }, // overdue
    ];
    // Свежая overdue только одна, до неё paid → серия = 1
    expect(getConsecutiveOverdueCount(payments, d("2026-05-15"))).toBe(1);
  });
});

describe("debtorOverdue — overdueDays", () => {
  it("просрочка с 11 мая, today 15 мая → 4 дня", () => {
    const payments = [
      { scheduledDate: "2026-05-11", scheduledAmount: 18_000, paidAt: null },
    ];
    expect(overdueDays(payments, d("2026-05-15"))).toBe(4);
  });

  it("несколько просрочек — считаем от САМОЙ старой", () => {
    const payments = [
      { scheduledDate: "2026-03-09", scheduledAmount: 5_000, paidAt: null },
      { scheduledDate: "2026-04-09", scheduledAmount: 5_000, paidAt: null },
      { scheduledDate: "2026-05-09", scheduledAmount: 5_000, paidAt: null },
    ];
    // от 9 марта до 16 мая = 68 дней
    expect(overdueDays(payments, d("2026-05-16"))).toBe(68);
  });

  it("нет просрочек → 0", () => {
    expect(overdueDays([], d("2026-05-15"))).toBe(0);
  });
});

describe("debtorOverdue — overdueAmount", () => {
  it("сумма всех просроченных платежей", () => {
    const payments = [
      { scheduledDate: "2026-03-11", scheduledAmount: 18_000, paidAt: "2026-03-11" },
      { scheduledDate: "2026-04-11", scheduledAmount: 18_000, paidAt: null },
      { scheduledDate: "2026-05-11", scheduledAmount: 18_000, paidAt: null },
    ];
    expect(overdueAmount(payments, d("2026-05-16"))).toBe(36_000);
  });
});

describe("debtorOverdue — getOverduePayments", () => {
  it("возвращает только просроченные", () => {
    const payments = [
      { scheduledDate: "2026-03-11", scheduledAmount: 18_000, paidAt: "2026-03-11" },
      { scheduledDate: "2026-05-11", scheduledAmount: 18_000, paidAt: null },
      { scheduledDate: "2026-06-11", scheduledAmount: 18_000, paidAt: null },
    ];
    const overdue = getOverduePayments(payments, d("2026-05-15"));
    expect(overdue).toHaveLength(1);
    expect(overdue[0]!.scheduledDate).toBe("2026-05-11");
  });
});
