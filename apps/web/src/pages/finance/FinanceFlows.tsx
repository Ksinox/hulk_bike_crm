import { useMemo, useState } from "react";
import { Check, Pencil, Plus, Repeat, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { DatePicker } from "@/components/ui/date-picker";
import { SuggestInput, rankSuggestions } from "@/components/SuggestInput";
import {
  useCreateFinanceCategory,
  useCreateFinanceEntry,
  useDeleteFinanceEntry,
  useRestoreFinanceEntry,
  useUpdateFinanceEntry,
  type FinanceCategory,
  type FinanceEntry,
  type FinanceKind,
} from "@/lib/api/finance";
import { fmtMoney } from "./Finance";
import { Btn, Chips, EmptyHint, Field, MoneyInput, SectionCard } from "./ui";

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

const todayISO = (from: string, to: string): string => {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return iso >= from && iso <= to ? iso : from;
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
  const cats = categories.filter((c) => c.kind === kind);
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

  const [draft, setDraft] = useState<Draft | null>(null);
  const create = useCreateFinanceEntry();
  const update = useUpdateFinanceEntry();
  const del = useDeleteFinanceEntry();
  const restore = useRestoreFinanceEntry();
  const addCategory = useCreateFinanceCategory();

  const word = kind === "income" ? "приход" : "расход";

  const startNew = () =>
    setDraft({
      categoryId: cats[0]?.id ?? null,
      name: "",
      amount: 0,
      at: todayISO(bounds.from, bounds.to),
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
      toast.success(
        kind === "income" ? "Приход внесён" : "Издержка внесена",
        `${name} · ${fmtMoney(draft.amount)}`,
      );
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
        !draft && (
          <Btn tone="primary" onClick={startNew}>
            <Plus size={16} /> Добавить
          </Btn>
        )
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
              title="Закрыть"
            >
              <X size={16} />
            </button>
          </div>

          {/* Наименование — самое широкое: его пишут руками. Дальше сумма,
              дата и сразу кнопка, чтобы не вести мышь через всю форму. */}
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_170px_auto]">
            <Field label="Наименование">
              <SuggestInput
                value={draft.name}
                onValueChange={(v) => setDraft({ ...draft, name: v })}
                suggestions={names}
                autoFocus
                touch
                heading="Вписывали раньше"
                placeholder={kind === "income" ? "Выручка аренды" : "Масло, свечи"}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                }}
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-muted-2 focus:border-ink"
              />
            </Field>
            <Field label="Сумма">
              <MoneyInput
                value={draft.amount}
                onChange={(v) => setDraft({ ...draft, amount: v })}
                onEnter={() => void save()}
              />
            </Field>
            <Field label="Дата">
              <DatePicker
                value={draft.at}
                onChange={(v) => setDraft({ ...draft, at: v ?? draft.at })}
                clearable={false}
              />
            </Field>
            <div className="flex items-end gap-2">
              <Btn tone="primary" onClick={() => void save()} className="flex-1 sm:flex-none">
                <Check size={16} /> Сохранить
              </Btn>
            </div>
          </div>

          <div className="mt-2.5">
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-2">
              Статья
            </div>
            <Chips
              options={cats.map((c) => ({ id: c.id, label: c.name }))}
              value={draft.categoryId}
              onChange={(id) => setDraft({ ...draft, categoryId: id })}
              onAdd={async (name) => {
                const r = await addCategory.mutateAsync({ kind, name });
                setDraft((d) => (d ? { ...d, categoryId: r.item.id } : d));
                toast.success("Статья добавлена", name);
              }}
            />
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
