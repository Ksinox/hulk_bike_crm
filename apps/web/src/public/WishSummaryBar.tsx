import { useState } from "react";
import { Bike, ChevronUp, Package } from "lucide-react";
import { applicationApi, type RentalEquipment, type RentalModel } from "./applicationApi";

/**
 * Компактный выдвижной сниппет «ваш выбор» — докнут над кнопкой «Продолжить»
 * на шагах экипировки и периода. Свёрнутый: тонкая полоска с миниатюрами
 * (скутер + экипировка, как чипы-вложения в Claude — маленькие, чуть наискось)
 * и суммой (если период выбран). Развёрнутый: чипы с названиями + разбивка
 * цены. Так экран остаётся чистым, а выбор всегда под рукой.
 */

function Thumb({
  avatarUrl,
  fallback,
  size = 36,
  tilt = false,
}: {
  avatarUrl: string | null;
  fallback: "scooter" | "equip";
  size?: number;
  tilt?: boolean;
}) {
  const Icon = fallback === "scooter" ? Bike : Package;
  return (
    <div
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${
        tilt ? "-rotate-6" : ""
      }`}
    >
      {avatarUrl ? (
        <img
          src={applicationApi.modelAvatarUrl(avatarUrl + "?variant=thumb")}
          alt=""
          className={
            fallback === "scooter"
              ? "h-full w-full object-cover"
              : "h-full w-full object-contain p-1"
          }
          draggable={false}
        />
      ) : (
        <Icon size={size * 0.5} strokeWidth={1.5} className="text-slate-300" />
      )}
    </div>
  );
}

export function WishSummaryBar({
  model,
  selectedEquipment,
  price,
  periodLabel,
}: {
  model: RentalModel | null;
  selectedEquipment: RentalEquipment[];
  /** null — период ещё не выбран (на шаге экипировки), сумму не показываем. */
  price: { rentSum: number; equipSum: number; deposit: number; bring: number } | null;
  periodLabel?: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (!model) return null;
  const rub = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;

  return (
    <div className="-mx-4 mb-2 border-t border-slate-200 bg-white">
      {/* Свёрнутая полоска — тап разворачивает. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <Thumb avatarUrl={model.avatarUrl} fallback="scooter" tilt />
        {selectedEquipment.slice(0, 3).map((e) => (
          <Thumb key={e.id} avatarUrl={e.avatarUrl} fallback="equip" size={30} tilt />
        ))}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            Ваш выбор
          </div>
          <div className="truncate text-[13px] font-semibold text-slate-900">
            {model.name}
            {selectedEquipment.length > 0
              ? ` · экип. ${selectedEquipment.length}`
              : ""}
          </div>
        </div>
        {price && (
          <div className="text-right">
            <div className="text-[10px] text-slate-400">с собой</div>
            <div className="text-[15px] font-extrabold tabular-nums text-slate-900">
              {rub(price.bring)}
            </div>
          </div>
        )}
        <ChevronUp
          size={18}
          className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Развёрнутая панель. */}
      {open && (
        <div className="space-y-3 px-4 pb-3 pt-1">
          {/* Скутер чипом с названием. */}
          <div className="flex items-center gap-2.5">
            <Thumb avatarUrl={model.avatarUrl} fallback="scooter" size={44} tilt />
            <div className="min-w-0">
              <div className="text-[14px] font-bold text-slate-900">{model.name}</div>
              {periodLabel && (
                <div className="text-[12px] text-slate-500">{periodLabel}</div>
              )}
            </div>
          </div>

          {/* Экипировка чипами. */}
          {selectedEquipment.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedEquipment.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-1 pl-1 pr-2.5"
                >
                  <Thumb avatarUrl={e.avatarUrl} fallback="equip" size={26} />
                  <span className="text-[12px] font-medium text-slate-700">
                    {e.name}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Разбивка цены — только когда период выбран. */}
          {price && (
            <div className="rounded-xl bg-slate-50 p-3 text-[13px]">
              <Row label="Аренда" value={rub(price.rentSum)} />
              <Row label="Экипировка" value={`+ ${rub(price.equipSum)}`} />
              <Row label="Залог (вернётся)" value={rub(price.deposit)} />
              <div className="mt-1.5 flex items-baseline justify-between border-t border-slate-200 pt-1.5">
                <span className="text-[14px] font-bold text-slate-900">
                  Взять с собой
                </span>
                <span className="text-[16px] font-extrabold tabular-nums text-slate-900">
                  {rub(price.bring)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold tabular-nums text-slate-900">{value}</span>
    </div>
  );
}
