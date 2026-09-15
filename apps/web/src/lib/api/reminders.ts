import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

/**
 * Напоминания (01.09): платежи по выкупу и дни выплат инвесторам.
 * Сервер считает их каждый раз заново — см. routes/reminders.ts.
 */

export type Reminder = {
  id: string;
  kind: "buyout_due" | "buyout_overdue" | "investor_payout";
  urgency: "overdue" | "today" | "soon";
  title: string;
  subtitle: string;
  amount: number | null;
  date: string;
  link: { section: string; entityId: number } | null;
  phone: string | null;
};

export type RemindersResponse = {
  items: Reminder[];
  counts: { total: number; overdue: number; today: number; soon: number };
  summary: { buyoutAmount: number };
};

export function useReminders() {
  return useQuery({
    queryKey: ["reminders"],
    queryFn: () => api.get<RemindersResponse>("/api/reminders"),
    // Напоминание должно быть свежим: платёж могли принять минуту назад.
    staleTime: 60_000,
  });
}
