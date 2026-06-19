import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Check, ExternalLink, Eye, MailQuestion, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { navigate } from "@/app/navigationStore";
import { RentalCard, RentalHistoryColumn } from "@/pages/rentals/RentalCard";
import { PaymentAcceptDialog } from "@/pages/rentals/PaymentAcceptDialog";
import { ParkingDrawer } from "@/pages/rentals/rental-card/ParkingDialog";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import {
  useRentals,
  useArchivedRentals,
} from "@/pages/rentals/rentalsStore";
import { useAllClients } from "@/pages/clients/clientStore";
import { ScooterQuickView } from "@/pages/fleet/ScooterQuickView";
import { useFleetScooters } from "@/pages/fleet/fleetStore";
import { ClientCard } from "@/pages/clients/ClientCard";
import { effectiveRentalStatus } from "@/lib/rentalStatus";
import { useDebtAggregate } from "@/lib/api/debt";
import type { RentalStatus } from "@/lib/mock/rentals";
import {
  useApplications,
  useDeleteApplication,
  type ApiApplication,
} from "@/lib/api/clientApplications";
import { NewApplicationModal } from "@/pages/clients/NewApplicationModal";
import { ApplicationConvertFlow } from "@/pages/clients/ApplicationConvertFlow";
import { toast, confirmDialog } from "@/lib/toast";

/**
 * v0.4.7: горизонтальный стек drawer'ов.
 *
 * Концепция: каждая открытая сущность (аренда / клиент / скутер /
 * список аренд) рендерится отдельной панелью справа налево. Когда
 * пользователь открывает новую сущность из текущей drawer (например
 * клик по событию ленты), новая панель выезжает справа, а уже
 * открытые смещаются влево. Так на экране одновременно видно цепочку
 * расследования: «клиент → его аренда → её скутер → ремонт скутера».
 *
 * Скролл:
 *  • горизонтально по контейнеру (свайп / drag-scrollbar / Shift+wheel);
 *  • вертикально внутри каждой панели независимо.
 *
 * Закрытие:
 *  • X в шапке drawer'а — закрывает только эту панель (pop из стека);
 *  • Esc — закрывает верхнюю (последнюю открытую);
 *  • клик по затемнённой области слева от drawer'ов — закрывает все.
 */

type Target =
  | { kind: "rental"; id: number }
  | { kind: "client"; id: number }
  | { kind: "scooter"; id: number }
  | { kind: "rentalsList"; filter: "active" | "overdue" | "returnsToday" }
  // v0.4.39: drawer для заявок клиентов. Клик по дашборд-плитке
  // «Новые заявки» открывает этот drawer, а не уводит на /clients.
  | { kind: "applicationsList" };

/**
 * v0.7.20: Payment/История аренды — отдельная push-колонка, которая
 * выезжает СПРАВА от стека (как в «Аренды»). Взаимоисключение: открыта
 * либо оплата, либо история (одна на момент). Это тот же принцип, что и
 * на странице аренд — единый механизм push-колонок везде, где вызывается
 * приём оплаты / просмотр истории по аренде.
 */
type SideColumn =
  | { kind: "payment"; rentalId: number; extDays: number }
  | { kind: "history"; rentalId: number }
  | { kind: "parking"; rentalId: number; startIso: string; days: number }
  | null;

type Ctx = {
  stack: Target[];
  // Открытие с ВЕРХНЕГО УРОВНЯ (дашборд/списки/поиск) — заменяет стек.
  openRental: (id: number) => void;
  openClient: (id: number) => void;
  openScooter: (id: number) => void;
  openRentalsList: (filter: "active" | "overdue" | "returnsToday") => void;
  openApplicationsList: () => void;
  // Drill-in ВНУТРИ карточки — добавляет в цепочку (клиент→аренда→скутер).
  openRentalChain: (id: number) => void;
  openClientChain: (id: number) => void;
  openScooterChain: (id: number) => void;
  back: () => void;
  close: () => void;
  closeAt: (index: number) => void;
  inDrawer: boolean;
  // v0.7.20: side-колонка (оплата / история) — единый push-механизм.
  side: SideColumn;
  /** Счётчик сброса — бампается при закрытии оплаты, чтобы карточка
   *  обнулила drag-extend на календаре (как paymentResetSignal в Аренды). */
  sideResetSignal: number;
  openPayment: (rentalId: number, extDays: number) => void;
  setPaymentExtDays: (extDays: number) => void;
  closePayment: () => void;
  openHistory: (rentalId: number) => void;
  closeHistory: () => void;
  // Паркинг-период (push-колонка, как оплата) — период выбран на календаре.
  openParking: (rentalId: number, startIso: string, days: number) => void;
  closeParking: () => void;
};

