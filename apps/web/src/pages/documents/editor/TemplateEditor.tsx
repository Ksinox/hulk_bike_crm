import { useEditor, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { useEffect, useRef, useState } from "react";
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
import { ParagraphWithStyle, HeadingWithStyle } from "./extensions";
import { createVariableMention } from "./createVariableMention";
import {
  useApiVariableCatalog,
  type VariableDescriptor,
} from "@/lib/api/document-templates";
import "./editor.css";

/**
 * Tab внутри редактора шаблонов открывает то же `@`-меню переменных —
 * чтобы пользователю не нужно было набирать собачку руками.
 *
 * Реализовано как программный `@`-триггер: вставляем символ `@` в текущую
 * позицию курсора, Mention extension сам подхватывает его и поднимает
 * popup. При выборе пункта Mention.command удаляет диапазон от `@` до
 * курсора и подставляет VariableNode, поэтому `@` в тексте не остаётся.
 *
 * Внутри таблицы Tab сохраняет штатное поведение (переход между
 * ячейками) — наш handler возвращает false, событие проваливается дальше
 * к табличному расширению.
 */
const VariableTabTrigger = Extension.create({
  name: "variableTabTrigger",
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (editor.isActive("table")) return false;
        return editor.chain().focus().insertContent("@").run();
      },
    };
  },
});

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
  // Каталог переменных нужен для @-меню (mention extension). Грузится
  // асинхронно через React Query, на первом рендере пуст — поэтому
  // используем настоящий useRef со стабильной ссылкой и обновляем
  // его .current в useEffect когда данные приходят. Замыкание в
  // createVariableMention видит этот же объект и читает актуальный
  // массив на каждом вызове items().
  //
  // ВАЖНО: useEditor.extensions фиксируется один раз при монтировании
  // (Tiptap не пересоздаёт расширения при изменении props), так что
  // обычный useMemo({ current: flatCatalog }, [flatCatalog]) тут не
  // работал — extension всегда видел исходный объект с пустым current.
  const catalogQ = useApiVariableCatalog();
  const flatCatalogRef = useRef<VariableDescriptor[]>([]);
  useEffect(() => {
    const groups = catalogQ.data ?? [];
    flatCatalogRef.current = groups.flatMap((g) => g.variables);
  }, [catalogQ.data]);

  // Tick для принудительного ре-рендера toolbar при изменении выделения
  // или transaction'а — иначе editor.isActive(...) показывает stale state.
  const [, forceRerender] = useState(0);

  const editor = useEditor({
    onSelectionUpdate: () => forceRerender((t) => t + 1),
    onTransaction: () => forceRerender((t) => t + 1),
    extensions: [
      // Отключаем стандартные heading и paragraph в StarterKit и
      // заменяем на наши расширенные версии (с сохранением class/style).
      StarterKit.configure({
        heading: false,
        paragraph: false,
      }),
      ParagraphWithStyle,
      HeadingWithStyle.configure({ levels: [1, 2, 3] }),
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
      VariableTabTrigger,
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

  // Когда parent передаёт ДРУГОЙ initialHtml (другой шаблон) — заменяем
  // содержимое редактора. НО: parent тоже получает onChange с текущим
  // HTML из редактора и кладёт его в bodyHtml, что приводит к новому
  // initialHtml → бесконечный круг + сброс курсора.
  // Поэтому сравниваем не только с lastInitialRef, но и с текущим
  // editor.getHTML() — если они совпадают, ничего не делаем (значит это
  // эхо нашего же onChange).
  const lastInitialRef = useRef(initialHtml);
  useEffect(() => {
    if (!editor) return;
    if (initialHtml === lastInitialRef.current) return;
    if (initialHtml === editor.getHTML()) {
      // Это просто эхо нашего onChange — обновляем ref, но содержимое
      // уже соответствует prop'у и трогать редактор не надо.
      lastInitialRef.current = initialHtml;
      return;
    }
    lastInitialRef.current = initialHtml;
    editor.commands.setContent(initialHtml || "<p></p>", { emitUpdate: false });
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
