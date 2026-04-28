import Mention from "@tiptap/extension-mention";
import type { Editor } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import type { VariableDescriptor } from "@/lib/api/document-templates";
import { MentionList, type MentionListHandle } from "./MentionList";

/**
 * Создаёт Tiptap-расширение Mention настроенное на наши переменные.
 * Триггер — символ «@». При выборе вставляет VariableNode (а не
 * стандартный mention-span), чтобы переменные были одного типа.
 */
export function createVariableMention(getCatalog: () => VariableDescriptor[]) {
  return Mention.extend({
    name: "variableMention",
  }).configure({
    HTMLAttributes: {
      class: "tpl-var",
    },
    suggestion: {
      char: "@",
      // Всё что было после @ — фильтр по label/key.
      items: ({ query }) => {
        const all = getCatalog();
        const q = query.trim().toLowerCase();
        if (!q) return all.slice(0, 30);
        return all
          .filter(
            (v) =>
              v.label.toLowerCase().includes(q) ||
              v.key.toLowerCase().includes(q),
          )
          .slice(0, 30);
      },
      // При выборе пункта вставляем НАШ VariableNode вместо встроенного
      // mention. Так пилюля имеет одинаковый CSS класс/data-атрибуты
      // и правильно сериализуется/десериализуется.
      command: ({ editor, range, props }) => {
        const item = props as unknown as VariableDescriptor;
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: "variable",
            attrs: { varKey: item.key, varLabel: item.label },
          })
          .insertContent(" ")
          .run();
      },
      render: () => {
        let component: ReactRenderer<MentionListHandle> | null = null;
        let popup: HTMLDivElement | null = null;

        return {
          onStart: (props: {
            editor: Editor;
            clientRect?: (() => DOMRect | null) | null;
            items: VariableDescriptor[];
            command: (item: { id: string; label: string }) => void;
          }) => {
            component = new ReactRenderer(MentionList, {
              props,
              editor: props.editor,
            });
            popup = document.createElement("div");
            popup.style.position = "absolute";
            popup.style.zIndex = "1000";
            popup.appendChild(component.element);
            document.body.appendChild(popup);
            positionPopup(popup, props.clientRect);
          },
          onUpdate(props: {
            clientRect?: (() => DOMRect | null) | null;
            items: VariableDescriptor[];
          }) {
            component?.updateProps(props);
            if (popup) positionPopup(popup, props.clientRect);
          },
          onKeyDown(props: { event: KeyboardEvent }) {
            if (props.event.key === "Escape") {
              if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
              component?.destroy();
              return true;
            }
            return component?.ref?.onKeyDown(props.event) ?? false;
          },
          onExit() {
            if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
            component?.destroy();
          },
        };
      },
    },
  });
}

function positionPopup(
  popup: HTMLDivElement,
  clientRect?: (() => DOMRect | null) | null,
) {
  if (!clientRect) return;
  const rect = clientRect();
  if (!rect) return;
  // Позиционируем popup чуть ниже курсора (page-level, с учётом scroll).
  const top = rect.bottom + window.scrollY + 4;
  const left = rect.left + window.scrollX;
  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
}
