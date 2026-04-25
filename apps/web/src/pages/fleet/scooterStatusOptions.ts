import type { ScooterBaseStatus } from "@/lib/mock/fleet";

/**
 * Единый список статусов скутера — используется во всех формах,
 * чтобы не было расхождений между AddScooterModal / ScooterEditForm /
 * ScooterStatusModal / ReassignDialog.
 */
export const SCOOTER_BASE_STATUS_OPTIONS: {
  value: ScooterBaseStatus;
  label: string;
  hint: string;
}[] = [
  { value: "ready", label: "Не распределён", hint: "Свежий, ещё не решено что с ним" },
  { value: "rental_pool", label: "Готов к аренде", hint: "Свободен, можно выдавать клиенту" },
  { value: "repair", label: "На ремонте", hint: "Находится на обслуживании" },
  { value: "buyout", label: "Передан в выкуп", hint: "В рассрочку у клиента" },
  { value: "for_sale", label: "На продажу", hint: "Выставлен к продаже" },
  { value: "sold", label: "Продан", hint: "Из оборота выбыл" },
  { value: "disassembly", label: "В разборке", hint: "Пошёл на запчасти, учитывается в парке" },
];

export function scooterStatusLabel(status: ScooterBaseStatus | string): string {
  return (
    SCOOTER_BASE_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
  );
}
