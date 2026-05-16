import { describe, it, expect } from "vitest";
import { recommendNextAction } from "./debtorRecommend.js";
import type { PaymentForOverdue } from "./debtorOverdue.js";
import type { Stage } from "./debtorStages.js";

function day(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0, 0);
}

type Args = {
  stage: Stage;
  stageEnteredAt?: string;
  lastLawyerUpdateAt?: string | null;
  totalAmount?: number;
  payments?: PaymentForOverdue[];
};

function debtor(opts: Args) {
  return {
    stage: opts.stage,
    stageEnteredAt: opts.stageEnteredAt ?? "2026-05-01",
    lastLawyerUpdateAt: opts.lastLawyerUpdateAt ?? null,
    totalAmount: opts.totalAmount ?? 90_000,
    payments: opts.payments ?? [],
  };
}

function pay(scheduledDate: string, amount: number, paid: string | null): PaymentForOverdue & { paidAmount: number | null } {
  return {
    scheduledDate,
    scheduledAmount: amount,
    paidAt: paid,
    paidAmount: paid ? amount : null,
  };
}

describe("debtorRecommend", () => {
  it("3 просрочки на графике → передать юристу", () => {
    const r = recommendNextAction(
      debtor({
        stage: "payment_schedule",
        payments: [
          pay("2026-02-09", 5_000, "2026-02-09"),
          pay("2026-03-09", 5_000, null),
          pay("2026-04-09", 5_000, null),
          pay("2026-05-09", 5_000, null),
        ],
      }),
      day("2026-05-16"),
    );
    expect(r?.kind).toBe("transfer_lawyer");
    expect(r?.cta?.target).toBe("/transfer-lawyer");
    expect(r?.reason).toMatch(/3 просрочки/);
  });

  it("1 просрочка на графике → нет рекомендации", () => {
    const r = recommendNextAction(
      debtor({
        stage: "payment_schedule",
        payments: [
          pay("2026-03-11", 18_000, "2026-03-11"),
          pay("2026-04-11", 18_000, "2026-04-10"),
          pay("2026-05-11", 18_000, null),
          pay("2026-06-11", 18_000, null),
        ],
      }),
      day("2026-05-15"),
    );
    expect(r).toBeNull();
  });

  it("pretrial > 14 дней → передать юристу", () => {
    const r = recommendNextAction(
      debtor({ stage: "pretrial", stageEnteredAt: "2026-04-25" }),
      day("2026-05-15"),
    );
    expect(r?.kind).toBe("transfer_lawyer");
    expect(r?.reason).toMatch(/20 дней/);
  });

  it("pretrial 5 дней — рано рекомендовать юриста", () => {
    const r = recommendNextAction(
      debtor({ stage: "pretrial", stageEnteredAt: "2026-05-10" }),
      day("2026-05-15"),
    );
    expect(r).toBeNull();
  });

  it("lawyer > 21 дня без апдейта → запросить смету", () => {
    const r = recommendNextAction(
      debtor({
        stage: "lawyer",
        stageEnteredAt: "2026-04-01",
        lastLawyerUpdateAt: "2026-04-10",
      }),
      day("2026-05-15"),
    );
    expect(r?.kind).toBe("request_estimate");
    expect(r?.cta?.target).toBe("/lawyer-update");
  });

  it("lawyer но недавний апдейт — нет рекомендации", () => {
    const r = recommendNextAction(
      debtor({
        stage: "lawyer",
        stageEnteredAt: "2026-04-01",
        lastLawyerUpdateAt: "2026-05-10",
      }),
      day("2026-05-15"),
    );
    expect(r).toBeNull();
  });

  it("всё оплачено по графику → close_paid", () => {
    const r = recommendNextAction(
      {
        stage: "payment_schedule",
        stageEnteredAt: "2026-02-01",
        lastLawyerUpdateAt: null,
        totalAmount: 30_000,
        payments: [
          pay("2026-03-09", 10_000, "2026-03-09"),
          pay("2026-04-09", 10_000, "2026-04-10"),
          pay("2026-05-09", 10_000, "2026-05-09"),
        ],
      },
      day("2026-05-15"),
    );
    expect(r?.kind).toBe("close_paid");
    expect(r?.cta?.kind).toBe("transition");
    expect(r?.cta?.target).toBe("closed_paid");
  });

  it("created — ничего не рекомендуется", () => {
    expect(recommendNextAction(debtor({ stage: "created" }), day("2026-05-15"))).toBeNull();
  });

  it("закрытая стадия — нет рекомендаций", () => {
    expect(
      recommendNextAction(debtor({ stage: "closed_paid" }), day("2026-05-15")),
    ).toBeNull();
  });
});
