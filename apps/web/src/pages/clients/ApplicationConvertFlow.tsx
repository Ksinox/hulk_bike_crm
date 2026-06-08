import { useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { AddClientModal } from "./AddClientModal";
import { applicationToFormInit } from "./applicationConvert";
import { NewRentalModal } from "@/pages/rentals/NewRentalModal";
import type { ApiApplication } from "@/lib/api/clientApplications";
import type { Client } from "@/lib/mock/clients";

/**
 * Единый флоу «заявка → клиент → аренда».
 *
 * Раньше каждый экран (авто-детектор новых заявок, страница «Заявки»,
 * вкладка заявок клиента, блок заявок, дашборд-drawer) ДУБЛИРОВАЛ связку
 * AddClientModal → NewRentalModal. Часть копий теряла шаг аренды (после
 * создания клиента просто закрывалась) или открывала аренду через
 * confirmDialog, который мог не всплыть. Оператор видел «просто закрылось».
 *
 * Теперь весь флоу — в одном месте: после создания клиента СРАЗУ
 * открывается оформление аренды с префиллом из заявки (модель / срок /
 * экипировка / дата). Форму аренды можно отменить — клиент уже сохранён,
 * ничего не теряется. Дублировать и рассинхронизировать больше нечего.
 */
export function ApplicationConvertFlow({
  application,
  onClose,
  onClientCreated,
  onRentalCreated,
}: {
  application: ApiApplication;
  /** Закрыть весь флоу (отмена формы клиента ИЛИ закрытие формы аренды). */
  onClose: () => void;
  /** Доп. действие сразу после создания клиента (напр. инвалидация/тост). */
  onClientCreated?: (client: Client) => void;
  /** Доп. действие после создания аренды. */
  onRentalCreated?: () => void;
}) {
  const [client, setClient] = useState<Client | null>(null);
  // Защита от гонки: AddClientModal после успешного convert вызывает свой
  // отложенный onClose (~160 мс). Без guard он закрыл бы весь флоу и снёс
  // уже открытую форму аренды. Ref читается синхронно — не зависит от
  // устаревшего замыкания onClose.
  const convertedRef = useRef(false);

  const prefill = useMemo(
    () => ({
      modelFilter: application.requestedModel ?? undefined,
      days: application.requestedDays ?? undefined,
      equipmentIds: application.requestedEquipmentIds ?? undefined,
      start: application.requestedStartDate ?? undefined,
    }),
    [application],
  );

  if (!client) {
    return (
      <AddClientModal
        applicationId={application.id}
        initialData={applicationToFormInit(application)}
        onClose={() => {
          // Клиент ещё не создан → отмена всего флоу. Если создан —
          // отложенный onClose из формы клиента игнорируем (идём к аренде).
          if (!convertedRef.current) onClose();
        }}
        onCreated={(c) => {
          convertedRef.current = true;
          onClientCreated?.(c);
          setClient(c);
        }}
      />
    );
  }

  return (
    <NewRentalModal
      initialClientId={client.id}
      initialModelFilter={prefill.modelFilter}
      initialDays={prefill.days}
      initialEquipmentIds={prefill.equipmentIds}
      initialStart={prefill.start}
      onClose={onClose}
      onCreated={() => {
        onRentalCreated?.();
        toast.success("Аренда создана");
        onClose();
      }}
    />
  );
}
