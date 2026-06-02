import { AlertTriangle, ArrowRight, Flag, Phone, Scale, StickyNote } from "lucide-react";
import { navigate } from "@/app/navigationStore";
import { DonutProgress } from "@/components/DonutProgress";
import { useDebtor } from "@/lib/api/debtors";
import {
  STAGE_LABEL,
  TYPE_LABEL,
  formatRub,
  type DebtType,
  type DebtorCaseSummary,
} from "@/lib/debtors/types";

/**
 * Вкладка «Должник» в карточке клиента. Показывает дела-должники этого
 * клиента: прогресс погашения (кольцевая диаграмма), график платежей по
 * строкам с комментариями, последние звонки. Активные дела — сверху,
 * закрытые — отдельным блоком. Кнопка ведёт в модуль «Должники».
 */

const TYPE_BG: Record<DebtType, string> = {
  dtp_guilty: "bg-red-50 text-red-700 border-red-100",
  dtp_victim: "bg-blue-50 text-blue-700 border-blue-100",
  damage: "bg-orange-50 text-orange-700 border-orange-100",
  theft: "bg-violet-50 text-violet-700 border-violet-100",
  rental_overdue: "bg-slate-50 text-slate-600 border-slate-200",
};
const TYPE_DOT: Record<DebtType, string> = {
  dtp_guilty: "bg-red-500",
  dtp_victim: "bg-blue-500",
  damage: "bg-orange-500",
  theft: "bg-violet-500",
  rental_overdue: "bg-slate-500",
};

export function ClientDebtorsTab({ cases }: { cases: DebtorCaseSummary[] }) {
  if (cases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-soft text-muted-2">
          <Scale size={22} />
        </div>
        <div className="text-[13px] text-muted">
          Клиент не числится в должниках.
        </div>
      </div>
    );
  }
  const active = cases.filter((c) => c.active);
  const closed = cases.filter((c) => !c.active);

  return (
    <div className="space-y-3">
      {active.map((c) => (
        <ClientDebtorCaseCard key={c.id} summary={c} />
      ))}
      {closed.length > 0 && (
        <>
          <div className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-2">
            Закрытые дела · {closed.length}
          </div>
          {closed.map((c) => (
            <ClientDebtorCaseCard key={c.id} summary={c} />
          ))}
        </>
      )}
    </div>
  );
}

