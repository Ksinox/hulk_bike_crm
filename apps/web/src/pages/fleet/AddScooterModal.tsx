import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScooterModel } from "@/lib/mock/rentals";
import type { ScooterBaseStatus } from "@/lib/mock/fleet";
import { addScooter, useFleetScooters } from "./fleetStore";
import { useRole } from "@/lib/role";
import {
  ModelPicker,
  modelEnumFromName,
  scooterPrefixFromModelName,
} from "./ModelPicker";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { SCOOTER_BASE_STATUS_OPTIONS } from "./scooterStatusOptions";

function todayRu(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

/** Подобрать свободный номер в серии для заданного префикса ("Jog", "Gear"). */
function suggestNextNumberByPrefix(
  prefix: string,
  scooters: { name: string }[],
): number {
  const used = new Set<number>();
  const prefLow = prefix.toLowerCase();
  for (const s of scooters) {
    if (!s.name.toLowerCase().startsWith(prefLow)) continue;
    const m = s.name.match(/#(\d+)/);
    if (m) used.add(+m[1]);
  }
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

export function AddScooterModal({ onClose }: { onClose: () => void }) {
  const role = useRole();
  const scooters = useFleetScooters();
  const { data: models = [] } = useApiScooterModels();
  const [closing, setClosing] = useState(false);

  // Выбираем модель по умолчанию: первая quickPick, иначе первая из списка
  const defaultModel = useMemo(
    () => models.find((m) => m.quickPick) ?? models[0] ?? null,
    [models],
  );
  const [modelId, setModelId] = useState<number | null>(null);
  const [modelName, setModelName] = useState<string>("");
  // Когда модели подгрузились — проставляем дефолт (один раз)
  useEffect(() => {
    if (modelId == null && defaultModel) {
      setModelId(defaultModel.id);
      setModelName(defaultModel.name);
    }
  }, [defaultModel, modelId]);

  const scooterPrefix = modelName
    ? scooterPrefixFromModelName(modelName)
    : "Jog";
  const legacyModel: ScooterModel = modelName
    ? modelEnumFromName(modelName)
    : "jog";

  const [number, setNumber] = useState<string>("");
  const [mileage, setMileage] = useState("0");
  const [vin, setVin] = useState("");
  const [engineNo, setEngineNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(toDateInput(todayRu()));
  const [purchasePrice, setPurchasePrice] = useState("");
  const [status, setStatus] = useState<ScooterBaseStatus>("ready");
  const [note, setNote] = useState("");

  // при смене префикса модели — пересчитать подсказку по номеру, если пользователь сам ничего не менял
  const [numberTouched, setNumberTouched] = useState(false);
  const suggested = useMemo(
    () => suggestNextNumberByPrefix(scooterPrefix, scooters),
    [scooterPrefix, scooters],
  );
  useEffect(() => {
    if (!numberTouched) setNumber(String(suggested));
  }, [suggested, numberTouched]);

  const name = `${scooterPrefix} #${String(number || "1").padStart(2, "0")}`;
  const nameTaken = scooters.some((s) => s.name === name);

  const canSave = !!number && !nameTaken && modelId != null;

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
    if (!canSave) return;
    addScooter({
      name,
      model: legacyModel,
      modelId: modelId ?? undefined,
      mileage: Number(mileage) || 0,
      baseStatus: status,
      vin: vin.trim() || undefined,
      engineNo: engineNo.trim() || undefined,
      purchaseDate: purchaseDate ? fromDateInput(purchaseDate) : undefined,
      purchasePrice:
        role === "director" && purchasePrice
          ? Number(purchasePrice) || undefined
          : undefined,
      note: note.trim() || undefined,
    });
    requestClose();
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[130] flex items-center justify-center bg-ink/55 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onClick={requestClose}
    >
      <div
        className={cn(
          "flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              Новый скутер
            </div>
            <div className="mt-0.5 font-display text-[17px] font-extrabold text-ink">
              Добавление в парк
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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-4">
            <Field label="Модель">
              <ModelPicker
                value={modelId}
                onChange={(id, m) => {
                  setModelId(id);
                  setModelName(m.name);
                  setNumberTouched(false);
                }}
              />
            </Field>

            <Field
              label="Номер в серии"
              hint={
                nameTaken ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-red-ink">
                    такой уже есть
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-muted-2">
                    Имя: <b className="text-ink">{name}</b>
                  </span>
                )
              }
            >
              <input
                type="number"
                min={1}
                value={number}
                onChange={(e) => {
                  setNumber(e.target.value);
                  setNumberTouched(true);
                }}
                placeholder={String(suggested)}
                className={cn(
                  "h-10 w-full rounded-[10px] border bg-surface px-3 text-[14px] font-semibold tabular-nums text-ink outline-none focus:border-blue-600",
                  nameTaken ? "border-red-soft" : "border-border",
                )}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="VIN">
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Текущий пробег, км">
                <input
                  type="number"
                  min={0}
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-[14px] font-semibold tabular-nums text-ink outline-none focus:border-blue-600"
                />
              </Field>
              <Field label="Дата покупки">
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
                />
              </Field>
            </div>

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
                  min={0}
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  placeholder="85000"
                  className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-[14px] font-semibold tabular-nums text-ink outline-none focus:border-blue-600"
                />
              </Field>
            )}

            <Field label="Стартовый статус">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {SCOOTER_BASE_STATUS_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setStatus(o.value)}
                    className={cn(
                      "rounded-[10px] border px-3 py-2 text-[12px] font-semibold transition-colors",
                      status === o.value
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-border bg-surface text-ink-2 hover:border-blue-600/50",
                    )}
                    title={o.hint}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Комментарий">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Любая доп. информация"
                className="w-full resize-y rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-blue-600"
              />
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-soft px-5 py-3">
          <div className="text-[11px] text-muted-2">
            {nameTaken
              ? "Исправьте номер — такой скутер уже есть в парке."
              : `Появится в парке как «${name}» со статусом «${statusLabel(status)}».`}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="rounded-full border border-border bg-surface px-4 py-1.5 text-[12px] font-semibold text-muted hover:bg-border"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={handleSave}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-[12px] font-semibold text-white transition-colors",
                canSave
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "cursor-not-allowed bg-muted-2",
              )}
            >
              <Check size={13} /> Добавить
            </button>
          </div>
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

function statusLabel(s: ScooterBaseStatus): string {
  return SCOOTER_BASE_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
}

function toDateInput(ru: string): string {
  const m = ru.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function fromDateInput(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
