import { useState } from "react";
import {
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
  Sparkles,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/api/auth";
import { toast } from "@/lib/toast";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import {
  type ApiPriceGroup,
  type ApiPriceItem,
  useApiPriceList,
  useCreatePriceGroup,
  useCreatePriceItem,
  useDeletePriceGroup,
  useDeletePriceItem,
  usePatchPriceGroup,
  usePatchPriceItem,
  useSeedPriceList,
  useReseedPriceList,
} from "@/lib/api/price-list";

function fmt(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("ru-RU") + " ₽";
}

/**
 * Прейскурант. Список групп → внутри каждой таблица позиций.
 * Изменять может director/creator. Остальные — только смотрят.
 */
export function PriceListView() {
  const me = useMe();
  const canEdit = me.data?.role === "director" || me.data?.role === "creator";
  const list = useApiPriceList();
  const seed = useSeedPriceList();
  const reseed = useReseedPriceList();
  const createGroup = useCreatePriceGroup();
  const models = useApiScooterModels();

  const [creatingGroup, setCreatingGroup] = useState(false);

  if (list.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-muted-2">
        <Loader2 size={16} className="animate-spin" /> Загружаем прейскурант…
      </div>
    );
  }

  const groups = list.data ?? [];

  const empty = groups.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[10px] bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
        Прейскурант — это справочник цен на детали, штрафы, повреждения и
        экипировку. Используется при <b>фиксации ущерба</b> по аренде:
        выбираешь позиции из списка — сумма считается автоматически.
        {canEdit && (
          <>
            {" "}
            Можно добавлять группы, позиции и менять цены — изменения видны
            всем сразу.
          </>
        )}
      </div>

      {empty && (
        <div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-border py-10">
          <div className="text-[14px] font-semibold text-ink">
            Прейскурант пока пуст
          </div>
          {canEdit ? (
            <button
              type="button"
              disabled={seed.isPending}
              onClick={async () => {
                try {
                  const r = await seed.mutateAsync();
                  if (r.skipped) {
                    toast.info("Уже заполнен", r.message ?? "");
                  } else {
                    toast.success("Готово", "Прейскурант заполнен из шаблона");
                  }
                } catch (e) {
                  toast.error(
                    "Не удалось заполнить",
                    (e as Error).message ?? "",
                  );
                }
              }}
              className="inline-flex items-center gap-2 rounded-[10px] bg-ink px-4 py-2 text-[13px] font-bold text-white hover:bg-blue-600 disabled:opacity-50"
            >
              <Sparkles size={14} />
              {seed.isPending ? "Заполняем…" : "Заполнить из шаблона"}
            </button>
          ) : (
            <div className="text-[12px] text-muted-2">
              Попроси директора заполнить прейскурант.
            </div>
          )}
        </div>
      )}

      {groups.map((g) => (
        <PriceGroupCard
          key={g.id}
          group={g}
          canEdit={canEdit}
          modelOptions={models.data ?? []}
        />
      ))}

      {canEdit && !empty && (
        <div className="flex flex-wrap items-center gap-2">
          {creatingGroup ? (
            <NewGroupForm
              modelOptions={models.data ?? []}
              allGroups={groups}
              onCancel={() => setCreatingGroup(false)}
              onSave={async (input) => {
                try {
                  await createGroup.mutateAsync(input);
                  setCreatingGroup(false);
                } catch (e) {
                  toast.error(
                    "Не удалось добавить группу",
                    (e as Error).message ?? "",
                  );
                }
              }}
              busy={createGroup.isPending}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() => setCreatingGroup(true)}
                className="inline-flex items-center gap-2 rounded-[10px] border border-dashed border-border px-3 py-2 text-[12px] font-semibold text-ink-2 hover:border-ink hover:text-ink"
              >
                <Plus size={14} /> Добавить группу
              </button>
              <button
                type="button"
                disabled={reseed.isPending}
                onClick={async () => {
                  if (
                    !confirm(
                      "Снести весь текущий прейскурант и пересоздать из шаблона v2?\n\n" +
                        "ВНИМАНИЕ: все правки и созданные вами группы/позиции потеряются. " +
                        "Используйте, если хотите начать с чистой структуры (одна группа = одна модель).",
                    )
                  )
                    return;
                  try {
                    await reseed.mutateAsync();
                    toast.success(
                      "Пересоздано",
                      "Прейскурант v2 заполнен из шаблона",
                    );
                  } catch (e) {
                    toast.error(
                      "Не удалось пересоздать",
                      (e as Error).message ?? "",
                    );
                  }
                }}
                className="inline-flex items-center gap-2 rounded-[10px] border border-dashed border-border px-3 py-2 text-[12px] font-semibold text-muted-2 hover:border-red-soft hover:text-red-600"
                title="Снести и пересоздать прейскурант из шаблона v2"
              >
                <RefreshCcw size={12} />
                Пересоздать из шаблона
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* =================== Группа =================== */

function PriceGroupCard({
  group,
  canEdit,
  modelOptions,
}: {
  group: ApiPriceGroup;
  canEdit: boolean;
  modelOptions: { id: number; name: string }[];
}) {
  const [editingHeader, setEditingHeader] = useState(false);
  const [addingItem, setAddingItem] = useState(false);

  const patchGroup = usePatchPriceGroup();
  const deleteGroup = useDeletePriceGroup();
  const createItem = useCreatePriceItem();

  const linkedModel = group.scooterModelId
    ? modelOptions.find((m) => m.id === group.scooterModelId)
    : null;

  return (
    <div className="rounded-[14px] border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        {editingHeader ? (
          <GroupHeaderEdit
            group={group}
            modelOptions={modelOptions}
            busy={patchGroup.isPending}
            onCancel={() => setEditingHeader(false)}
            onSave={async (patch) => {
              try {
                await patchGroup.mutateAsync({ id: group.id, patch });
                setEditingHeader(false);
              } catch (e) {
                toast.error(
                  "Не удалось сохранить",
                  (e as Error).message ?? "",
                );
              }
            }}
          />
        ) : (
          <>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-[14px] font-bold text-ink">{group.name}</div>
                {linkedModel && (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                    {linkedModel.name}
                  </span>
                )}
                {!linkedModel && (
                  <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-2">
                    общая
                  </span>
                )}
              </div>
              {group.hasTwoPrices && (
                <div className="text-[11px] text-muted-2">
                  две колонки цен: {group.priceALabel} / {group.priceBLabel}
                </div>
              )}
            </div>
            {canEdit && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditingHeader(true)}
                  className="rounded-[8px] p-1.5 text-muted-2 hover:bg-surface-soft hover:text-ink"
                  title="Изменить"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      !confirm(
                        `Удалить группу «${group.name}» вместе со всеми позициями?`,
                      )
                    )
                      return;
                    try {
                      await deleteGroup.mutateAsync(group.id);
                    } catch (e) {
                      toast.error(
                        "Не удалось удалить",
                        (e as Error).message ?? "",
                      );
                    }
                  }}
                  className="rounded-[8px] p-1.5 text-muted-2 hover:bg-red-soft hover:text-red-600"
                  title="Удалить"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-soft text-[11px] uppercase tracking-wider text-muted-2">
            <tr>
              <th className="px-3 py-1.5 text-left font-semibold">Позиция</th>
              <th className="w-[140px] px-3 py-1.5 text-right font-semibold">
                {group.priceALabel}
              </th>
              {group.hasTwoPrices && (
                <th className="w-[140px] px-3 py-1.5 text-right font-semibold">
                  {group.priceBLabel}
                </th>
              )}
              {canEdit && <th className="w-[80px] px-3 py-1.5"></th>}
            </tr>
          </thead>
          <tbody>
            {group.items.map((it) => (
              <PriceItemRow
                key={it.id}
                item={it}
                hasTwoPrices={group.hasTwoPrices}
                canEdit={canEdit}
              />
            ))}
            {group.items.length === 0 && (
              <tr>
                <td
                  colSpan={group.hasTwoPrices ? 4 : 3}
                  className="px-3 py-4 text-center text-[12px] text-muted-2"
                >
                  Пока пусто
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="border-t border-border px-3 py-2">
          {addingItem ? (
            <NewItemForm
              hasTwoPrices={group.hasTwoPrices}
              priceALabel={group.priceALabel}
              priceBLabel={group.priceBLabel}
              busy={createItem.isPending}
              onCancel={() => setAddingItem(false)}
              onSave={async (input) => {
                try {
                  await createItem.mutateAsync({
                    groupId: group.id,
                    sortOrder: group.items.length,
                    ...input,
                  });
                  setAddingItem(false);
                } catch (e) {
                  toast.error(
                    "Не удалось добавить",
                    (e as Error).message ?? "",
                  );
                }
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAddingItem(true)}
              className="inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[12px] font-semibold text-blue-700 hover:bg-blue-50"
            >
              <Plus size={12} /> Добавить позицию
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* =================== Строка позиции =================== */

function PriceItemRow({
  item,
  hasTwoPrices,
  canEdit,
}: {
  item: ApiPriceItem;
  hasTwoPrices: boolean;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [a, setA] = useState<string>(
    item.priceA == null ? "" : String(item.priceA),
  );
  const [b, setB] = useState<string>(
    item.priceB == null ? "" : String(item.priceB),
  );

  const patch = usePatchPriceItem();
  const del = useDeletePriceItem();

  const save = async () => {
    const parseN = (v: string): number | null => {
      const t = v.trim();
      if (!t) return null;
      const n = Number(t.replace(/\s/g, "").replace(",", "."));
      return Number.isFinite(n) ? Math.round(n) : null;
    };
    try {
      await patch.mutateAsync({
        id: item.id,
        patch: {
          name: name.trim() || item.name,
          priceA: parseN(a),
          priceB: hasTwoPrices ? parseN(b) : null,
        },
      });
      setEditing(false);
    } catch (e) {
      toast.error("Не удалось сохранить", (e as Error).message ?? "");
    }
  };

  if (editing) {
    return (
      <tr className="border-t border-border bg-blue-50/30">
        <td className="px-3 py-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[8px] border border-border bg-white px-2 py-1 text-[13px]"
          />
        </td>
        <td className="px-3 py-1.5">
          <input
            value={a}
            onChange={(e) => setA(e.target.value)}
            inputMode="numeric"
            placeholder="—"
            className="w-full rounded-[8px] border border-border bg-white px-2 py-1 text-right text-[13px] tabular-nums"
          />
        </td>
        {hasTwoPrices && (
          <td className="px-3 py-1.5">
            <input
              value={b}
              onChange={(e) => setB(e.target.value)}
              inputMode="numeric"
              placeholder="—"
              className="w-full rounded-[8px] border border-border bg-white px-2 py-1 text-right text-[13px] tabular-nums"
            />
          </td>
        )}
        <td className="px-3 py-1.5">
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={save}
              disabled={patch.isPending}
              className="rounded-[8px] bg-ink p-1.5 text-white hover:bg-blue-600 disabled:opacity-50"
              title="Сохранить"
            >
              <Save size={12} />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setName(item.name);
                setA(item.priceA == null ? "" : String(item.priceA));
                setB(item.priceB == null ? "" : String(item.priceB));
              }}
              className="rounded-[8px] bg-surface-soft p-1.5 text-ink-2 hover:bg-surface"
              title="Отмена"
            >
              <X size={12} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-border hover:bg-surface-soft/40">
      <td className="px-3 py-1.5 text-ink">{item.name}</td>
      <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-ink">
        {fmt(item.priceA)}
      </td>
      {hasTwoPrices && (
        <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-ink">
          {fmt(item.priceB)}
        </td>
      )}
      {canEdit && (
        <td className="px-3 py-1.5">
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-[8px] p-1.5 text-muted-2 hover:bg-surface-soft hover:text-ink"
              title="Изменить"
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`Удалить позицию «${item.name}»?`)) return;
                try {
                  await del.mutateAsync(item.id);
                } catch (e) {
                  toast.error(
                    "Не удалось удалить",
                    (e as Error).message ?? "",
                  );
                }
              }}
              className="rounded-[8px] p-1.5 text-muted-2 hover:bg-red-soft hover:text-red-600"
              title="Удалить"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

/* =================== Формы =================== */

function NewItemForm({
  hasTwoPrices,
  priceALabel,
  priceBLabel,
  busy,
  onCancel,
  onSave,
}: {
  hasTwoPrices: boolean;
  priceALabel: string;
  priceBLabel: string | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: {
    name: string;
    priceA: number | null;
    priceB: number | null;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  const parseN = (v: string): number | null => {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n) : null;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название позиции"
        className="min-w-[200px] flex-1 rounded-[8px] border border-border bg-white px-2 py-1 text-[13px]"
      />
      <input
        value={a}
        onChange={(e) => setA(e.target.value)}
        inputMode="numeric"
        placeholder={priceALabel}
        className="w-[120px] rounded-[8px] border border-border bg-white px-2 py-1 text-right text-[13px] tabular-nums"
      />
      {hasTwoPrices && (
        <input
          value={b}
          onChange={(e) => setB(e.target.value)}
          inputMode="numeric"
          placeholder={priceBLabel ?? "Цена 2"}
          className="w-[120px] rounded-[8px] border border-border bg-white px-2 py-1 text-right text-[13px] tabular-nums"
        />
      )}
      <button
        type="button"
        disabled={busy || !name.trim()}
        onClick={() =>
          onSave({
            name: name.trim(),
            priceA: parseN(a),
            priceB: hasTwoPrices ? parseN(b) : null,
          })
        }
        className="rounded-[8px] bg-ink px-3 py-1 text-[12px] font-bold text-white hover:bg-blue-600 disabled:opacity-50"
      >
        Сохранить
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-[8px] bg-surface-soft px-3 py-1 text-[12px] font-semibold text-ink-2 hover:bg-surface"
      >
        Отмена
      </button>
    </div>
  );
}

function GroupHeaderEdit({
  group,
  modelOptions,
  busy,
  onCancel,
  onSave,
}: {
  group: ApiPriceGroup;
  modelOptions: { id: number; name: string }[];
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: {
    name: string;
    hasTwoPrices: boolean;
    priceALabel: string;
    priceBLabel: string | null;
    scooterModelId: number | null;
  }) => void;
}) {
  const [name, setName] = useState(group.name);
  const [twoPrices, setTwoPrices] = useState(group.hasTwoPrices);
  const [labelA, setLabelA] = useState(group.priceALabel);
  const [labelB, setLabelB] = useState(group.priceBLabel ?? "");
  const [modelId, setModelId] = useState<number | null>(group.scooterModelId);

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название группы"
        className="min-w-[180px] flex-1 rounded-[8px] border border-border bg-white px-2 py-1 text-[13px] font-semibold"
      />
      <select
        value={modelId == null ? "" : String(modelId)}
        onChange={(e) =>
          setModelId(e.target.value === "" ? null : Number(e.target.value))
        }
        className="rounded-[8px] border border-border bg-white px-2 py-1 text-[12px]"
        title="Привязка к модели скутера"
      >
        <option value="">Без привязки (общая)</option>
        {modelOptions.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
        <input
          type="checkbox"
          checked={twoPrices}
          onChange={(e) => setTwoPrices(e.target.checked)}
        />
        две колонки цен
      </label>
      <input
        value={labelA}
        onChange={(e) => setLabelA(e.target.value)}
        placeholder="Заголовок 1"
        className="w-[120px] rounded-[8px] border border-border bg-white px-2 py-1 text-[12px]"
      />
      {twoPrices && (
        <input
          value={labelB}
          onChange={(e) => setLabelB(e.target.value)}
          placeholder="Заголовок 2"
          className="w-[120px] rounded-[8px] border border-border bg-white px-2 py-1 text-[12px]"
        />
      )}
      <button
        type="button"
        disabled={busy || !name.trim()}
        onClick={() =>
          onSave({
            name: name.trim(),
            hasTwoPrices: twoPrices,
            priceALabel: labelA.trim() || "Цена",
            priceBLabel: twoPrices ? labelB.trim() || null : null,
            scooterModelId: modelId,
          })
        }
        className="rounded-[8px] bg-ink px-3 py-1 text-[12px] font-bold text-white hover:bg-blue-600 disabled:opacity-50"
      >
        Сохранить
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-[8px] bg-surface-soft px-3 py-1 text-[12px] font-semibold text-ink-2 hover:bg-surface"
      >
        Отмена
      </button>
    </div>
  );
}

function NewGroupForm({
  modelOptions,
  allGroups,
  busy,
  onCancel,
  onSave,
}: {
  modelOptions: { id: number; name: string }[];
  allGroups: ApiPriceGroup[];
  busy: boolean;
  onCancel: () => void;
  onSave: (input: {
    name: string;
    hasTwoPrices: boolean;
    priceALabel: string;
    priceBLabel: string | null;
    scooterModelId: number | null;
    copyItemsFromGroupId: number | null;
    copyWithPrices: boolean;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [twoPrices, setTwoPrices] = useState(false);
  const [labelA, setLabelA] = useState("Цена");
  const [labelB, setLabelB] = useState("");
  const [modelId, setModelId] = useState<number | null>(null);
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [copyWithPrices, setCopyWithPrices] = useState(true);

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 rounded-[14px] border border-border bg-blue-50/30 p-3",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название группы"
          className="min-w-[200px] flex-1 rounded-[8px] border border-border bg-white px-2 py-1 text-[13px] font-semibold"
        />
        <select
          value={modelId == null ? "" : String(modelId)}
          onChange={(e) =>
            setModelId(e.target.value === "" ? null : Number(e.target.value))
          }
          className="rounded-[8px] border border-border bg-white px-2 py-1 text-[12px]"
          title="Привязка к модели скутера"
        >
          <option value="">Без привязки (общая)</option>
          {modelOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
          <input
            type="checkbox"
            checked={twoPrices}
            onChange={(e) => setTwoPrices(e.target.checked)}
          />
          две колонки цен (legacy)
        </label>
        <input
          value={labelA}
          onChange={(e) => setLabelA(e.target.value)}
          placeholder="Заголовок 1"
          className="w-[120px] rounded-[8px] border border-border bg-white px-2 py-1 text-[12px]"
        />
        {twoPrices && (
          <input
            value={labelB}
            onChange={(e) => setLabelB(e.target.value)}
            placeholder="Заголовок 2"
            className="w-[120px] rounded-[8px] border border-border bg-white px-2 py-1 text-[12px]"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
          Скопировать позиции из:
        </span>
        <select
          value={copyFrom == null ? "" : String(copyFrom)}
          onChange={(e) =>
            setCopyFrom(e.target.value === "" ? null : Number(e.target.value))
          }
          className="rounded-[8px] border border-border bg-white px-2 py-1 text-[12px]"
        >
          <option value="">— не копировать —</option>
          {allGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.items.length} поз.)
            </option>
          ))}
        </select>
        {copyFrom != null && (
          <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
            <input
              type="checkbox"
              checked={copyWithPrices}
              onChange={(e) => setCopyWithPrices(e.target.checked)}
            />
            копировать с ценами
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() =>
            onSave({
              name: name.trim(),
              hasTwoPrices: twoPrices,
              priceALabel: labelA.trim() || "Цена",
              priceBLabel: twoPrices ? labelB.trim() || null : null,
              scooterModelId: modelId,
              copyItemsFromGroupId: copyFrom,
              copyWithPrices,
            })
          }
          className="rounded-[8px] bg-ink px-3 py-1 text-[12px] font-bold text-white hover:bg-blue-600 disabled:opacity-50"
        >
          Создать группу
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[8px] bg-surface-soft px-3 py-1 text-[12px] font-semibold text-ink-2 hover:bg-surface"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
