import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { useEffect, useRef } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Undo2,
  Redo2,
  Table as TableIcon,
  Trash2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VariableNode } from "./VariableNode";
import { createVariableMention } from "./createVariableMention";
import {
  useApiVariableCatalog,
  type VariableDescriptor,
} from "@/lib/api/document-templates";
import { useMemo } from "react";
import "./editor.css";

export type TemplateEditorHandle = {
  getHtml: () => string;
  insertVariable: (key: string, label: string) => void;
};

/**
 * WYSIWYG-редактор шаблонов документов на Tiptap. Поддерживает:
 *  - заголовки H1/H2, жирный/курсив/подчёркнутый, выравнивание,
 *    списки, таблицы, undo/redo
 *  - кастомный node-type «variable» — переменные-пилюли (drag-and-drop
 *    из sidebar или вставка по клику)
 *  - debounced auto-save через onChange callback
 *
 * Авто-сохранение реализовано в parent компоненте — мы просто отдаём
 * HTML в onChange после каждого изменения.
 */
export function TemplateEditor({
  initialHtml,
  onChange,
  editorRef,
}: {
  initialHtml: string;
  onChange?: (html: string) => void;
  editorRef?: React.MutableRefObject<TemplateEditorHandle | null>;
}) {
  // Каталог переменных нужен для @-меню (mention extension).
  // Получаем синхронно, при первом рендере он ещё может быть пустым —
  // suggestion использует функцию-геттер, которая каждый раз заглядывает
  // в актуальный caталог.
  const catalogQ = useApiVariableCatalog();
  const flatCatalog: VariableDescriptor[] = useMemo(() => {
    const groups = catalogQ.data ?? [];
    return groups.flatMap((g) => g.variables);
  }, [catalogQ.data]);
  const flatCatalogRef = useMemo(
    () => ({ current: flatCatalog }),
    [flatCatalog],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Table.configure({
        resizable: false,
      }),
      TableRow,
      TableHeader,
      TableCell,
      VariableNode,
      createVariableMention(() => flatCatalogRef.current),
    ],
    content: initialHtml || "<p></p>",
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "tpl-editor-content",
      },
    },
  });

  // Если initialHtml меняется (загружен другой шаблон) — обновляем content.
  const lastInitialRef = useRef(initialHtml);
  useEffect(() => {
    if (editor && initialHtml !== lastInitialRef.current) {
      lastInitialRef.current = initialHtml;
      editor.commands.setContent(initialHtml || "<p></p>", { emitUpdate: false });
    }
  }, [editor, initialHtml]);

  // Экспортируем API через ref.
  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = {
      getHtml: () => editor?.getHTML() ?? "",
      insertVariable: (key: string, label: string) => {
        if (!editor) return;
        editor
          .chain()
          .focus()
          .insertContent({
            type: "variable",
            attrs: { varKey: key, varLabel: label },
          })
          .insertContent(" ")
          .run();
      },
    };
  }, [editor, editorRef]);

  if (!editor) {
    return (
      <div className="tpl-editor-wrap">
        <div className="p-4 text-[12px] text-muted-2">Загружаем редактор…</div>
      </div>
    );
  }

  const ToolBtn = ({
    onClick,
    active,
    disabled,
    title,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(active && "is-active")}
    >
      {children}
    </button>
  );

  return (
    <div className="tpl-editor-wrap">
      <div className="tpl-editor-toolbar">
        <ToolBtn
          title="Жирный (Ctrl+B)"
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
        >
          <Bold size={14} />
        </ToolBtn>
        <ToolBtn
          title="Курсив (Ctrl+I)"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
        >
          <Italic size={14} />
        </ToolBtn>
        <ToolBtn
          title="Подчёркнутый (Ctrl+U)"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
        >
          <UnderlineIcon size={14} />
        </ToolBtn>

        <span className="sep" />

        <ToolBtn
          title="Заголовок 1"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          active={editor.isActive("heading", { level: 1 })}
        >
          <Heading1 size={14} />
        </ToolBtn>
        <ToolBtn
          title="Заголовок 2"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          active={editor.isActive("heading", { level: 2 })}
        >
          <Heading2 size={14} />
        </ToolBtn>

        <span className="sep" />

        <ToolBtn
          title="По левому краю"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
        >
          <AlignLeft size={14} />
        </ToolBtn>
        <ToolBtn
          title="По центру"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
        >
          <AlignCenter size={14} />
        </ToolBtn>
        <ToolBtn
          title="По правому краю"
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
        >
          <AlignRight size={14} />
        </ToolBtn>
        <ToolBtn
          title="По ширине"
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          active={editor.isActive({ textAlign: "justify" })}
        >
          <AlignJustify size={14} />
        </ToolBtn>

        <span className="sep" />

        <ToolBtn
          title="Маркированный список"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
        >
          <List size={14} />
        </ToolBtn>
        <ToolBtn
          title="Нумерованный список"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
        >
          <ListOrdered size={14} />
        </ToolBtn>

        <span className="sep" />

        <ToolBtn
          title="Вставить таблицу 3×3"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          <TableIcon size={14} />
        </ToolBtn>
        {editor.isActive("table") && (
          <>
            <ToolBtn
              title="+ строка"
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              <Plus size={12} />
              <span className="ml-0.5 text-[10px]">str</span>
            </ToolBtn>
            <ToolBtn
              title="+ колонка"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              <Plus size={12} />
              <span className="ml-0.5 text-[10px]">col</span>
            </ToolBtn>
            <ToolBtn
              title="Удалить таблицу"
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              <Trash2 size={12} />
            </ToolBtn>
          </>
        )}

        <span className="sep" />

        <ToolBtn
          title="Отменить (Ctrl+Z)"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo2 size={14} />
        </ToolBtn>
        <ToolBtn
          title="Повторить (Ctrl+Y)"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo2 size={14} />
        </ToolBtn>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
