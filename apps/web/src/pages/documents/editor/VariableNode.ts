import { Node } from "@tiptap/core";

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

  renderHTML({ node }) {
    const attrs = node.attrs as { varKey: string; varLabel: string };
    // В пилюле показываем человеческое название («ФИО арендатора»),
    // а технический ключ хранится только в data-var. Так пользователь
    // не видит формул вроде {{client.passportSeries}} — только понятный
    // русский текст.
    //
    // Атрибуты собираем явно (data-var → data-label → class) вместо
    // mergeAttributes, чтобы порядок был стабильным. Регекс на бекенде
    // (substituteVariables) теперь терпим к любому порядку, но детерми-
    // нированный вывод упрощает любые будущие парсеры/тесты.
    const display = attrs.varLabel?.trim() || attrs.varKey;
    return [
      "span",
      {
        "data-var": attrs.varKey,
        "data-label": attrs.varLabel,
        class: "tpl-var",
      },
      display,
    ];
  },

  // Render как выглядит в редакторе — оставляем как HTML с .tpl-var,
  // CSS делает «пилюлю» (см. editor.css).
});
