import { Paragraph } from "@tiptap/extension-paragraph";
import { Heading } from "@tiptap/extension-heading";

/**
 * Расширения базовых нод Paragraph и Heading с сохранением атрибутов
 * `class` и `style`. Без них Tiptap при парсинге HTML теряет вёрстку:
 * `<p class="cl"><b>1.1.</b> ...</p>` превращается в простой `<p>` без
 * hanging-indent и с одной пятой стиля.
 *
 * Ставим эти extensions ВЫШЕ StarterKit (или замещаем стандартные ноды),
 * чтобы они применились вместо дефолтных.
 */
type StyleAttrs = { class?: string | null; style?: string | null };

export const ParagraphWithStyle = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("class"),
        renderHTML: (attrs: StyleAttrs) =>
          attrs.class ? { class: attrs.class } : {},
      },
      style: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("style"),
        renderHTML: (attrs: StyleAttrs) =>
          attrs.style ? { style: attrs.style } : {},
      },
    };
  },
});

export const HeadingWithStyle = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("class"),
        renderHTML: (attrs: StyleAttrs) =>
          attrs.class ? { class: attrs.class } : {},
      },
      style: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("style"),
        renderHTML: (attrs: StyleAttrs) =>
          attrs.style ? { style: attrs.style } : {},
      },
    };
  },
});
