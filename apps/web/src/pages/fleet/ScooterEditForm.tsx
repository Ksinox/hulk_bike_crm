import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FleetScooter, ScooterBaseStatus } from "@/lib/mock/fleet";
import { patchScooter } from "./fleetStore";
import { useRole } from "@/lib/role";

const BASE_STATUS_OPTIONS: { value: ScooterBaseStatus; label: string }[] = [
  { value: "ready", label: "Не распределён" },
  { value: "rental_pool", label: "Парк аренды" },
  { value: "repair", label: "На ремонте" },
  { value: "buyout", label: "Передан в выкуп" },
  { value: "for_sale", label: "Выставлен на продажу" },
  { value: "sold", label: "Продан" },
];

export function ScooterEditForm({
  scooter,
  onClose,
}: {
  scooter: FleetScooter;
  onClose: () => void;
}) {
  const role = useRole();
  const [closing, setClosing] = useState(false);

  const [mileage, setMileage] = useState(String(scooter.mileage));
  const [vin, setVin] = useState(scooter.vin ?? "");
  const [engineNo, setEngineNo] = useState(scooter.engineNo ?? "");
  const [frameNumber, setFrameNumber] = useState(scooter.frameNumber ?? "");
  const [year, setYear] = useState(
    scooter.year != null ? String(scooter.year) : "",
  );
  const [color, setColor] = useState(scooter.color ?? "");
  const [baseStatus, setBaseStatus] = useState<ScooterBaseStatus>(
    scooter.baseStatus,
  );
  const [note, setNote] = useState(scooter.note ?? "");
  const [purchasePrice, setPurchasePrice] = useState(
    scooter.purchasePrice != null ? String(scooter.purchasePrice) : "",
  );

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 180);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = () => {
    const yearNum = Number(year);
    const patch: Partial<FleetScooter> = {
      mileage: Number(mileage) || 0,
      vin: vin.trim() || undefined,
      engineNo: engineNo.trim() || undefined,
      frameNumber: frameNumber.trim() || undefined,
      year: Number.isFinite(yearNum) && yearNum > 0 ? yearNum : undefined,
      color: color.trim() || undefined,
      baseStatus,
      note: note.trim() || undefined,
    };
    if (role === "director") {
      const n = Number(purchasePrice);
      patch.purchasePrice = Number.isFinite(n) && n > 0 ? n : undefined;
    }
    patchScooter(scooter.id, patch);
    requestClose();
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[130] flex justify-end bg-ink/45 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onClick={requestClose}
    >
      <div
        className={cn(
          "flex w-full max-w-[460px] flex-col overflow-hidden bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              Редактирование
            </div>
            <div className="mt-0.5 font-display text-[17px] font-extrabold text-ink">
              {scooter.name}
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-4">
            <Field label="Пробег, км">
              <input
                type="number"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-[14px] font-semibold tabular-nums text-ink outline-none focus:border-blue-600"
              />
            </Field>

            <Field label="VIN номер">
              <input
                type="text"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                placeholder="JH2KF12..."
                maxLength={17}
                className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 font-mono text-[13px] text-ink outline-none focus:border-blue-600"
              />
            </Field>

            <Field label="Номер двигателя">
              <input
                type="text"
                value={engineNo}
                onChange={(e) => setEngineNo(e.target.value)}
                placeholder="E-1234"
                className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 font-mono text-[13px] text-ink outline-none focus:border-blue-600"
              />
            </Field>

            <Field
              label="Номер рамы / шасси"
              hint={<span className="text-[10px] text-muted-2">указывается в актах</span>}
            >
              <input
                type="text"
                value={frameNumber}
                onChange={(e) => setFrameNumber(e.target.value)}
                placeholder="SA36J-605232"
                className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 font-mono text-[13px] text-ink outline-none focus:border-blue-600"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Год выпуска">
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2020"
                  min={1980}
                  max={2100}
                  className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
                />
              </Field>
              <Field label="Цвет">
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="Серебристый"
                  className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
                />
              </Field>
            </div>

            <Field label="Статус">
              <div className="grid grid-cols-2 gap-1.5">
                {BASE_STATUS_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setBaseStatus(o.value)}
                    className={cn(
                      "rounded-[10px] border px-3 py-2 text-[12px] font-semibold transition-colors",
                      baseStatus === o.value
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-border bg-surface text-ink-2 hover:border-blue-600/50",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-2">
                Если скутер сейчас в активной аренде, статус «В аренде»
                выставляется автоматически, независимо от выбранного здесь.
              </p>
            </Field>

            {role === "director" && (
              <Field
                label="Цена закупа, ₽"
                hint={
                  <span className="inline-flex items-center gap-1 rounded-full bg-purple-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-ink">
                    только директору
                  </span>
                }
              >
                <input
                  type="number"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  placeholder="85000"
                  className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-[14px] font-semibold tabular-nums text-ink outline-none focus:border-blue-600"
                />
              </Field>
            )}

            <Field label="Комментарий">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Например: замена ЦПГ, ожидается поршневая"
                className="w-full resize-y rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-blue-600"
              />
            </Field>
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-soft px-5 py-3">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-[12px] font-semibold text-muted hover:bg-border"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-4 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <Check size={13} /> Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-2">
        {label}
        {hint}
      </span>
      {children}
    </label>
  );
}
