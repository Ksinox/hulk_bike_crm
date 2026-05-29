/**
 * MasterBlock — основной блок левой колонки карточки аренды v0.6.39.
 *
 * Новый layout (вертикально, по эталону GPT-концепта 50/50):
 *   • Блок 1 — Карточка клиента: квадратное фото (~104px) слева +
 *     ФИО + ⭐ + телефоны (двухколоночные label/value) + KPI
 *     (N дн в аренде | Y₽ принёс) ВНУТРИ той же карточки.
 *   • Блок 2 — СКУТЕР | ЭКИПИРОВКА (grid-cols-2):
 *       — СКУТЕР: заголовок «Jog #02 · Пробег 11111 км» сверху,
 *         большая аватарка ScooterPosterAvatar под ним.
 *       — ЭКИПИРОВКА: заголовок «ЭКИПИРОВКА N позиций» + тайлы
 *         экипировки (flex-wrap).
 *   • Блок 3 — Залог | Депозит (grid-cols-2), без изменений по
 *     содержимому, просто другое место.
 *
 * v0.6.39:
 *   - Identity strip (АРЕНДА · #0006 + бейджи) убран — дублирует
 *     sticky-header.
 *   - Кнопка «Зафиксировать ущерб» убрана (доступна через меню
 *     «Действия» в header).
 *   - layout prop оставлен для совместимости (фактически всегда
 *     вертикальный сейчас).
 */
