import { Bike } from "lucide-react";
import { fileUrl } from "@/lib/files";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { EquipmentThumb } from "./EquipmentInlinePicker";
import type { Rental } from "@/lib/mock/rentals";
import type { ApiScooter } from "@/lib/api/types";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

/**
 * C5: «тело аренды» для ховера KPI «Эта аренда» — построчно с мини-аватарами:
 * скутер + каждая экипировка, напротив — цена за сутки и цена за период
 * (ставка × дни). Раньше экипировка шла серым текстом в одну строку — нечитаемо.
 */
export function RentalBodyBreakdown({
  rental,
  scooter,
  days,
}: {
  rental: Rental;
  scooter: ApiScooter | null | undefined;
  /** Дни текущего периода (для цены за период). */
  days: number;
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
  const dailyRate =
    rental.rateUnit === "week" ? Math.round(rental.rate / 7) : rental.rate;
  const d = Math.max(1, days || rental.days || 1);
  const scooterName = scooter?.name ?? rental.scooter ?? "Скутер";
  const equip = rental.equipmentJson ?? [];

  return (
    <div className="flex flex-col gap-1.5">
      {/* Скутер */}
      <Row
        avatar={
          avatarSrc ? (
            <img
              src={avatarSrc}
              alt={scooterName}
              className="h-full w-full bg-white object-contain"
            />
          ) : (
            <Bike size={16} className="text-muted-2" />
          )
        }
        title={scooterName}
        daily={dailyRate}
        period={dailyRate * d}
      />
      {/* Экипировка */}
      {equip.map((e, i) => (
        <Row
          key={`${e.itemId ?? "na"}-${i}`}
          avatar={
            <EquipmentThumb
              item={{ itemId: e.itemId, name: e.name, free: e.free }}
            />
          }
          title={e.name}
          daily={e.free ? 0 : e.price}
          period={e.free ? 0 : e.price * d}
          free={e.free}
        />
      ))}
    </div>
  );
}

function Row({
  avatar,
  title,
  daily,
  period,
  free = false,
}: {
  avatar: React.ReactNode;
  title: string;
  daily: number;
  period: number;
  free?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
        {avatar}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">
        {title}
      </span>
      <span className="shrink-0 text-right text-[10px] leading-tight text-muted-2">
        {free ? "беспл." : `${fmt(daily)} ₽/сут`}
      </span>
      <span className="w-14 shrink-0 text-right text-[12px] font-bold tabular-nums text-ink">
        {free ? "—" : `${fmt(period)} ₽`}
      </span>
    </div>
  );
}
