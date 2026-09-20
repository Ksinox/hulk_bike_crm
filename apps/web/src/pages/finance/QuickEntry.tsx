import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Calendar, Check, CornerDownLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { DatePicker } from "@/components/ui/date-picker";
import { SuggestInput } from "@/components/SuggestInput";
import { useIsMobile } from "@/lib/useIsMobile";
import type { FinanceCategory, FinanceKind } from "@/lib/api/finance";
import { fmtMoney } from "./Finance";
import { Btn, MoneyInput } from "./ui";

/**
 * Быстрый ввод движения — «книга учёта».
 *
 * Заказчик (20.09): «Добавить расход — и по шагам пошло. Сразу активно
 * вводит, печатает, нажал Enter, сразу выбирает статью. Надо флоу-френдли,
 * прям для ленивых».
 *
 * Поэтому ввод устроен как одна дорожка без мыши:
 *   Enter → наименование введено → сумма → статья (цифрой 1…9) → сохранено,
 *   и поле снова активно для следующей строки. Записывать десять расходов
 *   подряд можно, не убирая рук с клавиатуры.
 *
 * Дата шагом не сделана специально: в 99 случаях это «сегодня». Она стоит
 * в строке-итоге и меняется, только если правда нужно.
 *
 * На телефоне те же шаги, но подсказки — кнопками под пальцем: «Далее»
 * крупная, статья выбирается одним касанием и сразу сохраняет.
 */

export type QuickDraft = {
  id?: number;
  categoryId: number | null;
  name: string;
  amount: number;
  at: string;
};

type Step = "name" | "amount" | "category";

