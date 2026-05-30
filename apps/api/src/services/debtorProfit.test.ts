import { describe, it, expect } from "vitest";
import { calculateInsuranceForecast, expectedProfit } from "./debtorProfit.js";

describe("debtorProfit — calculateInsuranceForecast", () => {
  it("не для dtp_victim возвращает null", () => {
    expect(calculateInsuranceForecast({ type: "damage" })).toBeNull();
    expect(calculateInsuranceForecast({ type: "dtp_guilty" })).toBeNull();
  });

  it("стадия before_estimate — пусто", () => {
    const r = calculateInsuranceForecast({ type: "dtp_victim" });
    expect(r?.stage).toBe("before_estimate");
    expect(r?.profit).toBeNull();
  });

  it("стадия estimated — есть оценка, нет выплаты", () => {
    const r = calculateInsuranceForecast({
      type: "dtp_victim",
      insuranceEstimate: 118_200,
    });
    expect(r?.stage).toBe("estimated");
    expect(r?.estimate).toBe(118_200);
    expect(r?.profit).toBeNull();
  });

  it("стадия paid_out — выплата получена, но себестоимость не введена", () => {
    const r = calculateInsuranceForecast({
      type: "dtp_victim",
      insuranceEstimate: 118_200,
      insurancePayout: 115_000,
    });
    expect(r?.stage).toBe("paid_out");
    expect(r?.payout).toBe(115_000);
    expect(r?.profit).toBeNull();
  });

  it("стадия complete — прибыль = payout − repairCost", () => {
    const r = calculateInsuranceForecast({
      type: "dtp_victim",
      insuranceEstimate: 118_200,
      insurancePayout: 115_000,
      repairCost: 75_000,
    });
    expect(r?.stage).toBe("complete");
    expect(r?.profit).toBe(40_000);
  });

  it("убыток (ремонт дороже выплаты) — отрицательная прибыль", () => {
    const r = calculateInsuranceForecast({
      type: "dtp_victim",
      insurancePayout: 50_000,
      repairCost: 75_000,
    });
    expect(r?.profit).toBe(-25_000);
  });
});

describe("debtorProfit — expectedProfit", () => {
  it("по фактической выплате если она есть", () => {
    expect(
      expectedProfit({
        type: "dtp_victim",
        insurancePayout: 120_000,
        repairCost: 75_000,
      }),
    ).toBe(45_000);
  });

  it("по оценке если выплаты ещё нет", () => {
    expect(
      expectedProfit({
        type: "dtp_victim",
        insuranceEstimate: 118_200,
        repairCost: 75_000,
      }),
    ).toBe(43_200);
  });

  it("если ремонт не введён — null", () => {
    expect(
      expectedProfit({
        type: "dtp_victim",
        insuranceEstimate: 118_200,
      }),
    ).toBeNull();
  });

  it("не для dtp_victim — null", () => {
    expect(
      expectedProfit({
        type: "damage",
        insuranceEstimate: 100_000,
        repairCost: 50_000,
      }),
    ).toBeNull();
  });
});
