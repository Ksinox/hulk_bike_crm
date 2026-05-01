import { useMemo, useRef, useState } from "react";
import {
  FileText,
  FileImage,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Pencil,
  UploadCloud,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Client, ClientDetails } from "@/lib/mock/clients";
import type { UploadedFile } from "./DocUpload";
import { FilePreviewModal } from "./FilePreviewModal";
import { clientStore, useClientExtraDocs } from "./clientStore";
import { SequentialNamingModal } from "./SequentialNamingModal";
import {
  useApiClientDocs,
  useUploadClientDoc,
  useDeleteClientDoc,
  type ApiClientDoc,
} from "@/lib/api/documents";
import { toast } from "@/lib/toast";
import {
  PAYMENT_LABEL,
  STATUS_LABEL as RENTAL_STATUS_LABEL,
  type Rental,
} from "@/lib/mock/rentals";
import { useRentalsByClient } from "@/pages/rentals/rentalsStore";
import { navigate } from "@/app/navigationStore";

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

/* =================== Аренды =================== */

const TODAY_DEMO = new Date();

function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function daysWord(n: number): string {
  const abs = Math.abs(n);
  const n10 = abs % 10;
  const n100 = abs % 100;
  if (n10 === 1 && n100 !== 11) return "день";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "дня";
  return "дней";
}

const RENTAL_STATUS_TONE: Record<string, string> = {
  active: "bg-green-soft text-green-ink",
  overdue: "bg-red-soft text-red-ink",
  returning: "bg-orange-soft text-orange-ink",
  completed: "bg-surface-soft text-muted",
  completed_damage: "bg-red-soft text-red-ink",
  new_request: "bg-blue-50 text-blue-700",
  meeting: "bg-blue-50 text-blue-700",
  police: "bg-red-soft text-red-ink",
  court: "bg-purple-soft text-purple-ink",
  cancelled: "bg-surface-soft text-muted",
};

function periodText(r: Rental): { main: string; hint: string | null } {
  const main = `с ${r.start} до ${r.endPlanned}`;
  const end = parseDate(r.endPlanned);
  if (!end) return { main, hint: null };
  if (r.status === "active") {
    const left = daysBetween(TODAY_DEMO, end);
    if (left > 0)
      return { main, hint: `осталось ${left} ${daysWord(left)}` };
    if (left === 0) return { main, hint: "возврат сегодня" };
    return { main, hint: `просрочка ${Math.abs(left)} ${daysWord(left)}` };
  }
  if (r.status === "overdue" && end) {
    const over = daysBetween(end, TODAY_DEMO);
    return { main, hint: `просрочка ${over} ${daysWord(over)}` };
  }
  if (r.endActual) {
    return { main: `с ${r.start} до ${r.endActual}`, hint: "фактически" };
  }
  return { main, hint: null };
}

