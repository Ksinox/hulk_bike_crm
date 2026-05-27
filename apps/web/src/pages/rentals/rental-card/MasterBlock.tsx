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
  Camera,
  Clock,
  Phone,
  Plus,
  Repeat,
  Shield,
  Star,
  Wallet,
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
  type Rental,
  type RentalStatus,
} from "@/lib/mock/rentals";
import type { ApiClient, ApiScooter } from "@/lib/api/types";
import { useMemo } from "react";

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
  const [scooterHover, setScooterHover] = useState(false);

  const currentDeposit = rental.deposit ?? DEPOSIT_AMOUNT;
  const originalDeposit = rental.depositOriginal ?? currentDeposit;
  const depositSpent = Math.max(0, originalDeposit - currentDeposit);
  const depositItem = rental.depositItem ?? null;

  // KPI клиента — сумма дней по всем арендам + сумма всех оплаченных
  // платежей (исключая deposit/refund).
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
                  ? `linear-gradient(135deg, ${clientColor(client.id)}33, ${clientColor(client.id)}11)`
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
                  className="font-display text-[32px] font-extrabold"
                  style={{
                    color: client ? clientColor(client.id) : "#94a3b8",
                    opacity: 0.55,
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

          {/* Правая часть — имя, рейтинг, телефоны, KPI. */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {/* Имя + рейтинг ОДНОЙ строкой. */}
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={onOpenClientProfile}
                className="text-left group min-w-0"
                title="Открыть профиль клиента"
              >
                <h2 className="font-display text-[21px] leading-[1.1] font-extrabold text-ink tracking-tight truncate group-hover:text-blue-700 group-hover:underline decoration-2 underline-offset-2">
                  {client?.name ?? "Клиент не найден"}
                </h2>
              </button>
              {client && (
                <div className="inline-flex items-center gap-0.5 text-[12px] shrink-0">
                  <Star size={12} className="text-orange" />
                  <span className="tabular-nums font-bold text-ink-2">
                    {client.rating}
                  </span>
                </div>
              )}
            </div>

            {/* Телефоны двухколоночные (label слева, value справа). */}
            <div className="flex flex-col gap-1 text-[12px]">
              <PhoneLine
                label="Телефон"
                value={
                  client?.phone ? (
                    <a
                      href={`tel:${client.phone.replace(/[^+0-9]/g, "")}`}
                      className="tabular-nums font-semibold text-ink-2 hover:text-blue-700 inline-flex items-center gap-1"
                    >
                      <Phone size={11} /> {client.phone}
                    </a>
                  ) : (
                    <span className="text-muted-2 italic">— нет</span>
                  )
                }
              />
              <PhoneLine
                label="Доп. телефон"
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

            {/* KPI «N дней в аренде | Y₽ принёс» — внутри той же карточки. */}
            <div className="mt-auto flex items-center gap-4 flex-wrap text-[12px]">
              <div className="inline-flex items-center gap-1.5">
                <Clock size={13} className="text-blue-600" />
                <span className="font-bold tabular-nums text-ink">
                  {fmt(clientStats.totalDays)}
                </span>
                <span className="text-muted-2 text-[11px]">{pluralDays(clientStats.totalDays)} в аренде</span>
              </div>
              <div className="inline-flex items-center gap-1.5">
                <Wallet size={13} className="text-green-ink" />
                <span className="font-bold tabular-nums text-ink">
                  {fmt(clientStats.totalPaid)}
                </span>
                <span className="text-muted-2 text-[11px]">₽ принёс</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── БЛОК 2 — СКУТЕР | ЭКИПИРОВКА (grid-cols-2) ──
          v0.6.40: высоты блоков определяются контентом (без h-full).
          Скутер использует фиксированную невысокую аватарку. */}
      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] gap-4 border-b border-border p-5 items-stretch">
        {/* СКУТЕР */}
        <div className="rounded-[14px] bg-surface-soft/55 p-4 flex flex-col">
          <div className="mb-2 min-w-0">
            <div className="text-[11px] font-semibold text-muted-2">
              СКУТЕР
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="font-display text-[17px] font-extrabold leading-tight text-ink">
                {scooter?.name ?? rental.scooter ?? "—"}
              </span>
              {scooter && (
                <span className="text-[11px] font-semibold tabular-nums text-ink-2">
                  · Пробег {fmt(scooter.mileage)} км
                </span>
              )}
            </div>
          </div>
          <div
            className="relative w-full"
            onMouseEnter={() => setScooterHover(true)}
            onMouseLeave={() => setScooterHover(false)}
          >
            <ScooterPosterAvatar
              scooter={scooter ?? null}
              size="md"
              className="!h-[140px] !w-full"
            />
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
          {/* Модель — под аватаркой мелким серым. */}
          <div className="mt-1.5 text-[10.5px] text-muted truncate text-center">
            <ScooterModelLabel scooter={scooter ?? null} fallback={rental.model} />
          </div>
        </div>

        {/* ЭКИПИРОВКА */}
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
                  "w-full min-h-[166px] flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border bg-surface-soft/60 text-muted-2 transition-colors",
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
            <div className="grid min-h-[172px] grid-cols-1 content-start gap-2 rounded-[14px] p-0">
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
                        "flex min-h-[72px] w-full items-center gap-2.5 rounded-[12px] border-2 bg-white px-3 py-2 text-left transition-colors relative",
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
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center">
                        <EquipmentThumb item={it} />
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 text-[12px] font-bold leading-tight",
                          isFree ? "text-green-ink" : "text-blue-700",
                        )}
                      >
                        {it.name}
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
                      {canSwap && isHover && !isOpen && (
                        <div className="absolute inset-0 rounded-[10px] bg-blue-600/80 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white text-blue-700 px-1.5 py-0.5 text-[9.5px] font-bold shadow-card-sm">
                            <Repeat size={10} />
                          </span>
                        </div>
                      )}
                    </button>
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
                      "flex min-h-[72px] w-full items-center justify-center gap-2 rounded-[12px] border-2 bg-white px-3 py-2 transition-colors",
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
                      <Plus size={22} strokeWidth={2} />
                    )}
                  </button>
                  <div
                    className={cn(
                      "mt-1 text-[9.5px] font-semibold text-center break-words leading-tight",
                      swapIdx === -1 && pendingItem
                        ? pendingItem.free
                          ? "text-green-ink"
                          : "text-blue-700"
                        : "text-muted-2",
                    )}
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
    </div>
  );
}

function PhoneLine({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] font-semibold text-muted-2 w-[84px] shrink-0">
        {label}
      </span>
      <span className="flex-1 min-w-0 text-right whitespace-nowrap">{value}</span>
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

function pluralDays(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "день";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "дня";
  return "дней";
}
