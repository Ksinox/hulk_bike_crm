import { useState } from "react";
import { Check, Plus, Trash2, UserRound, X } from "lucide-react";
import { toast, confirmDialog } from "@/lib/toast";
import {
  useCreateFinancePerson,
  useDeleteFinancePerson,
  useFinancePeople,
  useUpdateFinancePayroll,
  useUpdateFinancePerson,
  type FinancePayrollRow,
} from "@/lib/api/finance";
import { fmtMoney } from "./Finance";
import {
  Btn,
  EmptyHint,
  Field,
  MoneyCell,
  MoneyInput,
  PercentInput,
  SectionCard,
  TextInput,
} from "./ui";

/**
 * ФОТ за период: оклад + процент с продаж.
 *
 * Правка заказчика 20.09: «процент с продаж» должен быть процентом, а не
 * просто суммой — иначе непонятно, откуда взялась премия и сколько человеку
 * вообще положено. Поэтому в строке понятные поля:
 *
 *   оклад · процент человека · продажи за период → премия считается сама.
 *
 * Премию можно вписать и руками (бывает, что договорились иначе) — тогда она
 * остаётся как вписали, пока не поменяешь базу или процент. Процент живёт в
 * карточке человека и подставляется в новые периоды, а в периоде хранится
 * тот, что действовал: поменяли ставку — прошлые месяцы не переписываются.
 *
 * Список людей свой, не учётки CRM: у механика и подсобника логина нет, а в
 * фонд оплаты труда они попадают.
 */

