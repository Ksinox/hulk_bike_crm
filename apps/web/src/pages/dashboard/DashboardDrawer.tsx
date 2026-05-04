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
  | { kind: "client"; id: number };

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
  // Самый «глубокий» rental в стеке — он будет фоном, поверх него
  // ClientQuickView. Если top тоже rental — рендерим его как drawer.
  const rentalLayer = stack.find((t) => t.kind === "rental");
  const clientOnTop = top.kind === "client";
  // Если в стеке есть и rental, и client (top), drawer показывает
  // rental, а ClientQuickView рисуется поверх благодаря своему z-120.
  // Если только rental — просто drawer. Если только client — только
  // ClientQuickView (без drawer'а).
  return (
    <>
      {rentalLayer && (
        <RentalDrawerLayer
          rentalId={rentalLayer.id}
          // Кнопка X закрывает ВСЁ окно (стек). Если поверх
          // открыт client — её всё равно не видно, поэтому это
          // безопасно.
          onClose={ctx.close}
        />
      )}
      {clientOnTop && (
        <ClientQuickView
          // ClientQuickView сам полноэкранный с z-120 — рисуется
          // поверх drawer'а. Esc/X внутри него закрывают только
          // его слой через back().
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
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 220);
  };
  // Сбрасываем флаг закрытия при смене rentalId — drawer переоткрывается
  // на другую аренду без размонтирования.
  useEffect(() => {
    setClosing(false);
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
    >
      <aside
        className={cn(
          "ml-auto flex h-full w-full max-w-[820px] flex-col overflow-hidden bg-surface shadow-card-lg",
          "transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          closing ? "translate-x-full" : "translate-x-0",
        )}
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

// ArrowLeft пока не используется — оставлен для будущей кнопки «Назад»
// если решим добавить полную stack-навигацию (rental over rental и т.д.).
void ArrowLeft;
