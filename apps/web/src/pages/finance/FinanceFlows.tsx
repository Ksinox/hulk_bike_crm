import { useMemo, useState } from "react";
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { rankSuggestions } from "@/components/SuggestInput";
import {
  useCreateFinanceCategory,
  useCreateFinanceEntries,
  useDeleteFinanceEntries,
  useDeleteFinanceEntry,
  useRestoreFinanceEntry,
  useUpdateFinanceEntry,
  type FinanceCategory,
  type FinanceEntry,
  type FinanceKind,
} from "@/lib/api/finance";
import { fmtMoney } from "./Finance";
import { Btn, EmptyHint, SectionCard } from "./ui";
import { EntryDialog, plural, type EntryDraft } from "./EntryDialog";

/**
 * Приход и расход за период.
 *
 * Как устроен ввод (правки заказчика 20.09 по UX):
 *   • порядок полей = порядок мысли: что → сколько → когда. Наименование
 *     пишут руками, поэтому оно самое широкое; статью выбирают плитками.
 *   • кнопка «Сохранить» стоит сразу за последним полем, а не в другом углу
 *     экрана — не нужно вести мышь через всю форму.
 *   • наименования запоминаются: в следующий раз то же самое предлагается
 *     подсказкой, как цвет в карточке техники.
 *   • новая статья заводится прямо в форме, не уходя в справочник.
 *
 * Править можно всё: строка открывается теми же полями, удаление мягкое —
 * в тосте десять секунд живёт «Отменить».
 */

const dayLabel = (iso: string): string => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
};

export function FinanceFlows({
  kind,
  entries,
  allEntries,
  categories,
  bounds,
  payrollTotal,
}: {
  kind: FinanceKind;
  /** Движения выбранного периода. */
  entries: FinanceEntry[];
  /** Все загруженные движения — из них берутся подсказки наименований. */
  allEntries: FinanceEntry[];
  categories: FinanceCategory[];
  bounds: { from: string; to: string };
  payrollTotal: number;
}) {
  const rows = useMemo(
    () =>
      entries
        .filter((e) => e.kind === kind)
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id)),
    [entries, kind],
  );
  const total = rows.reduce((s, e) => s + e.amount, 0);
  /** Что уже вписывали в этот вид движений — предложим при следующем вводе. */
  const names = useMemo(
    () => rankSuggestions(allEntries.filter((e) => e.kind === kind).map((e) => e.name)),
    [allEntries, kind],
  );

  /** Окно ввода: null — закрыто, "new" — пачка, объект — правка строки. */
  const [dialog, setDialog] = useState<"new" | (EntryDraft & { id: number }) | null>(null);
  const createMany = useCreateFinanceEntries();
  const deleteMany = useDeleteFinanceEntries();
  const update = useUpdateFinanceEntry();
  const del = useDeleteFinanceEntry();
  const restore = useRestoreFinanceEntry();
  const addCategory = useCreateFinanceCategory();

  /**
   * Записать пачку: строки уходят одним запросом, в журнале одна запись, а в
   * тосте десять секунд живёт «Отменить» — откатывает всю пачку целиком.
   */
  const submitBatch = async (list: EntryDraft[]) => {
    const res = await createMany.mutateAsync(list.map((r) => ({ ...r, kind })));
    const ids = (res.items ?? []).map((r) => r.id);
    const sum = list.reduce((s, r) => s + r.amount, 0);
    toast.action({
      title: `Записано ${list.length} ${plural(list.length, "строка", "строки", "строк")}`,
      message: `${kind === "income" ? "Приход" : "Расход"} на ${fmtMoney(sum)}`,
      onAction: async () => {
        if (ids.length) await deleteMany.mutateAsync(ids);
        toast.success("Отменили", "Строки убраны из раздела");
      },
    });
  };

  const saveEdit = async (d: EntryDraft & { id: number }) => {
    await update.mutateAsync({
      id: d.id,
      categoryId: d.categoryId,
      name: d.name,
      amount: d.amount,
      at: d.at,
    });
    toast.success("Сохранено", `${d.name} · ${fmtMoney(d.amount)}`);
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
        <Btn tone="primary" onClick={() => setDialog("new")}>
          <Plus size={16} /> Добавить
        </Btn>
      }
    >
      {dialog && (
        <EntryDialog
          kind={kind}
          categories={categories}
          suggestions={names}
          bounds={bounds}
          edit={dialog === "new" ? null : dialog}
          onSaveEdit={saveEdit}
          onSubmitBatch={submitBatch}
          onAddCategory={async (name) => {
            const r = await addCategory.mutateAsync({ kind, name });
            toast.success("Статья добавлена", name);
            return r.item?.id ?? null;
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {rows.length === 0 ? (
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
                className="grid grid-cols-[52px_1fr_auto] items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 sm:grid-cols-[64px_minmax(0,1fr)_210px_140px_auto]"
              >
                <div className="text-[12px] font-semibold text-muted-2">{dayLabel(e.at)}</div>
                <div className="min-w-0">
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
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700"
                    >
                      <Repeat size={10} /> постоянная
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "whitespace-nowrap text-right font-display text-[15px] font-bold tabular-nums",
                    kind === "income" ? "text-emerald-700" : "text-ink",
                  )}
                >
                  {fmtMoney(e.amount)}
                </div>
                <div className="col-span-3 flex gap-2 sm:col-span-1 sm:gap-1">
                  <Btn
                    className="h-11 flex-1 px-3 sm:h-9 sm:flex-none"
                    onClick={() =>
                      setDialog({
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
