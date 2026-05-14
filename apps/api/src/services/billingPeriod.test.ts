/**
 * Юнит-тесты резолвера на бэке. Зеркалят apps/web/src/lib/billingPeriod.test.ts
 * — обе стороны обязаны давать одинаковые границы, иначе фронт и бэк
 * будут спорить о том, в какой период попал платёж.
 */
import { describe, it, expect } from "vitest";
import {
  periodFor,
  planTransition,
  isTransitionActive,
  currentRuleStartDay,
  toISODate,
  type BillingAnchorRow,
} from "./billingPeriod.js";

const SCENARIO_15_TO_1: BillingAnchorRow[] = [
  {
    id: 1,
    effectiveFrom: "2024-01-01",
    ruleStartDay: 15,
    kind: "regular",
    transitionEndDate: null,
  },
  {
    id: 2,
    effectiveFrom: "2026-05-15",
    ruleStartDay: 1,
    kind: "transition",
    transitionEndDate: "2026-05-31",
  },
];

function d(iso: string): Date {
  if (iso.includes("T")) {
    const [date, time] = iso.split("T");
    const [y, m, day] = date!.split("-").map(Number);
    const [hh, mm, rest] = time!.split(":");
    const [ss, msStr] = (rest ?? "0").split(".");
    return new Date(
      y as number,
      (m as number) - 1,
      day as number,
      Number(hh),
      Number(mm),
      Number(ss ?? 0),
      Number(msStr ?? 0),
    );
  }
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y as number, (m as number) - 1, day as number, 0, 0, 0, 0);
}

describe("api billingPeriod — старая эра", () => {
  it("середина периода 20 марта → 15 мар → 14 апр", () => {
    const p = periodFor(d("2026-03-20"), SCENARIO_15_TO_1);
    expect(p.kind).toBe("regular");
    expect(p.ruleStartDay).toBe(15);
    expect(p.start).toEqual(d("2026-03-15"));
    expect(p.end).toEqual(d("2026-04-15"));
  });

  it("14 мая 23:59:59.999 — всё ещё старая эра", () => {
    const p = periodFor(d("2026-05-14T23:59:59.999"), SCENARIO_15_TO_1);
    expect(p.kind).toBe("regular");
    expect(p.ruleStartDay).toBe(15);
  });
});

describe("api billingPeriod — transition", () => {
  it("15 мая → transition", () => {
    const p = periodFor(d("2026-05-15"), SCENARIO_15_TO_1);
    expect(p.kind).toBe("transition");
    expect(p.start).toEqual(d("2026-05-15"));
    expect(p.end).toEqual(d("2026-06-01"));
  });

  it("31 мая 23:59:59.999 — последний момент transition", () => {
    const p = periodFor(d("2026-05-31T23:59:59.999"), SCENARIO_15_TO_1);
    expect(p.kind).toBe("transition");
  });

  it("1 июня — уже новая эра regular", () => {
    const p = periodFor(d("2026-06-01"), SCENARIO_15_TO_1);
    expect(p.kind).toBe("regular");
    expect(p.ruleStartDay).toBe(1);
    expect(p.start).toEqual(d("2026-06-01"));
    expect(p.end).toEqual(d("2026-07-01"));
  });
});

describe("api billingPeriod — planTransition", () => {
  it("сегодня 14 мая, 15→1 → transition 15 мая → 31 мая", () => {
    const plan = planTransition(d("2026-05-14"), 15, 1);
    expect(plan!.transitionStart).toEqual(d("2026-05-15"));
    expect(plan!.transitionEnd).toEqual(d("2026-05-31"));
    expect(plan!.firstNewPeriod.start).toEqual(d("2026-06-01"));
  });

  it("сегодня 20 мая, 15→1 → transition 15 июн → 30 июн", () => {
    const plan = planTransition(d("2026-05-20"), 15, 1);
    expect(plan!.transitionStart).toEqual(d("2026-06-15"));
    expect(plan!.transitionEnd).toEqual(d("2026-06-30"));
  });

  it("одинаковое правило → null", () => {
    expect(planTransition(d("2026-05-14"), 15, 15)).toBeNull();
  });

  it("сегодня 5 марта, 10→6 → transition 10 мар → 5 апр", () => {
    const plan = planTransition(d("2026-03-05"), 10, 6);
    expect(plan!.transitionStart).toEqual(d("2026-03-10"));
    expect(plan!.transitionEnd).toEqual(d("2026-04-05"));
    expect(plan!.firstNewPeriod.start).toEqual(d("2026-04-06"));
  });
});

describe("api billingPeriod — isTransitionActive", () => {
  it("сегодня 20 мая, есть transition 15-31 мая → active", () => {
    const r = isTransitionActive(SCENARIO_15_TO_1, d("2026-05-20"));
    expect(r.active).toBe(true);
    if (r.active) expect(r.anchor.id).toBe(2);
  });

  it("сегодня 1 июня → transition уже закончился, not active", () => {
    const r = isTransitionActive(SCENARIO_15_TO_1, d("2026-06-01"));
    expect(r.active).toBe(false);
  });

  it("сегодня 14 мая → transition ещё не начался, not active", () => {
    const r = isTransitionActive(SCENARIO_15_TO_1, d("2026-05-14"));
    expect(r.active).toBe(false);
  });
});

describe("api billingPeriod — currentRuleStartDay", () => {
  it("после transition 15→1 → текущее правило = 1", () => {
    expect(currentRuleStartDay(SCENARIO_15_TO_1)).toBe(1);
  });

  it("только один regular anchor", () => {
    expect(
      currentRuleStartDay([
        {
          id: 1,
          effectiveFrom: "2024-01-01",
          ruleStartDay: 15,
          kind: "regular",
          transitionEndDate: null,
        },
      ]),
    ).toBe(15);
  });

  it("пустой массив → fallback 15", () => {
    expect(currentRuleStartDay([])).toBe(15);
  });
});

describe("api billingPeriod — toISODate", () => {
  it("форматирует Date в YYYY-MM-DD по локальному дню", () => {
    expect(toISODate(d("2026-05-15"))).toBe("2026-05-15");
    expect(toISODate(d("2026-01-05"))).toBe("2026-01-05");
    expect(toISODate(d("2028-02-29"))).toBe("2028-02-29");
  });
});

describe("api billingPeriod — стык с фронтом (одни и те же кейсы должны давать те же даты)", () => {
  // Точки на границе — критичны: фронт и бэк должны попадать в один период.
  const cases: Array<{
    name: string;
    date: string;
    expectedStart: string;
    expectedKind: "regular" | "transition";
  }> = [
    { name: "за день до transition", date: "2026-05-14", expectedStart: "2026-04-15", expectedKind: "regular" },
    { name: "первая ночь transition", date: "2026-05-15T00:00:00.000", expectedStart: "2026-05-15", expectedKind: "transition" },
    { name: "конец transition", date: "2026-05-31T23:59:59.999", expectedStart: "2026-05-15", expectedKind: "transition" },
    { name: "первый день новой эры", date: "2026-06-01", expectedStart: "2026-06-01", expectedKind: "regular" },
    { name: "последний день июня новой эры", date: "2026-06-30T23:59:59.999", expectedStart: "2026-06-01", expectedKind: "regular" },
    { name: "1 июля — следующий regular", date: "2026-07-01", expectedStart: "2026-07-01", expectedKind: "regular" },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const p = periodFor(d(c.date), SCENARIO_15_TO_1);
      expect(toISODate(p.start)).toBe(c.expectedStart);
      expect(p.kind).toBe(c.expectedKind);
    });
  }
});