function ClientDebtorCaseCard({ summary }: { summary: DebtorCaseSummary }) {
  // Подробности (график платежей, звонки) подтягиваем по требованию.
  const q = useDebtor(summary.id);
  const d = q.data;
  const remaining = Math.max(0, summary.totalAmount - summary.paid);

  return (
    <div
      className={`rounded-[16px] border bg-white p-5 shadow-card-sm ${
        summary.active ? "border-border" : "border-border opacity-75"
      }`}
    >
      {/* Шапка дела */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold ${TYPE_BG[summary.type]}`}
        >
          <i
            className={`inline-block h-1.5 w-1.5 rounded-full ${TYPE_DOT[summary.type]}`}
          />
          {TYPE_LABEL[summary.type]}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-2">
          {summary.caseNumber}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${
            summary.active
              ? "bg-amber-50 text-amber-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {STAGE_LABEL[summary.stage]}
        </span>
        {summary.problem && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-soft px-2 py-0.5 text-[11px] font-bold text-red-ink">
            <AlertTriangle size={11} /> Проблемный
          </span>
        )}
        <button
          type="button"
          onClick={() => navigate({ route: "debtors", debtorId: summary.id })}
          className="ml-auto inline-flex min-h-[40px] items-center gap-1 rounded-full border border-border px-4 py-2 text-[12px] font-semibold text-ink transition-colors hover:border-ink sm:min-h-0 sm:px-3 sm:py-1"
        >
          Открыть дело <ArrowRight size={12} />
        </button>
      </div>

      {/* Диаграмма + разбивка сумм */}
      <div className="mt-4 flex flex-wrap items-center gap-5">
        <DonutProgress paid={summary.paid} total={summary.totalAmount} size={116} />
        <div className="grid min-w-[220px] flex-1 grid-cols-3 gap-x-4 gap-y-2">
          <Stat label="Всего долг" value={formatRub(summary.totalAmount)} />
          <Stat label="Оплачено" value={formatRub(summary.paid)} tone="green" />
          <Stat label="Осталось" value={formatRub(remaining)} tone="ink" />
        </div>
      </div>

      {/* График платежей по строкам */}
      {d && d.payments.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-2">
            График платежей
          </div>
          <div className="space-y-1">
            {d.payments.map((p) => {
              const paid = p.paidAt != null;
              const overdue = !paid && new Date(p.scheduledDate) < new Date();
              return (
                <div
                  key={p.id}
                  className={`grid grid-cols-[22px_1fr_auto_14px] items-center gap-3 rounded-[8px] px-2.5 py-1.5 text-[12.5px] ${
                    paid ? "bg-emerald-50" : overdue ? "bg-red-50" : ""
                  }`}
                >
                  <span className="font-mono text-[10.5px] text-muted-2">
                    {p.n}
                  </span>
                  <div className="min-w-0">
                    <div
                      className={
                        paid
                          ? "text-emerald-700"
                          : overdue
                            ? "font-semibold text-red-700"
                            : "text-ink"
                      }
                    >
                      {p.scheduledDate}
                      <span className="ml-2 font-mono text-[10.5px] text-muted">
                        {paid
                          ? `оплачен · ${p.paidMethod === "transfer" ? "перевод" : "наличные"}`
                          : overdue
                            ? "просрочка"
                            : "плановый"}
                      </span>
                    </div>
                    {p.note && (
                      <div className="mt-0.5 text-[11px] italic leading-snug text-ink-2">
                        {p.note}
                      </div>
                    )}
                  </div>
                  <span className="font-mono text-[12px] font-semibold text-ink tabular-nums">
                    {(p.paidAmount ?? p.scheduledAmount).toLocaleString("ru-RU")} ₽
                  </span>
                  <span
                    className={`h-3 w-3 rounded-full border-2 ${
                      paid
                        ? "border-emerald-600 bg-emerald-600"
                        : overdue
                          ? "border-red-600 bg-red-600"
                          : "border-border-strong"
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* История взыскания — все разбирательства по делу: смены стадий,
          звонки, заметки. Платежи показаны выше в графике. */}
      {d &&
        (() => {
          const events: { ts: string; kind: "stage" | "call" | "note"; text: string }[] = [
            ...d.stageEvents.map((e) => ({
              ts: e.createdAt,
              kind: "stage" as const,
              text: `${e.fromStage ? STAGE_LABEL[e.fromStage] + " → " : ""}${STAGE_LABEL[e.toStage]}${e.reason ? " · " + e.reason : ""}`,
            })),
            ...d.calls.map((c) => ({
              ts: c.createdAt,
              kind: "call" as const,
              text: callText(c),
            })),
            ...d.notes.map((n) => ({
              ts: n.createdAt,
              kind: "note" as const,
              text: n.text,
            })),
          ].sort((a, b) => b.ts.localeCompare(a.ts));
          if (events.length === 0) return null;
          return (
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-2">
                История взыскания
              </div>
              <div className="space-y-1.5">
                {events.map((ev, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-[12.5px] text-ink-2"
                  >
                    {ev.kind === "call" ? (
                      <Phone size={12} className="mt-0.5 shrink-0 text-blue-500" />
                    ) : ev.kind === "note" ? (
                      <StickyNote
                        size={12}
                        className="mt-0.5 shrink-0 text-amber-500"
                      />
                    ) : (
                      <Flag size={12} className="mt-0.5 shrink-0 text-muted-2" />
                    )}
                    <div className="min-w-0">
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-muted-2">
                        {ev.ts.slice(0, 10)}
                      </span>{" "}
                      {ev.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

      {/* Причина закрытия */}
      {!summary.active && summary.closedReason && (
        <div className="mt-3 rounded-[10px] bg-surface-soft px-3 py-2 text-[12px] text-muted">
          Закрыто: {summary.closedReason}
        </div>
      )}
    </div>
  );
}

function callText(c: {
  outcome: string;
  promisedDate: string | null;
  note: string | null;
}): string {
  const base =
    c.outcome === "answered"
      ? "звонок — ответил"
      : c.outcome === "no_answer"
        ? "звонок — не дозвонился"
        : c.outcome === "promised"
          ? `звонок — обещал${c.promisedDate ? ` к ${c.promisedDate}` : ""}`
          : "звонок — отказался";
  return c.note ? `${base} · ${c.note}` : base;
}

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "ink" | "green";
}) {
  const color =
    tone === "green" ? "text-emerald-700" : tone === "ink" ? "text-ink" : "text-ink";
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-2">
        {label}
      </div>
      <div
        className={`mt-0.5 font-display text-[16px] font-bold leading-none tabular-nums ${color}`}
      >
        {value}
      </div>
    </div>
  );
}
