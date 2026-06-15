import { useMemo, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bike,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Flag,
  PhoneOff,
  Phone,
  PanelRightClose,
  Plus,
  ShieldAlert,
  SquareParking,
  StickyNote,
  Pin,
  User,
  Wallet,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/useIsMobile";
import { MobileBottomSheet } from "@/mobile/BottomSheet";
import {
  MIN_RENTAL_DAYS,
  ratePeriodForDays,
  STATUS_LABEL,
  STATUS_TONE,
  type Rental,
  type RentalStatus,
} from "@/lib/mock/rentals";
import { effectiveRentalStatus } from "@/lib/rentalStatus";
import { useClientUnreachable, clientStore } from "@/pages/clients/clientStore";
import { StickerStack, NoteComposer } from "@/components/StickerStack";
import { useRollbackTarget, RollbackButton } from "./RollbackLastAction";
import {
  useRentalCardStickers,
  useCreateSticker,
  useUnpinSticker,
  useDeleteSticker,
  useRepinSticker,
} from "@/lib/api/stickers";
import {
  clientsKeys,
  useApiClients,
  useClientDebtSources,
} from "@/lib/api/clients";
import { queryClient } from "@/lib/queryClient";
import { useApiScooters } from "@/lib/api/scooters";
import { navigate } from "@/app/navigationStore";
// v0.6.44: tabs убраны из карточки — новый 2-col layout (MasterBlock +
// CalendarPanel/DocsInline). Сами компоненты табов остаются доступны
// для других мест (например, drawer-режим использует HistoryTab).
import { MasterBlock } from "./rental-card/MasterBlock";
import { AccordionSection } from "./rental-card/AccordionSection";
import { CalendarPanel } from "./rental-card/CalendarPanel";
import { DocsInline } from "./rental-card/DocsInline";
import { InlineHistory } from "./rental-card/InlineHistory";
import { ClientDebtBadge } from "./rental-card/ClientDebtBadge";
import { RentalBodyBreakdown } from "./rental-card/RentalBodyBreakdown";
import { SideDrawer } from "./rental-card/SideDrawer";
import { useActivityTimeline } from "@/lib/api/activity";
import { HistoryTab, type HistoryFilter } from "./RentalCardTabs";
import { RentalActionDialog, type ActionKind } from "./RentalActionDialog";
import { ExtendRentalDialog } from "./ExtendRentalDialog";
import { PaymentAcceptDialog } from "./PaymentAcceptDialog";
import { askRentalDeleteReason } from "./deleteRentalReason";
import { SwapScooterDialog } from "./SwapScooterDialog";
import { DamageReportDialog } from "./DamageReportDialog";
import { EquipmentChangeDialog } from "./EquipmentChangeDialog";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { useChainDamageReports } from "@/lib/api/damage-reports";
import {
  useRentalDebt,
  useChargeManualDebt,
  useForgiveOverdue,
  equipmentDebtPortion,
} from "@/lib/api/debt";
import { useRentalParking, useEndParking } from "@/lib/api/parking";
import { RentalActionsMenu, type MenuAction } from "./RentalActionsMenu";
import {
  getRentalChainIds,
  patchRental,
  useChainPayments,
  useRentalPayments,
  useRentals,
  useArchivedRentals,
} from "./rentalsStore";
import { useModelRateResolver } from "@/lib/api/scooter-models";
import { ClientQuickView } from "@/pages/clients/ClientQuickView";
import { Eraser, Trash2, RotateCcw } from "lucide-react";
import {
  useDeleteRental,
  usePurgeRental,
  useResetRentalChain,
  useUnarchiveRental,
} from "@/lib/api/rentals";
import { useDashboardDrawer } from "@/pages/dashboard/DashboardDrawer";
import { useMe } from "@/lib/api/auth";
import { confirmDialog, pickAction, promptDialog } from "@/lib/toast";
import { toast } from "@/lib/toast";
import { ApiError, api } from "@/lib/api";

// v0.6.44: tabs убраны, оставлен type-alias для совместимости с props
// (initialTab — может прийти при navigate с дашборда через openTab).
// Сам выбор таба никуда не идёт.
type TabId = "terms" | "history" | "debt" | "tasks" | "docs";

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "0";
  return n.toLocaleString("ru-RU");
}

function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
}

