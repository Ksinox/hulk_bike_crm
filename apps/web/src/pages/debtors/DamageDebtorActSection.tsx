import { useState } from "react";
import { FileText } from "lucide-react";
import { useDamageReports } from "@/lib/api/damage-reports";
import { DamageActBlock } from "@/pages/rentals/rental-card/DamageActBlock";
import { ClaimDocumentPreview } from "@/pages/rentals/ClaimDocumentPreview";

/**
 * Этап 3 — связанный акт о повреждениях внутри досудебного дела: медиа-
 * доказательства (read-only блок акта: суммы/медиа/целостность ревизий) +
 * печать досудебной претензии прямо из дела.
 */
export function DamageDebtorActSection({
  rentalId,
  reportId,
}: {
  rentalId: number | null;
  reportId: number;
}) {
  const { data } = useDamageReports(rentalId);
  const [claimOpen, setClaimOpen] = useState(false);
  const report = (data ?? []).find((r) => r.id === reportId);
  if (!report) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-[14px] font-semibold text-ink">
          Акт о повреждениях
        </div>
        <button
          type="button"
          onClick={() => setClaimOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 transition-colors hover:bg-blue-100"
        >
          <FileText size={13} /> Печать претензии
        </button>
      </div>
      <DamageActBlock reports={[report]} />
      {claimOpen && (
        <ClaimDocumentPreview
          reportId={reportId}
          onClose={() => setClaimOpen(false)}
        />
      )}
    </div>
  );
}