import { useState } from "react";
import {
  Bike,
  Camera,
  Clock,
  Pencil,
  Plus,
  Repeat,
  Shield,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/files";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useClientStats } from "@/lib/useClientStats";
import { initialsOf } from "@/lib/mock/clients";
import { useClientPhoto } from "@/pages/clients/clientStore";
import {
  EquipmentInlinePicker,
  EquipmentThumb,
} from "@/pages/rentals/rental-card/EquipmentInlinePicker";
import {
  DEPOSIT_AMOUNT,
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

export function MasterBlock({
  rental,
  client,
  scooter,
  onOpenClientProfile,
  onSwapScooter,
  onChangeEquipment,
  section,
}: {
  rental: Rental;
  client: ApiClient | null | undefined;
  scooter: ApiScooter | null | undefined;
  effectiveStatus?: RentalStatus;
  isUnreachable?: boolean;
  isArchived?: boolean;
  totalDebt?: number;
  overdueDays?: number;
  onOpenDebts?: () => void;
  onOpenClientProfile: () => void;
  onSwapScooter: () => void;
  onChangeEquipment?: () => void;
  onRecordDamage?: () => void;
  layout?: "horizontal" | "vertical";
  /** v0.7.8: в drawer-режиме карточка разбита на accordion-секции —
   *  MasterBlock рендерит только запрошенную часть БЕЗ внешней карточки
   *  (рамку даёт AccordionSection). Без prop'а — старый цельный блок. */
  section?: "client" | "scooter" | "deposit";
}) {
  const equipmentJson = rental.equipmentJson ?? [];
  const clientPhoto = useClientPhoto(rental.clientId);

  const [swapIdx, setSwapIdx] = useState<number | null>(null);
  const [hoverEqIdx, setHoverEqIdx] = useState<number | null>(null);
  const [pendingItem, setPendingItem] = useState<{
    itemId: number | null;
    name: string;
    price: number;
    free: boolean;
  } | null>(null);

  const currentDeposit = rental.deposit ?? DEPOSIT_AMOUNT;
  const originalDeposit = rental.depositOriginal ?? currentDeposit;
  const depositSpent = Math.max(0, originalDeposit - currentDeposit);
  const depositItem = rental.depositItem ?? null;

  // KPI клиента — единый источник: useClientStats считает фактические
  // дни в аренде (с учётом просрочки) и реально оплаченное за всё время
  // (paid платежи, кроме deposit/refund). Те же числа показывает
  // ClientQuickView.
  const clientStats = useClientStats(client?.id);

  // ── БЛОК 1 — Карточка клиента (фото слева, инфа справа) ──
  const clientBlock = (
    <div className="flex gap-4">
      {/* Квадратное фото с иконкой камеры в углу. */}
      <button
        type="button"
        onClick={onOpenClientProfile}
        className="shrink-0 group cursor-pointer text-left relative"
        title="Открыть профиль клиента"
        style={{ width: 124, height: 124 }}
      >
        <div
          className="h-full w-full rounded-[14px] overflow-hidden flex items-center justify-center border border-border group-hover:border-blue-600 transition-colors relative"
          style={{
            background: client
              ? `linear-gradient(135deg, ${clientColor(client.id)}55, ${clientColor(client.id)}22)`
              : "var(--surface-soft)",
          }}
        >
          {clientPhoto?.thumbUrl ? (
            <img
              src={clientPhoto.thumbUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span
              className="font-display text-[44px] font-extrabold leading-none tracking-tight"
              style={{
                color: client ? clientColor(client.id) : "#94a3b8",
              }}
            >
              {client ? initialsOf(client.name) : "?"}
            </span>
          )}
          {/* мелкая иконка камеры в правом-нижнем углу */}
          <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-white/85 shadow-card-sm flex items-center justify-center text-muted-2 group-hover:text-blue-700">
            <Camera size={11} />
          </span>
        </div>
      </button>

      {/* Правая часть — имя, рейтинг, телефоны без подписей, KPI inline. */}
      <div className="flex-1 min-w-0">
        {/* Имя + карандаш справа. v0.7.8: имя может переноситься на 2 строки
            (break-words), чтобы длинное ФИО не обрезалось в панели 760px. */}
        <div className="flex items-start justify-between gap-2 min-w-0">
          <button
            type="button"
            onClick={onOpenClientProfile}
            className="text-left group min-w-0 inline-flex items-center gap-1.5"
            title="Открыть профиль клиента"
          >
            <h2 className="font-display text-[20px] leading-[1.15] font-bold text-ink tracking-tight break-words group-hover:text-blue-700">
              {client?.name ?? "Клиент не найден"}
            </h2>
          </button>
          <button
            type="button"
            onClick={onOpenClientProfile}
            title="Редактировать клиента"
            className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-2 hover:bg-blue-50 hover:text-blue-700 transition-colors"
          >
            <Pencil size={14} />
          </button>
        </div>

        {/* Телефоны без подписей — просто в столбик. */}
        <div className="mt-2 flex flex-col items-start gap-1 text-left">
          {client?.phone ? (
            <a
              href={`tel:${client.phone.replace(/[^+0-9]/g, "")}`}
              className="text-left text-[13.5px] tabular-nums text-ink hover:text-blue-700"
            >
              {client.phone}
            </a>
          ) : (
            <span className="text-left text-[13.5px] text-muted-2 italic">— нет телефона</span>
          )}
          {client?.extraPhone && (
            <span className="text-left text-[13.5px] tabular-nums text-ink">
              {client.extraPhone}
            </span>
          )}
        </div>

        {/* KPI «N дней в аренде     Y₽ принёс» — одна строка. */}
        <div className="mt-3 flex items-center gap-4 flex-wrap text-[12.5px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock size={13} />
            <span className="font-bold tabular-nums text-ink-2">
              {fmt(clientStats.totalDays)}
            </span>
            <span>{pluralDays(clientStats.totalDays)} в аренде</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Wallet size={13} />
            <span className="font-bold tabular-nums text-ink-2">
              {fmt(clientStats.totalPaid)} ₽
            </span>
            <span>за всё время</span>
          </span>
        </div>
      </div>
    </div>
  );

  // ── БЛОК 2 — СКУТЕР / ЭКИПИРОВКА ──
  // v0.7.12 (drawer): скутер и экипировка В ОДИН РЯД 50/50 (вернули равные
  // половины — в v0.7.11 был 30/70 и текст скутера съезжал). Левая
  // половина — скутер (текст слева, крупная аватарка справа «по высоте»
  // с лёгким «вылезанием» за рамку). Правая — экипировка: заголовок +
  // тайлы flex-wrap (переносятся при многих позициях). overflow-visible
  // на ряду, чтобы фото скутера могло выходить за границы блока.
  const scooterBlock = (
    <div className="grid grid-cols-2 items-stretch gap-3 overflow-visible">
      {/* ЛЕВО — СКУТЕР, текст слева + крупная аватарка справа */}
      <ScooterCompact
        scooter={scooter ?? null}
        fallbackName={rental.scooter}
        fallbackModel={rental.model}
        onSwap={onSwapScooter}
      />

      {/* ПРАВО — ЭКИПИРОВКА */}
      <div className="min-w-0 rounded-[14px] bg-surface-soft/55 p-3 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold text-muted-2">
            ЭКИПИРОВКА
          </div>
          <div className="text-[10.5px] text-muted-2">
            {equipmentJson.length} {pluralPos(equipmentJson.length)}
          </div>
        </div>
        {equipmentJson.length === 0 ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => onChangeEquipment && setSwapIdx(swapIdx === -1 ? null : -1)}
              disabled={!onChangeEquipment}
              className={cn(
                "w-full min-h-[72px] flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border bg-surface-soft/60 text-muted-2 transition-colors",
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
                  <div className="rounded-[10px] border-2 border-blue-200 bg-blue-50 w-12 h-12 p-1.5 flex items-center justify-center">
                    <EquipmentThumb
                      item={{
                        itemId: pendingItem.itemId,
                        name: pendingItem.name,
                        free: pendingItem.free,
                      }}
                    />
                  </div>
                  <div className="text-[11px] font-bold text-blue-700">
                    {pendingItem.name}
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-full bg-surface w-9 h-9 flex items-center justify-center shadow-card-sm">
                    <Plus size={20} strokeWidth={2.2} />
                  </div>
                  <div className="text-[11px]">
                    {onChangeEquipment ? "Добавить" : "Экипировки нет"}
                  </div>
                </>
              )}
            </button>
            {swapIdx === -1 && onChangeEquipment && (
              <EquipmentInlinePicker
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
          <div className="flex flex-wrap content-start gap-2">
            {equipmentJson.slice(0, 6).map((origIt, idx) => {
              const canSwap = !!onChangeEquipment;
              const isOpen = swapIdx === idx;
              const showingPending = isOpen && pendingItem != null;
              const it = showingPending ? pendingItem : origIt;
              const isFree = it.free;
              const isHover = hoverEqIdx === idx;
              return (
                <div
                  key={`${origIt.itemId ?? "na"}-${idx}`}
                  className={cn(
                    "relative w-[60px]",
                    showingPending && "animate-pulse opacity-80",
                  )}
                  onMouseEnter={() => canSwap && setHoverEqIdx(idx)}
                  onMouseLeave={() => setHoverEqIdx((v) => (v === idx ? null : v))}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!canSwap) return;
                      setSwapIdx(isOpen ? null : idx);
                    }}
                    disabled={!canSwap}
                    className={cn(
                      // v0.8.30 (I1): нейтральный стиль как в диалоге оплаты —
                      // без зелёной/синей рамки и фона; экипировка на прозрачном.
                      "relative flex h-[60px] w-full items-center justify-center rounded-[12px] border p-1.5 transition-colors",
                      "border-border bg-surface",
                      isHover && !isOpen && "border-blue-300 bg-surface-soft/60",
                      isOpen && "border-blue-400 ring-2 ring-blue-200 ring-offset-1",
                      canSwap ? "cursor-pointer" : "cursor-default",
                    )}
                    title={canSwap ? "Заменить или убрать" : it.name}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center">
                      <EquipmentThumb item={it} />
                    </span>
                    {!isFree && it.price > 0 && (
                      <span className="absolute top-0.5 right-0.5 rounded-full bg-blue-600 text-white px-1 py-0 text-[8.5px] font-bold tabular-nums shadow-card-sm">
                        +{it.price}
                      </span>
                    )}
                    {isFree && (
                      <span className="absolute top-0.5 right-0.5 rounded-full bg-green text-white px-1 py-0 text-[8.5px] font-bold tabular-nums shadow-card-sm">
                        free
                      </span>
                    )}
                    {/* hover показывает только иконку Repeat в правом нижнем углу */}
                    {canSwap && isHover && !isOpen && (
                      <span className="absolute bottom-0.5 right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white shadow-card-sm pointer-events-none">
                        <Repeat size={11} />
                      </span>
                    )}
                  </button>
                  <div
                    className={cn(
                      "mt-1 whitespace-normal text-center text-[10px] font-bold leading-tight text-ink-2",
                    )}
                    style={{ wordBreak: "normal", overflowWrap: "break-word" }}
                  >
                    {it.name}
                  </div>
                  {isOpen && (
                    <EquipmentInlinePicker
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
            {onChangeEquipment && equipmentJson.length < 6 && (
              <div
                className={cn(
                  "relative w-[60px]",
                  swapIdx === -1 && pendingItem && "animate-pulse opacity-80",
                )}
              >
                <button
                  type="button"
                  onClick={() => setSwapIdx(swapIdx === -1 ? null : -1)}
                  className={cn(
                    "flex h-[60px] w-full items-center justify-center rounded-[12px] border-2 bg-white p-1.5 transition-colors",
                    swapIdx === -1 && pendingItem
                      ? pendingItem.free
                        ? "border-border bg-surface-soft"
                        : "border-border bg-surface-soft"
                      : "border-dashed border-border text-muted-2 hover:border-blue-600 hover:bg-blue-50 hover:text-blue-700",
                    swapIdx === -1 &&
                      !pendingItem &&
                      "ring-2 ring-blue-600 ring-offset-1 border-blue-600 bg-blue-50 text-blue-700",
                  )}
                  title="Добавить экипировку"
                >
                  {swapIdx === -1 && pendingItem ? (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center">
                      <EquipmentThumb
                        item={{
                          itemId: pendingItem.itemId,
                          name: pendingItem.name,
                          free: pendingItem.free,
                        }}
                      />
                    </span>
                  ) : (
                    <Plus size={20} strokeWidth={2} />
                  )}
                </button>
                <div
                  className={cn(
                    "mt-1 text-[10px] font-semibold text-center leading-tight whitespace-normal",
                    swapIdx === -1 && pendingItem
                      ? pendingItem.free
                        ? "text-green-ink"
                        : "text-blue-700"
                      : "text-muted-2",
                  )}
                  style={{ wordBreak: "normal", overflowWrap: "break-word" }}
                >
                  {swapIdx === -1 && pendingItem ? pendingItem.name : "Добавить"}
                </div>
                {swapIdx === -1 && (
                  <EquipmentInlinePicker
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
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ── БЛОК 3 — Залог | Депозит (grid-cols-2) ──
  const depositBlock = (
    <div className="grid grid-cols-2 gap-3">
      <div className="min-w-0 rounded-[12px] border border-border bg-surface px-4 py-3">
        <div className="text-[11px] font-semibold text-muted-2 inline-flex items-center gap-1">
          <Shield size={11} /> Залог
        </div>
        <div className="mt-0.5 font-display text-[16px] font-extrabold tabular-nums text-ink leading-tight truncate">
          {depositItem ? depositItem : `${fmt(currentDeposit)} ₽`}
        </div>
        <div className="mt-0.5 text-[10px] text-muted truncate">
          {depositItem
            ? "предметный залог"
            : depositSpent > 0
              ? `из ${fmt(originalDeposit)} ₽ — списано ${fmt(depositSpent)} ₽`
              : "на балансе компании"}
        </div>
      </div>
      <div className="min-w-0 rounded-[12px] border border-border bg-surface px-4 py-3">
        <div className="text-[11px] font-semibold text-muted-2 inline-flex items-center gap-1">
          <Wallet size={11} /> Депозит
        </div>
        <div className="mt-0.5 font-display text-[16px] font-extrabold tabular-nums text-blue-700 leading-tight truncate">
          {fmt(client?.depositBalance ?? 0)} ₽
        </div>
        <div className="mt-0.5 text-[10px] text-muted truncate">свободные средства</div>
      </div>
    </div>
  );

  // v0.7.8: drawer-режим — рендерим только запрошенную секцию без
  // внешней карточки (рамку даёт AccordionSection).
  if (section === "client") return clientBlock;
  if (section === "scooter") return scooterBlock;
  if (section === "deposit") return depositBlock;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card-sm">
      {/* ── БЛОК 1 — Карточка клиента (фото слева, инфа справа) ── */}
      <div className="border-b border-border p-5">
        <div className="flex gap-4">
          {/* Квадратное фото с иконкой камеры в углу. */}
          <button
            type="button"
            onClick={onOpenClientProfile}
            className="shrink-0 group cursor-pointer text-left relative"
            title="Открыть профиль клиента"
            style={{ width: 124, height: 124 }}
          >
            <div
              className="h-full w-full rounded-[14px] overflow-hidden flex items-center justify-center border border-border group-hover:border-blue-600 transition-colors relative"
              style={{
                background: client
                  ? `linear-gradient(135deg, ${clientColor(client.id)}55, ${clientColor(client.id)}22)`
                  : "var(--surface-soft)",
              }}
            >
              {clientPhoto?.thumbUrl ? (
                <img
                  src={clientPhoto.thumbUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span
                  className="font-display text-[44px] font-extrabold leading-none tracking-tight"
                  style={{
                    color: client ? clientColor(client.id) : "#94a3b8",
                  }}
                >
                  {client ? initialsOf(client.name) : "?"}
                </span>
              )}
              {/* мелкая иконка камеры в правом-нижнем углу */}
              <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-white/85 shadow-card-sm flex items-center justify-center text-muted-2 group-hover:text-blue-700">
                <Camera size={11} />
              </span>
            </div>
          </button>

          {/* Правая часть — имя, рейтинг, телефоны без подписей, KPI inline.
              v0.6.49: чищу — убираю двухколоночные label/value, телефоны
              просто в столбик, KPI — одна строка с маленькими иконками. */}
          <div className="flex-1 min-w-0">
            {/* Имя + рейтинг ОДНОЙ строкой + карандаш справа. */}
            <div className="flex items-start justify-between gap-2 min-w-0">
              <button
                type="button"
                onClick={onOpenClientProfile}
                className="text-left group min-w-0 inline-flex items-center gap-1.5"
                title="Открыть профиль клиента"
              >
                <h2 className="font-display text-[20px] leading-[1.15] font-bold text-ink tracking-tight truncate group-hover:text-blue-700">
                  {client?.name ?? "Клиент не найден"}
                </h2>
              </button>
              <button
                type="button"
                onClick={onOpenClientProfile}
                title="Редактировать клиента"
                className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-2 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                <Pencil size={14} />
              </button>
            </div>

            {/* Телефоны без подписей — просто в столбик, ВЫРОВНЕНЫ ПО ЛЕВОМУ КРАЮ
                (v0.6.50: на скриншоте они «уходили» вправо из-за inline-flex
                родителя — фиксируем items-start + явный text-left на ссылке). */}
            <div className="mt-2 flex flex-col items-start gap-1 text-left">
              {client?.phone ? (
                <a
                  href={`tel:${client.phone.replace(/[^+0-9]/g, "")}`}
                  className="text-left text-[13.5px] tabular-nums text-ink hover:text-blue-700"
                >
                  {client.phone}
                </a>
              ) : (
                <span className="text-left text-[13.5px] text-muted-2 italic">— нет телефона</span>
              )}
              {client?.extraPhone && (
                <span className="text-left text-[13.5px] tabular-nums text-ink">
                  {client.extraPhone}
                </span>
              )}
            </div>

            {/* KPI «N дней в аренде     Y₽ принёс» — одна строка. */}
            <div className="mt-3 flex items-center gap-4 flex-wrap text-[12.5px] text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock size={13} />
                <span className="font-bold tabular-nums text-ink-2">
                  {fmt(clientStats.totalDays)}
                </span>
                <span>{pluralDays(clientStats.totalDays)} в аренде</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Wallet size={13} />
                <span className="font-bold tabular-nums text-ink-2">
                  {fmt(clientStats.totalPaid)} ₽
                </span>
                <span>за всё время</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── БЛОК 2 — СКУТЕР / ЭКИПИРОВКА (вертикально, v0.6.48) ──
          СКУТЕР: горизонтальный low-profile блок — фото слева 88px,
          справа название + модель + пробег, в правом верхнем углу
          иконка карандаша для swap.
          ЭКИПИРОВКА: grid тайлов 72px на полную ширину. */}
      <div className="flex flex-col gap-4 border-b border-border p-5">
        {/* СКУТЕР — горизонтальный layout */}
        <ScooterHorizontalRow
          scooter={scooter ?? null}
          fallbackName={rental.scooter}
          fallbackModel={rental.model}
          onSwap={onSwapScooter}
        />

        {/* ЭКИПИРОВКА — полная ширина */}
        <div className="rounded-[14px] bg-surface-soft/55 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-semibold text-muted-2">
              ЭКИПИРОВКА
            </div>
            <div className="text-[10.5px] text-muted-2">
              {equipmentJson.length} {pluralPos(equipmentJson.length)}
            </div>
          </div>
          {equipmentJson.length === 0 ? (
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => onChangeEquipment && setSwapIdx(swapIdx === -1 ? null : -1)}
                disabled={!onChangeEquipment}
                className={cn(
                  "w-full min-h-[96px] flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border bg-surface-soft/60 text-muted-2 transition-colors",
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
                    <div className="rounded-[10px] border-2 border-blue-200 bg-blue-50 w-14 h-14 p-2 flex items-center justify-center">
                      <EquipmentThumb
                        item={{
                          itemId: pendingItem.itemId,
                          name: pendingItem.name,
                          free: pendingItem.free,
                        }}
                      />
                    </div>
                    <div className="text-[11px] font-bold text-blue-700">
                      {pendingItem.name}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-full bg-surface w-10 h-10 flex items-center justify-center shadow-card-sm">
                      <Plus size={22} strokeWidth={2.2} />
                    </div>
                    <div className="text-[11px]">
                      {onChangeEquipment ? "Добавить" : "Экипировки нет"}
                    </div>
                  </>
                )}
              </button>
              {swapIdx === -1 && onChangeEquipment && (
                <EquipmentInlinePicker
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] content-start gap-2 rounded-[14px] bg-surface-soft/35 p-2">
              {equipmentJson.slice(0, 6).map((origIt, idx) => {
                const canSwap = !!onChangeEquipment;
                const isOpen = swapIdx === idx;
                const showingPending = isOpen && pendingItem != null;
                const it = showingPending ? pendingItem : origIt;
                const isFree = it.free;
                const isHover = hoverEqIdx === idx;
                return (
                  <div
                    key={`${origIt.itemId ?? "na"}-${idx}`}
                    className={cn(
                      "relative min-w-0",
                      showingPending && "animate-pulse opacity-80",
                    )}
                    onMouseEnter={() => canSwap && setHoverEqIdx(idx)}
                    onMouseLeave={() => setHoverEqIdx((v) => (v === idx ? null : v))}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!canSwap) return;
                        setSwapIdx(isOpen ? null : idx);
                      }}
                      disabled={!canSwap}
                      className={cn(
                        // v0.8.30 (I1): нейтральный стиль (как в диалоге оплаты).
                        "relative flex h-[72px] w-full items-center justify-center rounded-[12px] border p-2 transition-colors",
                        "border-border bg-surface",
                        isHover && !isOpen && "border-blue-300 bg-surface-soft/60",
                        isOpen && "border-blue-400 ring-2 ring-blue-200 ring-offset-1",
                        canSwap ? "cursor-pointer" : "cursor-default",
                      )}
                      title={canSwap ? "Заменить или убрать" : it.name}
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center">
                        <EquipmentThumb item={it} />
                      </span>
                      {!isFree && it.price > 0 && (
                        <span className="absolute top-0.5 right-0.5 rounded-full bg-blue-600 text-white px-1 py-0 text-[8.5px] font-bold tabular-nums shadow-card-sm">
                          +{it.price}
                        </span>
                      )}
                      {isFree && (
                        <span className="absolute top-0.5 right-0.5 rounded-full bg-green text-white px-1 py-0 text-[8.5px] font-bold tabular-nums shadow-card-sm">
                          free
                        </span>
                      )}
                      {/* v0.6.51: hover показывает только иконку Repeat в
                          правом нижнем углу — без заливки тайла. */}
                      {canSwap && isHover && !isOpen && (
                        <span className="absolute bottom-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white shadow-card-sm pointer-events-none">
                          <Repeat size={11} />
                        </span>
                      )}
                    </button>
                    <div
                      className={cn(
                        "mt-1 whitespace-normal text-center text-[10.5px] font-bold leading-tight text-ink-2",
                      )}
                      style={{ wordBreak: "normal", overflowWrap: "break-word" }}
                    >
                      {it.name}
                    </div>
                    {isOpen && (
                      <EquipmentInlinePicker
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
              {onChangeEquipment && equipmentJson.length < 6 && (
                <div
                  className={cn(
                      "relative min-w-0",
                    swapIdx === -1 && pendingItem && "animate-pulse opacity-80",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSwapIdx(swapIdx === -1 ? null : -1)}
                    className={cn(
                      "flex h-[72px] w-full items-center justify-center rounded-[12px] border-2 bg-white p-2 transition-colors",
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
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center">
                        <EquipmentThumb
                          item={{
                            itemId: pendingItem.itemId,
                            name: pendingItem.name,
                            free: pendingItem.free,
                          }}
                        />
                      </span>
                    ) : (
                      <Plus size={22} strokeWidth={2} />
                    )}
                  </button>
                  <div
                    className={cn(
                      "mt-1 text-[10.5px] font-semibold text-center leading-tight whitespace-normal",
                      swapIdx === -1 && pendingItem
                        ? pendingItem.free
                          ? "text-green-ink"
                          : "text-blue-700"
                        : "text-muted-2",
                    )}
                    style={{ wordBreak: "normal", overflowWrap: "break-word" }}
                  >
                    {swapIdx === -1 && pendingItem ? pendingItem.name : "Добавить"}
                  </div>
                  {swapIdx === -1 && (
                    <EquipmentInlinePicker
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
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── БЛОК 3 — Залог | Депозит (grid-cols-2) ──
          v0.6.40: жёсткий 50/50 grid, min-w-0 на обеих ячейках
          чтобы ни одна не растягивала соседа. */}
      <div className="grid grid-cols-2 gap-3 p-5">
        <div className="min-w-0 rounded-[12px] border border-border bg-surface px-4 py-3">
          <div className="text-[11px] font-semibold text-muted-2 inline-flex items-center gap-1">
            <Shield size={11} /> Залог
          </div>
          <div className="mt-0.5 font-display text-[16px] font-extrabold tabular-nums text-ink leading-tight truncate">
            {depositItem ? depositItem : `${fmt(currentDeposit)} ₽`}
          </div>
          <div className="mt-0.5 text-[10px] text-muted truncate">
            {depositItem
              ? "предметный залог"
              : depositSpent > 0
                ? `из ${fmt(originalDeposit)} ₽ — списано ${fmt(depositSpent)} ₽`
                : "на балансе компании"}
          </div>
        </div>
        <div className="min-w-0 rounded-[12px] border border-border bg-surface px-4 py-3">
          <div className="text-[11px] font-semibold text-muted-2 inline-flex items-center gap-1">
            <Wallet size={11} /> Депозит
          </div>
          <div className="mt-0.5 font-display text-[16px] font-extrabold tabular-nums text-blue-700 leading-tight truncate">
            {fmt(client?.depositBalance ?? 0)} ₽
          </div>
          <div className="mt-0.5 text-[10px] text-muted truncate">свободные средства</div>
        </div>
      </div>
    </div>
  );
}

/**
 * v0.8.5: заголовок скутера — круглый бейдж с НОМЕРОМ + модель.
 * Номер парсится из name «Jog #02». Модель — из model.name (или из name).
 */
function ScooterNumberTitle({
  name,
  model,
  size = "md",
}: {
  name: string;
  model: string;
  size?: "sm" | "md";
}) {
  const m = name.match(/#\s*(\d+)/);
  const num = m ? m[1] : null;
  const modelText =
    model || name.replace(/\s*#\s*\d+\s*$/, "").trim() || name;
  const dot =
    size === "md" ? "h-7 min-w-7 text-[14px]" : "h-6 min-w-6 text-[12px]";
  const txt = size === "md" ? "text-[17px]" : "text-[15px]";
  return (
    <div className="flex items-center gap-2 min-w-0">
      {num != null && (
        <span
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full bg-ink px-1.5 font-display font-bold tabular-nums text-white",
            dot,
          )}
        >
          {num}
        </span>
      )}
      <span
        className={cn(
          "min-w-0 truncate font-display font-bold leading-tight tracking-tight text-ink",
          txt,
        )}
      >
        {modelText}
      </span>
    </div>
  );
}

/**
 * Горизонтальная карточка «Скутер» — компактная строка с фото слева,
 * метаданными справа и кнопкой-карандаш в правом верхнем углу
 * (swap/edit). По эталону v0.6.48.
 */
function ScooterHorizontalRow({
  scooter,
  fallbackName,
  fallbackModel,
  onSwap,
}: {
  scooter: ApiScooter | null;
  fallbackName: string;
  fallbackModel: string;
  onSwap: () => void;
}) {
  const { data: models = [] } = useApiScooterModels();
  const model = scooter
    ? scooter.modelId
      ? models.find((m) => m.id === scooter.modelId)
      : models.find((m) =>
          m.name.toLowerCase().includes(scooter.model.toLowerCase()),
        )
    : null;
  const avatarSrc = fileUrl(model?.avatarKey, { variant: "view" });
  const displayName = scooter?.name ?? fallbackName ?? "—";
  const displayModel = model?.name ?? fallbackModel ?? "";

  return (
    <button
      type="button"
      onClick={onSwap}
      title="Заменить скутер"
      className="group relative flex items-center gap-4 rounded-2xl border border-border bg-surface p-3 text-left w-full transition-colors"
    >
      {/* Фото скутера 88×88 (v0.6.51: иконка Repeat показывается в правом
          нижнем углу фото при hover на весь блок). */}
      <div className="relative shrink-0 h-[88px] w-[88px] rounded-[12px] bg-white overflow-hidden flex items-center justify-center">
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={displayName}
            className="h-full w-full object-contain"
          />
        ) : (
          <Bike size={32} strokeWidth={1.5} className="text-muted-2" />
        )}
        <span className="absolute bottom-1 right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-card-sm opacity-0 group-hover:opacity-100 transition-opacity">
          <Repeat size={12} />
        </span>
      </div>

      {/* Метаданные справа */}
      <div className="flex-1 min-w-0">
        <ScooterNumberTitle name={displayName} model={displayModel} size="md" />
        {scooter && (
          <div className="mt-2 text-[12px] text-muted">
            Пробег:{" "}
            <span className="font-bold tabular-nums text-ink">
              {fmt(scooter.mileage)}
            </span>{" "}
            км
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * Компактная карточка «Скутер» для drawer-режима (50/50 ряд) — v0.7.10.
 * Фото 80×80 сверху + название/модель/пробег под ним. Прижата к верху
 * (align-start от родителя), не растягивается по высоте экипировки.
 */
function ScooterCompact({
  scooter,
  fallbackName,
  fallbackModel,
  onSwap,
}: {
  scooter: ApiScooter | null;
  fallbackName: string;
  fallbackModel: string;
  onSwap: () => void;
}) {
  const { data: models = [] } = useApiScooterModels();
  const model = scooter
    ? scooter.modelId
      ? models.find((m) => m.id === scooter.modelId)
      : models.find((m) =>
          m.name.toLowerCase().includes(scooter.model.toLowerCase()),
        )
    : null;
  const avatarSrc = fileUrl(model?.avatarKey, { variant: "view" });
  const displayName = scooter?.name ?? fallbackName ?? "—";
  const displayModel = model?.name ?? fallbackModel ?? "";

  return (
    <button
      type="button"
      onClick={onSwap}
      title="Заменить скутер"
      // v0.7.12: overflow-visible — крупная аватарка справа может «вылезать»
      // за границы блока (живой эффект). min-h фиксирует высоту, чтобы фото
      // было крупным и заполняло её.
      className="group relative flex min-h-[112px] w-full min-w-0 items-center gap-2 overflow-visible rounded-2xl border border-border bg-surface p-3 text-left transition-colors hover:border-blue-300"
    >
      {/* Метаданные — СЛЕВА (текст) */}
      <div className="relative z-10 flex-1 min-w-0">
        <ScooterNumberTitle name={displayName} model={displayModel} size="sm" />
        {scooter && (
          <div className="mt-1.5 text-[11.5px] text-muted">
            Пробег{" "}
            <span className="font-bold tabular-nums text-ink">
              {fmt(scooter.mileage)}
            </span>{" "}
            км
          </div>
        )}
      </div>

      {/* Фото скутера — СПРАВА, крупное по высоте блока, с «вылезанием»
          за рамку (scale-110 + overflow-visible на контейнере). */}
      <div className="relative flex h-full min-h-[96px] w-[44%] shrink-0 items-center justify-center self-stretch overflow-visible">
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={displayName}
            className="h-full max-h-[120px] w-full origin-center scale-110 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.12)]"
          />
        ) : (
          <Bike size={40} strokeWidth={1.5} className="text-muted-2" />
        )}
        <span className="absolute bottom-0 right-0 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-card-sm opacity-0 group-hover:opacity-100 transition-opacity">
          <Repeat size={12} />
        </span>
      </div>
    </button>
  );
}

function pluralPos(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "позиция";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "позиции";
  return "позиций";
}

function pluralDays(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "день";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "дня";
  return "дней";
}
