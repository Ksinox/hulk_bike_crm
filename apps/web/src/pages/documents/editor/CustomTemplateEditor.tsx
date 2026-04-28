import { useRef, useState } from "react";
import { Save, Plus, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  useApiDocumentTemplates,
  useDeleteDocumentTemplate,
  useSaveDocumentTemplate,
  type ApiDocumentTemplate,
  type VariableDescriptor,
  type VariableGroup,
} from "@/lib/api/document-templates";
import { TemplateEditor, type TemplateEditorHandle } from "./TemplateEditor";
import { VariablesSidebar } from "./VariablesSidebar";

/**
 * Таб «Редактор шаблонов» — для создания пользовательских шаблонов
 * с нуля. Чистый редактор + сайдбар переменных + сохранение под
 * собственным именем (kind='custom').
 *
 * Системные шаблоны (договор, акт возврата) редактируются из таба
 * «Шаблоны документов» — там у каждой карточки своя кнопка «Редактировать».
 */
export function CustomTemplateEditor() {
  const all = useApiDocumentTemplates();
  const customs = (all.data ?? []).filter((t) => t.kind === "custom");

  const [activeId, setActiveId] = useState<number | "new" | null>(null);

  if (activeId === null) {
    // Стартовый экран — список существующих custom-шаблонов + кнопка
    // «Создать новый шаблон». Если нет ни одного — сразу пустое состояние
    // с большой кнопкой создания.
    return (
      <CustomList
        items={customs}
        onCreate={() => setActiveId("new")}
        onOpen={(id) => setActiveId(id)}
        loading={all.isLoading}
      />
    );
  }

  // Редактор активен — открыт пустой (для new) или загружен существующий.
  return (
    <CustomEditor
      key={String(activeId)}
      existing={
        activeId === "new"
          ? null
          : customs.find((t) => t.id === activeId) ?? null
      }
      onBack={() => setActiveId(null)}
    />
  );
}

function CustomList({
  items,
  onCreate,
  onOpen,
  loading,
}: {
  items: ApiDocumentTemplate[];
  onCreate: () => void;
  onOpen: (id: number) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-muted-2">
        <Loader2 size={14} className="animate-spin" /> Загружаем список…
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[10px] bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
        Здесь создаются <b>новые</b> пользовательские шаблоны с нуля.
        Можно скопировать текст реального документа и проставить
        переменные через сайдбар. Чтобы редактировать существующие
        системные шаблоны (договор, акт возврата) — пользуйся вкладкой{" "}
        <b>«Шаблоны документов»</b> → кнопка «Редактировать» на нужной
        карточке.
      </div>

      <button
        type="button"
        onClick={onCreate}
        className="inline-flex w-fit items-center gap-2 rounded-[10px] bg-ink px-4 py-2 text-[13px] font-bold text-white hover:bg-blue-600"
      >
        <Plus size={14} /> Создать новый шаблон
      </button>

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
            Мои шаблоны ({items.length})
          </div>
          <div className="flex flex-col divide-y divide-border rounded-[12px] border border-border bg-surface">
            {items.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpen(t.id)}
                className="flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-soft"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold text-ink">
                    {t.name}
                  </div>
                  <div className="text-[11px] text-muted-2">
                    обновлён{" "}
                    {new Date(t.updatedAt).toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-blue-700">
                  Редактировать →
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomEditor({
  existing,
  onBack,
}: {
  existing: ApiDocumentTemplate | null;
  onBack: () => void;
}) {
  const editorRef = useRef<TemplateEditorHandle | null>(null);
  const [name, setName] = useState(existing?.name ?? "Новый шаблон");
  const [body, setBody] = useState(existing?.body ?? "<p></p>");
  const save = useSaveDocumentTemplate();
  const remove = useDeleteDocumentTemplate();
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const insertVariable = (v: VariableDescriptor) =>
    editorRef.current?.insertVariable(v.key, v.label);

  const insertGroup = (g: VariableGroup) =>
    g.variables.forEach((v) =>
      editorRef.current?.insertVariable(v.key, v.label),
    );

  const onSave = async () => {
    if (!name.trim()) {
      toast.error("Назовите шаблон", "Введите название в поле сверху");
      return;
    }
    try {
      const templateKey = existing
        ? existing.templateKey
        : `custom-${Date.now()}`;
      await save.mutateAsync({
        templateKey,
        kind: "custom",
        name: name.trim(),
        body,
      });
      setSavedAt(new Date());
      toast.success("Шаблон сохранён", `«${name.trim()}»`);
    } catch (e) {
      toast.error("Не удалось сохранить", (e as Error).message ?? "");
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    if (!window.confirm(`Удалить шаблон «${existing.name}»? Это необратимо.`))
      return;
    try {
      await remove.mutateAsync(existing.id);
      toast.success("Шаблон удалён");
      onBack();
    } catch (e) {
      toast.error("Не удалось удалить", (e as Error).message ?? "");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-border bg-surface-soft px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-[8px] bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-border"
          >
            ← Назад к списку
          </button>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название шаблона"
            className="h-9 min-w-[260px] rounded-[8px] border border-border bg-white px-3 text-[14px] font-semibold text-ink outline-none focus:border-blue-600"
          />
        </div>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="text-[11px] text-green-600">
              Сохранено{" "}
              {savedAt.toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          )}
          {existing && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-[8px] bg-white px-3 py-1.5 text-[12px] font-semibold text-red-600 hover:bg-red-soft"
            >
              Удалить
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={save.isPending}
            className="inline-flex items-center gap-1.5 rounded-[8px] bg-ink px-4 py-1.5 text-[13px] font-bold text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {save.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Save size={12} />
            )}{" "}
            Сохранить
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
        <div className="lg:max-h-[80vh] lg:overflow-y-auto">
          <VariablesSidebar
            onInsert={insertVariable}
            onInsertGroup={insertGroup}
          />
        </div>
        <TemplateEditor
          initialHtml={body}
          onChange={setBody}
          editorRef={editorRef}
        />
      </div>
    </div>
  );
}