export function FinancePayroll({
  rows,
  rangeLabel,
}: {
  rows: FinancePayrollRow[];
  rangeLabel: string;
}) {
  const { data: people = [] } = useFinancePeople();
  const updateRow = useUpdateFinancePayroll();
  const createPerson = useCreateFinancePerson();
  const updatePerson = useUpdateFinancePerson();
  const deletePerson = useDeleteFinancePerson();
  const [adding, setAdding] = useState<{
    name: string;
    role: string;
    salary: number;
    pct: number;
  } | null>(null);

  const salaries = rows.reduce((s, r) => s + r.salary, 0);
  const bonuses = rows.reduce((s, r) => s + r.salesBonus, 0);
  const total = salaries + bonuses;

  const addPerson = async () => {
    if (!adding) return;
    const name = adding.name.trim();
    if (!name) {
      toast.error("Нужно имя", "Например «Кирилл»");
      return;
    }
    await createPerson.mutateAsync({
      name,
      role: adding.role.trim() || null,
      salaryDefault: adding.salary,
      salesPct: adding.pct,
    });
    toast.success(
      "Человек добавлен",
      `${name}${adding.salary ? ` · оклад ${fmtMoney(adding.salary)}` : ""}${adding.pct ? ` · ${adding.pct}% с продаж` : ""}`,
    );
    setAdding(null);
  };

  const removePerson = async (personId: number | null, name: string) => {
    if (!personId) return;
    const ok = await confirmDialog({
      title: `Убрать ${name} из ФОТ?`,
      message: "Прошлые периоды останутся как были — в новых человек появляться не будет.",
      confirmText: "Убрать",
    });
    if (!ok) return;
    await deletePerson.mutateAsync(personId);
    toast.success("Убрали из ФОТ", name);
  };

  /** Премия пересчитывается, когда меняют базу или процент. */
  const recalc = (row: FinancePayrollRow, patch: { salesBase?: number; salesPct?: number }) => {
    const base = patch.salesBase ?? row.salesBase;
    const pct = patch.salesPct ?? row.salesPct;
    return { ...patch, salesBonus: Math.round((base * pct) / 100) };
  };

  return (
    <SectionCard
      title="ФОТ за период"
      hint={`${rangeLabel} · оклад плюс процент с продаж. Сумма попадает в расход периода отдельной строкой.`}
      right={
        !adding && (
          <Btn tone="primary" onClick={() => setAdding({ name: "", role: "", salary: 0, pct: 0 })}>
            <Plus size={16} /> Человек
          </Btn>
        )
      }
    >
      {adding && (
        <div className="mb-3 rounded-2xl border border-ink/15 bg-surface-soft p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-2">
              Новый человек в ФОТ
            </div>
            <button
              type="button"
              onClick={() => setAdding(null)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
              title="Закрыть"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_150px_120px_auto]">
            <Field label="Имя">
              <TextInput
                autoFocus
                value={adding.name}
                placeholder="Кирилл"
                onChange={(e) => setAdding({ ...adding, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addPerson();
                }}
              />
            </Field>
            <Field label="Кто это">
              <TextInput
                value={adding.role}
                placeholder="механик"
                onChange={(e) => setAdding({ ...adding, role: e.target.value })}
              />
            </Field>
            <Field label="Оклад">
              <MoneyInput
                value={adding.salary}
                onChange={(v) => setAdding({ ...adding, salary: v })}
                onEnter={() => void addPerson()}
              />
            </Field>
            <Field label="% с продаж">
              <PercentInput value={adding.pct} onCommit={(v) => setAdding({ ...adding, pct: v })} />
            </Field>
            <div className="flex items-end">
              <Btn tone="primary" onClick={() => void addPerson()} className="w-full sm:w-auto">
                <Check size={16} /> Добавить
              </Btn>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            Оклад и процент подставятся в каждый новый период — останется внести продажи за период.
          </p>
        </div>
      )}

      {rows.length === 0 && !adding ? (
        <EmptyHint text="В ФОТ пока никого нет. Добавьте людей с окладом и процентом — дальше в каждом периоде останется внести только продажи." />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const person = people.find((p) => p.id === r.personId);
            const auto = Math.round((r.salesBase * r.salesPct) / 100);
            const manual = r.salesBonus !== auto;
            return (
              <div key={r.id} className="rounded-xl border border-border bg-white px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-muted-2">
                      <UserRound size={16} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold text-ink">
                        {r.personName}
                      </div>
                      {person?.role && (
                        <div className="truncate text-[11.5px] text-muted">{person.role}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-2">
                        К выплате
                      </div>
                      <div className="font-display text-[17px] font-extrabold tabular-nums text-ink">
                        {fmtMoney(r.salary + r.salesBonus)}
                      </div>
                    </div>
                    <Btn
                      tone="danger"
                      className="h-10 px-3"
                      title="Убрать из ФОТ"
                      onClick={() => void removePerson(r.personId, r.personName)}
                    >
                      <Trash2 size={14} />
                    </Btn>
                  </div>
                </div>

                {/* Четыре поля в одном ряду: из чего сложилась выплата. */}
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Field label="Оклад">
                    <MoneyCell
                      value={r.salary}
                      onCommit={(v) => void updateRow.mutateAsync({ id: r.id, salary: v })}
                    />
                  </Field>
                  <Field label="Процент с продаж">
                    <PercentInput
                      value={r.salesPct}
                      onCommit={(v) => {
                        void updateRow.mutateAsync({ id: r.id, ...recalc(r, { salesPct: v }) });
                        if (person && person.salesPct !== v) {
                          void updatePerson.mutateAsync({ id: person.id, salesPct: v });
                        }
                      }}
                    />
                  </Field>
                  <Field label="Продажи за период">
                    <MoneyCell
                      value={r.salesBase}
                      onCommit={(v) =>
                        void updateRow.mutateAsync({ id: r.id, ...recalc(r, { salesBase: v }) })
                      }
                    />
                  </Field>
                  <Field label="Премия">
                    <MoneyCell
                      value={r.salesBonus}
                      onCommit={(v) => void updateRow.mutateAsync({ id: r.id, salesBonus: v })}
                    />
                  </Field>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
                  <span>
                    {r.salesPct > 0 && r.salesBase > 0
                      ? `${r.salesPct}% от ${fmtMoney(r.salesBase)} = ${fmtMoney(auto)}`
                      : "внесите процент и продажи — премия посчитается сама"}
                  </span>
                  {manual && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">
                      премия вписана вручную
                    </span>
                  )}
                  {person && person.salaryDefault !== r.salary && (
                    <button
                      type="button"
                      onClick={() => {
                        void updatePerson.mutateAsync({ id: person.id, salaryDefault: r.salary });
                        toast.success(
                          "Оклад запомнили",
                          `${r.personName}: в новые периоды будет подставляться ${fmtMoney(r.salary)}`,
                        );
                      }}
                      className="font-semibold text-blue-700 hover:text-ink"
                    >
                      запомнить оклад {fmtMoney(r.salary)} на будущее
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-soft px-3 py-3">
            <Total label="Оклады" value={salaries} />
            <Total label="Премия с продаж" value={bonuses} />
            <Total label="ФОТ итого" value={total} strong />
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function Total({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-2">
        {label}
      </div>
      <div
        className={
          strong
            ? "font-display text-[18px] font-extrabold tabular-nums text-ink"
            : "font-display text-[16px] font-bold tabular-nums text-ink-2"
        }
      >
        {fmtMoney(value)}
      </div>
    </div>
  );
}
