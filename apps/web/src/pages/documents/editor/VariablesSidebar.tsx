import { useState } from "react";
import { ChevronDown, ChevronRight, GripVertical, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useApiVariableCatalog,
  type VariableDescriptor,
  type VariableGroup,
} from "@/lib/api/document-templates";

/**
 * Левая панель с каталогом переменных. По клику на переменную — она
 * вставляется в редактор. Drag-and-drop работает: тянешь переменную
 * в редактор, она вставляется в позицию drop.
 *
 * Кнопка «вставить всю группу» — собирает все переменные группы в одну
 * текстовую сборку (например для блока реквизитов клиента).
 */
export function VariablesSidebar({
  onInsert,
  onInsertGroup,
}: {
  onInsert: (v: VariableDescriptor) => void;
  onInsertGroup?: (g: VariableGroup) => void;
}) {
  const { data: groups = [], isLoading } = useApiVariableCatalog();
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(["client", "rental"]),
  );
  const [search, setSearch] = useState("");

  const toggleGroup = (id: string) =>
    setOpenGroups((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-muted-2">
        <Loader2 size={14} className="animate-spin" /> Каталог переменных…
      </div>
    );
  }

  const filteredGroups = search.trim()
    ? groups
        .map((g) => ({
          ...g,
          variables: g.variables.filter(
            (v) =>
              v.label.toLowerCase().includes(search.toLowerCase()) ||
              v.key.toLowerCase().includes(search.toLowerCase()),
          ),
        }))
        .filter((g) => g.variables.length > 0)
    : groups;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск переменной..."
          className="h-8 w-full rounded-[8px] border border-border bg-white px-2 text-[12px] outline-none focus:border-blue-600"
        />
      </div>

      <div className="rounded-[10px] bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
        💡 Перетащи переменную в текст или просто кликни — она вставится в
        позицию курсора. Переменные подставляются автоматически при
        генерации документа.
      </div>

      <div className="tpl-vars-sidebar">
        {filteredGroups.map((g) => {
          const isOpen = openGroups.has(g.id) || !!search.trim();
          return (
            <div key={g.id} className="tpl-vars-group">
              <button
                type="button"
                className="tpl-vars-group-header"
                onClick={() => toggleGroup(g.id)}
              >
                <div className="flex items-center gap-1.5">
                  {isOpen ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRight size={12} />
                  )}
                  <span className="text-[12px] font-bold text-ink">
                    {g.label}
                  </span>
                  <span className="text-[10px] text-muted-2">
                    ({g.variables.length})
                  </span>
                </div>
                {onInsertGroup && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onInsertGroup(g);
                    }}
                    className="rounded-[6px] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
                    title="Вставить всю группу как блок"
                  >
                    + всё
                  </span>
                )}
              </button>
              {isOpen && (
                <div className="tpl-vars-group-list">
                  {g.variables.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      className="tpl-var-item"
                      draggable
                      onClick={() => onInsert(v)}
                      onDragStart={(e) => {
                        // Передаём данные переменной через DataTransfer.
                        // Tiptap parseHTML спарсит <span data-var=...>
                        // в наш VariableNode. Текст {{key}} — fallback
                        // если drop в обычное textarea.
                        const html = `<span data-var="${escape(v.key)}" data-label="${escape(v.label)}" class="tpl-var">{{${v.key}}}</span>`;
                        e.dataTransfer.setData("text/html", html);
                        e.dataTransfer.setData("text/plain", `{{${v.key}}}`);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      title={`Вставить в редактор: ${v.label}`}
                    >
                      <GripVertical
                        size={10}
                        className="shrink-0 text-muted-2"
                      />
                      <span className={cn("flex-1")}>{v.label}</span>
                      <span className="key">{v.key}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