export function QuickEntry({
  kind,
  categories,
  suggestions,
  draft,
  onChange,
  onSubmit,
  onClose,
  onAddCategory,
  savedCount,
}: {
  kind: FinanceKind;
  categories: FinanceCategory[];
  suggestions: string[];
  draft: QuickDraft;
  onChange: (d: QuickDraft) => void;
  /** Сохранить; возвращает true, если можно продолжать ввод следующей строки. */
  onSubmit: (d: QuickDraft) => Promise<boolean>;
  onClose: () => void;
  onAddCategory: (name: string) => Promise<number | null>;
  /** Сколько строк внесли за этот заход — видно, что работа идёт. */
  savedCount: number;
}) {
  const isMobile = useIsMobile();
  const [step, setStep] = useState<Step>(draft.id ? "name" : "name");
  const [catIndex, setCatIndex] = useState(0);
  const [dateOpen, setDateOpen] = useState(false);
  const [addingCat, setAddingCat] = useState(false);
  const [catDraft, setCatDraft] = useState("");
  const amountRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);

  const word = kind === "income" ? "приход" : "расход";
  const cats = categories.filter((c) => c.kind === kind);

  /**
   * На шаге статьи ловим цифры и стрелки — выбор без мыши.
   *
   * Подписываемся с задержкой: тот самый Enter, которым перешли с суммы,
   * иначе долетает сюда и сохраняет строку с первой попавшейся статьёй.
   */
  useEffect(() => {
    if (step !== "category" || addingCat) return;
    let armed = false;
    const arm = window.setTimeout(() => {
      armed = true;
    }, 160);
    const onKey = (e: KeyboardEvent) => {
      if (!armed) return;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Backspace" || e.key === "ArrowUp") {
        e.preventDefault();
        setStep("amount");
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const c = cats[Number(e.key) - 1];
        if (c) {
          e.preventDefault();
          onChange({ ...draft, categoryId: c.id });
          setCatIndex(Number(e.key) - 1);
          void finish({ ...draft, categoryId: c.id });
        }
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setCatIndex((i) => Math.min(cats.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCatIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const c = cats[catIndex];
        onChange({ ...draft, categoryId: c?.id ?? draft.categoryId });
        void finish({ ...draft, categoryId: c?.id ?? draft.categoryId });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener("keydown", onKey);
    };
  }, [step, catIndex, cats, draft, addingCat]);

  /** Подсветка выбранной статьи при возврате к шагу. */
  useEffect(() => {
    if (step !== "category") return;
    const i = cats.findIndex((c) => c.id === draft.categoryId);
    if (i >= 0) setCatIndex(i);
    catRef.current?.focus();
  }, [step]);

  const finish = async (d: QuickDraft) => {
    onChange(d);
    const again = await onSubmit(d);
    if (again) {
      setStep("name");
      setCatIndex(0);
    }
  };

  const stepNo = step === "name" ? 1 : step === "amount" ? 2 : 3;
  const catName = cats.find((c) => c.id === draft.categoryId)?.name;

  return (
    <div className="mb-3 rounded-2xl border border-ink/15 bg-surface-soft p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-2">
            {draft.id ? "Правка строки" : `Новый ${word}`}
          </span>
          {!draft.id && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-muted">
              шаг {stepNo} из 3
            </span>
          )}
          {savedCount > 0 && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
              внесено подряд: {savedCount}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold text-muted-2 hover:bg-white hover:text-ink"
          title="Закрыть (Esc)"
        >
          <X size={15} /> {isMobile ? "" : "Esc"}
        </button>
      </div>

      {/* Строка-итог: что уже набрано. Клик возвращает к этому шагу. */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <Crumb
          label={draft.name || "наименование"}
          filled={!!draft.name}
          onClick={() => setStep("name")}
        />
        <Crumb
          label={draft.amount ? fmtMoney(draft.amount) : "сумма"}
          filled={draft.amount > 0}
          onClick={() => setStep("amount")}
        />
        <Crumb label={catName ?? "статья"} filled={!!catName} onClick={() => setStep("category")} />
        <button
          type="button"
          onClick={() => setDateOpen((v) => !v)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-white px-2.5 text-[12px] font-semibold text-muted hover:border-ink hover:text-ink"
          title="Дата движения"
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
              onChange({ ...draft, at: v ?? draft.at });
              setDateOpen(false);
            }}
            clearable={false}
          />
        </div>
      )}

      {/* ── шаг 1: что это ── */}
      {step === "name" && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <SuggestInput
              value={draft.name}
              onValueChange={(v) => onChange({ ...draft, name: v })}
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
                if (e.key === "Escape") onClose();
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

      {/* ── шаг 2: сколько ── */}
      {step === "amount" && (
        <div ref={amountRef} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <MoneyInput
              value={draft.amount}
              autoFocus
              onChange={(v) => onChange({ ...draft, amount: v })}
              onEnter={() => setStep("category")}
              className="h-12 text-[18px]"
              placeholder="Сколько"
            />
          </div>
          <div className="flex gap-2">
            <Btn className="h-12 shrink-0" onClick={() => setStep("name")}>
              <ArrowLeft size={15} /> Назад
            </Btn>
            <Btn tone="primary" className="h-12 flex-1 shrink-0" onClick={() => setStep("category")}>
              Далее <CornerDownLeft size={15} />
            </Btn>
          </div>
        </div>
      )}

      {/* ── шаг 3: статья ── */}
      {step === "category" && (
        <div ref={catRef} tabIndex={-1} className="outline-none">
          <div className="mb-1.5 text-[12px] text-muted">
            {isMobile
              ? "Выберите статью — запись сохранится сразу"
              : "Статья: нажмите цифру, ← → и Enter или мышкой — запись сохранится сразу"}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {cats.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCatIndex(i);
                  void finish({ ...draft, categoryId: c.id });
                }}
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
              <span className="inline-flex items-center gap-1.5">
                <input
                  autoFocus
                  value={catDraft}
                  placeholder="Название статьи"
                  onChange={(e) => setCatDraft(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      const name = catDraft.trim();
                      if (!name) return;
                      const id = await onAddCategory(name);
                      setCatDraft("");
                      setAddingCat(false);
                      if (id) void finish({ ...draft, categoryId: id });
                    }
                    if (e.key === "Escape") setAddingCat(false);
                  }}
                  className="h-11 w-48 rounded-xl border border-border bg-white px-3 text-[14px] text-ink outline-none focus:border-ink"
                />
              </span>
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
              onClick={() => void finish(draft)}
            >
              <Check size={16} /> {draft.id ? "Сохранить" : "Записать"}
            </Btn>
          </div>
        </div>
      )}
    </div>
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
          ? "bg-white text-ink hover:bg-ink hover:text-white"
          : "border border-dashed border-border text-muted-2",
      )}
      title="Вернуться к этому шагу"
    >
      <span className="truncate">{label}</span>
    </button>
  );
}

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
