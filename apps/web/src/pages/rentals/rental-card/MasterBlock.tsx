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
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Bike,
  Camera,
  Clock,
  Minus,
  Pencil,
  Plus,
  Repeat,
  Shield,
  Wallet,
  Wrench,
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
  EquipmentTile,
  EquipmentAddTile,
} from "@/pages/rentals/rental-card/EquipmentTile";
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
  onPayoutDeposit,
  onTopupDeposit,
  onWithholdDeposit,
  section,
  paidThisRental,
  debtBadge,
  damageItems,
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
  /** v0.6.51: клик по сумме депозита → диалог «Выдать депозит клиенту». */
  onPayoutDeposit?: () => void;
  /** Клик по плашке залога → диалог «Пополнить залог» (только денежный залог). */
  onTopupDeposit?: () => void;
  /** Кнопка «Удержать из залога» (списать залог в доход с причиной). */
  onWithholdDeposit?: () => void;
  onRecordDamage?: () => void;
  layout?: "horizontal" | "vertical";
  /** v0.7.8: в drawer-режиме карточка разбита на accordion-секции —
   *  MasterBlock рендерит только запрошенную часть БЕЗ внешней карточки
   *  (рамку даёт AccordionSection). Без prop'а — старый цельный блок. */
  section?: "client" | "scooter" | "deposit";
  /** v0.9.2: «За всё время» в шапке = сумма по ЭТОЙ аренде (paidIn из
   *  RentalCard), а не lifetime клиента по всем арендам. Если не передан —
   *  fallback на clientStats.totalPaid (старое поведение). */
  paidThisRental?: number;
  /** C2: значок-алёрт о долге клиента (ущерб этой аренды + сквозной долг).
   *  Рендерится в строке KPI блока «Информация о клиенте». */
  debtBadge?: ReactNode;
  /** R11: позиции зафиксированного ущерба (название + сумма) — для тултипа
   *  «что сломано» при наведении на блок скутера в ремонте. */
  damageItems?: { name: string; finalPrice: number; quantity?: number }[];
}) {
  const equipmentJson = rental.equipmentJson ?? [];
  const clientPhoto = useClientPhoto(rental.clientId);

  // R11: позиции акта ущерба — плоский список без привязки к предмету.
  // Сопоставляем эвристически по названию: первое слово названия экипировки
  // (≥3 букв) входит в название позиции. Названия экипировки (шлем/перчатки/
  // дождевик) не пересекаются с деталями скутера (фара/масло/тормоз), поэтому
  // ложных срабатываний почти нет; промах = «ничего не показали» (безопасно).
  const allDamageItems = damageItems ?? [];
  const damageKey = (name: string) => {
    const w = name.trim().toLowerCase().split(/\s+/)[0] ?? "";
    return w.length >= 3 ? w : "";
  };
  const matchEquipDamage = (equipName: string) => {
    const key = damageKey(equipName);
    if (!key) return [];
    return allDamageItems.filter((d) => d.name.toLowerCase().includes(key));
  };
  // Ключи всех предметов экипировки — чтобы НЕ дублировать ущерб экипировки
  // в тултипе скутера (он показывает только ремонт самого скутера).
  const equipKeys = equipmentJson
    .map((e) => damageKey(e.name))
    .filter((k) => k.length > 0);
  const scooterDamageItems = allDamageItems.filter(
    (d) => !equipKeys.some((k) => d.name.toLowerCase().includes(k)),
  );

  // C1: скутер в ремонте при живой аренде — несогласованное состояние.
  // Подсвечиваем сам блок скутера (жёлтый + ключ-оверлей + тултип), вместо
  // отдельного баннера сверху. Клик по блоку открывает замену скутера.
  const scooterInRepair =
    scooter?.baseStatus === "repair" && rental.status === "active";

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
  // Денежный залог → показываем аккуратные кнопки-иконки «Пополнить» (вернуть
  // в залог) и «Удержать» (списать залог в доход). Одинаково в карточке (моб.) и
  // на десктопе. Предметный залог (depositItem) кнопок не имеет.
  const showDepositActions =
    !depositItem && (!!onTopupDeposit || !!onWithholdDeposit);
  const depositTile = (
    <div className="min-w-0 rounded-[12px] border border-border bg-surface px-4 py-3">
      <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-2">
        <Shield size={11} /> Залог
      </div>
      <div className="mt-0.5 truncate font-display text-[16px] font-extrabold leading-tight tabular-nums text-ink">
        {depositItem ? depositItem : `${fmt(currentDeposit)} ₽`}
      </div>
      <div className="mt-0.5 truncate text-[10px] text-muted">
        {depositItem
          ? "предметный залог"
          : depositSpent > 0
            ? `из ${fmt(originalDeposit)} ₽ — списано ${fmt(depositSpent)} ₽`
            : "на балансе компании"}
      </div>
      {showDepositActions && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {onTopupDeposit && (
            <button
              type="button"
              onClick={onTopupDeposit}
              title="Пополнить залог"
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[10.5px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
            >
              <Plus size={11} /> Пополнить
            </button>
          )}
          {onWithholdDeposit && currentDeposit > 0 && (
            <button
              type="button"
              onClick={onWithholdDeposit}
              title="Удержать из залога (списать в доход)"
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10.5px] font-semibold text-amber-700 transition-colors hover:bg-amber-100"
            >
              <Minus size={11} /> Удержать
            </button>
          )}
        </div>
      )}
    </div>
  );

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
              {fmt(paidThisRental ?? clientStats.totalPaid)} ₽
            </span>
            <span>за всё время</span>
          </span>
          {/* v0.6.51: депозит — «лишние» деньги клиента. Кликабельная плашка
              (пунктирная рамка-намёк) → диалог «Выдать депозит клиенту». */}
          {(client?.depositBalance ?? 0) > 0 && onPayoutDeposit && (
            <button
              type="button"
              onClick={onPayoutDeposit}
              title="Выдать депозит клиенту"
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-blue-300 bg-blue-50/40 px-2 py-0.5 text-[12px] text-blue-700 transition-colors hover:border-blue-500 hover:bg-blue-50"
            >
              <Wallet size={12} />
              <span className="font-bold tabular-nums">
                {fmt(client?.depositBalance ?? 0)} ₽
              </span>
              <span>депозит · выдать</span>
            </button>
          )}
          {/* C2: значок-алёрт о долге (ущерб + сквозной долг) — компактно,
              детали и действия в ховере, без больших баннеров сверху. */}
          {debtBadge}
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
    // v0.6.51: на узких экранах (мобилка) — вертикально: скутер сверху,
    // экипировка снизу на ВСЮ ширину (иначе при многих позициях тайлы
    // ломали вёрстку в правой половине 50/50). На sm+ — прежний 2-кол.
    <div className="grid grid-cols-1 gap-3 overflow-visible sm:grid-cols-2 sm:items-stretch">
      {/* ЛЕВО — СКУТЕР, текст слева + крупная аватарка справа */}
      <ScooterCompact
        scooter={scooter ?? null}
        fallbackName={rental.scooter}
        fallbackModel={rental.model}
        onSwap={onSwapScooter}
        inRepair={scooterInRepair}
        damageItems={scooterDamageItems}
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
              const isOpen = swapIdx === idx;
              const showingPending = isOpen && pendingItem != null;
              const it = showingPending ? pendingItem : origIt;
              return (
                <EquipmentTile
                  key={`${origIt.itemId ?? "na"}-${idx}`}
                  rental={rental}
                  item={it}
                  idx={idx}
                  size="sm"
                  wrapperClassName="w-[60px]"
                  canSwap={!!onChangeEquipment}
                  isOpen={isOpen}
                  isHover={hoverEqIdx === idx}
                  showingPending={showingPending}
                  onHover={setHoverEqIdx}
                  onToggleOpen={setSwapIdx}
                  onClose={() => {
                    setSwapIdx(null);
                    setPendingItem(null);
                  }}
                  onPreviewChange={setPendingItem}
                  damageItems={matchEquipDamage(origIt.name)}
                />
              );
            })}
            {onChangeEquipment && equipmentJson.length < 6 && (
              <EquipmentAddTile
                rental={rental}
                size="sm"
                wrapperClassName="w-[60px]"
                isOpen={swapIdx === -1}
                pendingItem={pendingItem}
                onToggleOpen={(open) => setSwapIdx(open ? -1 : null)}
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
    </div>
  );

  // ── БЛОК 3 — Залог | Депозит (grid-cols-2) ──
  const depositBlock = (
    <div className="grid grid-cols-2 gap-3">
      {depositTile}
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
                  {fmt(paidThisRental ?? clientStats.totalPaid)} ₽
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
          inRepair={scooterInRepair}
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
                const isOpen = swapIdx === idx;
                const showingPending = isOpen && pendingItem != null;
                const it = showingPending ? pendingItem : origIt;
                return (
                  <EquipmentTile
                    key={`${origIt.itemId ?? "na"}-${idx}`}
                    rental={rental}
                    item={it}
                    idx={idx}
                    size="md"
                    wrapperClassName="min-w-0"
                    canSwap={!!onChangeEquipment}
                    isOpen={isOpen}
                    isHover={hoverEqIdx === idx}
                    showingPending={showingPending}
                    onHover={setHoverEqIdx}
                    onToggleOpen={setSwapIdx}
                    onClose={() => {
                      setSwapIdx(null);
                      setPendingItem(null);
                    }}
                    onPreviewChange={setPendingItem}
                    damageItems={matchEquipDamage(origIt.name)}
                  />
                );
              })}
              {onChangeEquipment && equipmentJson.length < 6 && (
                <EquipmentAddTile
                  rental={rental}
                  size="md"
                  wrapperClassName="min-w-0"
                  isOpen={swapIdx === -1}
                  pendingItem={pendingItem}
                  onToggleOpen={(open) => setSwapIdx(open ? -1 : null)}
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
      </div>

      {/* ── БЛОК 3 — Залог | Депозит (grid-cols-2) ──
          v0.6.40: жёсткий 50/50 grid, min-w-0 на обеих ячейках
          чтобы ни одна не растягивала соседа. */}
      <div className="grid grid-cols-2 gap-3 p-5">
        {depositTile}
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
  inRepair = false,
}: {
  scooter: ApiScooter | null;
  fallbackName: string;
  fallbackModel: string;
  onSwap: () => void;
  /** C1: скутер в ремонте — блок жёлтый, в углу ключ, тултип-подсказка. */
  inRepair?: boolean;
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
      title={
        inRepair
          ? `${displayName} в ремонте — нажмите, чтобы заменить скутер`
          : "Заменить скутер"
      }
      className={cn(
        "group relative flex items-center gap-4 rounded-2xl border p-3 text-left w-full transition-colors",
        inRepair
          ? "border-amber-400 bg-amber-50 hover:border-amber-500"
          : "border-border bg-surface",
      )}
    >
      {inRepair && (
        <span className="pointer-events-none absolute -right-1.5 -top-1.5 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow-card-sm ring-2 ring-surface">
          <Wrench size={12} strokeWidth={2.4} />
        </span>
      )}
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
        <span
          className={cn(
            "absolute bottom-1 right-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-white shadow-card-sm transition-opacity",
            inRepair
              ? "bg-amber-500 opacity-100"
              : "bg-blue-600 opacity-0 group-hover:opacity-100",
          )}
        >
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
        {inRepair && (
          <div className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-amber-700">
            <Wrench size={12} /> в ремонте · необходимо заменить
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
  inRepair = false,
  damageItems = [],
}: {
  scooter: ApiScooter | null;
  fallbackName: string;
  fallbackModel: string;
  onSwap: () => void;
  /** C1: скутер в ремонте — блок жёлтый, в углу ключ, тултип-подсказка. */
  inRepair?: boolean;
  /** R11: позиции ущерба — показываем «что сломано» при наведении. */
  damageItems?: { name: string; finalPrice: number; quantity?: number }[];
}) {
  const { data: models = [] } = useApiScooterModels();
  // R11: ховер-поповер с неисправностями (порталом, чтобы не клипался).
  const ref = useRef<HTMLButtonElement>(null);
  const [dmgOpen, setDmgOpen] = useState(false);
  const [dmgPos, setDmgPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const showDmg = () => {
    if (!inRepair || damageItems.length === 0) return;
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      const vw = window.innerWidth;
      setDmgPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, vw - 300)) });
    }
    setDmgOpen(true);
  };
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
      ref={ref}
      type="button"
      onClick={onSwap}
      onMouseEnter={showDmg}
      onMouseLeave={() => setDmgOpen(false)}
      title={
        inRepair
          ? `${displayName} в ремонте — нажмите, чтобы заменить скутер`
          : "Заменить скутер"
      }
      // v0.7.12: overflow-visible — крупная аватарка справа может «вылезать»
      // за границы блока (живой эффект). min-h фиксирует высоту, чтобы фото
      // было крупным и заполняло её.
      // C1: при ремонте — жёлтая рамка/фон (сам по себе сигнал «обрати внимание»).
      className={cn(
        "group relative flex min-h-[112px] w-full min-w-0 items-center gap-2 overflow-visible rounded-2xl border p-3 text-left transition-colors",
        inRepair
          ? "border-amber-400 bg-amber-50 hover:border-amber-500"
          : "border-border bg-surface hover:border-blue-300",
      )}
    >
      {/* R11: ховер-поповер «что сломано» — позиции из акта ущерба. */}
      {dmgOpen &&
        dmgPos &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: dmgPos.top,
              left: dmgPos.left,
              minWidth: 240,
              maxWidth: 320,
              zIndex: 1000,
            }}
            className="pointer-events-none rounded-xl border border-amber-200 bg-surface p-3 shadow-card-lg"
          >
            <div className="mb-1.5 inline-flex items-center gap-1.5 text-[12px] font-bold text-amber-800">
              <Wrench size={13} /> Неисправности по акту
            </div>
            <div className="flex flex-col gap-1">
              {damageItems.map((d, i) => (
                <div
                  key={`${d.name}-${i}`}
                  className="flex items-center justify-between gap-2 text-[12px]"
                >
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {d.name}
                    {(d.quantity ?? 1) > 1 ? ` ×${d.quantity}` : ""}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-ink">
                    {fmt(d.finalPrice * (d.quantity ?? 1))} ₽
                  </span>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
      {/* R8: ключ — БЕЛЫЙ на янтарном (как иконка замены), крупно, в правом
          верхнем углу блока. */}
      {inRepair && (
        <span className="pointer-events-none absolute right-2 top-2 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-white shadow-card ring-2 ring-amber-50">
          <Wrench size={20} strokeWidth={2.4} />
        </span>
      )}
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
        {inRepair && (
          // R4: «в ремонте» крупнее, без лишней иконки (ключ теперь крупно на
          // колесе скутера). Замена — по клику на блок / иконкой замены.
          <div className="mt-1.5 inline-flex items-center rounded-md bg-amber-400/30 px-1.5 py-0.5 text-[12.5px] font-extrabold uppercase tracking-wide text-amber-800">
            в ремонте
          </div>
        )}
      </div>

      {/* Фото скутера — СПРАВА. R4: держим картинку В ГРАНИЦАХ блока
          (object-contain без scale-110), чтобы не обрезалась ancestor-ом. */}
      <div className="relative flex h-full min-h-[96px] w-[46%] shrink-0 items-center justify-center self-stretch overflow-hidden">
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={displayName}
            className="h-full max-h-[108px] w-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.12)]"
          />
        ) : (
          <Bike size={40} strokeWidth={1.5} className="text-muted-2" />
        )}
        {/* Иконка замены — нижний-правый угол. При ремонте видна всегда. */}
        <span
          className={cn(
            "absolute bottom-0 right-0 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full text-white shadow-card-sm transition-opacity",
            inRepair
              ? "bg-amber-500 opacity-100"
              : "bg-blue-600 opacity-0 group-hover:opacity-100",
          )}
        >
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
