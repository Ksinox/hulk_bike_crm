import { useEffect, useMemo, useState } from "react";
import { Bike, Image as ImageIcon, X, Plus, Minus, Search, ChevronDown, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Rental } from "@/lib/mock/rentals";
import { DatePicker } from "@/components/ui/date-picker";
import { useApiScooter } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useApiEquipment } from "@/lib/api/equipment";
import { useApiPriceList } from "@/lib/api/price-list";
import { fileUrl } from "@/lib/files";
import type { DamageSeedItem } from "./DamageReportDialog";

/**
 * v0.9 (Этап 2): приёмка позиций при завершении аренды, вынесенная из
 * RentalActionDialog в отдельный модуль, чтобы её можно было встроить
 * в дровер оплаты (PaymentAcceptDialog) — единое окно завершения.
 *
 * v0.9.1 (фидбэк preview): пикер ущерба переработан — у каждой выбранной
 * позиции редактируемая цена и количество (степпер), без обрезания текста,
 * + свои позиции. Модель: на каждую позицию приёмки (скутер / экипировка) —
 * СПИСОК строк ущерба `DamageLine[]` (цена × кол-во).
 */

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** v0.4.57: ISO yyyy-mm-dd → DD.MM.YYYY (формат inspection.dateActual). */
function isoDateToRu(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function todayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export type CardKey = "scooter" | `equipment-${number}`;
export type CardState = "ok" | "problem";

/** Одна строка ущерба: позиция прайса (или своя) с ценой и количеством. */
export type DamageLine = {
  name: string;
  price: number; // цена за единицу (редактируемая)
  quantity: number; // количество (степпер, ≥1)
  itemId?: number; // id позиции прайса (null для своей)
  isCustom: boolean;
};

export type ScooterNextStatus =
  | "rental_pool"
  | "repair"
  | "for_sale"
  | "disassembly"
  | "buyout";

/** Цель открытого пикера ущерба. */
type PickerTarget =
  | { kind: "scooter" }
  | { kind: "equipment"; key: CardKey; name: string }
  | null;

const lineTotal = (l: DamageLine) => l.price * l.quantity;
const linesTotal = (lines: DamageLine[]) => lines.reduce((s, l) => s + lineTotal(l), 0);

/** Производные данные приёмки, нужные дровер-расчёту и сабмиту. */
export type ReturnIntake = ReturnType<typeof useReturnIntake>;

/**
 * v0.9: владеет состоянием приёмки. enabled=false (обычный приём оплаты,
 * не завершение) — хук не делает запрос к скутеру и отдаёт «пустую»
 * приёмку, чтобы PaymentAcceptDialog мог вызывать хук безусловно.
 */
export function useReturnIntake(rental: Rental, enabled: boolean) {
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
  // На каждую позицию (скутер / экипировка) — список строк ущерба.
  const [scooterDamages, setScooterDamages] = useState<DamageLine[]>([]);
  const [equipmentDamages, setEquipmentDamages] = useState<
    Record<string, DamageLine[]>
  >({});
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [returnDate, setReturnDate] = useState<string>(() => isoToday());
  const [mileageAtReturn, setMileageAtReturn] = useState<string>("");
  const [scooterNextStatus, setScooterNextStatus] =
    useState<ScooterNextStatus>("rental_pool");
  const [scooterStatusTouched, setScooterStatusTouched] = useState(false);

  // Запрос скутера только когда блок реально показывается (завершение).
  const scooterQ = useApiScooter(enabled ? (rental.scooterId ?? null) : null);
  const currentMileage = scooterQ.data?.mileage ?? null;
  const modelsQ = useApiScooterModels();
  const equipmentQ = useApiEquipment();
  const scooter = scooterQ.data ?? null;

  const scooterModel = useMemo(() => {
    const all = modelsQ.data ?? [];
    if (scooter?.modelId != null) {
      const m = all.find((x) => x.id === scooter.modelId);
      if (m) return m;
    }
    const slug = (rental.model ?? scooter?.model ?? "").toLowerCase();
    if (slug) {
      const m = all.find((x) => x.name.toLowerCase().includes(slug));
      if (m) return m;
    }
    return null;
  }, [modelsQ.data, scooter?.modelId, scooter?.model, rental.model]);

  const scooterAvatar = fileUrl(
    scooterModel?.avatarThumbKey ?? scooterModel?.avatarKey,
    { variant: "thumb" },
  );
  const equipmentItems = equipmentQ.data ?? [];

  const equipmentList = useMemo(() => {
    const list: { name: string; itemId?: number | null; price?: number }[] = [];
    if (rental.equipmentJson && rental.equipmentJson.length > 0) {
      for (const e of rental.equipmentJson) {
        list.push({ name: e.name, itemId: e.itemId ?? null, price: e.price });
      }
    } else if (rental.equipment && rental.equipment.length > 0) {
      for (const name of rental.equipment) list.push({ name });
    }
    return list;
  }, [rental.equipmentJson, rental.equipment]);

  const scooterCard: CardKey = "scooter";
  const equipmentCards = useMemo(
    () => equipmentList.map((_, i) => `equipment-${i}` as CardKey),
    [equipmentList],
  );
  const allCards: CardKey[] = useMemo(
    () => [scooterCard, ...equipmentCards],
    [equipmentCards],
  );
  const allDecided = allCards.every((k) => cardStates[k] != null);
  // v0.9.5: прогресс приёмки — сколько позиций уже проверено (для индикатора).
  const positionCount = allCards.length;
  const decidedCount = allCards.reduce(
    (n, k) => (cardStates[k] != null ? n + 1 : n),
    0,
  );

  const scooterDamageTotal = linesTotal(scooterDamages);
  const equipmentDamageTotal = equipmentCards.reduce((sum, key) => {
    if (cardStates[key] !== "problem") return sum;
    return sum + linesTotal(equipmentDamages[key] ?? []);
  }, 0);
  const totalDamage = scooterDamageTotal + equipmentDamageTotal;
  const hasDamage = totalDamage > 0;

  // Проблема заполнена, если есть ≥1 строка с положительной суммой.
  const linesFilled = (lines: DamageLine[]) =>
    lines.length > 0 && lines.every((l) => l.price > 0 && l.quantity > 0 && l.name.trim());
  const allEquipmentProblemsFilled = equipmentCards.every((key) => {
    if (cardStates[key] !== "problem") return true;
    return linesFilled(equipmentDamages[key] ?? []);
  });

  // Кнопка «Завершить» заблокирована, пока по каждой позиции не выбрано
  // состояние и все проблемы не заполнены.
  const blocked =
    !allDecided ||
    (cardStates[scooterCard] === "problem" && !linesFilled(scooterDamages)) ||
    !allEquipmentProblemsFilled;

  // v0.6.1: при появлении ущерба и если оператор не трогал dropdown —
  // подсказываем «В ремонт».
  useEffect(() => {
    if (scooterStatusTouched) return;
    setScooterNextStatus(scooterDamages.length > 0 ? "repair" : "rental_pool");
  }, [scooterDamages.length, scooterStatusTouched]);

  const dateActualForApi = () =>
    returnDate ? isoDateToRu(returnDate) : todayStr();
  const mileageForApi = () =>
    mileageAtReturn ? Number(mileageAtReturn) : undefined;

  // Позиции для создания акта ущерба (POST /damage-reports).
  const buildDamageSeedItems = (): DamageSeedItem[] => {
    const items: DamageSeedItem[] = [];
    for (const l of scooterDamages) {
      items.push({
        priceItemId: l.itemId ?? null,
        name: `Скутер: ${l.name}`,
        originalPrice: l.price,
        finalPrice: l.price,
        quantity: l.quantity,
        comment: null,
      });
    }
    for (const [key, state] of Object.entries(cardStates)) {
      if (key === "scooter" || state !== "problem") continue;
      const idx = Number(key.split("-")[1]);
      const eqName = equipmentList[idx]?.name ?? "Экипировка";
      for (const l of equipmentDamages[key] ?? []) {
        items.push({
          priceItemId: l.itemId ?? null,
          name: `Экипировка «${eqName}»: ${l.name}`,
          originalPrice: l.price,
          finalPrice: l.price,
          quantity: l.quantity,
          comment: null,
        });
      }
    }
    return items;
  };

  // Краткие строки ущерба для блока расчёта (label + сумма строки).
  const damageLines = useMemo(() => {
    const out: { label: string; amount: number }[] = [];
    const fmtLine = (l: DamageLine, prefix: string) => ({
      label: `${prefix}: ${l.name}${l.quantity > 1 ? ` ×${l.quantity}` : ""}`,
      amount: lineTotal(l),
    });
    for (const l of scooterDamages) out.push(fmtLine(l, "Скутер"));
    for (const key of equipmentCards) {
      if (cardStates[key] !== "problem") continue;
      const eqName = equipmentList[Number(key.split("-")[1])]?.name ?? "Экипировка";
      for (const l of equipmentDamages[key] ?? []) out.push(fmtLine(l, eqName));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scooterDamages, equipmentCards, cardStates, equipmentDamages, equipmentList]);

  return {
    enabled,
    rental,
    // state + setters
    cardStates,
    setCardStates,
    scooterDamages,
    setScooterDamages,
    equipmentDamages,
    setEquipmentDamages,
    pickerTarget,
    setPickerTarget,
    returnDate,
    setReturnDate,
    mileageAtReturn,
    setMileageAtReturn,
    scooterNextStatus,
    setScooterNextStatus,
    scooterStatusTouched,
    setScooterStatusTouched,
    // data for rendering
    scooter,
    scooterModel,
    scooterAvatar,
    equipmentItems,
    equipmentList,
    currentMileage,
    scooterCard,
    equipmentCards,
    // derived
    allDecided,
    positionCount,
    decidedCount,
    totalDamage,
    scooterDamageTotal,
    equipmentDamageTotal,
    hasDamage,
    blocked,
    damageLines,
    // helpers
    dateActualForApi,
    mileageForApi,
    buildDamageSeedItems,
  };
}

/** Краткая подпись ущерба для карточки позиции. */
function damageSummary(lines: DamageLine[]): string | undefined {
  if (lines.length === 0) return undefined;
  if (lines.length === 1) {
    const l = lines[0]!;
    return `${l.name}${l.quantity > 1 ? ` ×${l.quantity}` : ""} — ${fmt(lineTotal(l))} ₽`;
  }
  return `${lines.length} позиции — ${fmt(linesTotal(lines))} ₽`;
}

/**
 * v0.9: блок приёмки позиций — карточки (скутер + экипировка), дата/пробег,
 * судьба скутера, пикер ущерба. Без сводки по залогу (она в расчёте дровера).
 */
export function ReturnIntakeSection({ intake }: { intake: ReturnIntake }) {
  const {
    rental,
    cardStates,
    setCardStates,
    scooterDamages,
    setScooterDamages,
    equipmentDamages,
    setEquipmentDamages,
    setPickerTarget,
    returnDate,
    setReturnDate,
    mileageAtReturn,
    setMileageAtReturn,
    scooterNextStatus,
    setScooterNextStatus,
    setScooterStatusTouched,
    scooterModel,
    scooterAvatar,
    equipmentItems,
    equipmentList,
    currentMileage,
    scooterCard,
    positionCount,
    decidedCount,
  } = intake;
  const allChecked = positionCount > 0 && decidedCount === positionCount;

  const scooterState = cardStates[scooterCard];

  const startMatch = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(rental.start);
  const minReturnDate = startMatch
    ? `${startMatch[3]}-${startMatch[2]}-${startMatch[1]}`
    : undefined;
  const todayIso = isoToday();

  return (
    <div className="space-y-4">
      {/* Карточки приёмки */}
      <div className="space-y-2.5">
        {/* v0.9.5: прогресс приёмки — индикатор «N / M проверено» + полоска,
            синяя пока идёт, эмеральд + «готово» когда все позиции решены. */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              Приёмка позиций
            </span>
            <span className="flex items-center gap-1 text-[11px] font-semibold tabular-nums">
              {allChecked ? (
                <span className="inline-flex animate-pop-in items-center gap-1 text-emerald-600">
                  <CheckCircle2 size={13} /> готово
                </span>
              ) : (
                <span className="text-muted-2/70">
                  <span className="text-ink">{decidedCount}</span> / {positionCount}{" "}
                  проверено
                </span>
              )}
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border/60">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300 ease-out",
                allChecked ? "bg-emerald-500" : "bg-blue-600",
              )}
              style={{
                width: `${positionCount ? (decidedCount / positionCount) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
        {/* Скутер — основная позиция, во всю ширину */}
        <ReturnItemCard
          title={rental.scooter}
          subtitle={scooterModel?.name ?? rental.scooter}
          imageUrl={scooterAvatar}
          fallbackIcon="scooter"
          state={scooterState}
          size="large"
          damageInfo={scooterState === "problem" ? damageSummary(scooterDamages) : undefined}
          onSetOk={() => {
            setCardStates((s) => ({ ...s, [scooterCard]: "ok" }));
            setScooterDamages([]);
          }}
          onSetProblem={() => {
            setCardStates((s) => ({ ...s, [scooterCard]: "problem" }));
            setPickerTarget({ kind: "scooter" });
          }}
          onEditProblem={() => setPickerTarget({ kind: "scooter" })}
        />
        {/* Экипировка — компактная сетка 2 колонки */}
        {equipmentList.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {equipmentList.map((eq, i) => {
              const key = `equipment-${i}` as CardKey;
              const lines = equipmentDamages[key] ?? [];
              const eqItem = eq.itemId
                ? equipmentItems.find((x) => x.id === eq.itemId)
                : null;
              const eqAvatar = fileUrl(
                eqItem?.avatarThumbKey ?? eqItem?.avatarKey,
                { variant: "thumb" },
              );
              return (
                <ReturnItemCard
                  key={key}
                  title={eq.name}
                  subtitle={
                    eq.price && eq.price > 0 ? `${fmt(eq.price)} ₽` : "бесплатно"
                  }
                  imageUrl={eqAvatar}
                  fallbackIcon="equipment"
                  state={cardStates[key]}
                  size="compact"
                  damageInfo={
                    cardStates[key] === "problem" ? damageSummary(lines) : undefined
                  }
                  onSetOk={() => {
                    setCardStates((s) => ({ ...s, [key]: "ok" }));
                    setEquipmentDamages((m) => {
                      const next = { ...m };
                      delete next[key];
                      return next;
                    });
                  }}
                  onSetProblem={() => {
                    setCardStates((s) => ({ ...s, [key]: "problem" }));
                    setPickerTarget({ kind: "equipment", key, name: eq.name });
                  }}
                  onEditProblem={() =>
                    setPickerTarget({ kind: "equipment", key, name: eq.name })
                  }
                />
              );
            })}
          </div>
        )}
        {equipmentList.length === 0 && (
          <div className="text-[11px] text-muted-2">
            Экипировка не выдавалась.
          </div>
        )}
      </div>

      {/* Дата возврата + пробег — в один ряд */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
            Дата возврата
          </label>
          <DatePicker
            value={returnDate || null}
            onChange={(v) => setReturnDate(v ?? "")}
            minDate={minReturnDate}
            maxDate={todayIso}
            className="mt-1"
            clearable={false}
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
            Пробег, км{" "}
            {currentMileage != null ? (
              <span className="normal-case text-muted-2/70">
                · было {currentMileage.toLocaleString("ru-RU")}
              </span>
            ) : (
              <span className="normal-case text-muted-2/70">опц.</span>
            )}
          </label>
          <input
            type="number"
            min={currentMileage ?? 0}
            value={mileageAtReturn}
            onChange={(e) => setMileageAtReturn(e.target.value)}
            placeholder={
              currentMileage != null
                ? `${currentMileage.toLocaleString("ru-RU")}`
                : "—"
            }
            className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] tabular-nums outline-none focus:border-blue-600"
          />
          {currentMileage != null &&
            mileageAtReturn &&
            (Number(mileageAtReturn) > currentMileage ? (
              <div className="mt-1 text-[10.5px] font-semibold text-green-ink">
                + {(Number(mileageAtReturn) - currentMileage).toLocaleString("ru-RU")} км
                за аренду
              </div>
            ) : Number(mileageAtReturn) > 0 &&
              Number(mileageAtReturn) < currentMileage ? (
              <div className="mt-1 text-[10.5px] text-orange-ink">
                ⚠ меньше текущего — изменение игнорируется
              </div>
            ) : null)}
        </div>
      </div>

      {/* v0.6.1: выбор статуса скутера после завершения */}
      {rental.scooterId != null && (
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
            Что делать со скутером?
          </label>
          <div className="relative mt-1">
            <select
              value={scooterNextStatus}
              onChange={(e) => {
                setScooterStatusTouched(true);
                setScooterNextStatus(e.target.value as ScooterNextStatus);
              }}
              className={cn(
                "h-9 w-full cursor-pointer appearance-none rounded-[10px] border bg-surface pl-3 pr-9 text-[13px] font-medium text-ink outline-none focus:border-blue-600",
                scooterNextStatus === "repair"
                  ? "border-orange-300 bg-orange-soft/20 text-orange-ink"
                  : "border-border",
              )}
            >
              <option value="rental_pool">Готов к аренде (в парк)</option>
              <option value="repair">В ремонт</option>
              <option value="for_sale">Выставить на продажу</option>
              <option value="disassembly">На разборку</option>
              <option value="buyout">Передать клиенту в выкуп</option>
            </select>
            <ChevronDown
              size={15}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-2"
            />
          </div>
          <div className="mt-1 text-[10.5px] text-muted-2">
            По умолчанию — назад в парк. При ущербе обычно выбирают «В ремонт».
          </div>
        </div>
      )}

      {/* Пикер ущерба рендерится РЯДОМ с окном завершения (см.
          <ReturnDamagePicker> в PaymentAcceptDialog), а не поверх него. */}
    </div>
  );
}

/**
 * v0.9.4: пикер ущерба как ОТДЕЛЬНАЯ панель сбоку от окна завершения (а не
 * модалка поверх модалки). Рендерится PaymentAcceptDialog слева от карточки
 * завершения, когда выбрана позиция (intake.pickerTarget). null — если пикер
 * закрыт.
 */
export function ReturnDamagePicker({ intake }: { intake: ReturnIntake }) {
  const {
    rental,
    pickerTarget,
    setPickerTarget,
    scooterDamages,
    setScooterDamages,
    equipmentDamages,
    setEquipmentDamages,
    setCardStates,
    scooter,
    scooterModel,
  } = intake;
  if (!pickerTarget) return null;
  const t = pickerTarget;
  const clearCard = (key: CardKey) =>
    setCardStates((s) => {
      const next = { ...s };
      delete next[key];
      return next;
    });
  return (
    <DamagePicker
      mode={t.kind}
      scooterModelId={t.kind === "scooter" ? (scooter?.modelId ?? null) : null}
      title={
        t.kind === "scooter"
          ? `Повреждения · ${rental.scooter}`
          : `Ущерб · ${t.name}`
      }
      subtitle={
        t.kind === "scooter" ? scooterModel?.name ?? null : "позиция экипировки"
      }
      initial={t.kind === "scooter" ? scooterDamages : equipmentDamages[t.key] ?? []}
      onClose={() => {
        setPickerTarget(null);
        if (t.kind === "scooter") {
          if (scooterDamages.length === 0) clearCard("scooter");
        } else {
          if ((equipmentDamages[t.key] ?? []).length === 0) clearCard(t.key);
        }
      }}
      onApply={(lines) => {
        setPickerTarget(null);
        if (t.kind === "scooter") {
          setScooterDamages(lines);
          if (lines.length === 0) clearCard("scooter");
        } else {
          setEquipmentDamages((m) => ({ ...m, [t.key]: lines }));
          if (lines.length === 0) clearCard(t.key);
        }
      }}
    />
  );
}

export function ReturnItemCard({
  title,
  subtitle,
  imageUrl,
  fallbackIcon,
  state,
  damageInfo,
  size = "large",
  onSetOk,
  onSetProblem,
  onEditProblem,
}: {
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  fallbackIcon: "scooter" | "equipment";
  state?: "ok" | "problem";
  damageInfo?: string;
  /** large = full-width карточка с большим фото (для скутера).
   *  compact = плотная карточка для сетки 2-колонки (для экипировки). */
  size?: "large" | "compact";
  onSetOk: () => void;
  onSetProblem: () => void;
  onEditProblem?: () => void;
}) {
  const isCompact = size === "compact";
  const okActive = state === "ok";
  const problemActive = state === "problem";
  const tone =
    okActive
      ? "border-emerald-300 bg-emerald-50/40"
      : problemActive
        ? "border-orange-300 bg-orange-soft/25"
        : "border-border bg-surface hover:border-blue-300";

  // v0.9.3: сегментированный переключатель состояния (единый контрол, а не
  // две обведённые кнопки) — аккуратнее (по утверждённому макету).
  const segment = (
    <div
      className={cn(
        "flex overflow-hidden rounded-lg border border-border",
        isCompact ? "text-[11px]" : "text-[12.5px]",
      )}
    >
      <button
        type="button"
        onClick={onSetOk}
        className={cn(
          "flex-1 font-semibold transition-colors",
          isCompact ? "py-1.5" : "py-2",
          okActive
            ? "bg-emerald-500 text-white"
            : "bg-surface text-ink-2 hover:bg-emerald-50",
        )}
      >
        {isCompact ? "ОК" : "Без ущерба"}
      </button>
      <button
        type="button"
        onClick={onSetProblem}
        className={cn(
          "flex-1 border-l border-border font-semibold transition-colors",
          isCompact ? "py-1.5" : "py-2",
          problemActive
            ? "bg-orange-500 text-white"
            : "bg-surface text-ink-2 hover:bg-orange-soft/40",
        )}
      >
        {isCompact ? "Ущерб" : "Есть ущерб"}
      </button>
    </div>
  );

  const chip = problemActive && damageInfo && (
    <button
      type="button"
      onClick={onEditProblem}
      className={cn(
        "mt-1.5 flex w-full items-center justify-between gap-2 rounded-lg bg-orange-soft/55 px-2.5 py-1.5 text-orange-ink hover:bg-orange-soft/80",
        isCompact ? "text-[10.5px]" : "text-[12px]",
      )}
    >
      <span className="truncate font-semibold">{damageInfo}</span>
      <span className="ml-1 shrink-0 text-[10px] underline opacity-80">
        {isCompact ? "изм." : "изменить"}
      </span>
    </button>
  );

  // Компактная карточка (экипировка) — без фото, плотная сетка 2-в-ряд.
  if (isCompact) {
    return (
      <div className={cn("rounded-xl border p-2.5 transition-colors", tone)}>
        <div className="truncate text-[12.5px] font-semibold leading-tight text-ink">
          {title}
        </div>
        {subtitle && (
          <div className="truncate text-[10.5px] text-muted-2">{subtitle}</div>
        )}
        <div className="mt-2">{segment}</div>
        {chip}
      </div>
    );
  }

  // Крупная карточка (скутер) — с фото.
  return (
    <div className={cn("rounded-xl border p-3 transition-colors", tone)}>
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1",
            okActive
              ? "ring-emerald-200 bg-emerald-50"
              : problemActive
                ? "ring-orange-200 bg-orange-soft/40"
                : "ring-border bg-surface-soft",
          )}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full bg-white object-contain" />
          ) : fallbackIcon === "scooter" ? (
            <Bike size={24} className="text-muted-2" strokeWidth={1.5} />
          ) : (
            <ImageIcon size={20} className="text-muted-2" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold leading-tight text-ink">
            {title}
          </div>
          {subtitle && (
            <div className="truncate text-[11px] text-muted-2">{subtitle}</div>
          )}
        </div>
      </div>
      <div className="mt-2.5">{segment}</div>
      {chip}
    </div>
  );
}

/**
 * v0.9.1: единый пикер ущерба (скутер / экипировка). Переработан по фидбэку:
 *  - выбранные позиции — редактируемые строки: цена (₽) + количество (степпер);
 *  - каталог прайса — полный текст без обрезания, поиск, добавление по клику;
 *  - «своя позиция» (название + цена);
 *  - итог по строкам, кнопка «Применить».
 */
function DamagePicker({
  mode,
  scooterModelId,
  title,
  subtitle,
  initial,
  onApply,
  onClose,
}: {
  mode: "scooter" | "equipment";
  scooterModelId: number | null;
  title: string;
  subtitle: string | null;
  initial: DamageLine[];
  onApply: (lines: DamageLine[]) => void;
  onClose: () => void;
}) {
  const groupsQ = useApiPriceList();
  const groups = groupsQ.data ?? [];

  // Каталог прайса в зависимости от режима.
  const catalog = useMemo(() => {
    if (mode === "equipment") {
      return groups.filter((g) => g.name.toLowerCase().includes("экипировк"));
    }
    // scooter: модельные текущей модели + общие (без экипировки)
    const own = groups.filter((g) => g.scooterModelId != null && g.scooterModelId === scooterModelId);
    const general = groups.filter(
      (g) => g.scooterModelId == null && !g.name.toLowerCase().includes("экипировк"),
    );
    const other = groups.filter((g) => g.scooterModelId != null && g.scooterModelId !== scooterModelId);
    return [...own, ...general, ...other];
  }, [groups, mode, scooterModelId]);

  const [lines, setLines] = useState<DamageLine[]>(initial);
  const [query, setQuery] = useState("");
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const total = linesTotal(lines);

  const addFromPrice = (it: { id: number; name: string; priceA: number | null }) => {
    setLines((arr) => {
      const existing = arr.find((l) => l.itemId === it.id);
      if (existing) {
        // повторный клик по той же позиции — +1 к количеству
        return arr.map((l) =>
          l.itemId === it.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...arr,
        { itemId: it.id, name: it.name, price: it.priceA ?? 0, quantity: 1, isCustom: false },
      ];
    });
  };
  const addCustom = () => {
    const p = Math.floor(Number(customPrice));
    if (!customName.trim() || !Number.isFinite(p) || p <= 0) return;
    setLines((arr) => [
      ...arr,
      { name: customName.trim(), price: p, quantity: 1, isCustom: true },
    ]);
    setCustomName("");
    setCustomPrice("");
  };
  const removeLine = (idx: number) =>
    setLines((arr) => arr.filter((_, i) => i !== idx));
  const setLinePrice = (idx: number, price: number) =>
    setLines((arr) => arr.map((l, i) => (i === idx ? { ...l, price: Math.max(0, price) } : l)));
  const setLineQty = (idx: number, delta: number) =>
    setLines((arr) =>
      arr.map((l, i) => (i === idx ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l)),
    );

  const ql = query.trim().toLowerCase();
  const filteredCatalog = catalog
    .map((g) => ({
      ...g,
      items: ql ? g.items.filter((it) => it.name.toLowerCase().includes(ql)) : g.items,
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex max-h-[88vh] w-[440px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card-lg animate-modal-in">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink">{title}</div>
            {subtitle && (
              <div className="text-[11px] text-muted-2">
                Прайс {mode === "scooter" ? "по модели" : "экипировки"} · {subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {/* Выбранные позиции — редактируемые строки */}
        {lines.length > 0 && (
          <div className="border-b border-border bg-orange-soft/15 px-4 py-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-orange-ink">
              Что списываем ({lines.length})
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-orange-200 bg-surface p-2.5 shadow-card-sm"
                >
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink break-words leading-snug">
                      {l.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="-mr-1 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-2 hover:bg-red-soft hover:text-red"
                      title="Убрать"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {/* Цена за единицу */}
                    <div className="flex items-center rounded-lg border border-border bg-surface focus-within:border-blue-600">
                      <input
                        type="number"
                        min={0}
                        value={l.price}
                        onChange={(e) => setLinePrice(i, Math.floor(Number(e.target.value)))}
                        className="h-8 w-[78px] bg-transparent px-2.5 text-right text-[13px] font-semibold tabular-nums text-ink outline-none"
                      />
                      <span className="pr-2.5 text-[11px] text-muted-2">₽</span>
                    </div>
                    {/* Количество — степпер */}
                    <div className="flex items-center rounded-lg border border-border bg-surface">
                      <button
                        type="button"
                        onClick={() => setLineQty(i, -1)}
                        disabled={l.quantity <= 1}
                        className="flex h-8 w-8 items-center justify-center rounded-l-lg text-muted-2 hover:bg-border hover:text-ink disabled:opacity-30"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-7 text-center text-[13px] font-semibold tabular-nums text-ink">
                        {l.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLineQty(i, +1)}
                        className="flex h-8 w-8 items-center justify-center rounded-r-lg text-muted-2 hover:bg-border hover:text-ink"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <span className="ml-auto text-[13px] font-bold tabular-nums text-orange-ink">
                      {fmt(lineTotal(l))} ₽
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Каталог прайса + поиск */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 focus-within:border-blue-600">
              <Search size={15} className="shrink-0 text-muted-2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по прайсу…"
                className="h-8 w-full bg-transparent text-[13px] outline-none"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {filteredCatalog.length === 0 && (
              <div className="py-2 text-[12px] text-muted-2">
                {catalog.length === 0
                  ? "Прайс пуст — добавьте свою позицию ниже."
                  : "Ничего не найдено по запросу."}
              </div>
            )}
            <div className="space-y-3">
              {filteredCatalog.map((g) => (
                <div key={g.id}>
                  <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-2">
                    {g.name}
                    {g.scooterModelId == null && mode === "scooter" && (
                      <span className="ml-1.5 normal-case text-muted-2/70">общие</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {g.items.map((it) => {
                      const added = lines.find((l) => l.itemId === it.id);
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => addFromPrice(it)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
                            added
                              ? "border-orange-300 bg-orange-soft/30"
                              : "border-border bg-surface hover:border-orange-300 hover:bg-orange-soft/15",
                          )}
                        >
                          <span className="min-w-0 flex-1 break-words leading-snug text-ink-2">
                            {it.name}
                          </span>
                          <span className="shrink-0 tabular-nums font-semibold text-ink">
                            {fmt(it.priceA ?? 0)} ₽
                          </span>
                          {added ? (
                            <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[11px] font-bold text-white">
                              ×{added.quantity}
                            </span>
                          ) : (
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-soft text-blue-600">
                              <Plus size={14} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Своя позиция */}
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-2">
                Своя позиция
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Например: разбит визор"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-[13px] outline-none focus:border-blue-600"
                />
                <input
                  type="number"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="₽"
                  className="h-9 w-20 rounded-lg border border-border bg-surface px-2.5 text-right text-[13px] tabular-nums outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={addCustom}
                  disabled={!customName.trim() || !(Number(customPrice) > 0)}
                  className="h-9 shrink-0 rounded-lg bg-blue-600 px-3 text-[12.5px] font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  Добавить
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-soft px-5 py-3">
          <div className="text-[12px] text-muted-2">
            Итого:{" "}
            <b className="text-[15px] tabular-nums text-orange-ink">{fmt(total)} ₽</b>
          </div>
          <button
            type="button"
            onClick={() => onApply(lines)}
            className="rounded-full bg-blue-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-blue-700"
          >
            {lines.length === 0 ? "Без ущерба" : "Применить"}
          </button>
        </div>
    </div>
  );
}
