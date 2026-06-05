import { pickAction, promptDialog } from "@/lib/toast";

/**
 * Диалог выбора причины удаления аренды в архив.
 * Заказчик: случайно созданную аренду можно удалить с пометкой «Создано
 * случайно», чтобы в архиве было видно почему связку убрали. Быстрые варианты
 * + «своё». Возвращает текст причины или null, если оператор отменил.
 *
 * Сам выбор причины здесь = подтверждение удаления (отдельный confirm не нужен):
 * выбрал причину → удаляем; «Отмена»/закрыл → ничего не делаем.
 */
export async function askRentalDeleteReason(
  rentalNo: string,
): Promise<string | null> {
  const choice = await pickAction({
    title: `Удалить аренду ${rentalNo}?`,
    message:
      "Аренда уйдёт в архив — история клиента и платежи сохранятся, восстановить можно из архива на этой же странице. Укажите причину.",
    options: [
      { id: "accidental", label: "Создано случайно" },
      { id: "test", label: "Тестовая аренда" },
      { id: "duplicate", label: "Дубль" },
      { id: "client_declined", label: "Клиент передумал" },
      { id: "other", label: "Другая причина…" },
    ],
    cancelText: "Отмена",
  });
  if (!choice) return null;

  if (choice === "other") {
    const custom = await promptDialog({
      title: "Причина удаления аренды",
      placeholder: "Например: ошиблись клиентом, создали не на того…",
      multiline: true,
      confirmText: "Удалить",
      cancelText: "Назад",
    });
    return custom ?? null;
  }

  const labels: Record<string, string> = {
    accidental: "Создано случайно",
    test: "Тестовая аренда",
    duplicate: "Дубль",
    client_declined: "Клиент передумал",
  };
  return labels[choice] ?? choice;
}
