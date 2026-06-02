/**
 * Корневой компонент модуля «Должники».
 *
 * Внутренняя навигация (без URL — через локальное состояние):
 *   - landing  → Утро (hero + queue)
 *   - new      → wizard создания
 *   - case:N   → workspace по делу N
 *   - payment:N → форма платежа для дела N
 *   - list     → таблица всех
 *
 * Каждый sub-screen возвращает callback'и `onOpenCase(id)` / `onClose()` —
 * чтобы перемещаться по флоу.
 */
import { useEffect, useState } from "react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { consumePending } from "@/app/navigationStore";
import { DebtorsMorning } from "./DebtorsMorning";
import { DebtorsList } from "./DebtorsList";
import { DebtorsEmpty } from "./DebtorsEmpty";
import { DebtorCase } from "./DebtorCase";
import { DebtorPaymentScreen } from "./DebtorPaymentScreen";
import { DebtorNewWizard } from "./DebtorNewWizard";
import { useDebtorsToday } from "@/lib/api/debtors";

type Sub =
  | { kind: "landing" }
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "case"; id: number }
  | { kind: "payment"; id: number; paymentN?: number };

export function Debtors() {
  const [sub, setSub] = useState<Sub>({ kind: "landing" });
  const todayQ = useDebtorsToday();

  // Deep-link из карточки клиента: navigate({route:"debtors", debtorId}) →
  // сразу открываем нужное дело.
  useEffect(() => {
    const p = consumePending("debtors");
    if (p?.debtorId) setSub({ kind: "case", id: p.debtorId });
  }, []);

  const isEmpty =
    todayQ.data != null && todayQ.data.totalActiveCount === 0;

  let body: React.ReactNode;
  if (sub.kind === "new") {
    body = (
      <DebtorNewWizard
        onClose={() => setSub({ kind: "landing" })}
        onCreated={(id) => setSub({ kind: "case", id })}
      />
    );
  } else if (sub.kind === "list") {
    body = (
      <DebtorsList
        onOpenCase={(id) => setSub({ kind: "case", id })}
        onBack={() => setSub({ kind: "landing" })}
        onAddNew={() => setSub({ kind: "new" })}
      />
    );
  } else if (sub.kind === "case") {
    body = (
      <DebtorCase
        id={sub.id}
        onBack={() => setSub({ kind: "landing" })}
        onOpenPayment={(paymentN) =>
          setSub({ kind: "payment", id: sub.id, paymentN })
        }
      />
    );
  } else if (sub.kind === "payment") {
    body = (
      <DebtorPaymentScreen
        id={sub.id}
        paymentN={sub.paymentN}
        onClose={() => setSub({ kind: "case", id: sub.id })}
      />
    );
  } else if (isEmpty) {
    body = <DebtorsEmpty onAddFirst={() => setSub({ kind: "new" })} />;
  } else {
    body = (
      <DebtorsMorning
        onOpenCase={(id) => setSub({ kind: "case", id })}
        onAddNew={() => setSub({ kind: "new" })}
        onOpenList={() => setSub({ kind: "list" })}
      />
    );
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />
      {body}
    </main>
  );
}
