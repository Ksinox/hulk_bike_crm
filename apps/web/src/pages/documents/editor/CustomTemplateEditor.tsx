import { useRef, useState } from "react";
import { Save, Loader2 } from "lucide-react";
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
 * Редактор пользовательских (custom) шаблонов. Принимает либо id
 * существующего шаблона, либо initialHtmlForNew для нового.
 *
 * Системные шаблоны (договор, акт возврата, акт ущерба) редактируются
 * через TemplateEditorPage из карточек таба «Шаблоны документов».
 */
export function CustomTemplateEditor({
  existingId,
  initialHtmlForNew,
  onBack,
}: {
  existingId: number | null;
  initialHtmlForNew?: string;
  onBack: () => void;
}) {
  const all = useApiDocumentTemplates();
  const customs = (all.data ?? []).filter((t) => t.kind === "custom");
  const existing = existingId
    ? customs.find((t) => t.id === existingId) ?? null
    : null;

  if (all.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-muted-2">
        <Loader2 size={14} className="animate-spin" /> Загружаем…
      </div>
    );
  }

  return (
    <CustomEditor
      key={String(existingId ?? "new")}
      existing={existing}
      initialHtmlForNew={initialHtmlForNew}
      onBack={onBack}
    />
  );
}

function CustomEditor({
  existing,
  initialHtmlForNew,
  onBack,
}: {
  existing: ApiDocumentTemplate | null;
  initialHtmlForNew?: string;
  onBack: () => void;
}) {
  const editorRef = useRef<TemplateEditorHandle | null>(null);
  const [name, setName] = useState(existing?.name ?? "Новый документ");
  const [body, setBody] = useState(
    existing?.body ?? initialHtmlForNew ?? "<p></p>",
  );
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
