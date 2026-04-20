import { useEffect, useRef, useState } from "react";
import {
  Bike,
  CreditCard,
  Plus,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Client } from "@/lib/mock/clients";

type DealType = "rental" | "installment" | "sale" | "repair";

const DEAL_TYPES: {
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
    id: "installment",
    label: "Рассрочка",
    hint: "Выкуп скутера с еженедельными платежами",
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

export function CreateDealMenu({ client }: { client: Client }) {
  const [open, setOpen] = useState(false);
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
    // TODO: открыть форму создания сделки с выбранным типом
    console.log("Create deal:", type, "for client", client.id);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700"
      >
        <Plus size={13} /> Создать сделку
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
          <div className="py-1">
            {DEAL_TYPES.map((dt) => {
              const blocked = client.blacklisted && dt.blockIfBlacklisted;
              const Icon = dt.icon;
              return (
                <button
                  key={dt.id}
                  type="button"
                  disabled={blocked}
                  onClick={() => handlePick(dt.id)}
                  title={
                    blocked
                      ? "Клиент в чёрном списке — нельзя"
                      : undefined
                  }
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors",
                    blocked
                      ? "cursor-not-allowed opacity-45"
                      : "hover:bg-blue-50",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
                      blocked
                        ? "bg-surface-soft text-muted-2"
                        : "bg-blue-50 text-blue-700",
                    )}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-ink">
                      {dt.label}
                      {blocked && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-red-ink">
                          заблокирован
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {dt.hint}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