const DashboardDrawerCtx = createContext<Ctx | null>(null);

export function useDashboardDrawer(): Ctx {
  const v = useContext(DashboardDrawerCtx);
  return (
    v ?? {
      stack: [],
      openRental: () => {},
      openClient: () => {},
      openScooter: () => {},
      openRentalsList: () => {},
      openApplicationsList: () => {},
      openRentalChain: () => {},
      openClientChain: () => {},
      openScooterChain: () => {},
      back: () => {},
      close: () => {},
      closeAt: () => {},
      inDrawer: false,
      side: null,
      sideResetSignal: 0,
      openPayment: () => {},
      setPaymentExtDays: () => {},
      closePayment: () => {},
      openHistory: () => {},
      closeHistory: () => {},
      openParking: () => {},
      closeParking: () => {},
    }
  );
}

function pushUnique(stack: Target[], next: Target): Target[] {
  // Не плодим дубликаты: если этот же target уже открыт — поднимаем его
  // в конец стека (сразу справа).
  const idx = stack.findIndex(
    (t) =>
      t.kind === next.kind &&
      ((t.kind === "rentalsList" && next.kind === "rentalsList"
        ? t.filter === next.filter
        : t.kind === "applicationsList" && next.kind === "applicationsList"
          ? true
          : "id" in t && "id" in next && t.id === next.id) ||
        false),
  );
  if (idx === -1) return [...stack, next];
  const without = [...stack.slice(0, idx), ...stack.slice(idx + 1)];
  return [...without, next];
}

export function DashboardDrawerProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Target[]>([]);
  const [side, setSide] = useState<SideColumn>(null);
  const [sideResetSignal, setSideResetSignal] = useState(0);
  const ctx: Ctx = useMemo(
    () => ({
      stack,
      // v0.9.2: открытие С ВЕРХНЕГО УРОВНЯ (дашборд-плитки, списки, поиск,
      // Topbar) ЗАМЕНЯЕТ стек целиком — карточки больше не копятся и не
      // налезают друг на друга. Если эта же сущность уже единственная в
      // стеке — не дёргаем (без ремаунта). Drill-in внутри карточки идёт
      // цепочкой через *Chain-варианты ниже.
      openRental: (id) =>
        setStack((s) =>
          s.length === 1 && s[0].kind === "rental" && s[0].id === id
            ? s
            : [{ kind: "rental", id }],
        ),
      openClient: (id) =>
        setStack((s) =>
          s.length === 1 && s[0].kind === "client" && s[0].id === id
            ? s
            : [{ kind: "client", id }],
        ),
      openScooter: (id) =>
        setStack((s) =>
          s.length === 1 && s[0].kind === "scooter" && s[0].id === id
            ? s
            : [{ kind: "scooter", id }],
        ),
      openRentalsList: (filter) =>
        setStack((s) =>
          s.length === 1 &&
          s[0].kind === "rentalsList" &&
          s[0].filter === filter
            ? s
            : [{ kind: "rentalsList", filter }],
        ),
      openApplicationsList: () =>
        setStack((s) =>
          s.length === 1 && s[0].kind === "applicationsList"
            ? s
            : [{ kind: "applicationsList" }],
        ),
      // Drill-in: добавляет карточку в цепочку (старые остаются слева).
      openRentalChain: (id) =>
        setStack((s) => {
          // Уже смотрим эту аренду наверху цепочки — повторный клик (напр.
          // по её же событию в ленте) не открывает ту же карточку поверх.
          const top = s[s.length - 1];
          if (top && top.kind === "rental" && top.id === id) return s;
          return pushUnique(s, { kind: "rental", id });
        }),
      openClientChain: (id) =>
        setStack((s) => pushUnique(s, { kind: "client", id })),
      openScooterChain: (id) =>
        setStack((s) => pushUnique(s, { kind: "scooter", id })),
      back: () => {
        // Esc/back сначала закрывает side-колонку (оплата/история), затем
        // верхнюю панель стека.
        if (side) {
          if (side.kind === "payment" || side.kind === "parking")
            setSideResetSignal((n) => n + 1);
          setSide(null);
          return;
        }
        setStack((s) => s.slice(0, -1));
      },
      close: () => {
        setSide(null);
        setStack([]);
      },
      closeAt: (index) => {
        // Если закрываем аренду, по которой открыта оплата/история —
        // закрываем и side-колонку (она осталась бы «висеть» без карточки).
        const removed = stack[index];
        if (side && removed && "id" in removed && side.rentalId === removed.id) {
          setSide(null);
        }
        setStack((s) => s.filter((_, i) => i !== index));
      },
      inDrawer: stack.length > 0,
      side,
      sideResetSignal,
      // Открыть оплату → закрывает историю (взаимоисключение).
      openPayment: (rentalId, extDays) =>
        setSide({ kind: "payment", rentalId, extDays }),
      setPaymentExtDays: (extDays) =>
        setSide((s) =>
          s && s.kind === "payment" ? { ...s, extDays } : s,
        ),
      closePayment: () => {
        setSide((s) => (s && s.kind === "payment" ? null : s));
        setSideResetSignal((n) => n + 1);
      },
      openHistory: (rentalId) => setSide({ kind: "history", rentalId }),
      closeHistory: () =>
        setSide((s) => (s && s.kind === "history" ? null : s)),
      // Паркинг: период выбран на календаре карточки → push-колонка справа
      // (как оплата). Закрытие бампает sideResetSignal → карточка выходит из
      // режима паркинга (resetSignal в CalendarPanel).
      openParking: (rentalId, startIso, days) =>
        setSide({ kind: "parking", rentalId, startIso, days }),
      closeParking: () => {
        setSide((s) => (s && s.kind === "parking" ? null : s));
        setSideResetSignal((n) => n + 1);
      },
    }),
    [stack, side, sideResetSignal],
  );
  return (
    <DashboardDrawerCtx.Provider value={ctx}>
      {children}
    </DashboardDrawerCtx.Provider>
  );
}

