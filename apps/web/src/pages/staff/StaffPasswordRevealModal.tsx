import { useEffect, useState } from "react";
import { Check, Copy, Eye, EyeOff, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function StaffPasswordRevealModal({
  data,
  onClose,
}: {
  data: {
    name: string;
    login: string;
    password: string;
    kind: "created" | "reset";
  };
  onClose: () => void;
}) {
  const [show, setShow] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Специально НЕ закрываем по Esc — чтобы юзер не потерял пароль случайно.
    // Только по явному клику «Закрыть».
  }, []);

  const copy = () => {
    try {
      navigator.clipboard?.writeText(data.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* noop */
    }
  };

  const headline =
    data.kind === "created" ? "Сотрудник создан" : "Пароль сброшен";

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-ink/70 p-6 backdrop-blur-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mt-16 w-full max-w-[480px] overflow-hidden rounded-2xl bg-surface shadow-card-lg">
        <div className="border-b border-border bg-green-soft/60 px-5 py-4">
          <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-green-ink">
            <Check size={14} /> {headline}
          </div>
          <div className="mt-1 text-[14px] font-bold text-ink">
            {data.name}{" "}
            <span className="font-mono text-muted-2 text-[12px]">
              @{data.login}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <div className="rounded-xl bg-orange-soft/60 px-3 py-2.5 text-[12px] text-orange-ink">
            <div className="mb-0.5 flex items-center gap-1.5 font-bold">
              <TriangleAlert size={12} /> Этот пароль показывается один раз
            </div>
            После закрытия окна посмотреть его снова будет нельзя — система
            не хранит пароли в открытом виде. Скопируйте и передайте
            сотруднику (в мессенджер). При первом входе он обязан будет
            сменить его на свой.
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Временный пароль
            </div>
            <div className="flex items-stretch gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-[10px] border border-border bg-surface-soft px-3 font-mono text-[16px] font-bold tracking-wider text-ink">
                {show
                  ? data.password
                  : "•".repeat(data.password.length)}
              </div>
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                title={show ? "Скрыть" : "Показать"}
                className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-surface-soft text-ink-2 hover:bg-blue-50 hover:text-blue-700"
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button
                type="button"
                onClick={copy}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 rounded-[10px] px-4 text-[13px] font-bold transition-colors",
                  copied
                    ? "bg-green text-white"
                    : "bg-ink text-white hover:bg-blue-600",
                )}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Скопировано" : "Копировать"}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-white hover:bg-blue-600"
            >
              Я скопировал, закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
