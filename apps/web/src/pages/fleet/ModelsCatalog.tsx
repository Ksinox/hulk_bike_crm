import { useMemo, useState } from "react";
import { Plus, Star, Tag, Trash2, Pencil, X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useApiScooterModels,
  useCreateScooterModel,
  useDeleteScooterModel,
  useDeleteScooterModelAvatar,
  usePatchScooterModel,
  useUploadScooterModelAvatar,
  type ApiScooterModel,
  type CreateModelInput,
} from "@/lib/api/scooter-models";
import { fileUrl } from "@/lib/files";
import { AvatarUpload } from "./AvatarUpload";

export function ModelsCatalog() {
  const { data: items = [], isLoading } = useApiScooterModels();
  const [editing, setEditing] = useState<ApiScooterModel | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.quickPick !== b.quickPick) return a.quickPick ? -1 : 1;
        return a.name.localeCompare(b.name, "ru");
      }),
    [items],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-muted">
          {isLoading
            ? "Загрузка…"
            : `${items.length} ${plural(items.length, ["модель", "модели", "моделей"])} · ${items.filter((x) => x.quickPick).length} в быстром выборе`}
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-white hover:bg-blue-600"
        >
          <Plus size={14} /> Добавить модель
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((m) => (
          <ModelCard key={m.id} model={m} onEdit={() => setEditing(m)} />
        ))}
        {sorted.length === 0 && !isLoading && (
          <div className="col-span-full rounded-2xl bg-surface p-8 text-center text-muted shadow-card-sm">
            <Tag size={24} className="mx-auto mb-2" />
            Пока ни одной модели. Добавьте первую.
          </div>
        )}
      </div>

      {addOpen && <ModelFormModal onClose={() => setAddOpen(false)} />}
      {editing && (
        <ModelFormModal
          initial={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ModelCard({
  model,
  onEdit,
}: {
  model: ApiScooterModel;
  onEdit: () => void;
}) {
  const del = useDeleteScooterModel();
  const onDelete = () => {
    if (!confirm(`Удалить модель «${model.name}»?`)) return;
    del.mutate(model.id);
  };
  const avatarSrc = fileUrl(model.avatarKey);
  return (
    <div className="relative rounded-2xl bg-surface p-4 shadow-card-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-50 text-blue-700">
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <Tag size={22} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-[15px] font-bold text-ink">
              {model.name}
            </div>
            {model.quickPick && (
              <Star size={12} className="text-amber-500 fill-amber-400" />
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted-2">
            1-3 дня: <b className="text-ink">{model.shortRate}₽</b> · неделя:{" "}
            <b className="text-ink">{model.weekRate}₽</b> · месяц:{" "}
            <b className="text-ink">{model.monthRate}₽</b>
          </div>
          {model.note && (
            <div className="mt-1 text-[11px] text-muted truncate">{model.note}</div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onEdit}
            title="Изменить"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-soft text-ink-2 hover:bg-blue-50 hover:text-blue-700"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Удалить"
            disabled={del.isPending}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-soft text-muted-2 hover:bg-red-soft hover:text-red-ink"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ModelFormModal({
  initial,
  onClose,
}: {
  initial?: ApiScooterModel;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const createMut = useCreateScooterModel();
  const patchMut = usePatchScooterModel();

  const [name, setName] = useState(initial?.name ?? "");
  const [shortRate, setShortRate] = useState(initial?.shortRate ?? 1300);
  const [weekRate, setWeekRate] = useState(initial?.weekRate ?? 500);
  const [monthRate, setMonthRate] = useState(initial?.monthRate ?? 400);
  const [quickPick, setQuickPick] = useState(initial?.quickPick ?? false);
  const [note, setNote] = useState(initial?.note ?? "");
  const [err, setErr] = useState<string | null>(null);

  const pending = createMut.isPending || patchMut.isPending;
  const canSave = name.trim().length >= 1;

  const submit = async () => {
    setErr(null);
    const body: CreateModelInput = {
      name: name.trim(),
      shortRate,
      weekRate,
      monthRate,
      quickPick,
      note: note.trim() || null,
    };
    try {
      if (isEdit) {
        await patchMut.mutateAsync({ id: initial.id, patch: body });
      } else {
        await createMut.mutateAsync(body);
      }
      onClose();
    } catch {
      setErr("Не удалось сохранить. Возможно имя уже занято.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/55 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-16 w-full max-w-[460px] overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-soft px-5 py-3">
          <div className="text-[15px] font-bold">
            {isEdit ? "Изменить модель" : "Новая модель"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-5 py-5">
          {isEdit && <AvatarEditor model={initial} />}
          {!isEdit && (
            <div className="rounded-[10px] bg-surface-soft px-3 py-2 text-[11px] text-muted-2">
              Аватарку модели можно будет загрузить после создания — откройте её
              снова кнопкой «Изменить».
            </div>
          )}

          <Field label="Название">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="Например: Yamaha Jog"
              className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none focus:border-blue"
            />
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <Field label="1-3 дня, ₽/сут">
              <RateInput value={shortRate} onChange={setShortRate} />
            </Field>
            <Field label="Неделя, ₽/сут">
              <RateInput value={weekRate} onChange={setWeekRate} />
            </Field>
            <Field label="Месяц+, ₽/сут">
              <RateInput value={monthRate} onChange={setMonthRate} />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={quickPick}
              onChange={(e) => setQuickPick(e.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
            Отображать в быстром выборе при создании аренды
          </label>

          <Field label="Примечание">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-[10px] border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-blue"
            />
          </Field>

          {err && (
            <div className="rounded-[10px] border border-red-400/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-ink">
              {err}
            </div>
          )}

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
              disabled={!canSave || pending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold transition-colors",
                !canSave || pending
                  ? "cursor-not-allowed bg-surface-soft text-muted-2"
                  : "bg-ink text-white hover:bg-blue-600",
              )}
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {isEdit ? "Сохранить" : "Создать"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AvatarEditor({ model }: { model: ApiScooterModel }) {
  const uploadMut = useUploadScooterModelAvatar();
  const deleteMut = useDeleteScooterModelAvatar();
  // Читаем актуальное состояние из кеша React Query, а не из props — иначе
  // после upload preview исчезнет, но avatarKey в props будет stale → url=null →
  // кнопка «Удалить» пропадёт.
  const { data: models = [] } = useApiScooterModels();
  const live = models.find((m) => m.id === model.id) ?? model;
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
        Аватарка
      </div>
      <AvatarUpload
        avatarKey={live.avatarKey}
        uploading={uploadMut.isPending}
        removing={deleteMut.isPending}
        onUpload={(file) => uploadMut.mutateAsync({ id: model.id, file })}
        onRemove={() => deleteMut.mutateAsync(model.id)}
      />
      <div className="mt-1 text-[11px] text-muted-2">
        Эта картинка показывается в карточке скутера и в блоке «Скутер» при аренде.
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

function RateInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none focus:border-blue"
    />
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
