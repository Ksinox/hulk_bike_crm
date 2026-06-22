import { useState } from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/useIsMobile";
import { MobileNumPad } from "@/mobile/MobileNumPad";
import { DocumentPreviewModal } from "./DocumentPreviewModal";

/**
 * Превью досудебной претензии для печати (десктоп + мобила).
 *
 * Срок добровольной оплаты (дней) задаётся оператором: на десктопе — инлайн в
 * шапке (пресеты + поле), на мобиле — компактный чип, открывающий крупный
 * нативный num-pad (как суммы в ущербе). Дата «оплатить до» = дата акта + N
 * дней; меняем N → URL превью/Word перегенерируется, печать берёт актуальную.
 *
 * Доступно везде, где есть акт: и из действия «Досудебная претензия», и из
 * вкладки «Документы» карточки аренды (DamageReportCard) — единый компонент,
 * чтобы срок-инпут вёл себя одинаково.
 */
export function ClaimDocumentPreview({
  reportId,
  onClose,
}: {
  reportId: number;
  onClose: () => void;
}) {
  const base =
    import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
  const isMobile = useIsMobile();
  const [dueDays, setDueDays] = useState(21);
  const [daysPadOpen, setDaysPadOpen] = useState(false);
  const htmlUrl = `${base}/api/damage-reports/${reportId}/claim?format=html&days=${dueDays}`;
  const docxUrl = `${base}/api/damage-reports/${reportId}/claim?format=docx&days=${dueDays}`;
  return (
    <>
      <DocumentPreviewModal
        title={`Досудебная претензия #${reportId}`}
        htmlUrl={htmlUrl}
        docxUrl={docxUrl}
        docxFilename={`Досудебная претензия ${String(reportId).padStart(4, "0")}.doc`}
        headerExtra={
          <>
            {/* Десктоп: быстрые пресеты + произвольное число дней инлайн. */}
            <div
              title="Срок добровольной оплаты — дата «оплатить до» в претензии (1–180 дней)"
              className="hidden sm:inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-[12px] font-semibold text-muted-2"
            >
              Срок оплаты
              {[14, 21, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDueDays(d)}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[12px] font-bold transition-colors",
                    dueDays === d
                      ? "bg-blue-600 text-white"
                      : "text-ink-2 hover:bg-border",
                  )}
                >
                  {d}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={180}
                value={dueDays}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value));
                  if (!Number.isFinite(n)) return;
                  setDueDays(Math.max(1, Math.min(180, n)));
                }}
                className="w-12 rounded-md border border-border bg-surface px-1 py-0.5 text-center text-[12px] font-bold text-ink outline-none focus:border-blue-400"
              />
              дн
            </div>
            {/* Мобила: компактный чип → крупный нативный num-pad. */}
            <button
              type="button"
              onClick={() => setDaysPadOpen(true)}
              title="Срок добровольной оплаты"
              className="inline-flex sm:hidden items-center gap-1.5 rounded-full bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800 transition-transform active:scale-95"
            >
              <Clock size={13} /> Срок: {dueDays} дн
            </button>
          </>
        }
        onClose={onClose}
      />
      {isMobile &&
        daysPadOpen &&
        createPortal(
          <MobileNumPad
            label="Срок добровольной оплаты"
            sublabel="дата «оплатить до» = дата акта + N дней"
            suffix="дн"
            initial={dueDays}
            max={180}
            hint="1–180 дней"
            onCancel={() => setDaysPadOpen(false)}
            onConfirm={(n) => {
              setDueDays(Math.max(1, Math.min(180, n)));
              setDaysPadOpen(false);
            }}
          />,
          document.body,
        )}
    </>
  );
}
