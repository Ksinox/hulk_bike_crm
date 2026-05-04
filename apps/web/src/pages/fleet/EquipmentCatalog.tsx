import { useMemo, useState } from "react";
import { Check, Loader2, Package, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useApiEquipment,
  useCreateEquipment,
  useDeleteEquipment,
  useDeleteEquipmentAvatar,
  usePatchEquipment,
  useUploadEquipmentAvatar,
  type ApiEquipmentItem,
  type CreateEquipmentInput,
} from "@/lib/api/equipment";
import { fileUrl } from "@/lib/files";
import { AvatarUpload } from "./AvatarUpload";
import { confirmDialog } from "@/lib/toast";

export function EquipmentCatalog() {
  const { data: items = [], isLoading } = useApiEquipment();
  const [editing, setEditing] = useState<ApiEquipmentItem | null>(null);
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
            : `${items.length} позиций · ${items.filter((x) => x.isFree).length} бесплатно`}
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-white hover:bg-blue-600"
        >
          <Plus size={14} /> Добавить позицию
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((it) => (
          <EquipmentCard
            key={it.id}
            item={it}
            onEdit={() => setEditing(it)}
          />
        ))}
        {sorted.length === 0 && !isLoading && (
          <div className="col-span-full rounded-2xl bg-surface p-8 text-center text-muted shadow-card-sm">
            <Package size={24} className="mx-auto mb-2" />
            Пока ни одной позиции. Добавьте первую.
          </div>
        )}
      </div>

      {addOpen && <EquipmentFormModal onClose={() => setAddOpen(false)} />}
      {editing && (
        <EquipmentFormModal initial={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function EquipmentCard({
  item,
  onEdit,
}: {
  item: ApiEquipmentItem;
  onEdit: () => void;
}) {
  const del = useDeleteEquipment();
  const onDelete = async () => {
    const ok = await confirmDialog({
      title: `Удалить «${item.name}»?`,
      message: "Позиция пропадёт из каталога экипировки.",
      confirmText: "Удалить",
      danger: true,
    });
    if (ok) del.mutate(item.id);
  };
  return (
    <div className="relative rounded-2xl bg-surface p-4 shadow-card-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-purple-soft text-purple-ink">
          {item.avatarKey ? (
            <img src={fileUrl(item.avatarKey) ?? ""} alt="" className="h-full w-full object-cover" />
          ) : (
            <Package size={22} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-[15px] font-bold text-ink">
              {item.name}
            </div>
            {item.quickPick && (
              <Star size={12} className="text-amber-500 fill-amber-400" />
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            {item.isFree ? (
              <span className="rounded-full bg-green-soft px-2 py-0.5 font-bold text-green-ink">
                бесплатно
              </span>
            ) : (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 font-bold text-blue-700">
                +{item.price}₽
              </span>
            )}
          </div>
          {item.note && (
            <div className="mt-1 text-[11px] text-muted truncate">
              {item.note}
            </div>
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

function EquipmentFormModal({
  initial,
  onClose,
}: {
  initial?: ApiEquipmentItem;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const createMut = useCreateEquipment();
  const patchMut = usePatchEquipment();

  const [name, setName] = useState(initial?.name ?? "");
  const [isFree, setIsFree] = useState(initial?.isFree ?? true);
  const [price, setPrice] = useState(initial?.price ?? 0);
  const [quickPick, setQuickPick] = useState(initial?.quickPick ?? true);
  const [note, setNote] = useState(initial?.note ?? "");
  const [err, setErr] = useState<string | null>(null);

  const pending = createMut.isPending || patchMut.isPending;
  const canSave = name.trim().length >= 1;

  const submit = async () => {
    setErr(null);
    const body: CreateEquipmentInput = {
      name: name.trim(),
      isFree,
      price: isFree ? 0 : price,
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
    >
      <div
        className="mt-16 w-full max-w-[440px] overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-soft px-5 py-3">
          <div className="text-[15px] font-bold">
            {isEdit ? "Изменить экипировку" : "Новая экипировка"}
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
          {isEdit && <EquipAvatarEditor item={initial} />}
          {!isEdit && (
            <div className="rounded-[10px] bg-surface-soft px-3 py-2 text-[11px] text-muted-2">
              Аватарку можно будет загрузить после создания — откройте позицию снова кнопкой «Изменить».
            </div>
          )}

          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Название
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="Шлем, цепь, термокороб…"
              className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none focus:border-blue"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={isFree}
              onChange={(e) => setIsFree(e.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
            Бесплатно (не добавляется к стоимости аренды)
          </label>

          {!isFree && (
            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Цена (₽ за всю аренду)
              </div>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
                className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none focus:border-blue"
              />
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={quickPick}
              onChange={(e) => setQuickPick(e.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
            Отображать в быстром выборе при создании аренды
          </label>

          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Примечание
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-[10px] border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-blue"
            />
          </div>

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

function EquipAvatarEditor({ item }: { item: ApiEquipmentItem }) {
  const uploadMut = useUploadEquipmentAvatar();
  const deleteMut = useDeleteEquipmentAvatar();
  // Читаем живой avatarKey из кеша React Query — props stale после upload/delete
  const { data: all = [] } = useApiEquipment();
  const live = all.find((x) => x.id === item.id) ?? item;
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
        Аватарка
      </div>
      <AvatarUpload
        avatarKey={live.avatarKey}
        avatarThumbKey={live.avatarThumbKey}
        uploading={uploadMut.isPending}
        removing={deleteMut.isPending}
        onUpload={({ full, thumb }) =>
          uploadMut.mutateAsync({ id: item.id, file: full, thumb })
        }
        onRemove={() => deleteMut.mutateAsync(item.id)}
        cropTitle={`Кропнуть аватарку «${item.name}»`}
      />
    </div>
  );
}
