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
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  PhoneOff,
  Phone,
  Plus,
  Repeat,
  Shield,
  Star,
  Wallet,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useApiRentals } from "@/lib/api/rentals";
import { useApiPayments } from "@/lib/api/payments";
import { ScooterPosterAvatar } from "@/pages/rentals/ScooterPosterAvatar";
import { initialsOf } from "@/lib/mock/clients";
import { useClientPhoto } from "@/pages/clients/clientStore";
import {
  EquipmentInlinePicker,
  EquipmentThumb,
} from "@/pages/rentals/rental-card/EquipmentInlinePicker";
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
  onRecordDamage,
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
  /** Если undefined — кнопка «Зафиксировать ущерб» не отображается
   *  (для архивных или completed аренд). Открывает DamageReportDialog
   *  или редактирование существующего акта. */
  onRecordDamage?: () => void;
}) {
  const equipmentJson = rental.equipmentJson ?? [];
  // v0.6.37: фото клиента — тот же источник что в RentalsList.
  const clientPhoto = useClientPhoto(rental.clientId);

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
        {/* COLUMN 1 — CLIENT.
            v0.6.34: flex-col + h-full, чтобы аватарка слева растянулась
            от верха identity strip до низа всей колонки. Money row
            остаётся отдельным блоком внизу, а блок «фото + инфа»
            (flex-1) тянет аватарку. */}
        <div className="p-5 flex flex-col gap-3 h-full">
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

          <div className="flex gap-3 items-stretch flex-1">
            <button
              type="button"
              onClick={onOpenClientProfile}
              className="shrink-0 self-stretch group cursor-pointer text-left"
              title="Открыть профиль клиента"
            >
              <div
                className="h-full aspect-[9/16] rounded-[12px] overflow-hidden flex flex-col border border-border group-hover:border-blue-600 transition-colors"
                style={{
                  background: client
                    ? `linear-gradient(135deg, ${clientColor(client.id)}33, ${clientColor(client.id)}11)`
                    : "var(--surface-soft)",
                }}
              >
                {/* v0.6.37: подтягиваем фото клиента (как в RentalsList
                    через useClientPhoto). Если фото нет — fallback на
                    инициалы + плашку «фото». */}
                {clientPhoto?.thumbUrl ? (
                  <img
                    src={clientPhoto.thumbUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <>
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
                  </>
                )}
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

              {/* v0.6.34: KPI клиента (дни/принёс) теперь ВНУТРИ правой
                  части блока, после телефонов — это инфа о клиенте,
                  не про аренду. Аватарка слева тянется на всю высоту
                  благодаря items-stretch + self-stretch + h-full. */}
              <div className="mt-3 flex items-center gap-4 flex-wrap">
                <div className="inline-flex items-center gap-1.5 text-[12.5px]">
                  <Clock size={14} className="text-blue-600" />
                  <span className="font-bold tabular-nums text-ink">
                    {fmt(clientStats.totalDays)}
                  </span>
                  <span className="text-muted-2 text-[11px]">дн в аренде</span>
                </div>
                <div className="inline-flex items-center gap-1.5 text-[12.5px]">
                  <Wallet size={14} className="text-green-ink" />
                  <span className="font-bold tabular-nums text-ink">
                    {fmt(clientStats.totalPaid)}
                  </span>
                  <span className="text-muted-2 text-[11px]">₽ принёс</span>
                </div>
              </div>
            </div>
          </div>

          {/* Money row — залог + депозит клиента (2-col). */}
          <div className="pt-2 grid grid-cols-2 gap-2">
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
            {/* v0.6.33: вертикальная аватарка скутера. Поверх аватарки
                сверху-по-центру — overlay-плашка с номером скутера,
                моделью и пробегом. Текст ПОД аватаркой убран. */}
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
              {/* v0.6.33: overlay с номером/моделью/пробегом наверху
                  аватарки. backdrop-blur для читаемости. */}
              <div className="absolute top-2 left-2 right-2 z-10 rounded-[10px] bg-white/85 backdrop-blur-sm px-2.5 py-1.5 text-center shadow-card-sm pointer-events-none">
                <div className="font-display text-[16px] font-extrabold text-ink leading-none truncate">
                  {scooter?.name ?? rental.scooter ?? "—"}
                </div>
                <div className="mt-0.5 text-[10.5px] text-muted-2 truncate">
                  <ScooterModelLabel scooter={scooter ?? null} fallback={rental.model} />
                  {scooter && (
                    <>
                      {" · Пробег "}
                      <b className="tabular-nums text-ink-2">{fmt(scooter.mileage)}</b>
                      {" км"}
                    </>
                  )}
                </div>
              </div>
              {/* hover overlay с кнопкой «Заменить» */}
              {scooterHover && (
                <div className="absolute inset-0 rounded-2xl bg-ink/45 backdrop-blur-[1px] flex items-center justify-center pointer-events-none z-20">
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
            {/* v0.6.33: кнопка «Зафиксировать ущерб» — под аватаркой
                скутера, занимает всю ширину колонки. Перенесена сюда из
                колонки клиента. */}
            {onRecordDamage && (
              <button
                type="button"
                onClick={onRecordDamage}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-[10px] border border-orange-200 bg-orange-soft px-3 py-2 text-[12.5px] font-bold text-orange-ink hover:bg-orange-100 transition-colors"
                title="Зафиксировать ущерб по этой аренде"
              >
                <Wrench size={14} /> Зафиксировать ущерб
              </button>
            )}
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

function pluralPos(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "позиция";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "позиции";
  return "позиций";
}
