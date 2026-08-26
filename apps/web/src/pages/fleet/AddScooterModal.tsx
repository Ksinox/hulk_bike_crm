import { useEffect, useMemo, useState } from "react";
import {
  Check,
  HandCoins,
  HelpCircle,
  Key,
  Tag,
  X,
} from "lucide-react";
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
import { useRentalSlots } from "@/lib/api/scooters";
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

/** Правки 2.0, п.10: подразделения при добавлении техники. */
const MODE_CARDS: {
  id: "rental" | "sale" | "buyout" | "unassigned";
  label: string;
  hint: string;
  icon: typeof Key;
  defaultStatus: ScooterBaseStatus;
}[] = [
  {
    id: "rental",
    label: "В аренду",
    hint: "будет сдаваться клиентам",
    icon: Key,
    defaultStatus: "rental_pool",
  },
  {
    id: "sale",
    label: "На продажу",
    hint: "выставляем на витрину",
    icon: Tag,
    defaultStatus: "for_sale",
  },
  {
    id: "buyout",
    label: "В выкуп",
    hint: "клиент выкупает по графику",
    icon: HandCoins,
    defaultStatus: "buyout",
  },
  {
    id: "unassigned",
    label: "Пока не решили",
    hint: "определимся позже",
    icon: HelpCircle,
    defaultStatus: "ready",
  },
];

/** Статус → подразделение (для подсветки выбранной карточки). */
const MODE_OF_STATUS: Record<string, "rental" | "sale" | "buyout" | "unassigned"> =
  {
    rental_pool: "rental",
    repair: "rental",
    dtp: "rental",
    disassembly: "rental",
    for_sale: "sale",
    sold: "sale",
    buyout: "buyout",
    ready: "unassigned",
  };

