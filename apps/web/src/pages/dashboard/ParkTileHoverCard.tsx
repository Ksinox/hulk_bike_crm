import { useEffect, useState } from "react";
import { AlertTriangle, Bike, Calendar, Phone, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/files";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useApiClients } from "@/lib/api/clients";
import { useApiRentals } from "@/lib/api/rentals";
import { MODEL_LABEL } from "@/lib/mock/rentals";

type Anchor = { x: number; y: number; w: number; h: number };

/**
 * Hover-preview для плитки парка.
 *
 *  - Слева: вертикальная постер-аватарка модели (с торчащим колесом
 *    как в карточке скутера).
 *  - Справа: имя/модель/baseStatus, пробег, активная аренда.
 *  - В правом верхнем углу: для аренд возвращающихся СЕГОДНЯ —
 *    крупное время возврата (важная инфа дня).
 *  - Под текстом — статус-плашки:
 *    «Опаздывает на 15 мин» — возврат сегодня, время прошло;
 *    «Просрочен на 2 дня 5 ч» — план возврата вчера и раньше.
 *  - Слева/справа от карточки — треугольник-указатель на исходную
 *    плитку, чтобы было понятно от какой именно плитки эта подсказка
 *    (предупреждение от заказчика: «можно запутаться в сетке плиток»).
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

  // Когда возврат запланирован сегодня — important: показываем большое
  // время в углу карточки. Просрочка по дате (вчера и раньше) — отдельная
  // плашка с расчётом дней + часов.
  const todayKey = ymd(new Date());
  const endKey = activeRental?.endPlannedAt.slice(0, 10);
  const isReturnToday = !!activeRental && endKey === todayKey;
  const overdueDayDate =
    !!activeRental && endKey !== undefined && endKey < todayKey;

  // «Опаздывает на N мин» — возврат сегодня, время прошло.
  let lateMinutesToday = 0;
  let returnTimeToday = "";
  if (isReturnToday && activeRental) {
    const endDate = new Date(activeRental.endPlannedAt);
    const endMs = endDate.getTime();
    const diff = Date.now() - endMs;
    if (diff > 0) lateMinutesToday = Math.floor(diff / 60_000);
    returnTimeToday = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
  }

  // «Просрочен на N дней N часов» — endPlannedAt по календарной дате
  // в прошлом. Считаем разницу в часах и разбиваем на дни/часы.
  let overdueDays = 0;
  let overdueHoursRest = 0;
  if (overdueDayDate && activeRental) {
    const endMs = new Date(activeRental.endPlannedAt).getTime();
    const totalHours = Math.max(0, Math.floor((Date.now() - endMs) / 3_600_000));
    overdueDays = Math.floor(totalHours / 24);
    overdueHoursRest = totalHours % 24;
  }

  // Размещение карточки. Ширина 360px. Пытаемся справа от плитки;
  // если не помещается — слева. По вертикали стараемся центровать
  // с плиткой, но не залезать за края экрана.
  const PADDING = 12;
  const W = 360;
  const H_APPROX = 220;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  let placedRight = true;
  let left = anchor.x + anchor.w + PADDING;
  if (left + W > winW) {
    left = Math.max(PADDING, anchor.x - W - PADDING);
    placedRight = false;
  }
  let top = anchor.y + anchor.h / 2 - H_APPROX / 2;
  if (top + H_APPROX > winH) top = winH - H_APPROX - PADDING;
  if (top < PADDING) top = PADDING;
  // Координата центра плитки относительно top карточки — указатель
  // должен «смотреть» прямо в центр плитки, даже если карточка
  // съехала из-за края экрана.
  const tileCenterY = anchor.y + anchor.h / 2;
  const arrowTopWithinCard = Math.max(
    16,
    Math.min(H_APPROX - 16, tileCenterY - top),
  );

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
      {/* Указатель-треугольник к исходной плитке. Если карточка справа
          от плитки — треугольник торчит влево; если слева — вправо. */}
      <span
        className={cn(
          "absolute h-0 w-0",
          placedRight ? "-left-[10px]" : "-right-[10px]",
        )}
        style={{
          top: arrowTopWithinCard - 8,
          borderTop: "8px solid transparent",
          borderBottom: "8px solid transparent",
          ...(placedRight
            ? { borderRight: "10px solid hsl(var(--surface))" }
            : { borderLeft: "10px solid hsl(var(--surface))" }),
          // Тонкая обводка треугольника. Псевдоэлементами border делается
          // плохо — оставляем без обводки, но drop-shadow карточки даст
          // визуальную привязку.
          filter: "drop-shadow(0 1px 1px rgba(15,23,42,0.08))",
        }}
        aria-hidden
      />

      <div className="relative overflow-hidden rounded-2xl bg-surface shadow-card-lg ring-1 ring-border">
        <div className="flex">
          {/* === Слева: вертикальная постер-аватарка === */}
          <div className="relative flex w-[120px] shrink-0 items-end justify-center overflow-visible bg-surface-soft pb-2">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={modelName}
                className="-mb-1 -mt-2 h-[160px] w-auto max-w-none object-contain drop-shadow-[0_8px_12px_rgba(15,23,42,0.18)]"
              />
            ) : (
              <div className="my-6 flex h-20 w-20 items-center justify-center rounded-full bg-ink text-white">
                <Bike size={32} strokeWidth={1.5} />
              </div>
            )}
          </div>

          {/* === Справа: инфо-колонка === */}
          <div className="min-w-0 flex-1 px-3 py-3">
            <div className="flex items-center gap-2">
              <div className="font-display text-[16px] font-extrabold leading-tight text-ink">
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
            <div className="mt-0.5 truncate text-[11px] text-muted-2">
              {modelName}
            </div>
            {scooter.mileage != null && (
              <div className="mt-0.5 text-[10px] text-muted-2">
                Пробег: {scooter.mileage.toLocaleString("ru-RU")} км
              </div>
            )}

            {/* Активная аренда — компактный блок */}
            {activeRental && (
              <div className="mt-2 rounded-[10px] bg-blue-50 px-2.5 py-1.5 text-[12px] text-blue-900">
                {client && (
                  <div className="truncate font-bold text-ink">
                    {client.name}
                  </div>
                )}
                {client?.phone && (
                  <a
                    href={`tel:${client.phone.replace(/[^\d+]/g, "")}`}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] text-ink hover:text-blue-700"
                  >
                    <Phone size={10} className="text-muted-2" />
                    {client.phone}
                  </a>
                )}
                {/* Мелкая строка «Возврат: дата+время» — НЕ показываем
                    если возврат сегодня (тогда внизу будет крупная
                    зелёная плашка с временем). Для дальних возвратов
                    (завтра и позже) — оставляем чтобы было видно дату. */}
                {!isReturnToday && (
                  <div className="mt-0.5 flex items-center gap-1 text-[10px]">
                    <Calendar size={10} className="text-muted-2" />
                    Возврат: {fmtRuDateTime(activeRental.endPlannedAt)}
                  </div>
                )}
              </div>
            )}

            {/* Возврат сегодня — крупная зелёная плашка внизу карточки
                (вместо position-absolute правого верхнего угла, который
                ломал верстку при длинных именах). Время крупным шрифтом,
                рядом подпись «Возврат сегодня». Если время уже прошло —
                плашка станет красной с «Опаздывает на N мин» (см. ниже). */}
            {isReturnToday && returnTimeToday && lateMinutesToday === 0 && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-green px-3 py-1 text-white shadow-card">
                <Calendar size={12} />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Возврат сегодня
                </span>
                <span className="font-display text-[18px] font-extrabold tabular-nums leading-none">
                  {returnTimeToday}
                </span>
              </div>
            )}

            {/* Плашка «Опаздывает на N мин» — крупная красная, в том же
                стиле что и зелёная сверху. */}
            {lateMinutesToday > 0 && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-red px-3 py-1 text-white shadow-card">
                <AlertTriangle size={12} />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Опаздывает на
                </span>
                <span className="font-display text-[18px] font-extrabold tabular-nums leading-none">
                  {fmtMinutes(lateMinutesToday)}
                </span>
              </div>
            )}
            {/* «Просрочен на N дней N часов» — full overdue. */}
            {overdueDayDate && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-red px-3 py-1 text-white shadow-card">
                <AlertTriangle size={12} />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Просрочен на
                </span>
                <span className="font-display text-[18px] font-extrabold tabular-nums leading-none">
                  {fmtDaysHours(overdueDays, overdueHoursRest)}
                </span>
              </div>
            )}
            {scooter.baseStatus === "repair" && !activeRental && (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-orange-soft px-2 py-0.5 text-[11px] font-bold text-orange-ink">
                <Wrench size={10} />
                В ремонте
              </div>
            )}

            {!activeRental && scooter.baseStatus === "rental_pool" && (
              <div className="mt-2 text-[11px] text-muted-2">
                Свободен — клик откроет форму новой аренды.
              </div>
            )}
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

function fmtMinutes(m: number): string {
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (rest === 0) return `${h} ч`;
  return `${h} ч ${rest} мин`;
}

function fmtDaysHours(days: number, hours: number): string {
  if (days === 0) return `${hours} ч`;
  if (hours === 0) return `${days} ${pluralDay(days)}`;
  return `${days} ${pluralDay(days)} ${hours} ч`;
}

function pluralDay(n: number): string {
  const a = Math.abs(n);
  const n10 = a % 10;
  const n100 = a % 100;
  if (n10 === 1 && n100 !== 11) return "день";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "дня";
  return "дней";
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Хук для управления hover-preview'ом на плитке. Возвращает state
 * текущего scooterId, anchor, и handlers для onMouseEnter/onMouseLeave.
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
