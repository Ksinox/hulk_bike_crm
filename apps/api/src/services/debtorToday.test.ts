import { describe, it, expect } from "vitest";
import { getTodayAction, getTodayBundle, type DebtorForToday } from "./debtorToday.js";
import type { PaymentForOverdue } from "./debtorOverdue.js";
import type { Stage, DebtType } from "./debtorStages.js";

function day(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0, 0);
}

function pay(date: string, amount: number, paid: string | null): PaymentForOverdue {
  return { scheduledDate: date, scheduledAmount: amount, paidAt: paid };
}

function debtor(
  id: number,
  totalAmount: number,
  stage: Stage,
  payments: PaymentForOverdue[] = [],
  extras: Partial<DebtorForToday> = {},
): DebtorForToday {
  return {
    id,
    caseNumber: `D-${String(id).padStart(3, "0")}`,
    type: extras.type ?? ("dtp_guilty" as DebtType),
    stage,
    stageEnteredAt: extras.stageEnteredAt ?? "2026-05-01",
    lastLawyerUpdateAt: extras.lastLawyerUpdateAt ?? null,
    totalAmount,
    psyRating: extras.psyRating ?? 3,
    clientStatus: extras.clientStatus ?? "active",
    clientName: extras.clientName ?? `Test ${id}`,
    payments,
    reminderDate: extras.reminderDate ?? null,
  };
}

describe("debtorToday — getTodayAction", () => {
  it("систематические нарушения → hot/transfer_lawyer", () => {
    const a = getTodayAction(
      debtor(1, 15_000, "payment_schedule", [
        pay("2026-02-09", 5_000, "2026-02-09"),
        pay("2026-03-09", 5_000, null),
        pay("2026-04-09", 5_000, null),
        pay("2026-05-09", 5_000, null),
      ]),
      day("2026-05-16"),
    );
    expect(a?.priority).toBe("hot");
    expect(a?.kind).toBe("systematic_violation");
    expect(a?.primaryAction.target).toBe("/transfer-lawyer");
  });

  it("просрочка 4 дня → hot/overdue_call", () => {
    const a = getTodayAction(
      debtor(2, 90_000, "payment_schedule", [
        pay("2026-03-11", 18_000, "2026-03-11"),
        pay("2026-04-11", 18_000, "2026-04-10"),
        pay("2026-05-11", 18_000, null),
      ]),
      day("2026-05-15"),
    );
    expect(a?.priority).toBe("hot");
    expect(a?.text).toMatch(/4 дня/);
  });

  it("просрочка 1 день → warm (не hot)", () => {
    const a = getTodayAction(
      debtor(3, 90_000, "payment_schedule", [
        pay("2026-05-14", 18_000, null),
      ]),
      day("2026-05-15"),
    );
    expect(a?.priority).toBe("warm");
    expect(a?.text).toMatch(/1 день/);
  });

  it("у юриста 15+ дней без апдейта → warm/lawyer_check", () => {
    const a = getTodayAction(
      debtor(4, 180_000, "lawyer", [], {
        stageEnteredAt: "2026-04-01",
        lastLawyerUpdateAt: "2026-04-25",
      }),
      day("2026-05-15"),
    );
    expect(a?.priority).toBe("warm");
    expect(a?.kind).toBe("lawyer_check");
    expect(a?.primaryAction.target).toBe("/lawyer-update");
  });

  it("плановый платёж сегодня → cool/payment_due_today", () => {
    const a = getTodayAction(
      debtor(5, 45_000, "payment_schedule", [
        pay("2026-03-15", 15_000, "2026-03-15"),
        pay("2026-04-15", 15_000, "2026-04-15"),
        pay("2026-05-15", 15_000, null),
      ]),
      day("2026-05-15"),
    );
    expect(a?.priority).toBe("cool");
    expect(a?.kind).toBe("payment_due_today");
    expect(a?.primaryAction.target).toBe("/payment");
  });

  it("напоминание про страховую сегодня → warm", () => {
    const a = getTodayAction(
      debtor(6, 120_000, "insurance_wait", [], {
        type: "dtp_victim",
        reminderDate: "2026-05-18",
      }),
      day("2026-05-18"),
    );
    expect(a?.priority).toBe("warm");
    expect(a?.kind).toBe("insurance_reminder");
  });

  it("закрытое дело → null (нет действий)", () => {
    const a = getTodayAction(
      debtor(7, 50_000, "closed_paid"),
      day("2026-05-15"),
    );
    expect(a).toBeNull();
  });
});

describe("debtorToday — getTodayBundle", () => {
  it("hottest = самое горящее hot, queue = остальные", () => {
    const list = [
      debtor(1, 15_000, "payment_schedule", [
        pay("2026-02-09", 5_000, "2026-02-09"),
        pay("2026-03-09", 5_000, null),
        pay("2026-04-09", 5_000, null),
        pay("2026-05-09", 5_000, null),
      ]),
      debtor(2, 90_000, "payment_schedule", [
        pay("2026-05-11", 18_000, null),
      ]),
      debtor(3, 45_000, "payment_schedule", [
        pay("2026-05-15", 15_000, null),
      ]),
    ];
    const bundle = getTodayBundle(list, day("2026-05-15"));
    // У 1 и 2 hot. По сумме 90k > 15k → hottest=2
    expect(bundle.hottest?.debtor.id).toBe(2);
    expect(bundle.queue.map((x) => x.debtor.id)).toEqual([1, 3]);
  });

  it("без hot — hottest=null, queue содержит warm/cool", () => {
    const list = [
      debtor(1, 100_000, "payment_schedule", [
        pay("2026-05-15", 25_000, null),
      ]),
    ];
    const bundle = getTodayBundle(list, day("2026-05-15"));
    expect(bundle.hottest).toBeNull();
    expect(bundle.queue).toHaveLength(1);
  });

  it("сводка: count и sum по активным", () => {
    const list = [
      debtor(1, 100_000, "payment_schedule"),
      debtor(2, 50_000, "lawyer"),
      debtor(3, 200_000, "closed_paid"), // закрыто — не считается
    ];
    const bundle = getTodayBundle(list, day("2026-05-15"));
    expect(bundle.totalActiveCount).toBe(2);
    expect(bundle.totalActiveSum).toBe(150_000);
  });

  it("пустой список — пустой bundle", () => {
    const bundle = getTodayBundle([], day("2026-05-15"));
    expect(bundle.hottest).toBeNull();
    expect(bundle.queue).toEqual([]);
    expect(bundle.totalActiveCount).toBe(0);
    expect(bundle.totalActiveSum).toBe(0);
  });
});
