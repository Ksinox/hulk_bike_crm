import { useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCreateMaintenance,
  useDeleteMaintenance,
  useScooterMaintenance,
  type ApiMaintenance,
  type MaintenanceKind,
} from "@/lib/api/scooter-maintenance";
import {
  useRepairJobs,
  type ApiRepairJob,
} from "@/lib/api/repair-jobs";
import { navigate } from "@/app/navigationStore";
import { confirmDialog, toast } from "@/lib/toast";

const KIND_LABEL: Record<MaintenanceKind, string> = {
  oil: "Замена масла",
  repair: "Ремонт",
  parts: "Запчасти",
  other: "Прочее",
};

const KIND_CHIP_CLASS: Record<MaintenanceKind, string> = {
  oil: "bg-amber-100 text-amber-700",
  repair: "bg-red-soft text-red-ink",
  parts: "bg-purple-soft text-purple-ink",
  other: "bg-surface-soft text-muted-2",
};

export function MaintenanceTab({
  scooterId,
}: {
  scooterId: number;
}) {
  // v0.4.41: связь repair_jobs ↔ скутер. Раньше таб «Ремонты» на
  // карточке скутера показывал только scooter_maintenance (масло,
  // запчасти — ручные расходы), а repair_jobs (фактические ремонты
  // по дефектам с чек-листом из damage_report) показывались только
  // на отдельной странице «Ремонты». Теперь обе сущности связаны
  // в одной вкладке: вверху ремонты по дефектам, ниже расходы.
  const { data: maintenance = [], isLoading: maintLoading } =
    useScooterMaintenance(scooterId);
  const { data: repairs = [], isLoading: repairsLoading } = useRepairJobs({
    scooterId,
  });
  const [addOpen, setAddOpen] = useState(false);

  const maintTotal = maintenance.reduce((s, r) => s + r.amount, 0);
  // Cost ремонта = Σ (priceSnapshot × qty) по всем пунктам progress.
  const repairCost = (job: ApiRepairJob): number =>
    job.progress.reduce((s, p) => s + p.priceSnapshot * (p.qty ?? 1), 0);
  const repairsTotal = repairs.reduce((s, j) => s + repairCost(j), 0);
  const totalSpent = maintTotal + repairsTotal;

  const activeRepairs = repairs.filter((r) => r.status === "in_progress");
  const closedRepairs = repairs.filter((r) => r.status === "completed");

  return (
    <div className="flex flex-col gap-4">
      {/* Сводка: всего потрачено + кнопка добавить расход */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-soft px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
            Всего потрачено
          </div>
          <div className="mt-0.5 text-[20px] font-bold text-ink tabular-nums">
            {totalSpent.toLocaleString("ru-RU")} ₽
          </div>
          <div className="text-[11px] text-muted">
            {repairs.length > 0 && (
              <>
                {repairs.length}{" "}
                {plural(repairs.length, ["ремонт", "ремонта", "ремонтов"])}
                {repairsTotal > 0 && ` · ${repairsTotal.toLocaleString("ru-RU")} ₽`}
              </>
            )}
            {repairs.length > 0 && maintenance.length > 0 && " · "}
            {maintenance.length > 0 && (
              <>
                {maintenance.length}{" "}
                {plural(maintenance.length, [
                  "расход",
                  "расхода",
                  "расходов",
                ])}
                {maintTotal > 0 && ` · ${maintTotal.toLocaleString("ru-RU")} ₽`}
              </>
            )}
            {repairs.length === 0 && maintenance.length === 0 && "записей пока нет"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-[12px] font-bold text-white hover:bg-blue-600"
        >
          <Plus size={13} /> Добавить расход
        </button>
      </div>

      {/* Секция «Ремонты по дефектам» — repair_jobs */}
      {(repairsLoading || repairs.length > 0) && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2 px-1">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-red-soft text-red-ink">
              <Wrench size={12} />
            </span>
            <h3 className="text-[13px] font-bold text-ink">
              Ремонты по дефектам
            </h3>
            {activeRepairs.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                {activeRepairs.length} активных
              </span>
            )}
            <span className="ml-auto text-[11px] text-muted-2">
              из актов о повреждениях
            </span>
          </div>
          {repairsLoading ? (
            <div className="py-4 text-center text-[12px] text-muted">
              Загружаем ремонты…
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-surface shadow-card-sm">
              {[...activeRepairs, ...closedRepairs].map((job) => (
                <RepairJobRow
                  key={job.id}
                  job={job}
                  cost={repairCost(job)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Секция «Расходы и обслуживание» — scooter_maintenance */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 px-1">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-blue-50 text-blue-600">
            <Plus size={12} />
          </span>
          <h3 className="text-[13px] font-bold text-ink">
            Расходы и обслуживание
          </h3>
          <span className="ml-auto text-[11px] text-muted-2">
            масло, запчасти, прочее
          </span>
        </div>
        {maintLoading ? (
          <div className="py-4 text-center text-[12px] text-muted">
            Загружаем расходы…
          </div>
        ) : maintenance.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-5 shadow-card-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-soft text-muted-2">
              <Wrench size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink">
                Расходов пока нет
              </div>
              <div className="text-[12px] text-muted">
                Добавьте первый расход — масло, запчасти или прочее
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-surface shadow-card-sm">
            {maintenance.map((m) => (
              <MaintRow key={m.id} m={m} />
            ))}
          </div>
        )}
      </section>

      {addOpen && (
        <MaintenanceAddModal
          scooterId={scooterId}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}

/* v0.4.41: строка одного repair_job. Кликабельна → переход на /service. */
function RepairJobRow({
  job,
  cost,
}: {
  job: ApiRepairJob;
  cost: number;
}) {
  const isClosed = job.status === "completed";
  const doneCount = job.progress.filter((p) => p.done).length;
  const totalItems = job.progress.length;
  const photoCount = job.progress.reduce(
    (s, p) => s + (p.photos?.length ?? 0),
    0,
  );
  return (
    <button
      type="button"
      onClick={() => navigate({ route: "service" })}
      className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-soft"
      title="Открыть журнал ремонтов"
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
          isClosed
            ? "bg-green-soft text-green-ink"
            : "bg-amber-100 text-amber-800",
        )}
      >
        {isClosed ? (
          <CheckCircle2 size={10} />
        ) : (
          <Wrench size={10} />
        )}
        {isClosed ? "закрыт" : "в работе"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5 text-[13px] font-semibold text-ink">
          <span>Ремонт #{String(job.id).padStart(3, "0")}</span>
          {job.rental?.clientName && (
            <span className="text-[11px] font-normal text-muted-2">
              · по аренде клиента {job.rental.clientName}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
          <span>{formatDateRu(job.startedAt.slice(0, 10))}</span>
          {job.completedAt && (
            <>
              <span>→</span>
              <span>{formatDateRu(job.completedAt.slice(0, 10))}</span>
            </>
          )}
          {totalItems > 0 && (
            <>
              <span>·</span>
              <span>
                {doneCount}/{totalItems}{" "}
                {plural(totalItems, ["пункт", "пункта", "пунктов"])}
              </span>
            </>
          )}
          {photoCount > 0 && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-0.5">
                <ImageIcon size={10} /> {photoCount}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="text-right">
        {cost > 0 ? (
          <div className="text-[14px] font-bold tabular-nums text-ink">
            {cost.toLocaleString("ru-RU")} ₽
          </div>
        ) : (
          <div className="text-[11px] text-muted-2">без расходов</div>
        )}
      </div>
      <ChevronRight size={14} className="shrink-0 text-muted-2" />
    </button>
  );
}

function MaintRow({ m }: { m: ApiMaintenance }) {
  const del = useDeleteMaintenance();
  const onDel = async () => {
    const ok = await confirmDialog({
      title: "Удалить запись обслуживания?",
      message: "Запись и сумма будут удалены из истории скутера.",
      confirmText: "Удалить",
      danger: true,
    });
    if (ok) del.mutate(m.id);
  };
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
          KIND_CHIP_CLASS[m.kind],
        )}
      >
        {KIND_LABEL[m.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-ink">
          {m.note || "(без комментария)"}
        </div>
        <div className="text-[11px] text-muted">
          {formatDateRu(m.performedOn)}
          {m.mileage != null && ` · ${m.mileage.toLocaleString("ru-RU")} км`}
          {m.createdBy && ` · ${m.createdBy}`}
        </div>
      </div>
      <div className="text-right text-[14px] font-bold tabular-nums">
        {m.amount.toLocaleString("ru-RU")} ₽
      </div>
      <button
        type="button"
        onClick={onDel}
        title="Удалить"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-2 hover:bg-red-soft hover:text-red-ink"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function MaintenanceAddModal({
  scooterId,
  onClose,
}: {
  scooterId: number;
  onClose: () => void;
}) {
  const mut = useCreateMaintenance();
  const [kind, setKind] = useState<MaintenanceKind>("other");
  const [amount, setAmount] = useState(0);
  const [performedOn, setPerformedOn] = useState(todayYmd());
  const [mileage, setMileage] = useState<string>("");
  const [note, setNote] = useState("");

  const canSave = performedOn.length === 10;

  const submit = async () => {
    try {
      await mut.mutateAsync({
        scooterId,
        kind,
        performedOn,
        amount: Math.max(0, amount),
        mileage: mileage.trim() ? Math.max(0, Number(mileage)) : null,
        note: note.trim() || null,
      });
      onClose();
    } catch {
      toast.error("Не удалось сохранить запись");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/55 p-6 backdrop-blur-sm"
    >
      <div
        className="mt-16 w-full max-w-[440px] overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-soft px-5 py-3">
          <div className="text-[15px] font-bold">Добавить расход</div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-3.5 px-5 py-5">
          <Field label="Тип работы">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(KIND_LABEL) as MaintenanceKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
                    kind === k
                      ? "bg-ink text-white"
                      : "bg-surface-soft text-ink-2 hover:bg-blue-50",
                  )}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Дата">
              <input
                type="date"
                value={performedOn}
                onChange={(e) => setPerformedOn(e.target.value)}
                className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none focus:border-blue"
              />
            </Field>
            <Field label="Сумма, ₽">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
                className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none focus:border-blue"
              />
            </Field>
          </div>

          <Field label="Пробег на момент работы, км (необязательно)">
            <input
              type="number"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none focus:border-blue"
            />
          </Field>

          <Field label="Комментарий">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Что именно сделали"
              className="w-full rounded-[10px] border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-blue"
            />
          </Field>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-surface-soft px-4 py-2 text-[13px] font-semibold hover:bg-border"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSave || mut.isPending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold transition-colors",
                !canSave || mut.isPending
                  ? "cursor-not-allowed bg-surface-soft text-muted-2"
                  : "bg-ink text-white hover:bg-blue-600",
              )}
            >
              {mut.isPending && <Loader2 size={14} className="animate-spin" />}
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </div>
      {children}
    </div>
  );
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateRu(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
