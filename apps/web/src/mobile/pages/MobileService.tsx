import { useMemo, useRef, useState } from "react";
import { BottomTabs } from "../BottomTabs";
import { useReloadRestoredState } from "@/lib/usePersistedState";
import { Camera, Check, CheckCircle2, ChevronRight, Loader2, Plus, Trash2, Wrench, X } from "lucide-react";
import {
  useAddRepairProgressItem,
  useCompleteRepairJob,
  useDeleteRepairPhoto,
  useDeleteRepairProgressItem,
  usePatchRepairProgress,
  useRepairJobs,
  useUploadRepairPhoto,
  type ApiRepairJob,
  type ApiRepairProgress,
  type ApiRepairProgressPhoto,
} from "@/lib/api/repair-jobs";
import { confirmDialog, toast } from "@/lib/toast";
import { fileUrl } from "@/lib/files";
import { PriceItemsPicker } from "@/pages/service/PriceItemsPicker";
import { cn } from "@/lib/utils";
import {
  DetailRow,
  MobileChips,
  MobileEmpty,
  MobileSearch,
  MobileSheet,
  type ChipOption,
} from "../ui";
import { ServiceOrders } from "@/pages/service/ServiceOrders";
import { useServiceOrders } from "@/lib/api/service-orders";
import { ScooterName, scooterModelName } from "@/components/ScooterName";

type Filter = "active" | "completed";
/** Как и на десктопе: главная вкладка — сторонние ремонты (06.09). */
type Scope = "outside" | "own";


function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function progressLabel(progress: ApiRepairProgress[]): string {
  const total = progress.length;
  if (total === 0) return "Чек-лист пуст";
  const done = progress.filter((p) => p.completedAt).length;
  return `${done}/${total} готово`;
}

export function MobileService() {
  const [scope, setScope] = useState<Scope>("outside");
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useReloadRestoredState<number | null>(
    "mobile:service:openId",
    null,
  );

  const ordersQ = useServiceOrders();
  const activeQ = useRepairJobs({ status: "active" });
  const completedQ = useRepairJobs({ status: "completed" });
  const active = activeQ.data ?? [];
  const completed = completedQ.data ?? [];

  const source = filter === "active" ? active : completed;
  const isLoading = activeQ.isLoading || completedQ.isLoading;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return source;
    return source.filter((j) => {
      const hay = `${j.scooter?.name ?? ""} ${j.scooter?.model ?? ""} ${j.rental?.clientName ?? ""}`;
      return hay.toLowerCase().includes(q);
    });
  }, [source, search]);

  const chips: ChipOption<Filter>[] = [
    { id: "active", label: "В работе", count: active.length },
    { id: "completed", label: "Завершённые" },
  ];

  const openJob = source.find((j) => j.id === openId) ?? null;

  const scopeChips: ChipOption<Scope>[] = [
    { id: "outside", label: "Сторонний ремонт", count: ordersQ.data?.length ?? 0 },
    { id: "own", label: "Наша техника", count: active.length },
  ];

  return (
    <div className="flex flex-col gap-3">
      <BottomTabs>
        <MobileChips options={scopeChips} value={scope} onChange={setScope} />
      </BottomTabs>

      {scope === "outside" && <ServiceOrders />}

      {scope === "own" && (
      <>
      <MobileSearch value={search} onChange={setSearch} placeholder="Скутер, модель, клиент…" />
      <MobileChips options={chips} value={filter} onChange={setFilter} />

      {isLoading ? (
        <div className="py-10 text-center text-[13px] text-muted-2">Загрузка…</div>
      ) : filtered.length === 0 ? (
        <MobileEmpty
          icon={<Wrench size={26} />}
          title="Ремонтов нет"
          hint={filter === "active" ? "Нет скутеров в работе" : "Завершённых ремонтов пока нет"}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((j) => (
            <JobRow key={j.id} job={j} onClick={() => setOpenId(j.id)} />
          ))}
        </div>
      )}

      <MobileSheet
        open={openJob != null}
        onClose={() => setOpenId(null)}
        title={openJob?.scooter ? scooterModelName(openJob.scooter.name) : "Ремонт"}
      >
        {openJob && <JobDetail job={openJob} />}
      </MobileSheet>
      </>
      )}
    </div>
  );
}

function JobRow({ job, onClick }: { job: ApiRepairJob; onClick: () => void }) {
  const done = job.status === "completed";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl bg-surface p-3 text-left shadow-card-sm active:scale-[0.99]"
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          done ? "bg-green-soft text-green-ink" : "bg-orange-soft text-orange-ink",
        )}
      >
        <Wrench size={18} />
      </div>
      <div className="min-w-0 flex-1">
        {/* Именование техники: модель + кружок номера (без «Dio #36»). */}
        <div className="truncate text-[14px] font-bold text-ink">
          {job.scooter ? (
            <ScooterName
              name={job.scooter.name}
              number={job.scooter.rentalSlot}
              electric={job.scooter.slotPool === "electric"}
              size="sm"
            />
          ) : (
            "Скутер"
          )}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-muted">
          {progressLabel(job.progress)} · с {formatDate(job.startedAt)}
        </div>
      </div>
      <ChevronRight size={16} className="text-muted-2" />
    </button>
  );
}

