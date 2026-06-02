/**
 * Юнит-тесты резолвера расчётного периода.
 *
 * Покрывают:
 *  - regular-периоды для разных правил (15, 1, 10)
 *  - попадание на границы (последний день/первый день — exclusive end)
 *  - transition: вход, тело, выход, дата после transition использует
 *    новое правило
 *  - дата ДО первого якоря — fallback на правило первого якоря
 *  - listRecentBillingPeriods через стык эр
 *  - planTransition для разных сценариев (сегодня = последний день
 *    периода / середина периода / нестандартное новое правило)
 *  - високосный февраль
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  setBillingPeriodAnchors,
  periodFor,
  currentBillingPeriod,
  listRecentBillingPeriods,
  planTransition,
  isInBillingPeriod,
  type BillingAnchor,
} from "./billingPeriod";

/** Анкоры под сценарий «была эра 15→14, 14 мая 2026 переключили на 1». */
const SCENARIO_15_TO_1: BillingAnchor[] = [
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

/** Хелпер: создать локальный Date без сюрпризов TZ. */
function d(iso: string): Date {
  // iso вида "2026-05-14" или "2026-05-14T23:59:59.999"
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

describe("billingPeriod — regular правило 15→14 (старая схема)", () => {
  beforeEach(() => setBillingPeriodAnchors(SCENARIO_15_TO_1));

  it("середина периода: 20 марта → период 15 мар → 14 апр", () => {
    const p = periodFor(d("2026-03-20"));
    expect(p.kind).toBe("regular");
    expect(p.ruleStartDay).toBe(15);
    expect(p.start).toEqual(d("2026-03-15"));
    expect(p.end).toEqual(d("2026-04-15"));
    expect(p.label).toBe("15 мар — 14 апр");
  });

  it("последний день периода (14 мая) — всё ещё в старой эре", () => {
    const p = periodFor(d("2026-05-14"));
    expect(p.kind).toBe("regular");
    expect(p.ruleStartDay).toBe(15);
    expect(p.start).toEqual(d("2026-04-15"));
    expect(p.end).toEqual(d("2026-05-15"));
  });

  it("23:59:59.999 на 14 мая — всё ещё старая эра (end exclusive)", () => {
    const p = periodFor(d("2026-05-14T23:59:59.999"));
    expect(p.kind).toBe("regular");
    expect(p.ruleStartDay).toBe(15);
    expect(p.start).toEqual(d("2026-04-15"));
  });

  it("первое число месяца до startDay → период начался в прошлом месяце", () => {
    const p = periodFor(d("2026-03-01"));
    expect(p.start).toEqual(d("2026-02-15"));
    expect(p.end).toEqual(d("2026-03-15"));
  });
});

describe("billingPeriod — transition", () => {
  beforeEach(() => setBillingPeriodAnchors(SCENARIO_15_TO_1));

  it("первый день transition (15 мая) — kind=transition", () => {
    const p = periodFor(d("2026-05-15"));
    expect(p.kind).toBe("transition");
    expect(p.ruleStartDay).toBe(1);
    expect(p.start).toEqual(d("2026-05-15"));
    expect(p.end).toEqual(d("2026-06-01"));
    expect(p.label).toBe("15 май — 31 май (переходный)");
  });

  it("00:00:00 на 15 мая — уже transition (start inclusive)", () => {
    const p = periodFor(d("2026-05-15T00:00:00.000"));
    expect(p.kind).toBe("transition");
  });

  it("середина transition — 20 мая", () => {
    const p = periodFor(d("2026-05-20"));
    expect(p.kind).toBe("transition");
    expect(p.start).toEqual(d("2026-05-15"));
    expect(p.end).toEqual(d("2026-06-01"));
  });

  it("последний день transition — 31 мая 23:59:59.999", () => {
    const p = periodFor(d("2026-05-31T23:59:59.999"));
    expect(p.kind).toBe("transition");
    expect(p.start).toEqual(d("2026-05-15"));
    expect(p.end).toEqual(d("2026-06-01"));
  });
});

describe("billingPeriod — новая эра regular 1→last (после transition)", () => {
  beforeEach(() => setBillingPeriodAnchors(SCENARIO_15_TO_1));

  it("первый день новой эры — 1 июня", () => {
    const p = periodFor(d("2026-06-01"));
    expect(p.kind).toBe("regular");
    expect(p.ruleStartDay).toBe(1);
    expect(p.start).toEqual(d("2026-06-01"));
    expect(p.end).toEqual(d("2026-07-01"));
    expect(p.label).toBe("01 июн — 30 июн");
  });

  it("середина июля", () => {
    const p = periodFor(d("2026-07-17"));
    expect(p.start).toEqual(d("2026-07-01"));
    expect(p.end).toEqual(d("2026-08-01"));
    expect(p.label).toBe("01 июл — 31 июл");
  });

  it("февраль 2027 невисокосный — 1 фев → 28 фев", () => {
    const p = periodFor(d("2027-02-10"));
    expect(p.start).toEqual(d("2027-02-01"));
    expect(p.end).toEqual(d("2027-03-01"));
    expect(p.label).toBe("01 фев — 28 фев");
  });

  it("февраль 2028 високосный — 1 фев → 29 фев", () => {
    const p = periodFor(d("2028-02-10"));
    expect(p.start).toEqual(d("2028-02-01"));
    expect(p.end).toEqual(d("2028-03-01"));
    expect(p.label).toBe("01 фев — 29 фев");
  });
});

describe("billingPeriod — fallback и edge", () => {
  it("без якорей вообще — fallback на 15→14", () => {
    setBillingPeriodAnchors([]);
    const p = periodFor(d("2026-05-20"));
    expect(p.ruleStartDay).toBe(15);
    expect(p.start).toEqual(d("2026-05-15"));
  });

  it("дата до первого якоря (2024-01-01) — берём правило первого якоря", () => {
    setBillingPeriodAnchors([
      {
        id: 1,
        effectiveFrom: "2024-01-01",
        ruleStartDay: 15,
        kind: "regular",
        transitionEndDate: null,
      },
    ]);
    const p = periodFor(d("2020-06-10"));
    // anchors[0] всё равно становится active благодаря инициализации
    // активного как первого элемента. ruleStartDay=15.
    expect(p.ruleStartDay).toBe(15);
  });

  it("isInBillingPeriod — start inclusive, end exclusive", () => {
    setBillingPeriodAnchors(SCENARIO_15_TO_1);
    const p = periodFor(d("2026-03-20"));
    expect(isInBillingPeriod(d("2026-03-15"), p)).toBe(true);
    expect(isInBillingPeriod(d("2026-04-14T23:59:59.999"), p)).toBe(true);
    expect(isInBillingPeriod(d("2026-04-15"), p)).toBe(false);
    expect(isInBillingPeriod(d("2026-03-14T23:59:59.999"), p)).toBe(false);
  });
});

describe("billingPeriod — listRecentBillingPeriods через стык эр", () => {
  beforeEach(() => setBillingPeriodAnchors(SCENARIO_15_TO_1));

  it("now = 5 июля 2026 → июль regular, transition, апр-май, мар-апр…", () => {
    const list = listRecentBillingPeriods(5, d("2026-07-05"));
    expect(list).toHaveLength(5);
    // [0] — текущий: июль regular новой эры
    expect(list[0]!.kind).toBe("regular");
    expect(list[0]!.start).toEqual(d("2026-07-01"));
    expect(list[0]!.end).toEqual(d("2026-08-01"));
    // [1] — июнь regular новой эры
    expect(list[1]!.kind).toBe("regular");
    expect(list[1]!.start).toEqual(d("2026-06-01"));
    // [2] — transition 15 май — 31 май
    expect(list[2]!.kind).toBe("transition");
    expect(list[2]!.start).toEqual(d("2026-05-15"));
    expect(list[2]!.end).toEqual(d("2026-06-01"));
    // [3] — апр-май старой эры
    expect(list[3]!.kind).toBe("regular");
    expect(list[3]!.ruleStartDay).toBe(15);
    expect(list[3]!.start).toEqual(d("2026-04-15"));
    // [4] — мар-апр старой эры
    expect(list[4]!.start).toEqual(d("2026-03-15"));
  });
});

describe("billingPeriod — planTransition", () => {
  it("Сценарий А: сегодня 14 мая (последний день старого периода), 15→1", () => {
    const plan = planTransition(d("2026-05-14"), 15, 1);
    expect(plan).not.toBeNull();
    expect(plan!.currentPeriod.start).toEqual(d("2026-04-15"));
    expect(plan!.currentPeriod.end).toEqual(d("2026-05-15"));
    expect(plan!.transitionStart).toEqual(d("2026-05-15"));
    expect(plan!.transitionEnd).toEqual(d("2026-05-31"));
    expect(plan!.firstNewPeriod.start).toEqual(d("2026-06-01"));
    expect(plan!.firstNewPeriod.end).toEqual(d("2026-07-01"));
  });

  it("Сценарий Б: сегодня 20 мая (середина старого периода), 15→1", () => {
    const plan = planTransition(d("2026-05-20"), 15, 1);
    expect(plan!.currentPeriod.start).toEqual(d("2026-05-15"));
    expect(plan!.currentPeriod.end).toEqual(d("2026-06-15"));
    expect(plan!.transitionStart).toEqual(d("2026-06-15"));
    expect(plan!.transitionEnd).toEqual(d("2026-06-30"));
    expect(plan!.firstNewPeriod.start).toEqual(d("2026-07-01"));
  });

  it("Сценарий В: 10→6 в середине марта", () => {
    const plan = planTransition(d("2026-03-05"), 10, 6);
    // Текущий период под правилом 10: Feb 10 → Mar 10
    expect(plan!.currentPeriod.start).toEqual(d("2026-02-10"));
    expect(plan!.currentPeriod.end).toEqual(d("2026-03-10"));
    // Transition: Mar 10 → Apr 5 (день перед первым 6-м)
    expect(plan!.transitionStart).toEqual(d("2026-03-10"));
    expect(plan!.transitionEnd).toEqual(d("2026-04-05"));
    expect(plan!.firstNewPeriod.start).toEqual(d("2026-04-06"));
  });

  it("Одинаковое правило → null (нечего переключать)", () => {
    expect(planTransition(d("2026-05-14"), 15, 15)).toBeNull();
    expect(planTransition(d("2026-05-14"), 1, 1)).toBeNull();
  });

  it("Переключение в день старта старого правила", () => {
    // сегодня 15 мая — старый период только что начался: 15 май → 14 июн.
    // 15→1: transition должен пойти 15 июн → 30 июн, новая эра с 1 июл.
    const plan = planTransition(d("2026-05-15"), 15, 1);
    expect(plan!.currentPeriod.start).toEqual(d("2026-05-15"));
    expect(plan!.currentPeriod.end).toEqual(d("2026-06-15"));
    expect(plan!.transitionStart).toEqual(d("2026-06-15"));
    expect(plan!.transitionEnd).toEqual(d("2026-06-30"));
  });
});

describe("billingPeriod — currentBillingPeriod = periodFor(now)", () => {
  beforeEach(() => setBillingPeriodAnchors(SCENARIO_15_TO_1));

  it("now = середина transition → возвращает transition", () => {
    const p = currentBillingPeriod(d("2026-05-20"));
    expect(p.kind).toBe("transition");
  });

  it("now в новой эре → regular новой схемы", () => {
    const p = currentBillingPeriod(d("2026-07-10"));
    expect(p.kind).toBe("regular");
    expect(p.ruleStartDay).toBe(1);
  });

  it("now в старой эре → regular старой схемы", () => {
    const p = currentBillingPeriod(d("2026-04-20"));
    expect(p.kind).toBe("regular");
    expect(p.ruleStartDay).toBe(15);
  });
});

describe("billingPeriod — несколько anchor'ов подряд", () => {
  it("три эры: 15→14, transition май, потом regular 1, потом переключение на 5", () => {
    setBillingPeriodAnchors([
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
      {
        id: 3,
        effectiveFrom: "2026-09-01",
        ruleStartDay: 5,
        kind: "transition",
        transitionEndDate: "2026-09-04",
      },
    ]);

    // Старая эра
    expect(periodFor(d("2026-04-20")).ruleStartDay).toBe(15);
    // Transition май
    expect(periodFor(d("2026-05-20")).kind).toBe("transition");
    expect(periodFor(d("2026-05-20")).ruleStartDay).toBe(1);
    // После майского transition — regular 1
    expect(periodFor(d("2026-07-10")).ruleStartDay).toBe(1);
    expect(periodFor(d("2026-08-31")).start).toEqual(d("2026-08-01"));
    // Сентябрьский transition 1→5
    const sep2 = periodFor(d("2026-09-02"));
    expect(sep2.kind).toBe("transition");
    expect(sep2.start).toEqual(d("2026-09-01"));
    expect(sep2.end).toEqual(d("2026-09-05"));
    // После сентябрьского transition — regular 5
    const sep10 = periodFor(d("2026-09-10"));
    expect(sep10.kind).toBe("regular");
    expect(sep10.ruleStartDay).toBe(5);
    expect(sep10.start).toEqual(d("2026-09-05"));
    expect(sep10.end).toEqual(d("2026-10-05"));
  });
});
