/**
 * RentalCard v0.6 — редизайн (Phase 2).
 *
 * Структура:
 *   1. IdentityStrip   — #ID + статус + бейдж долга
 *   2. MasterBlock     — клиент / скутер / экипировка (3 колонки)
 *   3. KpiStrip        — Срок / Эта аренда / За всё время / Долг + CTA
 *   4. CalendarPanel + HistoryStrip
 *   5. DocsInline      — плитки документов
 *   6. SideDrawer'ы    — история, история долгов, профиль клиента
 *   7. Существующие диалоги (PaymentAcceptDialog, RentalActionDialog,
 *      EquipmentChangeDialog, SwapScooterDialog, DamageReportDialog,
 *      DocumentPreviewModal) — реюзаются без изменений.
 *
 * Phase 2 start: drag-to-extend и polish-анимации добавятся отдельно.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  PhoneOff,
  Plus,
  Repeat,
  ShieldAlert,
  Wrench,
  XCircle,
  Eraser,
  Pencil,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Rental,
  type RentalStatus,
} from "@/lib/mock/rentals";
import { effectiveRentalStatus } from "@/lib/rentalStatus";
import { useClientUnreachable } from "@/pages/clients/clientStore";
import { useAllClients } from "@/pages/clients/clientStore";
import { useApiClients } from "@/lib/api/clients";
import { useApiScooters } from "@/lib/api/scooters";
import { navigate } from "@/app/navigationStore";
import { RentalActionDialog, type ActionKind } from "./RentalActionDialog";
import { ExtendRentalDialog } from "./ExtendRentalDialog";
import { PaymentAcceptDialog } from "./PaymentAcceptDialog";
import { SwapScooterDialog } from "./SwapScooterDialog";
import { DamageReportDialog } from "./DamageReportDialog";
import { DamageReportPaymentDialog } from "./DamageReportPaymentDialog";
import { EquipmentChangeDialog } from "./EquipmentChangeDialog";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { useChainDamageReports } from "@/lib/api/damage-reports";
import {
  useRentalDebt,
  useChargeManualDebt,
  useForgiveOverdue,
} from "@/lib/api/debt";
import { useActivityTimeline } from "@/lib/api/activity";
import { RentalActionsMenu, type MenuAction } from "./RentalActionsMenu";
import {
  getRentalChainIds,
  useChainPayments,
  useRentals,
  useArchivedRentals,
} from "./rentalsStore";
import { ClientCard } from "@/pages/clients/ClientCard";
import { ClientQuickView } from "@/pages/clients/ClientQuickView";
import { RentalEditModal } from "./RentalEditModal";
import {
  useDeleteRental,
  usePurgeRental,
  useResetRentalChain,
  useUnarchiveRental,
} from "@/lib/api/rentals";
import { useDashboardDrawer } from "@/pages/dashboard/DashboardDrawer";
import { useMe } from "@/lib/api/auth";
import { confirmDialog, pickAction } from "@/lib/toast";
import { toast } from "@/lib/toast";
import { ApiError, api } from "@/lib/api";

import { MasterBlock } from "./rental-card/MasterBlock";
import { KpiStrip } from "./rental-card/KpiStrip";
import { CalendarPanel } from "./rental-card/CalendarPanel";
import { HistoryStrip } from "./rental-card/HistoryStrip";
import { DocsInline } from "./rental-card/DocsInline";
import { DebtsList } from "./rental-card/DebtsList";
import { SideDrawer } from "./rental-card/SideDrawer";
import { OverdueActionsPopover } from "./rental-card/OverdueActionsPopover";
import { ActivityTimelineSection } from "./ActivityTimelineSection";

type DrawerKind = "history" | "debts" | "profile" | null;

function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
}

function daysBetween(a: Date, b: Date): number {
  const aD = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bD = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bD - aD) / 86400000);
}

function statusActions(
  status: RentalStatus,
  opts: { hasDamage: boolean; isUnreachable: boolean },
): MenuAction[] {
  const extras: MenuAction[] = [
    {
      id: "set-damage",
      label: opts.hasDamage ? "Изменить ущерб" : "Зафиксировать ущерб",
      icon: Wrench,
      tone: "warn",
    },
    {
      id: "charge-debt",
      label: "Начислить долг",
      icon: Plus,
      tone: "warn",
    },
    {
      id: "forgive-overdue",
      label: "Сбросить просрочку",
      icon: RotateCcw,
      tone: "ghost",
    },
    {
      id: opts.isUnreachable ? "unmark-unreachable" : "mark-unreachable",
      label: opts.isUnreachable
        ? "Снять «не выходит на связь»"
        : "Не выходит на связь",
      icon: PhoneOff,
      tone: opts.isUnreachable ? "ghost" : "warn",
    },
  ];
  const withExtras = (base: MenuAction[]): MenuAction[] => [...base, ...extras];

  switch (status) {
    case "new_request":
      return [
        { id: "schedule", label: "Назначить встречу", icon: Calendar, tone: "primary" },
        { id: "cancel", label: "Отменить", icon: XCircle, tone: "ghost" },
      ];
    case "meeting":
      return [
        { id: "activate", label: "Выдать скутер", icon: CheckCircle2, tone: "primary" },
        { id: "cancel", label: "Отменить", icon: XCircle, tone: "ghost" },
      ];
    case "active":
      return withExtras([
        { id: "extend", label: "Продлить", icon: Repeat, tone: "primary" },
        { id: "complete", label: "Завершить аренду", icon: ArrowRight, tone: "ghost" },
      ]);
    case "overdue":
      return withExtras([
        { id: "complete", label: "Завершить аренду", icon: ArrowRight, tone: "primary" },
      ]);
    case "returning":
      return withExtras([
        { id: "complete", label: "Завершить аренду", icon: CheckCircle2, tone: "primary" },
        { id: "cancel-return", label: "Отменить возврат", icon: XCircle, tone: "ghost" },
      ]);
    case "completed":
      return [
        { id: "revert-completion", label: "Перевести в активную", icon: RotateCcw, tone: "primary" },
      ];
    case "completed_damage":
      return withExtras([
        { id: "normalize-status", label: "Сбросить «проблемная»", icon: CheckCircle2, tone: "primary" },
        { id: "resume-damage", label: "Возобновить аренду", icon: RotateCcw, tone: "ghost" },
        { id: "claim", label: "Досудебная претензия", icon: AlertTriangle, tone: "warn" },
      ]);
    case "problem":
      return withExtras([
        { id: "normalize-status", label: "Сбросить «проблемная»", icon: CheckCircle2, tone: "primary" },
        { id: "claim", label: "Распечатать претензию", icon: AlertTriangle, tone: "warn" },
        { id: "resume-damage", label: "Возобновить аренду", icon: RotateCcw, tone: "ghost" },
      ]);
    case "police":
    case "court":
      return withExtras([
        { id: "complete", label: "Скутер вернулся — завершить", icon: CheckCircle2, tone: "primary" },
        { id: "set-damage", label: "Закрыть с ущербом", icon: Wrench, tone: "warn" },
        { id: "revert-police", label: "Отменить дело", icon: RotateCcw, tone: "ghost" },
      ]);
    default:
      return [];
  }
}

export function RentalCard({
  rental,
  onSwapped,
  /** Игнорируется в v0.6 — табы отменены. Сохраняем prop для обратной
   *  совместимости с Rentals.tsx (он передаёт initialTab при навигации
   *  с дашборда). Логика «открыть драверы по типу» отложена. */
  initialTab: _initialTab,
}: {
  rental: Rental;
  onSwapped?: (newRentalId: number) => void;
  initialTab?: string;
}) {
  void _initialTab;

  // ── dialogs ──────────────────────────────────────────────────────
  const [action, setAction] = useState<ActionKind | null>(null);
  const [editRentalOpen, setEditRentalOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [paymentRentalId, setPaymentRentalId] = useState<number | null>(null);
  const [equipmentChangeOpen, setEquipmentChangeOpen] = useState(false);
  const [damageOpen, setDamageOpen] = useState(false);
  const [editingReportId, setEditingReportId] = useState<number | null>(null);
  const [paymentReportId, setPaymentReportId] = useState<number | null>(null);
  const [previewDamageId, setPreviewDamageId] = useState<number | null>(null);
  const [previewClaimId, setPreviewClaimId] = useState<number | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [clientQuickView, setClientQuickView] = useState(false);
  // ── drawers ──────────────────────────────────────────────────────
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  // ── overdue popover ──────────────────────────────────────────────
  const [overdueAnchor, setOverdueAnchor] = useState<DOMRect | null>(null);
  // ── prefill для PaymentAcceptDialog (drag-to-extend) ─────────────
  const [paymentPrefillExtDays, setPaymentPrefillExtDays] = useState<number>(0);

  const drawerCtx = useDashboardDrawer();
  /** Открыть клиента: если мы внутри dashboard-drawer'а — кладём поверх
   *  стека; иначе — открываем правый side-drawer карточки. */
  const openClient = (clientId: number) => {
    if (drawerCtx.inDrawer) {
      drawerCtx.openClient(clientId);
    } else {
      setDrawer("profile");
      void clientId;
    }
  };

  const { data: me } = useMe();
  const deleteRental = useDeleteRental();
  const unarchiveRental = useUnarchiveRental();
  const purgeRental = usePurgeRental();
  const resetChain = useResetRentalChain();
  const isArchived = !!rental.archivedAt;
  const isCreator = me?.role === "creator";

  // ── data ─────────────────────────────────────────────────────────
  const { data: apiClients } = useApiClients();
  const client = useMemo(
    () => apiClients?.find((c) => c.id === rental.clientId) ?? null,
    [rental.clientId, apiClients],
  );

  // ClientCard в drawer'е принимает локальный Client (с депозитами/
  // documents-снапшотами). useAllClients() мерджит ApiClient + локальную часть.
  const allLocalClients = useAllClients();
  const localClient = useMemo(
    () => allLocalClients.find((c) => c.id === rental.clientId) ?? null,
    [allLocalClients, rental.clientId],
  );

  const activeRentals = useRentals();
  const archivedRentals = useArchivedRentals();
  const allRentals = useMemo(
    () => [...activeRentals, ...archivedRentals],
    [activeRentals, archivedRentals],
  );
  const chainIdsFull = useMemo(
    () => getRentalChainIds(rental.id, allRentals),
    [rental.id, allRentals],
  );
  const chainIds = useMemo(
    () =>
      chainIdsFull.filter((id) => {
        const r = allRentals.find((x) => x.id === id);
        return !r || !r.archivedBy;
      }),
    [chainIdsFull, allRentals],
  );
  const chainPayments = useChainPayments(chainIds);

  const { data: apiScooters = [] } = useApiScooters();
  const currentScooter =
    rental.scooterId != null
      ? apiScooters.find((s) => s.id === rental.scooterId) ?? null
      : null;
  const scooterInRepair =
    currentScooter?.baseStatus === "repair" &&
    (rental.status === "active" || rental.status === "overdue");

  const damageReports = useChainDamageReports(chainIdsFull);
  const reports = damageReports.data;
  const totalDebt = reports.reduce((s, r) => s + r.debt, 0);

  const debtQ = useRentalDebt(rental.id);
  const debtSummary = debtQ.data;
  const overdueRelatedDebt =
    (debtSummary?.overdueBalance ?? 0) +
    (debtSummary?.damageBalance ?? totalDebt) +
    (debtSummary?.manualBalance ?? 0);
  const effectiveStatus = effectiveRentalStatus(
    rental.status,
    rental.endPlanned,
    overdueRelatedDebt,
  );
  const reportWithDebt = reports.find((r) => r.debt > 0) ?? null;
  const reportLatest = reports.length > 0 ? reports[reports.length - 1]! : null;
  const hasDamage = reports.length > 0;
  const isUnreachable = useClientUnreachable(rental.clientId);

  // Лента событий — для HistoryStrip и для drawer'а «История»
  const activityQ = useActivityTimeline("rental", rental.id);
  const activityItems = activityQ.data?.items ?? [];

  // ── финансы ───────────────────────────────────────────────────────
  const paidIn = chainPayments
    .filter(
      (p) =>
        p.paid &&
        p.type !== "refund" &&
        p.type !== "deposit" &&
        p.method !== "deposit",
    )
    .reduce((s, p) => s + p.amount, 0);
  const activeRentalIdsForPending = useMemo(
    () =>
      new Set(
        allRentals
          .filter(
            (r) =>
              chainIds.includes(r.id) &&
              !r.archivedBy &&
              r.archivedAt == null,
          )
          .map((r) => r.id),
      ),
    [allRentals, chainIds],
  );
  const pending = chainPayments
    .filter((p) => !p.paid && p.type !== "deposit")
    .filter((p) => activeRentalIdsForPending.has(p.rentalId))
    .reduce((s, p) => s + p.amount, 0);

  const extensionsCount = chainPayments.filter(
    (p) => p.type === "rent" && !!p.note && /^продлен/i.test(p.note),
  ).length;

  // overdueDays для бейджа в IdentityStrip
  const endDate = parseDate(rental.endPlanned);
  const overdueDays =
    effectiveStatus === "overdue" && endDate
      ? Math.abs(daysBetween(new Date(), endDate))
      : 0;

  // ── actions menu ─────────────────────────────────────────────────
  const chargeManualMut = useChargeManualDebt();
  const forgiveOverdueMut = useForgiveOverdue();

  const baseActions = statusActions(rental.status, { hasDamage, isUnreachable });
  const completeAction = baseActions.find((a) => a.id === "complete");
  const actionsWithoutComplete = baseActions.filter((a) => a.id !== "complete");
  const editAction: MenuAction = {
    id: "edit",
    label: "Изменить аренду",
    icon: Pencil,
    tone: "ghost",
  };
  const canDelete = me?.role === "director" || me?.role === "creator";
  const deleteAction: MenuAction = {
    id: "delete",
    label: "Удалить аренду",
    icon: Trash2,
    tone: "danger",
  };
  const restoreAction: MenuAction = {
    id: "unarchive",
    label: "Восстановить из архива",
    icon: RotateCcw,
    tone: "primary",
  };
  const purgeAction: MenuAction = {
    id: "purge",
    label: "Удалить навсегда (без следа)",
    icon: Trash2,
    tone: "danger",
  };
  const resetChainAction: MenuAction = {
    id: "reset-chain",
    label: "Очистить все действия по этой аренде",
    icon: Eraser,
    tone: "danger",
  };
  const actions: MenuAction[] = isArchived
    ? [
        ...(canDelete ? [restoreAction] : []),
        ...(isCreator ? [purgeAction] : []),
      ]
    : completeAction
      ? [
          completeAction,
          editAction,
          ...actionsWithoutComplete,
          ...(canDelete ? [deleteAction] : []),
          ...(isCreator ? [resetChainAction, purgeAction] : []),
        ]
      : [
          editAction,
          ...actionsWithoutComplete,
          ...(canDelete ? [deleteAction] : []),
          ...(isCreator ? [resetChainAction, purgeAction] : []),
        ];

  const handleAction = async (id: string) => {
    if (id === "extend") return setExtendOpen(true);
    if (id === "edit") return setEditRentalOpen(true);
    if (id === "revert-completion") {
      if (
        !window.confirm(
          "Перевести завершённую аренду обратно в активную? Будет снят флаг возврата залога и удалена запись приёмки.",
        )
      )
        return;
      try {
        await api.post(`/api/rentals/${rental.id}/revert-completion`, {});
        toast.success(
          "Аренда возвращена в активные",
          "Завершение откатано — можно продолжать работу.",
        );
      } catch (e) {
        toast.error("Не удалось вернуть", (e as Error).message ?? "");
      }
      return;
    }
    if (id === "resume-damage") {
      const debtSum = reports.reduce((s, r) => s + r.debt, 0);
      const noScooter = rental.scooterId == null;
      const oldInRepair = currentScooter?.baseStatus === "repair";
      if (noScooter || oldInRepair) {
        const ok = await confirmDialog({
          title: "Нужен скутер для возобновления",
          message: noScooter
            ? "Сейчас к аренде не привязан скутер. Чтобы перевести в активный статус, выберите скутер из парка."
            : `Текущий скутер «${currentScooter?.name ?? rental.scooter}» в ремонте. Чтобы возобновить, замените его на свободный из парка${debtSum > 0 ? ` (долг ${debtSum.toLocaleString("ru-RU")} ₽ останется на клиенте)` : ""}.`,
          confirmText: "Выбрать скутер",
          cancelText: "Отмена",
        });
        if (!ok) return;
        setSwapOpen(true);
        return;
      }
      const msg =
        debtSum > 0
          ? `У клиента ещё висит долг по ущербу ${debtSum.toLocaleString("ru-RU")} ₽. Возобновить аренду?`
          : "Долг по ущербу погашен. Возобновить аренду?";
      const ok = await confirmDialog({
        title: "Возобновить аренду?",
        message: msg,
        confirmText: "Возобновить",
        cancelText: "Отмена",
      });
      if (!ok) return;
      try {
        await api.patch(`/api/rentals/${rental.id}`, { status: "active" });
        toast.success("Аренда возобновлена", "Скутер активен.");
      } catch (e) {
        toast.error("Не удалось возобновить", (e as Error).message ?? "");
      }
      return;
    }
    if (id === "normalize-status") {
      try {
        const res = await api.post<{ ok: true; newStatus: string }>(
          `/api/rentals/${rental.id}/normalize-status`,
          {},
        );
        toast.success(
          "Статус сброшен",
          `Новый статус: «${res.newStatus === "active" ? "Активная" : "Завершена"}».`,
        );
      } catch (e) {
        const msg = (e as { body?: { error?: string } }).body?.error;
        if (msg === "wrong_status") {
          toast.info("Статус нормальный", "Аренда уже не в проблемном статусе.");
        } else {
          toast.error("Не удалось", (e as Error).message ?? "");
        }
      }
      return;
    }
    if (id === "set-damage") {
      const last = reportLatest;
      if (last) setEditingReportId(last.id);
      else setDamageOpen(true);
      return;
    }
    if (id === "charge-debt") {
      const amountStr = window.prompt("Сумма долга, ₽");
      if (!amountStr) return;
      const amount = Number(amountStr.replace(/\D/g, ""));
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Неверная сумма", "Введите положительное число.");
        return;
      }
      const comment = window.prompt("Комментарий — за что начисляем долг:");
      if (comment == null || !comment.trim()) {
        toast.error("Нужен комментарий", "Без него начисление недопустимо.");
        return;
      }
      try {
        await chargeManualMut.mutateAsync({
          rentalId: rental.id,
          amount,
          comment: comment.trim(),
        });
        toast.success(
          "Долг начислен",
          `+${amount.toLocaleString("ru-RU")} ₽`,
        );
      } catch (e) {
        toast.error("Не удалось начислить", (e as Error).message ?? "");
      }
      return;
    }
    if (id === "forgive-overdue") {
      const days = debtSummary?.overdueDaysBalance ?? 0;
      const fine = debtSummary?.overdueFineBalance ?? 0;
      const total = days + fine;
      if (total <= 0) {
        toast.info("Нет просрочки", "Сбрасывать нечего.");
        return;
      }
      const overdueDaysCount = debtSummary?.overdueDays ?? 0;
      const dailyRateLocal =
        rental.rateUnit === "week"
          ? Math.round(rental.rate / 7)
          : rental.rate;
      const fineDailyLocal = Math.round(dailyRateLocal * 0.5);
      const daysCovered =
        dailyRateLocal > 0 ? Math.floor(days / dailyRateLocal) : 0;
      const fineCoveredByDays = Math.min(fine, daysCovered * fineDailyLocal);
      const totalIfDays = days + fineCoveredByDays;
      const choice = await pickAction<
        "days" | "days_partial" | "fine" | "all"
      >({
        title: "Что списываем?",
        message: `Просрочка ${total.toLocaleString("ru-RU")} ₽ за ${overdueDaysCount} дн.`,
        options: [
          {
            id: "days",
            label: `Все неоплаченные дни (${daysCovered} дн)`,
            hint: `${totalIfDays.toLocaleString("ru-RU")} ₽`,
            disabled: days <= 0,
          },
          {
            id: "days_partial",
            label: "Только N дней (укажу сколько)",
            hint: "Простит выбранные дни (включая штраф за эти же дни).",
            disabled: days <= 0,
          },
          {
            id: "fine",
            label: "Только штраф (без дней)",
            hint: `${fine.toLocaleString("ru-RU")} ₽`,
            disabled: fine <= 0,
          },
          {
            id: "all",
            label: "Всю просрочку (дни + штраф)",
            hint: `${total.toLocaleString("ru-RU")} ₽`,
            tone: "danger",
          },
        ],
      });
      if (choice == null) return;
      let daysCount: number | undefined;
      if (choice === "days_partial") {
        const raw = window.prompt(
          `Сколько дней простить? (доступно ${overdueDaysCount})`,
          String(overdueDaysCount),
        );
        if (raw == null) return;
        const n = Math.max(1, Math.min(overdueDaysCount, Number(raw) || 0));
        if (n <= 0) {
          toast.error("Некорректное число дней");
          return;
        }
        daysCount = n;
      }
      const target: "all" | "fine" | "days" =
        choice === "days_partial" ? "days" : choice;
      const comment = window.prompt("Причина списания (необязательно):", "");
      try {
        const r = await forgiveOverdueMut.mutateAsync({
          rentalId: rental.id,
          comment: comment ?? undefined,
          target,
          daysCount,
        });
        toast.success(
          "Списано",
          `${(r.amount ?? 0).toLocaleString("ru-RU")} ₽`,
        );
      } catch (e) {
        toast.error("Не удалось", (e as Error).message ?? "");
      }
      return;
    }
    if (id === "claim") {
      const r = reportWithDebt ?? reportLatest;
      if (!r) {
        toast.info("Нет акта", "Сначала зафиксируйте ущерб");
        return;
      }
      setPreviewClaimId(r.id);
      return;
    }
    if (id === "record-damage") {
      const r = reportWithDebt ?? reportLatest;
      if (!r) {
        toast.info("Нет акта", "Сначала зафиксируйте ущерб");
        return;
      }
      setPaymentReportId(r.id);
      return;
    }
    if (id === "unarchive") {
      try {
        await unarchiveRental.mutateAsync(rental.id);
        toast.success("Аренда восстановлена", `#${String(rental.id).padStart(4, "0")}`);
      } catch (e) {
        toast.error("Не удалось восстановить", (e as Error).message ?? "");
      }
      return;
    }
    if (id === "purge") {
      const ok = await confirmDialog({
        title: "Удалить аренду НАВСЕГДА?",
        message: `Аренда #${String(rental.id).padStart(4, "0")}, её платежи и активность будут стёрты из БД. Операция необратима.`,
        confirmText: "Стереть навсегда",
        cancelText: "Отмена",
        danger: true,
      });
      if (!ok) return;
      try {
        await purgeRental.mutateAsync(rental.id);
        toast.success("Аренда стёрта без следа", `#${String(rental.id).padStart(4, "0")}`);
      } catch (e) {
        if (e instanceof ApiError) {
          const body = e.body as { error?: string } | null;
          if (body?.error === "creator_only") {
            toast.error("Запрещено", "Только создатель может стирать данные.");
            return;
          }
        }
        toast.error("Не удалось удалить", (e as Error).message ?? "");
      }
      return;
    }
    if (id === "reset-chain") {
      const ok = await confirmDialog({
        title: "Очистить все действия?",
        message: `Все продления и замены по аренде #${String(rental.id).padStart(4, "0")} будут УДАЛЕНЫ. Останется только базовая связка в active.`,
        confirmText: "Очистить",
        cancelText: "Отмена",
        danger: true,
      });
      if (!ok) return;
      try {
        const res = await resetChain.mutateAsync(rental.id);
        toast.success("Цепочка очищена", `Удалено связок: ${res.removed}.`);
      } catch (e) {
        if (e instanceof ApiError) {
          const body = e.body as { error?: string } | null;
          if (body?.error === "creator_only") {
            toast.error("Запрещено", "Только создатель может очищать цепочку.");
            return;
          }
        }
        toast.error("Не удалось очистить", (e as Error).message ?? "");
      }
      return;
    }
    if (id === "delete") {
      const ok = await confirmDialog({
        title: "Удалить аренду?",
        message: `Аренда #${String(rental.id).padStart(4, "0")} будет перемещена в архив.`,
        confirmText: "Удалить",
        cancelText: "Отмена",
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteRental.mutateAsync(rental.id);
        toast.success("Аренда удалена", `#${String(rental.id).padStart(4, "0")}`);
      } catch (e) {
        if (e instanceof ApiError) {
          const body = e.body as { message?: string } | null;
          toast.error("Не удалось удалить", body?.message ?? "Попробуйте ещё раз");
        } else {
          toast.error("Не удалось удалить", (e as Error).message ?? "");
        }
      }
      return;
    }
    setAction(id as ActionKind);
  };

  // ── handlers для KpiStrip / MasterBlock ───────────────────────────
  const isLive = !isArchived && rental.status !== "completed";
  const canAcceptPayment = isLive;
  const canComplete =
    isLive && (rental.status === "active" || rental.status === "overdue");

  const handleAcceptPayment = () => {
    // Если есть долг по ущербу — открываем DamageReportPaymentDialog,
    // он умеет распределять оплату на damage_report и оставлять остаток
    // как обычную оплату по аренде. Иначе — стандартный поток.
    if (reportWithDebt && reportWithDebt.debt > 0) {
      setPaymentReportId(reportWithDebt.id);
    } else {
      setPaymentRentalId(rental.id);
    }
  };

  /** v0.6.1: drag-to-extend на основном календаре. Открывает обычный
   *  PaymentAcceptDialog, но с предзаполненным числом дней. */
  const handleCommitExtend = (days: number) => {
    if (!isLive) return;
    if (days <= 0) return;
    setPaymentPrefillExtDays(days);
    setPaymentRentalId(rental.id);
  };

  const handleComplete = () => {
    setAction("complete");
  };

  const handleSwapScooter = () => {
    if (!rental.scooterId) {
      toast.info("Нет скутера", "К аренде не привязан скутер");
      return;
    }
    if (rental.status !== "active" && rental.status !== "overdue") {
      toast.info(
        "Нельзя заменить",
        "Замена скутера доступна только для активных аренд",
      );
      return;
    }
    setSwapOpen(true);
  };

  const canEditEquipment =
    rental.status === "active" ||
    rental.status === "overdue" ||
    rental.status === "returning";

  // ── render ────────────────────────────────────────────────────────
  return (
    <div className="w-full">
      <div className="w-full max-w-[1180px] mx-auto p-4 lg:p-5 flex flex-col gap-3">
        {/* Header row: only actions menu now — identity moved into MasterBlock */}
        <div className="flex items-center justify-end gap-3 flex-wrap">
          <RentalActionsMenu actions={actions} onAction={handleAction} />
        </div>

        {/* Archived banner — оставляем простым */}
        {isArchived && (
          <div className="flex items-center gap-2 rounded-[12px] bg-surface-soft px-3 py-2 text-[12px] text-muted ring-1 ring-inset ring-border">
            <Trash2 size={14} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <b>Аренда в архиве.</b>{" "}
              {rental.archivedBy
                ? `Удалена пользователем ${rental.archivedBy}.`
                : ""}
            </div>
          </div>
        )}

        {/* Police banner */}
        {rental.status === "police" && (
          <div className="flex items-center gap-2 rounded-[12px] bg-red-soft/70 px-3 py-2 text-[12px] text-red-ink">
            <ShieldAlert size={14} className="shrink-0" />
            <span>
              <b>Заявление в полицию подано.</b>{" "}
              {rental.note ?? "скутер не возвращён"}
            </span>
          </div>
        )}

        {/* Scooter-in-repair banner */}
        {scooterInRepair && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border-2 border-orange-500 bg-orange-soft/70 px-3 py-2 text-[13px] text-orange-ink">
            <div className="flex items-start gap-2">
              <Wrench size={16} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-bold">
                  Скутер ушёл в ремонт — нужно решение по аренде
                </div>
                <div className="text-[11px] opacity-80">
                  {currentScooter?.name ?? "Скутер"} в статусе «На ремонте».
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSwapOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-blue-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-blue-700"
            >
              <Repeat size={12} /> Заменить скутер
            </button>
          </div>
        )}

        {/* MASTER BLOCK */}
        <MasterBlock
          rental={rental}
          client={client}
          scooter={currentScooter}
          effectiveStatus={effectiveStatus}
          isUnreachable={isUnreachable}
          isArchived={isArchived}
          totalDebt={overdueRelatedDebt + pending}
          overdueDays={overdueDays}
          onOpenDebts={() => setDrawer("debts")}
          onOpenClientProfile={() => {
            if (client) openClient(client.id);
          }}
          onSwapScooter={handleSwapScooter}
          onChangeEquipment={
            canEditEquipment ? () => setEquipmentChangeOpen(true) : undefined
          }
        />

        {/* KPI STRIP */}
        <KpiStrip
          rental={rental}
          debtSummary={debtSummary}
          paidIn={paidIn}
          pending={pending}
          totalDamageDebt={totalDebt}
          effectiveStatus={effectiveStatus}
          extensionsCount={extensionsCount}
          canAcceptPayment={canAcceptPayment}
          canComplete={canComplete}
          onAcceptPayment={handleAcceptPayment}
          onComplete={handleComplete}
          onOpenDebts={() => setDrawer("debts")}
          onOverdueClick={(rect) => setOverdueAnchor(rect)}
        />

        {/* Inline note */}
        {rental.note && (
          <div className="rounded-[10px] bg-surface-soft px-3 py-1.5 text-[12px] text-ink-2">
            <b>Заметка:</b> {rental.note}
          </div>
        )}

        {/* Calendar + History side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
          <CalendarPanel
            rental={rental}
            effectiveStatus={effectiveStatus}
            onCommitExtend={isLive ? handleCommitExtend : undefined}
          />
          <HistoryStrip
            items={activityItems}
            loading={activityQ.isLoading}
            onExpand={() => setDrawer("history")}
          />
        </div>

        {/* Documents */}
        <DocsInline rental={rental} />
      </div>

      {/* ─── DRAWERS ───────────────────────────────────────────── */}
      <SideDrawer
        open={drawer === "history"}
        onClose={() => setDrawer(null)}
        title="История аренды"
        subtitle="Все события · клик по строке открывает связанную сущность"
        width={620}
      >
        <div className="p-4">
          <ActivityTimelineSection
            items={activityItems}
            loading={activityQ.isLoading}
          />
        </div>
      </SideDrawer>

      <SideDrawer
        open={drawer === "debts"}
        onClose={() => setDrawer(null)}
        title="История долгов"
        subtitle="Открытые периоды, ущерб, ручные начисления"
        width={520}
      >
        <DebtsList
          rentalId={rental.id}
          chainIds={chainIdsFull}
          onOpenDamage={(reportId) => setPreviewDamageId(reportId)}
        />
      </SideDrawer>

      <SideDrawer
        open={drawer === "profile"}
        onClose={() => setDrawer(null)}
        title={localClient?.name ?? client?.name ?? "Клиент"}
        subtitle="Профиль клиента"
        width={560}
      >
        <div className="p-5">
          {localClient ? (
            <ClientCard client={localClient} />
          ) : (
            <div className="text-[12px] text-muted">Клиент не найден.</div>
          )}
        </div>
      </SideDrawer>

      {/* ─── DIALOGS ───────────────────────────────────────────── */}
      {action && (
        <RentalActionDialog
          rental={rental}
          action={action}
          onClose={() => setAction(null)}
          onOpenDamage={() => {
            setAction(null);
            setDamageOpen(true);
          }}
        />
      )}
      {editRentalOpen && (
        <RentalEditModal
          rental={rental}
          onClose={() => setEditRentalOpen(false)}
        />
      )}
      {extendOpen && (
        <ExtendRentalDialog
          rental={rental}
          onClose={() => setExtendOpen(false)}
          onExtended={(r) => {
            navigate({ route: "rentals", rentalId: r.id });
            setPaymentRentalId(r.id);
          }}
        />
      )}
      {paymentRentalId != null && (
        <PaymentAcceptDialogContainer
          rentalId={paymentRentalId}
          initialExtDays={paymentPrefillExtDays || undefined}
          onClose={() => {
            setPaymentRentalId(null);
            setPaymentPrefillExtDays(0);
          }}
        />
      )}

      {/* v0.6.1: popover быстрых действий по просрочке */}
      {overdueAnchor && (
        <OverdueActionsPopover
          rentalId={rental.id}
          anchorRect={overdueAnchor}
          debtSummary={debtSummary}
          dailyRate={
            rental.rateUnit === "week"
              ? Math.round(rental.rate / 7)
              : rental.rate
          }
          onClose={() => setOverdueAnchor(null)}
          onAcceptPayment={handleAcceptPayment}
        />
      )}
      {equipmentChangeOpen && (
        <EquipmentChangeDialog
          rental={rental}
          onClose={() => setEquipmentChangeOpen(false)}
        />
      )}

      {clientQuickView && client && (
        <ClientQuickView
          clientId={client.id}
          onClose={() => setClientQuickView(false)}
          from={{ route: "rentals", rentalId: rental.id }}
        />
      )}

      {swapOpen && (
        <SwapScooterDialog
          rental={rental}
          onClose={() => setSwapOpen(false)}
          onSwapped={(newId) => {
            setSwapOpen(false);
            onSwapped?.(newId);
          }}
        />
      )}

      {damageOpen && (
        <DamageReportDialog
          rental={rental}
          onClose={() => setDamageOpen(false)}
          onCreated={(reportId) => {
            setDamageOpen(false);
            setPreviewDamageId(reportId);
          }}
        />
      )}

      {editingReportId != null &&
        (() => {
          const r = reports.find((x) => x.id === editingReportId);
          if (!r) return null;
          return (
            <DamageReportDialog
              rental={rental}
              existing={r}
              onClose={() => setEditingReportId(null)}
              onCreated={() => setEditingReportId(null)}
            />
          );
        })()}

      {previewDamageId != null && (
        <DamageDocumentPreview
          reportId={previewDamageId}
          onClose={() => setPreviewDamageId(null)}
        />
      )}

      {previewClaimId != null && (
        <ClaimDocumentPreview
          reportId={previewClaimId}
          onClose={() => setPreviewClaimId(null)}
        />
      )}

      {paymentReportId != null && (
        <DamageReportPaymentDialog
          reportId={paymentReportId}
          onClose={() => setPaymentReportId(null)}
        />
      )}
    </div>
  );
}

