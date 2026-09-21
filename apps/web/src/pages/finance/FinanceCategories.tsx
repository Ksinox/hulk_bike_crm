import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast, confirmDialog } from "@/lib/toast";
import {
  useCreateFinanceCategory,
  useDeleteFinanceCategory,
  useUpdateFinanceCategory,
  type FinanceCategory,
  type FinanceEntry,
  type FinanceKind,
} from "@/lib/api/finance";
import { Btn, EmptyHint, SectionCard, TextInput } from "./ui";

/**
 * Справочник статей — то, по чему потом собирается отчёт.
 *
 * Статью можно переименовать (движения переедут вместе с ней), пометить
 * постоянной (тогда она попадает в долю постоянных издержек) и убрать из
 * списка. Убранная статья не удаляет движения — они остаются в истории, а
 * из выпадающих списков статья просто исчезает.
 */

export function FinanceCategories({
  categories,
  entries,
}: {
  categories: FinanceCategory[];
  entries: FinanceEntry[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <Group kind="income" title="Статьи прихода" categories={categories} entries={entries} />
      <Group kind="expense" title="Статьи расхода" categories={categories} entries={entries} />
    </div>
  );
}

function Group({
  kind,
  title,
  categories,
  entries,
}: {
  kind: FinanceKind;
  title: string;
  categories: FinanceCategory[];
  entries: FinanceEntry[];
}) {
  const list = categories.filter((c) => c.kind === kind);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const create = useCreateFinanceCategory();
  const update = useUpdateFinanceCategory();
  const remove = useDeleteFinanceCategory();

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    await create.mutateAsync({ kind, name: n });
    toast.success("Статья добавлена", n);
    setName("");
    setAdding(false);
  };

  const rename = async (id: number) => {
    const n = editName.trim();
    if (!n) return;
    await update.mutateAsync({ id, name: n });
    toast.success("Переименовали", n);
    setEditId(null);
  };

  const drop = async (c: FinanceCategory) => {
    const used = entries.filter((e) => e.categoryId === c.id).length;
    const ok = await confirmDialog({
      title: `Убрать статью «${c.name}»?`,
      message: used
        ? `С этой статьёй записано движений: ${used}. Они останутся в истории — статья просто пропадёт из списков.`
        : "Статья пропадёт из списков. Движения с ней не записаны.",
      confirmText: "Убрать",
    });
    if (!ok) return;
    await remove.mutateAsync(c.id);
    toast.success("Статья убрана", c.name);
  };

  return (
    <SectionCard
      title={title}
      hint={
        kind === "expense"
          ? "Отметка «постоянная» — статья считается в долю постоянных издержек"
          : "Направления, по которым в организацию приходят деньги"
      }
      right={
        <Btn tone="primary" onClick={() => setAdding(true)}>
          <Plus size={16} /> Статья
        </Btn>
      }
    >
      {adding && (
        <div className="mb-2 flex gap-2">
          <TextInput
            autoFocus
            value={name}
            placeholder={kind === "income" ? "Например: Доставка" : "Например: Обучение"}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
              if (e.key === "Escape") setAdding(false);
            }}
          />
          <Btn tone="primary" onClick={() => void add()}>
            <Check size={16} />
          </Btn>
          <Btn onClick={() => setAdding(false)}>
            <X size={16} />
          </Btn>
        </div>
      )}

      {list.length === 0 && !adding ? (
        <EmptyHint text="Статей пока нет." />
      ) : (
        <div className="flex flex-col gap-1.5">
          {list.map((c) => {
            const used = entries.filter((e) => e.categoryId === c.id).length;
            return (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white px-3 py-2"
              >
                {editId === c.id ? (
                  <>
                    <TextInput
                      autoFocus
                      value={editName}
                      className="min-w-0 flex-1"
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void rename(c.id);
                        if (e.key === "Escape") setEditId(null);
                      }}
                    />
                    <Btn tone="primary" onClick={() => void rename(c.id)}>
                      <Check size={16} />
                    </Btn>
                    <Btn onClick={() => setEditId(null)}>
                      <X size={16} />
                    </Btn>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
                      {c.name}
                    </span>
                    <span className="text-[11.5px] text-muted-2">
                      {used ? `движений: ${used}` : "пока не использовалась"}
                    </span>
                    {kind === "expense" && (
                      <button
                        type="button"
                        onClick={() => {
                          void update.mutateAsync({ id: c.id, fixed: !c.fixed });
                        }}
                        className={cn(
                          "inline-flex h-9 items-center rounded-full px-3 text-[11.5px] font-semibold transition-colors",
                          c.fixed
                            ? "bg-blue-50 text-blue-700"
                            : "border border-border text-muted-2 hover:text-ink",
                        )}
                        title="Постоянная статья — считается в долю постоянных издержек"
                      >
                        {c.fixed ? "постоянная" : "переменная"}
                      </button>
                    )}
                    <Btn
                      className="h-10 px-3"
                      onClick={() => {
                        setEditId(c.id);
                        setEditName(c.name);
                      }}
                    >
                      <Pencil size={14} />
                    </Btn>
                    <Btn tone="danger" className="h-10 px-3" onClick={() => void drop(c)}>
                      <Trash2 size={14} />
                    </Btn>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
