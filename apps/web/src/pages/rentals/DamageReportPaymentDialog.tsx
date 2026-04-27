import { useEffect, useState } from "react";
import { CheckCircle2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useMe } from "@/lib/api/auth";
import {
  useDamageReports,
  useDamagePayment,
} from "@/lib/api/damage-reports";

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

/**
 * Модалка платежа за ущерб.
 *  - Поле «Сумма» — сколько внёс клиент (можно частично).
 *  - «Кто принял» — автоматически = текущий пользователь, не редактируется.
 *  - При Enter / клике «Принять платёж» — POST /api/damage-reports/:id/payment.
 */
export function DamageReportPaymentDialog({
  reportId,
  onClose,
}: {
  reportId: number;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Подгрузим акты по аренде через тот же кэш — нам нужен debt и rentalId.
  // Чтобы не делать отдельный запрос /:id, вытаскиваем из общего списка
  // через useDamageReports когда мы знаем rentalId. Альтернатива — отдельный
  // fetcher. Здесь пойдём простым путём: используем общий query и фильтруем.
  // Но мы не знаем rentalId здесь — поэтому грузим список через все аренды
  // невозможно. Делаю прямой fetch одного акта.
  const me = useMe();

  // Вместо useApi/useQuery простой fetch с локальным state.
  const [report, setReport] = useState<{
    id: number;
    rentalId: number;
    total: number;
    depositCovered: number;
    debt: number;
    paidSum: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const base =
          import.meta.env.VITE_API_URL?.replace(/\/$/, "") ??
          "http://localhost:4000";
        const res = await fetch(`${base}/api/damage-reports/${reportId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (!cancelled) setReport(data);
      } catch (e) {
        if (!cancelled)
          toast.error("Не удалось загрузить акт", (e as Error).message ?? "");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  // Refetch helper для useDamageReports — после успешного платежа
  // обновим список актов в карточке аренды (через query invalidation в hook).
  void useDamageReports;

  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState("");
  const pay = useDamagePayment();

  // По умолчанию ставим сумму = весь остаток долга (удобно — один клик).
  useEffect(() => {
    if (report) setAmount(report.debt);
  }, [report]);

  const submit = async () => {
    if (!report) return;
    if (amount <= 0) {
      toast.error("Сумма должна быть больше 0", "");
      return;
    }
    try {
      await pay.mutateAsync({
        reportId,
        input: {
          amount,
          note: note.trim() || null,
        },
      });
      toast.success(
        "Платёж принят",
        `${fmt(amount)} ₽ зачтено по акту #${reportId}`,
      );
      requestClose();
    } catch (e) {
      toast.error("Не удалось принять платёж", (e as Error).message ?? "");
    }
  };

  const debtAfter = report ? Math.max(0, report.debt - amount) : 0;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[130] flex items-center justify-center bg-ink/55 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onClick={requestClose}
    >
      <div
        className={cn(
          "w-full max-w-[440px] overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <Plus size={18} className="text-blue-600" />
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
            Платёж по акту #{reportId}
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 text-[13px]">
          {loading ? (
            <div className="py-6 text-center text-muted-2">Загружаем…</div>
          ) : !report ? (
            <div className="py-6 text-center text-muted-2">Акт не найден</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 rounded-[10px] bg-surface-soft p-3 text-[12px]">
                <div>
                  <div className="text-muted-2">Сумма по акту</div>
                  <div className="font-semibold tabular-nums text-ink">
                    {fmt(report.total)} ₽
                  </div>
                </div>
                <div>
                  <div className="text-muted-2">Зачтено из залога</div>
                  <div className="font-semibold tabular-nums text-ink">
                    {fmt(report.depositCovered)} ₽
                  </div>
                </div>
                <div>
                  <div className="text-muted-2">Уже оплачено</div>
                  <div className="font-semibold tabular-nums text-ink">
                    {fmt(report.paidSum)} ₽
                  </div>
                </div>
                <div>
                  <div className="text-muted-2">Остаток долга</div>
                  <div className="font-bold tabular-nums text-red-600">
                    {fmt(report.debt)} ₽
                  </div>
                </div>
              </div>

              <label className="text-[12px] font-semibold text-ink">
                Сумма платежа, ₽
                <input
                  autoFocus
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) =>
                    setAmount(Math.max(0, Number(e.target.value) || 0))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                  className="mt-1 h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-right text-[15px] font-bold tabular-nums text-ink outline-none focus:border-blue-600"
                />
              </label>

              <label className="text-[12px] font-semibold text-ink">
                Комментарий (необязательно)
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="например, «частично, вторая половина в пятницу»"
                  className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] outline-none focus:border-blue-600"
                />
              </label>

              <div className="rounded-[10px] bg-surface-soft px-3 py-2 text-[12px] text-muted-2">
                Принимает: <b className="text-ink">{me.data?.name ?? "—"}</b>
                <div className="mt-0.5 text-[11px]">
                  После платежа долг станет:{" "}
                  <b
                    className={cn(
                      "tabular-nums",
                      debtAfter === 0 ? "text-green-600" : "text-red-600",
                    )}
                  >
                    {fmt(debtAfter)} ₽
                  </b>
                  {debtAfter === 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-green-700">
                      <CheckCircle2 size={11} /> долг закрыт
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-[10px] bg-surface-soft px-4 py-2 text-[13px] font-semibold text-ink-2 hover:bg-surface"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={!report || amount <= 0 || pay.isPending}
            onClick={submit}
            className="rounded-[10px] bg-ink px-4 py-2 text-[13px] font-bold text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {pay.isPending ? "Принимаем…" : "Принять платёж"}
          </button>
        </div>
      </div>
    </div>
  );
}
