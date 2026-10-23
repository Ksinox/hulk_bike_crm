/**
 * Типы должников — единые между фронтом и бэком.
 * Зеркалят apps/api/src/services/debtorStages.ts.
 */

export type DebtType =
  | "dtp_guilty"
  | "dtp_victim"
  | "damage"
  | "theft"
  | "rental_overdue";

export type Stage =
  | "created"
  | "pretrial"
  | "lawyer"
  | "court"
  | "insurance_docs"
  | "insurance_eval"
  | "insurance_wait"
  | "payment_schedule"
  | "police"
  | "criminal_case"
  | "closed_paid"
  | "closed_recovered"
  | "closed_written_off"
  | "closed_settled"
  | "closed_court";

export type ClientStatus = "active" | "closed";
export type PaymentMethod = "transfer" | "cash";
export type CallOutcome = "answered" | "no_answer" | "promised" | "refused";

export type Debtor = {
  id: number;
  caseNumber: string;
  clientId: number | null;
  externalName: string | null;
  externalPhone: string | null;
  type: DebtType;
  stage: Stage;
  stageEnteredAt: string;
  totalAmount: number;
  psyRating: number;
  clientStatus: ClientStatus;
  comment: string | null;
  insuranceCompany: string | null;
  insuranceEstimate: number | null;
  insurancePayout: number | null;
  repairCost: number | null;
  lawyerName: string | null;
  lastLawyerUpdateAt: string | null;
  relatedRentalId: number | null;
  /** Этап 3: акт о повреждениях, из которого заведено дело. */
  damageReportId: number | null;
  closedAt: string | null;
  closedReason: string | null;
  createdAt: string;
  updatedAt: string;
  /** v0.6: имя/телефон клиента, подмешиваются в GET /api/debtors (список). */
  clientName?: string | null;
  clientPhone?: string | null;
  /** Партия 23.10: «ждём оплату до» (YYYY-MM-DD) — срок из акта. */
  paymentDueDate: string | null;
  /** Пеня по п. 5.7 договора (1 000 ₽/день неоплаты ущерба). */
  penaltyEnabled: boolean;
  penaltyFrom: string | null;
  penaltyUntil: string | null;
  /** Ключ фото клиента (миниатюра) — для аватарки. */
  clientPhotoKey?: string | null;
  /** Оплачено / остаток к взысканию (с учётом акта и пени). */
  paid?: number;
  remaining?: number;
  penalty?: number;
};

/** Дело ждёт оплату по акту и срок ещё не прошёл. */
export function isAwaitingPayment(
  d: { paymentDueDate?: string | null },
  todayYmd: string = localYmd(),
): boolean {
  return !!d.paymentDueDate && d.paymentDueDate >= todayYmd;
}

/** Срок оплаты из акта прошёл — пора спросить «Пришла ли оплата?». */
export function needsPaymentCheck(
  d: { paymentDueDate?: string | null; stage: Stage },
  todayYmd: string = localYmd(),
): boolean {
  return !!d.paymentDueDate && d.paymentDueDate < todayYmd && !isClosed(d.stage);
}

