import { useEffect, useState } from "react";
import { Bike, Calendar, Phone, User as UserIcon, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/files";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useApiClients } from "@/lib/api/clients";
import { useApiRentals } from "@/lib/api/rentals";
import { MODEL_LABEL } from "@/lib/mock/rentals";

type Anchor = { x: number; y: number; w: number; h: number };

/**
 * Hover-preview для плитки парка. Появляется рядом с курсором при
 * наведении (через {@link useTileHoverPreview} hook). Содержит:
 *  • большую аватарку модели (как в карточке скутера),
 *  • имя/модель/пробег/статус скутера,
 *  • если есть открытая аренда — клиент, телефон, план возврата.
 *
 * Это «лёгкое» окошко — НЕ модалка и НЕ drawer; не блокирует фон,
 * исчезает когда курсор уходит. Если оператор хочет открыть полную
 * карточку — клик по плитке (это handlerит сама плитка).
 *
 * Концепция «operations console / progressive disclosure»: оператор
 * наводит — видит выжимку, кликает — проваливается в drawer.
 */
export function ParkTileHoverCard({
  scooterId,
  anchor,
  onClose,
}: {
  scooterId: number;
  anchor: Anchor;
  onClose: () => void;
}) {
  const { data: scooters = [] } = useApiScooters();
  const { data: models = [] } = useApiScooterModels();
  const { data: clients = [] } = useApiClients();
  const { data: rentals = [] } = useApiRentals();

  const scooter = scooters.find((s) => s.id === scooterId) ?? null;
  if (!scooter) return null;

  const linkedModel = scooter.modelId
    ? models.find((m) => m.id === scooter.modelId)
    : models.find((m) =>
        m.name.toLowerCase().includes(scooter.model.toLowerCase()),
      );
  const avatarSrc = fileUrl(linkedModel?.avatarKey);
  const modelName =
    linkedModel?.name ?? MODEL_LABEL[scooter.model] ?? scooter.model;

  // Активная аренда на этом скутере (одна — после v0.2.97 защит дубль
  // невозможен на API-уровне).
  const activeRental = rentals.find(
    (r) =>
      r.scooterId === scooterId &&
      (r.status === "active" ||
        r.status === "overdue" ||
        r.status === "returning"),
  );
  const client = activeRental
    ? clients.find((c) => c.id === activeRental.clientId)
    : null;

  // Координаты карточки: справа от плитки, либо снизу если справа не
  // помещается. Простой алгоритм без сложного flip-логики.
  const PADDING = 12;
  const W = 320;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  let left = anchor.x + anchor.w + PADDING;
  let top = anchor.y;
  if (left + W > winW) {
    // не помещается справа — кладём слева
    left = Math.max(PADDING, anchor.x - W - PADDING);
  }
  // вертикальная коррекция — чтобы карточка не уезжала за низ экрана
  if (top + 280 > winH) {
    top = Math.max(PADDING, winH - 280 - PADDING);
  }

  // Esc закрывает hover (на случай если курсор «застрял» где-то ещё).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="pointer-events-none fixed z-[80] animate-in fade-in slide-in-from-left-1 duration-150"
      style={{ left, top, width: W }}
    >
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card-lg ring-1 ring-border">
        {/* Шапка с аватаркой модели */}
        <div className="relative flex items-end justify-center overflow-hidden bg-surface-soft px-4 pt-4 pb-2">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt={modelName}
              className="-mt-2 h-32 w-auto max-w-none object-contain drop-shadow-[0_8px_12px_rgba(15,23,42,0.18)]"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-ink text-white">
              <Bike size={32} strokeWidth={1.5} />
            </div>
          )}
        </div>

        <div className="px-4 py-3">
          <div className="flex items-baseline gap-2">
            <div className="font-display text-[18px] font-extrabold leading-tight text-ink">
              {scooter.name}
            </div>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                scooter.baseStatus === "rental_pool"
                  ? "bg-green-soft text-green-ink"
                  : scooter.baseStatus === "repair"
                    ? "bg-orange-soft text-orange-ink"
                    : scooter.baseStatus === "for_sale" ||
                        scooter.baseStatus === "buyout"
                      ? "bg-purple-soft text-purple-ink"
                      : scooter.baseStatus === "sold"
                        ? "bg-border text-muted"
                        : "bg-surface-soft text-muted-2",
              )}
            >
              {baseStatusLabel(scooter.baseStatus)}
            </span>
          </div>
          <div className="mt-0.5 text-[12px] text-muted-2">{modelName}</div>
          {scooter.mileage != null && (
            <div className="mt-1 text-[11px] text-muted-2">
              Пробег: {scooter.mileage.toLocaleString("ru-RU")} км
            </div>
          )}

          {/* Активная аренда */}
          {activeRental ? (
            <div className="mt-3 rounded-[12px] bg-blue-50 px-3 py-2 text-[12px] text-blue-900">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-700/80">
                <UserIcon size={10} /> Активная аренда
              </div>
              {client && (
                <div className="mt-1 font-bold text-ink">{client.name}</div>
              )}
              {client?.phone && (
                <a
                  href={`tel:${client.phone.replace(/[^\d+]/g, "")}`}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5 inline-flex items-center gap-1 font-mono text-[12px] text-ink hover:text-blue-700"
                >
                  <Phone size={10} className="text-muted-2" /> {client.phone}
                </a>
              )}
              <div className="mt-1.5 flex items-center gap-1 text-[11px]">
                <Calendar size={10} className="text-muted-2" />
                Возврат: {fmtRuDateTime(activeRental.endPlannedAt)}
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-[12px] bg-surface-soft px-3 py-2 text-[12px] text-muted">
              {scooter.baseStatus === "rental_pool"
                ? "Свободен — клик откроет форму новой аренды."
                : scooter.baseStatus === "repair"
                  ? "В ремонте — без активной аренды."
                  : "Без активной аренды."}
            </div>
          )}

          {scooter.baseStatus === "repair" && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-orange-ink">
              <Wrench size={11} />
              На обслуживании. Подробности — в разделе «Ремонты».
            </div>
          )}

          <div className="mt-2 text-[10px] text-muted-2">
            Клик по плитке — открыть подробную карточку
          </div>
        </div>
      </div>
    </div>
  );
}

