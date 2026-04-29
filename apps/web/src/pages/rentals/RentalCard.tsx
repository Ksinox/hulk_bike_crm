import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  PhoneOff,
  ThumbsDown,
  ThumbsUp,
  Plus,
  Repeat,
  ShieldAlert,
  Star,
  Wrench,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEPOSIT_AMOUNT,
  STATUS_LABEL,
  STATUS_TONE,
  type Rental,
  type RentalStatus,
} from "@/lib/mock/rentals";
import { ratingTier } from "@/lib/mock/clients";
import { useClientUnreachable } from "@/pages/clients/clientStore";
import { useApiClients } from "@/lib/api/clients";
import { navigate } from "@/app/navigationStore";
import {
  DocumentsTab,
  HistoryTab,
  TasksTab,
  TermsTab,
} from "./RentalCardTabs";
import { RentalActionDialog, type ActionKind } from "./RentalActionDialog";
import { ExtendRentalDialog } from "./ExtendRentalDialog";
import { SwapScooterDialog } from "./SwapScooterDialog";
import { DamageReportDialog } from "./DamageReportDialog";
import { DamageReportPaymentDialog } from "./DamageReportPaymentDialog";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import {
  useDamageReports,
  useDamageAgreement,
} from "@/lib/api/damage-reports";
import { RentalActionsMenu, type MenuAction } from "./RentalActionsMenu";
import {
  getRentalChainIds,
  useChainPayments,
  useRentals,
  useArchivedRentals,
} from "./rentalsStore";
import { ClientQuickView } from "@/pages/clients/ClientQuickView";
import { RentalEditModal } from "./RentalEditModal";
import { Eraser, Pencil, Trash2, RotateCcw } from "lucide-react";
import {
  useDeleteRental,
  usePurgeRental,
  useResetRentalChain,
  useUnarchiveRental,
} from "@/lib/api/rentals";
import { useMe } from "@/lib/api/auth";
import { confirmDialog } from "@/lib/toast";
import { toast } from "@/lib/toast";
import { ApiError, api } from "@/lib/api";

type TabId = "terms" | "history" | "tasks" | "docs";

const TABS: { id: TabId; label: string }[] = [
  { id: "terms", label: "Условия" },
  { id: "history", label: "История" },
  { id: "tasks", label: "Задачи" },
  { id: "docs", label: "Документы" },
];

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "0";
  return n.toLocaleString("ru-RU");
}

function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
}

function daysBetween(a: Date, b: Date): number {
  // разница в календарных днях: нормализуем оба к началу дня
  const aD = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bD = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bD - aD) / 86400000);
}

/** Текущая дата/время — пересоздаётся при каждом рендере компонента */
function now(): Date {
  return new Date();
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
        { id: "addPayment", label: "Принять платёж", icon: Plus, tone: "ghost" },
      ]);
    case "overdue":
      return withExtras([
        { id: "complete", label: "Завершить аренду", icon: ArrowRight, tone: "primary" },
        { id: "addPayment", label: "Принять платёж", icon: Plus, tone: "ghost" },
        { id: "revert-overdue", label: "Снять просрочку", icon: XCircle, tone: "ghost" },
        { id: "police", label: "Подать в полицию", icon: ShieldAlert, tone: "danger" },
      ]);
    case "returning":
      // Единое окно завершения. Чек-лист (экипировка/состояние) +
      // галка «Есть ущерб?» внутри одного диалога — пользователь
      // решает прямо там, без отдельных кнопок «без ущерба / с ущербом».
      // Также «Отменить возврат» — если нажали «Завершить аренду»
      // случайно и хотим вернуть аренду в активный режим.
      return withExtras([
        { id: "complete", label: "Завершить аренду", icon: CheckCircle2, tone: "primary" },
        { id: "cancel-return", label: "Отменить возврат", icon: XCircle, tone: "ghost" },
      ]);
    case "completed":
      return [
        { id: "clone", label: "Создать аналогичную", icon: Repeat, tone: "primary" },
      ];
    case "completed_damage":
      return withExtras([
        { id: "resume-damage", label: "Возобновить аренду", icon: RotateCcw, tone: "primary" },
        { id: "claim", label: "Досудебная претензия", icon: AlertTriangle, tone: "warn" },
      ]);
    case "problem":
      return withExtras([
        { id: "claim", label: "Распечатать претензию", icon: AlertTriangle, tone: "warn" },
        { id: "resume-damage", label: "Возобновить аренду", icon: RotateCcw, tone: "ghost" },
      ]);
    case "police":
      return withExtras([]);
    default:
      return [];
  }
}

