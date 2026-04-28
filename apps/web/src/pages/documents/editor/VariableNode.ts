import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Tiptap node для переменной — отображается в редакторе как «пилюля»
 * с человеческим названием, в HTML сериализуется как:
 *   <span data-var="client.name" class="tpl-var">{{client.name}}</span>
 *
 * Сервер при рендере документа находит эти span'ы и подставляет
 * реальные значения. Drag-and-drop поддерживается через draggable: true.
 */
export const VariableNode = Node.create({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      varKey: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-var"),
        renderHTML: (attrs) => ({
          "data-var": attrs.varKey,
        }),
      },
      varLabel: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") ?? "",
        renderHTML: (attrs) => ({
          "data-label": attrs.varLabel,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-var]",
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const key = (node.attrs as { varKey: string }).varKey;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "tpl-var",
      }),
      `{{${key}}}`,
    ];
  },

  // Render как выглядит в редакторе — оставляем как HTML с .tpl-var,
  // CSS делает «пилюлю» (см. editor.css).
});