/** Состояния внутри арендного подразделения. */
const RENTAL_STATES = SCOOTER_BASE_STATUS_OPTIONS.filter((o) =>
  ["rental_pool", "repair", "dtp", "disassembly"].includes(o.value),
);

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
  const [engineNo, setEngineNo] = useState("");
  // Номер рамы / шасси — он же VIN. Отдельного поля VIN не держим:
  // на скутере это всегда одна и та же маркировка, в шаблоны актов
  // и договоров она подставляется и под подпись «VIN», и под «номер
  // шасси» из этого поля.
  const [frameNumber, setFrameNumber] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(toDateInput(todayRu()));
  const [purchasePrice, setPurchasePrice] = useState("");
  const [marketValue, setMarketValue] = useState("");
  const [status, setStatus] = useState<ScooterBaseStatus>("ready");
  const [note, setNote] = useState("");
  // Пункт 15: номер в арендном парке (null = авто, наименьший свободный).
  const [rentalSlot, setRentalSlot] = useState<number | null>(null);
  // Пункт 11: чья техника. Партнёрская сразу попадает в раздел «Партнёрка»
  // с общим процентом инвестора — заводить её отдельно не нужно.
  const [isPartner, setIsPartner] = useState(false);
  const slotsQ = useRentalSlots();
  const slotsFree = slotsQ.data?.free ?? [];
  const slotsTotal = slotsQ.data?.total ?? 0;

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
  /** Статус, при котором техника занимает арендный номер. */
  const holdsSlotStatus =
    status === "rental_pool" || status === "repair" || status === "dtp";
  const nameTaken = scooters.some((s) => s.name === name);

  // VIN (= номер рамы/шасси) обязан быть уникальным. Проверяем мгновенно
  // на клиенте по текущему парку — чтобы не плодить дубли (бэкенд тоже
  // отбивает 409, но так юзер видит ошибку сразу, до сохранения).
  const vinTrim = frameNumber.trim().toUpperCase();
  const vinTaken =
    vinTrim !== "" &&
    scooters.some((s) => (s.vin ?? "").toUpperCase() === vinTrim);

  // v0.5.6: год обязателен валидный (1980..currentYear+1) если введён.
  // Пустая строка ОК — значит «не указано» (необязательное поле).
  const currentYear = new Date().getFullYear();
  const yearTrim = year.trim();
  const yearNum = Number(yearTrim);
  const yearValid =
    yearTrim === "" ||
    (Number.isInteger(yearNum) && yearNum >= 1980 && yearNum <= currentYear + 1);
  const canSave =
    !!number && !nameTaken && !vinTaken && modelId != null && yearValid;

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
      // VIN = номер рамы/шасси — одно и то же поле.
      // В addScooter store пишем оба значения для совместимости.
      vin: frameNumber.trim() || undefined,
      engineNo: engineNo.trim() || undefined,
      frameNumber: frameNumber.trim() || undefined,
      year: Number.isFinite(Number(year)) && Number(year) > 0
        ? Number(year)
        : undefined,
      color: color.trim() || undefined,
      purchaseDate: purchaseDate ? fromDateInput(purchaseDate) : undefined,
      purchasePrice:
        role === "director" && purchasePrice
          ? Number(purchasePrice) || undefined
          : undefined,
      marketValue: marketValue ? Number(marketValue) || undefined : undefined,
      note: note.trim() || undefined,
      rentalSlot: rentalSlot ?? undefined,
      isPartner,
    });
    requestClose();
  };

  return (
    <div
      className={cn(
        // Мобайл: полноэкранно (без отступов). Десктоп (sm+): центрированная карточка.
        "fixed inset-0 z-[130] flex items-stretch justify-center bg-ink/55 sm:items-center sm:p-6 sm:backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
    >
      <div
        className={cn(
          // Мобайл: на весь экран (h-[100dvh] — учитывает тулбар iOS), без скруглений.
          // Десктоп: карточка max-w-560 с max-h-92vh и скруглением.
          "flex h-[100dvh] w-full flex-col overflow-hidden bg-surface shadow-card-lg sm:h-auto sm:max-h-[92vh] sm:max-w-[560px] sm:rounded-2xl",
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

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
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
                    служебный — в CRM техника называется по модели и
                    арендному номеру
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
              <Field
                label="Номер рамы / шасси (VIN)"
                hint={
                  vinTaken ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-ink">
                      такой VIN уже есть
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-2">
                      подставляется в акты и договоры
                    </span>
                  )
                }
              >
                <input
                  type="text"
                  value={frameNumber}
                  onChange={(e) => setFrameNumber(e.target.value.toUpperCase())}
                  placeholder="SA36J-605232"
                  maxLength={20}
                  className={cn(
                    "h-10 w-full rounded-[10px] border bg-surface px-3 font-mono text-[13px] text-ink outline-none focus:border-blue-600",
                    vinTaken ? "border-red-soft" : "border-border",
                  )}
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
              <Field
                label="Год выпуска"
                hint={
                  !yearValid ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-ink">
                      год от 1980 до {currentYear + 1}
                    </span>
                  ) : undefined
                }
              >
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2020"
                  min={1980}
                  max={currentYear + 1}
                  className={cn(
                    "h-10 w-full rounded-[10px] border bg-surface px-3 text-[13px] text-ink outline-none",
                    yearValid
                      ? "border-border focus:border-blue-600"
                      : "border-red-500 focus:border-red-600",
                  )}
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

            <Field
              label="Рыночная стоимость, ₽"
              hint={
                <span className="text-[11px] text-muted-2">
                  в договор — стоимость при утрате
                </span>
              }
            >
              <input
                type="number"
                min={0}
                value={marketValue}
                onChange={(e) => setMarketValue(e.target.value)}
                placeholder="150000"
                className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-[14px] font-semibold tabular-nums text-ink outline-none focus:border-blue-600"
              />
            </Field>

            {/* Правки 2.0, п.10: сначала подразделение («куда эта
                техника»), потом — уточнение состояния внутри аренды. */}
            <Field label="Куда добавляем">
              <div className="grid grid-cols-2 gap-1.5">
                {MODE_CARDS.map((m) => {
                  const Icon = m.icon;
                  const active = MODE_OF_STATUS[status] === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setStatus(m.defaultStatus)}
                      className={cn(
                        "flex items-start gap-2.5 rounded-[12px] border px-3 py-2.5 text-left transition-colors",
                        active
                          ? "border-blue-600 bg-blue-50"
                          : "border-border bg-surface hover:border-blue-600/50",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                          active
                            ? "bg-blue-600 text-white"
                            : "bg-surface-soft text-muted",
                        )}
                      >
                        <Icon size={14} />
                      </span>
                      <span className="min-w-0">
                        <span
                          className={cn(
                            "block text-[12.5px] font-bold",
                            active ? "text-blue-700" : "text-ink",
                          )}
                        >
                          {m.label}
                        </span>
                        <span className="block text-[10.5px] leading-snug text-muted-2">
                          {m.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* Внутри аренды — состояние единицы. */}
            {MODE_OF_STATUS[status] === "rental" && (
              <Field label="Состояние">
                <div className="flex flex-wrap gap-1.5">
                  {RENTAL_STATES.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setStatus(o.value)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
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
            )}

            {/* Пункт 11: чья техника. Партнёрская попадает в раздел
                «Партнёрка» и считается с процентом инвестора. */}
            <Field label="Чья техника">
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    [false, "Наша", "вся выручка наша"],
                    [true, "Партнёрская", "делим с инвестором"],
                  ] as const
                ).map(([val, label, hint]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setIsPartner(val)}
                    className={cn(
                      "flex flex-col items-start rounded-[10px] border px-3 py-2 text-left transition-colors",
                      isPartner === val
                        ? val
                          ? "border-violet-500 bg-violet-50 text-violet-700"
                          : "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-border bg-surface text-ink-2 hover:border-blue-600/50",
                    )}
                  >
                    <span className="text-[12px] font-semibold">{label}</span>
                    <span className="text-[10.5px] text-muted-2">{hint}</span>
                  </button>
                ))}
              </div>
            </Field>

            {/* Пункт 15: номер в арендном парке — для техники, попадающей
                в аренду. «Авто» = наименьший свободный. */}
            {holdsSlotStatus && (
              <Field label={`Номер в аренде · свободно ${slotsFree.length} из ${slotsTotal}`}>
                {slotsFree.length === 0 ? (
                  <div className="rounded-[10px] border border-orange-ink/30 bg-orange-soft/50 px-3 py-2 text-[12px] font-semibold text-orange-ink">
                    Все номера заняты — увеличьте общее количество номеров на
                    странице «Скутеры» или освободите один.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setRentalSlot(null)}
                      className={cn(
                        "rounded-[10px] border px-3 py-2 text-[12px] font-semibold transition-colors",
                        rentalSlot == null
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-border bg-surface text-ink-2 hover:border-blue-600/50",
                      )}
                      title={`Автоматически: номер ${slotsFree[0]}`}
                    >
                      Авто (№{slotsFree[0]})
                    </button>
                    {slotsFree.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setRentalSlot(s)}
                        className={cn(
                          "min-w-10 rounded-[10px] border px-2.5 py-2 text-[12px] font-bold transition-colors",
                          rentalSlot === s
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-border bg-surface text-ink-2 hover:border-blue-600/50",
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
            )}

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
              : vinTaken
                ? "Исправьте VIN — такой номер рамы уже есть в парке."
                : `Появится в парке: ${scooterPrefix}${
                    rentalSlot != null
                      ? ` под номером ${rentalSlot}`
                      : holdsSlotStatus
                        ? ` под первым свободным номером${
                            slotsFree[0] != null ? ` (${slotsFree[0]})` : ""
                          }`
                        : ""
                  } · статус «${statusLabel(status)}»${isPartner ? " · партнёрская" : ""}.`}
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
