import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, Save, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import {
  useApiDocumentTemplateByKey,
  useDeleteDocumentTemplate,
  useSaveDocumentTemplate,
  type VariableDescriptor,
  type VariableGroup,
} from "@/lib/api/document-templates";
import {
  TemplateEditor,
  type TemplateEditorHandle,
} from "./TemplateEditor";
import { VariablesSidebar } from "./VariablesSidebar";

/**
 * Полноэкранная страница редактирования одного шаблона.
 *
 * Загружает существующий пользовательский override (если есть) или
 * системный default (берём через initialFallbackHtml).
 * При изменениях — debounced auto-save (1.5 сек после последнего ввода).
 */
export function TemplateEditorPage({
  templateKey,
  templateName,
  initialFallbackHtml,
  onBack,
}: {
  templateKey: string;
  templateName: string;
  /** Если в БД нет override — стартуем с этого HTML (системный шаблон). */
  initialFallbackHtml?: string;
  onBack: () => void;
}) {
  const existing = useApiDocumentTemplateByKey(templateKey);
  const save = useSaveDocumentTemplate();
  const remove = useDeleteDocumentTemplate();

  const editorRef = useRef<TemplateEditorHandle | null>(null);
  const [bodyHtml, setBodyHtml] = useState<string | null>(null);
  const [savedHtml, setSavedHtml] = useState<string | null>(null);
  const [savingState, setSavingState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  // Загрузка начального содержимого: либо override из БД, либо fallback.
  useEffect(() => {
    if (existing.data) {
      setBodyHtml(existing.data.body);
      setSavedHtml(existing.data.body);
    } else if (
      existing.isFetched &&
      !existing.data &&
      initialFallbackHtml != null
    ) {
      setBodyHtml(initialFallbackHtml);
      setSavedHtml(null); // ещё не сохранено — это default
    }
  }, [existing.data, existing.isFetched, initialFallbackHtml]);

  // Debounced auto-save.
  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (bodyHtml == null) return;
    if (bodyHtml === savedHtml) return;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    setSavingState("saving");
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await save.mutateAsync({
          templateKey,
          kind: "override",
          name: templateName,
          body: bodyHtml,
        });
        setSavedHtml(bodyHtml);
        setSavingState("saved");
        // Через 1.5с скрываем «Сохранено».
        window.setTimeout(() => setSavingState("idle"), 1500);
      } catch (e) {
        setSavingState("error");
        toast.error("Не удалось сохранить", (e as Error).message ?? "");
      }
    }, 1500);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyHtml]);

  const insertVariable = (v: VariableDescriptor) => {
    editorRef.current?.insertVariable(v.key, v.label);
  };

  const insertGroup = (g: VariableGroup) => {
    if (!editorRef.current) return;
    // Вставляем все переменные группы в одну строку через запятую как
    // быстрый старт для блока реквизитов. Пользователь потом сам
    // отредактирует разделители.
    g.variables.forEach((v, i) => {
      editorRef.current!.insertVariable(v.key, v.label);
      if (i < g.variables.length - 1) {
        // Разделитель между переменными — запятая с пробелом.
        // Реализуется через прямой DOM, но проще через отдельный
        // insertVariable + ничего особенного. Tiptap сам поставит пробел.
      }
    });
  };

  const onResetToSystem = async () => {
    if (!existing.data) {
      toast.info(
        "Уже системный",
        "Это шаблон по умолчанию — нечего сбрасывать",
      );
      return;
    }
    if (
      !window.confirm(
        "Удалить пользовательский шаблон и вернуть системный? Все правки будут потеряны.",
      )
    )
      return;
    try {
      await remove.mutateAsync(existing.data.id);
      toast.success("Сброшено", "Используется системный шаблон");
      onBack();
    } catch (e) {
      toast.error("Не удалось сбросить", (e as Error).message ?? "");
    }
  };

  const previewUrl = (() => {
    // Превью пользовательского шаблона делаем через тот же endpoint
    // что и обычный документ — он сам подхватит override при следующем
    // открытии. Но открыть превью можно только если в БД есть запись —
    // иначе показываем системный.
    return null;
  });
  void previewUrl;

  if (existing.isLoading || bodyHtml == null) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-muted-2">
        <Loader2 size={16} className="animate-spin" /> Загружаем шаблон…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-border bg-surface-soft px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-[8px] bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-border"
          >
            <ArrowLeft size={14} /> Назад
          </button>
          <div>
            <div className="text-[14px] font-bold text-ink">
              {templateName}
            </div>
            <div className="text-[11px] text-muted-2">
              {existing.data ? "пользовательская версия" : "системный по умолчанию"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "tpl-saving-indicator",
              savingState === "saving" && "saving",
              savingState === "saved" && "saved",
            )}
          >
            {savingState === "saving" && (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> Сохраняем…
              </span>
            )}
            {savingState === "saved" && (
              <span className="inline-flex items-center gap-1">
                <Save size={11} /> Сохранено
              </span>
            )}
            {savingState === "error" && (
              <span className="text-red-600">Ошибка</span>
            )}
          </span>
          {existing.data && (
            <button
              type="button"
              onClick={onResetToSystem}
              className="inline-flex items-center gap-1.5 rounded-[8px] bg-white px-3 py-1.5 text-[12px] font-semibold text-red-600 hover:bg-red-soft"
              title="Удалить пользовательский шаблон"
            >
              <Trash2 size={12} /> Сбросить к системному
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
        <div className="lg:max-h-[80vh] lg:overflow-y-auto">
          <VariablesSidebar
            onInsert={insertVariable}
            onInsertGroup={insertGroup}
          />
        </div>
        <div>
          <TemplateEditor
            initialHtml={bodyHtml}
            onChange={setBodyHtml}
            editorRef={editorRef}
          />
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-2">
            <Eye size={11} />
            <span>
              Проверить как выглядит документ можно из карточки аренды → таб
              «Документы → Открыть документ». Подстановка переменных
              произойдёт автоматически.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
