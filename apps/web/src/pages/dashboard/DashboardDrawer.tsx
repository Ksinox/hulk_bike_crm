import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ArrowLeft, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { navigate } from "@/app/navigationStore";
import { RentalCard } from "@/pages/rentals/RentalCard";
import { ClientQuickView } from "@/pages/clients/ClientQuickView";
import {
  useRentals,
  useArchivedRentals,
} from "@/pages/rentals/rentalsStore";

type Target =
  | { kind: "rental"; id: number }
  | { kind: "client"; id: number }
  | { kind: "rentalsList"; filter: "active" | "overdue" | "returnsToday" };

type Ctx = {
  /**
   * Стек открытых сущностей. Top = текущий уровень (последний поверх).
   * Из rental drawer'а можно openClient — кладёт client на top, drawer
   * показывает его. Кнопка «← Назад» / Esc в верхнем слое поппит
   * стек и возвращает на предыдущий уровень.
   */
  stack: Target[];
  openRental: (id: number) => void;
  openClient: (id: number) => void;
  openRentalsList: (filter: "active" | "overdue" | "returnsToday") => void;
  back: () => void;
  close: () => void;
  /** Хелпер для дочерних компонентов: «я внутри drawer'а?» */
  inDrawer: boolean;
};

const DashboardDrawerCtx = createContext<Ctx | null>(null);

/**
 * Контекст drawer'а на дашборде (v0.3.1 — stacking, идея 2).
 *
 * Концепция «operations console» — все действия с дашборда без
 * перехода на страницы:
 *  • клик по виджету → drawer (rental / client) выезжает справа;
 *  • внутри rental drawer'а клик на клиента → openClient — клиент
 *    рендерится поверх rental drawer'а как ClientQuickView (он уже
 *    z-120, drawer z-100, оба видны);
 *  • Esc / закрытие верхнего уровня → возврат к предыдущему;
 *  • когда стек пустой — drawer закрыт.
 *
 * Если дочерний компонент находится вне Provider'а — хук возвращает
 * inDrawer=false и no-op стабы (RentalCard сам решит fallback на
 * navigate / inline ClientQuickView).
 */
export function useDashboardDrawer(): Ctx {
  const v = useContext(DashboardDrawerCtx);
  return (
    v ?? {
      stack: [],
      openRental: () => {},
      openClient: () => {},
      openRentalsList: () => {},
      back: () => {},
      close: () => {},
      inDrawer: false,
    }
  );
}