/**
 * v0.7.18: drawer-стек больше НЕ overlay (fixed inset-0 + backdrop).
 * Теперь это набор inline push-колонок, которые рендерятся ВНУТРИ общего
 * горизонтально-скроллящегося контейнера в App-shell, справа от контента
 * страницы. Открытие drawer'а сдвигает контент влево (а не перекрывает),
 * несколько drawer'ов выстраиваются цепочкой, при переполнении —
 * горизонтальный скролл. Поведение идентично push-колонкам в «Аренды».
 *
 * Авто-скролл вправо и wheel→horizontal живут в App-shell (он владеет
 * scroll-контейнером). Здесь — только Esc (закрыть верхнюю панель) и
 * рендер колонок в прямом порядке (старые слева, свежая справа).
 */
export function DashboardDrawerStack() {
  const ctx = useContext(DashboardDrawerCtx);
  const stack = ctx?.stack ?? [];
  const side = ctx?.side ?? null;

  // v0.7.20: держим side-колонку (оплата/история) смонтированной во время
  // exit-анимации (width N→0), как lastPaymentRental в Аренды.
  const [renderedSide, setRenderedSide] = useState<SideColumn>(side);
  useEffect(() => {
    if (side) {
      setRenderedSide(side);
      return;
    }
    const t = window.setTimeout(() => setRenderedSide(null), 300);
    return () => window.clearTimeout(t);
  }, [side]);

  // Esc — закрывает сначала side-колонку, затем верхнюю панель стека
  // (логика приоритета — в ctx.back()).
  useEffect(() => {
    if (!ctx || (stack.length === 0 && !side)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        ctx.back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stack.length, side, ctx]);

  if (!ctx || (stack.length === 0 && !renderedSide)) return null;

  // Ширина колонки = как у карточки в «Аренды» (600px) для единообразия.
  const DRAWER_W = 600;
  return (
    <>
      {stack.map((target, idx) => {
        // v0.7.20: side-колонка (оплата/история) выезжает СРАЗУ справа от
        // своей аренды (а не в глобальный конец цепочки) — так оплата
        // примыкает к карточке, как в «Аренды». Fragment с устойчивым key
        // по target: переключение оплаты НЕ ремаунтит карточку.
        const sideForThis =
          renderedSide &&
          target.kind === "rental" &&
          renderedSide.rentalId === target.id
            ? renderedSide
            : null;
        return (
          <Fragment key={drawerKey(target)}>
            <DrawerColumn
              target={target}
              width={DRAWER_W}
              onCloseSelf={() => ctx.closeAt(idx)}
              onOpenRental={ctx.openRentalChain}
              onOpenClient={ctx.openClientChain}
              onOpenScooter={ctx.openScooterChain}
            />
            {sideForThis && (
              <SideDrawerColumn
                key={`side-${sideForThis.kind}`}
                data={sideForThis}
                closing={
                  !side ||
                  side.rentalId !== sideForThis.rentalId ||
                  side.kind !== sideForThis.kind
                }
                onClosePayment={ctx.closePayment}
                onCloseHistory={ctx.closeHistory}
                onCloseParking={ctx.closeParking}
                onExtDaysChange={ctx.setPaymentExtDays}
              />
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * v0.7.20: push-колонка оплаты/истории. Та же анимация (width 0↔N), что и
 * у DrawerColumn. Контент: PaymentAcceptDialog (inline) или
 * RentalHistoryColumn — идентично странице «Аренды».
 */
function SideDrawerColumn({
  data,
  closing,
  onClosePayment,
  onCloseHistory,
  onCloseParking,
  onExtDaysChange,
}: {
  data: NonNullable<SideColumn>;
  closing: boolean;
  onClosePayment: () => void;
  onCloseHistory: () => void;
  onCloseParking: () => void;
  onExtDaysChange: (days: number) => void;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const cleanup = { r1: 0, r2: 0 };
    cleanup.r1 = requestAnimationFrame(() => {
      cleanup.r2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(cleanup.r1);
      if (cleanup.r2) cancelAnimationFrame(cleanup.r2);
    };
  }, []);
  const isOpen = entered && !closing;
  const width =
    data.kind === "payment" ? 480 : data.kind === "parking" ? 460 : 420;
  return (
    <aside
      className={cn(
        "h-full min-h-0 shrink-0 overflow-hidden transition-[width,opacity,margin] duration-300 ease-in-out",
        isOpen ? "ml-3 opacity-100" : "ml-0 opacity-0",
      )}
      style={{ width: isOpen ? `min(${width}px, 92vw)` : "0px" }}
    >
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card-sm"
        style={{ width: `min(${width}px, 92vw)` }}
      >
        {data.kind === "payment" ? (
          <SidePaymentContent
            rentalId={data.rentalId}
            extDays={data.extDays}
            onClose={onClosePayment}
            onExtDaysChange={onExtDaysChange}
          />
        ) : data.kind === "parking" ? (
          <SideParkingContent
            rentalId={data.rentalId}
            startIso={data.startIso}
            days={data.days}
            onClose={onCloseParking}
          />
        ) : (
          <ErrorBoundary key={`hist-${data.rentalId}`}>
            <RentalHistoryColumn
              rentalId={data.rentalId}
              onClose={onCloseHistory}
            />
          </ErrorBoundary>
        )}
      </div>
    </aside>
  );
}

function SidePaymentContent({
  rentalId,
  extDays,
  onClose,
  onExtDaysChange,
}: {
  rentalId: number;
  extDays: number;
  onClose: () => void;
  onExtDaysChange: (days: number) => void;
}) {
  const active = useRentals();
  const archived = useArchivedRentals();
  const rental = useMemo(
    () => [...active, ...archived].find((r) => r.id === rentalId) ?? null,
    [active, archived, rentalId],
  );
  if (!rental) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Аренда не найдена.
      </div>
    );
  }
  return (
    <ErrorBoundary key={`pay-${rentalId}`}>
      <PaymentAcceptDialog
        rental={rental}
        inline
        initialExtDays={extDays || undefined}
        onExtDaysChange={onExtDaysChange}
        onClose={onClose}
        onPaid={() => {
          /* invalidations — внутри диалога */
        }}
      />
    </ErrorBoundary>
  );
}

/** Паркинг-период в side-колонке (период выбран на календаре карточки). */
function SideParkingContent({
  rentalId,
  startIso,
  days,
  onClose,
}: {
  rentalId: number;
  startIso: string;
  days: number;
  onClose: () => void;
}) {
  const active = useRentals();
  const archived = useArchivedRentals();
  const rental = useMemo(
    () => [...active, ...archived].find((r) => r.id === rentalId) ?? null,
    [active, archived, rentalId],
  );
  if (!rental) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Аренда не найдена.
      </div>
    );
  }
  return (
    <ErrorBoundary key={`park-${rentalId}`}>
      <ParkingDrawer
        rental={rental}
        startIso={startIso}
        days={days}
        inline
        onClose={onClose}
      />
    </ErrorBoundary>
  );
}

/**
 * v0.4.16: СТАБИЛЬНЫЙ React-key — без idx. Раньше при закрытии drawer
 * в середине стека все последующие меняли idx → React делал
 * unmount/remount всем их компонентам → начинались новые enter-анимации
 * → видимое «мерцание» соседей. С key только по kind+id остающиеся
 * панели — это те же React-инстансы, они просто перерасполагаются
 * во flex-layout (плавно).
 *
 * Уникальность по содержимому гарантирована pushUnique() в Provider.
 */
function drawerKey(t: Target): string {
  if (t.kind === "rentalsList") return `list-${t.filter}`;
  if (t.kind === "applicationsList") return `applications-list`;
  return `${t.kind}-${t.id}`;
}

function DrawerColumn({
  target,
  width,
  onCloseSelf,
  onOpenRental,
  onOpenClient,
  onOpenScooter,
}: {
  target: Target;
  width: number;
  onCloseSelf: () => void;
  onOpenRental: (id: number) => void;
  onOpenClient: (id: number) => void;
  onOpenScooter: (id: number) => void;
}) {
  // v0.4.14: enter + exit анимации через width-grow / width-shrink.
  // entered: false → ширина 0 (стартовый кадр) → true → растёт до width.
  // closing: true → ширина возвращается в 0, после transition вызываем
  // onCloseSelf() для удаления из стека. Соседние панели плавно
  // сдвигаются вправо, заполняя освободившееся место.
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => setEntered(true));
      cleanup.r2 = r2;
    });
    const cleanup = { r1, r2: 0 };
    return () => {
      cancelAnimationFrame(cleanup.r1);
      if (cleanup.r2) cancelAnimationFrame(cleanup.r2);
    };
  }, []);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    // ждём окончания transition (300ms) — потом убираем из стека
    window.setTimeout(onCloseSelf, 300);
  };

  // open=true для рендера content; на exit фазе тоже true чтобы
  // содержимое не пропадало мгновенно при сжатии ширины.
  const isOpen = entered && !closing;

  // v0.7.18: inline push-колонка (не overlay). h-full = высота
  // scroll-контейнера в App-shell (вьюпорт минус titlebar). Левая
  // граница ml-3 отделяет от контента/предыдущей колонки.
  return (
    <aside
      className={cn(
        "h-full min-h-0 shrink-0 overflow-hidden transition-[width,opacity,margin] duration-300 ease-in-out",
        isOpen ? "ml-3 opacity-100" : "ml-0 opacity-0",
      )}
      style={{
        width: isOpen ? `min(${width}px, 92vw)` : "0px",
      }}
    >
      {/* Внутренний контейнер с ФИКСИРОВАННОЙ шириной — чтобы content
          не сжимался по мере роста outer width. Outer обрезает overflow. */}
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card-sm"
        style={{ width: `min(${width}px, 92vw)` }}
      >
        {target.kind === "rental" && (
          <RentalDrawerContent
            rentalId={target.id}
            onClose={requestClose}
            onOpenRental={onOpenRental}
            onOpenClient={onOpenClient}
            onOpenScooter={onOpenScooter}
          />
        )}
        {target.kind === "client" && (
          <ClientDrawerContent
            clientId={target.id}
            onClose={requestClose}
            onOpenRental={onOpenRental}
            onOpenScooter={onOpenScooter}
          />
        )}
        {target.kind === "scooter" && (
          <ScooterDrawerContent
            scooterId={target.id}
            onClose={requestClose}
            onOpenRental={onOpenRental}
            onOpenClient={onOpenClient}
          />
        )}
        {target.kind === "rentalsList" && (
          <RentalsListDrawerContent
            filter={target.filter}
            onClose={requestClose}
            onPickRental={onOpenRental}
          />
        )}
        {target.kind === "applicationsList" && (
          <ApplicationsListDrawerContent
            onClose={requestClose}
            onOpenClient={onOpenClient}
          />
        )}
      </div>
    </aside>
  );
}

