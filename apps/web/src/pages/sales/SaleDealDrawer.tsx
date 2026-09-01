import {
  Ban,
  Banknote,
  ChevronRight,
  FileText,
  Pencil,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast, confirmDialog } from "@/lib/toast";
import { fileUrl } from "@/lib/files";
import { useMe } from "@/lib/api/auth";
import {
  saleContractUrl,
  useCancelSaleDeal,
  useDeleteSaleDeal,
  type SaleDeal,
} from "@/lib/api/sales";
import { ManagerAvatar } from "./SalesUI";
import { fmt, ruDate, STATUS_CLASS, STATUS_LABEL } from "./salesUtils";

/**
 * Карточка сделки (31.08): всё о продаже в одном окне — техника с VIN,
 * номером двигателя и партией, покупатель, менеджер, деньги и документы.
 * Отсюда же можно продолжить незавершённую сделку, распечатать договор,
 * отменить продажу или (директору) удалить сделку.
 */

export function SaleDealDrawer({
  deal,
  onClose,
  onContinue,
  onOpenScooter,
}: {
  deal: SaleDeal;
  onClose: () => void;
  onContinue: (dealId: number) => void;
  onOpenScooter: (scooterId: number) => void;
}) {
  const { data: me } = useMe();
  const isDirector = me?.role === "director" || me?.role === "creator";
  const cancel = useCancelSaleDeal();
  const del = useDeleteSaleDeal();

  const profit = deal.price - (deal.purchasePrice ?? 0);
  const margin = deal.price > 0 ? Math.round((profit / deal.price) * 100) : 0;
  const unfinished = deal.status === "draft" || deal.status === "contract";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[19px] font-extrabold text-ink">
              Сделка #{String(deal.id).padStart(4, "0")}
            </h2>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-bold",
                STATUS_CLASS[deal.status],
              )}
            >
              {STATUS_LABEL[deal.status]}
            </span>
          </div>
          <div className="mt-0.5 text-[12px] text-muted">
            {deal.status === "signed"
              ? `продана ${ruDate(deal.soldAt)}`
              : `создана ${ruDate(deal.createdAt)}`}
            {deal.createdBy && ` · оформил ${deal.createdBy}`}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-2 hover:bg-surface-soft hover:text-ink"
        >
          <X size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          {/* Деньги */}
          <div className="grid grid-cols-3 gap-2">
            <Money label="Продажа" value={`${fmt(deal.price)} ₽`} accent />
            <Money
              label="Закуп"
              value={deal.purchasePrice != null ? `${fmt(deal.purchasePrice)} ₽` : "—"}
            />
            <Money
              label="Прибыль"
              value={
                deal.purchasePrice != null
                  ? `${profit >= 0 ? "+" : ""}${fmt(profit)} ₽`
                  : "—"
              }
              hint={deal.purchasePrice != null ? `маржа ${margin}%` : undefined}
              tone={profit >= 0 ? "good" : "bad"}
            />
          </div>

          {/* Чем рассчитались — видно сразу, не заглядывая в журнал (01.09) */}
          {deal.status === "signed" && (
            <div className="flex items-center gap-2 rounded-xl bg-surface-soft/70 px-3 py-2 text-[12.5px]">
              <Banknote size={14} className="shrink-0 text-muted-2" />
              <span className="text-muted">Расчёт</span>
              <span className="ml-auto font-semibold text-ink">
                {deal.payMethod === "mixed"
                  ? `${fmt(deal.payCash ?? 0)} ₽ наличными + ${fmt(deal.payTransfer ?? 0)} ₽ переводом`
                  : deal.payMethod === "transfer"
                    ? "переводом"
                    : "наличными"}
              </span>
            </div>
          )}

          {/* Техника */}
          <Section title="Техника">
            <button
              type="button"
              disabled={deal.scooterId == null}
              onClick={() => deal.scooterId != null && onOpenScooter(deal.scooterId)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-soft/60 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold text-ink">
                  {deal.modelName || deal.scooterName || "—"}
                </span>
                <span className="block text-[12px] text-muted">
                  {deal.mileage != null ? `${fmt(deal.mileage)} км` : "пробег —"}
                  {deal.purchaseBatch && ` · ${deal.purchaseBatch}`}
                </span>
              </span>
              {deal.scooterId != null && (
                <ChevronRight size={16} className="shrink-0 text-muted-2" />
              )}
            </button>
            <Row label="VIN / рама" value={deal.vin || deal.frameNumber || "—"} mono />
            <Row label="Номер двигателя" value={deal.engineNo || "—"} mono />
          </Section>

          {/* Покупатель и менеджер */}
          <Section title="Стороны">
            <Row label="Покупатель" value={deal.clientName ?? "—"} />
            <Row label="Телефон" value={deal.clientPhone ?? "—"} />
            <div className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-[130px] shrink-0 text-[11.5px] text-muted-2">
                Менеджер
              </span>
              {deal.managerName ? (
                <span className="flex min-w-0 items-center gap-2">
                  <ManagerAvatar
                    name={deal.managerName}
                    color={deal.managerColor}
                    size={24}
                  />
                  <span className="min-w-0 truncate text-[13px] font-semibold text-ink">
                    {deal.managerName}
                  </span>
                  {deal.managerCommission ? (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                      {deal.managerCommissionPct}% → {fmt(deal.managerCommission)} ₽
                    </span>
                  ) : deal.managerCommissionPct ? (
                    <span className="shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-[11px] font-bold text-muted-2">
                      {deal.managerCommissionPct}%
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="text-[13px] text-muted-2">не указан</span>
              )}
            </div>
          </Section>

          {deal.comment && (
            <Section title="Комментарий">
              <div className="px-4 py-3 text-[13px] leading-relaxed text-ink-2">
                {deal.comment}
              </div>
            </Section>
          )}

          {deal.cancelReason && (
            <div className="rounded-xl bg-red-soft px-3 py-2.5 text-[12.5px] text-red-ink">
              Сделка отменена · причина: {deal.cancelReason}
            </div>
          )}

          {/* Документы */}
          <Section title="Документы">
            <div className="flex flex-wrap gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => window.open(saleContractUrl(deal.id, "html"), "_blank")}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[12.5px] font-bold text-white"
              >
                <Printer size={14} /> Договор
              </button>
              <button
                type="button"
                onClick={() => window.open(saleContractUrl(deal.id, "docx"), "_blank")}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-soft px-4 text-[12.5px] font-semibold text-ink"
              >
                <FileText size={14} /> Word
              </button>
            </div>
            {deal.documents.length > 0 ? (
              <div className="grid gap-2 px-4 pb-3 sm:grid-cols-2">
                {deal.documents.map((d) => (
                  <a
                    key={d.id}
                    href={fileUrl(d.fileKey) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-xl border border-border p-2 transition-colors hover:bg-surface-soft/60"
                  >
                    {d.mimeType.startsWith("image/") ? (
                      <img
                        src={fileUrl(d.fileKey, { variant: "thumb" }) ?? undefined}
                        alt={d.fileName}
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-muted">
                        <FileText size={18} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-ink">
                        {d.title || d.fileName}
                      </span>
                      <span className="block text-[11px] text-muted-2">
                        {ruDate(d.uploadedAt)}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="px-4 pb-3 text-[12px] text-orange-ink">
                Копия подписанного договора не приложена.
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* Действия */}
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        {unfinished && (
          <button
            type="button"
            onClick={() => onContinue(deal.id)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-emerald-600 px-5 text-[13px] font-bold text-white transition-transform active:scale-[0.98]"
          >
            <Pencil size={14} /> Продолжить оформление
          </button>
        )}
        <div className="flex-1" />
        {deal.status !== "cancelled" && (
          <button
            type="button"
            onClick={async () => {
              const ok = await confirmDialog({
                title: "Отменить сделку?",
                message:
                  deal.status === "signed"
                    ? "Продажа будет отменена, техника вернётся в статус «Продаётся», а сделка перестанет учитываться в показателях."
                    : "Сделка будет помечена отменённой. Технику это не затронет.",
                confirmText: "Отменить сделку",
                danger: true,
              });
              if (!ok) return;
              try {
                await cancel.mutateAsync({ id: deal.id });
                toast.success("Сделка отменена");
                onClose();
              } catch {
                toast.error("Не удалось отменить");
              }
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold text-muted hover:text-red-ink"
          >
            <Ban size={14} /> Отменить
          </button>
        )}
        {isDirector && (
          <button
            type="button"
            onClick={async () => {
              const ok = await confirmDialog({
                title: `Удалить сделку #${String(deal.id).padStart(4, "0")}?`,
                message:
                  "Сделка и приложенные файлы будут удалены навсегда. В журнале останется запись с полными данными.",
                confirmText: "Удалить навсегда",
                danger: true,
              });
              if (!ok) return;
              try {
                await del.mutateAsync(deal.id);
                toast.success("Сделка удалена");
                onClose();
              } catch {
                toast.error("Не удалось удалить");
              }
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-2 hover:bg-red-soft hover:text-red-ink"
            title="Удалить сделку"
          >
            <Trash2 size={15} />
          </button>
        )}
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-surface-soft/40">
      <div className="border-b border-border/60 px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
        {title}
      </div>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 px-4 py-2.5">
      <span className="w-[130px] shrink-0 text-[11.5px] text-muted-2">{label}</span>
      <span
        className={cn(
          "min-w-0 flex-1 break-all text-[13px] font-semibold text-ink",
          mono && "tabular-nums",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Money({
  label,
  value,
  hint,
  accent,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2.5",
        accent ? "bg-emerald-600 text-white" : "bg-surface-soft",
      )}
    >
      <div
        className={cn(
          "text-[10px] font-bold uppercase tracking-wider",
          accent ? "text-white/70" : "text-muted-2",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-[15px] font-bold tabular-nums",
          accent
            ? "text-white"
            : tone === "bad"
              ? "text-red-ink"
              : tone === "good"
                ? "text-emerald-700"
                : "text-ink",
        )}
      >
        {value}
      </div>
      {hint && (
        <div
          className={cn(
            "text-[10.5px]",
            accent ? "text-white/70" : "text-muted-2",
          )}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
