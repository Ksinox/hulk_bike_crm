import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileImage,
  FileText,
  Loader2,
  Printer,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FleetScooter } from "@/lib/mock/fleet";
import { useRole } from "@/lib/role";
import { MODEL_LABEL } from "@/lib/mock/rentals";
import {
  fileUrl,
  useApiScooterDocs,
  useDeleteScooterDoc,
  usePatchScooterDoc,
  useUploadScooterDoc,
  type ApiScooterDoc,
} from "@/lib/api/documents";
import { FilePreviewModal } from "@/pages/clients/FilePreviewModal";

const TODAY = new Date(2026, 9, 13);

const MONTH_RU = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function ScooterDocumentsTab({ scooter }: { scooter: FleetScooter }) {
  const role = useRole();
  const { data: docs = [] } = useApiScooterDocs(scooter.id);
  const uploadMut = useUploadScooterDoc(scooter.id);
  const patchMut = usePatchScooterDoc(scooter.id);
  const deleteMut = useDeleteScooterDoc(scooter.id);
  const [preview, setPreview] = useState<ApiScooterDoc | null>(null);

  const byKind = useMemo(() => {
    const m = new Map<ApiScooterDoc["kind"], ApiScooterDoc>();
    // Для ПТС/СТС/ОСАГО/договора документ один — берём первый подходящий kind.
    for (const d of docs) {
      if (d.kind === "photo") continue;
      m.set(d.kind, d);
    }
    return m;
  }, [docs]);

  const osagoDoc = byKind.get("osago");
  const osagoInfo = useMemo(() => {
    if (!osagoDoc?.osagoValidUntil) return null;
    const d = new Date(osagoDoc.osagoValidUntil);
    const diffDays = Math.round((d.getTime() - TODAY.getTime()) / 86_400_000);
    return {
      dateRu: isoToRu(osagoDoc.osagoValidUntil),
      expired: diffDays < 0,
      soon: diffDays >= 0 && diffDays <= 30,
      daysLeft: diffDays,
    };
  }, [osagoDoc?.osagoValidUntil]);

  const handleAct = (w: "open" | "print") => {
    const html = actHtml(scooter);
    const win = window.open("", "_blank", "width=820,height=1000");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    if (w === "print") {
      win.focus();
      setTimeout(() => win.print(), 250);
    }
  };

  const onPickFile = (kind: ApiScooterDoc["kind"], file: File) => {
    const osagoValidUntil =
      kind === "osago"
        ? (osagoDoc?.osagoValidUntil ?? undefined)
        : undefined;
    uploadMut.mutate({ kind, file, osagoValidUntil });
  };

  const onDelete = (doc: ApiScooterDoc) => {
    if (!window.confirm(`Удалить «${doc.fileName}»?`)) return;
    deleteMut.mutate(doc.id);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Генерируемые документы */}
      <section className="rounded-2xl bg-surface p-4 shadow-card-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Генерируемые документы
            </div>
            <div className="mt-0.5 font-display text-[16px] font-extrabold text-ink">
              Акт приёма-передачи
            </div>
            <div className="mt-0.5 text-[12px] text-muted">
              Формируется при выдаче клиенту. Содержит состояние, пробег,
              экипировку.
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleAct("open")}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-[12px] font-semibold text-ink-2 hover:bg-surface-soft"
            >
              <FileText size={13} /> Открыть
            </button>
            <button
              type="button"
              onClick={() => handleAct("print")}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-blue-700"
            >
              <Printer size={13} /> Сформировать и печатать
            </button>
          </div>
        </div>
      </section>

      {/* Загружаемые документы */}
      <section className="rounded-2xl bg-surface p-4 shadow-card-sm">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
          Хранимые документы
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <ServerDocSlot
            title="ПТС"
            subtitle="Паспорт транспортного средства"
            doc={byKind.get("pts")}
            onUpload={(f) => onPickFile("pts", f)}
            onDelete={onDelete}
            onPreview={setPreview}
            uploading={uploadMut.isPending}
          />
          <ServerDocSlot
            title="СТС"
            subtitle="Свидетельство о регистрации ТС"
            doc={byKind.get("sts")}
            onUpload={(f) => onPickFile("sts", f)}
            onDelete={onDelete}
            onPreview={setPreview}
            uploading={uploadMut.isPending}
          />

          <div className="flex flex-col gap-2">
            <ServerDocSlot
              title="ОСАГО"
              subtitle="Полис обязательного страхования"
              doc={osagoDoc}
              onUpload={(f) => onPickFile("osago", f)}
              onDelete={onDelete}
              onPreview={setPreview}
              uploading={uploadMut.isPending}
            />
            <div className="rounded-[12px] border border-border bg-surface-soft px-3 py-2.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                  Действует до
                </span>
                <input
                  type="date"
                  disabled={!osagoDoc}
                  value={osagoDoc?.osagoValidUntil ?? ""}
                  onChange={(e) => {
                    if (!osagoDoc) return;
                    patchMut.mutate({
                      id: osagoDoc.id,
                      osagoValidUntil: e.target.value || null,
                    });
                  }}
                  className="h-9 rounded-[8px] border border-border bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-blue-600 disabled:opacity-50"
                />
              </label>
              {osagoInfo && (
                <div
                  className={cn(
                    "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
                    osagoInfo.expired
                      ? "bg-red-soft text-red-ink"
                      : osagoInfo.soon
                        ? "bg-orange-soft text-orange-ink"
                        : "bg-green-soft text-green-ink",
                  )}
                >
                  {osagoInfo.expired ? (
                    <AlertTriangle size={11} />
                  ) : osagoInfo.soon ? (
                    <AlertTriangle size={11} />
                  ) : (
                    <CheckCircle2 size={11} />
                  )}
                  {osagoInfo.expired
                    ? `Просрочен на ${Math.abs(osagoInfo.daysLeft)} дн`
                    : osagoInfo.soon
                      ? `Истекает через ${osagoInfo.daysLeft} дн`
                      : `Действует — ${osagoInfo.dateRu}`}
                </div>
              )}
              {!osagoDoc && (
                <div className="mt-1.5 text-[11px] text-muted-2">
                  Сначала загрузите файл ОСАГО — затем появится поле даты.
                </div>
              )}
            </div>
          </div>

          {role === "director" && (
            <ServerDocSlot
              title="Договор покупки"
              subtitle="Документ от продавца / поставщика"
              doc={byKind.get("purchase")}
              onUpload={(f) => onPickFile("purchase", f)}
              onDelete={onDelete}
              onPreview={setPreview}
              uploading={uploadMut.isPending}
              directorOnly
            />
          )}
        </div>

        {role !== "director" && (
          <div className="mt-3 rounded-[12px] bg-surface-soft px-3 py-2 text-[11px] text-muted-2">
            Договор покупки скутера доступен только в роли «Директор».
          </div>
        )}

        {uploadMut.isError && (
          <div className="mt-3 rounded-[12px] bg-red-soft/60 px-3 py-2 text-[12px] text-red-ink">
            Не удалось загрузить файл: {String(uploadMut.error)}
          </div>
        )}
      </section>

      {preview && (
        <FilePreviewModal
          file={{
            name: preview.fileName,
            thumbUrl: fileUrl(preview.fileKey),
            size: preview.size,
          }}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

/**
 * Карточка документа, который хранится на сервере.
 * Пустое состояние — зона drag&drop для загрузки.
 * Заполненное — превью + «Открыть» / «Скачать» / «Заменить» / «Удалить».
 */
function ServerDocSlot({
  title,
  subtitle,
  doc,
  onUpload,
  onDelete,
  onPreview,
  uploading,
  directorOnly,
}: {
  title: string;
  subtitle: string;
  doc?: ApiScooterDoc;
  onUpload: (f: File) => void;
  onDelete: (doc: ApiScooterDoc) => void;
  onPreview: (doc: ApiScooterDoc) => void;
  uploading: boolean;
  directorOnly?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = () => inputRef.current?.click();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-ink">{title}</div>
          <div className="text-[11px] text-muted-2">{subtitle}</div>
        </div>
        {directorOnly && (
          <span className="shrink-0 rounded-full bg-purple-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-ink">
            только директору
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.currentTarget.value = "";
        }}
      />

      {doc ? (
        <div className="flex items-center gap-3 rounded-[12px] border border-border bg-surface px-3 py-2.5">
          <button
            type="button"
            onClick={() => onPreview(doc)}
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-blue-50 text-blue-700 transition-transform hover:scale-[1.04]"
            title="Открыть"
          >
            {isImageMime(doc.mimeType) ? (
              <img
                src={fileUrl(doc.fileKey)}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <FileText size={18} />
            )}
          </button>
          <button
            type="button"
            onClick={() => onPreview(doc)}
            className="min-w-0 flex-1 text-left"
          >
            <div className="truncate text-[12px] font-semibold text-ink hover:text-blue-600">
              {doc.fileName}
            </div>
            <div className="text-[11px] text-muted-2">
              {formatSize(doc.size)}
            </div>
          </button>
          <a
            href={fileUrl(doc.fileKey, { download: true, filename: doc.fileName })}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-2 hover:bg-surface-soft hover:text-ink"
            title="Скачать"
          >
            <Download size={14} />
          </a>
          <button
            type="button"
            onClick={pick}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-2 hover:bg-surface-soft hover:text-ink"
            title="Заменить"
          >
            <UploadCloud size={14} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(doc)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-2 hover:bg-red-soft hover:text-red-ink"
            title="Удалить"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onUpload(f);
          }}
          onClick={pick}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed px-3 py-6 text-center transition-colors",
            dragging
              ? "border-blue-600 bg-blue-50"
              : "border-border bg-surface-soft/50 hover:border-blue-600/50 hover:bg-blue-50/40",
          )}
        >
          {uploading ? (
            <>
              <Loader2 size={18} className="animate-spin text-blue-600" />
              <div className="text-[12px] font-semibold text-blue-700">
                Загрузка…
              </div>
            </>
          ) : (
            <>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                <UploadCloud size={16} />
              </div>
              <div className="text-[12px] font-semibold text-ink-2">
                Перетащите сюда или кликните
              </div>
              <div className="text-[10px] text-muted-2">
                JPG / PNG / PDF · до 15 МБ
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function isoToRu(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function actHtml(scooter: FleetScooter): string {
  const today = new Date(2026, 9, 13);
  const dateStr = `${String(today.getDate()).padStart(2, "0")} ${MONTH_RU[today.getMonth()]} ${today.getFullYear()}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Акт приёма-передачи ${scooter.name}</title>
<style>body{font-family:Inter,sans-serif;padding:40px;color:#111}
h1{font-size:22px;margin:0 0 6px}
h2{font-size:13px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:0.05em;color:#666}
.row{display:flex;gap:8px;padding:4px 0;border-bottom:1px dashed #e5e5e5}
.row b{min-width:180px;color:#666;font-weight:500}
.signs{margin-top:60px;display:flex;gap:40px}
.sign{flex:1}
.sign .line{border-bottom:1px solid #000;height:30px;margin-top:20px}
.sign .lbl{font-size:12px;color:#666}
</style></head><body>
<h1>Акт приёма-передачи скутера</h1>
<div>Составлен: ${dateStr}</div>

<h2>Объект</h2>
<div class="row"><b>Скутер</b>${scooter.name} · ${MODEL_LABEL[scooter.model]}</div>
<div class="row"><b>VIN</b>${scooter.vin ?? "—"}</div>
<div class="row"><b>Номер двигателя</b>${scooter.engineNo ?? "—"}</div>
<div class="row"><b>Пробег на момент выдачи</b>${fmt(scooter.mileage)} км</div>

<h2>Состояние при выдаче</h2>
<div class="row"><b>Внешний вид</b>______________________________________</div>
<div class="row"><b>Комплектность</b>______________________________________</div>
<div class="row"><b>Повреждения</b>______________________________________</div>

<h2>Экипировка</h2>
<div class="row"><b>Шлем</b>□ выдан □ не выдан</div>
<div class="row"><b>Держатель телефона</b>□ выдан □ не выдан</div>
<div class="row"><b>Комментарий</b>______________________________________</div>

<div class="signs">
  <div class="sign"><div class="line"></div><div class="lbl">Передал / подпись, дата</div></div>
  <div class="sign"><div class="line"></div><div class="lbl">Принял / подпись, дата</div></div>
</div>
</body></html>`;
}

// suppress unused warning
void FileImage;
