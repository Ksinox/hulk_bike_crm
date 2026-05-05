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

/**
 * v0.4.43: чёткое разделение CRM-сущностей.
 *
 *   • <RepairsTab>  — показывает ТОЛЬКО repair_jobs (фактические ремонты
 *     по дефектам или вручную через смену статуса). С чек-листом и фото.
 *
 *   • <ExpensesTab> — показывает ТОЛЬКО scooter_maintenance (расходные
 *     материалы: масло, запчасти, прочее). Без понятия «работа».
 *
 * Раньше всё это было в одном табе «Ремонты» — путаница: оператор
 * видел «Ремонт» как тип расхода и тут же ниже Repair Job. Теперь два
 * разных таба с разной семантикой.
 */
export function RepairsTab({
  scooterId,
  baseStatus,
  onSendToRepair,
}: {
  scooterId: number;
  baseStatus?: string;
  onSendToRepair?: () => void;
}) {
  // v0.4.41-42: связь repair_jobs ↔ скутер.
  // Бизнес-логика ремонта (по правке заказчика v0.4.42):
  //   1. Скутер требует ремонта → оператор меняет статус на «В ремонте».
  //      Бэк (scooters.ts) автоматически создаёт repair_job (in_progress).
  //   2. Оператор идёт на /service, открывает этот repair_job и
  //      добавляет пункты из общего прайс-листа (PriceItemsPicker).
  //      Это работает И для ручного ремонта, И для damage-flow —
  //      damage_report заранее наполняет чек-лист.
  //   3. По мере выполнения отмечает галочки + фотографии.
  //   4. «Готов к аренде» → status job=completed, скутер → rental_pool.
  //
  // Ручной "Добавить расход" остаётся, но теперь это бухгалтерский
  // журнал расходных материалов (масло/запчасти/прочее), без kind='repair'
  // — собственно ремонтная работа считается через repair_progress, а
  // не через maintenance.
  const { data: repairs = [], isLoading: repairsLoading } = useRepairJobs({
    scooterId,
  });

  const repairCost = (job: ApiRepairJob): number =>
    job.progress.reduce((s, p) => s + p.priceSnapshot * (p.qty ?? 1), 0);
  const repairsTotal = repairs.reduce((s, j) => s + repairCost(j), 0);
  const activeRepairs = repairs.filter((r) => r.status === "in_progress");
  const closedRepairs = repairs.filter((r) => r.status === "completed");
  const isInRepair = baseStatus === "repair";

  return (
    <div className="flex flex-col gap-4">
      {/* CTA: статус-зависимая призывная карточка */}
      {isInRepair && activeRepairs.length > 0 ? (
        <button
          type="button"
          onClick={() => navigate({ route: "service" })}
          className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-left transition-colors hover:bg-amber-100"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-800">
            <Wrench size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-amber-900">
              Скутер сейчас в ремонте
            </div>
            <div className="text-[12px] text-amber-800/80">
              Открыть чек-лист на странице «Ремонты» — добавить работы из
              прайса, отметить выполнение.
            </div>
          </div>
          <ChevronRight size={16} className="shrink-0 text-amber-700" />
        </button>
      ) : !isInRepair && onSendToRepair ? (
        <button
          type="button"
          onClick={onSendToRepair}
          className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-white px-4 py-3 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/40"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Wrench size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-ink">
              Отправить в ремонт
            </div>
            <div className="text-[12px] text-muted">
              Сменит статус скутера на «В ремонте». Создастся запись
              ремонта — работы из прайса выбираются на странице «Ремонты».
            </div>
          </div>
          <ChevronRight size={16} className="shrink-0 text-muted-2" />
        </button>
      ) : null}

      {/* Сводка: только по ремонтам */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-soft px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
            Стоимость ремонтов
          </div>
          <div className="mt-0.5 text-[20px] font-bold text-ink tabular-nums">
            {repairsTotal.toLocaleString("ru-RU")} ₽
          </div>
          <div className="text-[11px] text-muted">
            {repairs.length === 0
              ? "ремонтов пока не было"
              : `${repairs.length} ${plural(repairs.length, ["ремонт", "ремонта", "ремонтов"])} · ${activeRepairs.length} активных, ${closedRepairs.length} закрыто`}
          </div>
        </div>
      </div>

      {/* Список ремонтов */}
      {repairsLoading ? (
        <div className="py-6 text-center text-[12px] text-muted">
          Загружаем ремонты…
        </div>
      ) : repairs.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-5 shadow-card-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-soft text-muted-2">
            <Wrench size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-ink">
              Ремонтов по этому скутеру не было
            </div>
            <div className="text-[12px] text-muted">
              Появятся автоматически при создании акта о повреждениях или
              при отправке скутера в ремонт.
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-surface shadow-card-sm">
          {[...activeRepairs, ...closedRepairs].map((job) => (
            <RepairJobRow key={job.id} job={job} cost={repairCost(job)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * v0.4.43: отдельный таб «Расходы» — только scooter_maintenance.
 * Журнал расходных материалов (масло, запчасти, прочее). Без понятия
 * «ремонт» — для ремонтных работ есть таб «Ремонты» (repair_jobs).
 */
export function ExpensesTab({ scooterId }: { scooterId: number }) {
  const { data: items = [], isLoading } = useScooterMaintenance(scooterId);
  const [addOpen, setAddOpen] = useState(false);
  const total = items.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-soft px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
            Всего расходов
          </div>
          <div className="mt-0.5 text-[20px] font-bold text-ink tabular-nums">
            {total.toLocaleString("ru-RU")} ₽
          </div>
          <div className="text-[11px] text-muted">
            {items.length === 0
              ? "записей пока нет"
              : `${items.length} ${plural(items.length, ["запись", "записи", "записей"])}`}
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

      {isLoading ? (
        <div className="py-6 text-center text-[12px] text-muted">
          Загрузка…
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-5 shadow-card-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-soft text-muted-2">
            <Plus size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-ink">
              Расходов пока нет
            </div>
            <div className="text-[12px] text-muted">
              Замена масла, запчасти, прочие материалы. Ремонтные работы —
              в табе «Ремонты».
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-surface shadow-card-sm">
          {items.map((m) => (
            <MaintRow key={m.id} m={m} />
          ))}
        </div>
      )}

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
  const [kind, setKind] = useState<MaintenanceKind>("oil");
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
          <Field label="Тип расхода">
            <div className="flex flex-wrap gap-1.5">
              {/* v0.4.42: убран kind='repair'. Сам ремонт регистрируется
                  через смену статуса скутера → repair_job + чек-лист
                  на /service. Здесь — только расходные материалы. */}
              {(["oil", "parts", "other"] as MaintenanceKind[]).map((k) => (
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