/* ============================================================
 *  Содержимое drawer'ов
 * ============================================================ */

function DrawerHeader({
  kind,
  title,
  onClose,
  onOpenFull,
}: {
  kind: string;
  title: string;
  onClose: () => void;
  onOpenFull?: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-surface-soft px-5 py-3">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
          {kind}
        </div>
        <div className="truncate text-[14px] font-bold text-ink">{title}</div>
      </div>
      <div className="flex items-center gap-1">
        {onOpenFull && (
          <button
            type="button"
            onClick={onOpenFull}
            title="Открыть на полной странице"
            className="inline-flex items-center gap-1 rounded-[8px] bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-blue-50 hover:text-blue-700"
          >
            <ExternalLink size={12} /> На полную
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
          title="Закрыть (Esc)"
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}

function RentalDrawerContent({
  rentalId,
  onClose,
  onOpenRental,
}: {
  rentalId: number;
  onClose: () => void;
  onOpenRental: (id: number) => void;
  onOpenClient: (id: number) => void;
  onOpenScooter: (id: number) => void;
}) {
  const active = useRentals();
  const archived = useArchivedRentals();
  const rental = useMemo(
    () => [...active, ...archived].find((r) => r.id === rentalId) ?? null,
    [active, archived, rentalId],
  );
  // v0.7.18: рендерим ТУ ЖЕ карточку, что в «Аренды» (drawerChrome) — со
  // своей шапкой (#ID + статус + Скрыть + ⋯), KPI-плашками, аккордеоном и
  // sticky-футером. Payment/История карточка ведёт сама (внутренними
  // overlay'ями), т.к. onRequestPayment/onOpenHistory не передаём. Так
  // quick-view выглядит идентично странице аренд, а не «странно».
  if (!rental) {
    return (
      <>
        <DrawerHeader
          kind="Быстрый просмотр аренды"
          title={`Аренда #${String(rentalId).padStart(4, "0")}`}
          onClose={onClose}
          onOpenFull={() => {
            navigate({ route: "rentals", rentalId });
            onClose();
          }}
        />
        <div className="flex h-full items-center justify-center text-muted">
          Аренда не найдена.
        </div>
      </>
    );
  }
  return (
    <ErrorBoundary key={rental.id}>
      <RentalCardWithSide rental={rental} onClose={onClose} onOpenRental={onOpenRental} />
    </ErrorBoundary>
  );
}

/**
 * v0.7.20: карточка аренды в drawer, у которой Payment/История делегированы
 * наверх — в side-колонку DashboardDrawer (push, как в «Аренды»). Так
 * приём оплаты и просмотр истории выезжают отдельной push-колонкой справа,
 * а не overlay'ем поверх карточки.
 */
function RentalCardWithSide({
  rental,
  onClose,
  onOpenRental,
}: {
  rental: Parameters<typeof RentalCard>[0]["rental"];
  onClose: () => void;
  onOpenRental: (id: number) => void;
}) {
  const drawer = useDashboardDrawer();
  const paymentExtDays =
    drawer.side?.kind === "payment" && drawer.side.rentalId === rental.id
      ? drawer.side.extDays
      : 0;
  return (
    <RentalCard
      rental={rental}
      drawerChrome
      onClose={onClose}
      onSwapped={(newId) => onOpenRental(newId)}
      onRequestPayment={(rid, ext) => drawer.openPayment(rid, ext)}
      onRequestParking={(rid, startIso, days) =>
        drawer.openParking(rid, startIso, days)
      }
      onCancelParking={() => drawer.closeParking()}
      onOpenHistory={(rid) => drawer.openHistory(rid)}
      paymentExtDays={paymentExtDays}
      paymentResetSignal={drawer.sideResetSignal}
    />
  );
}

function ClientDrawerContent({
  clientId,
  onClose,
}: {
  clientId: number;
  onClose: () => void;
  onOpenRental: (id: number) => void;
  onOpenScooter: (id: number) => void;
}) {
  const all = useAllClients();
  const client = all.find((c) => c.id === clientId) ?? null;
  return (
    <>
      <DrawerHeader
        kind="Быстрый просмотр клиента"
        title={client?.name ?? `Клиент #${clientId}`}
        onClose={onClose}
        onOpenFull={() => {
          navigate({ route: "clients", clientId });
          onClose();
        }}
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        {client ? (
          <ClientCard client={client} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            Клиент не найден.
          </div>
        )}
      </div>
    </>
  );
}

function ScooterDrawerContent({
  scooterId,
  onClose,
  onOpenRental,
}: {
  scooterId: number;
  onClose: () => void;
  onOpenRental: (id: number) => void;
  onOpenClient: (id: number) => void;
}) {
  const fleet = useFleetScooters();
  const scooter = fleet.find((s) => s.id === scooterId) ?? null;
  void scooter; // имя для шапки берём по id ниже из fleet
  return (
    <>
      <DrawerHeader
        kind="Быстрый просмотр скутера"
        title={scooter?.name ?? `Скутер #${scooterId}`}
        onClose={onClose}
        onOpenFull={() => {
          navigate({ route: "fleet", scooterId });
          onClose();
        }}
      />
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* v0.4.9: компактная версия. Полная ScooterCard доступна по
            кнопке «На полную» в шапке drawer'а.
            v0.4.32: прокинут onOpenRental — блок «Сейчас в аренде»
            теперь кликабельный, открывает аренду в том же стеке. */}
        <ScooterQuickView scooterId={scooterId} onOpenRental={onOpenRental} />
      </div>
    </>
  );
}

// v0.4.31: те же мапы что в RevenueRentalsList — для согласованности
// статус-пилюль во всём дашборде. Используем здесь же чтобы список
// аренд в drawer'е не выглядел как «новый компонент с английским
// ACTIVE» (см. жалобу пользователя).
const RENTAL_STATUS_LABEL: Record<string, string> = {
  active: "активна",
  overdue: "просрочка",
  returning: "возврат",
  completed: "завершена",
  completed_damage: "с ущербом",
  problem: "проблемная",
  cancelled: "отменена",
  meeting: "встреча",
  new_request: "заявка",
  police: "в полиции",
  court: "суд",
};

const RENTAL_STATUS_TONE: Record<string, string> = {
  active: "bg-green-soft text-green-ink",
  overdue: "bg-red-soft text-red-ink",
  returning: "bg-orange-soft text-orange-ink",
  completed: "bg-surface-soft text-muted",
  completed_damage: "bg-red-soft text-red-ink",
  problem: "bg-red-soft text-red-ink",
  cancelled: "bg-surface-soft text-muted",
  meeting: "bg-blue-50 text-blue-700",
  new_request: "bg-blue-50 text-blue-700",
};

function RentalsListDrawerContent({
  filter,
  onClose,
  onPickRental,
}: {
  filter: "active" | "overdue" | "returnsToday";
  onClose: () => void;
  onPickRental: (id: number) => void;
}) {
  const active = useRentals();
  // v0.4.53: подмешиваем фактический долг — если 0, не показываем
  // красную просрочку (effectiveStatus вернёт 'returning' для
  // просроченных по дате но без долга аренд).
  const { data: debtAgg } = useDebtAggregate();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const ymdFromRu = (s: string): string => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  };
  const effectiveStatus = (r: {
    id: number;
    status: string;
    endPlanned: string;
  }) => {
    const myDebt = debtAgg?.find((d) => d.rentalId === r.id);
    const overdueRel = myDebt
      ? myDebt.overdueBalance + myDebt.damageBalance + myDebt.manualBalance
      : undefined;
    return effectiveRentalStatus(
      r.status as RentalStatus,
      r.endPlanned,
      overdueRel,
    ) as string;
  };
  const filtered = active.filter((r) => {
    if (filter === "active") {
      // v0.4.47: «Активные аренды» = ВСЕ живые. Аренды с просрочкой
      // имеют двойной статус (active+overdue) и должны попадать в оба
      // фильтра. Раньше показывались только status='active', клиенты
      // с просрочкой пропадали из списка активных — это путало.
      return (
        r.status === "active" ||
        r.status === "overdue" ||
        r.status === "returning"
      );
    }
    if (filter === "overdue") {
      // v0.4.53: только аренды с реальным долгом (overdue+damage+manual).
      // Если просто endPlanned прошёл, но клиент всё оплатил/прощён —
      // это не «просрочка» для дашборда.
      const myDebt = debtAgg?.find((d) => d.rentalId === r.id);
      const overdueRel = myDebt
        ? myDebt.overdueBalance + myDebt.damageBalance + myDebt.manualBalance
        : 0;
      if (overdueRel <= 0) return false;
      const endKey = ymdFromRu(r.endPlanned);
      return (
        r.status === "overdue" ||
        (r.status === "active" && endKey && endKey < todayKey)
      );
    }
    if (filter === "returnsToday") {
      const endKey = ymdFromRu(r.endPlanned);
      return (
        (r.status === "active" || r.status === "returning") &&
        endKey === todayKey
      );
    }
    return false;
  });
  const title =
    filter === "active"
      ? "Активные аренды"
      : filter === "overdue"
        ? "Просроченные аренды"
        : "Возвращают сегодня";
  return (
    <>
      <DrawerHeader
        kind="Список аренд"
        title={`${title} · ${filtered.length}`}
        onClose={onClose}
        onOpenFull={() => {
          navigate({ route: "rentals" });
          onClose();
        }}
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted">
            Нет записей в этой категории.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((r) => {
              const eff = effectiveStatus(r);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onPickRental(r.id)}
                  className="flex flex-col gap-0.5 rounded-[10px] border border-border bg-white px-3 py-2 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-ink">
                    Аренда #{String(r.id).padStart(4, "0")}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide",
                        RENTAL_STATUS_TONE[eff] ??
                          "bg-surface-soft text-muted-2",
                      )}
                    >
                      {RENTAL_STATUS_LABEL[eff] ?? eff}
                    </span>
                    <span className="ml-auto font-mono text-[12px] tabular-nums text-ink-2">
                      {r.scooter}
                    </span>
                  </div>
                  <div className="text-[12px] text-muted">
                    {r.start} → {r.endPlanned} · {r.days} дн ·{" "}
                    <b>{(r.sum ?? 0).toLocaleString("ru-RU")} ₽</b>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/* ============================================================
 *  Drawer «Заявки клиентов»
 *  v0.4.39: drawer-версия списка заявок. Открывается с дашборда
 *  по клику на плитку «Новые заявки» — без ухода со страницы.
 * ============================================================ */

function ApplicationsListDrawerContent({
  onClose,
  onOpenClient,
}: {
  onClose: () => void;
  onOpenClient: (id: number) => void;
}) {
  const { data: items = [], isLoading } = useApplications();
  const deleteApp = useDeleteApplication();
  const [viewing, setViewing] = useState<ApiApplication | null>(null);
  const [converting, setConverting] = useState<ApiApplication | null>(null);

  const newCount = items.filter((a) => a.status === "new").length;

  const markSpam = async (a: ApiApplication) => {
    const ok = await confirmDialog({
      title: "Удалить заявку?",
      message: `Заявка «${a.name || "—"}» будет помечена как спам и удалена из БД.`,
      confirmText: "Удалить",
      cancelText: "Отмена",
      danger: true,
    });
    if (!ok) return;
    deleteApp.mutate(a.id, {
      onSuccess: () => toast.success("Заявка удалена", "Помечена как спам"),
      onError: () => toast.error("Не удалось удалить"),
    });
  };

  return (
    <>
      <DrawerHeader
        kind="Заявки клиентов"
        title={`Заявки · ${items.length}${newCount > 0 ? ` (${newCount} новых)` : ""}`}
        onClose={onClose}
        onOpenFull={() => {
          navigate({ route: "clients" });
          onClose();
        }}
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-muted">
            Загружаем заявки…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
            <MailQuestion size={28} className="text-muted-2" />
            <div className="text-[14px] font-semibold text-ink">
              Заявок пока нет
            </div>
            <div className="text-[12px] text-muted">
              Когда клиент заполнит форму на сайте — появится здесь.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {items.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "flex flex-col gap-2 rounded-[10px] border border-border bg-white px-3 py-2.5",
                  a.status === "new" && "bg-amber-50/40 border-amber-200",
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-bold text-ink">
                        {a.name || "Без имени"}
                      </span>
                      {a.status === "new" && (
                        <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                          новая
                        </span>
                      )}
                      {a.status === "viewed" && (
                        <span className="rounded-full bg-surface-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted">
                          просмотрена
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-2">
                      {a.phone || "телефон не указан"}
                      {a.submittedAt && (
                        <span>
                          {" · "}
                          {new Date(a.submittedAt).toLocaleString("ru-RU", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setViewing(a)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-surface-soft"
                  >
                    <Eye size={11} /> Просмотр
                  </button>
                  <button
                    type="button"
                    onClick={() => setConverting(a)}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                  >
                    <Check size={11} /> Оформить
                  </button>
                  <button
                    type="button"
                    onClick={() => markSpam(a)}
                    className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                    title="Пометить как спам и удалить"
                  >
                    <Trash2 size={11} /> Спам
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewing && (
        <NewApplicationModal
          application={viewing}
          onConvertNow={() => {
            setConverting(viewing);
            setViewing(null);
          }}
          onLater={() => setViewing(null)}
          onDelete={() => {
            void markSpam(viewing);
            setViewing(null);
          }}
        />
      )}
      {converting && (
        <ApplicationConvertFlow
          application={converting}
          onClose={() => setConverting(null)}
          onClientCreated={(client) => {
            toast.success("Клиент создан", "Заявка переведена в клиента");
            // Карточку клиента кладём в стек drawer — после оформления
            // (или отмены) аренды оператор окажется на ней.
            if (client?.id) onOpenClient(client.id);
          }}
        />
      )}
    </>
  );
}
