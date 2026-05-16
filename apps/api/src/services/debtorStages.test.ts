/**
 * Юнит-тесты конечного автомата стадий долга. Покрывают:
 *  - все разрешённые переходы для всех 5 типов;
 *  - запрещённые переходы → false;
 *  - финальные стадии isClosed/isTerminal;
 *  - primary transition существует и единственный;
 *  - allStagesForType возвращает все достижимые узлы;
 *  - labels.
 */
import { describe, it, expect } from "vitest";
import {
  canTransition,
  nextStages,
  isClosed,
  isTerminal,
  primaryTransition,
  allStagesForType,
  stageLabel,
  typeLabel,
  type DebtType,
  type Stage,
} from "./debtorStages.js";

describe("debtorStages — dtp_guilty", () => {
  it("created → pretrial разрешён", () => {
    expect(canTransition("dtp_guilty", "created", "pretrial")).toBe(true);
  });
  it("created → payment_schedule запрещён (нужно через досудебку)", () => {
    expect(canTransition("dtp_guilty", "created", "payment_schedule")).toBe(false);
  });
  it("pretrial → две ветки: payment_schedule и lawyer", () => {
    const next = nextStages("dtp_guilty", "pretrial").map((t) => t.to);
    expect(next).toEqual(expect.arrayContaining(["payment_schedule", "lawyer"]));
  });
  it("pretrial primary = payment_schedule (признал вину)", () => {
    expect(primaryTransition("dtp_guilty", "pretrial")?.to).toBe("payment_schedule");
  });
  it("lawyer → payment_schedule или court", () => {
    expect(canTransition("dtp_guilty", "lawyer", "payment_schedule")).toBe(true);
    expect(canTransition("dtp_guilty", "lawyer", "court")).toBe(true);
    expect(canTransition("dtp_guilty", "lawyer", "police")).toBe(false);
  });
  it("payment_schedule может откатиться к lawyer (перестал платить)", () => {
    expect(canTransition("dtp_guilty", "payment_schedule", "lawyer")).toBe(true);
  });
  it("court → closed_court или closed_settled", () => {
    expect(canTransition("dtp_guilty", "court", "closed_court")).toBe(true);
    expect(canTransition("dtp_guilty", "court", "closed_settled")).toBe(true);
  });
});

describe("debtorStages — dtp_victim", () => {
  it("линейная цепочка docs → eval → wait → paid", () => {
    expect(canTransition("dtp_victim", "created", "insurance_docs")).toBe(true);
    expect(canTransition("dtp_victim", "insurance_docs", "insurance_eval")).toBe(true);
    expect(canTransition("dtp_victim", "insurance_eval", "insurance_wait")).toBe(true);
    expect(canTransition("dtp_victim", "insurance_wait", "closed_paid")).toBe(true);
  });
  it("нельзя перескакивать через стадии", () => {
    expect(canTransition("dtp_victim", "insurance_docs", "insurance_wait")).toBe(false);
    expect(canTransition("dtp_victim", "insurance_docs", "closed_paid")).toBe(false);
  });
  it("primary на каждой стадии = следующая в цепочке", () => {
    expect(primaryTransition("dtp_victim", "created")?.to).toBe("insurance_docs");
    expect(primaryTransition("dtp_victim", "insurance_docs")?.to).toBe("insurance_eval");
    expect(primaryTransition("dtp_victim", "insurance_eval")?.to).toBe("insurance_wait");
    expect(primaryTransition("dtp_victim", "insurance_wait")?.to).toBe("closed_paid");
  });
  it("у dtp_victim НЕТ перехода в lawyer/court (это потерпевший)", () => {
    expect(canTransition("dtp_victim", "insurance_wait", "lawyer")).toBe(false);
  });
});

describe("debtorStages — damage", () => {
  it("created → payment_schedule напрямую", () => {
    expect(canTransition("damage", "created", "payment_schedule")).toBe(true);
    expect(primaryTransition("damage", "created")?.to).toBe("payment_schedule");
  });
  it("payment_schedule → closed_paid (норма) или lawyer (нарушения)", () => {
    expect(canTransition("damage", "payment_schedule", "closed_paid")).toBe(true);
    expect(canTransition("damage", "payment_schedule", "lawyer")).toBe(true);
  });
});

describe("debtorStages — theft", () => {
  it("две развилки: признал → schedule, не признал → polizia → уголовка", () => {
    expect(canTransition("theft", "pretrial", "payment_schedule")).toBe(true);
    expect(canTransition("theft", "pretrial", "police")).toBe(true);
    expect(canTransition("theft", "police", "criminal_case")).toBe(true);
    expect(canTransition("theft", "criminal_case", "closed_court")).toBe(true);
  });
  it("criminal_case — длинная стадия, ведёт только в closed_court", () => {
    const next = nextStages("theft", "criminal_case").map((t) => t.to);
    expect(next).toEqual(["closed_court"]);
  });
});

