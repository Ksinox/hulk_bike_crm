import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { navigate } from "@/app/navigationStore";
import { RentalCard } from "@/pages/rentals/RentalCard";
import {
  useRentals,
  useArchivedRentals,
} from "@/pages/rentals/rentalsStore";
import { useAllClients } from "@/pages/clients/clientStore";
import { ScooterQuickView } from "@/pages/fleet/ScooterQuickView";
import { useFleetScooters } from "@/pages/fleet/fleetStore";
import { ClientCard } from "@/pages/clients/ClientCard";

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
  | { kind: "rentalsList"; filter: "active" | "overdue" | "returnsToday" };

type Ctx = {
  stack: Target[];
  openRental: (id: number) => void;
  openClient: (id: number) => void;
  openScooter: (id: number) => void;
  openRentalsList: (filter: "active" | "overdue" | "returnsToday") => void;
  back: () => void;
  close: () => void;
  closeAt: (index: number) => void;
  inDrawer: boolean;
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
      back: () => {},
      close: () => {},
      closeAt: () => {},
      inDrawer: false,
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
        : "id" in t && "id" in next && t.id === next.id) ||
        false),
  );
  if (idx === -1) return [...stack, next];
  const without = [...stack.slice(0, idx), ...stack.slice(idx + 1)];
  return [...without, next];
}

export function DashboardDrawerProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Target[]>([]);
  const ctx: Ctx = useMemo(
    () => ({
      stack,
      openRental: (id) => setStack((s) => pushUnique(s, { kind: "rental", id })),
      openClient: (id) => setStack((s) => pushUnique(s, { kind: "client", id })),
      openScooter: (id) => setStack((s) => pushUnique(s, { kind: "scooter", id })),
      openRentalsList: (filter) =>
        setStack((s) => pushUnique(s, { kind: "rentalsList", filter })),
      back: () => setStack((s) => s.slice(0, -1)),
      close: () => setStack([]),
      closeAt: (index) =>
        setStack((s) => s.filter((_, i) => i !== index)),
      inDrawer: stack.length > 0,
    }),
    [stack],
  );
  return (
    <DashboardDrawerCtx.Provider value={ctx}>
      {children}
      <DrawerHost ctx={ctx} />
    </DashboardDrawerCtx.Provider>
  );
}

function DrawerHost({ ctx }: { ctx: Ctx }) {
  const { stack } = ctx;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Esc — закрывает верхнюю панель (pop стека, не all).
  useEffect(() => {
    if (stack.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        ctx.back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stack.length, ctx]);

  // Когда добавляется новая панель — скроллим контейнер вправо до конца,
  // чтобы новая была в фокусе.
  useEffect(() => {
    if (stack.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    // Небольшая задержка, чтобы успел применился layout новой панели.
    const t = window.setTimeout(() => {
      el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    }, 60);
    return () => window.clearTimeout(t);
  }, [stack.length]);

  // Колесо мыши: если пользователь крутит над контейнером (но не над
  // скроллящимся внутренне элементом) — переводим в горизонтальный
  // скролл. Внутри drawer-карточки сработает её собственный
  // вертикальный скролл (мы не intercept'им там).
  const onWheelOuter = useCallback((e: React.WheelEvent) => {
    const target = e.target as HTMLElement | null;
    // Если над skroll-able элементом внутри карточки — не вмешиваемся.
    // Эвристика: ищем ближайший элемент с overflow-y:auto/scroll.
    let cur: HTMLElement | null = target;
    while (cur && cur !== scrollRef.current) {
      const cs = window.getComputedStyle(cur);
      if (
        (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
        cur.scrollHeight > cur.clientHeight
      ) {
        return; // даём вертикальному скроллу работать
      }
      cur = cur.parentElement;
    }
    const el = scrollRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, []);

  if (stack.length === 0) return null;

  // v0.4.11: плавная анимация без «дыр» через flex-row-reverse +
  // width-анимацию. Каждая панель имеет внешний контейнер, который
  // растёт от 0 до DRAWER_W через transition:width. Внутри —
  // фиксированной ширины контент. Соседи равномерно сдвигаются по
  // мере роста новой панели, без скачков и пустого места.
  // row-reverse: первый в DOM-массиве (idx=0, корневой) на ЭКРАНЕ
  // оказывается слева, последний (свежий) — справа. Идеально под
  // «новая выезжает справа».
  const DRAWER_W = 820;
  return (
    <div
      className="fixed inset-0 z-[100] bg-ink/40 animate-backdrop-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) ctx.close();
      }}
    >
      <div
        ref={scrollRef}
        onWheel={onWheelOuter}
        className="ml-auto h-full w-full overflow-x-auto overflow-y-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) ctx.close();
        }}
      >
        <div className="flex h-full min-w-full flex-row-reverse justify-start">
          {[...stack].reverse().map((target, revIdx) => {
            const idx = stack.length - 1 - revIdx;
            return (
              <DrawerCard
                key={drawerKey(target, idx)}
                target={target}
                width={DRAWER_W}
                onCloseSelf={() => ctx.closeAt(idx)}
                onOpenRental={ctx.openRental}
                onOpenClient={ctx.openClient}
                onOpenScooter={ctx.openScooter}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function drawerKey(t: Target, idx: number): string {
  if (t.kind === "rentalsList") return `${idx}-list-${t.filter}`;
  return `${idx}-${t.kind}-${t.id}`;
}

function DrawerCard({
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
    // ждём окончания transition (320ms) — потом убираем из стека
    window.setTimeout(onCloseSelf, 320);
  };

  // open=true для рендера content; на exit фазе тоже true чтобы
  // содержимое не пропадало мгновенно при сжатии ширины.
  const isOpen = entered && !closing;

  return (
    <aside
      className={cn(
        "h-full overflow-hidden bg-surface shadow-card-lg",
        "transition-[width,opacity] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        isOpen ? "opacity-100" : "opacity-80",
      )}
      style={{
        width: isOpen ? `min(${width}px, 92vw)` : "0px",
        flexShrink: 0,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Внутренний контейнер с ФИКСИРОВАННОЙ шириной — чтобы content
          не сжимался по мере роста outer width. Outer обрезает overflow. */}
      <div
        className="flex h-full flex-col border-l border-border"
        style={{ width: `min(${width}px, 92vw)` }}
      >
        {target.kind === "rental" && (
          <RentalDrawerContent
            rentalId={target.id}
            onClose={requestClose}
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
}: {
  rentalId: number;
  onClose: () => void;
  onOpenClient: (id: number) => void;
  onOpenScooter: (id: number) => void;
}) {
  const active = useRentals();
  const archived = useArchivedRentals();
  const rental = useMemo(
    () => [...active, ...archived].find((r) => r.id === rentalId) ?? null,
    [active, archived, rentalId],
  );
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
      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        {rental ? (
          <RentalCard rental={rental} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            Аренда не найдена.
          </div>
        )}
      </div>
    </>
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
            кнопке «На полную» в шапке drawer'а. */}
        <ScooterQuickView scooterId={scooterId} />
      </div>
    </>
  );
}

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
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const ymdFromRu = (s: string): string => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  };
  const filtered = active.filter((r) => {
    if (filter === "active") return r.status === "active";
    if (filter === "overdue") {
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
            {filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onPickRental(r.id)}
                className="flex flex-col gap-0.5 rounded-[10px] border border-border bg-white px-3 py-2 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
              >
                <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-ink">
                  Аренда #{String(r.id).padStart(4, "0")}
                  <span className="rounded-full bg-surface-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-2">
                    {r.status}
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
            ))}
          </div>
        )}
      </div>
    </>
  );
}