/**
 * Ремонт нашей техники с телефона (правки 7.0, паритет): раньше отметки,
 * фото и закрытие были только на компьютере — механик у стойки не мог
 * отметить работу. Теперь то же, что на компьютере, но под палец.
 */
function JobDetail({ job }: { job: ApiRepairJob }) {
  const done = job.status === "completed";
  const complete = useCompleteRepairJob();
  const addItem = useAddRepairProgressItem();
  const [priceOpen, setPriceOpen] = useState(false);

  const total = job.progress.length;
  const doneItems = job.progress.filter((p) => p.done).length;
  const allDone = total > 0 && doneItems === total;

  const addPicked = async (items: { title: string; priceSnapshot: number; qty: number }[]) => {
    try {
      for (const it of items) {
        await addItem.mutateAsync({ jobId: job.id, title: it.title, qty: it.qty, priceSnapshot: it.priceSnapshot });
      }
      toast.success("Добавлено", `${items.length} в чек-лист`);
    } catch (e) {
      toast.error("Не удалось добавить", (e as Error).message ?? "");
    }
  };

  const finish = async () => {
    const ok = await confirmDialog(
      total > 0 && !allDone
        ? {
            title: "Не все пункты отмечены",
            message: "Чек-лист не закрыт целиком. Всё равно вернуть скутер в парк аренды?",
            confirmText: "Всё равно вернуть",
          }
        : {
            title: "Скутер починен?",
            message: "Скутер вернётся в «Парк аренды» — его можно выдавать клиентам.",
            confirmText: "Готов к аренде",
          },
    );
    if (!ok) return;
    try {
      await complete.mutateAsync({ jobId: job.id, newScooterStatus: "rental_pool" });
      toast.success("Скутер в парке", `${job.scooter ? scooterModelName(job.scooter.name) : "Скутер"} готов к аренде`);
    } catch (e) {
      toast.error("Не удалось закрыть ремонт", (e as Error).message ?? "");
    }
  };

  return (
    <div data-mobile-job={job.id}>
      <div className="mb-2">
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-bold",
            done ? "bg-green-soft text-green-ink" : "bg-orange-soft text-orange-ink",
          )}
        >
          {done ? "Завершён" : "В работе"}
        </span>
      </div>

      <div className="rounded-2xl bg-surface px-3.5 shadow-card-sm">
        <DetailRow
          label="Скутер"
          value={
            job.scooter
              ? `${scooterModelName(job.scooter.name)}${job.scooter.rentalSlot != null ? ` №${job.scooter.rentalSlot}` : ""}`
              : "—"
          }
        />
        <div className="border-t border-border" />
        <DetailRow label="Начат" value={formatDate(job.startedAt)} />
        {job.completedAt && (
          <>
            <div className="border-t border-border" />
            <DetailRow label="Завершён" value={formatDate(job.completedAt)} />
          </>
        )}
        {job.rental?.clientName && (
          <>
            <div className="border-t border-border" />
            <DetailRow label="По аренде" value={job.rental.clientName} />
          </>
        )}
        {job.note && (
          <>
            <div className="border-t border-border" />
            <DetailRow label="Заметка" value={job.note} />
          </>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 px-1">
        <div className="text-[12px] font-semibold text-muted">
          Чек-лист · {total > 0 ? `отмечено ${doneItems} из ${total}` : "пуст"}
        </div>
        {!done && (
          <button
            type="button"
            onClick={() => setPriceOpen(true)}
            disabled={addItem.isPending}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-dashed border-blue-400 bg-white px-3.5 text-[13px] font-bold text-blue-700 disabled:opacity-50"
          >
            <Plus size={14} /> Пункт
          </button>
        )}
      </div>

      {total === 0 ? (
        <div className="mt-1 rounded-2xl bg-surface px-4 py-4 text-[12.5px] text-muted shadow-card-sm">
          Чек-листа нет — можно закрыть ремонт или добавить пункт, если нужна фиксация работ.
        </div>
      ) : (
        <div className="mt-1 flex flex-col gap-2">
          {job.progress.map((p) => (
            <MobileProgressRow key={p.id} progress={p} locked={done} />
          ))}
        </div>
      )}

      {!done && (
        <button
          type="button"
          onClick={finish}
          disabled={complete.isPending}
          className={cn(
            "mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white disabled:opacity-50",
            allDone || total === 0 ? "bg-green-600" : "bg-ink",
          )}
        >
          <CheckCircle2 size={18} /> Готов к аренде
        </button>
      )}

      {priceOpen && <PriceItemsPicker onClose={() => setPriceOpen(false)} onAdd={addPicked} />}
    </div>
  );
}

