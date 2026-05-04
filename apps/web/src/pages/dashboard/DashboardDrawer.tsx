import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ExternalLink, X } from "lucide-react";
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
  target: Target | null;
  openRental: (id: number) => void;
  openClient: (id: number) => void;
  close: () => void;
};

const DashboardDrawerCtx = createContext<Ctx | null>(null);

/**
 * Контекст drawer'а на дашборде.
 *
 * Идея заказчика (v0.3.1): клики по виджетам дашборда (плитка скутера,
 * строка просрочки, строка «сегодня возвращают») не должны выкидывать
 * с дашборда на страницу аренд — пусть открывается боковая панель
 * справа с тем же содержимым (RentalCard / ClientQuickView). Дашборд
 * остаётся на своём месте.
 *
 * Если дочерний компонент находится вне Provider'а — хук возвращает no-op
 * стабы, и компонент сам решит fallback (обычно navigate на полную страницу).
 */
export function useDashboardDrawer(): Ctx {
  const v = useContext(DashboardDrawerCtx);
  return (
    v ?? {
      target: null,
      openRental: () => {},
      openClient: () => {},
      close: () => {},
    }
  );
}

export function DashboardDrawerProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const ctx: Ctx = useMemo(
    () => ({
      target,
      openRental: (id) => setTarget({ kind: "rental", id }),
      openClient: (id) => setTarget({ kind: "client", id }),
      close: () => setTarget(null),
    }),
    [target],
  );
  return (
    <DashboardDrawerCtx.Provider value={ctx}>
      {children}
      <DrawerHost target={target} onClose={ctx.close} />
    </DashboardDrawerCtx.Provider>
  );
}

function DrawerHost({
  target,
  onClose,
}: {
  target: Target | null;
  onClose: () => void;
}) {
  // ClientQuickView — собственный фуллскрин-оверлей. Рендерим его
  // отдельно от drawer-панели, иначе будут двойные фоны.
  if (target?.kind === "client") {
    return (
      <ClientQuickView clientId={target.id} onClose={onClose} />
    );
  }
  if (target?.kind === "rental") {
    return <RentalDrawerPanel rentalId={target.id} onClose={onClose} />;
  }
  return null;
}

function RentalDrawerPanel({
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Сбрасываем флаг закрытия при смене rentalId — drawer переоткрывается
  // на другую аренду без размонтирования.
  useEffect(() => {
    setClosing(false);
  }, [rentalId]);

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
        "fixed inset-0 z-[100]",
        // Тонкая дымка по фону. Кликом по ней закрываем.
        closing
          ? "animate-backdrop-out bg-ink/40"
          : "animate-backdrop-in bg-ink/40",
      )}
    >
      <aside
        className={cn(
          "ml-auto flex h-full w-full max-w-[820px] flex-col overflow-hidden bg-surface shadow-card-lg",
          "transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          closing ? "translate-x-full" : "translate-x-0",
        )}
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
