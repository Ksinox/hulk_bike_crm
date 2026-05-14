/**
 * MasterBlock — основной 3-колоночный блок карточки аренды:
 *   • CLIENT      (identity strip + фото-карточка + ФИО + контакты + 3 KPI-блока)
 *   • SCOOTER     (вертикальная аватарка + номер/модель + пробег)
 *   • EQUIPMENT   (2×2 grid: аватарка СВЕРХУ + подпись ОТДЕЛЬНО ПОД ней)
 *
 * v0.6.15 (обновлено v0.6.28 — кнопка «Инцидент» убрана):
 *   - CLIENT: правая часть колонки клиента (под телефонами) — 2 равных
 *     мини-колонки в grid-cols-2:
 *       1) «Дней в аренде» — сумма по всем арендам клиента
 *       2) «Принёс за всё время аренд» — сумма всех payments
 *     Карточки Залог/Депозит остаются внизу как 2-col grid.
 *   - SCOOTER: аватарка ВЕРТИКАЛЬНАЯ (aspect-[9/12]), hover-overlay
 *     «Заменить». Текст ПОД аватаркой: номер крупно (font-display
 *     text-[20px]), модель мельче серым, пробег ещё мельче.
 *   - EQUIPMENT: каждая позиция — 2 ОТДЕЛЬНЫХ блока: квадратная аватарка
 *     сверху (с бейджем +N ₽ поверх) + подпись названия под ней (без рамки,
 *     серым, 2 строки). Free → зелёный border + bg-tint, Paid → синий
 *     border + bg-tint.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Clock,
  Package,
  PhoneOff,
  Phone,
  Plus,
  Repeat,
  Shield,
  Star,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useApiEquipment } from "@/lib/api/equipment";
import { useApiRentals } from "@/lib/api/rentals";
import { useApiPayments } from "@/lib/api/payments";
import { fileUrl } from "@/lib/files";
import { ScooterPosterAvatar } from "@/pages/rentals/ScooterPosterAvatar";
import { initialsOf } from "@/lib/mock/clients";
import { toast } from "@/lib/toast";
import { equipmentChangeAsync } from "@/pages/rentals/rentalsStore";
import {
  DEPOSIT_AMOUNT,
  STATUS_LABEL,
  STATUS_TONE,
  type Rental,
  type RentalStatus,
} from "@/lib/mock/rentals";
import type { ApiClient, ApiScooter } from "@/lib/api/types";

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "0";
  return n.toLocaleString("ru-RU");
}

/** Цвет аватарки клиента — детерминирован от id для стабильности. */
function clientColor(id: number): string {
  const palette = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
  return palette[((id - 1) % palette.length + palette.length) % palette.length];
}

function statusChipClass(tone: string): string {
  return tone === "green"
    ? "bg-green-soft text-green-ink"
    : tone === "red"
      ? "bg-red-soft text-red-ink"
      : tone === "orange"
        ? "bg-orange-soft text-orange-ink"
        : tone === "blue"
          ? "bg-blue-50 text-blue-700"
          : tone === "purple"
            ? "bg-purple-soft text-purple-ink"
            : "bg-surface-soft text-muted";
}