// v0.3.9: контейнер-фасад над PaymentAcceptDialog. Берёт rental из
// глобального списка по id — пережимает refетч/ремаунт.
function PaymentAcceptDialogContainer({
  rentalId,
  onClose,
  initialExtDays,
}: {
  rentalId: number;
  onClose: () => void;
  initialExtDays?: number;
}) {
  const all = useRentals();
  const r = all.find((x) => x.id === rentalId);
  if (!r) return null;
  return (
    <PaymentAcceptDialog
      rental={r}
      onClose={onClose}
      initialExtDays={initialExtDays}
      onPaid={() => {
        /* invalidations происходят в dialog'е */
      }}
    />
  );
}

/** Превью акта о повреждениях для печати. */
function DamageDocumentPreview({
  reportId,
  onClose,
}: {
  reportId: number;
  onClose: () => void;
}) {
  const base =
    import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
  const htmlUrl = `${base}/api/damage-reports/${reportId}/document?format=html`;
  const docxUrl = `${base}/api/damage-reports/${reportId}/document?format=docx`;
  return (
    <DocumentPreviewModal
      title={`Акт о повреждениях #${reportId}`}
      htmlUrl={htmlUrl}
      docxUrl={docxUrl}
      docxFilename={`Акт о повреждениях ${String(reportId).padStart(4, "0")}.doc`}
      onClose={onClose}
    />
  );
}

