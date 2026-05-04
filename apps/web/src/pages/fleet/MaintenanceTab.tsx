import { useState } from "react";
import { Loader2, Plus, Trash2, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCreateMaintenance,
  useDeleteMaintenance,
  useScooterMaintenance,
  type ApiMaintenance,
  type MaintenanceKind,
} from "@/lib/api/scooter-maintenance";
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
  const { data: items = [], isLoading } = useScooterMaintenance(scooterId);
  const [addOpen, setAddOpen] = useState(false);

  const total = items.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-xl bg-surface-soft px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
            Всего потрачено
          </div>
          <div className="mt-0.5 text-[20px] font-bold text-ink">
            {total.toLocaleString("ru-RU")} ₽
          </div>
          <div className="text-[11px] text-muted">
            {items.length} {plural(items.length, ["запись", "записи", "записей"])}
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
        <div className="py-8 text-center text-muted">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-6 shadow-card-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-soft text-muted-2">
            <Wrench size={18} />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-ink">
              Пока нет записей об обслуживании
            </div>
            <div className="text-[12px] text-muted">
              Добавьте первый расход (масло, ремонт, запчасти)
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