function statusChipClass(tone: string): string {
  return tone === "green"
    ? "bg-green-soft text-green-ink"
    : tone === "red"
      ? "bg-red-soft text-red-ink"
      : tone === "orange"
        ? "bg-orange-soft text-orange-ink"
        : tone === "blue"
          ? "bg-blue-50 text-blue-700"
          : tone === "purple"
            ? "bg-purple-soft text-purple-ink"
            : "bg-surface-soft text-muted";
}

export function RentalCard({
  rental,
  onSwapped,
}: {
  rental: Rental;
  /** Callback в Rentals при успешной замене скутера. Rentals переключает
   *  selectedId на новую связку и поднимает превью акта замены поверх
   *  карточки — иначе при ремаунте RentalCard локальный state превью
   *  терялся, и превью никогда не показывалось. */
  onSwapped?: (newRentalId: number) => void;
}) {
  const [tab, setTab] = useState<TabId>("terms");
  const [action, setAction] = useState<ActionKind | null>(null);
  const [editRentalOpen, setEditRentalOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [damageOpen, setDamageOpen] = useState(false);
  const [editingReportId, setEditingReportId] = useState<number | null>(null);
  const [paymentReportId, setPaymentReportId] = useState<number | null>(null);
  const [previewDamageId, setPreviewDamageId] = useState<number | null>(null);
  const [previewClaimId, setPreviewClaimId] = useState<number | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const damageAgreement = useDamageAgreement();
  const [clientQuickView, setClientQuickView] = useState(false);
  const { data: me } = useMe();
  const deleteRental = useDeleteRental();
  const unarchiveRental = useUnarchiveRental();
  const purgeRental = usePurgeRental();
  const resetChain = useResetRentalChain();
  const isArchived = !!rental.archivedAt;
  const isCreator = me?.role === "creator";

  const { data: apiClients } = useApiClients();
  const client = useMemo(
    () => apiClients?.find((c) => c.id === rental.clientId),
    [rental.clientId, apiClients],
  );
  // ВАЖНО: для построения цепочки продлений берём И активные И архивные
  // аренды. При продлении parent rental уходит в архив, и без archivedRentals
  // мы бы потеряли его платежи в расчёте «За всё время».
  const activeRentals = useRentals();
  const archivedRentals = useArchivedRentals();
  const allRentals = useMemo(
    () => [...activeRentals, ...archivedRentals],
    [activeRentals, archivedRentals],
  );
  // Полная цепочка (включая авто-архивных родителей и вручную удалённые
  // связки) — нужна, чтобы найти rootRental.
  const chainIdsFull = useMemo(
    () => getRentalChainIds(rental.id, allRentals),
    [rental.id, allRentals],
  );
  // Активные связки цепочки (для метрик): исключаем сегменты, удалённые
  // вручную (archivedBy != null). Авто-архивные родители при продлении
  // (archivedBy == null) остаются в расчётах.
  const chainIds = useMemo(
    () =>
      chainIdsFull.filter((id) => {
        const r = allRentals.find((x) => x.id === id);
        return !r || !r.archivedBy;
      }),
    [chainIdsFull, allRentals],
  );
  const chainPayments = useChainPayments(chainIds);
  const tier = client ? ratingTier(client.rating) : null;

  // Корневая (первая) аренда цепочки — её start показываем в шапке
  // карточки как «оригинальную» дату выдачи, даже если сейчас открыто
  // продление (child).
  const rootRental = useMemo(
    () => allRentals.find((r) => chainIdsFull[0] === r.id) ?? rental,
    [allRentals, chainIdsFull, rental],
  );

  // Суммарные ожидаемые (аренда+залог) по всей цепочке продлений.
  // Залог один на серию — берём только один раз.
  const chainRentals = useMemo(
    () => allRentals.filter((r) => chainIds.includes(r.id)),
    [allRentals, chainIds],
  );
  const chainRentSum = chainRentals.reduce((s, r) => s + (r.sum || 0), 0);
  // Выручка по цепочке — только аренды без залога. Залог — возвратный,
  // он не наш доход (кроме случая, когда списан на покрытие ущерба —
  // тогда создаётся отдельный платёж типа 'damage').
  const chainExpected = chainRentSum;
  /** Сумма дней по всей цепочке продлений (текущая + родители + потомки) */
  const chainDaysTotal = chainRentals.reduce((s, r) => s + (r.days || 0), 0);
  const isExtended = chainRentals.length > 1;

  const startDate = parseDate(rental.start);
  const endDate = parseDate(rental.endPlanned);
  const daysLeft =
    startDate && endDate ? daysBetween(now(), endDate) : null;

  const tone = STATUS_TONE[rental.status];
  const isUnreachable = useClientUnreachable(rental.clientId);
  // Акты о повреждениях по аренде (для блока «Долг по ущербу» и кнопок).
  const damageReports = useDamageReports(rental.id);
  const reports = damageReports.data ?? [];
  const totalDebt = reports.reduce((s, r) => s + r.debt, 0);
  const reportWithDebt = reports.find((r) => r.debt > 0) ?? null;
  const reportLatest =
    reports.length > 0 ? reports[reports.length - 1]! : null;
  // v0.2.75: hasDamage опирается только на формальные акты о повреждениях.
  // Старое поле rental.damageAmount больше не учитываем — в UI его нет.
  const hasDamage = reports.length > 0;
  const baseActions = statusActions(rental.status, { hasDamage, isUnreachable });
  // «Завершить аренду» — должна быть главной кнопкой в шапке (primary).
  // Если она доступна для статуса — ставим её первой, а «Изменить» уходит
  // во вторичные действия в дропдауне.
  const completeAction = baseActions.find((a) => a.id === "complete");
  const actionsWithoutComplete = baseActions.filter((a) => a.id !== "complete");
  const editAction: MenuAction = {
    id: "edit",
    label: "Изменить аренду",
    icon: Pencil,
    tone: "ghost",
  };
  // «Удалить» — только директор/создатель, но БЕЗ условий (soft-delete = архив).
  const canDelete = me?.role === "director" || me?.role === "creator";
  const deleteAction: MenuAction = {
    id: "delete",
    label: "Удалить аренду",
    icon: Trash2,
    tone: "danger",
  };

  // Состав меню действий:
  //  1. primary — completeAction если есть, иначе editAction
  //  2. далее — остальные действия по статусу + edit (если не primary)
  //  3. в конце — delete (опасная операция)
  // Для архивных аренд показываем только «Восстановить».
  const restoreAction: MenuAction = {
    id: "unarchive",
    label: "Восстановить из архива",
    icon: RotateCcw,
    tone: "primary",
  };
  // Жёсткое удаление — ТОЛЬКО для creator, без следов в БД и активити-логе.
  const purgeAction: MenuAction = {
    id: "purge",
    label: "Удалить навсегда (без следа)",
    icon: Trash2,
    tone: "danger",
  };
  // «Очистить все действия» — ТОЛЬКО creator. Удаляет всех потомков
  // базовой связки (продления + замены) физически, плюс связанные
  // платежи/инспекции/swaps/activity_log. Корень разархивируется и
  // возвращается в active. Используется когда оператор перенакрутил
  // и нужно вернуться к чистому состоянию.
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

  // Финансы — считаются по ВСЕЙ цепочке продлений.
  // В «Получено от клиента» (paidIn) НЕ включаем депозит — он возвратный
  // и не является заработком. Если депозит был списан в ущерб, отдельный
  // платёж типа 'damage' создаётся в модалке возврата — он сюда попадёт.
  const paidIn = chainPayments
    .filter((p) => p.paid && p.type !== "refund" && p.type !== "deposit")
    .reduce((s, p) => s + p.amount, 0);
  const pending = chainPayments
    .filter((p) => !p.paid && p.type !== "deposit")
    .reduce((s, p) => s + p.amount, 0);
  // chainExpected больше не используется в UI карточки (убрали «X% по
  // цепочке»). Оставляем переменную для будущих метрик/отчётов —
  // void чтобы линтер не ругался.
  void chainExpected;

  const handleAction = async (id: string) => {
    if (id === "extend" || id === "clone") return setExtendOpen(true);
    if (id === "edit") return setEditRentalOpen(true);
    if (id === "resume-damage") {
      // Возобновление аренды с ущербом — возвращает её в active. Если
      // долг по акту ещё есть — спрашиваем подтверждение (часто
      // продолжаем работать с клиентом который согласен платить).
      const debtSum = reports.reduce((s, r) => s + r.debt, 0);
      const msg =
        debtSum > 0
          ? `У клиента ещё висит долг по ущербу ${debtSum.toLocaleString("ru-RU")} ₽. Возобновить аренду? Долг останется на клиенте, скутер вернётся в активный статус.`
          : `Долг по ущербу погашен. Возобновить аренду? Скутер вернётся в активный статус, аренда — в active.`;
      const ok = await confirmDialog({
        title: "Возобновить аренду?",
        message: msg,
        confirmText: "Возобновить",
        cancelText: "Отмена",
      });
      if (!ok) return;
      try {
        await api.patch(`/api/rentals/${rental.id}`, { status: "active" });
        // Скутер обратно в rental_pool если был в repair после damage.
        if (rental.scooterId) {
          try {
            await api.patch(`/api/scooters/${rental.scooterId}`, {
              baseStatus: "rental_pool",
            });
          } catch {
            /* не критично если не получилось */
          }
        }
        toast.success(
          "Аренда возобновлена",
          "Скутер активен, можно продолжить работу с клиентом.",
        );
      } catch (e) {
        toast.error("Не удалось возобновить", (e as Error).message ?? "");
      }
      return;
    }
    if (id === "set-damage") {
      // Если уже есть акт — открываем последний для редактирования.
      const last = reportLatest;
      if (last) {
        setEditingReportId(last.id);
      } else {
        setDamageOpen(true);
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
        toast.success(
          "Аренда восстановлена",
          `#${String(rental.id).padStart(4, "0")}`,
        );
      } catch (e) {
        toast.error("Не удалось восстановить", (e as Error).message ?? "");
      }
      return;
    }
    if (id === "purge") {
      const ok = await confirmDialog({
        title: "Удалить аренду НАВСЕГДА?",
        message: `Аренда #${String(rental.id).padStart(4, "0")}, все её платежи, инспекции возврата и записи активности будут УДАЛЕНЫ ИЗ БД. Никакого следа не останется. Операция необратима. Использовать только когда точно нужно стереть данные.`,
        confirmText: "Стереть навсегда",
        cancelText: "Отмена",
        danger: true,
      });
      if (!ok) return;
      try {
        await purgeRental.mutateAsync(rental.id);
        toast.success(
          "Аренда стёрта без следа",
          `#${String(rental.id).padStart(4, "0")}`,
        );
      } catch (e) {
        if (e instanceof ApiError) {
          const body = e.body as { error?: string } | null;
          if (body?.error === "creator_only") {
            toast.error(
              "Запрещено",
              "Только создатель системы может стирать данные без следа.",
            );
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
        message: `Все продления и замены по аренде #${String(rental.id).padStart(4, "0")} будут УДАЛЕНЫ ИЗ БД (вместе с платежами и историей замен). Останется только базовая связка, она вернётся в активный статус. Операция необратима — используйте когда нужно вернуться к чистому состоянию.`,
        confirmText: "Очистить",
        cancelText: "Отмена",
        danger: true,
      });
      if (!ok) return;
      try {
        const res = await resetChain.mutateAsync(rental.id);
        toast.success(
          "Цепочка очищена",
          `Удалено связок: ${res.removed}. Базовая #${String(res.rootId).padStart(4, "0")} активна.`,
        );
      } catch (e) {
        if (e instanceof ApiError) {
          const body = e.body as { error?: string } | null;
          if (body?.error === "creator_only") {
            toast.error(
              "Запрещено",
              "Только создатель системы может очищать цепочку.",
            );
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
        message: `Аренда #${String(rental.id).padStart(4, "0")} будет перемещена в архив. Историю клиента и платежи система сохранит. Восстановить аренду можно из архива на этой же странице.`,
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

  return (
    <div className="flex min-h-0 flex-col gap-3 rounded-2xl bg-surface p-5 shadow-card-sm">
      {/* =========== HEADER =========== */}
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 font-display text-[22px] font-extrabold leading-tight text-ink">
          <span className="truncate">
            Аренда #{String(rental.id).padStart(4, "0")}
            {client && (
              <>
                {" — "}
                <button
                  type="button"
                  onClick={() => setClientQuickView(true)}
                  title="Быстрый просмотр клиента"
                  className="rounded decoration-2 underline-offset-4 hover:underline"
                >
                  {client.name}
                </button>
              </>
            )}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold",
              statusChipClass(tone),
            )}
          >
            {STATUS_LABEL[rental.status]}
          </span>
          {isUnreachable && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-soft px-2.5 py-1 text-[11px] font-bold text-orange-ink">
              <PhoneOff size={11} /> Не выходит на связь
            </span>
          )}
          {client && tier && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                tier.tone === "good"
                  ? "bg-green-soft text-green-ink"
                  : tier.tone === "bad"
                    ? "bg-red-soft text-red-ink"
                    : "bg-surface-soft text-ink",
              )}
              title={tier.label}
            >
              <Star size={11} /> {client.rating}
            </span>
          )}
        </h2>

        {/* ACTIONS — одна primary + dropdown */}
        <RentalActionsMenu actions={actions} onAction={handleAction} />
      </header>

      {/* =========== BANNERS =========== */}
      {isArchived && (
        <div className="flex items-center gap-2 rounded-[12px] bg-surface-soft px-3 py-2 text-[12px] text-muted ring-1 ring-inset ring-border">
          <Trash2 size={14} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <b>Аренда в архиве.</b> Удалена{" "}
            {rental.archivedBy ? `пользователем ${rental.archivedBy}` : ""}
            {rental.archivedAt
              ? ` ${new Date(rental.archivedAt).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : ""}
            . Восстановите через меню действий, если удаление было ошибкой.
          </div>
        </div>
      )}
      {/*
        Баннер «Требуется подтверждение выдачи» убран по решению заказчика.
        Аренда сразу считается полностью оформленной — оператор подписывает
        договор на месте и нажимает «Создать», CRM не должна добавлять
        лишний шаг подтверждения. Если позже нужно вернуть учёт «договор
        получен» — это будет отдельный лёгкий чекбокс, не блокирующий поток.
      */}
      {rental.status === "overdue" && endDate && (() => {
        const d = Math.max(1, daysLeft !== null ? Math.abs(daysLeft) : 1);
        const overdueDebt = d * (rental.rate + 250);
        return (
          <div className="flex items-center gap-2 rounded-[12px] bg-red-soft/70 px-3 py-2 text-[12px] text-red-ink">
            <AlertTriangle size={14} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <b>Просрочка {d} дн.</b> Долг {fmt(overdueDebt)} ₽
              (тариф {fmt(rental.rate)} ₽ + 250 ₽/день). Плановый возврат —{" "}
              {rental.endPlanned} {rental.startTime || "12:00"}.
            </div>
          </div>
        );
      })()}
      {rental.status === "police" && (
        <div className="flex items-center gap-2 rounded-[12px] bg-red-soft/70 px-3 py-2 text-[12px] text-red-ink">
          <ShieldAlert size={14} className="shrink-0" />
          <span>
            <b>Заявление в полицию подано.</b>{" "}
            {rental.note ?? "скутер не возвращён"}
          </span>
        </div>
      )}
      {/* Блок «Долг по ущербу» — показывается если по аренде есть акты с долгом. */}
      {totalDebt > 0 && reportWithDebt && (
        <div className="flex flex-col gap-2 rounded-[12px] border-2 border-red-500 bg-red-soft/70 px-3 py-2 text-[13px] text-red-ink">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-bold">
                  Долг по ущербу:{" "}
                  <span className="tabular-nums">{fmt(totalDebt)} ₽</span>
                </div>
                <div className="text-[11px] opacity-80">
                  Всего по акту {fmt(reportWithDebt.total)} ₽, зачтено из залога{" "}
                  {fmt(reportWithDebt.depositCovered)} ₽
                  {reportWithDebt.paidSum > 0
                    ? `, оплачено ${fmt(reportWithDebt.paidSum)} ₽`
                    : ""}
                  .
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPaymentReportId(reportWithDebt.id)}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-red-600 px-3 py-2 text-[12px] font-bold text-white hover:bg-red-700"
            >
              <Plus size={12} /> Внести платёж
            </button>
          </div>
          {/* Реакция клиента на акт. После выбора — отображаем бейдж. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-red-300 pt-2 text-[12px]">
            <span className="text-ink-2">Реакция клиента:</span>
            {reportWithDebt.clientAgreement === "agreed" && (
              <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-green-soft px-3 py-1.5 text-[12px] font-bold text-green-ink">
                <ThumbsUp size={12} /> Согласен — гасит долг через платежи
              </span>
            )}
            {reportWithDebt.clientAgreement === "disputed" && (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-red-soft px-3 py-1.5 text-[12px] font-bold text-red-ink">
                  <ThumbsDown size={12} /> Не согласен — претензия отправлена
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewClaimId(reportWithDebt.id)}
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-red-500 bg-white px-3 py-1.5 text-[12px] font-bold text-red-700 hover:bg-red-50"
                >
                  Распечатать снова
                </button>
              </>
            )}
            {reportWithDebt.clientAgreement === "pending" && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: "Клиент согласен с ущербом?",
                      message:
                        "Долг останется на аренде, клиент будет погашать постепенно через «Внести платёж». Аренда останется активной.",
                      confirmText: "Да, согласен",
                      cancelText: "Отмена",
                    });
                    if (!ok) return;
                    try {
                      await damageAgreement.mutateAsync({
                        reportId: reportWithDebt.id,
                        agreement: "agreed",
                      });
                      toast.success(
                        "Принято",
                        "Долг остаётся на аренде. Принимайте платежи постепенно.",
                      );
                    } catch (e) {
                      toast.error("Не удалось", (e as Error).message ?? "");
                    }
                  }}
                  disabled={damageAgreement.isPending}
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-green-500 bg-white px-3 py-1.5 text-[12px] font-bold text-green-700 hover:bg-green-50 disabled:opacity-50"
                >
                  <ThumbsUp size={12} /> Согласен — будет платить
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: "Клиент НЕ согласен?",
                      message:
                        "Аренда будет отмечена как «Проблемная», откроется превью досудебной претензии. Никаких продлений и замен с этого момента не делаем.",
                      confirmText: "Да, не согласен",
                      cancelText: "Отмена",
                      danger: true,
                    });
                    if (!ok) return;
                    try {
                      await damageAgreement.mutateAsync({
                        reportId: reportWithDebt.id,
                        agreement: "disputed",
                      });
                      setPreviewClaimId(reportWithDebt.id);
                    } catch (e) {
                      toast.error("Не удалось", (e as Error).message ?? "");
                    }
                  }}
                  disabled={damageAgreement.isPending}
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-red-500 bg-white px-3 py-1.5 text-[12px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  <ThumbsDown size={12} /> Не согласен — претензия
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {totalDebt === 0 && reports.length > 0 && (
        <div className="flex items-center gap-2 rounded-[12px] bg-green-soft/70 px-3 py-2 text-[12px] text-green-ink">
          <CheckCircle2 size={14} className="shrink-0" />
          <span>
            <b>Ущерб полностью оплачен.</b> Аренду можно архивировать.
          </span>
        </div>
      )}
      {rental.status === "completed_damage" && reports.length === 0 && (
        <div className="flex items-center gap-2 rounded-[12px] bg-red-soft/70 px-3 py-2 text-[12px] text-red-ink">
          <AlertTriangle size={14} className="shrink-0" />
          <span>
            <b>Завершена с ущербом.</b> Остаток не погашен —{" "}
            {fmt(pending)} ₽.
          </span>
        </div>
      )}
      {rental.status === "returning" && (
        <div className="flex items-center gap-2 rounded-[12px] bg-orange-soft/70 px-3 py-2 text-[12px] text-orange-ink">
          <Calendar size={14} className="shrink-0" />
          <span>
            <b>Идёт возврат.</b> Осмотреть скутер, сверить с видео при выдаче.
          </span>
        </div>
      )}

      {/* =========== KPI STRIP =========== */}
      <div
        className={cn(
          "grid grid-cols-2 gap-3 sm:grid-cols-4",
          isExtended && "lg:grid-cols-5",
        )}
      >
        {(() => {
          let label = "Срок";
          // Если аренда продлевалась — общий срок = сумма дней по всей цепочке
          // (от первой выдачи до текущего планового конца), иначе rental.days.
          const totalDays = isExtended
            ? chainRentals.reduce((s, r) => s + (r.days || 0), 0)
            : rental.days;
          let value = `${totalDays} дн`;
          // В hint показываем диапазон от ROOT-старта (первая выдача) до
          // текущего планового конца, чтобы было видно реальный период проката.
          const hint = `${rootRental.start.slice(0, 5)} — ${rental.endPlanned.slice(0, 5)}`;
          let accent: KpiAccent = "default";
          if (rental.status === "active" && daysLeft !== null) {
            if (daysLeft > 0) {
              value = `осталось ${daysLeft} дн`;
              accent = daysLeft <= 2 ? "red" : "default";
            } else if (daysLeft === 0) {
              value = `возврат сегодня`;
              accent = "red";
            } else {
              label = "Просрочен";
              value = `${Math.abs(daysLeft)} дн`;
              accent = "red";
            }
          } else if (rental.status === "overdue") {
            label = "Просрочен";
            value =
              daysLeft !== null && daysLeft < 0
                ? `${Math.abs(daysLeft)} дн`
                : "сегодня";
            accent = "red";
          }
          return (
            <KpiCard label={label} value={value} hint={hint} accent={accent} />
          );
        })()}
        <KpiCard
          label="Эта аренда"
          value={`${fmt(rental.sum)} ₽`}
          hint={`+ залог: ${fmt(rental.deposit || DEPOSIT_AMOUNT)} ₽`}
        />
        <KpiCard
          label="За всё время аренды"
          value={`${fmt(paidIn)} ₽`}
          accent={paidIn > 0 ? "blue" : "default"}
          hint={
            isExtended
              ? `за ${chainRentals.length} ${pluralRental(chainRentals.length)} (без залога)`
              : "сумма аренды без залога"
          }
          badgeIcon={paidIn > 0 ? CheckCircle2 : undefined}
        />
        {(() => {
          // Долг = аренда (просрочка/неоплата) + долг по актам ущерба.
          //  - при просрочке аренды — (тариф + 250) × дней просрочки
          //  - иначе — сумма неоплаченных rent-платежей
          //  - плюс totalDebt из всех damage_reports (фактический долг по актам)
          let rentDebt = pending;
          let rentDebtHint = "";
          if (rental.status === "overdue") {
            const d = Math.max(
              1,
              daysLeft !== null ? Math.abs(daysLeft) : 1,
            );
            rentDebt = d * (rental.rate + 250);
            rentDebtHint = `просрочка ${d} дн × ${fmt(rental.rate + 250)} ₽`;
          } else if (pending > 0) {
            rentDebtHint = "не оплачена аренда";
          }
          const debt = rentDebt + totalDebt;
          let debtHint: string;
          if (debt === 0) {
            debtHint = "нет долгов";
          } else if (rentDebt > 0 && totalDebt > 0) {
            debtHint = `${rentDebtHint} + ущерб ${fmt(totalDebt)} ₽`;
          } else if (totalDebt > 0) {
            debtHint = "по акту повреждений";
          } else {
            debtHint = rentDebtHint;
          }
          return (
            <KpiCard
              label="Долг"
              value={debt > 0 ? `${fmt(debt)} ₽` : "0 ₽"}
              hint={debtHint}
              accent={debt > 0 ? "red" : "muted"}
            />
          );
        })()}
        {isExtended && (
          <KpiCard
            label="Всего по сделке"
            value={`${fmt(chainDaysTotal)} дн`}
            hint={`${chainRentals.length} ${chainRentals.length === 1 ? "аренда" : chainRentals.length < 5 ? "аренды" : "аренд"} в серии`}
            accent="blue"
          />
        )}
      </div>

      {rental.note && (
        <div className="rounded-[10px] bg-surface-soft px-3 py-1.5 text-[12px] text-ink-2">
          <b>Заметка:</b> {rental.note}
        </div>
      )}

      {/* =========== TABS =========== */}
      <div className="mt-1 flex gap-1 border-b border-border overflow-x-auto scrollbar-thin">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "relative -mb-px shrink-0 px-3 py-2 text-[13px] font-semibold transition-colors",
              tab === t.id
                ? "border-b-2 border-blue-600 text-blue-600"
                : "border-b-2 border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 pt-3">
        {tab === "terms" && (
          <TermsTab
            rental={rental}
            onClientClick={() => setClientQuickView(true)}
            onSwapScooter={() => {
              if (!rental.scooterId) {
                toast.info("Нет скутера", "К аренде не привязан скутер");
                return;
              }
              if (
                rental.status !== "active" &&
                rental.status !== "overdue"
              ) {
                toast.info(
                  "Нельзя заменить",
                  "Замена скутера доступна только для активных аренд",
                );
                return;
              }
              setSwapOpen(true);
            }}
          />
        )}
        {tab === "history" && (
          <HistoryTab rental={rental} chainRentals={chainRentals} />
        )}
        {tab === "tasks" && <TasksTab rental={rental} />}
        {tab === "docs" && <DocumentsTab rental={rental} />}
      </div>

      {action && (
        <RentalActionDialog
          rental={rental}
          action={action}
          onClose={() => setAction(null)}
          onOpenDamage={() => {
            // Закрытие RentalActionDialog уже происходит у себя —
            // мы только открываем damage окно.
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
      {/* ConfirmPaymentDialog больше не используется — функционал убран. */}
      {extendOpen && (
        <ExtendRentalDialog
          rental={rental}
          onClose={() => setExtendOpen(false)}
          onExtended={(r) => {
            // После продления просто переключаем фокус на новую аренду.
            // Договор НЕ открываем — заказчик подтвердил, что при продлении
            // новый договор не печатается (это та же аренда, просто с
            // расширенным сроком и доплатой).
            navigate({ route: "rentals", rentalId: r.id });
          }}
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
            // Сообщаем родительскому Rentals о свапе. Rentals одновременно
            // переключит selectedId на newId и поднимет превью акта замены
            // в собственном state — там оно переживает ремаунт RentalCard.
            // Если onSwapped не передан (изолированное использование) —
            // просто остаёмся на старой карточке без превью.
            onSwapped?.(newId);
          }}
        />
      )}

      {damageOpen && (
        <DamageReportDialog
          rental={rental}
          onClose={() => setDamageOpen(false)}
          onCreated={(reportId) => {
            // После создания акта — открываем превью для печати.
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

/** Превью акта приёма-передачи и замены скутера (после замены).
 *  Открывается из SwapScooterDialog по кнопке «Заменить и распечатать
 *  акт» — использует новый шаблон act_swap, в котором есть блок про
 *  возвращённый скутер, причину замены и переданный новый скутер.
 *  Экспортируется чтобы Rentals.tsx мог рендерить превью у себя поверх
 *  любой карточки (см. RentalCard.onSwapped). */
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

type KpiAccent = "default" | "blue" | "red" | "muted";

function KpiCard({
  label,
  value,
  hint,
  hintIcon: HintIcon,
  badgeIcon: BadgeIcon,
  accent = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  hintIcon?: React.ComponentType<{ size?: number | string; className?: string }>;
  badgeIcon?: React.ComponentType<{ size?: number | string; className?: string }>;
  accent?: KpiAccent;
}) {
  return (
    <div
      className={cn(
        "relative rounded-[14px] border px-4 py-3 shadow-card-sm",
        accent === "muted"
          ? "border-border bg-surface-soft/60"
          : accent === "red"
            ? "border-red-soft bg-surface shadow-[0_0_16px_-2px_hsl(var(--red-ink)/0.35),0_0_0_1px_hsl(var(--red-soft))]"
            : "border-border bg-surface",
      )}
    >
      {BadgeIcon && (
        <BadgeIcon
          size={18}
          className={cn(
            "absolute right-3 top-3 shrink-0",
            accent === "blue" ? "text-blue-600" : "text-muted-2",
          )}
        />
      )}
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-[20px] font-extrabold leading-tight tabular-nums",
          accent === "blue"
            ? "text-blue-600"
            : accent === "red"
              ? "text-red-ink"
              : accent === "muted"
                ? "text-muted"
                : "text-ink",
        )}
      >
        {value}
      </div>
      {hint && (
        <div
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider",
            accent === "blue"
              ? "text-blue-600"
              : accent === "red"
                ? "text-red-ink"
                : "text-muted-2",
          )}
        >
          {HintIcon && <HintIcon size={12} className="shrink-0" />}
          {hint}
        </div>
      )}
    </div>
  );
}

function pluralRental(n: number): string {
  const a = Math.abs(n);
  const n10 = a % 10;
  const n100 = a % 100;
  if (n10 === 1 && n100 !== 11) return "аренду";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "аренды";
  return "аренд";
}

