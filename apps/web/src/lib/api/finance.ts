import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Блок «Финансы» (20.09) — форма ДДС.
 *
 * Блок изолирован: суммы вносятся руками, из аренд/ремонтов/продаж ничего не
 * подтягивается (решение заказчика — чтобы цифры не спорили). Период общий
 * для CRM — расчётный (у заказчика с 15-го). Ключ периода — дата первого дня.
 *
 * Показатели считает фронт по списку движений: записей за год — сотни, а
 * разрезы (период, статья, постоянные/переменные, динамика) на клиенте
 * мгновенные и не требуют запроса на каждое переключение.
 */

export type FinanceKind = "income" | "expense";

export type FinanceCategory = {
  id: number;
  kind: FinanceKind;
  name: string;
  /** Постоянная статья — аренда помещения, связь, коммунальные. */
  fixed: boolean;
  sortOrder: number;
  archivedAt: string | null;
};

export type FinanceEntry = {
  id: number;
  kind: FinanceKind;
  categoryId: number | null;
  name: string;
  amount: number;
  /** Дата движения, YYYY-MM-DD. */
  at: string;
  periodKey: string;
  /** manual — внесли руками, recurring — из постоянной издержки. */
  source: "manual" | "recurring";
  recurringId: number | null;
  note: string | null;
  createdAt: string;
};

export type FinanceRecurring = {
  id: number;
  kind: FinanceKind;
  categoryId: number | null;
  name: string;
  amount: number;
  startPeriod: string;
  active: boolean;
  note: string | null;
};

export type FinancePerson = {
  id: number;
  name: string;
  role: string | null;
  salaryDefault: number;
  /** Процент с продаж сверх оклада. */
  salesPct: number;
  active: boolean;
  sortOrder: number;
};

export type FinancePayrollRow = {
  id: number;
  periodKey: string;
  personId: number | null;
  personName: string;
  salary: number;
  /** Продажи периода, с которых считается процент. */
  salesBase: number;
  /** Процент, действовавший в этом периоде. */
  salesPct: number;
  /** Премия: база × процент, но может быть вписана руками. */
  salesBonus: number;
  note: string | null;
};

const KEY = ["finance"] as const;

export function useFinanceCategories() {
  return useQuery({
    queryKey: [...KEY, "categories"],
    queryFn: async () => (await api.get<{ items: FinanceCategory[] }>("/api/finance/categories")).items,
  });
}

type EntriesResponse = {
  items: FinanceEntry[];
  periodKey: string;
  periods: string[];
  bounds: { from: string; to: string };
};

export function useFinanceEntries(periodKey: string | undefined, back = 13) {
  return useQuery({
    queryKey: [...KEY, "entries", periodKey, back],
    enabled: !!periodKey,
    queryFn: async () =>
      await api.get<EntriesResponse>(`/api/finance/entries?period=${periodKey}&back=${back}`),
  });
}

/** Свой диапазон дат — «посмотреть за своё», а не только за период. */
export function useFinanceEntriesRange(from: string | undefined, to: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "entries-range", from, to],
    enabled: !!from && !!to,
    queryFn: async () =>
      await api.get<EntriesResponse>(`/api/finance/entries?from=${from}&to=${to}`),
  });
}

export function useFinancePayrollRange(from: string | undefined, to: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "payroll-range", from, to],
    enabled: !!from && !!to,
    queryFn: async () =>
      (await api.get<{ items: FinancePayrollRow[] }>(`/api/finance/payroll?from=${from}&to=${to}`))
        .items,
  });
}

export function useFinanceRecurring() {
  return useQuery({
    queryKey: [...KEY, "recurring"],
    queryFn: async () => (await api.get<{ items: FinanceRecurring[] }>("/api/finance/recurring")).items,
  });
}

export function useFinancePeople() {
  return useQuery({
    queryKey: [...KEY, "people"],
    queryFn: async () => (await api.get<{ items: FinancePerson[] }>("/api/finance/people")).items,
  });
}

export function useFinancePayroll(periodKey: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "payroll", periodKey],
    enabled: !!periodKey,
    queryFn: async () =>
      (await api.get<{ items: FinancePayrollRow[] }>(`/api/finance/payroll?period=${periodKey}`)).items,
  });
}