export function localYmd(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ruDate(ymd: string | null | undefined): string {
  return ymd ? ymd.slice(0, 10).split("-").reverse().join(".") : "—";
}

export type DebtorPayment = {
  id: number;
  debtorId: number;
  n: number;
  scheduledDate: string;
  scheduledAmount: number;
  paidAt: string | null;
  paidAmount: number | null;
  paidMethod: PaymentMethod | null;
  note: string | null;
  createdAt: string;
};

export type DebtorCall = {
  id: number;
  debtorId: number;
  outcome: CallOutcome;
  promisedDate: string | null;
  note: string | null;
  createdAt: string;
};

export type DebtorStageEvent = {
  id: number;
  debtorId: number;
  fromStage: Stage | null;
  toStage: Stage;
  reason: string | null;
  createdAt: string;
};

export type DebtorNote = {
  id: number;
  debtorId: number;
  text: string;
  createdAt: string;
};

/** Сводка по делу-должнику для карточки клиента (зеркало API). */
export type DebtorCaseSummary = {
  id: number;
  caseNumber: string;
  type: DebtType;
  stage: Stage;
  totalAmount: number;
  paid: number;
  progressPercent: number;
  active: boolean;
  /** Проблемное дело (угон/невозврат/криминал) — метка «Проблемный». */
  problem: boolean;
  closedAt: string | null;
  closedReason: string | null;
  createdAt: string;
};

export type Recommendation = {
  kind: "transfer_lawyer" | "request_estimate" | "close_paid" | "call_overdue";
  reason: string;
  cta?: { kind: "navigate" | "transition"; target: string };
};

export type InsuranceForecast = {
  estimate: number | null;
  payout: number | null;
  repairCost: number | null;
  profit: number | null;
  stage: "before_estimate" | "estimated" | "paid_out" | "complete";
};

export type DebtorDetail = Debtor & {
  displayName: string;
  displayPhone: string;
  paid: number;
  progressPercent: number;
  overdueDays: number;
  overdueAmount: number;
  payments: DebtorPayment[];
  stageEvents: DebtorStageEvent[];
  calls: DebtorCall[];
  notes: DebtorNote[];
  recommendation: Recommendation | null;
  forecast: InsuranceForecast | null;
  remaining: number;
  penalty: number;
  penaltyDays: number;
  penaltyPerDay: number;
  /** У дела ущерба — остаток по самому акту (без пени). */
  reportBalance: number | null;
  damageReport: {
    id: number;
    rentalId: number;
    payDueDate: string | null;
    total: number;
    depositCovered: number;
  } | null;
};

export type TodayAction = {
  kind:
    | "systematic_violation"
    | "overdue_call"
    | "lawyer_check"
    | "insurance_reminder"
    | "payment_due_today"
    | "payment_check"
    | "first_contact"
    | "in_progress";
  priority: "hot" | "warm" | "cool";
  text: string;
  primaryAction: { label: string; target: string };
};

export type TodayDebtor = {
  id: number;
  caseNumber: string;
  type: DebtType;
  stage: Stage;
  totalAmount: number;
  clientName: string;
  psyRating: number;
  clientStatus: ClientStatus;
  /** Партия 23.10: остаток к взысканию. */
  remaining?: number;
  paymentDueDate?: string | null;
  clientPhone?: string;
  clientPhotoKey?: string | null;
};

export type TodayBundle = {
  hottest: { debtor: TodayDebtor; action: TodayAction } | null;
  queue: { debtor: TodayDebtor; action: TodayAction }[];
  /** Партия 23.10: все активные дела — для главной раздела. */
  active?: { debtor: TodayDebtor; action: TodayAction | null }[];
  awaitingCount?: number;
  totalActiveCount: number;
  totalActiveSum: number;
};

// Labels (зеркало бэка — для UI можно использовать их сразу)
export const TYPE_LABEL: Record<DebtType, string> = {
  dtp_guilty: "ДТП · виновник",
  dtp_victim: "ДТП · потерпевший",
  damage: "Ущерб",
  theft: "Угон",
  rental_overdue: "Долг за аренду",
};

export const STAGE_LABEL: Record<Stage, string> = {
  created: "Заведено",
  pretrial: "Досудебка",
  lawyer: "У юриста",
  court: "В суде",
  insurance_docs: "Документы в страховой",
  insurance_eval: "Оценка",
  insurance_wait: "Ждём выплату",
  payment_schedule: "График платежей",
  police: "Заявление в полицию",
  criminal_case: "Уголовное дело",
  closed_paid: "Закрыто оплатой",
  closed_recovered: "Имущество возвращено",
  closed_written_off: "Списано",
  closed_settled: "Мировая",
  closed_court: "Закрыто решением суда",
};

export function isClosed(stage: Stage): boolean {
  return stage.startsWith("closed_");
}

/**
 * «Проблемное» дело — не столько денежный долг, сколько ЧП: угон,
 * невозврат, криминал. На таких клиентах висит стоимость скутера, ими
 * занимаются иначе (полиция/суд), и в списке их отделяем от обычных
 * денежных должников с графиком.
 */
export function isProblemCase(type: DebtType, stage: Stage): boolean {
  return type === "theft" || stage === "police" || stage === "criminal_case";
}

export function formatRub(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}
