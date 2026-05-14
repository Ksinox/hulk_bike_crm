/**
 * MasterBlock — основной 3-колоночный блок карточки аренды:
 *   • CLIENT      (identity strip + фото-карточка + ФИО + контакты + KPI)
 *   • SCOOTER     (большая аватарка + номер/модель + пробег + кнопка инцидента)
 *   • EQUIPMENT   (2×2 grid позиций экипировки + кнопка добавления)
 *
 * v0.6.14:
 *   - CLIENT: убраны ДР и адрес. Под контактами 2 KPI:
 *       «Дней в аренде» (сумма ВСЕХ дней клиента) и
 *       «Принёс за всё время» (сумма ВСЕХ payments клиента).
 *     Добавлена кнопка-иконка инцидента (AlertCircle).
 *   - SCOOTER: большая аватарка с hover-overlay «Заменить».
 *     Номер крупно, модель и пробег под ним. Тариф убран (KPI Strip
 *     показывает тариф в KPI «Срок/Тариф»).
 *   - EQUIPMENT: 2×2 grid аватарок с цветными border'ами (зелёный
 *     бесплатно, синий платно). Пустой state — большой плейсхолдер с «+».
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
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
  onIncident,
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
  /** v0.6.14: открыть RentalActionDialog с action='incident'. Если
   *  undefined — кнопка не отображается (для архивных/completed). */
  onIncident?: () => void;
}) {
  const equipmentJson = rental.equipmentJson ?? [];

  // v0.6.10: inline popover для замены экипировки (см. дизайн
  // rental-card.jsx стр. 504-535 + pickers.jsx EquipmentSwapPicker).
  const [swapIdx, setSwapIdx] = useState<number | null>(null);
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
            {/* v0.6.14: кнопка инцидента (ДТП/угон/повреждение) */}
            {onIncident && (
              <button
                type="button"
                onClick={onIncident}
                title="Зафиксировать инцидент"
                aria-label="Зафиксировать инцидент"
                className="ml-auto inline-flex items-center gap-1 rounded-full border border-red-soft bg-red-soft/70 px-2 py-0.5 text-[10.5px] font-bold text-red-ink hover:bg-red-soft"
              >
                <AlertCircle size={11} /> Инцидент
              </button>
            )}
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

          {/* v0.6.14: KPI клиента — 2 строки в одну линию */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-[8px] bg-surface-soft px-2 py-1.5">
              <div className="text-[9px] uppercase tracking-wider font-bold text-muted-2">
                Дней в аренде
              </div>
              <div className="font-display text-[13px] font-extrabold tabular-nums text-ink leading-tight">
                {fmt(clientStats.totalDays)}
              </div>
            </div>
            <div className="rounded-[8px] bg-surface-soft px-2 py-1.5">
              <div className="text-[9px] uppercase tracking-wider font-bold text-muted-2">
                Принёс
              </div>
              <div className="font-display text-[13px] font-extrabold tabular-nums text-blue-700 leading-tight">
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
            <div
              className="relative w-full max-w-[180px]"
              onMouseEnter={() => setScooterHover(true)}
              onMouseLeave={() => setScooterHover(false)}
            >
              <ScooterPosterAvatar
                scooter={scooter ?? null}
                size="md"
                className="!h-auto aspect-square w-full"
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
              <div className="text-[12px] font-semibold text-muted-2 mt-0.5 truncate">
                <ScooterModelLabel scooter={scooter ?? null} fallback={rental.model} />
              </div>
              {scooter && (
                <div className="mt-1.5 text-[11px] text-muted inline-flex items-center gap-1">
                  <Clock size={11} /> Пробег{" "}
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
            {onChangeEquipment && equipmentJson.length > 0 && (
              <button
                type="button"
                onClick={onChangeEquipment}
                className="inline-flex items-center gap-1 rounded-full bg-blue-600 text-white px-2.5 py-1 text-[11px] font-semibold hover:bg-blue-700 shrink-0"
                title="Изменить состав экипировки"
              >
                <Plus size={11} /> Добавить
              </button>
            )}
          </div>
          {equipmentJson.length === 0 ? (
            // v0.6.14: пустой state — большой плейсхолдер с «+».
            <button
              type="button"
              onClick={onChangeEquipment}
              disabled={!onChangeEquipment}
              className={cn(
                "flex-1 min-h-[180px] flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface-soft/60 text-muted-2 transition-colors",
                onChangeEquipment
                  ? "hover:border-blue-600 hover:bg-blue-50 hover:text-blue-700 cursor-pointer"
                  : "cursor-default opacity-70",
              )}
            >
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
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2 content-start">
              {equipmentJson.slice(0, 4).map((it, idx) => {
                const canSwap = !!onChangeEquipment;
                const isOpen = swapIdx === idx;
                const isFree = it.free;
                return (
                  <div
                    key={`${it.itemId ?? "na"}-${idx}`}
                    className="relative"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!canSwap) return;
                        setSwapIdx(isOpen ? null : idx);
                      }}
                      disabled={!canSwap}
                      className={cn(
                        "w-full aspect-square rounded-[12px] border-2 p-1.5 flex flex-col items-center justify-between transition-colors relative",
                        isFree
                          ? "border-green bg-green-soft/50 hover:bg-green-soft"
                          : "border-blue-100 bg-blue-50 hover:bg-blue-100",
                        isOpen &&
                          (isFree
                            ? "ring-2 ring-green ring-offset-1"
                            : "ring-2 ring-blue-600 ring-offset-1"),
                        canSwap ? "cursor-pointer" : "cursor-default",
                      )}
                      title={canSwap ? "Заменить или убрать" : it.name}
                    >
                      <EquipmentThumb item={it} />
                      <div
                        className={cn(
                          "text-[10px] font-bold w-full truncate text-center",
                          isFree ? "text-green-ink" : "text-blue-700",
                        )}
                      >
                        {it.name}
                      </div>
                      {!isFree && it.price > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 rounded-full bg-blue-600 text-white px-1.5 py-0.5 text-[9px] font-bold tabular-nums shadow-card-sm">
                          +{it.price} ₽
                        </span>
                      )}
                    </button>
                    {isOpen && (
                      <EquipmentSwapPopover
                        rental={rental}
                        replacingIdx={idx}
                        onClose={() => setSwapIdx(null)}
                      />
                    )}
                  </div>
                );
              })}
              {/* «+N» если >4 — pivot на onChangeEquipment.
                  Иначе если есть свободный слот и canEdit — кнопка «+». */}
              {equipmentJson.length > 4 ? (
                <button
                  type="button"
                  onClick={onChangeEquipment}
                  disabled={!onChangeEquipment}
                  className="aspect-square rounded-[12px] border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-2 hover:border-blue-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                  title="Показать все"
                >
                  <span className="font-display text-[20px] font-extrabold tabular-nums">
                    +{equipmentJson.length - 4}
                  </span>
                  <span className="text-[10px]">ещё</span>
                </button>
              ) : (
                onChangeEquipment && (
                  <button
                    type="button"
                    onClick={onChangeEquipment}
                    className="aspect-square rounded-[12px] border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-2 hover:border-blue-600 hover:bg-blue-50 hover:text-blue-700"
                    title="Добавить экипировку"
                  >
                    <Plus size={22} strokeWidth={2} />
                    <span className="text-[10px] font-bold">Добавить</span>
                  </button>
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
        className="flex-1 min-h-0 w-full object-contain"
      />
    );
  }
  return (
    <div
      className={cn(
        "flex-1 min-h-0 w-full flex items-center justify-center",
        item.free ? "text-green-ink/60" : "text-blue-700/60",
      )}
    >
      <Package size={32} strokeWidth={1.5} />
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
 * v0.6.10: inline popover для замены/удаления экипировки.
 *
 * Дизайн — pickers.jsx EquipmentSwapPicker (стр. 41-83):
 *   • Заголовок «Заменить «X»»
 *   • Поиск по каталогу
 *   • Список альтернатив (free → бесплатно, иначе +N ₽/сут)
 *   • Footer: «Убрать» / «пересчёт за остаток дней»
 *
 * Реализация через existing equipmentChangeAsync — собираем newEquipmentJson
 * вручную (replaced или removed) и шлём.
 */
function EquipmentSwapPopover({
  rental,
  replacingIdx,
  onClose,
}: {
  rental: Rental;
  replacingIdx: number;
  onClose: () => void;
}) {
  const equipment = rental.equipmentJson ?? [];
  const replacing = equipment[replacingIdx];
  const { data: catalog = [] } = useApiEquipment();
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
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
    // отложить регистрацию click — иначе тот же клик что открыл popover
    // его сразу закроет
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", onDocClick);
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onDocClick);
    };
  }, [onClose]);

  if (!replacing) return null;

  const items = catalog.filter(
    (c) =>
      c.name.toLowerCase().includes(filter.toLowerCase()) &&
      c.id !== replacing.itemId,
  );

  const apply = async (
    next: Array<{
      itemId?: number | null;
      name: string;
      price: number;
      free: boolean;
    }>,
  ) => {
    if (saving) return;
    setSaving(true);
    try {
      await equipmentChangeAsync({
        rentalId: rental.id,
        newEquipmentJson: next,
        payNow: false,
      });
      toast.success("Экипировка изменена", "");
      onClose();
    } catch (e) {
      toast.error("Не удалось изменить", (e as Error).message ?? "");
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = (catId: number) => {
    const cat = catalog.find((c) => c.id === catId);
    if (!cat) return;
    const next = equipment.map((e, i) =>
      i === replacingIdx
        ? {
            itemId: cat.id,
            name: cat.name,
            price: cat.price,
            free: cat.isFree,
          }
        : { itemId: e.itemId ?? null, name: e.name, price: e.price, free: e.free },
    );
    void apply(next);
  };

  const handleRemove = () => {
    const next = equipment
      .filter((_, i) => i !== replacingIdx)
      .map((e) => ({
        itemId: e.itemId ?? null,
        name: e.name,
        price: e.price,
        free: e.free,
      }));
    void apply(next);
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Заменить ${replacing.name}`}
      className="absolute left-0 top-full z-50 mt-1.5 w-[300px] rounded-2xl border border-border bg-surface shadow-card-lg overflow-hidden animate-fade-in"
    >
      <div className="border-b border-border px-3 pt-3 pb-2">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2 truncate">
              Заменить «{replacing.name}»
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
      <div className="max-h-[260px] overflow-y-auto scrollbar-thin px-1.5 py-1.5">
        {items.length === 0 && (
          <div className="px-3 py-4 text-center text-[12px] text-muted-2">
            Ничего не найдено
          </div>
        )}
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            disabled={saving}
            onClick={() => handleSelect(it.id)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[8px] hover:bg-blue-50 text-left disabled:opacity-50"
          >
            <span className="flex-1 text-[12px] text-ink-2 truncate">{it.name}</span>
            {it.isFree ? (
              <span className="text-[10px] font-bold text-green-ink">бесплатно</span>
            ) : (
              <span className="text-[10.5px] font-semibold text-orange-ink tabular-nums">
                +{it.price} ₽/сут
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="border-t border-border bg-surface-soft px-3 py-2 flex items-center justify-between">
        <button
          type="button"
          onClick={handleRemove}
          disabled={saving}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-ink hover:underline disabled:opacity-50"
        >
          <Trash2 size={11} /> Убрать
        </button>
        <span className="text-[10.5px] text-muted-2">пересчёт за остаток дней</span>
      </div>
    </div>
  );
}
