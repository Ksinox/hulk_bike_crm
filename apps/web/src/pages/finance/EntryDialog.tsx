import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Calendar,
  Check,
  CornerDownLeft,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { DatePicker } from "@/components/ui/date-picker";
import { SuggestInput } from "@/components/SuggestInput";
import { useIsMobile } from "@/lib/useIsMobile";
import type { FinanceCategory, FinanceKind } from "@/lib/api/finance";
import { fmtMoney } from "./Finance";
import { Btn, MoneyInput } from "./ui";

/**
 * Окно ввода движений — «книга учёта» (правки заказчика 20–21.09).
 *
 * Зачем окном, а не формой внутри страницы: когда вносишь десяток строк,
 * внимание должно быть только на вводе. Окно затемняет остальное, ведёт по
 * шагам и держит набранное на виду.
 *
 * Флоу без мыши:
 *   «Добавить» → поле активно → печатаешь → Enter → сумма → Enter →
 *   статья цифрой 1…9 → строка падает ВНИЗ ОКНА в список пачки,
 *   поле снова активно. Набрал сколько нужно — «Записать все строки»,
 *   и они разом уходят в раздел.
 *
 * Почему строки копятся в окне, а не улетают сразу: иначе непонятно, что
 * произошло — список за окном не виден. Здесь всё на глазах: что набрано,
 * сколько строк и на какую сумму, любую можно поправить или убрать до
 * записи. Записываются пачкой, одной записью в журнале, с откатом.
 *
 * Правка существующей строки открывает то же окно, но без пачки: шаги,
 * потом «Сохранить».
 *
 * Раскладка: на телефоне — лист снизу во весь экран с липким низом; на
 * планшете и компьютере — окно по центру, поля в строку.
 */

export type EntryDraft = {
  categoryId: number | null;
  name: string;
  amount: number;
  at: string;
};

export type EntryRow = EntryDraft & { key: string };

type Step = "name" | "amount" | "category";

const todayISO = (from: string, to: string): string => {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return iso >= from && iso <= to ? iso : from;
};

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const today = new Date();
  const same =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
  return same
    ? "сегодня"
    : date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
}

