import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bike,
  Camera,
  Check,
  CheckCircle2,
  ExternalLink,
  History as HistoryIcon,
  Image as ImageIcon,
  Loader2,
  Plus,
  Search,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { fileUrl } from "@/lib/files";
import { MODEL_LABEL } from "@/lib/mock/rentals";
import { navigate } from "@/app/navigationStore";
import { confirmDialog, toast } from "@/lib/toast";
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
import type { ApiScooter } from "@/lib/api/types";

type Tab = "active" | "completed";

/**
 * Раздел «Ремонты» — журнал ремонтов скутеров с чек-листом и фото.
 *
 * Источник данных: таблицы repair_jobs / repair_progress /
 * repair_progress_photos. Создаются автоматически при акте о повреждениях
 * с галкой «отправить в ремонт» или при ручном переводе скутера в repair.
 */
export function Service() {
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");

  const activeQ = useRepairJobs({ status: "active" });
  const completedQ = useRepairJobs({ status: "completed" });

  const activeJobs = activeQ.data ?? [];
  const completedJobs = completedQ.data ?? [];

  const filtered = useMemo(() => {
    const list = tab === "active" ? activeJobs : completedJobs;
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((j) => {
      const hay = `${j.scooter?.name ?? ""} ${j.scooter?.model ?? ""} ${j.rental?.clientName ?? ""}`;
      return hay.toLowerCase().includes(q);
    });
  }, [tab, activeJobs, completedJobs, search]);

  const isLoading = activeQ.isLoading || completedQ.isLoading;

  return (
    <div className="flex w-full flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold text-ink">
            Ремонты
          </h1>
          <div className="text-[12px] text-muted-2">
            Скутеры в обслуживании с чек-листом по акту повреждений и
            историей закрытых ремонтов.
          </div>
        </div>
        <div className="relative w-[280px]">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по скутеру или клиенту…"
            className="h-9 w-full rounded-[10px] border border-border bg-surface pl-9 pr-3 text-[13px] outline-none focus:border-blue-600"
          />
        </div>
      </header>

      <div className="flex gap-1 border-b border-border">
        <TabButton
          active={tab === "active"}
          onClick={() => setTab("active")}
          icon={Wrench}
          label="В работе"
          count={activeJobs.length}
        />
        <TabButton
          active={tab === "completed"}
          onClick={() => setTab("completed")}
          icon={HistoryIcon}
          label="Журнал"
          count={completedJobs.length}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-2xl bg-surface px-6 py-12 text-muted-2 shadow-card-sm">
          <Loader2 size={16} className="animate-spin" /> Загружаем ремонты…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState tab={tab} search={search} />
      ) : tab === "active" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((job) => (
            <ActiveRepairCard key={job.id} job={job} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((job) => (
            <JournalRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative -mb-px inline-flex items-center gap-2 px-3 py-2 text-[13px] font-semibold transition-colors",
        active
          ? "border-b-2 border-blue-600 text-blue-600"
          : "border-b-2 border-transparent text-muted hover:text-ink",
      )}
    >
      <Icon size={14} /> {label}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
          active
            ? "bg-blue-100 text-blue-700"
            : "bg-surface-soft text-muted-2",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function EmptyState({ tab, search }: { tab: Tab; search: string }) {
  if (search) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
        <Search size={32} className="text-muted-2" />
        <div className="text-[13px] text-muted">
          Ничего не нашли по запросу «{search}».
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
      <CheckCircle2 size={36} className="text-green-600" />
      <div className="text-[14px] font-bold text-ink">
        {tab === "active" ? "Активных ремонтов нет" : "Журнал пуст"}
      </div>
      <div className="max-w-[420px] text-[12px] text-muted-2">
        {tab === "active"
          ? "Когда оператор отправит скутер в ремонт (через акт о повреждениях с галкой «отправить в ремонт» или сменой статуса), он появится здесь с чек-листом из акта."
          : "Закрытые ремонты с фото и заметками будут видны здесь после первого «Готов к аренде»."}
      </div>
    </div>
  );
}

function ActiveRepairCard({ job }: { job: ApiRepairJob }) {
  const { data: scooters = [] } = useApiScooters();
  const scooter = scooters.find((s) => s.id === job.scooterId) ?? null;
  const complete = useCompleteRepairJob();
  const addItem = useAddRepairProgressItem();

  const totalItems = job.progress.length;
  const doneItems = job.progress.filter((p) => p.done).length;
  const allDone = totalItems > 0 && doneItems === totalItems;

  const onAddItem = async () => {
    const title = window.prompt("Что добавить в чек-лист?");
    if (!title || !title.trim()) return;
    try {
      await addItem.mutateAsync({
        jobId: job.id,
        title: title.trim(),
      });
    } catch (e) {
      toast.error("Не удалось добавить", (e as Error).message ?? "");
    }
  };

  const finishRepair = async () => {
    if (totalItems > 0 && !allDone) {
      const ok = await confirmDialog({
        title: "Не все пункты отмечены",
        message:
          "Чек-лист не закрыт целиком. Всё равно вернуть скутер в парк аренды?",
        confirmText: "Всё равно вернуть",
        cancelText: "Отмена",
      });
      if (!ok) return;
    } else {
      const ok = await confirmDialog({
        title: "Скутер починен?",
        message:
          "Скутер вернётся в «Парк аренды» и его можно будет выдавать новым клиентам.",
        confirmText: "Готов к аренде",
        cancelText: "Отмена",
      });
      if (!ok) return;
    }
    try {
      await complete.mutateAsync({
        jobId: job.id,
        newScooterStatus: "rental_pool",
      });
      toast.success(
        "Скутер в парке",
        `${scooter?.name ?? job.scooter?.name ?? "Скутер"} готов к аренде`,
      );
    } catch (e) {
      toast.error("Не удалось закрыть ремонт", (e as Error).message ?? "");
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card-sm">
      <div className="flex items-start gap-3">
        <ScooterAvatar scooter={scooter} fallbackModel={job.scooter?.model} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                navigate({ route: "fleet", scooterId: job.scooterId })
              }
              className="text-left"
            >
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-2">
                <Wrench size={11} className="text-orange-600" /> На ремонте
              </div>
              <div className="mt-0.5 font-display text-[18px] font-extrabold leading-tight text-ink">
                {job.scooter?.name ?? `#${job.scooterId}`}
              </div>
              <div className="text-[12px] text-muted-2">
                {modelLabelFor(scooter, job.scooter?.model)}
              </div>
            </button>
            <button
              type="button"
              onClick={() =>
                navigate({ route: "fleet", scooterId: job.scooterId })
              }
              title="Открыть карточку скутера"
              className="rounded-[6px] p-1 text-muted-2 hover:bg-surface-soft hover:text-ink"
            >
              <ExternalLink size={14} />
            </button>
          </div>

          {job.rental && (
            <button
              type="button"
              onClick={() =>
                navigate({ route: "rentals", rentalId: job.rental!.id })
              }
              className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
            >
              <Bike size={11} />
              Из аренды #{String(job.rental.id).padStart(4, "0")}
              {job.rental.clientName && (
                <>
                  <span className="text-blue-700/60">·</span>
                  {job.rental.clientName}
                </>
              )}
              <ArrowRight size={10} />
            </button>
          )}

          <div className="mt-1 text-[11px] text-muted-2">
            Открыт {fmtRuDateTime(job.startedAt)}
          </div>
        </div>
      </div>

      {/* === Чек-лист === */}
      <div className="mt-3 rounded-xl border border-border bg-surface-soft/40 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-2">
            <Wrench size={11} /> Чек-лист
            {job.damageReportId && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                по акту #{job.damageReportId}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onAddItem}
            disabled={addItem.isPending}
            className="inline-flex items-center gap-1 rounded-[8px] border border-dashed border-blue-400 bg-white px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            title="Добавить свой пункт"
          >
            <Plus size={11} /> Пункт
          </button>
        </div>

        {totalItems === 0 ? (
          <div className="text-[12px] text-muted-2">
            Чек-листа нет — оператор сам решает когда готов. Можете добавить
            пункт вручную, если нужна фиксация работ.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {job.progress.map((p) => (
              <RepairProgressRow key={p.id} progress={p} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="text-[11px] text-muted-2">
          {totalItems > 0
            ? `Отмечено: ${doneItems} из ${totalItems}`
            : "Чек-листа нет"}
        </div>
        <button
          type="button"
          onClick={finishRepair}
          disabled={complete.isPending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-[13px] font-bold transition-colors",
            allDone || totalItems === 0
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-ink text-white hover:bg-blue-600",
            complete.isPending && "opacity-50",
          )}
        >
          {complete.isPending && <Loader2 size={14} className="animate-spin" />}
          <CheckCircle2 size={14} /> Готов к аренде
        </button>
      </div>
    </div>
  );
}

function RepairProgressRow({ progress }: { progress: ApiRepairProgress }) {
  const patch = usePatchRepairProgress();
  const upload = useUploadRepairPhoto();
  const deletePhoto = useDeleteRepairPhoto();
  const removeItem = useDeleteRepairProgressItem();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localNotes, setLocalNotes] = useState(progress.notes ?? "");
  const [previewPhoto, setPreviewPhoto] =
    useState<ApiRepairProgressPhoto | null>(null);

  const toggleDone = async () => {
    try {
      await patch.mutateAsync({
        progressId: progress.id,
        patch: { done: !progress.done },
      });
    } catch (e) {
      toast.error("Не удалось", (e as Error).message ?? "");
    }
  };

  const saveNotes = async () => {
    if (localNotes === (progress.notes ?? "")) return;
    try {
      await patch.mutateAsync({
        progressId: progress.id,
        patch: { notes: localNotes.trim() || null },
      });
    } catch (e) {
      toast.error("Не удалось сохранить заметку", (e as Error).message ?? "");
    }
  };

  const onUploadPhoto = async (file: File) => {
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

  const onDeletePhoto = async (photoId: number) => {
    const ok = await confirmDialog({
      title: "Удалить фото?",
      message: "Файл удалится из хранилища безвозвратно.",
      confirmText: "Удалить",
      cancelText: "Отмена",
      danger: true,
    });
    if (!ok) return;
    try {
      await deletePhoto.mutateAsync(photoId);
    } catch (e) {
      toast.error("Не удалось удалить фото", (e as Error).message ?? "");
    }
  };

  const onRemoveItem = async () => {
    const ok = await confirmDialog({
      title: "Удалить пункт?",
      message: `«${progress.title}» — пункт уйдёт из чек-листа со всеми фото.`,
      confirmText: "Удалить",
      cancelText: "Отмена",
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
        "rounded-[10px] border bg-white p-3 transition-colors",
        progress.done ? "border-green-500 bg-green-soft/30" : "border-border",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={toggleDone}
          disabled={patch.isPending}
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
            progress.done
              ? "bg-green-600 text-white"
              : "border border-border bg-white",
          )}
        >
          {progress.done && <Check size={12} strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "text-[13px] font-semibold",
              progress.done
                ? "text-green-ink line-through decoration-1"
                : "text-ink",
            )}
          >
            {progress.title}
            {progress.qty > 1 && (
              <span className="ml-1 text-[11px] text-muted-2">
                × {progress.qty}
              </span>
            )}
          </div>
          {progress.priceSnapshot > 0 && (
            <div className="text-[11px] text-muted-2 tabular-nums">
              {(progress.priceSnapshot * progress.qty).toLocaleString("ru-RU")}{" "}
              ₽ по акту
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onRemoveItem}
          title="Убрать пункт"
          disabled={removeItem.isPending}
          className="rounded-[6px] p-1 text-muted-2 hover:bg-red-soft hover:text-red-600 disabled:opacity-30"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <input
        value={localNotes}
        onChange={(e) => setLocalNotes(e.target.value)}
        onBlur={saveNotes}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Что сделано: «заменён рычаг», «прокачаны тормоза»…"
        className="mt-2 h-8 w-full rounded-[8px] border border-border bg-white px-2 text-[12px] outline-none focus:border-blue-600"
      />

      {/* Фото */}
      <div className="mt-2 flex flex-wrap items-start gap-1.5">
        {progress.photos.map((ph) => {
          const url = fileUrl(ph.fileKey);
          if (!url) return null;
          return (
            <div
              key={ph.id}
              className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-[8px] border border-border bg-surface-soft"
            >
              <button
                type="button"
                onClick={() => setPreviewPhoto(ph)}
                className="block h-full w-full"
              >
                <img
                  src={url}
                  alt={ph.fileName}
                  className="h-full w-full object-cover"
                />
              </button>
              <button
                type="button"
                onClick={() => onDeletePhoto(ph.id)}
                title="Удалить фото"
                className="absolute right-0.5 top-0.5 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow-card group-hover:flex"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
          title="Добавить фото"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[8px] border-2 border-dashed border-border bg-white text-muted-2 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"
        >
          {upload.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Camera size={16} />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadPhoto(f);
            // reset так чтобы можно было загрузить тот же файл повторно
            e.target.value = "";
          }}
        />
      </div>

      {previewPhoto && (
        <PhotoPreview photo={previewPhoto} onClose={() => setPreviewPhoto(null)} />
      )}
    </div>
  );
}

function PhotoPreview({
  photo,
  onClose,
}: {
  photo: ApiRepairProgressPhoto;
  onClose: () => void;
}) {
  const url = fileUrl(photo.fileKey);
  if (!url) return null;
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/80 p-6"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X size={18} />
      </button>
      <img
        src={url}
        alt={photo.fileName}
        className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function JournalRow({ job }: { job: ApiRepairJob }) {
  const { data: scooters = [] } = useApiScooters();
  const scooter = scooters.find((s) => s.id === job.scooterId) ?? null;
  const totalPhotos = job.progress.reduce(
    (s, p) => s + p.photos.length,
    0,
  );
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card-sm">
      <div className="flex items-start gap-3">
        <ScooterAvatar
          scooter={scooter}
          fallbackModel={job.scooter?.model}
          small
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-bold text-ink">
              {job.scooter?.name ?? `#${job.scooterId}`}
            </span>
            <span className="text-[12px] text-muted-2">
              {modelLabelFor(scooter, job.scooter?.model)}
            </span>
            <span className="rounded-full bg-green-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-ink">
              <CheckCircle2 size={9} className="-mt-0.5 mr-0.5 inline" />
              Закрыт
            </span>
            {totalPhotos > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-bold text-muted-2">
                <ImageIcon size={9} /> {totalPhotos} фото
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted">
            Открыт {fmtRuDateTime(job.startedAt)}
            <ArrowRight size={10} />
            Закрыт{" "}
            {job.completedAt ? fmtRuDateTime(job.completedAt) : "—"}
            {job.rental && job.rental.clientName && (
              <>
                <span className="text-muted-2">·</span>
                клиент: {job.rental.clientName}
              </>
            )}
          </div>
          {job.progress.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {job.progress.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-start gap-1.5 text-[12px]"
                >
                  <Check
                    size={11}
                    className={cn(
                      "mt-1 shrink-0",
                      p.done ? "text-green-600" : "text-muted-2/40",
                    )}
                  />
                  <span
                    className={cn(
                      "font-semibold",
                      p.done ? "text-ink" : "text-muted-2",
                    )}
                  >
                    {p.title}
                  </span>
                  {p.notes && (
                    <span className="text-muted-2">— {p.notes}</span>
                  )}
                  {p.photos.length > 0 && (
                    <div className="mt-0.5 flex w-full flex-wrap gap-1.5">
                      {p.photos.map((ph) => {
                        const url = fileUrl(ph.fileKey);
                        if (!url) return null;
                        return (
                          <a
                            key={ph.id}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block h-12 w-12 overflow-hidden rounded-[6px] border border-border bg-surface-soft hover:opacity-80"
                          >
                            <img
                              src={url}
                              alt={ph.fileName}
                              className="h-full w-full object-cover"
                            />
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Аватарка скутера. v0.2.94: с фоллбэком — если modelId не выставлен,
 * ищем модель в каталоге по совпадению с enum-полем s.model
 * (тот же паттерн что в ScooterCard / ScooterThumb).
 */
function ScooterAvatar({
  scooter,
  fallbackModel,
  small = false,
}: {
  scooter: ApiScooter | null;
  fallbackModel?: string;
  small?: boolean;
}) {
  const { data: models = [] } = useApiScooterModels();
  const enumModel = scooter?.model ?? fallbackModel ?? "";
  const linked = scooter?.modelId
    ? models.find((m) => m.id === scooter.modelId)
    : models.find((m) => m.name.toLowerCase().includes(enumModel.toLowerCase()));
  const avatarSrc = fileUrl(linked?.avatarKey);
  const size = small ? "h-14 w-14" : "h-20 w-20";
  if (avatarSrc) {
    return (
      <div
        className={cn(
          "shrink-0 overflow-hidden rounded-2xl bg-surface-soft",
          size,
        )}
      >
        <img
          src={avatarSrc}
          alt={linked?.name ?? enumModel}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl bg-ink text-white",
        size,
      )}
    >
      <Bike size={small ? 22 : 32} strokeWidth={1.5} />
    </div>
  );
}

function modelLabelFor(
  scooter: ApiScooter | null,
  fallbackModel?: string,
): string {
  if (scooter) {
    const m =
      MODEL_LABEL[scooter.model as keyof typeof MODEL_LABEL] ?? scooter.model;
    return m;
  }
  if (fallbackModel) {
    return (
      MODEL_LABEL[fallbackModel as keyof typeof MODEL_LABEL] ?? fallbackModel
    );
  }
  return "—";
}

function fmtRuDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