function baseStatusLabel(s: string): string {
  switch (s) {
    case "rental_pool":
      return "готов";
    case "repair":
      return "ремонт";
    case "ready":
      return "не распред.";
    case "for_sale":
      return "продажа";
    case "buyout":
      return "выкуп";
    case "sold":
      return "продан";
    case "disassembly":
      return "разборка";
    default:
      return s;
  }
}

function fmtRuDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Хук для управления hover-preview'ом на плитке. Возвращает state
 * текущего scooterId, anchor, и handlers для onMouseEnter/onMouseLeave.
 *
 * Поведение:
 *  - mouseEnter → ставит таймер 350ms; если за это время курсор всё
 *    ещё на плитке — показываем preview (избегаем «всплытия» при
 *    случайном пробеге курсора по сетке плиток);
 *  - mouseLeave → отменяет таймер / прячет preview;
 *  - mousedown / клик — прячет (плитка обработает свой клик).
 */
export function useTileHoverPreview() {
  const [state, setState] = useState<{
    scooterId: number;
    anchor: Anchor;
  } | null>(null);
  const [timer, setTimer] = useState<number | null>(null);

  const onEnter = (e: React.MouseEvent<HTMLElement>, scooterId: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    const anchor: Anchor = { x: r.left, y: r.top, w: r.width, h: r.height };
    if (timer != null) window.clearTimeout(timer);
    const t = window.setTimeout(() => {
      setState({ scooterId, anchor });
    }, 350);
    setTimer(t);
  };
  const onLeave = () => {
    if (timer != null) window.clearTimeout(timer);
    setTimer(null);
    setState(null);
  };
  const close = () => onLeave();
  return { state, onEnter, onLeave, close };
}