export function EntryDialog({
  kind,
  categories,
  suggestions,
  bounds,
  edit,
  onSaveEdit,
  onSubmitBatch,
  onAddCategory,
  onClose,
}: {
  kind: FinanceKind;
  categories: FinanceCategory[];
  suggestions: string[];
  bounds: { from: string; to: string };
  /** Правка существующей строки: окно работает по одной записи. */
  edit?: (EntryDraft & { id: number }) | null;
  onSaveEdit?: (d: EntryDraft & { id: number }) => Promise<void>;
  /** Записать всю пачку. */
  onSubmitBatch?: (rows: EntryDraft[]) => Promise<void>;
  onAddCategory: (name: string) => Promise<number | null>;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const cats = useMemo(() => categories.filter((c) => c.kind === kind), [categories, kind]);
  const word = kind === "income" ? "приход" : "расход";

  const [draft, setDraft] = useState<EntryDraft>(
    edit ?? { categoryId: cats[0]?.id ?? null, name: "", amount: 0, at: todayISO(bounds.from, bounds.to) },
  );
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [step, setStep] = useState<Step>("name");
  const [catIndex, setCatIndex] = useState(0);
  const [dateOpen, setDateOpen] = useState(false);
  const [addingCat, setAddingCat] = useState(false);
  const [catDraft, setCatDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const catName = (id: number | null) => cats.find((c) => c.id === id)?.name;

  /* ── клавиатура: Esc закрывает, на шаге статьи работают цифры ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !addingCat) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows.length, addingCat]);

  useEffect(() => {
    if (step !== "category" || addingCat) return;
    let armed = false;
    // Тот самый Enter, которым пришли с суммы, не должен выбрать статью.
    const arm = window.setTimeout(() => {
      armed = true;
    }, 160);
    const onKey = (e: KeyboardEvent) => {
      if (!armed) return;
      if (/^[1-9]$/.test(e.key)) {
        const c = cats[Number(e.key) - 1];
        if (c) {
          e.preventDefault();
          commit({ ...draft, categoryId: c.id });
        }
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setCatIndex((i) => Math.min(cats.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCatIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Backspace" || e.key === "ArrowUp") {
        e.preventDefault();
        setStep("amount");
      } else if (e.key === "Enter") {
        e.preventDefault();
        commit({ ...draft, categoryId: cats[catIndex]?.id ?? draft.categoryId });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener("keydown", onKey);
    };
  }, [step, catIndex, cats, draft, addingCat]);

  useEffect(() => {
    if (step !== "category") return;
    const i = cats.findIndex((c) => c.id === draft.categoryId);
    setCatIndex(i >= 0 ? i : 0);
  }, [step]);

  const close = () => {
    if (rows.length > 0) {
      const ok = window.confirm(
        `В окне ${rows.length} ${rows.length === 1 ? "строка" : "строки"} — они ещё не записаны. Закрыть и потерять?`,
      );
      if (!ok) return;
    }
    onClose();
  };

  /** Строка готова: правку сохраняем, новую — кладём в пачку. */
  const commit = async (d: EntryDraft) => {
    const name = d.name.trim();
    if (!name) {
      toast.error("Напишите, за что", "Например «Масло 10W-40»");
      setStep("name");
      return;
    }
    if (edit && onSaveEdit) {
      setBusy(true);
      await onSaveEdit({ ...d, name, id: edit.id });
      setBusy(false);
      onClose();
      return;
    }
    setRows((r) => [...r, { ...d, name, key: `${Date.now()}-${r.length}` }]);
    setDraft({ categoryId: d.categoryId, name: "", amount: 0, at: d.at });
    setStep("name");
    // Новая строка внизу списка — показываем её.
    window.setTimeout(() => listRef.current?.scrollTo({ top: 999999, behavior: "smooth" }), 60);
  };

  const submitAll = async () => {
    if (!rows.length || !onSubmitBatch) return;
    setBusy(true);
    await onSubmitBatch(rows.map(({ key: _key, ...r }) => r));
    setBusy(false);
    onClose();
  };

  const stepNo = step === "name" ? 1 : step === "amount" ? 2 : 3;

  const body = (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden bg-bg shadow-card-lg",
        isMobile
          ? "max-h-[94dvh] rounded-t-3xl animate-sheet-up"
          : "max-h-[88vh] max-w-[720px] rounded-3xl",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── шапка ── */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="font-display text-[17px] font-bold text-ink">
            {edit ? `Правка: ${word}` : `Новый ${word}`}
          </div>
          <div className="text-[12px] text-muted">
            {edit ? "Измените и сохраните" : `Шаг ${stepNo} из 3 · вводите подряд, записывайте разом`}
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-muted shadow-card-sm hover:text-ink"
          aria-label="Закрыть"
        >
          <X size={18} />
        </button>
      </div>

      {/* ── шаги ── */}
      <div className="border-b border-border px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Crumb label={draft.name || "наименование"} filled={!!draft.name} onClick={() => setStep("name")} />
          <Crumb
            label={draft.amount ? fmtMoney(draft.amount) : "сумма"}
            filled={draft.amount > 0}
            onClick={() => setStep("amount")}
          />
          <Crumb
            label={catName(draft.categoryId) ?? "статья"}
            filled={!!catName(draft.categoryId)}
            onClick={() => setStep("category")}
          />
          <button
            type="button"
            onClick={() => setDateOpen((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-white px-2.5 text-[12px] font-semibold text-muted hover:border-ink hover:text-ink"
          >
            <Calendar size={13} />
            {dateLabel(draft.at)}
          </button>
        </div>

        {dateOpen && (
          <div className="mb-2 w-[220px]">
            <DatePicker
              value={draft.at}
              onChange={(v) => {
                setDraft({ ...draft, at: v ?? draft.at });
                setDateOpen(false);
              }}
              clearable={false}
            />
          </div>
        )}

        {step === "name" && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <SuggestInput
                value={draft.name}
                onValueChange={(v) => setDraft({ ...draft, name: v })}
                suggestions={suggestions}
                autoFocus
                touch
                minChars={1}
                heading="Вписывали раньше"
                placeholder={kind === "income" ? "За что пришли деньги" : "На что потратили"}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!draft.name.trim()) {
                      toast.error("Напишите, за что", "Например «Масло 10W-40»");
                      return;
                    }
                    setStep("amount");
                  }
                }}
                className="h-12 w-full rounded-xl border border-border bg-white px-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted-2 focus:border-ink"
              />
            </div>
            <Btn
              tone="primary"
              className="h-12 shrink-0"
              onClick={() => {
                if (!draft.name.trim()) {
                  toast.error("Напишите, за что", "Например «Масло 10W-40»");
                  return;
                }
                setStep("amount");
              }}
            >
              Далее <CornerDownLeft size={15} />
            </Btn>
          </div>
        )}

        {step === "amount" && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <MoneyInput
                value={draft.amount}
                autoFocus
                onChange={(v) => setDraft({ ...draft, amount: v })}
                onEnter={() => setStep("category")}
                className="h-12 text-[18px]"
                placeholder="Сколько"
              />
            </div>
            <div className="flex gap-2">
              <Btn className="h-12" onClick={() => setStep("name")}>
                <ArrowLeft size={15} /> Назад
              </Btn>
              <Btn tone="primary" className="h-12 flex-1" onClick={() => setStep("category")}>
                Далее <CornerDownLeft size={15} />
              </Btn>
            </div>
          </div>
        )}

        {step === "category" && (
          <div>
            <div className="mb-1.5 text-[12px] text-muted">
              {isMobile
                ? edit
                  ? "Выберите статью"
                  : "Статья — и строка встанет в список ниже"
                : edit
                  ? "Статья: цифра, ← → и Enter или мышкой"
                  : "Статья: цифра, ← → и Enter — строка встанет в список ниже"}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {cats.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => commit({ ...draft, categoryId: c.id })}
                  className={cn(
                    "inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition-colors",
                    i === catIndex
                      ? "bg-ink text-white"
                      : "border border-border bg-white text-ink-2 hover:border-ink hover:text-ink",
                  )}
                >
                  {!isMobile && i < 9 && (
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold",
                        i === catIndex ? "bg-white/20 text-white" : "bg-surface-soft text-muted-2",
                      )}
                    >
                      {i + 1}
                    </span>
                  )}
                  {c.name}
                </button>
              ))}
              {addingCat ? (
                <input
                  autoFocus
                  value={catDraft}
                  placeholder="Название статьи"
                  onChange={(e) => setCatDraft(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const name = catDraft.trim();
                      if (!name) return;
                      const id = await onAddCategory(name);
                      setCatDraft("");
                      setAddingCat(false);
                      if (id) commit({ ...draft, categoryId: id });
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setAddingCat(false);
                    }
                  }}
                  className="h-11 w-48 rounded-xl border border-border bg-white px-3 text-[14px] text-ink outline-none focus:border-ink"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingCat(true)}
                  className="inline-flex h-11 items-center rounded-xl border border-dashed border-border px-3 text-[13px] font-semibold text-muted hover:border-ink hover:text-ink"
                >
                  + Своя статья
                </button>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <Btn className="h-11" onClick={() => setStep("amount")}>
                <ArrowLeft size={15} /> Назад
              </Btn>
              <Btn
                tone="primary"
                className="h-11 flex-1 sm:flex-none"
                onClick={() => commit(draft)}
              >
                {edit ? (
                  <>
                    <Check size={16} /> Сохранить
                  </>
                ) : (
                  <>
                    <Plus size={16} /> В список
                  </>
                )}
              </Btn>
            </div>
          </div>
        )}
      </div>

      {/* ── пачка: что уже набрано ── */}
      {!edit && (
        <div ref={listRef} className="min-h-[96px] flex-1 overflow-y-auto px-4 py-3">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted">
              Набранные строки появятся здесь. Пока они в окне — ничего в разделе не меняется.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-2">
                В этом окне · {rows.length} {rows.length === 1 ? "строка" : "строк"} на {fmtMoney(total)}
              </div>
              {rows.map((r, i) => (
                <div
                  key={r.key}
                  className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2"
                >
                  <span className="w-5 shrink-0 text-right text-[12px] font-bold tabular-nums text-muted-2">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-ink">{r.name}</div>
                    <div className="truncate text-[11.5px] text-muted">
                      {catName(r.categoryId) ?? "без статьи"} · {dateLabel(r.at)}
                    </div>
                  </div>
                  <span className="shrink-0 whitespace-nowrap font-display text-[15px] font-bold tabular-nums text-ink">
                    {fmtMoney(r.amount)}
                  </span>
                  <button
                    type="button"
                    title="Поправить"
                    onClick={() => {
                      setRows((list) => list.filter((x) => x.key !== r.key));
                      setDraft({ categoryId: r.categoryId, name: r.name, amount: r.amount, at: r.at });
                      setStep("name");
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-2 hover:bg-surface-soft hover:text-ink"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    title="Убрать из списка"
                    onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-ink hover:bg-red-soft"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── низ: записать всё ── */}
      {!edit && (
        <div className="flex items-center gap-2 border-t border-border bg-surface px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <Btn className="h-12" onClick={close}>
            Отмена
          </Btn>
          <Btn
            tone="primary"
            className="h-12 flex-1"
            disabled={rows.length === 0 || busy}
            onClick={() => void submitAll()}
          >
            <Check size={17} />
            {rows.length === 0
              ? "Записать строки"
              : `Записать ${rows.length} ${rows.length === 1 ? "строку" : "строк"} · ${fmtMoney(total)}`}
          </Btn>
        </div>
      )}
    </div>
  );

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[120] flex bg-ink/45 backdrop-blur-sm animate-fade-in",
        isMobile ? "items-end" : "items-center justify-center p-4",
      )}
      onClick={close}
    >
      {body}
    </div>,
    document.body,
  );
}

function Crumb({
  label,
  filled,
  onClick,
}: {
  label: string;
  filled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 max-w-[240px] items-center rounded-full px-2.5 text-[12px] font-semibold transition-colors",
        filled
          ? "bg-surface text-ink hover:bg-ink hover:text-white"
          : "border border-dashed border-border text-muted-2",
      )}
      title="Вернуться к этому шагу"
    >
      <span className="truncate">{label}</span>
    </button>
  );
}