describe("debtorStages — rental_overdue", () => {
  it("created → payment_schedule, payment_schedule → 3 опции", () => {
    expect(canTransition("rental_overdue", "created", "payment_schedule")).toBe(true);
    const next = nextStages("rental_overdue", "payment_schedule").map((t) => t.to);
    expect(next).toEqual(
      expect.arrayContaining(["closed_paid", "lawyer", "closed_written_off"]),
    );
  });
});

describe("debtorStages — isClosed / isTerminal", () => {
  it("все closed_* — isClosed", () => {
    expect(isClosed("closed_paid")).toBe(true);
    expect(isClosed("closed_written_off")).toBe(true);
    expect(isClosed("closed_settled")).toBe(true);
    expect(isClosed("closed_court")).toBe(true);
  });
  it("активные — не isClosed", () => {
    expect(isClosed("created")).toBe(false);
    expect(isClosed("payment_schedule")).toBe(false);
    expect(isClosed("criminal_case")).toBe(false);
  });
  it("isTerminal: closed_* + дальше некуда", () => {
    expect(isTerminal("dtp_guilty", "closed_paid")).toBe(true);
    expect(isTerminal("dtp_guilty", "payment_schedule")).toBe(false);
    // criminal_case у theft ведёт в closed_court — не terminal
    expect(isTerminal("theft", "criminal_case")).toBe(false);
    expect(isTerminal("theft", "closed_court")).toBe(true);
  });
});

describe("debtorStages — primary transition уникальность", () => {
  const types: DebtType[] = [
    "dtp_guilty",
    "dtp_victim",
    "damage",
    "theft",
    "rental_overdue",
  ];
  for (const type of types) {
    it(`${type}: на каждой нефинальной стадии есть ровно один primary`, () => {
      for (const stage of allStagesForType(type)) {
        if (isClosed(stage)) continue;
        const transitions = nextStages(type, stage);
        if (transitions.length === 0) continue; // terminal без выходов
        const primaries = transitions.filter((t) => t.primary);
        expect(
          primaries.length,
          `${type}:${stage} должен иметь 1 primary, найдено ${primaries.length}`,
        ).toBe(1);
      }
    });
  }
});

describe("debtorStages — allStagesForType", () => {
  it("dtp_guilty охватывает 6 стадий", () => {
    const stages = allStagesForType("dtp_guilty");
    expect(stages).toEqual(
      expect.arrayContaining([
        "created",
        "pretrial",
        "lawyer",
        "court",
        "payment_schedule",
        "closed_paid",
        "closed_court",
        "closed_settled",
      ]),
    );
  });
  it("dtp_victim — короткая линия", () => {
    const stages = allStagesForType("dtp_victim");
    expect(stages).toEqual([
      "created",
      "insurance_docs",
      "insurance_eval",
      "insurance_wait",
      "closed_paid",
    ]);
  });
  it("damage — компактный набор", () => {
    const stages = allStagesForType("damage");
    expect(stages).toEqual(
      expect.arrayContaining([
        "created",
        "payment_schedule",
        "lawyer",
        "closed_paid",
        "closed_settled",
      ]),
    );
  });
});

describe("debtorStages — labels", () => {
  it("stageLabel русские человекочитаемые", () => {
    expect(stageLabel("created")).toBe("Заведено");
    expect(stageLabel("payment_schedule")).toBe("График платежей");
    expect(stageLabel("closed_paid")).toBe("Закрыто оплатой");
    expect(stageLabel("criminal_case")).toBe("Уголовное дело");
  });
  it("typeLabel русские", () => {
    expect(typeLabel("dtp_guilty")).toBe("ДТП · виновник");
    expect(typeLabel("rental_overdue")).toBe("Просрочка аренды");
  });
});

describe("debtorStages — нет циклов вне разрешённых fallback'ов", () => {
  // Единственный разрешённый «откат назад» — payment_schedule → lawyer
  // (для типов где это имеет смысл). Других обратных переходов быть не должно.
  it("dtp_victim не имеет обратных переходов", () => {
    expect(canTransition("dtp_victim", "insurance_eval", "insurance_docs")).toBe(false);
    expect(canTransition("dtp_victim", "insurance_wait", "insurance_eval")).toBe(false);
  });
  it("dtp_guilty: payment_schedule → lawyer (разрешено)", () => {
    expect(canTransition("dtp_guilty", "payment_schedule", "lawyer")).toBe(true);
  });
  it("dtp_guilty: closed_paid не имеет выходов", () => {
    expect(nextStages("dtp_guilty", "closed_paid")).toEqual([]);
  });
});
