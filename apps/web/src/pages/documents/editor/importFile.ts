import mammoth from "mammoth";
import { marked } from "marked";

/**
 * Конвертирует загруженный пользователем файл в HTML, пригодный для
 * вставки в Tiptap-редактор шаблонов.
 *
 * Поддерживаются:
 *  - .docx (Microsoft Word) — через mammoth.js, выдаёт чистый HTML без
 *    стилей Word
 *  - .md / .markdown — через marked
 *  - .html / .htm — берём как есть, оборачиваем в обёртку если надо
 *  - .txt — paragraph по \n\n
 *
 * Возвращает HTML-строку. Бросает Error с понятным русским описанием
 * при невозможности конвертации.
 */
export async function importFileToHtml(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".docx")) {
    const arrayBuffer = await file.arrayBuffer();
    try {
      const result = await mammoth.convertToHtml({ arrayBuffer });
      return result.value || "<p>Документ пустой.</p>";
    } catch (e) {
      throw new Error(
        `Не удалось прочитать .docx: ${(e as Error).message ?? ""}`,
      );
    }
  }

  if (name.endsWith(".md") || name.endsWith(".markdown")) {
    const text = await file.text();
    const html = await marked.parse(text, { gfm: true, breaks: false });
    return typeof html === "string" ? html : String(html);
  }

  if (name.endsWith(".html") || name.endsWith(".htm")) {
    const text = await file.text();
    // Извлекаем body если это полная страница, иначе берём как есть.
    const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return bodyMatch ? bodyMatch[1]! : text;
  }

  if (name.endsWith(".txt")) {
    const text = await file.text();
    return text
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
      .join("");
  }

  // Старый .doc (binary Word) — не поддерживается mammoth.
  if (name.endsWith(".doc")) {
    throw new Error(
      'Старый формат .doc не поддерживается. Сохраните файл как .docx или .md и попробуйте снова.',
    );
  }

  throw new Error(
    `Неизвестный формат файла «${file.name}». Поддерживаются: .docx, .md, .html, .txt`,
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