/** Превью досудебной претензии для печати. */
function ClaimDocumentPreview({
  reportId,
  onClose,
}: {
  reportId: number;
  onClose: () => void;
}) {
  const base =
    import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
  const htmlUrl = `${base}/api/damage-reports/${reportId}/claim?format=html`;
  const docxUrl = `${base}/api/damage-reports/${reportId}/claim?format=docx`;
  return (
    <DocumentPreviewModal
      title={`Досудебная претензия #${reportId}`}
      htmlUrl={htmlUrl}
      docxUrl={docxUrl}
      docxFilename={`Досудебная претензия ${String(reportId).padStart(4, "0")}.doc`}
      onClose={onClose}
    />
  );
}

/**
 * Экспортируется чтобы Rentals.tsx мог рендерить превью у себя поверх
 * любой карточки (см. RentalCard.onSwapped).
 */
export function ActTransferPreview({
  rentalId,
  onClose,
}: {
  rentalId: number;
  onClose: () => void;
}) {
  const base =
    import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
  const htmlUrl = `${base}/api/rentals/${rentalId}/document/act_swap?format=html`;
  const docxUrl = `${base}/api/rentals/${rentalId}/document/act_swap?format=docx`;
  return (
    <DocumentPreviewModal
      title="Акт приёма-передачи и замены скутера"
      htmlUrl={htmlUrl}
      docxUrl={docxUrl}
      docxFilename={`Акт замены скутера ${String(rentalId).padStart(4, "0")}.doc`}
      templateKey="act_swap"
      templateName="Акт приёма-передачи и замены скутера"
      rentalId={rentalId}
      documentType="act_swap"
      onClose={onClose}
    />
  );
}

// keep cn import used (avoid TS6133)
void cn;
