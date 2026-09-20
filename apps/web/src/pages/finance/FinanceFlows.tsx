import { useMemo, useState } from "react";
import { Pencil, Plus, Repeat, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { BillingPeriod } from "@/lib/billingPeriod";
import {
  useCreateFinanceEntry,
  useDeleteFinanceEntry,
  useRestoreFinanceEntry,
  useUpdateFinanceEntry,
  type FinanceCategory,
  type FinanceEntry,
  type FinanceKind,
} from "@/lib/api/finance";
import { fmtMoney } from "./Finance";
import { Btn, DateInput, EmptyHint, Field, MoneyInput, SectionCard, Select, TextInput } from "./ui";

/**
 * Приход и расход за период.
 *
 * Главное требование заказчика к блоку — всё должно правиться. Поэтому:
 *   • строка открывается на правку по клику, поля те же, что при заведении;
 *   • удаление мягкое: строка уходит, но в тосте 10 секунд живёт «Отменить»;
 *   • строки из постоянных издержек помечены значком повтора — их сумму
 *     можно поправить точечно в этом периоде, не трогая шаблон.
 */

const todayISO = (p: BillingPeriod): string => {
  const now = new Date();
  const inside = now >= p.start && now < p.end;
  const d = inside ? now : p.start;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dayLabel = (iso: string): string => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
};

type Draft = {
  id?: number;
  categoryId: number | null;
  name: string;
  amount: number;
  at: string;
};

export function FinanceFlows({
  kind,
  entries,
  categories,
  period,
  periodKey,
  payrollTotal,
}: {
  kind: FinanceKind;
  entries: FinanceEntry[];
  categories: FinanceCategory[];
  period: BillingPeriod;
  periodKey: string;
  payrollTotal: number;
}) {
  const cats = categories.filter((c) => c.kind === kind);
  const rows = useMemo(
    () =>
      entries
        .filter((e) => e.kind === kind && e.periodKey === periodKey)
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id)),
    [entries, kind, periodKey],
  );
  const total = rows.reduce((s, e) => s + e.amount, 0);

  const [draft, setDraft] = useState<Draft | null>(null);
  const create = useCreateFinanceEntry();
  const update = useUpdateFinanceEntry();
  const del = useDeleteFinanceEntry();
  const restore = useRestoreFinanceEntry();

  const word = kind === "income" ? "приход" : "расход";

  const startNew = () =>
    setDraft({
      categoryId: cats[0]?.id ?? null,
      name: "",
      amount: 0,
      at: todayISO(period),
    });

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      toast.error("Нужно наименование", "Например «Масло 10W-40» или «Выручка аренды за неделю»");
      return;
    }
    if (draft.id) {
      await update.mutateAsync({
        id: draft.id,
        categoryId: draft.categoryId,
        name,
        amount: draft.amount,
        at: draft.at,
      });
      toast.success("Сохранено", `${name} · ${fmtMoney(draft.amount)}`);
    } else {
      await create.mutateAsync({
        kind,
        categoryId: draft.categoryId,
        name,
        amount: draft.amount,
        at: draft.at,
      });
      toast.success(kind === "income" ? "Приход внесён" : "Издержка внесена", `${name} · ${fmtMoney(draft.amount)}`);
    }
    setDraft(null);
  };

  const remove = async (e: FinanceEntry) => {
    await del.mutateAsync(e.id);
    toast.action({
      title: "Строка удалена",
      message: `${e.name} · ${fmtMoney(e.amount)}`,
      onAction: async () => {
        await restore.mutateAsync(e.id);
        toast.success("Вернули", e.name);
      },
    });
  };

  return (
    <SectionCard
      title={kind === "income" ? "Приход за период" : "Расход за период"}
      hint={
        kind === "expense"
          ? `Движений на ${fmtMoney(total)}${payrollTotal ? ` · плюс ФОТ ${fmtMoney(payrollTotal)}` : ""}`
          : `Всего ${fmtMoney(total)}`
      }
      right={
        <Btn tone="primary" onClick={startNew}>
          <Plus size={16} /> Добавить
        </Btn>
      }
    >
      {draft && (
        <div className="mb-3 rounded-2xl border border-ink/15 bg-surface-soft p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-2">
              {draft.id ? "Правка строки" : `Новый ${word}`}
            </div>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[130px_1fr_150px_140px]">
            <Field label="Дата">
              <DateInput
                value={draft.at}
                onChange={(e) => setDraft({ ...draft, at: e.target.value })}
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
            <Field label="Наименование">
              <TextInput
                value={draft.name}
                autoFocus
                placeholder={kind === "income" ? "Выручка аренды" : "Масло, свечи"}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                }}
              />
            </Field>
            <Field label="Сумма">
              <MoneyInput
                value={draft.amount}
                onChange={(v) => setDraft({ ...draft, amount: v })}
                onEnter={() => void save()}
              />
            </Field>
          </div>
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

      {rows.length === 0 && !draft ? (
        <EmptyHint
          text={
            kind === "income"
              ? "За этот период прихода ещё нет. Внесите выручку аренды, ремонтов и продаж — блок сложит их сам."
              : "За этот период издержек ещё нет. Добавьте расход — а то, что повторяется каждый месяц, отметьте на вкладке «Постоянные»."
          }
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((e) => {
            const cat = categories.find((c) => c.id === e.categoryId);
            return (
              <div
                key={e.id}
                className="grid grid-cols-[52px_1fr_auto] items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 sm:grid-cols-[64px_180px_1fr_auto_auto]"
              >
                <div className="text-[12px] font-semibold text-muted-2">{dayLabel(e.at)}</div>
                <div className="min-w-0 sm:order-none">
                  <div className="truncate text-[14px] font-semibold text-ink">{e.name}</div>
                  <div className="flex items-center gap-1.5 text-[11.5px] text-muted sm:hidden">
                    {cat?.name ?? "без статьи"}
                    {e.source === "recurring" && <Repeat size={11} className="text-blue-600" />}
                  </div>
                </div>
                <div className="hidden min-w-0 items-center gap-1.5 text-[12.5px] text-muted sm:flex">
                  <span className="truncate">{cat?.name ?? "без статьи"}</span>
                  {e.source === "recurring" && (
                    <span
                      title="Постоянная издержка — появляется каждый период сама"
                      className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700"
                    >
                      <Repeat size={10} /> постоянная
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "text-right font-display text-[15px] font-bold tabular-nums",
                    kind === "income" ? "text-emerald-700" : "text-ink",
                  )}
                >
                  {fmtMoney(e.amount)}
                </div>
                <div className="col-span-3 flex gap-2 sm:col-span-1 sm:gap-1">
                  <Btn
                    className="h-11 flex-1 px-3 sm:h-9 sm:flex-none"
                    onClick={() =>
                      setDraft({
                        id: e.id,
                        categoryId: e.categoryId,
                        name: e.name,
                        amount: e.amount,
                        at: e.at,
                      })
                    }
                  >
                    <Pencil size={14} /> Изменить
                  </Btn>
                  <Btn
                    tone="danger"
                    className="h-11 flex-1 px-3 sm:h-9 sm:flex-none"
                    onClick={() => void remove(e)}
                  >
                    <Trash2 size={14} /> Удалить
                  </Btn>
                </div>
              </div>
            );
          })}
          <div className="mt-1 flex items-center justify-between rounded-xl bg-surface-soft px-3 py-2.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-2">
              Итого {kind === "income" ? "приход" : "движений"}
            </span>
            <span className="font-display text-[17px] font-extrabold tabular-nums text-ink">
              {fmtMoney(total)}
            </span>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
