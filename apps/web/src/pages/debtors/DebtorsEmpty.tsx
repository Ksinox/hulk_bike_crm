import { Plus, Scale, CircleHelp } from "lucide-react";

/**
 * Пустое состояние — нет ни одного должника. Один большой CTA «Завести
 * первое дело» со стрелкой-подсказкой «начни отсюда» и чеклист из 3
 * шагов чтобы новый администратор сразу понял что делать.
 */
export function DebtorsEmpty({ onAddFirst }: { onAddFirst: () => void }) {
  return (
    <section className="flex min-h-[560px] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="relative mb-7 grid h-[120px] w-[120px] place-items-center rounded-[30px] border border-border bg-gradient-to-br from-surface-soft to-blue-50 text-muted-2 shadow-card-sm">
        <Scale size={48} strokeWidth={1.4} />
        <span className="absolute -right-2 -top-2 grid h-9 w-9 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_8px_18px_-4px_rgba(5,150,105,0.4)]">
          ✓
        </span>
      </div>
      <h2 className="font-display text-[36px] font-bold leading-none tracking-[-0.02em] text-ink">
        Должников пока нет
      </h2>
      <p className="mx-auto mt-2 max-w-[460px] text-[15px] leading-[1.55] text-muted">
        Здесь появятся кейсы по людям с долгами: ущерб, аренда, ДТП, угон.
        У каждого — своё дерево стадий и график платежей.
      </p>

      {/* Большая CTA — строго по центру под заголовком. Подсказка-стрелка
          позиционируется абсолютом слева и указывает ВПРАВО на кнопку
          (на узких экранах прячем, чтобы не вылезала за край). */}
      <div className="relative mt-8 flex justify-center">
        <button
          type="button"
          onClick={onAddFirst}
          className="inline-flex h-[50px] items-center gap-2.5 rounded-[13px] bg-ink px-[26px] text-[15px] font-semibold text-white shadow-[0_12px_24px_-8px_rgba(11,18,32,0.35)] hover:bg-[#16213a]"
        >
          <Plus size={18} strokeWidth={1.8} />
          Завести первое дело
        </button>
        <span className="pointer-events-none absolute right-[calc(100%+20px)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap font-display text-[16px] italic text-blue-700 lg:block">
          начни отсюда →
        </span>
      </div>
      <button
        type="button"
        className="mt-3.5 inline-flex items-center gap-2 text-[13.5px] text-muted hover:text-ink"
      >
        <CircleHelp size={14} />
        Как это работает?
      </button>

      <div className="mt-12 w-full max-w-[460px] rounded-[14px] border border-border bg-white p-5 text-left">
        <div className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-2">
          что нужно сделать в первый раз
        </div>
        <ol className="space-y-2.5">
          <li className="flex items-start gap-2.5 text-[13px] leading-[1.5] text-ink-2">
            <span className="mt-[1px] grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
              1
            </span>
            <span>
              <b className="font-semibold text-ink">Завести первое дело</b>{" "}
              — выбрать клиента из CRM или ввести нового, тип долга
              (ДТП / Ущерб / Угон / Аренда), сумму и комментарий.
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-[13px] leading-[1.5] text-ink-2">
            <span className="mt-[1px] grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-surface-soft text-[11px] font-bold text-muted">
              2
            </span>
            <span>
              После создания откроется <b className="font-semibold text-ink">дерево дела</b> —
              будешь вести должника по стадиям одной кнопкой.
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-[13px] leading-[1.5] text-ink-2">
            <span className="mt-[1px] grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-surface-soft text-[11px] font-bold text-muted">
              3
            </span>
            <span>
              Платежи фиксируются в <b className="font-semibold text-ink">один клик</b>.
              Просрочки и эскалации к юристу — автоматические подсказки.
            </span>
          </li>
        </ol>
      </div>
    </section>
  );
}