export function MasterBlock({
  rental,
  client,
  scooter,
  effectiveStatus,
  isUnreachable,
  isArchived,
  totalDebt,
  overdueDays,
  onOpenDebts,
  onOpenClientProfile,
  onSwapScooter,
  onChangeEquipment,
}: {
  rental: Rental;
  client: ApiClient | null | undefined;
  scooter: ApiScooter | null | undefined;
  effectiveStatus: RentalStatus;
  isUnreachable: boolean;
  isArchived: boolean;
  totalDebt: number;
  overdueDays: number;
  onOpenDebts?: () => void;
  onOpenClientProfile: () => void;
  onSwapScooter: () => void;
  /** Если undefined — кнопка изменения экипировки не отображается
   *  (для архивных или completed аренд, где править нельзя). */
  onChangeEquipment?: () => void;
}) {
  const equipmentJson = rental.equipmentJson ?? [];

  // v0.6.10: inline popover для замены экипировки (см. дизайн
  // rental-card.jsx стр. 504-535 + pickers.jsx EquipmentSwapPicker).
  // v0.6.16: значение -1 = add-режим (popover открыт для добавления новой
  // позиции, а не для замены существующей).
  const [swapIdx, setSwapIdx] = useState<number | null>(null);
  // v0.6.16: hover на тайле экипировки → показать overlay «Заменить».
  const [hoverEqIdx, setHoverEqIdx] = useState<number | null>(null);
  // v0.6.16: preview-режим — popover выбирает позицию, тайл в гриде
  // отображается с pulse-анимацией, но изменения НЕ применены до клика
  // «Подтвердить».
  const [pendingItem, setPendingItem] = useState<{
    itemId: number | null;
    name: string;
    price: number;
    free: boolean;
  } | null>(null);
  // v0.6.14: hover на аватарке скутера → показать overlay с «Заменить».
  const [scooterHover, setScooterHover] = useState(false);

  const currentDeposit = rental.deposit ?? DEPOSIT_AMOUNT;
  const originalDeposit = rental.depositOriginal ?? currentDeposit;
  const depositSpent = Math.max(0, originalDeposit - currentDeposit);
  const depositItem = rental.depositItem ?? null;

  const tone = STATUS_TONE[effectiveStatus] ?? STATUS_TONE[rental.status];

  // v0.6.14: KPI клиента — сумма дней по всем арендам + сумма всех
  // платежей (исключая deposit/refund). Делаем через useApiRentals +
  // useApiPayments, фильтруя локально по clientId.
  const { data: allRentals = [] } = useApiRentals();
  const { data: allPayments = [] } = useApiPayments();
  const clientStats = useMemo(() => {
    if (!client) return { totalDays: 0, totalPaid: 0 };
    const clientRentals = allRentals.filter((r) => r.clientId === client.id);
    const rentalIds = new Set(clientRentals.map((r) => r.id));
    const totalDays = clientRentals.reduce(
      (s, r) => s + (r.days ?? 0),
      0,
    );
    const totalPaid = allPayments.reduce((s, p) => {
      if (!p.paid) return s;
      if (!rentalIds.has(p.rentalId)) return s;
      if (p.type === "deposit" || p.type === "refund") return s;
      return s + p.amount;
    }, 0);
    return { totalDays, totalPaid };
  }, [client, allRentals, allPayments]);

  return (
    <div className="rounded-2xl bg-surface border border-border shadow-card-sm">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1px_1fr_1px_1fr]">
        {/* COLUMN 1 — CLIENT */}
        <div className="p-5 flex flex-col gap-3">
          {/* Identity strip — мелкая полоса сверху */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10.5px] uppercase tracking-wider font-bold text-muted-2 tabular-nums">
              Аренда · #{String(rental.id).padStart(4, "0")}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold",
                statusChipClass(tone),
              )}
            >
              {STATUS_LABEL[effectiveStatus] ?? STATUS_LABEL[rental.status]}
            </span>
            {isArchived && (
              <span className="inline-flex items-center rounded-full bg-surface-soft px-2 py-0.5 text-[10.5px] font-bold text-muted ring-1 ring-inset ring-border">
                в архиве
              </span>
            )}
            {totalDebt > 0 && (
              <button
                type="button"
                onClick={onOpenDebts}
                className="inline-flex items-center gap-1 rounded-full bg-red-600 text-white px-2 py-0.5 text-[10.5px] font-bold hover:brightness-110"
                title="История долгов"
              >
                <AlertTriangle size={10} /> {fmt(totalDebt)} ₽
                {overdueDays > 0 && <> · {overdueDays} дн</>}
              </button>
            )}
            {isUnreachable && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-soft px-2 py-0.5 text-[10.5px] font-bold text-orange-ink">
                <PhoneOff size={10} /> Не выходит
              </span>
            )}
            {/* v0.6.15: старая кнопка-иконка инцидента из identity strip
                удалена — она переехала в правую мини-колонку KPI ниже. */}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onOpenClientProfile}
              className="w-[88px] shrink-0 group cursor-pointer text-left"
              title="Открыть профиль клиента"
            >
              <div
                className="aspect-[9/12] rounded-[12px] overflow-hidden flex flex-col border border-border group-hover:border-blue-600 transition-colors"
                style={{
                  background: client
                    ? `linear-gradient(135deg, ${clientColor(client.id)}33, ${clientColor(client.id)}11)`
                    : "var(--surface-soft)",
                }}
              >
                <div className="flex-1 flex items-center justify-center">
                  <span
                    className="font-display text-[30px] font-extrabold"
                    style={{
                      color: client ? clientColor(client.id) : "#94a3b8",
                      opacity: 0.55,
                    }}
                  >
                    {client ? initialsOf(client.name) : "?"}
                  </span>
                </div>
                <div
                  className="px-1 py-0.5 text-center text-[8px] font-bold uppercase tracking-wider text-white"
                  style={{
                    background: client ? clientColor(client.id) : "#94a3b8",
                    opacity: 0.85,
                  }}
                >
                  фото
                </div>
              </div>
            </button>
            <div className="flex-1 min-w-0">
              <button
                type="button"
                onClick={onOpenClientProfile}
                className="text-left group"
                title="Открыть профиль клиента"
              >
                <h2 className="font-display text-[20px] leading-[1.1] font-extrabold text-ink tracking-tight group-hover:text-blue-700 group-hover:underline decoration-2 underline-offset-2">
                  {client?.name ?? "Клиент не найден"}
                </h2>
              </button>
              {client && (
                <div className="mt-1 inline-flex items-center gap-1 text-[11px]">
                  <Star size={10} className="text-orange" />
                  <span className="tabular-nums font-bold text-ink-2">
                    {client.rating}
                  </span>
                  <span className="text-muted-2">рейтинг</span>
                </div>
              )}
              {/* v0.6.14: только телефон и доп. телефон. ДР и адрес убраны. */}
              <div className="mt-2 flex flex-col gap-0.5 text-[11.5px]">
                {client?.phone && (
                  <MetaLine
                    label="Телефон"
                    value={
                      <a
                        href={`tel:${client.phone.replace(/[^+0-9]/g, "")}`}
                        className="tabular-nums font-semibold text-ink-2 hover:text-blue-700 inline-flex items-center gap-1"
                      >
                        <Phone size={10} /> {client.phone}
                      </a>
                    }
                  />
                )}
                <MetaLine
                  label="Доп. тел"
                  value={
                    client?.extraPhone ? (
                      <span className="tabular-nums text-ink-2">
                        {client.extraPhone}
                      </span>
                    ) : (
                      <span className="text-muted-2 italic">— нет</span>
                    )
                  }
                />
              </div>
            </div>
          </div>

          {/* v0.6.28: кнопка «Инцидент» убрана по запросу заказчика.
              KPI — теперь две равных мини-колонки. */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[10px] bg-surface-soft px-2 py-2 flex flex-col items-center text-center justify-center min-h-[64px]">
              <div className="text-[9px] uppercase tracking-wider font-bold text-muted-2 leading-tight">
                Дней в аренде
              </div>
              <div className="mt-1 font-display text-[18px] font-extrabold tabular-nums text-ink leading-none">
                {fmt(clientStats.totalDays)}
              </div>
            </div>
            <div className="rounded-[10px] bg-surface-soft px-2 py-2 flex flex-col items-center text-center justify-center min-h-[64px]">
              <div className="text-[9px] uppercase tracking-wider font-bold text-muted-2 leading-tight">
                Принёс за всё время аренд
              </div>
              <div className="mt-1 font-display text-[14px] font-extrabold tabular-nums text-blue-700 leading-none">
                {fmt(clientStats.totalPaid)} ₽
              </div>
            </div>
          </div>

          {/* Money row — залог + депозит клиента (2-col) */}
          <div className="mt-auto pt-3 grid grid-cols-2 gap-2">
            <div className="rounded-[10px] border border-border bg-surface-soft px-3 py-2">
              <div className="text-[9.5px] uppercase tracking-wider font-bold text-muted-2 inline-flex items-center gap-1">
                <Shield size={10} /> Залог
              </div>
              <div className="mt-0.5 font-display text-[15px] font-extrabold tabular-nums text-ink leading-tight">
                {depositItem ? depositItem : `${fmt(currentDeposit)} ₽`}
              </div>
              <div className="mt-0.5 text-[10px] text-muted">
                {depositItem
                  ? "предметный залог"
                  : depositSpent > 0
                    ? `из ${fmt(originalDeposit)} ₽ — списано ${fmt(depositSpent)} ₽`
                    : "на балансе компании"}
              </div>
            </div>
            <div className="rounded-[10px] border border-border bg-surface-soft px-3 py-2">
              <div className="text-[9.5px] uppercase tracking-wider font-bold text-muted-2 inline-flex items-center gap-1">
                <Wallet size={10} /> Депозит
              </div>
              <div className="mt-0.5 font-display text-[15px] font-extrabold tabular-nums text-blue-700 leading-tight">
                {fmt(client?.depositBalance ?? 0)} ₽
              </div>
              <div className="mt-0.5 text-[10px] text-muted">свободные средства</div>
            </div>
          </div>
        </div>

        <div className="hidden lg:block bg-border"></div>

        {/* COLUMN 2 — SCOOTER (v0.6.14: большая аватарка + hover-overlay) */}
        <div className="p-5 flex flex-col bg-surface-soft/40">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
              Скутер
            </div>
          </div>
          <div className="flex flex-col items-center">
            {/* v0.6.15: вертикальная аватарка (aspect 9/12 — портретная),
                hover-overlay с кнопкой «Заменить». Текст идёт ПОД аватаркой
                отдельным блоком, а не поверх. */}
            <div
              className="relative w-full max-w-[170px]"
              onMouseEnter={() => setScooterHover(true)}
              onMouseLeave={() => setScooterHover(false)}
            >
              <ScooterPosterAvatar
                scooter={scooter ?? null}
                size="md"
                className="!h-auto aspect-[9/12] w-full"
              />
              {/* hover overlay с кнопкой «Заменить» */}
              {scooterHover && (
                <div className="absolute inset-0 rounded-2xl bg-ink/45 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                  <button
                    type="button"
                    onClick={onSwapScooter}
                    className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white text-ink px-3 py-1.5 text-[12px] font-bold shadow-card-sm hover:bg-blue-50 hover:text-blue-700"
                    title="Заменить скутер"
                  >
                    <Repeat size={12} /> Заменить
                  </button>
                </div>
              )}
            </div>
            <div className="mt-3 text-center w-full min-w-0">
              <div className="font-display text-[20px] font-extrabold text-ink leading-tight truncate">
                {scooter?.name ?? rental.scooter ?? "—"}
              </div>
              <div className="text-[12px] font-semibold text-muted-2 mt-1 truncate">
                <ScooterModelLabel scooter={scooter ?? null} fallback={rental.model} />
              </div>
              {scooter && (
                <div className="mt-1 text-[10.5px] text-muted-2 inline-flex items-center gap-1">
                  <Clock size={10} /> Пробег{" "}
                  <span className="tabular-nums text-ink-2 font-semibold">
                    {fmt(scooter.mileage)} км
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="hidden lg:block bg-border"></div>

        {/* COLUMN 3 — EQUIPMENT (v0.6.14: 2×2 grid) */}
        <div className="p-5 flex flex-col bg-surface-soft/40">
          <div className="flex items-start justify-between mb-2.5 gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
                Экипировка
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                {equipmentJson.length}{" "}
                {pluralPos(equipmentJson.length)}
              </div>
            </div>
            {/* v0.6.16: кнопка «+ Добавить» в шапке убрана — есть inline-tile
                «+ Добавить» в самой сетке, дублировать не нужно. */}
          </div>
          {equipmentJson.length === 0 ? (
            // v0.6.14: пустой state — большой плейсхолдер с «+».
            // v0.6.16: открывает inline-popover (swapIdx=-1) вместо
            // EquipmentChangeDialog.
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => onChangeEquipment && setSwapIdx(swapIdx === -1 ? null : -1)}
                disabled={!onChangeEquipment}
                className={cn(
                  "w-full min-h-[180px] flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface-soft/60 text-muted-2 transition-colors",
                  onChangeEquipment
                    ? "hover:border-blue-600 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
                    : "cursor-default opacity-70",
                  swapIdx === -1 &&
                    "ring-2 ring-blue-600 ring-offset-1 border-blue-600 bg-blue-50 text-blue-700",
                  swapIdx === -1 && pendingItem && "animate-pulse opacity-80",
                )}
              >
                {swapIdx === -1 && pendingItem ? (
                  <>
                    <div className="rounded-[10px] border-2 border-blue-200 bg-blue-50 w-16 h-16 p-2 flex items-center justify-center">
                      <EquipmentThumb
                        item={{
                          itemId: pendingItem.itemId,
                          name: pendingItem.name,
                          free: pendingItem.free,
                        }}
                      />
                    </div>
                    <div className="text-[12px] font-bold text-blue-700">
                      {pendingItem.name}
                    </div>
                    <div className="text-[10.5px] text-blue-700/70">
                      превью — нажмите «Подтвердить»
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[12px] font-bold uppercase tracking-wider">
                      Пока пусто
                    </div>
                    <div className="rounded-full bg-surface w-12 h-12 flex items-center justify-center shadow-card-sm">
                      <Plus size={26} strokeWidth={2.2} />
                    </div>
                    <div className="text-[11px]">
                      {onChangeEquipment
                        ? "Нажмите, чтобы добавить экипировку"
                        : "Экипировки нет"}
                    </div>
                  </>
                )}
              </button>
              {swapIdx === -1 && onChangeEquipment && (
                <EquipmentSwapPopover
                  rental={rental}
                  replacingIdx={-1}
                  onClose={() => {
                    setSwapIdx(null);
                    setPendingItem(null);
                  }}
                  onPreviewChange={setPendingItem}
                />
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-2 gap-y-3 content-start">
              {equipmentJson.slice(0, 4).map((origIt, idx) => {
                const canSwap = !!onChangeEquipment;
                const isOpen = swapIdx === idx;
                // v0.6.16: если позиция заменяется и есть pending — рисуем
                // pending вместо текущей, с pulse-анимацией.
                const showingPending = isOpen && pendingItem != null;
                const it = showingPending ? pendingItem : origIt;
                const isFree = it.free;
                const isHover = hoverEqIdx === idx;
                return (
                  <div
                    key={`${origIt.itemId ?? "na"}-${idx}`}
                    className={cn(
                      "relative flex flex-col",
                      showingPending && "animate-pulse opacity-80",
                    )}
                    onMouseEnter={() => canSwap && setHoverEqIdx(idx)}
                    onMouseLeave={() => setHoverEqIdx((v) => (v === idx ? null : v))}
                  >
                    {/* v0.6.15: квадратная аватарка СВЕРХУ с бейджем цены
                        ПОВЕРХ. Подпись названия — ОТДЕЛЬНЫМ блоком ПОД
                        аватаркой (см. ниже), без рамки, может в 2 строки.
                        v0.6.16: hover → blue overlay с иконкой Repeat. */}
                    <button
                      type="button"
                      onClick={() => {
                        if (!canSwap) return;
                        setSwapIdx(isOpen ? null : idx);
                      }}
                      disabled={!canSwap}
                      className={cn(
                        "w-full aspect-square rounded-[12px] border-2 p-2 flex items-center justify-center transition-colors relative",
                        isFree
                          ? "border-green bg-green-soft/50 hover:bg-green-soft"
                          : "border-blue-200 bg-blue-50 hover:bg-blue-100",
                        isOpen &&
                          (isFree
                            ? "ring-2 ring-green ring-offset-1"
                            : "ring-2 ring-blue-600 ring-offset-1"),
                        canSwap ? "cursor-pointer" : "cursor-default",
                      )}
                      title={canSwap ? "Заменить или убрать" : it.name}
                    >
                      <EquipmentThumb item={it} />
                      {!isFree && it.price > 0 && (
                        <span className="absolute top-1 right-1 rounded-full bg-blue-600 text-white px-1.5 py-0.5 text-[9px] font-bold tabular-nums shadow-card-sm">
                          +{it.price} ₽
                        </span>
                      )}
                      {isFree && (
                        <span className="absolute top-1 right-1 rounded-full bg-green text-white px-1.5 py-0.5 text-[9px] font-bold tabular-nums shadow-card-sm">
                          free
                        </span>
                      )}
                      {/* v0.6.16: hover overlay «Заменить» */}
                      {canSwap && isHover && !isOpen && (
                        <div className="absolute inset-0 rounded-[10px] bg-blue-600/80 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white text-blue-700 px-2 py-1 text-[10.5px] font-bold shadow-card-sm">
                            <Repeat size={11} /> Заменить
                          </span>
                        </div>
                      )}
                    </button>
                    {/* Подпись названия — отдельный блок под аватаркой,
                        без рамки, серым мелким, до 2 строк. */}
                    <div
                      className={cn(
                        "mt-1.5 text-[10.5px] font-semibold text-center leading-tight px-0.5 break-words",
                        isFree ? "text-green-ink" : "text-blue-700",
                      )}
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {it.name}
                    </div>
                    {isOpen && (
                      <EquipmentSwapPopover
                        rental={rental}
                        replacingIdx={idx}
                        onClose={() => {
                          setSwapIdx(null);
                          setPendingItem(null);
                        }}
                        onPreviewChange={setPendingItem}
                      />
                    )}
                  </div>
                );
              })}
              {/* v0.6.16: pending preview-тайл — если открыт popover на
                  add-режиме (swapIdx === -1) и выбран pendingItem, он
                  показывается в гриде с pulse-анимацией. Реальный рендер
                  внутри popover'а через portal — а здесь только пустой
                  слот «+ Добавить» если рендер popover'а сам открыт. */}
              {/* «+N» если >4 — pivot на onChangeEquipment.
                  Иначе если есть свободный слот и canEdit — кнопка «+». */}
              {equipmentJson.length > 4 ? (
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={onChangeEquipment}
                    disabled={!onChangeEquipment}
                    className="w-full aspect-square rounded-[12px] border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-2 hover:border-blue-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                    title="Показать все"
                  >
                    <span className="font-display text-[20px] font-extrabold tabular-nums">
                      +{equipmentJson.length - 4}
                    </span>
                  </button>
                  <div className="mt-1.5 text-[10.5px] font-semibold text-center text-muted-2">
                    ещё
                  </div>
                </div>
              ) : (
                onChangeEquipment && (
                  <div
                    className={cn(
                      "relative flex flex-col",
                      swapIdx === -1 && pendingItem && "animate-pulse opacity-80",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSwapIdx(swapIdx === -1 ? null : -1)
                      }
                      className={cn(
                        "w-full aspect-square rounded-[12px] border-2 flex items-center justify-center transition-colors p-2",
                        swapIdx === -1 && pendingItem
                          ? pendingItem.free
                            ? "border-green bg-green-soft/50"
                            : "border-blue-200 bg-blue-50"
                          : "border-dashed border-border text-muted-2 hover:border-blue-600 hover:bg-blue-50 hover:text-blue-700",
                        swapIdx === -1 &&
                          !pendingItem &&
                          "ring-2 ring-blue-600 ring-offset-1 border-blue-600 bg-blue-50 text-blue-700",
                      )}
                      title="Добавить экипировку"
                    >
                      {swapIdx === -1 && pendingItem ? (
                        <EquipmentThumb
                          item={{
                            itemId: pendingItem.itemId,
                            name: pendingItem.name,
                            free: pendingItem.free,
                          }}
                        />
                      ) : (
                        <Plus size={26} strokeWidth={2} />
                      )}
                    </button>
                    <div
                      className={cn(
                        "mt-1.5 text-[10.5px] font-semibold text-center break-words leading-tight",
                        swapIdx === -1 && pendingItem
                          ? pendingItem.free
                            ? "text-green-ink"
                            : "text-blue-700"
                          : "text-muted-2",
                      )}
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {swapIdx === -1 && pendingItem ? pendingItem.name : "Добавить"}
                    </div>
                    {swapIdx === -1 && (
                      <EquipmentSwapPopover
                        rental={rental}
                        replacingIdx={-1}
                        onClose={() => {
                          setSwapIdx(null);
                          setPendingItem(null);
                        }}
                        onPreviewChange={setPendingItem}
                      />
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaLine({
  label,
  value,
  multiline,
}: {
  label: string;
  value: React.ReactNode;
  multiline?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-wider font-bold text-muted-2 w-[60px] shrink-0">
        {label}
      </span>
      <span className={multiline ? "flex-1 min-w-0" : "flex-1 min-w-0 truncate"}>
        {value}
      </span>
    </div>
  );
}

function ScooterModelLabel({
  scooter,
  fallback,
}: {
  scooter: ApiScooter | null;
  fallback: string;
}) {
  const { data: models = [] } = useApiScooterModels();
  if (!scooter) return <>{fallback}</>;
  const model = scooter.modelId
    ? models.find((m) => m.id === scooter.modelId)
    : null;
  return <>{model?.name ?? fallback}</>;
}

/**
 * v0.6.14: миниатюра экипировки внутри 2×2 grid карточки.
 * Если у элемента нет itemId или картинки — показываем иконку Package.
 */
function EquipmentThumb({
  item,
}: {
  item: { itemId?: number | null; name: string; free: boolean };
}) {
  const { data: catalog = [] } = useApiEquipment();
  const cat = item.itemId
    ? catalog.find((c) => c.id === item.itemId)
    : null;
  const src = fileUrl(cat?.avatarThumbKey ?? cat?.avatarKey ?? null, {
    variant: "view",
  });
  if (src) {
    return (
      <img
        src={src}
        alt={item.name}
        className="h-full w-full object-contain"
      />
    );
  }
  return (
    <div
      className={cn(
        "h-full w-full flex items-center justify-center",
        item.free ? "text-green-ink/60" : "text-blue-700/60",
      )}
    >
      <Package size={40} strokeWidth={1.5} />
    </div>
  );
}

function pluralPos(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "позиция";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "позиции";
  return "позиций";
}

/**
 * v0.6.16: inline popover для замены/добавления экипировки — grid layout.
 *
 * Дизайн (rental-card.jsx + pickers.jsx):
 *   • Заголовок «Заменить «X»» / «Добавить экипировку»
 *   • Поиск по каталогу
 *   • СЕТКА квадратных тайлов (аватарка + подпись) — как в карточке
 *   • При наведении на тайл — рядом виджет с расчётом «Доплатить за N дн»
 *   • Footer: [Убрать (если заменяем)] · [Отмена] [Подтвердить]
 *
 * Preview-режим: setPendingItem(тайл) — карточка показывает мерцающую
 * позицию. При [Подтвердить] вызывается equipmentChangeAsync.
 *
 * replacingIdx === -1 → add-режим.
 */
function EquipmentSwapPopover({
  rental,
  replacingIdx,
  onClose,
  onPreviewChange,
}: {
  rental: Rental;
  replacingIdx: number;
  onClose: () => void;
  onPreviewChange?: (
    item: { itemId: number | null; name: string; price: number; free: boolean } | null,
  ) => void;
}) {
  const equipment = rental.equipmentJson ?? [];
  const replacing = replacingIdx >= 0 ? equipment[replacingIdx] : null;
  const isAddMode = replacingIdx === -1;
  const { data: catalog = [] } = useApiEquipment();
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  // ESC + клик мимо закрывают
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (e.target instanceof Node && !ref.current.contains(e.target)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", onDocClick);
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onDocClick);
    };
  }, [onClose]);

  if (!isAddMode && !replacing) return null;

  // v0.6.16: оставшиеся дни до конца аренды — для расчёта доплаты.
  const daysRemaining = (() => {
    const m = rental.endPlanned.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return 0;
    const end = new Date(+m[3], +m[2] - 1, +m[1]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((end.getTime() - today.getTime()) / 86400000);
    return Math.max(0, diff);
  })();
  const isLiveRental =
    rental.status === "active" || rental.status === "overdue";
  const canCharge = isLiveRental && daysRemaining > 0;

  const items = catalog.filter(
    (c) =>
      c.name.toLowerCase().includes(filter.toLowerCase()) &&
      (isAddMode || c.id !== replacing?.itemId),
  );

  const previewItem = (() => {
    if (pendingId == null) return null;
    const cat = catalog.find((c) => c.id === pendingId);
    if (!cat) return null;
    return {
      itemId: cat.id,
      name: cat.name,
      price: cat.price,
      free: cat.isFree,
    };
  })();

  // Уведомляем родителя об изменении preview — он покажет мерцающий
  // тайл в карточке.
  useEffect(() => {
    onPreviewChange?.(previewItem);
    return () => onPreviewChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId]);

  const hoverItem = (() => {
    if (hoverId == null) return null;
    return catalog.find((c) => c.id === hoverId) ?? null;
  })();

  // Расчёт «доплатить за оставшиеся дни» — если позиция платная и live
  // аренда. При замене вычитаем старую стоимость (delta), при добавлении —
  // полная стоимость.
  const calcDoplata = (
    target: { price: number; isFree: boolean } | null,
  ): number => {
    if (!target || target.isFree || !canCharge) return 0;
    const newPrice = target.price;
    const oldPrice =
      !isAddMode && replacing && !replacing.free ? replacing.price : 0;
    const delta = Math.max(0, newPrice - oldPrice);
    return delta * daysRemaining;
  };

  const previewDoplata = calcDoplata(
    previewItem ? { price: previewItem.price, isFree: previewItem.free } : null,
  );
  const hoverDoplata = calcDoplata(hoverItem);

  const confirm = async () => {
    if (saving || !previewItem) return;
    setSaving(true);
    try {
      const newJson = isAddMode
        ? [
            ...equipment.map((e) => ({
              itemId: e.itemId ?? null,
              name: e.name,
              price: e.price,
              free: e.free,
            })),
            previewItem,
          ]
        : equipment.map((e, i) =>
            i === replacingIdx
              ? previewItem
              : {
                  itemId: e.itemId ?? null,
                  name: e.name,
                  price: e.price,
                  free: e.free,
                },
          );
      await equipmentChangeAsync({
        rentalId: rental.id,
        newEquipmentJson: newJson,
        // v0.6.16: payNow=true когда есть остаток дней и позиция платная —
        // оператор сразу принимает деньги. Иначе через manual_charge.
        payNow: previewDoplata > 0,
      });
      toast.success(isAddMode ? "Позиция добавлена" : "Экипировка заменена", "");
      onClose();
    } catch (e) {
      toast.error("Не удалось изменить", (e as Error).message ?? "");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (saving || isAddMode) return;
    setSaving(true);
    try {
      const next = equipment
        .filter((_, i) => i !== replacingIdx)
        .map((e) => ({
          itemId: e.itemId ?? null,
          name: e.name,
          price: e.price,
          free: e.free,
        }));
      await equipmentChangeAsync({
        rentalId: rental.id,
        newEquipmentJson: next,
        payNow: false,
      });
      toast.success("Позиция убрана", "");
      onClose();
    } catch (e) {
      toast.error("Не удалось убрать", (e as Error).message ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={isAddMode ? "Добавить экипировку" : `Заменить ${replacing?.name}`}
      className="absolute left-0 top-full z-50 mt-1.5 w-[340px] rounded-2xl border border-border bg-surface shadow-card-lg overflow-hidden animate-fade-in"
    >
      <div className="border-b border-border px-3 pt-3 pb-2">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2 truncate">
              {isAddMode ? "Добавить экипировку" : `Заменить «${replacing?.name}»`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-surface-soft hover:text-ink"
            aria-label="Закрыть"
          >
            <X size={12} />
          </button>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
          placeholder="Найти…"
          className="mt-2 h-8 w-full rounded-[8px] border border-border bg-white px-2.5 text-[12px] text-ink outline-none focus:border-blue-600"
        />
      </div>
      {/* hover-плашка с расчётом */}
      {hoverItem && hoverDoplata > 0 && (
        <div className="border-b border-border bg-blue-50 px-3 py-1.5 text-[11px] text-blue-700">
          Доплатить за оставшиеся {daysRemaining} дн:{" "}
          <span className="font-bold tabular-nums">{fmt(hoverDoplata)} ₽</span>
        </div>
      )}
      <div className="max-h-[280px] overflow-y-auto scrollbar-thin px-2 py-2">
        {items.length === 0 && (
          <div className="px-3 py-4 text-center text-[12px] text-muted-2">
            Ничего не найдено
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {items.map((it) => {
            const isPending = pendingId === it.id;
            const src = fileUrl(it.avatarThumbKey ?? it.avatarKey ?? null, {
              variant: "view",
            });
            return (
              <button
                key={it.id}
                type="button"
                disabled={saving}
                onClick={() => setPendingId(it.id)}
                onMouseEnter={() => setHoverId(it.id)}
                onMouseLeave={() => setHoverId((v) => (v === it.id ? null : v))}
                className={cn(
                  "relative flex flex-col items-center disabled:opacity-50 group",
                )}
                title={it.name}
              >
                <div
                  className={cn(
                    "w-full aspect-square rounded-[10px] border-2 p-1.5 flex items-center justify-center transition-colors",
                    it.isFree
                      ? "border-green/60 bg-green-soft/40 group-hover:bg-green-soft"
                      : "border-blue-200 bg-blue-50 group-hover:bg-blue-100",
                    isPending &&
                      (it.isFree
                        ? "ring-2 ring-green ring-offset-1"
                        : "ring-2 ring-blue-600 ring-offset-1"),
                  )}
                >
                  {src ? (
                    <img
                      src={src}
                      alt={it.name}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Package
                      size={26}
                      strokeWidth={1.5}
                      className={
                        it.isFree ? "text-green-ink/60" : "text-blue-700/60"
                      }
                    />
                  )}
                  {!it.isFree && it.price > 0 && (
                    <span className="absolute top-0.5 right-0.5 rounded-full bg-blue-600 text-white px-1 py-0.5 text-[8.5px] font-bold tabular-nums">
                      +{it.price}
                    </span>
                  )}
                  {it.isFree && (
                    <span className="absolute top-0.5 right-0.5 rounded-full bg-green text-white px-1 py-0.5 text-[8.5px] font-bold">
                      free
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "mt-1 text-[9.5px] font-semibold text-center leading-tight px-0.5 break-words w-full",
                    it.isFree ? "text-green-ink" : "text-blue-700",
                  )}
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {it.name}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="border-t border-border bg-surface-soft px-3 py-2 flex items-center justify-between gap-2">
        {!isAddMode ? (
          <button
            type="button"
            onClick={handleRemove}
            disabled={saving}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-ink hover:underline disabled:opacity-50"
          >
            <Trash2 size={11} /> Убрать
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1.5">
          {previewItem && previewDoplata > 0 && (
            <span className="text-[10.5px] font-semibold text-blue-700 tabular-nums">
              +{fmt(previewDoplata)} ₽
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-[8px] bg-surface border border-border px-2.5 py-1 text-[11px] font-semibold text-ink-2 hover:bg-surface-soft disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={saving || !previewItem}
            className="rounded-[8px] bg-blue-600 text-white px-3 py-1 text-[11px] font-bold hover:bg-blue-700 disabled:opacity-50"
          >
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  );
}
