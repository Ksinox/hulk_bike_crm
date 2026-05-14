/**
 * Сценарные тесты выручки через стык эр расчётного периода.
 *
 * Проверяем, что revenueFromPayments выдаёт корректные суммы для
 * каждого периода (старый regular, transition, новый regular) и что
 * платежи на границах попадают в один период, не дублируясь между
 * двумя.
 *
 * SCENARIO: эра 15→14 началась 2024-01-01, 14 мая 2026 переключение
 * на правило 1, transition 15 мая → 31 мая, с 1 июня — regular 1→last.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  setBillingPeriodAnchors,
  periodFor,
  type BillingAnchor,
} from "./billingPeriod";
import { revenueFromPayments } from "./revenue";
import type { ApiPayment } from "./api/payments";

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

/** Фабрика тестового платежа. По умолчанию rent / paid / 1000₽. */
function makePayment(
  paidAtIso: string,
  amount: number = 1000,
  overrides: Partial<ApiPayment> = {},
): ApiPayment {
  return {
    id: Math.floor(Math.random() * 1_000_000),
    rentalId: 1,
    clientId: 1,
    amount,
    type: "rent",
    method: "cash",
    paid: true,
    paidAt: paidAtIso,
    confirmedAt: paidAtIso,
    createdAt: paidAtIso,
    note: null,
    receiptUrl: null,
    receiptKey: null,
    pendingProofUrl: null,
    pendingProofKey: null,
    initiatorUserId: null,
    confirmedByUserId: null,
    extensionId: null,
    ...overrides,
  } as ApiPayment;
}

describe("revenue — выручка через стык эр", () => {
  beforeEach(() => setBillingPeriodAnchors(SCENARIO_15_TO_1));

  // Все ISO-строки БЕЗ "Z" → парсятся как локальное время, тесты
  // детерминированы независимо от TZ vitest-окружения. Граничные
  // моменты выбраны заведомо подальше от полуночи, чтобы исключить
  // эффекты округления.
  //
  // Раскладка по периодам (локальное время):
  //   старый      15 апр 00:00 → 15 мая 00:00 (exclusive)
  //   transition  15 мая 00:00 → 1 июн 00:00 (exclusive)
  //   новый      1 июн 00:00 → 1 июл 00:00 (exclusive)
  const payments: ApiPayment[] = [
    // Старый период
    makePayment("2026-04-20T10:00:00", 1500),
    makePayment("2026-05-14T22:00:00", 700), // глубоко в последнем дне старого
    // Transition
    makePayment("2026-05-15T01:00:00", 2000), // первый час transition
    makePayment("2026-05-20T12:00:00", 3000),
    makePayment("2026-05-31T22:00:00", 800), // последний день transition
    // Новый период (июнь)
    makePayment("2026-06-01T01:00:00", 5000),
    makePayment("2026-06-15T14:00:00", 4000),
    // Депозит и refund — не должны учитываться вообще
    makePayment("2026-05-20T12:00:00", 9999, { type: "deposit" }),
    makePayment("2026-05-20T12:00:00", 8888, { type: "refund" }),
    // Method=deposit — оплата из залога, не выручка
    makePayment("2026-05-20T12:00:00", 7777, { method: "deposit" }),
    // Не оплачен — не выручка
    makePayment("2026-05-20T12:00:00", 6666, { paid: false }),
  ];

  it("старый период собирает только свои платежи", () => {
    const p = periodFor(new Date("2026-04-20T00:00:00.000Z"));
    const sum = revenueFromPayments(payments, p.start, p.end);
    expect(sum).toBe(1500 + 700);
  });

  it("transition собирает свои три платежа", () => {
    const p = periodFor(new Date("2026-05-20T00:00:00.000Z"));
    expect(p.kind).toBe("transition");
    const sum = revenueFromPayments(payments, p.start, p.end);
    expect(sum).toBe(2000 + 3000 + 800);
  });

  it("новый regular период (июнь) собирает только свои", () => {
    const p = periodFor(new Date("2026-06-10T00:00:00.000Z"));
    const sum = revenueFromPayments(payments, p.start, p.end);
    expect(sum).toBe(5000 + 4000);
  });

  it("платёж не попадает в два периода (граница исключительна)", () => {
    // 1 июня 01:00 — попадает только в июнь, не в transition.
    const transitionP = periodFor(new Date("2026-05-20"));
    const juneP = periodFor(new Date("2026-06-10"));
    const sumT = revenueFromPayments(payments, transitionP.start, transitionP.end);
    const sumJ = revenueFromPayments(payments, juneP.start, juneP.end);
    // 5000 (1 июня) только в июне
    expect(sumT).not.toContain;
    expect(sumJ).toBe(5000 + 4000);
    // И transition содержит только три платежа, без 5000
    expect(sumT).toBe(2000 + 3000 + 800);
  });

  it("суммы всех трёх периодов = выручка всех валидных платежей", () => {
    const oldP = periodFor(new Date("2026-04-20"));
    const trP = periodFor(new Date("2026-05-20"));
    const newP = periodFor(new Date("2026-06-10"));
    const total =
      revenueFromPayments(payments, oldP.start, oldP.end) +
      revenueFromPayments(payments, trP.start, trP.end) +
      revenueFromPayments(payments, newP.start, newP.end);
    // 1500+700 + 2000+3000+800 + 5000+4000 = 17000
    expect(total).toBe(17000);
  });

  it("deposit / refund / method=deposit / paid=false НЕ входят", () => {
    // Запросим все 4 периода вместе через очень широкий range
    const sum = revenueFromPayments(
      payments,
      new Date("2026-01-01"),
      new Date("2027-01-01"),
    );
    expect(sum).toBe(17000);
    // 9999 (deposit) + 8888 (refund) + 7777 (method=deposit) + 6666 (paid=false) ≠ учтены
  });
});

describe("revenue — переключение 15→1 само по себе не меняет старые суммы", () => {
  // Регрессионный тест: после переключения исторические периоды должны
  // считаться по СВОИМ старым правилам, а не задним числом по новым.
  const oldOnly: BillingAnchor[] = [
    {
      id: 1,
      effectiveFrom: "2024-01-01",
      ruleStartDay: 15,
      kind: "regular",
      transitionEndDate: null,
    },
  ];

  const payments: ApiPayment[] = [
    makePayment("2026-03-20T10:00:00", 1500),
    makePayment("2026-04-10T10:00:00", 2500),
  ];

  it("до переключения: март считается как 15 мар → 14 апр", () => {
    setBillingPeriodAnchors(oldOnly);
    const p = periodFor(new Date("2026-03-20"));
    const sum = revenueFromPayments(payments, p.start, p.end);
    // 15 мар → 14 апр включает оба платежа
    expect(sum).toBe(1500 + 2500);
  });

  it("после переключения 15→1: ТО ЖЕ САМОЕ — анкор старой эры действует на март", () => {
    setBillingPeriodAnchors(SCENARIO_15_TO_1);
    const p = periodFor(new Date("2026-03-20"));
    expect(p.kind).toBe("regular");
    expect(p.ruleStartDay).toBe(15);
    const sum = revenueFromPayments(payments, p.start, p.end);
    expect(sum).toBe(1500 + 2500);
  });
});