/** Любая правка в блоке обновляет все его списки: цифры связаны между собой. */
function useFinanceMutation<TArgs, TRes>(fn: (args: TArgs) => Promise<TRes>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export type EntryInput = {
  kind: FinanceKind;
  categoryId: number | null;
  name: string;
  amount: number;
  at: string;
  note?: string | null;
};

export function useCreateFinanceEntry() {
  return useFinanceMutation((body: EntryInput) =>
    api.post<{ item: FinanceEntry }>("/api/finance/entries", body),
  );
}

export function useUpdateFinanceEntry() {
  return useFinanceMutation(({ id, ...body }: Partial<EntryInput> & { id: number }) =>
    api.patch<{ item: FinanceEntry }>(`/api/finance/entries/${id}`, body),
  );
}

/** Пачка строк из окна ввода — одним запросом и одной записью в журнале. */
export function useCreateFinanceEntries() {
  return useFinanceMutation((items: EntryInput[]) =>
    api.post<{ items: FinanceEntry[] }>("/api/finance/entries/bulk", { items }),
  );
}

/** Откат пачки целиком — кнопка «Отменить» в тосте. */
export function useDeleteFinanceEntries() {
  return useFinanceMutation((ids: number[]) =>
    api.post<{ ok: true }>("/api/finance/entries/bulk-delete", { ids }),
  );
}

export function useDeleteFinanceEntry() {
  return useFinanceMutation((id: number) => api.delete<{ ok: true }>(`/api/finance/entries/${id}`));
}

/** Возврат удалённой строки — кнопка «Отменить» в тосте. */
export function useRestoreFinanceEntry() {
  return useFinanceMutation((id: number) =>
    api.post<{ ok: true }>(`/api/finance/entries/${id}/restore`, {}),
  );
}

export type RecurringInput = {
  kind?: FinanceKind;
  categoryId: number | null;
  name: string;
  amount: number;
  startPeriod: string;
  active?: boolean;
  note?: string | null;
};

export function useCreateFinanceRecurring() {
  return useFinanceMutation((body: RecurringInput) =>
    api.post<{ item: FinanceRecurring }>("/api/finance/recurring", body),
  );
}

export function useUpdateFinanceRecurring() {
  return useFinanceMutation(({ id, ...body }: Partial<RecurringInput> & { id: number }) =>
    api.patch<{ item: FinanceRecurring }>(`/api/finance/recurring/${id}`, body),
  );
}

export function useDeleteFinanceRecurring() {
  return useFinanceMutation((id: number) => api.delete<{ ok: true }>(`/api/finance/recurring/${id}`));
}

export type CategoryInput = {
  kind: FinanceKind;
  name: string;
  fixed?: boolean;
  sortOrder?: number;
};

export function useCreateFinanceCategory() {
  return useFinanceMutation((body: CategoryInput) =>
    api.post<{ item: FinanceCategory }>("/api/finance/categories", body),
  );
}

export function useUpdateFinanceCategory() {
  return useFinanceMutation(({ id, ...body }: Partial<CategoryInput> & { id: number }) =>
    api.patch<{ item: FinanceCategory }>(`/api/finance/categories/${id}`, body),
  );
}

export function useDeleteFinanceCategory() {
  return useFinanceMutation((id: number) =>
    api.delete<{ ok: true; used: number }>(`/api/finance/categories/${id}`),
  );
}

export type PersonInput = {
  name: string;
  role?: string | null;
  salaryDefault?: number;
  salesPct?: number;
  active?: boolean;
};

export function useCreateFinancePerson() {
  return useFinanceMutation((body: PersonInput) =>
    api.post<{ item: FinancePerson }>("/api/finance/people", body),
  );
}

export function useUpdateFinancePerson() {
  return useFinanceMutation(({ id, ...body }: Partial<PersonInput> & { id: number }) =>
    api.patch<{ item: FinancePerson }>(`/api/finance/people/${id}`, body),
  );
}

export function useDeleteFinancePerson() {
  return useFinanceMutation((id: number) => api.delete<{ ok: true }>(`/api/finance/people/${id}`));
}

export function useUpdateFinancePayroll() {
  return useFinanceMutation(
    ({
      id,
      ...body
    }: {
      id: number;
      salary?: number;
      salesBase?: number;
      salesPct?: number;
      salesBonus?: number;
      note?: string | null;
    }) =>
      api.patch<{ item: FinancePayrollRow }>(`/api/finance/payroll/${id}`, body),
  );
}

/* ──────────────── расчёты для экрана ──────────────── */

export type PeriodTotals = {
  income: number;
  expense: number;
  /** Расход = движения + ФОТ периода. */
  payroll: number;
  profit: number;
  /** Маржинальность, % от прихода. */
  marginPct: number;
};

export function totalsOf(
  entries: FinanceEntry[],
  periodKey: string,
  payroll: number,
): PeriodTotals {
  const inPeriod = entries.filter((e) => e.periodKey === periodKey);
  const income = inPeriod.filter((e) => e.kind === "income").reduce((s, e) => s + e.amount, 0);
  const expense =
    inPeriod.filter((e) => e.kind === "expense").reduce((s, e) => s + e.amount, 0) + payroll;
  const profit = income - expense;
  return {
    income,
    expense,
    payroll,
    profit,
    marginPct: income > 0 ? Math.round((profit / income) * 100) : 0,
  };
}
