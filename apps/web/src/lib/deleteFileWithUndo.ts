import { confirmDialog, toast } from "@/lib/toast";

/**
 * Безопасное удаление файла/аватарки: подтверждение → оптимистично убрать из
 * UI → тост «Отменить» → если окно отмены прошло, РЕАЛЬНО удалить с сервера.
 *
 * Зачем: файлы грузятся на сервер сразу (eager upload), поэтому крестик должен
 * удалять и с сервера — но не мгновенно и не молча. Сначала спрашиваем, затем
 * даём окно отката (как у остальных действий), и только потом коммитим
 * удаление объекта из хранилища, чтобы не занимать место.
 *
 * Если вкладку закрыли до конца окна отмены — коммит не случится, файл просто
 * останется на сервере (безопасно: ничего не потеряли, удаление можно повторить).
 *
 * Использование:
 *   deleteFileWithUndo({
 *     what: "фото",
 *     onRemove: () => setItems((l) => l.filter((x) => x.id !== id)),
 *     onRestore: () => setItems((l) => insertBack(l, item)),
 *     onCommit: () => deleteMutation.mutateAsync(id),
 *   });
 */
export async function deleteFileWithUndo(opts: {
  /** Что удаляем — для текстов: «фото», «скан паспорта», «видео». */
  what?: string;
  /** Переопределить заголовок модалки подтверждения целиком. */
  confirmTitle?: string;
  confirmMessage?: string;
  /** Убрать из UI (оптимистично, сразу после подтверждения). */
  onRemove: () => void;
  /** Вернуть в UI (при нажатии «Отменить»). */
  onRestore: () => void;
  /** Реальное удаление с сервера — вызывается, КОГДА окно отмены прошло. */
  onCommit: () => void | Promise<void>;
  /** Окно отмены = ttl тоста, мс (по умолчанию 10 000). */
  ttl?: number;
}): Promise<void> {
  const what = opts.what ?? "файл";
  const ok = await confirmDialog({
    title: opts.confirmTitle ?? `Удалить ${what}?`,
    message:
      opts.confirmMessage ??
      `${cap(what)} будет удалён с сервера. После удаления есть несколько секунд, чтобы отменить.`,
    confirmText: "Удалить",
    cancelText: "Отмена",
    danger: true,
  });
  if (!ok) return;

  opts.onRemove();
  // Коммит (реальное удаление) привязан к onExpire тоста — он срабатывает на
  // фактическом закрытии (учитывает паузу таймера на hover), а «Отменить»
  // его не вызывает. Так не будет рассинхрона «UI вернул, а сервер удалил».
  toast.action({
    kind: "success",
    title: `${cap(what)} удалён`,
    message: "Нажмите «Отменить», чтобы вернуть.",
    actionLabel: "Отменить",
    ttl: opts.ttl ?? 10000,
    onAction: () => opts.onRestore(),
    onExpire: () => void opts.onCommit(),
  });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
