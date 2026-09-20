import { useState } from "react";
import { Pencil, Plus, Repeat, Trash2, X } from "lucide-react";
import { toast, confirmDialog } from "@/lib/toast";
import { Switch } from "@/components/ui/switch";
import {
  useCreateFinanceRecurring,
  useDeleteFinanceRecurring,
  useFinanceRecurring,
  useUpdateFinanceRecurring,
  type FinanceCategory,
  type FinanceEntry,
} from "@/lib/api/finance";
import { fmtMoney } from "./Finance";
import { Btn, EmptyHint, Field, MoneyInput, SectionCard, Select, TextInput } from "./ui";

/**
 * Постоянные издержки: аренда помещения, связь, интернет, логистика.
 *
 * Шаблон разворачивается в запись каждого периода сам — без «забыли
 * перенести». Правка шаблона меняет текущий и будущие периоды, прошлые
 * остаются как были: иначе история задним числом поедет.
 *
 * Снять с повтора можно в любой момент — уже созданные записи остаются на
 * своих местах, новые просто перестают появляться.
 */

type Draft = {
  id?: number;
  categoryId: number | null;
  name: string;
  amount: number;
  active: boolean;
};

export function FinanceRecurringList({
  categories,
  periodKey,
  entries,
}: {
  categories: FinanceCategory[];
  periodKey: string;
  entries: FinanceEntry[];
}) {
  const { data: items = [] } = useFinanceRecurring();
  const cats = categories.filter((c) => c.kind === "expense");
  const [draft, setDraft] = useState<Draft | null>(null);
  const create = useCreateFinanceRecurring();
  const update = useUpdateFinanceRecurring();
  const remove = useDeleteFinanceRecurring();

  const monthly = items.filter((i) => i.active).reduce((s, i) => s + i.amount, 0);

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      toast.error("Нужно наименование", "Например «Аренда помещения» или «Интернет»");
      return;
    }
    if (draft.id) {
      await update.mutateAsync({
        id: draft.id,
        categoryId: draft.categoryId,
        name,
        amount: draft.amount,
        active: draft.active,
      });
      toast.success("Сохранено", `${name} · ${fmtMoney(draft.amount)} каждый период`);
    } else {
      await create.mutateAsync({
        categoryId: draft.categoryId,
        name,
        amount: draft.amount,
        startPeriod: periodKey,
        kind: "expense",
      });
      toast.success("Добавлена постоянная издержка", `${name} · ${fmtMoney(draft.amount)} каждый период`);
    }
    setDraft(null);
  };

  const stop = async (id: number, name: string) => {
    const ok = await confirmDialog({
      title: `Снять «${name}» с повтора?`,
      message:
        "Уже созданные записи в периодах останутся — новые появляться перестанут. Вернуть можно, добавив издержку заново.",
      confirmText: "Снять с повтора",
    });
    if (!ok) return;
    await remove.mutateAsync(id);
    toast.success("Снято с повтора", name);
  };

  return (
    <SectionCard
      title="Постоянные издержки"
      hint={
        items.length
          ? `Каждый период добавляется ${fmtMoney(monthly)} — это и есть ваша постоянная часть расходов`
          : "То, что повторяется каждый месяц: аренда помещения, связь, интернет, логистика"
      }
      right={
        <Btn
          tone="primary"
          onClick={() =>
            setDraft({ categoryId: cats[0]?.id ?? null, name: "", amount: 0, active: true })
          }
        >
          <Plus size={16} /> Добавить
        </Btn>
      }
    >
      {draft && (
        <div className="mb-3 rounded-2xl border border-ink/15 bg-surface-soft p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-2">
              {draft.id ? "Правка издержки" : "Новая постоянная издержка"}
            </div>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_180px_150px]">
            <Field label="Наименование">
              <TextInput
                autoFocus
                value={draft.name}
                placeholder="Аренда помещения"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                }}
              />
            </Field>
            <Field label="Статья">
              <Select
                value={draft.categoryId ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, categoryId: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">без статьи</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Сумма за период">
              <MoneyInput
                value={draft.amount}
                onChange={(v) => setDraft({ ...draft, amount: v })}
                onEnter={() => void save()}
              />
            </Field>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            Появится в этом периоде и дальше в каждом следующем. Сумму в конкретном периоде можно
            поправить на вкладке «Расход» — шаблон это не изменит.
          </p>
          <div className="mt-2.5 flex gap-2">
            <Btn tone="primary" onClick={() => void save()} className="flex-1 sm:flex-none">
              Сохранить
            </Btn>
            <Btn onClick={() => setDraft(null)} className="flex-1 sm:flex-none">
              Отмена
            </Btn>
          </div>
        </div>
      )}

      {items.length === 0 && !draft ? (
        <EmptyHint text="Постоянных издержек пока нет. Добавьте аренду помещения, интернет, логистику — и они будут появляться в каждом периоде сами." />
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map((i) => {
            const cat = categories.find((c) => c.id === i.categoryId);
            const inPeriod = entries.some(
              (e) => e.recurringId === i.id && e.periodKey === periodKey,
            );
            return (
              <div
                key={i.id}
                className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 sm:grid-cols-[1fr_170px_140px_auto]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Repeat size={13} className="shrink-0 text-blue-600" />
                    <span className="truncate text-[14px] font-semibold text-ink">{i.name}</span>
                  </div>
                  <div className="text-[11.5px] text-muted sm:hidden">
                    {cat?.name ?? "без статьи"} · {fmtMoney(i.amount)}
                  </div>
                </div>
                <div className="hidden truncate text-[12.5px] text-muted sm:block">
                  {cat?.name ?? "без статьи"}
                </div>
                <div className="hidden text-right font-display text-[15px] font-bold tabular-nums text-ink sm:block">
                  {fmtMoney(i.amount)}
                </div>
                <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:gap-1">
                  <label className="mr-auto flex items-center gap-2 text-[12px] text-muted sm:mr-0">
                    <Switch
                      checked={i.active}
                      onChange={(v: boolean) => {
                        void update.mutateAsync({ id: i.id, active: v });
                        toast.success(
                          v ? "Повтор включён" : "Повтор выключен",
                          v ? `${i.name} снова появится в следующем периоде` : `${i.name} больше не добавляется`,
                        );
                      }}
                    />
                    <span className="hidden sm:inline">{i.active ? "повторяется" : "выключена"}</span>
                  </label>
                  <Btn
                    className="h-11 px-3 sm:h-9"
                    onClick={() =>
                      setDraft({
                        id: i.id,
                        categoryId: i.categoryId,
                        name: i.name,
                        amount: i.amount,
                        active: i.active,
                      })
                    }
                  >
                    <Pencil size={14} /> Изменить
                  </Btn>
                  <Btn tone="danger" className="h-11 px-3 sm:h-9" onClick={() => void stop(i.id, i.name)}>
                    <Trash2 size={14} />
                  </Btn>
                </div>
                {!inPeriod && i.active && (
                  <div className="col-span-2 text-[11.5px] text-muted-2 sm:col-span-4">
                    В этом периоде записи ещё нет — появится при открытии периода.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
