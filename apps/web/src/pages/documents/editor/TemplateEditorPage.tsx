import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, Save, Trash2, Loader2, PanelRightOpen, PanelRightClose, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import {
  useApiDocumentTemplateByKey,
  useDeleteDocumentTemplate,
  useSaveDocumentTemplate,
  useSystemTemplateDefault,
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
 * Источники начального содержимого (по приоритету):
 *   1. Пользовательский override из БД (если есть)
 *   2. initialFallbackHtml prop
 *   3. Системный шаблон по умолчанию (через API
 *      /document-templates/system-default) — для системных templateKey
 *      типа contract_full / act_return
 *   4. Пустой редактор с подсказкой
 *
 * Layout: справа выезжает sidebar с переменными (поверх редактора, не
 * сжимая его). Кнопка «Переменные» в шапке закрывает/открывает.
 *
 * Auto-save через 1.5 сек после ввода.
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
  // Системный шаблон загружаем всегда для системных templateKey —
  // он нужен и как initial если override нет, и для кнопки «Применить
  // системный» которая позволяет затереть устаревший override актуальным
  // текстом из текущей версии CRM.
  const isSystemKey = ["contract", "contract_full", "act_transfer", "act_return", "act_swap", "purchase_deposit", "damage"].includes(templateKey);
  const systemDefault = useSystemTemplateDefault(
    isSystemKey ? templateKey : null,
  );

  const save = useSaveDocumentTemplate();
  const remove = useDeleteDocumentTemplate();

  const editorRef = useRef<TemplateEditorHandle | null>(null);
  const [bodyHtml, setBodyHtml] = useState<string | null>(null);
  const [savedHtml, setSavedHtml] = useState<string | null>(null);
  const [savingState, setSavingState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Загрузка начального содержимого (override → fallback → system → empty).
  // ВАЖНО: грузим только ОДИН РАЗ. После того как bodyHtml задан, любые
  // последующие изменения existing.data (refetch после mutate, focus
  // refetch React Query, reconnect) НЕ должны перезаписывать локальное
  // состояние — иначе авто-сохранение конфликтует с refetch'ем и
  // пользователь видит как удалённые из шаблона плашки «возвращаются»:
  // удалил пилюлю → onChange → bodyHtml без неё → save timer ждёт 1.5с
  // → за это время refetch вернёт старое значение из БД (с пилюлей)
  // → setBodyHtml(старое) → редактор перезаписывается.
  useEffect(() => {
    if (bodyHtml != null) return;
    if (existing.data) {
      setBodyHtml(existing.data.body);
      setSavedHtml(existing.data.body);
      return;
    }
    if (existing.isFetched && !existing.data) {
      // 1. initialFallbackHtml (если parent передал)
      if (initialFallbackHtml != null) {
        setBodyHtml(initialFallbackHtml);
        setSavedHtml(null);
        return;
      }
      // 2. systemDefault (если системный key и загружено)
      if (systemDefault.data != null) {
        setBodyHtml(systemDefault.data);
        setSavedHtml(null);
        return;
      }
      // 3. Если ещё ждём system default — не делаем пока ничего (loader)
      if (isSystemKey && (systemDefault.isLoading || !systemDefault.isFetched)) {
        return;
      }
      // 4. Совсем пусто — стартовая страница
      setBodyHtml(
        `<p style="color:#666;font-size:11pt">Скопируйте сюда текст реального документа и проставьте переменные через сайдбар. При генерации документа из карточки аренды переменные подставятся автоматически.</p>`,
      );
      setSavedHtml(null);
    }
  }, [
    bodyHtml,
    existing.data,
    existing.isFetched,
    initialFallbackHtml,
    isSystemKey,
    systemDefault.data,
    systemDefault.isFetched,
    systemDefault.isLoading,
  ]);

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
    g.variables.forEach((v) =>
      editorRef.current?.insertVariable(v.key, v.label),
    );
  };

  const onResetToSystem = async () => {
    if (!existing.data) {
      toast.info("Уже системный", "Это шаблон по умолчанию — нечего сбрасывать");
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
            <div className="text-[14px] font-bold text-ink">{templateName}</div>
            <div className="text-[11px] text-muted-2">
              {existing.data
                ? "пользовательская версия"
                : "системный по умолчанию (правки сохранятся как override)"}
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
          {/* «Залить актуальную системную версию в редактор» — затирает
              текущее содержимое редактора свежим системным шаблоном (БЕЗ
              удаления override из БД до auto-save). Полезно когда хочется
              получить актуальную системную версию (например после
              релиза CRM с новыми пунктами) и доправить её под себя. */}
          {isSystemKey && systemDefault.data && (
            <button
              type="button"
              onClick={() => {
                if (
                  !window.confirm(
                    "Заменить текущее содержимое редактора актуальной системной версией? Все правки в редакторе будут потеряны.",
                  )
                )
                  return;
                setBodyHtml(systemDefault.data ?? "");
                toast.success(
                  "Системная версия загружена",
                  "Через 1.5 секунды изменения сохранятся автоматически.",
                );
              }}
              className="inline-flex items-center gap-1.5 rounded-[8px] bg-white px-3 py-1.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-50"
              title="Загрузить в редактор актуальную системную версию шаблона"
            >
              <RotateCcw size={12} /> Залить актуальную системную версию
            </button>
          )}
          {existing.data && (
            <button
              type="button"
              onClick={onResetToSystem}
              className="inline-flex items-center gap-1.5 rounded-[8px] bg-white px-3 py-1.5 text-[12px] font-semibold text-red-600 hover:bg-red-soft"
              title="Полностью удалить мои правки — далее используется системный шаблон без override"
            >
              <Trash2 size={12} /> Удалить мои правки
            </button>
          )}
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-[8px] bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-border"
            title={sidebarOpen ? "Скрыть переменные" : "Показать переменные"}
          >
            {sidebarOpen ? (
              <PanelRightClose size={14} />
            ) : (
              <PanelRightOpen size={14} />
            )}
            Переменные
          </button>
        </div>
      </div>

      {/* Контейнер с двумя зонами: основной редактор слева, drawer справа */}
      <div className="relative flex gap-3">
        <div className="min-w-0 flex-1">
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

        {sidebarOpen && (
          <aside
            className="sticky top-3 hidden h-[calc(100vh-100px)] w-[300px] shrink-0 self-start overflow-y-auto rounded-[12px] border border-border bg-white p-3 shadow-card-sm lg:block"
            aria-label="Переменные"
          >
            <VariablesSidebar
              onInsert={insertVariable}
              onInsertGroup={insertGroup}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
