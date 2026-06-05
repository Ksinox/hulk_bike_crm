import { pickAction, promptDialog } from "@/lib/toast";

/**
 * Диалог выбора причины переноса скутера в архив.
 * Общий для десктопа и мобилки (паритет): быстрые варианты + «своё».
 * Возвращает текст причины или null, если пользователь отменил.
 */
export async function askArchiveReason(scooterName: string): Promise<string | null> {
  const choice = await pickAction({
    title: `Перенести «${scooterName}» в архив?`,
    message:
      "Скутер пропадёт из основного списка. История аренд сохранится, восстановить можно в любой момент. Укажите причину.",
    options: [
      { id: "sold", label: "Продан" },
      { id: "scrapped", label: "Списан / утиль" },
      { id: "crashed", label: "Разбит после ДТП" },
      { id: "duplicate", label: "Дубль карточки" },
      { id: "other", label: "Другая причина…" },
    ],
    cancelText: "Отмена",
  });
  if (!choice) return null;

  if (choice === "other") {
    const custom = await promptDialog({
      title: "Причина переноса в архив",
      placeholder: "Например: продан клиенту #42, забрали на запчасти…",
      multiline: true,
      confirmText: "В архив",
      cancelText: "Назад",
    });
    return custom ?? null;
  }

  const labels: Record<string, string> = {
    sold: "Продан",
    scrapped: "Списан / утиль",
    crashed: "Разбит после ДТП",
    duplicate: "Дубль карточки",
  };
  return labels[choice] ?? choice;
}
