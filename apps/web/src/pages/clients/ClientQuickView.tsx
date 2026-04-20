import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  Phone,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ratingTier,
  SOURCE_LABEL,
} from "@/lib/mock/clients";
import { navigate } from "@/app/navigationStore";
import { useAllClients, useClientExtraPhone } from "./clientStore";
import { ClientPhoto } from "./ClientPhoto";
import {
  getActiveRentalByClient,
  useRentalsByClient,
} from "@/pages/rentals/rentalsStore";

/**
 * Быстрый просмотр карточки клиента — модалка поверх текущей страницы.
 * Из неё можно «провалиться» в полную карточку клиентов (или вернуться обратно).
 */
export function ClientQuickView({
  clientId,
  onClose,
  from,
}: {
  clientId: number;
  onClose: () => void;
  /** Куда вернуться, если пользователь нажмёт «открыть полную карточку» */
  from?: { route: "rentals"; rentalId?: number };
}) {
  const [closing, setClosing] = useState(false);
  const all = useAllClients();
  const client = all.find((c) => c.id === clientId) ?? null;
  const phone2 = useClientExtraPhone(clientId);
  const rentals = useRentalsByClient(clientId);
  const active = getActiveRentalByClient(clientId, rentals);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!client) return null;

  const tier = ratingTier(client.rating);
  const totalTurnover = rentals.reduce((s, r) => s + (r.sum || 0), 0);
  const totalDays = rentals.reduce((s, r) => s + (r.days || 0), 0);

  const openFull = () => {
    navigate({
      route: "clients",
      clientId: client.id,
      from,
    });
    requestClose();
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[120] flex items-center justify-center bg-ink/55 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onClick={requestClose}
    >
      <div
        className={cn(
          "w-full max-w-[520px] overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0 flex-1 text-[13px] font-semibold text-ink">
            Быстрый просмотр клиента
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="flex gap-4">
            <ClientPhoto client={client} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  className={cn(
                    "font-display text-[18px] font-extrabold leading-tight text-ink",
                    client.blacklisted &&
                      "line-through decoration-red/60",
                  )}
                >
                  {client.name}
                </h3>
                {client.blacklisted && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-soft px-2 py-0.5 text-[10px] font-bold text-red-ink">
                    <Ban size={10} /> ЧС
                  </span>
                )}
                {active && (
                  <span className="inline-flex items-center rounded-full bg-green-soft px-2 py-0.5 text-[10px] font-bold text-green-ink">
                    аренда {active.scooter}
                  </span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-muted-2">
                id #{String(client.id).padStart(4, "0")} · добавлен{" "}
                {client.added} · {SOURCE_LABEL[client.source]}
              </div>
              <div className="mt-2 flex flex-col gap-1">
                <a
                  href={`tel:${client.phone.replace(/\s/g, "")}`}
                  className="inline-flex items-center gap-1.5 text-[14px] font-bold tabular-nums text-ink hover:text-blue-600"
                >
                  <Phone size={12} className="text-blue-600" />
                  {client.phone}
                </a>
                {phone2 && (
                  <a
                    href={`tel:${phone2.replace(/\s/g, "")}`}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold tabular-nums text-ink-2 hover:text-blue-600"
                  >
                    <Phone size={11} className="text-muted-2" />
                    {phone2}
                    <span className="text-[10px] text-muted-2">доп</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {client.debt > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-[12px] bg-orange-soft/60 px-3 py-2 text-[12px] text-orange-ink">
              <AlertTriangle size={13} className="shrink-0" />
              <b>Долг: {client.debt.toLocaleString("ru-RU")} ₽</b>
            </div>
          )}

          <div className="mt-3 grid grid-cols-3 gap-2">
            <QuickStat
              label="Рейтинг"
              value={String(client.rating)}
              hint={tier.label.toLowerCase()}
              tone={
                tier.tone === "good"
                  ? "green"
                  : tier.tone === "bad"
                    ? "red"
                    : "neutral"
              }
            />
            <QuickStat
              label="Оборот"
              value={
                totalTurnover > 0
                  ? `${Math.round(totalTurnover / 1000)} тыс ₽`
                  : "—"
              }
              hint="за всё время"
            />
            <QuickStat
              label="Дней в аренде"
              value={totalDays > 0 ? `${totalDays}` : "—"}
              hint="суммарно"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-soft px-5 py-3">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-[12px] font-semibold text-muted hover:bg-border"
          >
            Закрыть
          </button>
          <button
            type="button"
            onClick={openFull}
            className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700"
          >
            Перейти в раздел клиентов <ArrowUpRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickStat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "green" | "red";
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] px-2.5 py-1.5",
        tone === "green"
          ? "bg-green-soft/60"
          : tone === "red"
            ? "bg-red-soft/60"
            : "bg-surface-soft",
      )}
    >
      <div className="text-[10px] font-semibold text-muted-2">{label}</div>
      <div className="font-display text-[15px] font-extrabold tabular-nums text-ink">
        {value}
      </div>
      <div className="text-[10px] text-muted-2">{hint}</div>
    </div>
  );
}
