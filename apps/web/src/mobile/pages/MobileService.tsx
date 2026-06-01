import { useMemo, useState } from "react";
import { Wrench, ChevronRight } from "lucide-react";
import {
  useRepairJobs,
  type ApiRepairJob,
  type ApiRepairProgress,
} from "@/lib/api/repair-jobs";
import { cn } from "@/lib/utils";
import {
  DetailRow,
  MobileChips,
  MobileEmpty,
  MobileSearch,
  MobileSheet,
  type ChipOption,
} from "../ui";

type Filter = "active" | "completed";

const MODEL_LABEL: Record<string, string> = {
  jog: "Yamaha Jog",
  gear: "Honda Gear",
  honda: "Honda",
  tank: "Tank",
};

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
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

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

  return (
    <div className="flex flex-col gap-3">
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
        title={openJob?.scooter?.name ?? "Ремонт"}
      >
        {openJob && <JobDetail job={openJob} />}
      </MobileSheet>
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
        <div className="truncate text-[14px] font-bold text-ink">
          {job.scooter?.name ?? "Скутер"}
          <span className="ml-1.5 text-[12px] font-normal text-muted">
            {job.scooter ? MODEL_LABEL[job.scooter.model] ?? job.scooter.model : ""}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[12px] text-muted">
          {progressLabel(job.progress)} · с {formatDate(job.startedAt)}
        </div>
      </div>
      <ChevronRight size={16} className="text-muted-2" />
    </button>
  );
}

function JobDetail({ job }: { job: ApiRepairJob }) {
  const done = job.status === "completed";
  return (
    <div>
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
        <DetailRow label="Скутер" value={job.scooter?.name ?? "—"} />
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

      {job.progress.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 px-1 text-[12px] font-semibold text-muted">
            Чек-лист · {progressLabel(job.progress)}
          </div>
          <div className="rounded-2xl bg-surface px-3.5 shadow-card-sm">
            {job.progress.map((p, i) => (
              <div key={p.id}>
                {i > 0 && <div className="border-t border-border" />}
                <div className="flex items-center gap-2.5 py-2.5">
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      p.completedAt
                        ? "bg-green text-white"
                        : "bg-surface-soft text-muted-2",
                    )}
                  >
                    {p.completedAt ? "✓" : i + 1}
                  </span>
                  <span
                    className={cn(
                      "text-[13px]",
                      p.completedAt ? "text-muted line-through" : "text-ink",
                    )}
                  >
                    {p.title}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-[12px] text-muted-2">
        Отметки, фото и закрытие ремонта — на компьютере
      </p>
    </div>
  );
}