/** DD.MM.YYYY → YYYY-MM-DD (для расчёта границ веток продления). */
function ruToIsoLocal(ru: string | undefined | null): string | null {
  if (!ru) return null;
  const m = ru.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Прибавляет days к ISO-дате (YYYY-MM-DD), возвращает ISO. days может быть <0. */
function addDaysIsoLocal(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
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
    // v0.8.15: добавление заметки-стикера — вынесено в меню (раньше парящая
    // кнопка «+ Заметка» рядом со стопкой).
    {
      id: "add-note",
      label: "Добавить заметку",
      icon: StickyNote,
      tone: "ghost",
    },
    {
      id: "set-damage",
      label: opts.hasDamage ? "Изменить ущерб" : "Зафиксировать ущерб",
      icon: Wrench,
      tone: "warn",
    },
    // v0.3.8: ручное начисление долга — на любых живых статусах.
    {
      id: "charge-debt",
      label: "Начислить долг",
      icon: Plus,
      tone: "warn",
    },
    // v0.8.0: паркинг — дубль точки входа (основная кнопка 🅿 в календаре).
    {
      id: "set-parking",
      label: "Поставить на паркинг",
      icon: SquareParking,
      tone: "primary",
    },
    // v0.3.8: списание просрочки — только если есть начисленная просрочка.
    // Само действие проверит наличие на сервере и вернёт ошибку если нет.
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
      // v0.4.48: убрали «Принять платёж» из меню действий — он
      // дублировал основной CTA на карточке аренды (PaymentAcceptDialog),
      // вёл на старый RentalActionDialog (legacy форма с типами
      // rent/fine/damage/deposit без депозита/залога/просрочки).
      return withExtras([
        { id: "complete", label: "Завершить аренду", icon: ArrowRight, tone: "ghost" },
      ]);
    case "overdue":
      // v0.4.68: убраны «Снять просрочку» и «Подать в полицию».
      //  • «Снять просрочку» (revert-overdue) дублировал «Сбросить
      //    просрочку» из withExtras (forgive-overdue) — оставляем
      //    только последний (он уже добавляется через withExtras).
      //  • «Подать в полицию» — исключение из обычного flow; если
      //    реально нужно — оператор фиксирует ущерб (Зафиксировать
      //    ущерб) и далее работает по акту, претензии и/или
      //    отдельным процедурам, без отдельной кнопки в карточке.
      return withExtras([
        { id: "complete", label: "Завершить аренду", icon: ArrowRight, tone: "primary" },
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
        { id: "revert-completion", label: "Перевести в активную", icon: RotateCcw, tone: "primary" },
      ];
    case "completed_damage":
      return withExtras([
        { id: "normalize-status", label: "Сбросить «проблемная» (если долгов нет)", icon: CheckCircle2, tone: "primary" },
        { id: "resume-damage", label: "Возобновить аренду", icon: RotateCcw, tone: "ghost" },
        { id: "claim", label: "Досудебная претензия", icon: AlertTriangle, tone: "warn" },
      ]);
    case "problem":
      return withExtras([
        { id: "normalize-status", label: "Сбросить «проблемная» (если долгов нет)", icon: CheckCircle2, tone: "primary" },
        { id: "claim", label: "Распечатать претензию", icon: AlertTriangle, tone: "warn" },
        { id: "resume-damage", label: "Возобновить аренду", icon: RotateCcw, tone: "ghost" },
      ]);
    case "police":
    case "court":
      // v0.4.36: добавлены действия выхода. Раньше из police/court
      // нельзя было ничего сделать — аренда зависала. Теперь:
      //  • «Скутер вернулся» — закрываем как completed (пишем когда дело
      //    разрешилось — клиент вернул скутер либо разбирательство
      //    окончено и скутер фактически вернулся в парк).
      //  • «Закрыть с ущербом» — переводим в problem чтобы оператор
      //    оформил damage_report и взыскал убытки штатно.
      //  • «Отменить дело» — аренда возвращается в overdue (если
      //    непросрочена — в active), оператор продолжает обычную
      //    работу с долгом.
      return withExtras([
        {
          id: "complete",
          label: "Скутер вернулся — завершить",
          icon: CheckCircle2,
          tone: "primary",
        },
        {
          id: "set-damage",
          label: "Закрыть с ущербом",
          icon: Wrench,
          tone: "warn",
        },
        {
          id: "revert-police",
          label: "Отменить дело — вернуть в работу",
          icon: RotateCcw,
          tone: "ghost",
        },
      ]);
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
  onClose,
  onRequestPayment,
  paymentExtDays,
  paymentDateIso,
  paymentResetSignal,
  onPaymentOpenChange,
  onOpenHistory,
  initialTab,
  flushLeft = false,
  drawerChrome = false,
  besideDrawerOpen = false,
  paymentOpen = false,
}: {
  rental: Rental;
  /** Callback в Rentals при успешной замене скутера. Rentals переключает
   *  selectedId на новую связку и поднимает превью акта замены поверх
   *  карточки — иначе при ремаунте RentalCard локальный state превью
   *  терялся, и превью никогда не показывалось. */
  onSwapped?: (newRentalId: number) => void;
  onClose?: () => void;
  /** v0.7.3: запрос на открытие Payment-панели у родителя (Rentals).
   *  Payment теперь рендерится как третья колонка на уровне страницы
   *  (push, не overlay внутри карточки). extDays — предзаполнение числа
   *  дней продления (приходит из drag-to-extend на календаре карточки;
   *  для кнопки footer'а «Принять оплату» = 0). Если prop не передан
   *  (DashboardDrawer) — карточка открывает Payment внутри себя как
   *  раньше (inline-fallback через paymentRentalId). */
  onRequestPayment?: (rentalId: number, extDays: number) => void;
  /** v0.9: открыта ли сейчас панель/окно оплаты ИМЕННО для этой аренды
   *  (parent-managed на стр. Аренды). Когда true — кнопки «Принять оплату»
   *  на карточке дизейблятся (модуль уже открыт по ним). */
  paymentOpen?: boolean;
  /** v0.7.3: при parent-managed Payment — текущее число дней продления
   *  (живёт в Rentals, синхронизируется с Payment-колонкой). Календарь
   *  карточки отражает это значение, чтобы drag/Payment были согласованы. */
  paymentExtDays?: number;
  /** v0.9.4: дата фактической оплаты из окна «Принять платёж» (back-date).
   *  Календарь карточки якорит превью продления на max(plannedEnd, дата
   *  оплаты) — синхронно с «новым возвратом» в окне. */
  paymentDateIso?: string | null;
  /** v0.7.3: сигнал сброса календаря карточки — родитель бампает его при
   *  закрытии Payment-колонки, чтобы drag-extend на календаре обнулился. */
  paymentResetSignal?: number;
  onPaymentOpenChange?: (open: boolean) => void;
  /** v0.7.9: запрос на открытие полной истории аренды у родителя (Rentals).
   *  История теперь рендерится как push-колонка на уровне страницы (как
   *  Payment), а не overlay-SideDrawer поверх карточки. Если prop не передан
   *  (DashboardDrawer) — карточка открывает историю в себе через
   *  overlay-SideDrawer (historyOpen fallback). */
  onOpenHistory?: (rentalId: number, filter?: HistoryFilter) => void;
  /** v0.3.8: какой таб открыть по умолчанию (используется при навигации
   *  с дашборда: клик по должнику → openTab='debt' → таб «История долгов»). */
  initialTab?: TabId;
  /** v0.6.50: на странице Аренд карточка «упирается» в блок списка слева —
   *  убираем левое скругление и добавляем `border-l` для разделителя.
   *  Drawer-режим (DashboardDrawer) этот prop не передаёт — там карточка
   *  остаётся полностью скруглённой. */
  flushLeft?: boolean;
  /** v0.7.0: карточка рендерится как правый drawer на странице Аренд.
   *  Включает «хром» drawer'а: sticky-header (закрыть/меню), скроллируемое
   *  тело, sticky-footer с кнопками «Закрыть аренду» / «Принять оплату».
   *  Без этого prop'а (DashboardDrawer) карточка остаётся плоским блоком. */
  drawerChrome?: boolean;
  /** v0.8.28 (H2): рядом открыт push-дровер (история/оплата) — прячем
   *  оверлей стикеров, чтобы он не перекрывал дровер. */
  besideDrawerOpen?: boolean;
}) {
  void onPaymentOpenChange;
  void initialTab; // v0.6.44: tabs убраны, prop оставлен для совместимости.
  const [action, setAction] = useState<ActionKind | null>(null);
  const [extendOpen, setExtendOpen] = useState(false);
  // v0.8.0: бамп для входа в режим паркинга из ⋯-меню (CalendarPanel слушает).
  const [armParkingSignal, setArmParkingSignal] = useState(0);
  // v0.3.9: после продления / оплаты — открываем диалог приёма оплаты
  // на новой связке. Хранится rentalId, чтобы пережить перерендер.
  const [paymentRentalId, setPaymentRentalId] = useState<number | null>(null);
  const [paymentPrefillExtDays, setPaymentPrefillExtDays] = useState(0);
  const [calendarResetSignal, setCalendarResetSignal] = useState(0);
  // v0.4.49: модалки пополнения залога и изменения экипировки
  const [equipmentChangeOpen, setEquipmentChangeOpen] = useState(false);
  const [damageOpen, setDamageOpen] = useState(false);
  const [editingReportId, setEditingReportId] = useState<number | null>(null);
  const [previewDamageId, setPreviewDamageId] = useState<number | null>(null);
  const [previewClaimId, setPreviewClaimId] = useState<number | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [clientQuickView, setClientQuickView] = useState(false);
  // v0.6.50: drawer полной истории по аренде — открывается из InlineHistory
  // («Все события →»). Внутри drawer'а рендерим тот же HistoryTab что и
  // в legacy-табе «История».
  const [historyOpen, setHistoryOpen] = useState(false);
  // v0.3.1 (idea 2: stacking drawers): когда RentalCard рендерится
  // ВНУТРИ drawer'а на дашборде — клик на клиента не должен открывать
  // отдельный ClientQuickView, а должен класть «client» поверх стека
  // drawer'а. Эффект: над текущим rental drawer'ом всплывает client
  // view; Esc / X возвращает к rental drawer'у.
  // Если RentalCard на странице аренд (вне drawer'а) — useDashboardDrawer
  // вернёт inDrawer=false, поведение сохранится прежнее (локальная
  // ClientQuickView через setClientQuickView).
  const drawer = useDashboardDrawer();
  const isMobile = useIsMobile();
  const openClient = (clientId: number) => {
    if (drawer.inDrawer) drawer.openClientChain(clientId);
    else setClientQuickView(true);
  };
  // F3: открыть тело аренды-источника долга. Десктоп — drawer-цепочка (грузит
  // по id, в т.ч. архивные, работает и на стр. Аренды, и в дашборд-дровере).
  // Мобилка — навигация на вкладку Аренды (там MobileRentals откроет карточку).
  const openSourceRental = (rentalId: number) => {
    if (isMobile) navigate({ route: "rentals", rentalId });
    else drawer.openRentalChain(rentalId);
  };
  const { data: me } = useMe();
  const deleteRental = useDeleteRental();
  const unarchiveRental = useUnarchiveRental();
  const purgeRental = usePurgeRental();
  const resetChain = useResetRentalChain();
  const isArchived = !!rental.archivedAt;
  const isCreator = me?.role === "creator";
  // C2: источники сквозного долга клиента (ущерб с других аренд) — для
  // значка-алёрта в блоке клиента. Долг текущей цепочки исключаем ниже.
  const { data: clientDebtSources } = useClientDebtSources(rental.clientId);

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
  // v0.6.50: «Изменить период» — резолвер ставки по тарифной сетке модели
  // (тот же источник, что в создании/продлении) + платежи именно этой
  // аренды (для определения уже оплаченной аренды при сокращении).
  const resolveRate = useModelRateResolver();
  const rentalPayments = useRentalPayments(rental.id);
  // v0.6.50: лента событий по аренде для inline-блока «Последние события»
  // под календарём. Полный список — в drawer'е (HistoryTab).
  const activityQ = useActivityTimeline("rental", rental.id, 50);
  const activityItems = activityQ.data?.items ?? [];
  // Откат «в день совершения»: есть ли сегодня откатываемая операция
  // (продление / изменение экипировки). Если есть — кнопка «Откатить»
  // рендерится прямо на строке этой операции в хронологии
  // (InlineHistory.rollback). Истекло / сверху новое действие — null.
  const rbTarget = useRollbackTarget(rental, activityItems);
  const rollbackSlot = rbTarget
    ? {
        anchorId: rbTarget.anchorId,
        node: (
          <RollbackButton rental={rental} target={rbTarget} onClose={onClose} />
        ),
      }
    : undefined;

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

  // v0.4.53: effectiveStatus теперь учитывает долг — если 0, не
  // показываем красную просрочку даже когда endPlanned в прошлом.
  // Реальный totalDebt считается ниже (debtSummary), так что
  // initial значение — обычная формула без долга. Перевычислим
  // когда debtSummary подгрузится (см. ниже useEffect не нужен,
  // useMemo сам пересчитает на render).
  const isUnreachable = useClientUnreachable(rental.clientId);

  // v0.8.12+: стикеры-заметки карточки (заметки аренды + комментарии по связи
  // клиента). Добавление/открепление/удаление пишется в журнал действий.
  const { stickers } = useRentalCardStickers(rental.id, rental.clientId);
  // Все заметки (включая откреплённые) — для раздела «Заметки».
  const { stickers: allStickers } = useRentalCardStickers(
    rental.id,
    rental.clientId,
    true,
  );
  const createStickerMut = useCreateSticker();
  const unpinStickerMut = useUnpinSticker();
  const deleteStickerMut = useDeleteSticker();
  const repinStickerMut = useRepinSticker();
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  // v0.8.18: якорь правого края карточки — оверлей стикеров рендерим порталом
  // поверх (вне клиппящего фрейма), позиционируем по rect карточки. rAF
  // отслеживает позицию во время анимаций drawer'а.
  const cardRootRef = useRef<HTMLDivElement>(null);
  const [cardRect, setCardRect] = useState<{
    top: number;
    right: number;
    left: number;
  } | null>(null);
  useEffect(() => {
    if (!drawerChrome) return;
    let raf = 0;
    let prev = "";
    const tick = () => {
      const el = cardRootRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const key = `${Math.round(r.top)}|${Math.round(r.right)}|${Math.round(r.left)}`;
        if (key !== prev) {
          prev = key;
          setCardRect({ top: r.top, right: r.right, left: r.left });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drawerChrome]);
  const addRentalNote = (text: string, color: string) =>
    createStickerMut.mutate({
      entity: "rental",
      entityId: rental.id,
      kind: "note",
      text,
      color,
    });
  const unpinSticker = (id: number) =>
    unpinStickerMut.mutate(
      { id },
      {
        onSuccess: () =>
          toast.success(
            "Заметка откреплена",
            "Хранится в разделе «Заметки» этой карточки",
          ),
      },
    );
  const deleteSticker = (id: number) => deleteStickerMut.mutate({ id });
  const repinSticker = (id: number) =>
    repinStickerMut.mutate(
      { id },
      { onSuccess: () => toast.success("Заметка снова на карточке") },
    );
  // Переключение статуса связи клиента прямо из карточки. При включении —
  // сразу предлагаем прикрепить комментарий-стикер (kind=contact на клиента).
  const toggleUnreachable = async () => {
    const next = !isUnreachable;
    clientStore.setUnreachable(rental.clientId, next);
    if (next && rental.clientId) {
      const t = await promptDialog({
        title: "Не выходит на связь",
        message: "Комментарий (необязательно) — прикрепится стикером к клиенту.",
        placeholder: "напр. звонили 29.05, не берёт трубку",
        multiline: true,
        confirmText: "Прикрепить",
        cancelText: "Без комментария",
      });
      if (t)
        createStickerMut.mutate({
          entity: "client",
          entityId: rental.clientId,
          kind: "contact",
          text: t,
          color: "orange",
        });
    }
  };

  // Текущий статус скутера — нужен для «возобновить аренду» (resume-damage)
  // и для подсветки блока скутера «в ремонте» внутри MasterBlock (C1).
  const { data: apiScooters = [] } = useApiScooters();
  const currentScooter =
    rental.scooterId != null
      ? apiScooters.find((s) => s.id === rental.scooterId) ?? null
      : null;

  // Акты о повреждениях по ВСЕЙ цепочке аренд (включая удалённые
  // сегменты — chainIdsFull, не chainIds). Заказчик в задаче 2 v0.2.91:
  //   «если мы продлили аренду, погасили долг, потом удалили связку
  //    продления — инфа по оплаченному долгу должна оставаться,
  //    мы же не откатились назад, мы просто передумали учитывать
  //    продление».
  // Долг по ущербу живёт независимо от структуры цепочки — фиксируется
  // на damage_report и никуда не пропадает при удалении связок.
  const damageReports = useChainDamageReports(chainIdsFull);
  const reports = damageReports.data;
  const totalDebt = reports.reduce((s, r) => s + r.debt, 0);
  // v0.3.8: серверная сводка по долгу — просрочка/ручной/ущерб + лента
  // событий (для таба «История долгов»). Источник правды для KPI «Долг».
  const debtQ = useRentalDebt(rental.id);
  const debtSummary = debtQ.data;
  // v0.4.53: суммарный долг для определения «просрочка / просто
  // ожидаем возврата». Pending rent (paid=false) НЕ считаем —
  // это плановая оплата, не просрочка.
  const overdueRelatedDebt =
    (debtSummary?.overdueBalance ?? 0) +
    (debtSummary?.damageBalance ?? totalDebt) +
    (debtSummary?.manualBalance ?? 0);
  const effectiveStatus = effectiveRentalStatus(
    rental.status,
    rental.endPlanned,
    overdueRelatedDebt,
  );
  const tone = STATUS_TONE[effectiveStatus] ?? STATUS_TONE[rental.status];

  // v0.8.0: состояние паркинга для баннера/пилюли.
  const { sessions: parkingList } = useRentalParking(rental.id);
  const endParkingMut = useEndParking();
  const todayYmd = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const activeParking =
    parkingList.find(
      (s) =>
        s.status === "active" &&
        s.startDate <= todayYmd &&
        s.endDate >= todayYmd,
    ) ?? null;
  const parkingDayN = activeParking
    ? Math.min(
        activeParking.days,
        Math.floor(
          (Date.parse(`${todayYmd}T00:00:00Z`) -
            Date.parse(`${activeParking.startDate}T00:00:00Z`)) /
            86_400_000,
        ) + 1,
      )
    : 0;

  const chargeManualMut = useChargeManualDebt();
  const forgiveOverdueMut = useForgiveOverdue();
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
  // v0.8.x: «Изменить аренду» (сырая правка денег/периода) убрана из меню.
  // Все правки — безопасными кнопками в карточке: «Изменить период» (даты/
  // сумма с реконсиляцией платежей), «Заменить скутер», экипировка, залог.
  // Чистка лишних продлений/замен осталась у директора через «Очистить все
  // действия по этой аренде» + Ревизор расхождений.
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
          ...actionsWithoutComplete,
          ...(canDelete ? [deleteAction] : []),
          ...(isCreator ? [resetChainAction, purgeAction] : []),
        ]
      : [
          ...actionsWithoutComplete,
          ...(canDelete ? [deleteAction] : []),
          ...(isCreator ? [resetChainAction, purgeAction] : []),
        ];

  // Финансы — считаются по ВСЕЙ цепочке продлений.
  // v0.5.1: KPI «За всё время аренды» = СУММА ВСЕХ платежей по аренде
  // (rent + fine + damage + manual + swap_fee + equipment_fee), которые
  // клиент реально внёс. Раньше damage был исключён (бизнес-правка v0.2.91:
  // «ущерб ≠ доход от аренды»), но заказчик уточнил по v0.5: «должна
  // складывать за аренды, оплаты за просрочки, долги — все платежи которые
  // были в этой аренде». Из расчёта по-прежнему исключаем:
  //   • refund — возврат залога клиенту (отрицательная операция)
  //   • deposit — приём залога (возвратный, не доход)
  //   • method='deposit' — оплата за счёт залога/депозита клиента (уже учли)
  const paidIn = chainPayments
    .filter(
      (p) =>
        p.paid &&
        p.type !== "refund" &&
        p.type !== "deposit" &&
        p.method !== "deposit",
    )
    .reduce((s, p) => s + p.amount, 0);
  // v0.8.8: список финопераций для ховера «За всё время» (оплаченные,
  // кроме залога/возврата). Сверху — свежие.
  const FIN_TYPE_LABEL: Record<string, string> = {
    rent: "Аренда",
    fine: "Штраф",
    damage: "Оплата ущерба",
    swap_fee: "Замена скутера",
    equipment_fee: "Экипировка",
    parking: "Паркинг",
  };
  // v0.8.16 (C2): период каждой финоперации для ховера «За всё время».
  // Аренда/штраф/замена/экипировка → период аренды (по rentalId платежа);
  // паркинг → период парковочных сессий этой аренды (min..max).
  const rentalByIdFin = new Map(chainRentals.map((r) => [r.id, r]));
  const ruShort = (s?: string | null) => (s ? s.slice(0, 5) : "");
  const ymdShort = (ymd?: string | null) => {
    const m = (ymd ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}.${m[2]}` : "";
  };
  const opPeriod = (p: { type: string; rentalId: number }): string | null => {
    if (p.type === "parking") {
      const ss = parkingList.filter((s) => s.rentalId === p.rentalId);
      if (!ss.length) return null;
      const start = ss.reduce((m, s) => (s.startDate < m ? s.startDate : m), ss[0]!.startDate);
      const end = ss.reduce((m, s) => (s.endDate > m ? s.endDate : m), ss[0]!.endDate);
      return `${ymdShort(start)}–${ymdShort(end)}`;
    }
    const r = rentalByIdFin.get(p.rentalId);
    if (r) return `${ruShort(r.start)}–${ruShort(r.endPlanned)}`;
    return null;
  };
  const financeOps = chainPayments
    .filter(
      (p) =>
        p.paid &&
        p.type !== "refund" &&
        p.type !== "deposit" &&
        p.method !== "deposit",
    )
    .slice()
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .map((p) => ({
      label: FIN_TYPE_LABEL[p.type] ?? p.type,
      amount: p.amount,
      // p.date уже в русском формате «dd.mm.yyyy[ HH:MM]» (isoToRu),
      // new Date() его не парсит → берём «dd.mm» напрямую из строки.
      date: p.date ? p.date.slice(0, 5) : null,
      period: opPeriod(p),
    }));
  // pending (плашка «Долг») — суммируем неоплаченные платежи ТОЛЬКО
  // по полностью активным связкам цепочки (archivedAt == null).
  // Auto-archived родители (после extend) могли оставить orphan-платежи
  // от старой логики — они задолженности не отражают, бизнес-периодически
  // закрыты следующей связкой. Без этого фильтра карточка показывала
  // фантомный долг типа 3000 ₽ при полностью оплаченной активной аренде.
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
  // chainExpected больше не используется в UI карточки (убрали «X% по
  // цепочке»). Оставляем переменную для будущих метрик/отчётов —
  // void чтобы линтер не ругался.
  void chainExpected;

  // v0.7.8: состав долга/просрочки — единый источник для KPI-плашек,
  // их hover-поповеров и accordion-секции «Финансовая информация».
  // Логика НЕ меняется: те же поля debtSummary что и в KPI-плашке ниже.
  const overdueLocalCalc =
    rental.status === "overdue"
      ? Math.max(1, daysLeft !== null ? Math.abs(daysLeft) : 1) *
        Math.round(
          (rental.rateUnit === "week" ? rental.rate / 7 : rental.rate) * 1.5,
        )
      : 0;
  const overdueBalance = debtSummary?.overdueBalance ?? overdueLocalCalc;
  const overdueDaysBalance = debtSummary?.overdueDaysBalance ?? 0;
  const overdueFineBalance = debtSummary?.overdueFineBalance ?? 0;
  // v0.9: кол-во дней просрочки + дневные ставки. Считаем здесь (выше
  // debtParts), чтобы разложить «дни» на аренду и экипировку и в составе
  // долга, и в коротком хинте под KPI «Долг».
  const overdueDaysCount =
    daysLeft !== null && daysLeft < 0 ? Math.abs(daysLeft) : 0;
  const dailyRateForHint =
    rental.rateUnit === "week" ? Math.round(rental.rate / 7) : rental.rate;
  // Платная экипировка/сут (как overdueDailyRate на бэке: ставка/сут +
  // экип/сут). День просрочки = аренда + экипировка; штраф 50% от их суммы.
  const equipDailyForOverdue = (rental.equipmentJson ?? []).reduce(
    (s, e) => s + (e.free ? 0 : e.price),
    0,
  );
  const fullDailyForOverdue = dailyRateForHint + equipDailyForOverdue;
  // Раскладка ТЕКУЩЕГО остатка «дни просрочки» (из API) на экипировку и
  // аренду. Экипировка не превышает остаток; аренда — остаток за вычетом
  // экипировки. Так аренда + экипировка всегда равны overdueDaysBalance.
  const overdueEquipBalance = Math.min(
    overdueDaysBalance,
    equipDailyForOverdue * overdueDaysCount,
  );
  const overdueRentBalance = Math.max(
    0,
    overdueDaysBalance - overdueEquipBalance,
  );
  const damageBalance = debtSummary?.damageBalance ?? totalDebt;
  const manualBalance = debtSummary?.manualBalance ?? 0;
  // #179: у каждого долга — понятная подпись «за что». Экипировочную доплату
  // (manual_charge с комментарием «Изменение экипировки …») отделяем от
  // обезличенного «ручного начисления» → подпись «за экипировку».
  const equipmentManualBalance = equipmentDebtPortion(debtSummary);
  const otherManualBalance = Math.max(0, manualBalance - equipmentManualBalance);
  // v0.8.0: неоплаченный паркинг — часть долга (с подписью «паркинг»).
  const parkingBalance = debtSummary?.parkingBalance ?? 0;
  // Кол-во неоплаченных дней паркинга — для подписи «за N дн».
  const unpaidParkingDays = parkingList
    .filter((s) => s.amount > s.paidAmount)
    .reduce((sum, s) => sum + s.days, 0);
  const debtTotal =
    pending + overdueBalance + damageBalance + manualBalance + parkingBalance;
  // C4: длинная строка-состав долга (debtParts/debtHint) убрана из KPI —
  // состав теперь только в hover-поповере «Долг». Карточка не растягивается.

  const handleAction = async (id: string) => {
    if (id === "extend") return setExtendOpen(true);
    if (id === "add-note") return setAddNoteOpen(true);
    // v0.8.0: вход в режим паркинга (основная кнопка 🅿 — в календаре).
    if (id === "set-parking") return setArmParkingSignal((n) => n + 1);
    if (id === "revert-completion") {
      // v0.5.1: возврат завершённой аренды в active. Используется когда
      // оператор случайно нажал «Завершить» или клиент передумал.
      const okRevert = await confirmDialog({
        title: "Перевести аренду в активную?",
        message:
          "Перевести завершённую аренду обратно в активную? Будет снят флаг возврата залога и удалена запись приёмки.",
        confirmText: "Перевести",
      });
      if (!okRevert) return;
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
      // v0.2.91: возобновление аренды требует ВАЛИДНОГО скутера —
      // active rental не может быть без скутера или со скутером в
      // статусе repair. Если такая ситуация — открываем диалог замены,
      // оператор подберёт новый. После успешной замены аренда автоматом
      // окажется active (swap-scooter сам ставит status='active'). Если
      // прежний скутер в parke — возвращаем как есть.
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
      // Стандартный путь — скутер на месте, просто возвращаем active.
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
        toast.success(
          "Аренда возобновлена",
          "Скутер активен, можно продолжить работу с клиентом.",
        );
      } catch (e) {
        toast.error("Не удалось возобновить", (e as Error).message ?? "");
      }
      return;
    }
    if (id === "normalize-status") {
      // v0.4.26: ручная нормализация статуса проблемной аренды.
      // Бэк сам решит active vs completed по endActualAt.
      try {
        const res = await api.post<{ ok: true; newStatus: string }>(
          `/api/rentals/${rental.id}/normalize-status`,
          {},
        );
        toast.success(
          "Статус сброшен",
          `Новый статус: «${res.newStatus === "active" ? "Активная" : "Завершена"}». Запись в Истории.`,
        );
      } catch (e) {
        const msg = (e as { body?: { error?: string } }).body?.error;
        if (msg === "wrong_status") {
          toast.info(
            "Статус нормальный",
            "Аренда уже не в проблемном статусе.",
          );
        } else {
          toast.error("Не удалось", (e as Error).message ?? "");
        }
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
    if (id === "charge-debt") {
      // v0.3.8: ручное начисление долга. Минимум сумма + комментарий.
      // Используем простую цепочку prompt() — отдельной модалки не делаем,
      // действие редкое и хочется один клик-ответ.
      const amountStr = await promptDialog({
        title: "Сумма долга, ₽",
        placeholder: "Например, 1500",
      });
      if (!amountStr) return;
      const amount = Number(amountStr.replace(/\D/g, ""));
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Неверная сумма", "Введите положительное число.");
        return;
      }
      const comment = await promptDialog({
        title: "Комментарий — за что начисляем долг (видно всем):",
        multiline: true,
      });
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
          `+${amount.toLocaleString("ru-RU")} ₽ по аренде. Запись в Истории долгов.`,
        );
      } catch (e) {
        toast.error("Не удалось начислить", (e as Error).message ?? "");
      }
      return;
    }
    if (id === "forgive-overdue") {
      // v0.4.3: списание просрочки с выбором — ВСЯ просрочка или только
      // штраф 50%. Просрочка состоит из двух компонентов:
      //   • неоплаченные дни (rate × дни)
      //   • штраф 50% (rate × 0.5 × дни)
      // Постоянному клиенту можно простить штраф, оставив дни как
      // обычную аренду.
      const days = debtSummary?.overdueDaysBalance ?? 0;
      const fine = debtSummary?.overdueFineBalance ?? 0;
      const total = days + fine;
      if (total <= 0) {
        toast.info("Нет просрочки", "Сбрасывать нечего.");
        return;
      }
      // v0.4.55: четвёртый вариант — частичное прощение N дней.
      // При выборе оператор вводит число дней; ENPlanned сдвинется
      // на эти дни автоматически (бэк), статус нормализуется в active
      // если новый endPlanned в будущем.
      const overdueDaysCount = debtSummary?.overdueDays ?? 0;
      // v0.4.73: при прощении дней автоматически списывается штраф за эти
      // же дни (бэк делает это в одной транзакции). Считаем сколько именно
      // дней покрывает текущий days-balance и сколько штрафа уйдёт вместе.
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
            hint: `${totalIfDays.toLocaleString("ru-RU")} ₽: дни ${days.toLocaleString("ru-RU")} ₽ + штраф за эти дни ${fineCoveredByDays.toLocaleString("ru-RU")} ₽. endPlanned +${daysCovered} дн.`,
            disabled: days <= 0,
          },
          {
            id: "days_partial",
            label: "Только N дней (укажу сколько)",
            hint: `Простит выбранные дни (включая штраф за эти же дни). Остальные останутся в долге.`,
            disabled: days <= 0,
          },
          {
            id: "fine",
            label: "Только штраф (без дней)",
            hint: `${fine.toLocaleString("ru-RU")} ₽ — штраф 50% × дни. Дни просрочки и endPlanned не меняются.`,
            disabled: fine <= 0,
          },
          {
            id: "all",
            label: "Всю просрочку (дни + штраф)",
            hint: `${total.toLocaleString("ru-RU")} ₽. endPlanned +${daysCovered} дн.`,
            tone: "danger",
          },
        ],
      });
      if (choice == null) return;

      // Если выбрано «частичное» — спрашиваем число дней
      let daysCount: number | undefined;
      if (choice === "days_partial") {
        const raw = await promptDialog({
          title: `Сколько дней простить? (доступно ${overdueDaysCount})`,
          initial: String(overdueDaysCount),
        });
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
      if (target === "fine" && fine <= 0) {
        toast.info("Нет штрафа", "Штраф уже списан или оплачен.");
        return;
      }
      const comment = await promptDialog({
        title: "Причина списания (необязательно):",
        multiline: true,
      });
      try {
        const r = await forgiveOverdueMut.mutateAsync({
          rentalId: rental.id,
          comment: comment ?? undefined,
          target,
          daysCount,
        });
        const successTitle =
          choice === "days_partial"
            ? `Прощено ${daysCount} дн просрочки`
            : target === "all"
              ? "Просрочка сброшена полностью"
              : target === "days"
                ? "Долг по дням списан"
                : "Штраф списан";
        const shiftHint = r.daysShift
          ? ` · endPlanned +${r.daysShift} дн${r.newStatus ? ", статус → active" : ""}`
          : "";
        toast.success(
          successTitle,
          `Списано ${(r.amount ?? 0).toLocaleString("ru-RU")} ₽. Запись в Истории долгов.${shiftHint}`,
        );
      } catch (e) {
        const msg = (e as { body?: { error?: string } }).body?.error;
        if (msg === "no_overdue") {
          toast.info(
            "Нет начисленной просрочки",
            "Сбрасывать нечего — клиент не в просрочке.",
          );
        } else if (msg === "already_zero") {
          toast.info(
            "Уже сброшена",
            "Долг по просрочке уже 0 — повторно сбрасывать нечего.",
          );
        } else {
          toast.error("Не удалось", (e as Error).message ?? "");
        }
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
      // G2: платёж по ущербу — через единое окно «Принять платёж».
      requestPayment(0);
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
      const rentalNo = `#${String(rental.id).padStart(4, "0")}`;
      // v0.6.51: причина удаления («Создано случайно» и т.п.) — сам выбор
      // причины и есть подтверждение; уходит в archivedReason + ленту.
      const reason = await askRentalDeleteReason(rentalNo);
      if (!reason) return;
      try {
        await deleteRental.mutateAsync({ id: rental.id, reason });
        toast.success("Аренда удалена", `${rentalNo} · ${reason}`);
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

  const handleCommitExtend = (days: number) => {
    if (rental.archivedAt || rental.status === "completed") return;
    const nextDays = Math.max(0, days);
    setPaymentPrefillExtDays(nextDays);
    if (nextDays > 0) {
      // v0.7.3: если родитель управляет Payment-колонкой (Rentals) —
      // делегируем открытие туда (push-колонка). Иначе (DashboardDrawer) —
      // открываем Payment внутри карточки как раньше.
      if (onRequestPayment) {
        onRequestPayment(rental.id, nextDays);
      } else if (paymentRentalId == null) {
        setPaymentRentalId(rental.id);
      }
    }
  };

  // v0.6.50: ставка ₽/сут для N дней — тарифная ступень по сетке модели.
  // Передаём в CalendarPanel как previewRate, чтобы превью и фиксация нового
  // периода считали ставку из того же источника, что создание/продление.
  const previewRate = (days: number): number =>
    resolveRate(rental, ratePeriodForDays(Math.max(MIN_RENTAL_DAYS, days)));

  // v0.8.x: «Изменить период» для ПРОДЛЁННЫХ аренд — правка ТОЛЬКО последней
  // ветки продления (анти-фрод: прошлые, уже оплаченные ветки не двигаем).
  //
  // Модель веток: первоначальный период (start → end1) + каждое продление
  // добавляет отдельный rent-платёж с заметкой «продление на N дн …» и
  // сдвигает endPlannedAt на N. Последняя ветка = самое позднее продление.
  //
  // Восстановление последней ветки из существующих данных:
  //   • Платёж последней ветки = rent-платёж с заметкой /продление на (\d+) дн/
  //     и НАИБОЛЬШИМ id (payments.id — bigserial, монотонен → больший id =
  //     более позднее продление). Заметки «оплата аренды», «Оплата N дн
  //     просрочки», «Оплата ручного долга» сюда НЕ попадают — это не ветки
  //     периода, а первоначалка / просрочка / ручной долг.
  //   • N (дни последней ветки) — из заметки этого платежа.
  //   • end1 = endPlanned (end2) − N дней — граница последней ветки.
  //   • Текущая оплаченная сумма последней ветки = amount этого платежа.
  const EXT_NOTE_RE = /продлени[ея]\s+на\s+(\d+)\s*дн/i;
  const lastBranch = useMemo(() => {
    const endIso = ruToIsoLocal(rental.endPlanned);
    if (!endIso) return null;
    const extPayments = rentalPayments
      .filter((p) => p.type === "rent" && EXT_NOTE_RE.test(p.note ?? ""))
      .map((p) => {
        const m = (p.note ?? "").match(EXT_NOTE_RE);
        return { p, branchDays: m ? Number(m[1]) : 0 };
      })
      .filter((x) => x.branchDays > 0);
    if (extPayments.length === 0) return null;
    // Самое позднее продление — максимальный id платежа.
    const last = extPayments.reduce((a, b) => (b.p.id > a.p.id ? b : a));
    const end1Iso = addDaysIsoLocal(endIso, -last.branchDays);
    return {
      paymentId: last.p.id,
      branchDays: last.branchDays,
      end1Iso, // граница последней ветки (ISO YYYY-MM-DD)
      end2Iso: endIso, // текущий возврат (ISO)
      paidBranchSum: last.p.paid ? last.p.amount : 0,
      currentBranchAmount: last.p.amount,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rentalPayments, rental.endPlanned]);

  // Аренду можно править «Изменить период» всегда (одно-периодную — как
  // раньше; продлённую — правя последнюю ветку). Кнопку больше не блокируем.
  const canEditPeriod = true;

  // v0.6.50 / v0.8.x: «Изменить период» — приходит из CalendarPanel с уже
  // пересчитанными ИТОГОВЫМИ {endPlannedAtIso, days, rate, sum, tariffPeriod}.
  // Для ПРОДЛЁННОЙ аренды CalendarPanel дополнительно присылает данные ветки:
  //   • rentPaymentId — какой rent-платёж синхронизировать (последняя ветка);
  //   • branchSum     — новая сумма ТОЛЬКО последней ветки (к ней подгоняем платёж);
  //   • paidBranchSum — сколько уже оплачено по этой ветке (для расчёта излишка).
  // Излишек/недоплата считаются ПО ВЕТКЕ (а не по всей аренде), потому что
  // прошлые ветки мы не трогаем — их платежи остаются как есть.
  const handleChangePeriod = async (next: {
    endPlannedAtIso: string;
    days: number;
    rate: number;
    sum: number;
    tariffPeriod: "short" | "week" | "month";
    /** v0.8.x: id rent-платежа последней ветки (только для продлённой аренды). */
    rentPaymentId?: number;
    /** v0.8.x: новая сумма последней ветки. */
    branchSum?: number;
    /** v0.8.x: уже оплачено по последней ветке. */
    paidBranchSum?: number;
  }) => {
    if (rental.archivedAt || rental.status === "completed") return;
    const isBranchEdit = next.rentPaymentId != null;
    const prevDays = rental.days;
    // ISO YYYY-MM-DD → DD.MM.YYYY (формат, который ждёт patchRental).
    const m = next.endPlannedAtIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      toast.error("Некорректная дата возврата");
      return;
    }
    const endPlannedRu = `${m[3]}.${m[2]}.${m[1]}`;

    // База для расчёта излишка:
    //   • продлённая аренда → оплачено по ВЕТКЕ vs новая сумма ВЕТКИ;
    //   • одно-периодная   → оплачено по аренде vs новая сумма аренды.
    // Если новая сумма меньше оплаченной — образуется излишек: спрашиваем
    // «в депозит» vs «выдать клиенту».
    const paidBase = isBranchEdit
      ? next.paidBranchSum ?? 0
      : rentalPayments
          .filter((p) => p.type === "rent" && p.paid)
          .reduce((s, p) => s + p.amount, 0);
    const newBase = isBranchEdit ? next.branchSum ?? 0 : next.sum;
    const overpay = paidBase > 0 ? paidBase - newBase : 0;

    let creditToDeposit = false;
    if (overpay > 0) {
      const choice = await pickAction<"deposit" | "cash">({
        title: "Аренда стала дешевле",
        message: `Уже оплачено ${fmt(paidBase)} ₽, новая сумма ${
          isBranchEdit ? "ветки " : ""
        }${fmt(newBase)} ₽. Излишек ${fmt(overpay)} ₽.`,
        options: [
          {
            id: "deposit",
            label: "В депозит клиента",
            hint: `Зачислим ${fmt(overpay)} ₽ на депозит — пойдёт в счёт будущих оплат.`,
          },
          {
            id: "cash",
            label: "Выдать клиенту",
            hint: "Просто уменьшим сумму аренды (деньги вернёте наличными вручную).",
            tone: "danger",
          },
        ],
      });
      if (choice == null) return; // отмена — период не меняем
      creditToDeposit = choice === "deposit";
    }

    try {
      patchRental(
        rental.id,
        {
          endPlanned: endPlannedRu,
          startTime: rental.startTime,
          days: next.days,
          // Коррекция периода считается по ДНЯМ → ставка дневная, фиксируем
          // rateUnit="day", иначе у недельной аренды дневное значение легло бы
          // в поле с единицей «нед» и ставка/сумма разъехались бы.
          rate: next.rate,
          rateUnit: "day",
          sum: next.sum,
          tariffPeriod: next.tariffPeriod,
        },
        // Продлённая аренда: бэк синхронит платёж ИМЕННО последней ветки.
        isBranchEdit ? { rentPaymentId: next.rentPaymentId } : undefined,
      );
      if (creditToDeposit && overpay > 0) {
        await api.post(`/api/clients/${rental.clientId}/deposit/charge`, {
          amount: overpay,
          comment: `Излишек по коррекции периода аренды #${rental.id}`,
          rentalId: rental.id,
        });
        queryClient.invalidateQueries({ queryKey: clientsKeys.all });
      }
      toast.success(
        "Период изменён",
        `было ${prevDays} дн → стало ${next.days} дн${
          creditToDeposit && overpay > 0 ? ` · +${fmt(overpay)} ₽ в депозит` : ""
        }`,
      );
    } catch (e) {
      toast.error("Не удалось изменить период", (e as Error).message ?? "");
    }
  };

  // v0.9: открыт ли модуль оплаты по этой аренде — parent-managed (стр.
  // Аренды, через paymentOpen) или inline (через paymentRentalId). Когда
  // открыт, кнопки «Принять оплату» дизейблятся и повторно не открывают.
  const payModuleOpen = paymentOpen || paymentRentalId === rental.id;

  // v0.7.3: единая точка открытия Payment. Делегирует родителю (push-
  // колонка на странице Аренд) либо открывает inline-диалог внутри
  // карточки (drawer на дашборде, где родитель prop не передал).
  const requestPayment = (extDays = 0) => {
    if (payModuleOpen) return; // модуль уже открыт — повторно не открываем
    if (onRequestPayment) onRequestPayment(rental.id, extDays);
    else setPaymentRentalId(rental.id);
  };

  // v0.7.9: единая точка открытия полной истории. Делегирует родителю
  // (push-колонка на странице Аренд) либо открывает overlay-SideDrawer
  // внутри карточки (DashboardDrawer, где родитель prop не передал).
  const requestHistory = () => {
    if (onOpenHistory) onOpenHistory(rental.id);
    else setHistoryOpen(true);
  };
  // v0.8.8: открыть историю сразу с фильтром «Долги и платежи».
  const requestFinanceHistory = () => {
    if (onOpenHistory) onOpenHistory(rental.id, "money");
    else setHistoryOpen(true);
  };

  // v0.7.8: общие обработчики MasterBlock — используются и в обычном
  // layout'е, и в accordion-секциях drawer-режима (не дублируем).
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
  const changeEquipmentHandler =
    rental.status === "active" ||
    rental.status === "overdue" ||
    rental.status === "returning"
      ? () => setEquipmentChangeOpen(true)
      : undefined;

  // v0.6.51: «Выдать депозит клиенту» — депозит это «лишние» деньги клиента
  // (переплаты, излишки коррекций). По клику на плашку депозита спрашиваем
  // сумму (по умолчанию весь остаток, можно меньше) и выдаём наличными:
  // дебетуем depositBalance через /deposit/payout.
  const handlePayoutDeposit = async () => {
    const balance = client?.depositBalance ?? 0;
    if (balance <= 0) {
      toast.info("Депозит пуст", "Выдавать нечего.");
      return;
    }
    const raw = await promptDialog({
      title: "Выдать депозит клиенту",
      message: `На депозите ${fmt(balance)} ₽. Сколько выдать клиенту наличными? Остаток сохранится на депозите.`,
      initial: String(balance),
      placeholder: "Сумма, ₽",
      confirmText: "Выдать",
      cancelText: "Отмена",
    });
    if (raw == null) return;
    const amount = parseInt(raw.replace(/\D/g, "") || "0", 10);
    if (amount <= 0) {
      toast.error("Некорректная сумма");
      return;
    }
    if (amount > balance) {
      toast.error("Больше, чем на депозите", `Доступно ${fmt(balance)} ₽.`);
      return;
    }
    try {
      await api.post(`/api/clients/${rental.clientId}/deposit/payout`, {
        amount,
        comment: `Выдан клиенту по аренде #${rental.id}`,
      });
      queryClient.invalidateQueries({ queryKey: clientsKeys.all });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      toast.success(
        "Депозит выдан",
        `${fmt(amount)} ₽ клиенту${amount < balance ? ` · остаток ${fmt(balance - amount)} ₽` : ""}`,
      );
    } catch (e) {
      toast.error("Не удалось выдать депозит", (e as Error).message ?? "");
    }
  };

  // v0.7.0: «Закрыть аренду» / «Принять оплату» — доступность кнопок.
  const isLive = rental.status === "active";
  const canComplete = isLive && !isArchived;
  // v0.8.34 (F1): «Принять оплату» доступна и на ЗАВЕРШЁННОЙ аренде с
  // непогашенным долгом по ущербу (effectiveStatus='completed_damage') —
  // оператор может закрыть остаток долга прямо на самой аренде, а не идти
  // в карточку клиента. PaymentAcceptDialog умеет принимать damage-платёж.
  const isCompletedWithDamage = effectiveStatus === "completed_damage";
  const canAcceptPayment = (isLive || isCompletedWithDamage) && !isArchived;

  // C2: значок-алёрт о долге в блоке клиента вместо больших баннеров.
  // crossDebtSources — долг по ДРУГИМ арендам (исключаем текущую цепочку,
  // её ущерб = currentDamage=totalDebt и так в KPI «Долг»).
  const crossDebtSources = (clientDebtSources ?? []).filter(
    (s) => !chainIdsFull.includes(s.rentalId),
  );
  const debtBadgeNode = (
    <ClientDebtBadge
      crossSources={crossDebtSources}
      onOpenSource={openSourceRental}
    />
  );

  // v0.7.12: KPI-ряд (Срок/Просрочка · Долг · Эта аренда) вынесен в
  // переменную, чтобы рендерить его в разных местах: в обычном режиме —
  // в потоке body, в drawer-режиме — между секциями «Клиент» и «Скутер».
  const kpiStrip = (
    <div
      className={cn(
        "grid grid-cols-3 gap-3",
        isExtended && "lg:grid-cols-4",
      )}
    >
      {(() => {
        let label = "Срок";
        const totalDays = isExtended
          ? chainRentals.reduce((s, r) => s + (r.days || 0), 0)
          : rental.days;
        let value = `${totalDays} дн`;
        const hint = `${rootRental.start.slice(0, 5)} — ${rental.endPlanned.slice(0, 5)}`;
        let accent: KpiAccent = "default";
        // v0.4.66: всегда показываем «Просрочен N дн» когда endPlanned
        // прошёл, даже если долг 0 — оператор должен видеть срочность
        // возврата скутера. Цвет (red/default) зависит от долга.
        const debtZero = overdueRelatedDebt === 0;
        // v0.4.80: бронь заранее — start_at в будущем.
        const daysUntilStart = startDate
          ? daysBetween(now(), startDate)
          : null;
        if (
          rental.status === "active" &&
          daysUntilStart !== null &&
          daysUntilStart > 0
        ) {
          label = "До выдачи";
          value = `${daysUntilStart} дн`;
          accent = "default";
        } else if (rental.status === "active" && daysLeft !== null) {
          if (daysLeft > 0) {
            // R5: метка «Осталось» + «N дн» (как «Просрочен N дн») — быстрее
            // считывается, чем «Срок / осталось N дн».
            label = "Осталось";
            value = `${daysLeft} дн`;
            accent = daysLeft <= 2 ? "red" : "default";
          } else if (daysLeft === 0) {
            value = `возврат сегодня`;
            accent = "red";
          } else if (!debtZero) {
            // Долг по просрочке ещё есть — endPlanned в прошлом, красная
            // срочность «Просрочен N дн».
            label = "Просрочен";
            value = `${Math.abs(daysLeft)} дн`;
            accent = "red";
          } else {
            // v0.6.51: долг по просрочке ПОГАШЕН (клиент оплатил дни, что
            // реально откатал, без продления) → эти дни «выкуплены», период
            // доходит до сегодня → показываем «возврат сегодня», а не
            // «Просрочен». Согласуется с шапкой (effectiveStatus='returning'
            // при долге 0) и устойчиво к ещё не подтянутой свежей endPlanned
            // после оплаты (бэк двигает её на today при оплате просрочки).
            value = `возврат сегодня`;
            accent = "red";
          }
        } else if (rental.status === "overdue") {
          label = "Просрочен";
          value =
            daysLeft !== null && daysLeft < 0
              ? `${Math.abs(daysLeft)} дн`
              : "сегодня";
          accent = debtZero ? "default" : "red";
        }
        // v0.7.8: для просрочки — hover-поповер с днями/датой/ставкой.
        const isOverdueKpi =
          label === "Просрочен" && overdueDaysCount > 0;
        return (
          <KpiCard
            label={label}
            value={value}
            hint={hint}
            accent={accent}
            popover={
              isOverdueKpi ? (
                <div className="space-y-0.5">
                  <div className="font-bold text-ink">
                    Просрочка · {overdueDaysCount} дн
                  </div>
                  <div>
                    взял: <b>{rootRental.start.slice(0, 10)}</b>
                  </div>
                  <div>
                    возврат был: <b>{rental.endPlanned}</b>
                  </div>
                  <div>
                    просрочен на: <b>{overdueDaysCount} дн</b>
                  </div>
                  <div className="pt-0.5 text-[10px] text-muted-2">
                    ставка {fmt(fullDailyForOverdue)} ₽/сут
                    {equipDailyForOverdue > 0 ? " (аренда + экипировка)" : ""}
                  </div>
                </div>
              ) : undefined
            }
          />
        );
      })()}
      {/* v0.7.8: «Долг» — состав вынесен наверх компонента (debtParts),
          здесь только рендер + hover-поповер с детальным составом. */}
      <KpiCard
        label="Долг"
        value={debtTotal > 0 ? `${fmt(debtTotal)} ₽` : "0 ₽"}
        // C4: при долге показываем ТОЛЬКО сумму (без длинной строки состава —
        // она растягивала карточку). Состав — в hover-поповере / нижнем
        // сниппете на мобиле. Когда долга нет — короткий «нет долгов».
        hint={debtTotal > 0 ? undefined : "нет долгов"}
        accent={debtTotal > 0 ? "red" : "muted"}
        popover={
          debtTotal > 0 ? (
            <div className="space-y-1">
              <div className="font-bold text-ink">
                Состав долга — {fmt(debtTotal)} ₽
              </div>
              {pending > 0 && (
                <div>не оплачено: <b>{fmt(pending)} ₽</b></div>
              )}
              {overdueRentBalance > 0 && (
                <div>аренда за дни: <b>{fmt(overdueRentBalance)} ₽</b></div>
              )}
              {overdueEquipBalance > 0 && (
                <div>экипировка за дни: <b>{fmt(overdueEquipBalance)} ₽</b></div>
              )}
              {overdueFineBalance > 0 && (
                <div>штраф: <b>{fmt(overdueFineBalance)} ₽</b></div>
              )}
              {overdueBalance > 0 &&
                overdueDaysBalance + overdueFineBalance === 0 && (
                  <div>просрочка: <b>{fmt(overdueBalance)} ₽</b></div>
                )}
              {damageBalance > 0 && (
                <div>ущерб: <b>{fmt(damageBalance)} ₽</b></div>
              )}
              {equipmentManualBalance > 0 && (
                <div>за экипировку: <b>{fmt(equipmentManualBalance)} ₽</b></div>
              )}
              {otherManualBalance > 0 && (
                <div>ручное начисление: <b>{fmt(otherManualBalance)} ₽</b></div>
              )}
              {parkingBalance > 0 && (
                <div>паркинг: <b>{fmt(parkingBalance)} ₽</b></div>
              )}
            </div>
          ) : undefined
        }
      />
      {(() => {
        // v0.9.x: «Эта аренда» = оплата за ТЕКУЩИЙ (последний) период:
        //   базовый/продление rent-платёж + доплаты за этот период
        //   (экипировка/ручное/просрочка, проведённые с его начала).
        // Раньше брали просто самый поздний rent-платёж по дате — и оплата
        // ручного долга (напр. доплата за экипировку, пишется type='rent'
        // с заметкой «Оплата ручного долга») ПОДМЕНЯЛА собой период:
        // показывало 1500 (доплату) вместо аренды за период. Теперь период
        // и доплаты разделены (та же классификация, что у ревизора).
        const rentPays = chainPayments.filter((p) => p.type === "rent");
        // Доплаты (не «новый период»): ручной долг и выкуп просрочки.
        const isManualNote = (n?: string | null) =>
          /ручн[а-яё]*\s+долг/i.test(n ?? "");
        const isOverdueNote = (n?: string | null) => /просрочк/i.test(n ?? "");
        const isPeriodPay = (p: { note?: string | null }) =>
          !isManualNote(p.note) && !isOverdueNote(p.note);
        const isExtNote = (n?: string | null) => /продлени[ея]/i.test(n ?? "");
        // Дата платежа из useChainPayments — русская «дд.мм.гггг[ чч:мм]».
        // Парсим в сортируемое число (лексикографически она не сортируется).
        const payTs = (s?: string): number => {
          const m = (s ?? "").match(
            /^(\d{2})\.(\d{2})\.(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?/,
          );
          if (!m) return 0;
          return new Date(
            +m[3]!,
            +m[2]! - 1,
            +m[1]!,
            m[4] ? +m[4] : 0,
            m[5] ? +m[5] : 0,
          ).getTime();
        };
        const byDate = (
          a: { date?: string; id?: number },
          b: { date?: string; id?: number },
        ) => payTs(a.date) - payTs(b.date) || (a.id ?? 0) - (b.id ?? 0);
        const periodPays = rentPays.filter(isPeriodPay);
        const extendCount = periodPays.filter((p) => isExtNote(p.note)).length;
        // Якорь текущего периода — последний базовый/продление платёж.
        const lastPeriodPay = periodPays.length
          ? [...periodPays].sort(byDate)[periodPays.length - 1]!
          : null;
        const rentPart = lastPeriodPay ? lastPeriodPay.amount : rental.sum;
        const periodTs = lastPeriodPay ? payTs(lastPeriodPay.date) : 0;
        // Доплаты текущего периода — не-период rent-платежи с его начала.
        const surchargePart = rentPays
          .filter((p) => !isPeriodPay(p) && payTs(p.date) >= periodTs)
          .reduce((s, p) => s + (p.amount ?? 0), 0);
        const thisRentalTotal = rentPart + surchargePart;
        const deposit = rental.deposit ?? 0;
        const hint = extendCount > 0 ? `продлений ${extendCount}` : undefined;
        // C5: дни ТЕКУЩЕГО периода (не всей аренды!) — выводим из суммы периода
        // и дневной ставки (скутер/сут + платная экипировка/сут). Иначе у
        // продлённой аренды rental.days = весь срок, и разбивка не сходилась
        // с суммой «Эта аренда».
        const equipDailyPaidForBody = (rental.equipmentJson ?? []).reduce(
          (s, e) => s + (e.free ? 0 : e.price),
          0,
        );
        const scooterDailyForBody =
          rental.rateUnit === "week" ? Math.round(rental.rate / 7) : rental.rate;
        const dailyTotalForBody = scooterDailyForBody + equipDailyPaidForBody;
        const periodDaysForBody =
          dailyTotalForBody > 0
            ? Math.max(1, Math.round(rentPart / dailyTotalForBody))
            : rental.days || 1;
        return (
          <KpiCard
            label="Эта аренда"
            value={`${fmt(thisRentalTotal)} ₽`}
            hint={hint}
            popover={
              <div className="min-w-[248px] space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold text-ink">Состав аренды</span>
                  <span className="font-bold tabular-nums text-ink">
                    {fmt(thisRentalTotal)} ₽
                  </span>
                </div>
                {/* C5: построчно — скутер + экипировка с мини-аватарами,
                    цена/сут и цена за период. */}
                <RentalBodyBreakdown
                  rental={rental}
                  scooter={currentScooter}
                  days={periodDaysForBody}
                />
                {surchargePart > 0 && (
                  <div className="flex items-center justify-between gap-2 border-t border-border pt-1 text-[12px]">
                    <span className="text-muted">доплаты (ручное/просрочка)</span>
                    <b className="tabular-nums">{fmt(surchargePart)} ₽</b>
                  </div>
                )}
                {deposit > 0 && (
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="text-muted">залог (возвратный)</span>
                    <b className="tabular-nums">{fmt(deposit)} ₽</b>
                  </div>
                )}
                <div className="pt-0.5 text-[10px] text-muted-2">
                  оплата за текущий открытый период
                  {extendCount > 0 ? ` · продлений ${extendCount}` : ""}
                </div>
              </div>
            }
          />
        );
      })()}
      {/* v0.7.11: «За всё время аренды» (paidIn) перенесена в секцию
          «Финансовая информация» — здесь больше не рендерится. */}
      {isExtended && (
        <KpiCard
          label="Всего по сделке"
          value={`${fmt(chainDaysTotal)} дн`}
          hint={`${chainRentals.length} ${chainRentals.length === 1 ? "аренда" : chainRentals.length < 5 ? "аренды" : "аренд"} в серии`}
          accent="blue"
        />
      )}
    </div>
  );

  // Внутреннее тело карточки (header + баннеры + KPI + основной блок +
  // все модалки). В drawer-режиме оборачивается в скроллируемую область,
  // в обычном — просто рендерится как раньше.
  const body = (
    <>
      {/* =========== HEADER =========== */}
      <header
        className={cn(
          "flex flex-wrap items-center gap-3",
          // v0.7.0: в drawer'е header «прилипает» к верху скролл-области.
          // -m + p компенсируют внешний p-5 контейнера, чтобы фон header'а
          // перекрывал контент при скролле на всю ширину.
          drawerChrome &&
            "sticky top-0 z-30 -mx-5 -mt-5 border-b border-border bg-surface px-5 py-4",
        )}
      >
        {/* v0.7.2: панель push (не overlay) — кнопка скрывает её, список
            растягивается на всю ширину. Раньше «К арендам» (закрывала drawer). */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Скрыть панель"
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-3 py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-border hover:text-ink"
          >
            <PanelRightClose size={14} /> Скрыть
          </button>
        )}
        {/* v0.7.12: в drawer-режиме громоздкий заголовок «Аренда #N — Имя»
            убран (имя клиента уже в первой секции «Информация о клиенте»).
            Header минимальный: мелкий «#N» + бейдж статуса. В обычном
            (non-drawer) режиме — прежний полный заголовок с именем. */}
        {drawerChrome ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="shrink-0 font-display text-[13px] font-bold text-muted-2 tabular-nums">
              #{String(rental.id).padStart(4, "0")}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold",
                statusChipClass(tone),
              )}
            >
              {STATUS_LABEL[effectiveStatus] ?? STATUS_LABEL[rental.status]}
            </span>
            {activeParking && (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-1 text-[11px] font-bold text-yellow-800">
                <SquareParking size={11} /> паркинг
              </span>
            )}
            {/* v0.8.12: статус связи — кликабельный тумблер. По умолчанию
                «На связи» (нейтральный); клик → «Не выходит на связь» +
                предложение прикрепить комментарий-стикер. */}
            <button
              type="button"
              onClick={toggleUnreachable}
              title={
                isUnreachable
                  ? "Клиент снова на связи?"
                  : "Отметить «не выходит на связь»"
              }
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold shadow-sm transition-colors active:scale-[0.98]",
                isUnreachable
                  ? "border-orange-300 bg-orange-soft text-orange-ink hover:bg-orange-200"
                  : "border-border bg-surface text-muted hover:border-green-300 hover:bg-green-50 hover:text-green-700",
              )}
            >
              {isUnreachable ? (
                <>
                  <PhoneOff size={11} /> Не выходит на связь
                </>
              ) : (
                <>
                  <Phone size={11} /> На связи
                </>
              )}
            </button>
          </div>
        ) : (
          <h2 className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 font-display text-[22px] font-extrabold leading-tight text-ink">
            <span className="shrink-0">
              Аренда #{String(rental.id).padStart(4, "0")}
            </span>
            {client && (
              <span className="flex min-w-0 max-w-full items-baseline gap-1">
                <span className="text-muted-2">—</span>
                <button
                  type="button"
                  onClick={() => openClient(client.id)}
                  title={client.name}
                  className="block min-w-0 max-w-full truncate whitespace-nowrap text-left rounded decoration-2 underline-offset-4 hover:underline"
                >
                  {client.name}
                </button>
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold",
                statusChipClass(tone),
              )}
            >
              {STATUS_LABEL[effectiveStatus] ?? STATUS_LABEL[rental.status]}
            </span>
            {/* v0.8.12: статус связи — кликабельный тумблер. По умолчанию
                «На связи» (нейтральный); клик → «Не выходит на связь» +
                предложение прикрепить комментарий-стикер. */}
            <button
              type="button"
              onClick={toggleUnreachable}
              title={
                isUnreachable
                  ? "Клиент снова на связи?"
                  : "Отметить «не выходит на связь»"
              }
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold shadow-sm transition-colors active:scale-[0.98]",
                isUnreachable
                  ? "border-orange-300 bg-orange-soft text-orange-ink hover:bg-orange-200"
                  : "border-border bg-surface text-muted hover:border-green-300 hover:bg-green-50 hover:text-green-700",
              )}
            >
              {isUnreachable ? (
                <>
                  <PhoneOff size={11} /> Не выходит на связь
                </>
              ) : (
                <>
                  <Phone size={11} /> На связи
                </>
              )}
            </button>
            {/* v0.6.51: рейтинг клиента убран из UI везде. */}
          </h2>
        )}

        {/* v0.6.42: порядок в шапке — [⋯ dots] [Завершить] [Принять оплату].
            Меню действий сжато до иконки-кружочка (triggerStyle="dots"),
            «Завершить аренду» (ArrowRight) перенесено внутрь dropdown'а
            через actions[], а в шапке остался компактный Flag-вариант.
            Primary CTA — зелёный «Принять оплату» справа. */}
        <div className="flex shrink-0 items-center gap-2">
          {/* v0.7.0: в drawer-режиме кнопки «Завершить»/«Принять оплату»
              живут в sticky-footer, в шапке их не дублируем. */}
          {!drawerChrome && (
            <>
              {canComplete && (
                <button
                  type="button"
                  onClick={() => setAction("complete")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-surface-soft hover:text-ink"
                  title="Завершить аренду"
                >
                  <Flag size={13} /> Завершить
                </button>
              )}
              {canAcceptPayment && (
                <button
                  type="button"
                  onClick={() => requestPayment(0)}
                  disabled={payModuleOpen}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold shadow-card-sm",
                    payModuleOpen
                      ? "cursor-not-allowed bg-surface-soft text-muted-2"
                      : "bg-green-600 text-white hover:bg-green-700",
                  )}
                  title={payModuleOpen ? "Окно оплаты уже открыто" : "Принять оплату"}
                >
                  <Wallet size={13} />{" "}
                  {payModuleOpen ? "Оплата открыта" : "Принять оплату"}
                </button>
              )}
            </>
          )}
          {/* v0.6.53: три точки перенесены в самый конец справа. */}
          <RentalActionsMenu
            actions={actions}
            onAction={handleAction}
            triggerStyle="dots"
          />
          {/* v0.7.2: кнопка скрытия панели — слева в header'е («Скрыть»),
              здесь дубль X убран. */}
        </div>
      </header>

      {/* #181: на мобиле «приклеенный» стикер-заметку показываем прямо в теле
          карточки — как в вебе она видна сразу на карточке. На десктоп-drawer
          работает portal-overlay у правого края (см. ниже, cardRect.left ≥ 220);
          на телефоне карточка во весь экран (left≈0) — overlay не помещается,
          поэтому рендерим стикер здесь, в потоке, под шапкой. */}
      {drawerChrome && stickers.length > 0 && (!cardRect || cardRect.left < 220) && (
        <div className="flex justify-center pt-1">
          {/* На мобиле стикер — для просмотра; открепить/удалить можно в
              разделе «Заметки» (там кнопки всегда видны, без hover). */}
          <StickerStack stickers={stickers} />
        </div>
      )}

      {/* =========== BANNERS =========== */}
      {/* «Откатить последнее действие» переехал из баннера В ХРОНОЛОГИЮ —
          компактная кнопка под самым свежим событием (см. InlineHistory
          afterFirst ниже). */}
      {/* v0.8.0: паркинг — явно видно что аренда на паузе и сколько дней. */}
      {activeParking && (
        <div className="flex items-center gap-3 rounded-[12px] bg-yellow-50 px-3 py-2.5 text-[12.5px] text-yellow-900 ring-1 ring-inset ring-yellow-300">
          <SquareParking size={18} className="shrink-0 text-yellow-600" />
          <div className="min-w-0 flex-1 leading-tight">
            <b>На паркинге</b> · день {parkingDayN} из {activeParking.days} · с{" "}
            {activeParking.startDate.slice(8, 10)}.
            {activeParking.startDate.slice(5, 7)}
            {activeParking.amount > 0 && (
              <span className="ml-1 text-yellow-800/80">
                · начислено {activeParking.amount.toLocaleString("ru-RU")} ₽
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={endParkingMut.isPending}
            onClick={() =>
              endParkingMut.mutate(
                { rentalId: rental.id, sessionId: activeParking.id },
                {
                  onSuccess: () =>
                    toast.success("Снят с паркинга", "Возврат пересчитан"),
                  onError: () => toast.error("Не удалось снять с паркинга"),
                },
              )
            }
            className="shrink-0 rounded-full bg-yellow-400 px-3 py-1.5 text-[12px] font-semibold text-yellow-950 hover:bg-yellow-500 disabled:opacity-50"
          >
            Снять с паркинга
          </button>
        </div>
      )}
      {/* v0.8.24: баннер «Запланирован паркинг» убран — эта информация теперь
          отображается стикером-заметкой (kind=parking, создаётся при постановке). */}
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
        // v0.4.3: просрочка раскладывается на «дни» (rate × days) и
        // «штраф 50%» (round(rate*0.5) × days). В баннере показываем
        // ТЕКУЩИЕ остатки из API (с учётом списаний и оплат).
        // v0.4.53: если фактический долг просрочки 0 (всё погашено или
        // прощено) — баннер не показываем, оператор видит «нет долгов»
        // в KPI и больше его ничего не сбивает с толку.
        if ((debtSummary?.overdueBalance ?? -1) === 0) return null;
        const d = Math.max(1, daysLeft !== null ? Math.abs(daysLeft) : 1);
        // v0.4.25: dailyRate учитывает rateUnit. При week-тарифе
        // dailyRate = round(rate/7), штраф = round(dailyRate × 0.5).
        // v0.9: dailyRate включает платную экипировку/сут (как overdueDailyRate
        // на бэке) — иначе формула «дни» не сходится с балансом, в который
        // экипировка уже включена. Единый источник: fullDailyForOverdue.
        const dailyRate = fullDailyForOverdue;
        const fineDaily = Math.round(dailyRate * 0.5);
        const fallbackDays = dailyRate * d;
        const fallbackFine = fineDaily * d;
        const daysBalance =
          debtSummary?.overdueDaysBalance ?? fallbackDays;
        const fineBalance =
          debtSummary?.overdueFineBalance ?? fallbackFine;
        const totalBalance = daysBalance + fineBalance;
        // v0.4.73: показываем расчёт в ДНЯХ, как мыслит оператор:
        // «10 дней просрочки, 1 простили, осталось 9 × 500 = 4500».
        // forgivenDays = forgive рублях / ставку (округление вниз).
        const daysCharge = dailyRate * d;
        const fineCharge = fineDaily * d;
        const daysForgivenRub = Math.max(0, daysCharge - daysBalance);
        const fineForgivenRub = Math.max(0, fineCharge - fineBalance);
        const forgivenDays = dailyRate > 0 ? Math.floor(daysForgivenRub / dailyRate) : 0;
        const payDays = Math.max(0, d - forgivenDays); // дни к оплате
        const hasForgive = daysForgivenRub > 0 || fineForgivenRub > 0;
        return (
          <div className="flex flex-wrap items-start gap-2 rounded-[12px] bg-red-soft/70 px-3 py-2 text-[12px] text-red-ink">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                Просрочка {d} дн.
                {forgivenDays > 0 && (
                  <span className="font-normal opacity-80">
                    {" "}(прощено {forgivenDays} дн → к оплате {payDays} дн)
                  </span>
                )}
                {" "}— {fmt(totalBalance)} ₽
              </div>
              {hasForgive ? (
                <div className="text-[11px] opacity-90 leading-snug">
                  дни: <b>{fmt(daysBalance)} ₽</b>
                  {" "}({fmt(dailyRate)} × {payDays} дн)
                  <br />
                  штраф: <b>{fmt(fineBalance)} ₽</b>
                  {" "}(начислено {fmt(fineCharge)} ₽
                  {fineForgivenRub > 0 && <> − прощено {fmt(fineForgivenRub)} ₽</>})
                </div>
              ) : (
                <div className="text-[11px] opacity-90">
                  дни {fmt(daysBalance)} ₽ ({fmt(dailyRate)} ₽ × {d}) ·
                  штраф {fmt(fineBalance)} ₽ ({fmt(fineDaily)} ₽/день × {d})
                </div>
              )}
              <div className="text-[11px] opacity-80">
                Плановый возврат — {rental.endPlanned} {rental.startTime || "12:00"}
              </div>
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
      {/* C1: баннер «Скутер ушёл в ремонт» убран — состояние теперь
          показывает сам блок скутера (жёлтый + ключ-оверлей + тултип),
          клик по блоку открывает замену. Не сдвигаем контент карточки. */}

      {/* C2: большой красный баннер «Долг по ущербу» убран. Долг по ущербу
          (текущей аренды) + сквозной долг клиента теперь в компактном
          значке-алёрте в блоке «Информация о клиенте» (ClientDebtBadge):
          ховер показывает состав и действия (досудебная / внести платёж →
          «Принять платёж»). Сумма долга также в KPI «Долг» с раскрытием. */}
      {/* v0.5.2: плашка «ущерб полностью оплачен» для завершённых аренд. */}
      {totalDebt === 0 &&
        reports.length > 0 &&
        !rental.archivedAt &&
        rental.status === "completed" && (
          <div className="flex items-center gap-2 rounded-[12px] bg-green-soft/70 px-3 py-2 text-[12px] text-green-ink">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>
              <b>Ущерб полностью оплачен.</b>
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
      {/* v0.7.11: «За всё время аренды» убрана из ряда → 3 плашки
          (Срок/Просрочка · Долг · Эта аренда). Значение перенесено в
          секцию «Финансовая информация». Узкая панель 600px → grid-cols-3.
          v0.7.12: KPI-ряд вынесен в kpiStrip (определён выше body). В обычном
          режиме рендерится здесь; в drawer-режиме — после секции «Информация
          о клиенте» (см. блок accordion-секций ниже). */}
      {!drawerChrome && kpiStrip}

      {/* C2: F3-баннер «Долг клиента по другим арендам» и плашка «Клиент
          гасит ущерб» убраны — сквозной долг и текущий ущерб теперь в
          значке-алёрте блока клиента (ClientDebtBadge) с ховером и
          действиями через «Принять платёж». Не сдвигаем контент карточки. */}

      {/* v0.6.41: плашка «Пополнить залог» удалена — действие доступно
          через кнопку «Принять оплату» в шапке (одна точка входа). */}

      {/* v0.6.51: старая зелёная плашка «Депозит клиента … → карточка» убрана —
          дублировала кликабельную плашку депозита в KPI-ряду клиента
          (MasterBlock «N ₽ депозит · выдать»), которая открывает выдачу. */}

      {/* v0.8.12: плоская «Заметка:» убрана — заметки теперь стикерами
          (см. StickerStack overlay в drawer-режиме). Старые rental.note
          перенесены в стикеры миграцией 0045. */}

      {/* =========== ОСНОВНОЕ ТЕЛО ===========
          v0.7.8: в drawer-режиме — accordion-секции (сворачиваемые).
          В обычном режиме — прежний 2-col layout (MasterBlock слева,
          CalendarPanel/InlineHistory/DocsInline справа). */}
      {drawerChrome ? (
        <div className="flex flex-col gap-3">
          <AccordionSection
            title="Информация о клиенте"
            icon={<User size={15} className="text-muted-2" />}
            defaultOpen
          >
            <MasterBlock
              section="client"
              rental={rental}
              client={client ?? null}
              scooter={currentScooter}
              onOpenClientProfile={() => client && openClient(client.id)}
              onSwapScooter={handleSwapScooter}
              onChangeEquipment={changeEquipmentHandler}
              onPayoutDeposit={handlePayoutDeposit}
              paidThisRental={paidIn}
              debtBadge={debtBadgeNode}
            />
          </AccordionSection>

          {/* v0.7.12: KPI-ряд — сразу после секции «Информация о клиенте»,
              перед «Скутер и экипировка» (заказчик: Клиент → KPI → Скутер). */}
          {kpiStrip}

          <AccordionSection
            title="Скутер и экипировка"
            icon={<Bike size={15} className="text-muted-2" />}
            defaultOpen
          >
            <MasterBlock
              section="scooter"
              rental={rental}
              client={client ?? null}
              scooter={currentScooter}
              onOpenClientProfile={() => client && openClient(client.id)}
              onSwapScooter={handleSwapScooter}
              onChangeEquipment={changeEquipmentHandler}
              onPayoutDeposit={handlePayoutDeposit}
            />
          </AccordionSection>

          {/* v0.7.9: Календарь — ВСЕГДА виден, БЕЗ accordion. Заказчик:
              календарь первостепенный, не должен прятаться/сворачиваться.
              Рендерится сразу после «Скутер и экипировка». CalendarPanel
              сам рисует блок «Дата возврата» (Выдано / Возврат) + сетку. */}
          <CalendarPanel
            rental={rental}
            effectiveStatus={effectiveStatus}
            onCommitExtend={handleCommitExtend}
            onChangePeriod={handleChangePeriod}
            canEditPeriod={canEditPeriod}
            lastBranch={lastBranch}
            previewRate={previewRate}
            resetSignal={onRequestPayment ? paymentResetSignal : calendarResetSignal}
            initialExtDays={
              (onRequestPayment ? paymentExtDays : paymentPrefillExtDays) ||
              undefined
            }
            paymentDateIso={onRequestPayment ? paymentDateIso : undefined}
            armParkingSignal={armParkingSignal}
          />

          <AccordionSection
            title="Финансовая информация"
            icon={<Wallet size={15} className="text-muted-2" />}
            defaultOpen={false}
            badge={
              debtTotal > 0 ? (
                <span className="rounded-full bg-red-soft px-2 py-0.5 text-[11px] font-bold text-red-ink tabular-nums">
                  {fmt(debtTotal)} ₽
                </span>
              ) : undefined
            }
          >
            <div className="flex flex-col gap-3">
              <MasterBlock
                section="deposit"
                rental={rental}
                client={client ?? null}
                scooter={currentScooter}
                onOpenClientProfile={() => client && openClient(client.id)}
                onSwapScooter={handleSwapScooter}
                onChangeEquipment={changeEquipmentHandler}
              />
              {/* v0.7.11: «За всё время аренд клиента» (paidIn). v0.8.8: при
                  наведении — ховер со сводкой финопераций + «Подробнее» →
                  история по фильтру «Долги и платежи». */}
              <FinanceHoverCard
                total={paidIn}
                ops={financeOps}
                onDetails={requestFinanceHistory}
              >
                <div className="flex cursor-default items-center justify-between rounded-[12px] border border-border bg-surface-soft/40 px-4 py-3 transition-colors hover:border-blue-200 hover:bg-blue-50/40">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                      За всё время аренд клиента
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {isExtended
                        ? `всего получено за ${chainRentals.length} ${pluralRental(chainRentals.length)}: аренда, продления, штрафы, ущерб, паркинг`
                        : "всего получено от клиента: аренда, продления, штрафы, ущерб, паркинг"}
                    </div>
                  </div>
                  <div className="shrink-0 font-display text-[18px] font-extrabold tabular-nums text-blue-700">
                    {fmt(paidIn)} ₽
                  </div>
                </div>
              </FinanceHoverCard>
              {/* R6: долг с прошлых аренд (сквозной) — кликабельно, провал в
                  ту аренду. Дублирует значок-алёрт у клиента, но тут — в финансах,
                  как полноценная строка с переходом. */}
              {crossDebtSources.length > 0 && (
                <div className="rounded-[12px] border border-red-200 bg-red-soft/30 px-4 py-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-red-ink">
                      <AlertTriangle size={13} /> Долг с прошлых аренд
                    </span>
                    <span className="font-display text-[15px] font-extrabold tabular-nums text-red-ink">
                      {fmt(crossDebtSources.reduce((s, x) => s + x.amount, 0))} ₽
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {crossDebtSources.map((s) => (
                      <button
                        key={s.rentalId}
                        type="button"
                        onClick={() => openSourceRental(s.rentalId)}
                        title={`Открыть аренду #${String(s.rentalId).padStart(4, "0")}`}
                        className="group flex items-center gap-2 rounded-lg border border-red-200/70 bg-surface px-3 py-2 text-left transition-colors hover:border-red-300 hover:bg-red-soft/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-semibold text-ink">
                            {s.scooterName}{" "}
                            <span className="font-mono text-[10px] text-muted-2">
                              #{String(s.rentalId).padStart(4, "0")}
                            </span>
                          </div>
                          <div className="truncate text-[11px] text-muted">
                            {s.label}
                          </div>
                        </div>
                        <span className="shrink-0 text-[13px] font-bold tabular-nums text-red-ink">
                          {fmt(s.amount)} ₽
                        </span>
                        <ArrowUpRight
                          size={14}
                          className="shrink-0 text-muted-2 transition-colors group-hover:text-red-600"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* v0.7.13: детальный «бухгалтерский» состав долга — каждая
                  строка с формулой расчёта (слева мелким серым), чтобы
                  объяснить клиенту из чего сложился долг. Цифры берём из
                  тех же debtSummary-полей (НЕ пересчитываем) — формула в
                  подписи лишь иллюстрирует фактический баланс. Штраф-ставка
                  = round(dailyRate × 0.5) (как overdueComponents на бэке). */}
              <div className="rounded-[12px] border border-border bg-surface-soft/40 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                  Состав долга
                </div>
                {debtTotal > 0 ? (
                  <div className="mt-2 space-y-2 text-[13px] text-ink-2">
                    {/* v0.9: «дни просрочки» раскладываем на аренду и
                        платную экипировку — три отдельные суммы (аренда /
                        экипировка / штраф), а не сливаем экип в «дни». */}
                    {overdueRentBalance > 0 && (
                      <DebtRow
                        label="Аренда за дни просрочки"
                        formula={
                          overdueDaysCount > 0
                            ? `${overdueDaysCount} ${overdueDaysCount === 1 ? "день" : "дн"} × ${fmt(dailyRateForHint)} ₽/день`
                            : undefined
                        }
                        value={overdueRentBalance}
                      />
                    )}
                    {overdueEquipBalance > 0 && (
                      <DebtRow
                        label="Экипировка за дни просрочки"
                        formula={
                          overdueDaysCount > 0
                            ? `${overdueDaysCount} ${overdueDaysCount === 1 ? "день" : "дн"} × ${fmt(equipDailyForOverdue)} ₽/день`
                            : undefined
                        }
                        value={overdueEquipBalance}
                      />
                    )}
                    {overdueFineBalance > 0 && (
                      <DebtRow
                        label="Штраф за просрочку"
                        formula={
                          overdueDaysCount > 0
                            ? `${overdueDaysCount} ${overdueDaysCount === 1 ? "день" : "дн"} × ${fmt(Math.round(fullDailyForOverdue * 0.5))} ₽ (50% от аренды+экип.)`
                            : "штраф 50% от ставки"
                        }
                        value={overdueFineBalance}
                      />
                    )}
                    {overdueBalance > 0 &&
                      overdueDaysBalance + overdueFineBalance === 0 && (
                        <DebtRow
                          label="Просрочка"
                          formula={
                            overdueDaysCount > 0
                              ? `${overdueDaysCount} ${overdueDaysCount === 1 ? "день" : "дн"} просрочки`
                              : undefined
                          }
                          value={overdueBalance}
                        />
                      )}
                    {damageBalance > 0 && (
                      <DebtRow
                        label="Ущерб по акту"
                        formula="зафиксирован в акте о повреждениях"
                        value={damageBalance}
                      />
                    )}
                    {equipmentManualBalance > 0 && (
                      <DebtRow
                        label="За экипировку"
                        formula="доплата за изменение экипировки на аренде"
                        value={equipmentManualBalance}
                      />
                    )}
                    {otherManualBalance > 0 && (
                      <DebtRow
                        label="Ручное начисление"
                        formula="начислено оператором вручную"
                        value={otherManualBalance}
                      />
                    )}
                    {pending > 0 && (
                      <DebtRow
                        label="Не оплачено по аренде"
                        formula="плановая оплата аренды"
                        value={pending}
                      />
                    )}
                    {parkingBalance > 0 && (
                      <DebtRow
                        label={
                          unpaidParkingDays > 0
                            ? `Паркинг · ${unpaidParkingDays} ${unpaidParkingDays === 1 ? "день" : "дн"}`
                            : "Паркинг"
                        }
                        formula="1-е сутки беспл., далее 250 ₽/сут"
                        value={parkingBalance}
                      />
                    )}
                    <div className="mt-1.5 flex items-center justify-between border-t border-border pt-2 text-[15px] font-extrabold text-red-ink">
                      <span>Итого долг</span>
                      <span className="tabular-nums">{fmt(debtTotal)} ₽</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 text-[13px] text-muted">Долгов нет</div>
                )}
              </div>
            </div>
          </AccordionSection>

          <AccordionSection
            title="Хронология событий"
            icon={<Clock size={15} className="text-muted-2" />}
            defaultOpen={false}
          >
            <InlineHistory
              items={activityItems}
              loading={activityQ.isLoading}
              onExpand={requestHistory}
              limit={5}
              rollback={rollbackSlot}
            />
          </AccordionSection>

          <AccordionSection
            title="Документы"
            icon={<FileText size={15} className="text-muted-2" />}
            defaultOpen={false}
          >
            <DocsInline rental={rental} />
          </AccordionSection>

          {/* v0.8.15: архив заметок — все заметки карточки (прикреплённые и
              откреплённые) с датами/автором. Здесь заметку можно УДАЛИТЬ
              полностью (на карточке стикер можно только открепить). */}
          <AccordionSection
            title={`Заметки${allStickers.length ? ` · ${allStickers.length}` : ""}`}
            icon={<StickyNote size={15} className="text-muted-2" />}
            defaultOpen={false}
          >
            {allStickers.length === 0 ? (
              <div className="text-[12px] text-muted">Заметок пока нет</div>
            ) : (
              <div className="flex flex-col gap-2">
                {allStickers.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-start gap-2 rounded-[10px] border border-border bg-surface-soft/40 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-2">
                        {s.kind === "contact"
                          ? "Связь"
                          : s.kind === "parking"
                            ? "Паркинг"
                            : "Заметка"}
                        {s.dismissedAt ? (
                          <span className="rounded-full bg-surface px-1.5 py-0.5 text-[9px] font-medium text-muted">
                            откреплена
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
                            на карточке
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-ink-2">
                        {s.text}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-2">
                        {s.createdByName ?? "—"} ·{" "}
                        {new Date(s.createdAt).toLocaleString("ru-RU", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {s.dismissedAt && (
                        <button
                          type="button"
                          onClick={() => repinSticker(s.id)}
                          title="Подкрепить обратно на карточку"
                          className="rounded-md p-1 text-muted-2 transition-colors hover:bg-amber-100 hover:text-amber-700"
                        >
                          <Pin size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteSticker(s.id)}
                        title="Удалить заметку полностью"
                        className="rounded-md p-1 text-muted-2 transition-colors hover:bg-red-soft hover:text-red-ink"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AccordionSection>
        </div>
      ) : (
        <div className="grid flex-1 gap-4 xl:grid-cols-2 min-h-0">
          {/* Левая колонка */}
          <div className="flex flex-col gap-4 min-w-0">
            <MasterBlock
              rental={rental}
              client={client ?? null}
              scooter={currentScooter}
              onOpenClientProfile={() => client && openClient(client.id)}
              onSwapScooter={handleSwapScooter}
              onChangeEquipment={changeEquipmentHandler}
              onPayoutDeposit={handlePayoutDeposit}
              paidThisRental={paidIn}
            />
          </div>

          {/* Правая колонка */}
          <div className="flex flex-col gap-4 min-w-0">
            <CalendarPanel
              rental={rental}
              effectiveStatus={effectiveStatus}
              onCommitExtend={handleCommitExtend}
              onChangePeriod={handleChangePeriod}
              canEditPeriod={canEditPeriod}
              lastBranch={lastBranch}
              previewRate={previewRate}
              // v0.7.3: при parent-managed Payment календарь синхронизируется
              // с состоянием в Rentals (число дней + сигнал сброса); иначе —
              // с локальным fallback-состоянием карточки.
              resetSignal={onRequestPayment ? paymentResetSignal : calendarResetSignal}
              initialExtDays={
                (onRequestPayment ? paymentExtDays : paymentPrefillExtDays) ||
                undefined
              }
              paymentDateIso={onRequestPayment ? paymentDateIso : undefined}
              armParkingSignal={armParkingSignal}
            />
            {/* v0.6.50: «Последние события» — InlineHistory под календарём. */}
            <InlineHistory
              items={activityItems}
              loading={activityQ.isLoading}
              onExpand={requestHistory}
              limit={5}
              rollback={rollbackSlot}
            />
            <DocsInline rental={rental} />
          </div>
        </div>
      )}

      {historyOpen && (
        <SideDrawer
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          title="История аренды"
          subtitle={`#${String(rental.id).padStart(4, "0")} · все события`}
          width={620}
        >
          <div className="p-4">
            <HistoryTab
              rental={rental}
              chainRentals={chainRentals}
              damageReports={reports}
            />
          </div>
        </SideDrawer>
      )}

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
      {/* «Изменить аренду» (RentalEditModal) удалён — сырая правка денег/
          периода заменена безопасными кнопками в карточке. */}
      {/* ConfirmPaymentDialog больше не используется — функционал убран. */}
      {extendOpen && (
        <ExtendRentalDialog
          rental={rental}
          onClose={() => setExtendOpen(false)}
          onExtended={(r) => {
            // v0.3.9: после продления переключаем фокус на новую связку
            // и сразу открываем диалог приёма оплаты — оператор вводит
            // принятую сумму, переплата уходит в депозит.
            navigate({ route: "rentals", rentalId: r.id });
            // v0.7.3: делегируем открытие Payment родителю (push-колонка),
            // иначе открываем inline внутри карточки.
            if (onRequestPayment) onRequestPayment(r.id, 0);
            else setPaymentRentalId(r.id);
          }}
        />
      )}
      {/* v0.7.3: inline-Payment (overlay внутри карточки) рендерим ТОЛЬКО
          в fallback-режиме — когда родитель не управляет Payment-колонкой
          (DashboardDrawer). На странице Аренд Payment рендерится как push-
          колонка в Rentals.tsx (см. onRequestPayment). */}
      {!onRequestPayment && paymentRentalId != null && (
        <PaymentAcceptDialogContainer
          rentalId={paymentRentalId}
          initialExtDays={paymentPrefillExtDays || undefined}
          onExtDaysChange={setPaymentPrefillExtDays}
          onClose={() => {
            setPaymentRentalId(null);
            setPaymentPrefillExtDays(0);
            setCalendarResetSignal((n) => n + 1);
          }}
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

    </>
  );

  // v0.7.0: drawer-режим — sticky header уже внутри body (header сделан
  // sticky ниже), скроллируемое тело и sticky footer с кнопками.
  if (drawerChrome) {
    return (
      <div
        ref={cardRootRef}
        className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg"
      >
        {/* v0.8.18: стикеры-заметки — порталом ПОВЕРХ карточки (вне клиппящего
            фрейма), висят за правым краём, лишь край касается. Позиция — по
            rect карточки (cardRect). */}
        {cardRect &&
          !besideDrawerOpen &&
          // #172: только если слева есть зазор (десктоп-drawer). На мобиле
          // карточка во весь экран (left≈0) — overlay уехал бы за левый край,
          // поэтому не рендерим его: заметки видны в разделе «Заметки» тела.
          cardRect.left >= 220 &&
          createPortal(
            <div
              style={{
                position: "fixed",
                // v0.8.30 (I2): ниже sticky-хедера карточки, чтобы не сталкивались.
                top: cardRect.top + 76,
                // v0.9.7: в дашборд-drawer карточка прижата к правому краю —
                // стикеры за правым краём уезжали за экран → вешаем их СЛЕВА.
                // v0.9.x: стикер должен выглядеть ПРИКЛЕЕННЫМ к карточке — его
                // правый край заходит НА карточку (~30px на левое поле, контент
                // не перекрывает). StickerStack — фикс. ширина 200px, поэтому
                // правый край стикера ≈ (left + 202); чтобы зайти на карточку
                // на ~30px: left = cardRect.left - 170 (раньше -248 = зазор 48px,
                // стикер «отклеивался» от карточки).
                left: drawerChrome
                  ? cardRect.left - 170
                  : cardRect.right - 30,
                zIndex: 20,
              }}
              className={cn(
                "flex w-[200px] flex-col gap-2",
                drawerChrome ? "items-end" : "items-start",
              )}
            >
              {addNoteOpen && (
                <NoteComposer
                  onSubmit={addRentalNote}
                  onCancel={() => setAddNoteOpen(false)}
                />
              )}
              <StickerStack stickers={stickers} onUnpin={unpinSticker} />
            </div>,
            document.body,
          )}
        {/* Скроллируемое тело: header «прилипает» сверху внутри скролла.
            overflow-x-hidden — гасит ложный горизонтальный скролл: KPI-плашки
            рендерят hover-поповеры (absolute, w-max), которые у правой колонки
            заходят за край карточки и раздували её ширину (тот же эффект уже
            ловили на мобиле). По вертикали скролл сохраняется. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
          <div className="flex flex-col gap-3 p-5">{body}</div>
        </div>
        {/* Sticky footer: «Закрыть аренду» (нейтр.) / «Принять оплату» (зелёная) */}
        {(canComplete || canAcceptPayment) && (
          <div className="sticky bottom-0 flex gap-3 border-t border-border bg-surface p-4">
            {canComplete && (
              <button
                type="button"
                onClick={() => setAction("complete")}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink-2 hover:bg-surface-soft hover:text-ink"
                title="Завершить аренду"
              >
                <Flag size={14} /> Закрыть аренду
              </button>
            )}
            {canAcceptPayment && (
              <button
                type="button"
                onClick={() => requestPayment(0)}
                disabled={payModuleOpen}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-bold shadow-card-sm",
                  payModuleOpen
                    ? "cursor-not-allowed bg-surface-soft text-muted-2"
                    : "bg-green-600 text-white hover:bg-green-700",
                )}
                title={payModuleOpen ? "Окно оплаты уже открыто" : "Принять оплату"}
              >
                <Wallet size={14} />{" "}
                {payModuleOpen ? "Оплата открыта" : "Принять оплату"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-3 rounded-2xl bg-surface p-5 shadow-card-sm",
        flushLeft && "rounded-l-none",
      )}
    >
      {body}
    </div>
  );
}

/** Превью акта приёма-передачи и замены скутера (после замены).
 *  Открывается из SwapScooterDialog по кнопке «Заменить и распечатать
 *  акт» — использует новый шаблон act_swap, в котором есть блок про
 *  возвращённый скутер, причину замены и переданный новый скутер.
 *  Экспортируется чтобы Rentals.tsx мог рендерить превью у себя поверх
 *  любой карточки (см. RentalCard.onSwapped). */
/**
 * v0.3.9: контейнер-фасад над PaymentAcceptDialog. Берёт rental из
 * глобального списка по id (после продления selectedId переключается
 * на новый id, и Rentals перерендеривает RentalCard с новой rental —
 * но в момент открытия диалога мы держим rentalId отдельно от prop).
 */
function PaymentAcceptDialogContainer({
  rentalId,
  onClose,
  initialExtDays,
  onExtDaysChange,
}: {
  rentalId: number;
  onClose: () => void;
  initialExtDays?: number;
  onExtDaysChange?: (days: number) => void;
}) {
  const all = useRentals();
  const r = all.find((x) => x.id === rentalId);
  if (!r) return null;
  return (
    <PaymentAcceptDialog
      rental={r}
      onClose={onClose}
      initialExtDays={initialExtDays}
      onExtDaysChange={onExtDaysChange}
      onPaid={() => {
        /* invalidations происходят в dialog'е */
      }}
    />
  );
}

/**
 * v0.7.9: история аренды как push-колонка (рендерится в Rentals.tsx справа,
 * как Payment-колонка). Self-contained: сама резолвит цепочку продлений и
 * акты о повреждениях по rentalId (как RentalCard), чтобы родителю не нужно
 * было прокидывать вычисленные данные. Внутри — заголовок «История аренды
 * #N» + кнопка X + скроллируемый HistoryTab.
 */
/**
 * v0.8.8: ховер на «За всё время» — портальный поповер со сводкой
 * финансовых операций (платежи: аренда/продление/штраф/ущерб/паркинг) +
 * кнопка «Подробнее» → полная история, отфильтрованная по финансам.
 * Портал — чтобы не обрезался overflow-hidden аккордеона.
 */
function FinanceHoverCard({
  total,
  ops,
  onDetails,
  children,
}: {
  total: number;
  ops: {
    label: string;
    amount: number;
    date: string | null;
    period?: string | null;
  }[];
  onDetails: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom, left: r.left, width: r.width });
    setOpen(true);
  };
  return (
    <div ref={ref} onMouseEnter={show} onMouseLeave={() => setOpen(false)}>
      {children}
      {open &&
        pos &&
        createPortal(
          <div
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            style={{
              position: "fixed",
              top: pos.top + 4,
              left: pos.left,
              minWidth: Math.max(pos.width, 300),
              maxWidth: 380,
              zIndex: 1000,
            }}
            className="rounded-xl border border-border bg-surface p-3 shadow-card-lg"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                Финансовые операции
              </span>
              <span className="text-[13px] font-extrabold tabular-nums text-blue-700">
                {fmt(total)} ₽
              </span>
            </div>
            {ops.length === 0 ? (
              <div className="text-[12px] text-muted">Платежей пока нет</div>
            ) : (
              <div className="flex max-h-[260px] flex-col gap-1 overflow-y-auto">
                {ops.map((o, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 text-[12.5px]"
                  >
                    <span className="min-w-0 truncate text-ink-2">
                      {o.label}
                      {o.period && (
                        <span className="ml-1 text-[11px] text-muted tabular-nums">
                          {o.period}
                        </span>
                      )}
                      {o.date && (
                        <span className="ml-1 text-[11px] text-muted-2 tabular-nums">
                          · {o.date}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-ink">
                      {fmt(o.amount)} ₽
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={onDetails}
              className="mt-2.5 w-full rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-100"
            >
              Подробнее — вся история →
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function RentalHistoryColumn({
  rentalId,
  onClose,
  initialFilter,
}: {
  rentalId: number;
  onClose: () => void;
  initialFilter?: HistoryFilter;
}) {
  const activeRentals = useRentals();
  const archivedRentals = useArchivedRentals();
  const allRentals = useMemo(
    () => [...activeRentals, ...archivedRentals],
    [activeRentals, archivedRentals],
  );
  const rental = allRentals.find((r) => r.id === rentalId) ?? null;
  const chainIdsFull = useMemo(
    () => (rental ? getRentalChainIds(rental.id, allRentals) : []),
    [rental, allRentals],
  );
  const chainIds = useMemo(
    () =>
      chainIdsFull.filter((id) => {
        const r = allRentals.find((x) => x.id === id);
        return !r || !r.archivedBy;
      }),
    [chainIdsFull, allRentals],
  );
  const chainRentals = useMemo(
    () => allRentals.filter((r) => chainIds.includes(r.id)),
    [allRentals, chainIds],
  );
  const damageReports = useChainDamageReports(chainIdsFull);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border-l border-border bg-surface shadow-card-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0">
          <div className="font-display text-[16px] font-extrabold leading-tight text-ink truncate">
            История аренды #{String(rentalId).padStart(4, "0")}
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted">все события</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Закрыть"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-soft text-muted hover:bg-border hover:text-ink"
        >
          <XCircle size={16} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {rental ? (
          <HistoryTab
            rental={rental}
            chainRentals={chainRentals}
            damageReports={damageReports.data}
            withFilters
            initialFilter={initialFilter}
          />
        ) : (
          <div className="text-[13px] text-muted">Аренда не найдена.</div>
        )}
      </div>
    </div>
  );
}

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
  popover,
}: {
  label: string;
  value: string;
  hint?: string;
  hintIcon?: React.ComponentType<{ size?: number | string; className?: string }>;
  badgeIcon?: React.ComponentType<{ size?: number | string; className?: string }>;
  accent?: KpiAccent;
  /** v0.7.8: детальный состав при наведении (hover). Показывается поповером
   *  снизу плашки. Если не передан — плашка ведёт себя как раньше. */
  popover?: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  // R3: десктоп-поповер рендерим ПОРТАЛОМ (fixed), чтобы его не обрезал
  // скроллящийся контейнер карточки (раньше absolute-блок клипался справа).
  const cardRef = useRef<HTMLDivElement>(null);
  const [popOpen, setPopOpen] = useState(false);
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const showPop = () => {
    const r = cardRef.current?.getBoundingClientRect();
    if (r) {
      const vw = window.innerWidth;
      const left = Math.max(8, Math.min(r.left, vw - 320));
      setPopPos({ top: r.bottom + 6, left });
    }
    setPopOpen(true);
  };
  // На мобиле расшифровку убираем из плашки (чисто заголовок + значение) и
  // показываем в нижнем сниппете по тапу. Контент сниппета — popover, а если
  // его нет, но есть hint — сам hint.
  const detail = popover ?? (hint ? <div>{hint}</div> : null);
  const tappable = isMobile && !!detail;

  const valueColor =
    accent === "blue"
      ? "text-blue-600"
      : accent === "red"
        ? "text-red-ink"
        : accent === "muted"
          ? "text-muted"
          : "text-ink";

  const inner = (
    <>
      {BadgeIcon && (
        <BadgeIcon
          size={18}
          className={cn(
            "absolute right-3 top-3 shrink-0",
            accent === "blue" ? "text-blue-600" : "text-muted-2",
          )}
        />
      )}
      {/* На мобиле — намёк, что по тапу раскроются подробности. */}
      {tappable && !BadgeIcon && (
        <ChevronDown
          size={15}
          className="absolute right-2.5 top-3 text-muted-2"
        />
      )}
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-[20px] font-extrabold leading-tight tabular-nums",
          valueColor,
        )}
      >
        {value}
      </div>
      {/* Инлайн-расшифровка — только на десктопе; на мобиле она в сниппете. */}
      {hint && !tappable && (
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
    </>
  );

  const baseCls = cn(
    "relative rounded-[14px] border px-4 py-3 shadow-card-sm text-left",
    popover && !isMobile && "group",
    accent === "muted"
      ? "border-border bg-surface-soft/60"
      : accent === "red"
        ? "border-red-soft bg-surface shadow-[0_0_16px_-2px_hsl(var(--red-ink)/0.35),0_0_0_1px_hsl(var(--red-soft))]"
        : "border-border bg-surface",
  );

  if (tappable) {
    return (
      <>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={cn(baseCls, "w-full active:scale-[0.98]")}
        >
          {inner}
        </button>
        {sheetOpen && (
          <KpiDetailSheet
            label={label}
            value={value}
            accent={accent}
            onClose={() => setSheetOpen(false)}
          >
            {detail}
          </KpiDetailSheet>
        )}
      </>
    );
  }

  return (
    <div
      ref={cardRef}
      className={baseCls}
      onMouseEnter={popover && !isMobile ? showPop : undefined}
      onMouseLeave={popover && !isMobile ? () => setPopOpen(false) : undefined}
    >
      {inner}
      {popover &&
        !isMobile &&
        popOpen &&
        popPos &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: popPos.top,
              left: popPos.left,
              minWidth: 280,
              maxWidth: 360,
              zIndex: 1000,
            }}
            className="pointer-events-none rounded-xl bg-surface p-3 text-[12px] leading-relaxed text-ink-2 shadow-card-lg ring-1 ring-border"
          >
            {popover}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Нижний сниппет (bottom-sheet) с подробностями KPI-плашки — для мобилки. */
function KpiDetailSheet({
  label,
  value,
  accent,
  onClose,
  children,
}: {
  label: string;
  value: string;
  accent: KpiAccent;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const valueColor =
    accent === "blue"
      ? "text-blue-600"
      : accent === "red"
        ? "text-red-ink"
        : accent === "muted"
          ? "text-muted"
          : "text-ink";
  return (
    <MobileBottomSheet onClose={onClose} z={80} panelClassName="px-5">
      {({ close }) => (
        <>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                {label}
              </div>
              <div
                className={cn(
                  "font-display text-[26px] font-extrabold leading-tight tabular-nums",
                  valueColor,
                )}
              >
                {value}
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Закрыть"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft text-muted-2 active:scale-90"
            >
              <X size={18} />
            </button>
          </div>
          <div className="space-y-1 text-[14px] leading-relaxed text-ink-2 [&_b]:font-bold [&_b]:text-ink">
            {children}
          </div>
        </>
      )}
    </MobileBottomSheet>
  );
}

/** v0.7.8: строка «лейбл — значение» для состава долга в accordion'е. */
/**
 * v0.7.13: строка детального состава долга. Слева — название компонента
 * + мелкая серая формула расчёта (как считается), справа — сумма
 * (tabular-nums). Используется в секции «Финансовая информация».
 */
function DebtRow({
  label,
  formula,
  value,
}: {
  label: string;
  formula?: string;
  value: number;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-ink-2">{label}</div>
        {formula && (
          <div className="text-[11px] leading-tight text-muted-2">
            {formula}
          </div>
        )}
      </div>
      <span className="shrink-0 font-semibold tabular-nums text-ink">
        {fmt(value)} ₽
      </span>
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