export function RentalsTab({ client }: { client: Client }) {
  const rentals = useRentalsByClient(client.id);
  if (rentals.length === 0)
    return <Empty text="У клиента ещё не было аренд" />;

  // сначала активные/просроченные/возврат, затем историю по убыванию id
  const STATUS_WEIGHT: Record<string, number> = {
    active: 0,
    overdue: 0,
    returning: 1,
    meeting: 2,
    new_request: 2,
    completed_damage: 3,
    police: 3,
    court: 3,
    completed: 9,
    cancelled: 10,
  };
  const sorted = [...rentals].sort((a, b) => {
    const w = (STATUS_WEIGHT[a.status] ?? 5) - (STATUS_WEIGHT[b.status] ?? 5);
    if (w !== 0) return w;
    return b.id - a.id;
  });

  return (
    <div className="overflow-hidden rounded-[14px] border border-border">
      <table className="w-full text-[13px]">
        <thead className="bg-surface-soft text-left text-[11px] font-semibold uppercase tracking-wider text-muted-2">
          <tr>
            <th className="px-3 py-2">Скутер</th>
            <th className="px-3 py-2">Период</th>
            <th className="px-3 py-2">Статус</th>
            <th className="px-3 py-2 text-right">Сумма</th>
            <th className="px-3 py-2 text-right">Залог</th>
            <th className="px-3 py-2">Оплата</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const p = periodText(r);
            return (
              <tr
                key={r.id}
                onClick={() =>
                  navigate({ route: "rentals", rentalId: r.id })
                }
                className="cursor-pointer border-t border-border/60 hover:bg-surface-soft/60"
                title="Открыть аренду"
              >
                <td className="px-3 py-2 font-semibold text-ink">
                  {r.scooter}
                </td>
                <td className="px-3 py-2 text-muted">
                  <div>{p.main}</div>
                  {p.hint && (
                    <div className="mt-0.5 text-[11px] text-muted-2">
                      ({p.hint})
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      RENTAL_STATUS_TONE[r.status] ??
                        "bg-surface-soft text-muted",
                    )}
                  >
                    {RENTAL_STATUS_LABEL[r.status]}
                  </span>
                  {r.note && (
                    <div className="mt-0.5 text-[11px] text-muted-2">
                      {r.note}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">
                  {r.sum > 0 ? `${fmt(r.sum)} ₽` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">
                  {r.deposit > 0 ? `${fmt(r.deposit)} ₽` : "—"}
                </td>
                <td className="px-3 py-2 text-muted">
                  {PAYMENT_LABEL[r.paymentMethod]}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* =================== Рассрочки =================== */

export function InstalmentsTab({ d }: { d: ClientDetails }) {
  if (d.instalments.length === 0)
    return <Empty text="Нет активных рассрочек" />;
  return (
    <div className="flex flex-col gap-2">
      {d.instalments.map((x, i) => {
        const progress = Math.round((x.paid / x.total) * 100);
        return (
          <div
            key={i}
            className="rounded-[14px] border border-border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-ink">{x.scooter}</div>
              <span className="text-[11px] text-muted-2">
                с {x.start}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
              <Metric label="Всего" value={`${fmt(x.total)} ₽`} />
              <Metric label="Оплачено" value={`${fmt(x.paid)} ₽`} tone="green" />
              <Metric label="Остаток" value={`${fmt(x.left)} ₽`} tone="orange" />
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-soft">
              <div
                className="h-full bg-blue-600"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className="text-muted-2">Оплачено {progress}%</span>
              <span className="font-semibold text-orange-ink">
                Следующий платёж: {x.next}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =================== Инциденты =================== */

export function IncidentsTab({ d }: { d: ClientDetails }) {
  if (d.incidents.length === 0)
    return <Empty text="Инцидентов не зафиксировано" />;
  return (
    <div className="flex flex-col gap-2">
      {d.incidents.map((inc, i) => (
        <div
          key={i}
          className="rounded-[14px] border border-border p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">{inc.type}</span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    inc.status === "overdue"
                      ? "bg-red-soft text-red-ink"
                      : "bg-surface-soft text-muted",
                  )}
                >
                  {inc.status === "overdue" ? "не урегулирован" : "закрыт"}
                </span>
              </div>
              {inc.note && (
                <div className="mt-1 text-[12px] text-muted">{inc.note}</div>
              )}
            </div>
            <div className="shrink-0 text-right text-[11px] text-muted-2">
              {inc.date}
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
            <Metric label="Ущерб" value={`${fmt(inc.damage)} ₽`} />
            <Metric label="Оплачено" value={`${fmt(inc.paid)} ₽`} tone="green" />
            <Metric
              label="Остаток"
              value={`${fmt(inc.left)} ₽`}
              tone={inc.left > 0 ? "red" : "gray"}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* =================== Документы =================== */

type DocSlot = {
  key: string;
  label: string;
  /** UploadedFile из API (с fileKey для preview/download) или null
   *  если файл ещё не загружен. */
  file: UploadedFile | null;
  required: boolean;
  comment?: string;
  /** Тип API-документа для загрузки — passport / license / etc. */
  kind?: "passport" | "license" | "extra";
};


/** Превращаем ApiClientDoc → UploadedFile для FilePreviewModal/слотов. */
function apiDocToUploaded(doc: ApiClientDoc): UploadedFile {
  return {
    name: doc.fileName,
    size: doc.size,
    title: doc.title ?? undefined,
    comment: doc.comment ?? undefined,
    fileKey: doc.fileKey,
    mimeType: doc.mimeType,
    docId: doc.id,
    existing: true,
  };
}

export function DocsTab({ client, d }: { client: Client; d: ClientDetails }) {
  // API-документы клиента (паспорт, права, прочие) — подгружаем из БД.
  // Группируем по kind для отображения в трёх «обязательных» слотах +
  // секции «Прочие документы».
  const docsQ = useApiClientDocs(client.id);
  const apiDocs = docsQ.data ?? [];
  const passportDocs = apiDocs.filter((d) => d.kind === "passport");
  const licenseDocs = apiDocs.filter((d) => d.kind === "license");
  const extraApiDocs = apiDocs.filter((d) => d.kind === "extra");

  const uploadDoc = useUploadClientDoc(client.id);
  const deleteDoc = useDeleteClientDoc(client.id);

  // Legacy: локальные доп. документы (через clientStore). Оставляем
  // для совместимости — но новые документы идут через API.
  const localExtraDocs = useClientExtraDocs(client.id);

  const slots: DocSlot[] = [
    {
      key: "passport_main",
      label: "Паспорт (основной разворот)",
      // Берём первый из API. Legacy mock фоллбэк удалён — он создавал
      // фантомные «загруженные на сервере» файлы, по клику на которые
      // модалка писала «нет ключа в хранилище», что путало пользователя.
      file: passportDocs[0] ? apiDocToUploaded(passportDocs[0]) : null,
      required: true,
      kind: "passport",
    },
    {
      key: "passport_reg",
      label: "Паспорт (прописка)",
      file: passportDocs[1] ? apiDocToUploaded(passportDocs[1]) : null,
      required: true,
      kind: "passport",
    },
    {
      key: "license",
      label: "Водительское",
      file: licenseDocs[0] ? apiDocToUploaded(licenseDocs[0]) : null,
      required: false,
      kind: "license",
    },
  ];

  const onSlotUpload = async (
    kind: "passport" | "license",
    file: File,
    title: string,
  ) => {
    try {
      await uploadDoc.mutateAsync({ kind, file, title });
      toast.success("Документ загружен", title);
    } catch (e) {
      toast.error("Не удалось загрузить", (e as Error).message ?? "");
    }
  };

  const onSlotDelete = async (docId: number) => {
    try {
      await deleteDoc.mutateAsync(docId);
      toast.success("Документ удалён", "");
    } catch (e) {
      toast.error("Не удалось удалить", (e as Error).message ?? "");
    }
  };

  const [preview, setPreview] = useState<UploadedFile | null>(null);
  const [pending, setPending] = useState<UploadedFile[] | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const addUploaded = (list: FileList) => {
    const next: UploadedFile[] = [];
    for (const f of Array.from(list)) {
      const uf: UploadedFile = { name: f.name, size: f.size, file: f };
      if (f.type.startsWith("image/") || f.type === "application/pdf") {
        uf.thumbUrl = URL.createObjectURL(f);
      }
      next.push(uf);
    }
    if (next.length > 0) setPending(next);
  };

  const onUploadExtra = async (named: UploadedFile[]) => {
    setPending(null);
    let okCount = 0;
    let failCount = 0;
    for (const uf of named) {
      if (!uf.file) continue;
      try {
        await uploadDoc.mutateAsync({
          kind: "extra",
          file: uf.file,
          title: uf.title,
          comment: uf.comment,
        });
        okCount++;
      } catch {
        failCount++;
      }
    }
    if (okCount > 0) {
      toast.success(
        "Документы загружены",
        `${okCount} ${okCount === 1 ? "файл" : "файлов"} сохранено на сервере.`,
      );
    }
    if (failCount > 0) {
      toast.error(
        "Не удалось загрузить",
        `${failCount} ${failCount === 1 ? "файл" : "файлов"}.`,
      );
    }
  };

  const onDeleteApiDoc = async (docId: number) => {
    try {
      await deleteDoc.mutateAsync(docId);
      toast.success("Документ удалён", "");
    } catch (e) {
      toast.error("Не удалось удалить", (e as Error).message ?? "");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {d.origVerified && (
        <div className="flex items-center gap-2 rounded-[14px] bg-green-soft/60 px-3 py-2 text-[12px] text-green-ink">
          <CheckCircle2 size={14} />
          <span>
            Оригиналы сверены {d.origVerified.date} ·{" "}
            {d.origVerified.by}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((slot) => (
          <DocMiniCard
            key={slot.key}
            slot={slot}
            onOpen={(uf) => setPreview(uf)}
            onUpload={
              slot.kind && slot.kind !== "extra"
                ? (file) =>
                    onSlotUpload(
                      slot.kind as "passport" | "license",
                      file,
                      slot.label,
                    )
                : undefined
            }
            onDelete={
              slot.file?.docId
                ? () => onSlotDelete(slot.file!.docId!)
                : undefined
            }
          />
        ))}
        {/* API-документы типа extra: новые, с fileKey, поддерживают
            preview/download/delete через сервер. */}
        {extraApiDocs.map((doc) => {
          const uf = apiDocToUploaded(doc);
          return (
            <ExtraDocMiniCard
              key={`api-${doc.id}`}
              file={uf}
              onOpen={() => setPreview(uf)}
              onTitleChange={(_v: string) => {
                /* TODO: PATCH title через API если потребуется */
              }}
              onCommentChange={(_v: string) => {
                /* TODO: PATCH comment через API если потребуется */
              }}
              onRemove={() => onDeleteApiDoc(doc.id)}
            />
          );
        })}
        {/* Legacy локальные доп. документы — оставляем для совместимости
            пока в БД не мигрированы. */}
        {localExtraDocs.map((f, i) => (
          <ExtraDocMiniCard
            key={`extra-${i}`}
            file={f}
            onOpen={() => setPreview(f)}
            onTitleChange={(v) =>
              clientStore.setExtraDocs(
                client.id,
                localExtraDocs.map((x, j) => (j === i ? { ...x, title: v } : x)),
              )
            }
            onCommentChange={(v) =>
              clientStore.setExtraDocs(
                client.id,
                localExtraDocs.map((x, j) =>
                  j === i ? { ...x, comment: v } : x,
                ),
              )
            }
            onRemove={() =>
              clientStore.setExtraDocs(
                client.id,
                localExtraDocs.filter((_, j) => j !== i),
              )
            }
          />
        ))}
        <AddDocCard
          onPick={() => addInputRef.current?.click()}
          inputRef={addInputRef}
          onFiles={addUploaded}
        />
      </div>

      <PassportBlock d={d} />

      {preview && (
        <FilePreviewModal file={preview} onClose={() => setPreview(null)} />
      )}

      {pending && pending.length > 0 && (
        <SequentialNamingModal
          files={pending}
          onComplete={onUploadExtra}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

function DocMiniCard({
  slot,
  onOpen,
  onUpload,
  onDelete,
}: {
  slot: DocSlot;
  onOpen: (uf: UploadedFile) => void;
  /** Если задан — при выборе файла отправляем его на сервер через
   *  useUploadClientDoc. Если нет — слот не интерактивный (только
   *  показ существующего файла). */
  onUpload?: (file: File) => void | Promise<void>;
  /** Удаление с сервера через useDeleteClientDoc. */
  onDelete?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploaded = slot.file;

  const handleFiles = async (list: FileList) => {
    const f = list[0];
    if (!f) return;
    if (onUpload) {
      await onUpload(f);
    }
  };

  if (!uploaded) {
    return (
      <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-border py-5 text-center transition-colors hover:border-blue-600 hover:bg-blue-50/40">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-muted-2">
          <UploadCloud size={16} />
        </div>
        <div className="px-3 text-[11px] font-semibold text-muted">
          {slot.label}
        </div>
        <div className="text-[10px] text-muted-2">
          {slot.required ? "обязательно · нажмите чтобы загрузить" : "опционально"}
        </div>
      </label>
    );
  }

  return (
    <MiniCardBody
      file={uploaded}
      onOpen={() => onOpen(uploaded)}
      onRemove={onDelete}
      editable={!!onDelete}
    />
  );
}

function ExtraDocMiniCard({
  file,
  onOpen,
  onTitleChange,
  onCommentChange,
  onRemove,
}: {
  file: UploadedFile;
  onOpen: () => void;
  onTitleChange: (v: string) => void;
  onCommentChange: (v: string) => void;
  onRemove: () => void;
}) {
  return (
    <MiniCardBody
      file={file}
      onOpen={onOpen}
      onTitleChange={onTitleChange}
      onCommentChange={onCommentChange}
      onRemove={onRemove}
      editable
    />
  );
}

function MiniCardBody({
  file,
  onOpen,
  onTitleChange,
  onCommentChange,
  onRemove,
  editable,
}: {
  file: UploadedFile;
  onOpen: () => void;
  onTitleChange?: (v: string) => void;
  onCommentChange?: (v: string) => void;
  onRemove?: () => void;
  editable?: boolean;
}) {
  const isImg = useMemo(
    () => !!file.thumbUrl && /\.(jpe?g|png|webp|gif)$/i.test(file.name),
    [file],
  );
  const Icon = isImg ? FileImage : FileText;
  return (
    <div className="flex flex-col overflow-hidden rounded-[14px] border border-border bg-surface transition-shadow hover:shadow-card">
      <button
        type="button"
        onClick={onOpen}
        className="relative flex h-24 items-center justify-center overflow-hidden bg-blue-50 text-blue-700"
        title="Открыть"
      >
        {file.thumbUrl && isImg ? (
          <img
            src={file.thumbUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <Icon size={28} />
        )}
        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-ink shadow-card-sm">
          открыть →
        </span>
      </button>
      <div className="flex-1 space-y-1 p-2.5">
        {editable ? (
          <input
            type="text"
            value={file.title ?? ""}
            placeholder="Название документа"
            onChange={(e) => onTitleChange?.(e.target.value)}
            className="h-7 w-full rounded-[6px] border border-transparent bg-transparent px-1 text-[12px] font-semibold text-ink outline-none placeholder:text-muted-2 focus:border-border focus:bg-surface-soft"
          />
        ) : (
          <div className="truncate px-1 text-[12px] font-semibold text-ink">
            {file.title || file.name}
          </div>
        )}

        {editable ? (
          <textarea
            value={file.comment ?? ""}
            placeholder="Комментарий — для чего документ"
            onChange={(e) => onCommentChange?.(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-[6px] border border-transparent bg-transparent px-1 text-[11px] text-muted outline-none placeholder:text-muted-2 focus:border-border focus:bg-surface-soft"
          />
        ) : file.comment ? (
          <div className="px-1 text-[11px] text-muted">{file.comment}</div>
        ) : null}

        <div className="flex items-center justify-between px-1 text-[10px] text-muted-2">
          <span className="truncate">{file.name}</span>
          {file.existing && (
            <span className="ml-2 shrink-0 rounded-full bg-green-soft px-1.5 text-[9px] font-semibold text-green-ink">
              сервер
            </span>
          )}
        </div>

        {onRemove && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onRemove}
              className="text-[10px] font-semibold text-muted-2 hover:text-red-ink"
            >
              удалить
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AddDocCard({
  onPick,
  inputRef,
  onFiles,
}: {
  onPick: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  onFiles: (list: FileList) => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-border bg-surface text-center transition-colors hover:border-blue-600 hover:bg-blue-50/40"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-700">
        <Plus size={18} />
      </div>
      <div className="text-[12px] font-semibold text-ink">
        Добавить документ
      </div>
      <div className="max-w-[180px] px-3 text-[11px] text-muted-2">
        Сканы, чеки, акты — с названием и комментарием
      </div>
    </button>
  );
}

function PassportBlock({ d }: { d: ClientDetails }) {
  const fields: { label: string; value: string }[] = [
    { label: "Дата рождения", value: d.birth },
    { label: "Серия и номер", value: `${d.passport.ser} ${d.passport.num}` },
    { label: "Кем выдан", value: d.passport.issuer },
    { label: "Дата выдачи", value: d.passport.date },
    { label: "Код подразделения", value: d.passport.code },
    { label: "Регистрация", value: d.regAddr },
    { label: "Фактический адрес", value: d.liveAddr },
  ];
  return (
    <div className="rounded-[14px] border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-2">
          Паспортные данные
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
        >
          <Pencil size={11} /> изменить
        </button>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.label} className="flex gap-2">
            <span className="w-[140px] shrink-0 text-muted-2">{f.label}</span>
            <span className="min-w-0 flex-1 text-ink">{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =================== Рейтинг =================== */

export function RatingTab({ d }: { d: ClientDetails }) {
  if (d.ratingHistory.length === 0)
    return <Empty text="История рейтинга пуста" />;
  return (
    <div className="flex flex-col">
      {d.ratingHistory.map((e, i) => {
        const isPlus = e.delta > 0;
        const isMinus = e.delta < 0;
        const iconCls = isPlus
          ? "bg-green-soft text-green-ink"
          : isMinus
            ? "bg-red-soft text-red-ink"
            : "bg-surface-soft text-muted";
        const Icon = isPlus ? ArrowUp : isMinus ? ArrowDown : Pencil;
        return (
          <div
            key={i}
            className="flex items-start gap-3 border-b border-border/60 py-2 last:border-b-0"
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                iconCls,
              )}
            >
              <Icon size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-ink">
                  {e.event}
                </span>
                {e.type === "manual" && (
                  <span className="rounded-full bg-purple-soft px-1.5 py-0.5 text-[10px] font-semibold text-purple-ink">
                    ручная корр.
                  </span>
                )}
              </div>
              {e.note && (
                <div className="text-[11px] text-muted">{e.note}</div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div
                className={cn(
                  "text-[13px] font-bold tabular-nums",
                  isPlus
                    ? "text-green-ink"
                    : isMinus
                      ? "text-red-ink"
                      : "text-muted",
                )}
              >
                {e.delta > 0 ? "+" : ""}
                {e.delta}
              </div>
              <div className="text-[10px] text-muted-2 tabular-nums">
                → {e.score} · {e.date}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =================== Helpers =================== */

function Empty({ text }: { text: string }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center rounded-[14px] border border-dashed border-border text-[13px] text-muted">
      {text}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "red" | "orange" | "gray";
}) {
  const toneCls =
    tone === "green"
      ? "text-green-ink"
      : tone === "red"
        ? "text-red-ink"
        : tone === "orange"
          ? "text-orange-ink"
          : tone === "gray"
            ? "text-muted-2"
            : "text-ink";
  return (
    <div>
      <div className="text-[11px] text-muted-2">{label}</div>
      <div className={cn("font-semibold tabular-nums", toneCls)}>{value}</div>
    </div>
  );
}
