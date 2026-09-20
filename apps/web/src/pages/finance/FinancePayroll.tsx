import { useState } from "react";
import { Plus, Trash2, UserRound, X } from "lucide-react";
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
import { Btn, EmptyHint, Field, MoneyCell, MoneyInput, SectionCard, TextInput } from "./ui";

/**
 * ФОТ за период: оклад + процент с продаж.
 *
 * Список людей — свой, не учётки CRM: у механика и подсобника логина нет, а
 * в фонд оплаты труда они попадают. Оклад подставляется из карточки человека
 * и правится прямо в периоде: премия и переработки у всех разные.
 *
 * Процент с продаж вносится руками — блок «Финансы» изолирован и из
 * «Продаж» ничего не тянет (решение заказчика). Зато сразу видно, сколько
 * суммарно люди заработали процентом.
 */

export function FinancePayroll({ rows }: { rows: FinancePayrollRow[] }) {
  const { data: people = [] } = useFinancePeople();
  const updateRow = useUpdateFinancePayroll();
  const createPerson = useCreateFinancePerson();
  const updatePerson = useUpdateFinancePerson();
  const deletePerson = useDeleteFinancePerson();
  const [adding, setAdding] = useState<{ name: string; role: string; salary: number } | null>(null);

  const salaries = rows.reduce((s, r) => s + r.salary, 0);
  const bonuses = rows.reduce((s, r) => s + r.salesBonus, 0);
  const total = salaries + bonuses;

  const addPerson = async () => {
    if (!adding) return;
    const name = adding.name.trim();
    if (!name) {
      toast.error("Нужно имя", "Например «Кирилл, механик»");
      return;
    }
    await createPerson.mutateAsync({
      name,
      role: adding.role.trim() || null,
      salaryDefault: adding.salary,
    });
    toast.success("Человек добавлен", `${name}${adding.salary ? ` · оклад ${fmtMoney(adding.salary)}` : ""}`);
    setAdding(null);
  };

  const removePerson = async (personId: number | null, name: string) => {
    if (!personId) return;
    const ok = await confirmDialog({
      title: `Убрать ${name} из ФОТ?`,
      message: "Прошлые месяцы останутся как есть — в новых периодах человек появляться не будет.",
      confirmText: "Убрать",
    });
    if (!ok) return;
    await deletePerson.mutateAsync(personId);
    toast.success("Убрали из ФОТ", name);
  };

  return (
    <SectionCard
      title="ФОТ за период"
      hint="Оклад плюс процент с продаж. Сумма попадает в расход периода отдельной строкой."
      right={
        <Btn tone="primary" onClick={() => setAdding({ name: "", role: "", salary: 0 })}>
          <Plus size={16} /> Человек
        </Btn>
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
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_180px_160px]">
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
          </div>
          <div className="mt-2.5 flex gap-2">
            <Btn tone="primary" onClick={() => void addPerson()} className="flex-1 sm:flex-none">
              Добавить
            </Btn>
            <Btn onClick={() => setAdding(null)} className="flex-1 sm:flex-none">
              Отмена
            </Btn>
          </div>
        </div>
      )}

      {rows.length === 0 && !adding ? (
        <EmptyHint text="В ФОТ пока никого нет. Добавьте людей — оклад подставится в каждый новый период, останется только внести процент с продаж." />
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((r) => {
            const person = people.find((p) => p.id === r.personId);
            return (
              <div
                key={r.id}
                className="grid grid-cols-2 items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 sm:grid-cols-[1fr_150px_150px_130px_auto]"
              >
                <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-muted-2">
                    <UserRound size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-ink">{r.personName}</div>
                    {person?.role && (
                      <div className="truncate text-[11.5px] text-muted">{person.role}</div>
                    )}
                  </div>
                </div>
                <Field label="Оклад">
                  <MoneyCell
                    value={r.salary}
                    onCommit={(v) => void updateRow.mutateAsync({ id: r.id, salary: v })}
                  />
                </Field>
                <Field label="% с продаж">
                  <MoneyCell
                    value={r.salesBonus}
                    onCommit={(v) => void updateRow.mutateAsync({ id: r.id, salesBonus: v })}
                  />
                </Field>
                <div className="text-right">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-2">
                    Итого
                  </div>
                  <div className="font-display text-[16px] font-extrabold tabular-nums text-ink">
                    {fmtMoney(r.salary + r.salesBonus)}
                  </div>
                </div>
                <div className="col-span-2 flex gap-2 sm:col-span-1">
                  {person && (
                    <Btn
                      className="h-11 flex-1 px-3 sm:h-9 sm:flex-none"
                      onClick={() => {
                        void updatePerson.mutateAsync({ id: person.id, salaryDefault: r.salary });
                        toast.success(
                          "Оклад запомнили",
                          `${r.personName}: в новые периоды будет подставляться ${fmtMoney(r.salary)}`,
                        );
                      }}
                    >
                      Запомнить оклад
                    </Btn>
                  )}
                  <Btn
                    tone="danger"
                    className="h-11 px-3 sm:h-9"
                    onClick={() => void removePerson(r.personId, r.personName)}
                  >
                    <Trash2 size={14} />
                  </Btn>
                </div>
              </div>
            );
          })}

          <div className="mt-1 grid grid-cols-3 gap-2 rounded-xl bg-surface-soft px-3 py-3">
            <Total label="Оклады" value={salaries} />
            <Total label="Процент с продаж" value={bonuses} />
            <Total label="ФОТ за период" value={total} strong />
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
