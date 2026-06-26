import { useState } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  History,
  Pencil,
  Play,
  Plus,
  Printer,
  Scale,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/files";
import { MediaLightbox, type LightboxItem } from "@/components/MediaLightbox";
import { DamageRevisionHistory } from "./DamageRevisionHistory";
import type { ApiDamageReport } from "@/lib/api/damage-reports";

/**
 * Read-only витрина акта(ов) о повреждениях в карточке аренды: суммы + долг +
 * галерея медиа (фото/видео доказательства). Тап по плитке → лайтбокс. Чтобы
 * смотреть приложенные материалы НЕ заходя в редактирование акта.
 *
 * Несколько актов на аренду (повторные повреждения) — суммируем и показываем
 * все медиа единой лентой. Версии/правки акта (Этап 2) добавятся позже.
 */
function fmt(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

const AGREEMENT: Record<string, { label: string; cls: string }> = {
  pending: { label: "на согласовании", cls: "bg-orange-soft text-orange-ink" },
  agreed: { label: "согласовано", cls: "bg-green-soft text-green-ink" },
  disputed: { label: "спор", cls: "bg-red-soft text-red-ink" },
};

export function DamageActBlock({
  reports,
  onEditReport,
  onPrintReport,
  onOpenDebtor,
  deposit,
  depositOriginal,
  onTopupDeposit,
}: {
  reports: ApiDamageReport[];
  /** Открыть последний акт на правку (DamageReportDialog в режиме edit). */
  onEditReport?: (reportId: number) => void;
  /** Открыть предпросмотр/печать акта (DocumentPreviewModal). */
  onPrintReport?: (reportId: number) => void;
  /** Этап 3: открыть/завести досудебное дело по акту (передаём акт + долг). */
  onOpenDebtor?: (report: ApiDamageReport, debt: number) => void;
  /** Текущий залог аренды — для сигнала «пополнить», если из него списали. */
  deposit?: number;
  /** Исходный (полный) залог — если deposit < этого, залог неполный. */
  depositOriginal?: number;
  /** Открыть диалог пополнения залога (тот же, что и в «Финансовой»). */
  onTopupDeposit?: () => void;
}) {
  const allMedia = reports.flatMap((r) => r.media ?? []);
  const total = reports.reduce((s, r) => s + r.total, 0);
  const debt = reports.reduce((s, r) => s + r.debt, 0);
  // Состав покрытия ущерба: total = из залога + оплачено деньгами + остаток-долг.
  const fromDeposit = reports.reduce((s, r) => s + (r.depositCovered ?? 0), 0);
  const paid = reports.reduce((s, r) => s + (r.paidSum ?? 0), 0);
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const depositGap =
    depositOriginal != null && deposit != null
      ? Math.max(0, depositOriginal - deposit)
      : 0;
  const latest = reports[reports.length - 1];
  const agreement = latest
    ? (AGREEMENT[latest.clientAgreement] ?? AGREEMENT.pending)
    : null;

  const lightboxItems: LightboxItem[] = allMedia.map((m) => ({
    kind: m.kind,
    url:
      m.kind === "photo"
        ? (fileUrl(m.fileKey, { variant: "view" }) ?? "")
        : (fileUrl(m.fileKey) ?? ""),
    poster:
      m.kind === "video"
        ? (fileUrl(m.posterKey, { variant: "view" }) ?? undefined)
        : undefined,
    processing: m.kind === "video" && m.status !== "ready",
    downloadUrl: fileUrl(m.fileKey) ?? undefined,
    durationSec: m.durationSec,
    name: m.fileName,
  }));
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {agreement && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-muted">
            {reports.length > 1
              ? `${reports.length} акта о повреждениях`
              : "Акт о повреждениях"}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
              agreement.cls,
            )}
          >
            {agreement.label}
          </span>
        </div>
      )}

      {/* Состав расчёта ущерба: сумма + статус-пилл + полоска «из чего сложилось»
          (из залога / оплачено / долг). Понятнее, чем «Долг погашен 0 ₽». */}
      <div className="rounded-xl bg-surface-soft px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] text-muted-2">Сумма ущерба</div>
            <div className="text-[18px] font-bold tabular-nums text-ink">
              {fmt(total)} ₽
            </div>
          </div>
          {debt > 0 ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-soft px-2.5 py-1 text-[11px] font-bold text-red-ink">
              <Clock size={12} /> Долг {fmt(debt)} ₽
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-soft px-2.5 py-1 text-[11px] font-bold text-green-ink">
              <Check size={12} /> Оплачен
            </span>
          )}
        </div>
        {total > 0 && (
          <>
            <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-ink/10">
              {fromDeposit > 0 && (
                <div
                  className="bg-amber-400"
                  style={{ width: `${pct(fromDeposit)}%` }}
                />
              )}
              {paid > 0 && (
                <div
                  className="bg-green-500"
                  style={{ width: `${pct(paid)}%` }}
                />
              )}
              {debt > 0 && (
                <div className="bg-red-500" style={{ width: `${pct(debt)}%` }} />
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
              {fromDeposit > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] bg-amber-400" /> Из
                  залога{" "}
                  <span className="font-semibold tabular-nums text-ink">
                    {fmt(fromDeposit)} ₽
                  </span>
                </span>
              )}
              {paid > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] bg-green-500" /> Оплачено{" "}
                  <span className="font-semibold tabular-nums text-ink">
                    {fmt(paid)} ₽
                  </span>
                </span>
              )}
              {debt > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] bg-red-500" /> Долг{" "}
                  <span className="font-semibold tabular-nums text-red-ink">
                    {fmt(debt)} ₽
                  </span>
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Сигнал: залог стал неполным (списали в счёт ущерба) — пополнить. Ведёт
          в тот же диалог, что плашка залога в «Финансовой». Только в карточке
          аренды (в досудебке onTopupDeposit не передаётся). */}
      {onTopupDeposit && depositGap > 0 && (
        <div className="flex items-center gap-2.5 rounded-xl bg-amber-50 px-3 py-2.5">
          <ShieldAlert size={18} className="shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-amber-900">
              Залог неполный — {fmt(deposit ?? 0)} из {fmt(depositOriginal ?? 0)}{" "}
              ₽
            </div>
            <div className="text-[11px] text-amber-700">
              пополнить на {fmt(depositGap)} ₽
            </div>
          </div>
          <button
            type="button"
            onClick={onTopupDeposit}
            className="flex shrink-0 items-center gap-1 rounded-full border border-amber-300 px-3 py-1.5 text-[12px] font-bold text-amber-800 transition-colors hover:bg-amber-100"
          >
            <Plus size={13} /> Пополнить
          </button>
        </div>
      )}

      {allMedia.length > 0 ? (
        <div>
          <div className="mb-1.5 text-[12px] font-semibold text-muted">
            Медиа-материалы · {allMedia.length}
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {allMedia.map((m, i) => {
              const processing = m.kind === "video" && m.status !== "ready";
              const thumb =
                m.kind === "photo"
                  ? fileUrl(m.fileKey, { variant: "thumb" })
                  : fileUrl(m.posterKey, { variant: "thumb" });
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setLightbox(i)}
                  className="relative aspect-square overflow-hidden rounded-lg bg-ink/5 ring-1 ring-inset ring-border transition-transform active:scale-[0.97]"
                >
                  {thumb && !processing ? (
                    <img
                      src={thumb}
                      className="h-full w-full object-cover"
                      alt="повреждение"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-ink/80 text-white">
                      {processing ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      ) : (
                        <Play size={16} className="fill-white" />
                      )}
                    </div>
                  )}
                  {m.kind === "video" && !processing && thumb && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55">
                        <Play size={13} className="fill-white text-white" />
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-3 py-3 text-center text-[12px] text-muted-2">
          К акту не приложено фото/видео.
        </div>
      )}

      {latest && (onEditReport || onPrintReport) && (
        <div className="flex gap-2">
          {onEditReport && (
            <button
              type="button"
              onClick={() => onEditReport(latest.id)}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-ink text-[13px] font-bold text-white transition-colors hover:bg-blue-600 active:scale-[0.98]"
            >
              <Pencil size={15} /> Изменить акт
            </button>
          )}
          {onPrintReport && (
            <button
              type="button"
              onClick={() => onPrintReport(latest.id)}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-50 text-[13px] font-bold text-blue-700 transition-colors hover:bg-blue-100 active:scale-[0.98]"
            >
              <Printer size={15} /> Печать акта
            </button>
          )}
        </div>
      )}

      {latest && debt > 0 && onOpenDebtor && (
        <button
          type="button"
          onClick={() => onOpenDebtor(latest, debt)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-soft text-[13px] font-bold text-red-ink transition-colors active:scale-[0.98]"
        >
          <Scale size={15} /> Досудебное дело →
        </button>
      )}

      {latest && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl bg-surface-soft px-3 py-2.5 text-[12px] font-semibold text-muted transition-colors hover:bg-border/40"
          >
            <span className="flex items-center gap-1.5">
              <History size={14} /> История правок и целостность
              {(latest.revisionNo ?? 1) > 1 && (
                <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                  ред. {latest.revisionNo}
                </span>
              )}
            </span>
            <ChevronDown
              size={15}
              className={cn("transition-transform", showHistory && "rotate-180")}
            />
          </button>
          {showHistory && (
            <div className="mt-2">
              <DamageRevisionHistory reportId={latest.id} />
            </div>
          )}
        </div>
      )}

      {lightbox != null && (
        <MediaLightbox
          items={lightboxItems}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
