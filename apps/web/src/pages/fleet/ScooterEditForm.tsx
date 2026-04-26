import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FleetScooter } from "@/lib/mock/fleet";
import type { ScooterModel } from "@/lib/mock/rentals";
import { patchScooter } from "./fleetStore";
import { useRole } from "@/lib/role";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import {
  ModelPicker,
  modelEnumFromName,
  scooterPrefixFromModelName,
} from "./ModelPicker";

export function ScooterEditForm({
  scooter,
  onClose,
}: {
  scooter: FleetScooter;
  onClose: () => void;
}) {
  const role = useRole();
  const [closing, setClosing] = useState(false);
  const { data: models = [] } = useApiScooterModels();

  // Модель: новый modelId (из каталога) + legacy enum для совместимости
  // со старыми экранами/тарифами (jog/gear/honda/tank).
  const [modelId, setModelId] = useState<number | null>(
    scooter.modelId ?? null,
  );
  const [modelName, setModelName] = useState<string>(() => {
    if (scooter.modelId) {
      const m = models.find((x) => x.id === scooter.modelId);
      if (m) return m.name;
    }
    // fallback: пытаемся найти по enum модели
    const fallback = models.find((x) =>
      x.name.toLowerCase().includes(scooter.model),
    );
    return fallback?.name ?? "";
  });

  // Когда подгрузился каталог моделей — синхронизируем modelName
  useEffect(() => {
    if (models.length === 0) return;
    if (modelId != null && !modelName) {
      const m = models.find((x) => x.id === modelId);
      if (m) setModelName(m.name);
    } else if (modelId == null && !modelName) {
      const m = models.find((x) =>
        x.name.toLowerCase().includes(scooter.model),
      );
      if (m) {
        setModelId(m.id);
        setModelName(m.name);
      }
    }
  }, [models, modelId, modelName, scooter.model]);

  const [mileage, setMileage] = useState(String(scooter.mileage));
  const [engineNo, setEngineNo] = useState(scooter.engineNo ?? "");
  // Номер рамы / шасси — он же VIN. Если в БД лежит legacy-VIN без
  // frameNumber, инициализируем им (одно физическое значение, разные
  // имена полей для совместимости со старыми записями и шаблонами).
  const [frameNumber, setFrameNumber] = useState(
    scooter.frameNumber ?? scooter.vin ?? "",
  );
  const [year, setYear] = useState(
    scooter.year != null ? String(scooter.year) : "",
  );
  const [color, setColor] = useState(scooter.color ?? "");
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

  // Если поменяли модель — пересчитываем имя скутера: «Jog #02» → «Gear #02».
  // Номер в серии (часть после #) сохраняется. Если префикс не поменялся —
  // имя остаётся прежним.
  const newName = useMemo(() => {
    if (!modelName) return scooter.name;
    const newPrefix = scooterPrefixFromModelName(modelName);
    const numMatch = scooter.name.match(/#(\d+)/);
    const num = numMatch ? numMatch[1] : "";
    if (!num) return scooter.name;
    const candidate = `${newPrefix} #${num}`;
    return candidate === scooter.name ? scooter.name : candidate;
  }, [modelName, scooter.name]);
  const nameChanged = newName !== scooter.name;

  const handleSave = () => {
    const yearNum = Number(year);
    const newLegacyModel: ScooterModel = modelName
      ? modelEnumFromName(modelName)
      : scooter.model;
    const patch: Partial<FleetScooter> = {
      mileage: Number(mileage) || 0,
      // Поддерживаем оба поля (vin/frameNumber) одинаковыми — они про
      // один и тот же номер. Шаблоны документов читают frameNumber,
      // а где остался vin — будет совпадать.
      vin: frameNumber.trim() || undefined,
      engineNo: engineNo.trim() || undefined,
      frameNumber: frameNumber.trim() || undefined,
      year: Number.isFinite(yearNum) && yearNum > 0 ? yearNum : undefined,
      color: color.trim() || undefined,
      note: note.trim() || undefined,
      // Смена модели: пишем и legacy-enum (для тарифов / шаблонов где
      // ещё не перешли на modelId), и FK на каталог моделей. Имя скутера
      // тоже синхронизируем с новым префиксом, если оно меняется.
      model: newLegacyModel,
      modelId: modelId ?? undefined,
      name: newName,
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
            <Field
              label="Модель"
              hint={
                nameChanged ? (
                  <span className="text-[10px] font-bold text-amber-700">
                    имя станет «{newName}»
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-2">
                    тарифы пересчитаются по этой модели
                  </span>
                )
              }
            >
              <ModelPicker
                value={modelId}
                onChange={(id, m) => {
                  setModelId(id);
                  setModelName(m.name);
                }}
              />
            </Field>

            <Field label="Пробег, км">
              <input
                type="number"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-[14px] font-semibold tabular-nums text-ink outline-none focus:border-blue-600"
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
              label="Номер рамы / шасси (VIN)"
              hint={
                <span className="text-[10px] text-muted-2">
                  подставляется в акты и договоры под подпись «VIN»
                </span>
              }
            >
              <input
                type="text"
                value={frameNumber}
                onChange={(e) => setFrameNumber(e.target.value.toUpperCase())}
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
