import { useEffect, useRef, useState } from "react";
import {
  Bike,
  ChevronDown,
  CreditCard,
  Plus,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Client } from "@/lib/mock/clients";
import { cn } from "@/lib/utils";
import { NewRentalModal } from "@/pages/rentals/NewRentalModal";
import { navigate } from "@/app/navigationStore";
import { toast } from "@/lib/toast";

export type DealType = "rental" | "buyout" | "sale" | "repair";

export const DEAL_TYPES: {
  id: DealType;
  label: string;
  hint: string;
  icon: LucideIcon;
  blockIfBlacklisted: boolean;
}[] = [
  {
    id: "rental",
    label: "Аренда",
    hint: "Скутер напрокат — на день, неделю, месяц",
    icon: Bike,
    blockIfBlacklisted: true,
  },
  {
    id: "buyout",
    label: "Выкуп",
    hint: "Скутер переходит клиенту с еженедельными платежами",
    icon: CreditCard,
    blockIfBlacklisted: true,
  },
  {
    id: "sale",
    label: "Продажа",
    hint: "Продать скутер клиенту — разовая оплата",
    icon: Wallet,
    blockIfBlacklisted: true,
  },
  {
    id: "repair",
    label: "Ремонт",
    hint: "Ремонт стороннего скутера клиента",
    icon: Wrench,
    blockIfBlacklisted: false,
  },
];

/** Типы сделки, которые уже работают (правка 31.08: продажи запущены). */
const READY_TYPES: DealType[] = ["rental", "sale"];

/**
 * Список типов сделки внутри выпадающего меню — общий для карточки клиента
 * (CreateDealMenu) и кнопки «Новая сделка» в шапке (NewDealButton, пункт 5).
 * Пункты открываются по мере готовности: сейчас живые «Аренда» и
 * «Продажа», остальные помечены «скоро».
 */
function DealTypeList({
  blacklisted,
  onPick,
}: {
  blacklisted?: boolean;
  onPick: (type: DealType) => void;
}) {
  return (
    <div className="py-1">
      {DEAL_TYPES.map((dt) => {
        const Icon = dt.icon;
        const blockedByBlacklist = dt.blockIfBlacklisted && !!blacklisted;
        const enabled = READY_TYPES.includes(dt.id) && !blockedByBlacklist;
        return (
          <button
            key={dt.id}
            type="button"
            disabled={!enabled}
            onClick={enabled ? () => onPick(dt.id) : undefined}
            title={
              enabled
                ? ""
                : blockedByBlacklist
                  ? "Клиент в чёрном списке"
                  : "Скоро появится"
            }
            className={cn(
              "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors",
              enabled
                ? "hover:bg-surface-soft"
                : "cursor-not-allowed opacity-55",
            )}
          >
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
                enabled
                  ? "bg-blue-50 text-blue-600"
                  : "bg-surface-soft text-muted-2",
              )}
            >
              <Icon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                {dt.label}
                {!enabled && (
                  <span className="rounded-full bg-surface-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-2">
                    {blockedByBlacklist ? "ЧС" : "скоро"}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">{dt.hint}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Пункт 5 — кнопка «Новая сделка» в шапке (вместо «Новая аренда»).
 * Тот же выпадающий список типов, но клиент ещё не выбран — «Аренда»
 * открывает обычное окно создания аренды с выбором клиента внутри.
 */
export function NewDealButton({
  onRental,
}: {
  /** Если задан — «Аренда» отдаётся родителю (Topbar сам рендерит окно
   *  с нужной логикой навигации), иначе окно открывается здесь. */
  onRental?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rentalOpen, setRentalOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handlePick = (type: DealType) => {
    setOpen(false);
    if (type === "rental") {
      if (onRental) onRental();
      else setRentalOpen(true);
    } else if (type === "sale") {
      // Продажа оформляется мастером в своём разделе — ведём туда и сразу
      // открываем мастер (правка 31.08).
      navigate({ route: "sales", newSale: true });
    }
  };

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[13px] font-bold text-white transition-colors hover:bg-blue-600"
        title="Новая сделка"
      >
        <Plus size={14} /> Новая сделка
        <ChevronDown
          size={13}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[280px] origin-top-right animate-modal-in overflow-hidden rounded-[14px] border border-border bg-surface shadow-card-lg">
          <div className="border-b border-border bg-surface-soft px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              Тип сделки
            </div>
            <div className="text-[13px] font-semibold text-ink">
              Что оформляем?
            </div>
          </div>
          <DealTypeList onPick={handlePick} />
        </div>
      )}

      {rentalOpen && (
        <NewRentalModal
          onClose={() => setRentalOpen(false)}
          onCreated={(r) => {
            setRentalOpen(false);
            toast.success("Аренда создана");
            navigate({ route: "rentals", rentalId: r.id });
          }}
        />
      )}
    </div>
  );
}

export function CreateDealMenu({
  client,
  block,
}: {
  client: Client;
  /** #30: на мобиле — крупная кнопка во всю ячейку (а не маленькая пилюля). */
  block?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rentalOpen, setRentalOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handlePick = (type: DealType) => {
    setOpen(false);
    if (type === "rental") setRentalOpen(true);
    else if (type === "sale") {
      // Продажа — мастер в разделе «Продажи», клиент уже выбран.
      navigate({ route: "sales", newSale: true, clientId: client.id });
    }
  };

  return (
    <div ref={ref} className={cn("relative", block && "w-full")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "items-center gap-1 bg-blue-600 font-semibold text-white transition-colors hover:bg-blue-700",
          block
            ? "flex min-h-[48px] w-full justify-center gap-1.5 rounded-xl text-[14px] font-bold active:scale-[0.98]"
            : "inline-flex rounded-full px-3 py-1.5 text-[12px]",
        )}
      >
        <Plus size={block ? 17 : 13} /> Создать сделку
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[280px] origin-top-right animate-modal-in overflow-hidden rounded-[14px] border border-border bg-surface shadow-card-lg">
          <div className="border-b border-border bg-surface-soft px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              Тип сделки
            </div>
            <div className="text-[13px] font-semibold text-ink">
              {client.name.split(" ")[0]} {client.name.split(" ")[1]?.[0]}.
            </div>
          </div>
          <DealTypeList
            blacklisted={!!client.blacklisted}
            onPick={handlePick}
          />
        </div>
      )}

      {/* Создание аренды с уже выбранным клиентом; после создания —
          переход к новой аренде. */}
      {rentalOpen && (
        <NewRentalModal
          initialClientId={client.id}
          onClose={() => setRentalOpen(false)}
          onCreated={(r) => {
            setRentalOpen(false);
            toast.success("Аренда создана");
            navigate({ route: "rentals", rentalId: r.id });
          }}
        />
      )}
    </div>
  );
}
