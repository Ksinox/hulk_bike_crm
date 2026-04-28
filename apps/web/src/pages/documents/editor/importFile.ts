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
      // styleMap расширяет стандартный набор сопоставлений Word-стилей
      // → HTML тегам. Включаем всё что обычно встречается в договорах:
      // заголовки, выделения, списки, таблицы.
      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        {
          styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
            "p[style-name='Title'] => h1.title:fresh",
            "p[style-name='Subtitle'] => h2.subtitle:fresh",
            "r[style-name='Strong'] => strong",
            "r[style-name='Emphasis'] => em",
            "p[style-name='Quote'] => blockquote:fresh",
            "p[style-name='Intense Quote'] => blockquote:fresh",
            "p[style-name='List Paragraph'] => p.list-paragraph",
            "b => strong",
            "i => em",
            "u => u",
          ],
          // Включаем все картинки как base64 — пусть пользователь решит
          // оставить или удалить. Без этого они теряются.
          convertImage: mammoth.images.imgElement(async (image) => {
            const buffer = await image.read("base64");
            return { src: `data:${image.contentType};base64,${buffer}` };
          }),
        },
      );
      return result.value || "<p>Документ пустой.</p>";
    } catch (e) {
      throw new Error(
        `Не удалось прочитать .docx: ${(e as Error).message ?? ""}`,
      );
    }
  }

  if (name.endsWith(".md") || name.endsWith(".markdown")) {
    const text = await file.text();
    // breaks: true — одиночные \n становятся <br> (важно для документов
    //   которые экспортируются из Word/Google Docs в MD без двойных
    //   переносов между абзацами).
    // gfm: true — таблицы и расширенный синтаксис.
    const html = await marked.parse(text, {
      gfm: true,
      breaks: true,
    });
    const result = typeof html === "string" ? html : String(html);
    // Если в исходнике markdown-синтаксиса (#, *, и т.д.) фактически
    // НЕ БЫЛО — marked отдаст один большой <p> с <br> внутри. Это
    // нормально, но плохо читаемо в редакторе. Пытаемся улучшить:
    // короткие строки без точки в конце — вероятно заголовки разделов
    // (например «Претензия (Досудебная)») — оборачиваем в h2.
    return enhancePlainParagraphs(result);
  }

  if (name.endsWith(".html") || name.endsWith(".htm")) {
    const text = await file.text();
    // Извлекаем body если это полная страница, иначе берём как есть.
    const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return bodyMatch ? bodyMatch[1]! : text;
  }

  if (name.endsWith(".txt")) {
    const text = await file.text();
    // \n\n → разные параграфы; одиночные \n внутри параграфа → <br>.
    return text
      .split(/\n{2,}/)
      .filter((p) => p.trim().length > 0)
      .map((p) => {
        const lines = p.split("\n").map((l) => escapeHtml(l));
        return `<p>${lines.join("<br>")}</p>`;
      })
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

/**
 * Эвристика: если markdown был просто плоским текстом без разметки,
 * marked завернёт всё в один <p>. Это плохо читается. Разбиваем такие
 * параграфы на множество абзацев по <br><br> и пробуем угадать
 * заголовки (короткие строки без точки в конце).
 */
function enhancePlainParagraphs(html: string): string {
  // Если уже есть структурные теги — оставляем как есть.
  if (/<(h[1-6]|ul|ol|table|blockquote)\b/i.test(html)) {
    return html;
  }
  // Один большой параграф с <br> внутри — разбиваем на абзацы
  // по двойному <br>, и каждую короткую «заголовочную» строку
  // оборачиваем в h2.
  const isHeadingCandidate = (line: string) => {
    const t = line.trim().replace(/<\/?[^>]+>/g, "");
    if (!t) return false;
    if (t.length > 90) return false;
    if (/[.…!?]$/.test(t)) return false;
    if (/^\d+[\.\)]/.test(t)) return false; // нумерованные списки оставляем как есть
    return true;
  };

  // Заменяем последовательности <br>+ на разделители абзацев.
  const blocks = html
    .replace(/<p>|<\/p>/g, "")
    .split(/<br\s*\/?>\s*<br\s*\/?>/i)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  if (blocks.length <= 1) {
    // Нет двойных переносов — пытаемся разбить по одинарным <br>:
    // короткие линии-кандидаты на заголовок выделяем, остальные —
    // соседние линии — собираем в один параграф.
    const lines = html
      .replace(/<p>|<\/p>/g, "")
      .split(/<br\s*\/?>/i)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const out: string[] = [];
    let buf: string[] = [];
    const flush = () => {
      if (buf.length > 0) {
        out.push(`<p>${buf.join(" ")}</p>`);
        buf = [];
      }
    };
    for (const line of lines) {
      if (isHeadingCandidate(line)) {
        flush();
        out.push(`<h2>${line}</h2>`);
      } else {
        buf.push(line);
      }
    }
    flush();
    return out.join("\n");
  }

  return blocks
    .map((b) => {
      // Если блок — одна короткая строка-кандидат, делаем h2.
      const lines = b.split(/<br\s*\/?>/i).map((l) => l.trim()).filter(Boolean);
      if (lines.length === 1 && isHeadingCandidate(lines[0]!)) {
        return `<h2>${lines[0]}</h2>`;
      }
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("\n");
}
