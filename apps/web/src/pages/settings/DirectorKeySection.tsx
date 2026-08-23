import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApprovalsStatus, useSetDirectorKey } from "@/lib/api/approvals";
import { toast } from "@/lib/toast";

/**
 * Пункт 1 — настройка «Ключа директора».
 *
 * Ключ знает только настоящий директор. Пока ключ не установлен —
 * защищённые действия (удаление аренды, перенос техники между категориями,
 * вывод скутера из парка) выполняются свободно; после установки каждое
 * такое действие требует ввода ключа или подтверждения директором.
 */
export function DirectorKeySection() {
  const { data } = useApprovalsStatus();
  const setKey = useSetDirectorKey();
  const keySet = data?.keySet ?? false;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (next.length < 4) return setError("Ключ — минимум 4 символа.");
    if (next !== repeat) return setError("Повтор ключа не совпадает.");
    try {
      await setKey.mutateAsync({
        currentKey: keySet ? current : undefined,
        newKey: next,
      });
      toast.success(
        keySet ? "Ключ директора изменён" : "Ключ директора установлен",
        "Защищённые действия теперь требуют подтверждения этим ключом.",
      );
      setCurrent("");
      setNext("");
      setRepeat("");
    } catch (e) {
      setError(
        (e as { status?: number }).status === 403
          ? "Текущий ключ неверен."
          : "Не удалось сохранить ключ.",
      );
    }
  };

  const inputCls = (bad?: boolean) =>
    cn(
      "h-11 w-full rounded-xl border-2 bg-surface px-3 text-[14px] font-semibold text-ink outline-none transition-colors",
      bad ? "border-red-300" : "border-border focus:border-blue-500",
    );

  return (
    <section className="rounded-2xl bg-surface p-5 shadow-card-sm">
      <div className="mb-1 flex items-center gap-2">
        <KeyRound size={16} className="text-blue-600" />
        <div className="text-[14px] font-semibold text-ink">Ключ директора</div>
        {keySet && (
          <span className="flex items-center gap-1 rounded-full bg-green-soft px-2 py-0.5 text-[11px] font-bold text-green-ink">
            <ShieldCheck size={11} /> установлен
          </span>
        )}
      </div>
      <p className="mb-4 max-w-xl text-[12.5px] leading-relaxed text-muted">
        Отдельный пароль, который знает только директор. Защищённые действия
        (удаление аренды, перенос техники между категориями, вывод скутера из
        парка) потребуют этот ключ — либо на месте, либо запросом директору
        на телефон.
        {!keySet && " Пока ключ не установлен, защита выключена."}
      </p>

      <div className="grid max-w-xl gap-3 sm:grid-cols-3">
        {keySet && (
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Текущий ключ
            </label>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="off"
              className={inputCls()}
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-2">
            {keySet ? "Новый ключ" : "Ключ"}
          </label>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            className={inputCls(!!error && next.length < 4)}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-2">
            Повторите
          </label>
          <input
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            autoComplete="new-password"
            className={inputCls(!!error && next !== repeat)}
          />
        </div>
      </div>
      {error && (
        <div className="mt-2 text-[12.5px] font-semibold text-red-ink">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={setKey.isPending || !next}
        className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-5 text-[13.5px] font-bold text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
      >
        {setKey.isPending ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <ShieldCheck size={15} />
        )}
        {keySet ? "Сменить ключ" : "Установить ключ"}
      </button>
    </section>
  );
}