/** Пункт чек-листа под палец: отметка, заметка, фото. */
function MobileProgressRow({ progress, locked }: { progress: ApiRepairProgress; locked: boolean }) {
  const patch = usePatchRepairProgress();
  const upload = useUploadRepairPhoto();
  const deletePhoto = useDeleteRepairPhoto();
  const removeItem = useDeleteRepairProgressItem();
  const fileRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState(progress.notes ?? "");
  const [preview, setPreview] = useState<ApiRepairProgressPhoto | null>(null);

  const toggle = async () => {
    if (locked) return;
    try {
      await patch.mutateAsync({ progressId: progress.id, patch: { done: !progress.done } });
    } catch (e) {
      toast.error("Не удалось", (e as Error).message ?? "");
    }
  };
  const saveNotes = async () => {
    if (notes === (progress.notes ?? "")) return;
    try {
      await patch.mutateAsync({ progressId: progress.id, patch: { notes: notes.trim() || null } });
    } catch (e) {
      toast.error("Не удалось сохранить заметку", (e as Error).message ?? "");
    }
  };
  const addPhoto = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Только изображения", "Прикрепляйте JPG/PNG/HEIC файлы.");
      return;
    }
    try {
      await upload.mutateAsync({ progressId: progress.id, file });
      toast.success("Фото загружено", "");
    } catch (e) {
      toast.error("Не удалось загрузить", (e as Error).message ?? "");
    }
  };
  const dropPhoto = async (photoId: number) => {
    const ok = await confirmDialog({
      title: "Удалить фото?",
      message: "Файл удалится из хранилища безвозвратно.",
      confirmText: "Удалить",
      danger: true,
    });
    if (!ok) return;
    try {
      await deletePhoto.mutateAsync(photoId);
    } catch (e) {
      toast.error("Не удалось удалить фото", (e as Error).message ?? "");
    }
  };
  const dropItem = async () => {
    const ok = await confirmDialog({
      title: "Удалить пункт?",
      message: `«${progress.title}» — пункт уйдёт из чек-листа со всеми фото.`,
      confirmText: "Удалить",
      danger: true,
    });
    if (!ok) return;
    try {
      await removeItem.mutateAsync(progress.id);
    } catch (e) {
      toast.error("Не удалось удалить", (e as Error).message ?? "");
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border bg-surface p-3 shadow-card-sm",
        progress.done ? "border-green-500 bg-green-soft/30" : "border-border",
      )}
      data-progress={progress.id}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={patch.isPending || locked}
          aria-label={progress.done ? "Снять отметку" : "Отметить сделанным"}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            progress.done ? "bg-green-600 text-white" : "border border-border bg-white text-muted-2",
          )}
        >
          <Check size={18} strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1 pt-1.5">
          <div className={cn("text-[14px] font-semibold", progress.done ? "text-green-ink line-through" : "text-ink")}>
            {progress.title}
            {progress.qty > 1 && <span className="ml-1 text-[12px] text-muted-2">× {progress.qty}</span>}
          </div>
          {progress.priceSnapshot > 0 && (
            <div className="text-[11.5px] tabular-nums text-muted-2">
              {(progress.priceSnapshot * progress.qty).toLocaleString("ru-RU")} ₽ по акту
            </div>
          )}
        </div>
        {!locked && (
          <button
            type="button"
            onClick={dropItem}
            disabled={removeItem.isPending}
            aria-label="Убрать пункт"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-2 active:bg-red-soft active:text-red-600 disabled:opacity-30"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {!locked && (
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Что сделано: «заменён рычаг»…"
          className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-3 text-[14px] outline-none focus:border-blue-600"
        />
      )}
      {locked && progress.notes && <div className="mt-2 text-[13px] text-ink-2">{progress.notes}</div>}

      <div className="mt-2 flex flex-wrap items-start gap-2">
        {progress.photos.map((ph) => {
          const url = fileUrl(ph.fileKey, { variant: "thumb" });
          if (!url) return null;
          return (
            <span key={ph.id} className="relative block h-16 w-16 overflow-hidden rounded-xl border border-border bg-surface-soft">
              <button type="button" onClick={() => setPreview(ph)} className="block h-full w-full">
                <img src={url} alt={ph.fileName} className="h-full w-full object-cover" />
              </button>
              {!locked && (
                <button
                  type="button"
                  onClick={() => dropPhoto(ph.id)}
                  aria-label="Удалить фото"
                  className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          );
        })}
        {!locked && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            aria-label="Добавить фото"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border bg-white text-muted-2 disabled:opacity-50"
          >
            {upload.isPending ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) addPhoto(f);
            e.target.value = "";
          }}
        />
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-ink/90 p-4"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
        >
          <img src={fileUrl(preview.fileKey, { variant: "view" }) ?? ""} alt={preview.fileName} className="max-h-full max-w-full rounded-xl object-contain" />
          <button
            type="button"
            onClick={() => setPreview(null)}
            aria-label="Закрыть"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
