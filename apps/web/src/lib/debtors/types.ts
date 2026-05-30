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
  closedAt: string | null;
  closedReason: string | null;
  createdAt: string;
  updatedAt: string;
  /** v0.6: имя/телефон клиента, подмешиваются в GET /api/debtors (список). */
  clientName?: string | null;
  clientPhone?: string | null;
};

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
};

export type TodayAction = {
  kind:
    | "systematic_violation"
    | "overdue_call"
    | "lawyer_check"
    | "insurance_reminder"
    | "payment_due_today";
  priority: "hot" | "warm" | "cool";
  text: string;
  primaryAction: { label: string; target: string };
};

export type TodayBundle = {
  hottest: {
    debtor: {
      id: number;
      caseNumber: string;
      type: DebtType;
      stage: Stage;
      totalAmount: number;
      clientName: string;
      psyRating: number;
      clientStatus: ClientStatus;
    };
    action: TodayAction;
  } | null;
  queue: {
    debtor: {
      id: number;
      caseNumber: string;
      type: DebtType;
      stage: Stage;
      totalAmount: number;
      clientName: string;
      psyRating: number;
      clientStatus: ClientStatus;
    };
    action: TodayAction;
  }[];
  totalActiveCount: number;
  totalActiveSum: number;
};

// Labels (зеркало бэка — для UI можно использовать их сразу)
export const TYPE_LABEL: Record<DebtType, string> = {
  dtp_guilty: "ДТП · виновник",
  dtp_victim: "ДТП · потерпевший",
  damage: "Ущерб",
  theft: "Угон",
  rental_overdue: "Просрочка аренды",
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
  closed_written_off: "Списано",
  closed_settled: "Мировая",
  closed_court: "Закрыто решением суда",
};

export function isClosed(stage: Stage): boolean {
  return stage.startsWith("closed_");
}

export function formatRub(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}
