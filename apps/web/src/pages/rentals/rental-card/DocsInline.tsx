/**
 * DocsInline — нижняя плитка с документами по аренде. По дизайну v0.6
 * заменяет таб «Документы» на инлайн-grid 4 колонки:
 *   • Договор + акт приёма-передачи
 *   • Акт возврата
 *   • Акт замены скутера
 *   • + сохранённые снапшоты (плитки)
 *
 * Источник правды:
 *   • эндпоинт /api/rentals/:id/document/:kind — генерируется на лету
 *   • useApiRentalDocSnapshots — фрозен-копии в S3 (для архива)
 */
import { useState } from "react";
import {
  ArrowLeftRight,
  Download,
  FileSignature,
  FileText,
  Trash2,
} from "lucide-react";
import {
  useApiRentalDocSnapshots,
  useDeleteRentalDocSnapshot,
  rentalDocSnapshotUrl,
} from "@/lib/api/rentals";
import { useApiClients } from "@/lib/api/clients";
import { toast } from "@/lib/toast";
import type { Rental } from "@/lib/mock/rentals";
import { DocumentPreviewModal } from "@/pages/rentals/DocumentPreviewModal";

type DocType = "contract_full" | "act_return" | "act_swap";

const DOC_META: Record<
  DocType,
  {
    title: string;
    short: string;
    badge: string;
    icon: typeof FileSignature;
  }
> = {
  contract_full: {
    title: "Договор + акт ПП",
    short: "Договор и приём",
    badge: "ДОГ",
    icon: FileSignature,
  },
  act_return: {
    title: "Акт возврата",
    short: "При возврате",
    badge: "ВЗВ",
    icon: FileText,
  },
  act_swap: {
    title: "Акт замены скутера",
    short: "При замене",
    badge: "ЗМ",
    icon: ArrowLeftRight,
  },
};

export function DocsInline({ rental }: { rental: Rental }) {
  const API_BASE =
    import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
  const { data: apiClients } = useApiClients();
  const client = apiClients?.find((c) => c.id === rental.clientId);
  const [preview, setPreview] = useState<DocType | null>(null);

  const apiType = (type: DocType): string =>
    type === "contract_full" && client?.isForeigner
      ? "contract_full_intl"
      : type;

  const previewUrl = (type: DocType) =>
    `${API_BASE}/api/rentals/${rental.id}/document/${apiType(type)}?format=html`;
  const downloadUrl = (type: DocType) =>
    `${API_BASE}/api/rentals/${rental.id}/document/${apiType(type)}?format=docx`;

  return (
    <div className="rounded-2xl bg-surface border border-border shadow-card-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
            Документы
          </div>
          <div className="text-[11px] text-muted">
            договоры и акты · клик для просмотра, скачивание Word
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {(Object.keys(DOC_META) as DocType[]).map((t) => {
          const meta = DOC_META[t];
          const Icon = meta.icon;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setPreview(t)}
              className="rounded-[12px] border border-border p-2.5 flex items-center gap-2.5 hover:border-blue-100 hover:bg-blue-50/40 cursor-pointer text-left transition-colors"
            >
              <div className="h-10 w-10 rounded-[10px] bg-blue-50 text-blue-700 flex items-center justify-center flex-col shrink-0">
                <Icon size={13} />
                <span className="text-[7.5px] font-bold uppercase tabular-nums mt-0.5">
                  {meta.badge}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold text-ink truncate">
                  {meta.title}
                </div>
                <div className="text-[10px] text-muted">{meta.short}</div>
              </div>
              <span className="h-7 w-7 rounded-full hover:bg-white text-muted hover:text-ink flex items-center justify-center shrink-0">
                <Download size={12} />
              </span>
            </button>
          );
        })}
        <SnapshotsBlock rental={rental} />
      </div>

      {preview && (
        <DocumentPreviewModal
          title={DOC_META[preview].title}
          htmlUrl={previewUrl(preview)}
          docxUrl={downloadUrl(preview)}
          docxFilename={`${DOC_META[preview].title} ${String(rental.id).padStart(4, "0")}.doc`}
          templateKey={apiType(preview)}
          templateName={DOC_META[preview].title}
          rentalId={rental.id}
          documentType={apiType(preview)}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function SnapshotsBlock({ rental }: { rental: Rental }) {
  const snapshotsQ = useApiRentalDocSnapshots(rental.id);
  const deleteSnapshot = useDeleteRentalDocSnapshot();
  const items = snapshotsQ.data ?? [];

  if (items.length === 0) return null;

  const handleDelete = async (id: number, title: string) => {
    if (!window.confirm(`Удалить сохранённую версию «${title}»?`)) return;
    try {
      await deleteSnapshot.mutateAsync({ snapshotId: id, rentalId: rental.id });
      toast.success("Удалено", title);
    } catch (e) {
      toast.error("Не удалось удалить", (e as Error).message ?? "");
    }
  };

  return (
    <>
      {items.map((s) => (
        <div
          key={s.id}
          className="rounded-[12px] border border-blue-100 bg-blue-50/30 p-2.5 flex items-center gap-2.5"
        >
          <div className="h-10 w-10 rounded-[10px] bg-white text-blue-700 flex items-center justify-center flex-col shrink-0 border border-blue-100">
            <FileText size={13} />
            <span className="text-[7.5px] font-bold uppercase tabular-nums mt-0.5">
              СН
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-bold text-ink truncate">
              {s.title}
            </div>
            <div className="text-[10px] text-muted">
              {new Date(s.savedAt).toLocaleDateString("ru-RU")}
            </div>
          </div>
          <a
            href={rentalDocSnapshotUrl(s.id, "html")}
            target="_blank"
            rel="noreferrer"
            className="h-7 w-7 rounded-full hover:bg-white text-muted hover:text-ink flex items-center justify-center shrink-0"
            title="Открыть"
          >
            <FileText size={12} />
          </a>
          <button
            type="button"
            onClick={() => handleDelete(s.id, s.title)}
            className="h-7 w-7 rounded-full hover:bg-red-soft text-muted hover:text-red-ink flex items-center justify-center shrink-0"
            title="Удалить версию"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </>
  );
}
