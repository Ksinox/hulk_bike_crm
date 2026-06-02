/**
 * IdentityStrip — узкая шапка над MasterBlock с #ID аренды, статусом и
 * бейджами (долг, «не выходит на связь»). Дублирует часть информации,
 * которая раньше была в большом header'е — вынесена отдельно, чтобы
 * MasterBlock остался строго про сущности (клиент / скутер / экипировка).
 */
import { AlertTriangle, PhoneOff, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STATUS_LABEL,
  STATUS_TONE,
  type RentalStatus,
} from "@/lib/mock/rentals";
import { ratingTier } from "@/lib/mock/clients";
import type { ApiClient } from "@/lib/api/types";

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

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function IdentityStrip({
  rentalId,
  rentalStatus,
  effectiveStatus,
  client,
  isUnreachable,
  totalDebt,
  overdueDays,
  isArchived,
  onDebtClick,
}: {
  rentalId: number;
  rentalStatus: RentalStatus;
  effectiveStatus: RentalStatus;
  client: ApiClient | null | undefined;
  isUnreachable: boolean;
  totalDebt: number;
  overdueDays: number;
  isArchived: boolean;
  onDebtClick?: () => void;
}) {
  const tone = STATUS_TONE[effectiveStatus] ?? STATUS_TONE[rentalStatus];
  const tier = client ? ratingTier(client.rating) : null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-1">
      <span className="font-display text-[20px] font-extrabold text-ink tabular-nums">
        Аренда · #{String(rentalId).padStart(4, "0")}
      </span>
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold",
          statusChipClass(tone),
        )}
      >
        {STATUS_LABEL[effectiveStatus] ?? STATUS_LABEL[rentalStatus]}
      </span>
      {isArchived && (
        <span className="inline-flex items-center rounded-full bg-surface-soft px-2.5 py-0.5 text-[11px] font-bold text-muted ring-1 ring-inset ring-border">
          в архиве
        </span>
      )}
      {totalDebt > 0 && (
        <button
          type="button"
          onClick={onDebtClick}
          className="inline-flex items-center gap-1 rounded-full bg-red-600 text-white px-2.5 py-0.5 text-[11px] font-bold hover:brightness-110"
          title="История долгов"
        >
          <AlertTriangle size={11} /> {fmt(totalDebt)} ₽
          {overdueDays > 0 && <> · {overdueDays} дн</>}
        </button>
      )}
      {isUnreachable && (
        <span className="inline-flex items-center gap-1 rounded-full bg-orange-soft px-2 py-0.5 text-[11px] font-bold text-orange-ink">
          <PhoneOff size={11} /> Не выходит на связь
        </span>
      )}
      {client && tier && (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
            tier.tone === "good"
              ? "bg-green-soft text-green-ink"
              : tier.tone === "bad"
                ? "bg-red-soft text-red-ink"
                : "bg-surface-soft text-ink",
          )}
          title={tier.label}
        >
          <Star size={11} /> {client.rating}
        </span>
      )}
    </div>
  );
}