export function DashboardDrawerProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Target[]>([]);
  const ctx: Ctx = useMemo(
    () => ({
      stack,
      openRental: (id) =>
        setStack((s) => [...s, { kind: "rental", id }]),
      openClient: (id) =>
        setStack((s) => [...s, { kind: "client", id }]),
      openRentalsList: (filter) =>
        setStack((s) => [...s, { kind: "rentalsList", filter }]),
      back: () => setStack((s) => s.slice(0, -1)),
      close: () => setStack([]),
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
  if (stack.length === 0) return null;

  const top = stack[stack.length - 1]!;
  // Базовый «фоновый» уровень — последний rental или rentalsList.
  // ClientQuickView (если он top) рисуется поверх благодаря z-120.
  const baseLayer =
    top.kind === "client"
      ? // Найти в стеке предыдущий не-client уровень для фона.
        [...stack].reverse().find((t) => t.kind !== "client") ?? null
      : top;
  return (
    <>
      {baseLayer && baseLayer.kind === "rental" && (
        <RentalDrawerLayer
          rentalId={baseLayer.id}
          onClose={ctx.close}
        />
      )}
      {baseLayer && baseLayer.kind === "rentalsList" && (
        <RentalsListDrawerLayer
          filter={baseLayer.filter}
          onClose={ctx.close}
          onPickRental={(id) => ctx.openRental(id)}
        />
      )}
      {top.kind === "client" && (
        <ClientQuickView
          // ClientQuickView самостоятельный fullscreen-overlay с z-120 —
          // рисуется поверх drawer'а. Esc/X закрывают только его слой
          // через back(), фоновый drawer остаётся.
          clientId={top.id}
          onClose={ctx.back}
        />
      )}
    </>
  );
}

function RentalDrawerLayer({
  rentalId,
  onClose,
}: {
  rentalId: number;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  // v0.3.2: enter-анимация. Стартуем «за экраном» (translate-x-full),
  // через 10ms ставим entered=true → translate-x-0, transition даёт
  // плавный slide-in справа.
  const [entered, setEntered] = useState(false);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 220);
  };
  // Сбрасываем флаги при смене rentalId — drawer переоткрывается
  // на другую аренду без размонтирования.
  useEffect(() => {
    setClosing(false);
    setEntered(false);
    const t = window.setTimeout(() => setEntered(true), 10);
    return () => window.clearTimeout(t);
  }, [rentalId]);
  // Esc на этом уровне — закрывает drawer. Если поверх открыт client,
  // его собственный обработчик Esc сработает раньше (он повешен глубже
  // в DOM на свой root), поэтому drawer'у Esc дойдёт только когда
  // client уже снят (т.е. drawer на верхнем уровне).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = useRentals();
  const archived = useArchivedRentals();
  const rental = useMemo(
    () =>
      [...active, ...archived].find((r) => r.id === rentalId) ?? null,
    [active, archived, rentalId],
  );

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] bg-ink/40",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      // v0.3.2: клик по затемнённому фону закрывает drawer. Backdrop
      // close для FORM-модалок мы убрали (там это мешало выделению),
      // но для drawer'а это удобно — не тянуться к X в углу.
      onClick={requestClose}
    >
      <aside
        className={cn(
          "ml-auto flex h-full w-full max-w-[820px] flex-col overflow-hidden bg-surface shadow-card-lg",
          "transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          closing || !entered ? "translate-x-full" : "translate-x-0",
        )}
        // Клики внутри панели не должны всплывать в backdrop — иначе
        // drawer закрывался бы при любом клике в RentalCard.
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              Быстрый просмотр аренды
            </div>
            <div className="truncate text-[14px] font-bold text-ink">
              {rental
                ? `Аренда #${String(rental.id).padStart(4, "0")}`
                : `Аренда #${String(rentalId).padStart(4, "0")} (загрузка…)`}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                navigate({ route: "rentals", rentalId });
                requestClose();
              }}
              title="Открыть аренду на полной странице"
              className="inline-flex items-center gap-1 rounded-[8px] bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-blue-50 hover:text-blue-700"
            >
              <ExternalLink size={12} /> На полную
            </button>
            <button
              type="button"
              onClick={requestClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
              title="Закрыть (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {rental ? (
            <RentalCard rental={rental} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted">
              Аренда не найдена. Возможно, она была удалена.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// =====================================================================
// RentalsListDrawerLayer — drawer-список аренд. v0.3.1, idea 4.
// Открывается кликом по KPI-карточкам дашборда (Просрочено / Активные /
// Сегодня возвращают). Внутри — прокручиваемый список соответствующих
// аренд. Клик по строке → push rental на стек drawer'а (см. ctx.openRental).
// =====================================================================
function RentalsListDrawerLayer({
  filter,
  onClose,
  onPickRental,
}: {
  filter: "active" | "overdue" | "returnsToday";
  onClose: () => void;
  onPickRental: (id: number) => void;
}) {
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 220);
  };
  useEffect(() => {
    setClosing(false);
    setEntered(false);
    const t = window.setTimeout(() => setEntered(true), 10);
    return () => window.clearTimeout(t);
  }, [filter]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = useRentals();
  // Используем helpers через локальный import, чтобы не тащить весь
  // useDashboardMetrics (циклический импорт).
  // Простая версия: фильтруем active rentals по статусу/дате.
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Rental из rentalsStore — UI-shape (DD.MM.YYYY), не ApiRental с ISO.
  // Для фильтрации по дате используем парсинг DD.MM.YYYY → YYYY-MM-DD.
  const ymdFromRu = (s: string): string => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  };
  const filtered = active.filter((r) => {
    if (filter === "active") {
      return r.status === "active";
    }
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
    <div
      className={cn(
        "fixed inset-0 z-[100] bg-ink/40",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onClick={requestClose}
    >
      <aside
        className={cn(
          "ml-auto flex h-full w-full max-w-[680px] flex-col overflow-hidden bg-surface shadow-card-lg",
          "transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          closing || !entered ? "translate-x-full" : "translate-x-0",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              Список аренд
            </div>
            <div className="truncate text-[14px] font-bold text-ink">
              {title} · {filtered.length}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                navigate({ route: "rentals" });
                requestClose();
              }}
              title="Открыть список аренд на полной странице"
              className="inline-flex items-center gap-1 rounded-[8px] bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-blue-50 hover:text-blue-700"
            >
              <ExternalLink size={12} /> На полную
            </button>
            <button
              type="button"
              onClick={requestClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
              title="Закрыть (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </header>
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
      </aside>
    </div>
  );
}

// ArrowLeft пока не используется — оставлен для будущей кнопки «Назад»
// если решим добавить полную stack-навигацию (rental over rental и т.д.).
void ArrowLeft;
