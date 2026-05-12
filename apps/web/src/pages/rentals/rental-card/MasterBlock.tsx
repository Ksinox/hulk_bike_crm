/**
 * MasterBlock — основной 3-колоночный блок карточки аренды:
 *   • CLIENT      (identity strip + фото-карточка + ФИО + контакты + залог/депозит)
 *   • SCOOTER     (постер + номер/модель + тариф)
 *   • EQUIPMENT   (чипы с экипировкой + кнопки заменить/добавить)
 *
 * v0.6.2: identity (#ID, статус, бейдж долга, «не выходит на связь»)
 * перенесён из отдельной полосы наверху в первую строку колонки «Клиент» —
 * по дизайн-эталону design/claude-design/Hulk Bike CRM/rental-card.jsx.
 */
import {
  AlertTriangle,
  Clock,
  MapPin,
  Repeat,
  Phone,
  PhoneOff,
  Plus,
  Shield,
  Star,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { ScooterPosterAvatar } from "@/pages/rentals/ScooterPosterAvatar";
import { initialsOf } from "@/lib/mock/clients";
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
  const equipSum = equipmentJson.reduce(
    (s, e) => s + (e.free ? 0 : e.price ?? 0),
    0,
  );

  const currentDeposit = rental.deposit ?? DEPOSIT_AMOUNT;
  const originalDeposit = rental.depositOriginal ?? currentDeposit;
  const depositSpent = Math.max(0, originalDeposit - currentDeposit);
  const depositItem = rental.depositItem ?? null;

  const tone = STATUS_TONE[effectiveStatus] ?? STATUS_TONE[rental.status];

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
              <div className="mt-2 flex flex-col gap-0.5 text-[11.5px]">
                {client?.birthDate && (
                  <MetaLine label="ДР" value={formatDob(client.birthDate)} />
                )}
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
                {client?.extraPhone && (
                  <MetaLine
                    label="Доп. тел"
                    value={
                      <span className="tabular-nums text-ink-2">
                        {client.extraPhone}
                      </span>
                    }
                  />
                )}
                {client?.passportRegistration && (
                  <MetaLine
                    label="Адрес"
                    multiline
                    value={
                      <span className="text-[11px] leading-snug text-ink-2 font-semibold inline-flex items-start gap-1">
                        <MapPin size={10} className="mt-[2px] shrink-0" />
                        {client.passportRegistration}
                      </span>
                    }
                  />
                )}
              </div>
            </div>
          </div>

          {/* Money row — залог + депозит клиента (2-col) */}
          <div className="mt-auto pt-4 grid grid-cols-2 gap-2">
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

        {/* COLUMN 2 — SCOOTER */}
        <div className="p-5 flex flex-col bg-surface-soft/40">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
              Скутер
            </div>
            <button
              type="button"
              onClick={onSwapScooter}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface border border-border px-2.5 py-1 text-[11px] font-bold text-ink-2 hover:bg-blue-50 hover:border-blue-100 hover:text-blue-700"
              title="Заменить скутер"
            >
              <Repeat size={11} /> Заменить
            </button>
          </div>
          <div className="flex items-start gap-3">
            <ScooterPosterAvatar scooter={scooter ?? null} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="font-display text-[18px] font-extrabold text-ink leading-tight">
                {scooter?.name ?? rental.scooter ?? "—"}
              </div>
              <div className="text-[12.5px] font-semibold text-ink-2 mt-0.5">
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
          {/* Тариф — отдельная карточка снизу */}
          <div className="mt-auto pt-4">
            <div className="rounded-[10px] border border-border bg-surface px-3 py-2">
              <div className="text-[9.5px] uppercase tracking-wider font-bold text-muted-2">
                Тариф
              </div>
              <div className="mt-0.5 font-display text-[15px] font-extrabold tabular-nums text-ink leading-tight">
                {fmt(rental.rate)} ₽/{rental.rateUnit === "week" ? "нед" : "сут"}
              </div>
              <div className="mt-0.5 text-[10px] text-muted">
                {tariffLabel(rental.tariffPeriod)} · {paymentLabel(rental.paymentMethod)}
              </div>
            </div>
          </div>
        </div>

        <div className="hidden lg:block bg-border"></div>

        {/* COLUMN 3 — EQUIPMENT */}
        <div className="p-5 flex flex-col bg-surface-soft/40">
          <div className="flex items-start justify-between mb-2.5 gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
                Экипировка
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                {equipmentJson.length}{" "}
                {pluralPos(equipmentJson.length)}
                {equipSum > 0 && <> · {equipSum} ₽/сут</>}
              </div>
            </div>
            {onChangeEquipment && (
              <button
                type="button"
                onClick={onChangeEquipment}
                className="inline-flex items-center gap-1 rounded-full bg-blue-600 text-white px-2.5 py-1 text-[11px] font-semibold hover:bg-blue-700 shrink-0"
                title="Изменить состав экипировки"
              >
                <Plus size={11} /> Изменить
              </button>
            )}
          </div>
          {equipmentJson.length === 0 ? (
            <div className="text-[11.5px] text-muted-2 italic">
              Без экипировки
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 content-start">
              {equipmentJson.map((it, idx) => (
                <button
                  type="button"
                  key={`${it.itemId ?? "na"}-${idx}`}
                  onClick={onChangeEquipment}
                  disabled={!onChangeEquipment}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[10px] px-2 py-1.5 text-[11.5px] font-semibold border-2 border-transparent transition-colors",
                    it.free
                      ? "bg-green-soft text-green-ink hover:border-green"
                      : "bg-orange-soft text-orange-ink hover:border-orange",
                    onChangeEquipment ? "cursor-pointer" : "cursor-default",
                  )}
                  title={onChangeEquipment ? "Изменить экипировку" : undefined}
                >
                  {it.name}
                  {!it.free && it.price > 0 && (
                    <span className="tabular-nums opacity-80">·{it.price} ₽</span>
                  )}
                </button>
              ))}
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

function formatDob(iso: string): string {
  // iso = "YYYY-MM-DD" (см. ApiClient.birthDate)
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function tariffLabel(period: string): string {
  switch (period) {
    case "day":
      return "1–2 дня";
    case "short":
      return "3–6 дней";
    case "week":
      return "неделя+";
    case "month":
      return "месяц+";
    default:
      return period;
  }
}

function paymentLabel(method: string): string {
  switch (method) {
    case "cash":
      return "наличные";
    case "card":
      return "карта";
    case "transfer":
      return "перевод";
    case "deposit":
      return "из залога";
    default:
      return method;
  }
}

function pluralPos(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "позиция";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "позиции";
  return "позиций";
}
