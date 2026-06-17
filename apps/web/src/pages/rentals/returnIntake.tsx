import { useEffect, useMemo, useState } from "react";
import { Bike, Image as ImageIcon, X } from "lucide-react";
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
 * Здесь:
 *  - примитивы UI: ReturnItemCard, ScooterDamagePicker, EquipmentDamagePicker;
 *  - хук useReturnIntake(rental, enabled) — владеет всем состоянием приёмки
 *    (карточки позиций, повреждения, дата/пробег/судьба скутера) и считает
 *    производные (totalDamage, blocked, позиции для акта);
 *  - <ReturnIntakeSection intake={…} /> — рендер блока приёмки (без сводки
 *    по залогу — залог считается в РАСЧЁТЕ дровера).
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
export type EquipmentDamage = {
  name: string;
  amount: number;
  itemId?: number;
  isCustom: boolean;
};
export type ScooterDamage = {
  name: string;
  amount: number;
  itemId?: number;
  isCustom: boolean;
};
export type ScooterNextStatus =
  | "rental_pool"
  | "repair"
  | "for_sale"
  | "disassembly"
  | "buyout";

/** Производные данные приёмки, нужные дровер-расчёту и сабмиту. */
export type ReturnIntake = ReturnType<typeof useReturnIntake>;

/**
 * v0.9: владеет состоянием приёмки. enabled=false (обычный приём оплаты,
 * не завершение) — хук не делает запрос к скутеру и отдаёт «пустую»
 * приёмку, чтобы PaymentAcceptDialog мог вызывать хук безусловно.
 */
export function useReturnIntake(rental: Rental, enabled: boolean) {
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
  const [equipmentDamages, setEquipmentDamages] = useState<
    Record<string, EquipmentDamage>
  >({});
  const [pickerKey, setPickerKey] = useState<CardKey | null>(null);
  const [scooterDamages, setScooterDamages] = useState<ScooterDamage[]>([]);
  const [scooterPickerOpen, setScooterPickerOpen] = useState(false);
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

  const equipmentDamageTotal = equipmentCards.reduce((sum, key) => {
    if (cardStates[key] !== "problem") return sum;
    return sum + (equipmentDamages[key]?.amount ?? 0);
  }, 0);
  const scooterDamageTotal = scooterDamages.reduce((s, d) => s + d.amount, 0);
  const totalDamage = scooterDamageTotal + equipmentDamageTotal;
  const hasDamage = totalDamage > 0;

  // Все ли проблемы экипировки заполнены (выбрана позиция/сумма).
  const allEquipmentProblemsFilled = equipmentCards.every((key) => {
    if (cardStates[key] !== "problem") return true;
    const d = equipmentDamages[key];
    return !!d && d.amount > 0 && d.name.trim().length > 0;
  });

  // Кнопка «Завершить» заблокирована, пока по каждой позиции не выбрано
  // состояние и проблемы не заполнены.
  const blocked =
    !allDecided ||
    (cardStates[scooterCard] === "problem" && scooterDamages.length === 0) ||
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
    for (const d of scooterDamages) {
      items.push({
        priceItemId: d.itemId ?? null,
        name: `Скутер: ${d.name}`,
        originalPrice: d.amount,
        finalPrice: d.amount,
        quantity: 1,
        comment: null,
      });
    }
    for (const [key, state] of Object.entries(cardStates)) {
      if (key === "scooter" || state !== "problem") continue;
      const damage = equipmentDamages[key];
      if (!damage || damage.amount <= 0) continue;
      const idx = Number(key.split("-")[1]);
      const eqName = equipmentList[idx]?.name ?? "Экипировка";
      items.push({
        priceItemId: damage.itemId ?? null,
        name: `Экипировка «${eqName}»: ${damage.name}`,
        originalPrice: damage.amount,
        finalPrice: damage.amount,
        quantity: 1,
        comment: null,
      });
    }
    return items;
  };

  // Краткие строки ущерба для блока расчёта.
  const damageLines = useMemo(() => {
    const lines: { label: string; amount: number }[] = [];
    for (const d of scooterDamages) {
      lines.push({ label: `Скутер: ${d.name}`, amount: d.amount });
    }
    for (const key of equipmentCards) {
      if (cardStates[key] !== "problem") continue;
      const d = equipmentDamages[key];
      if (!d) continue;
      const eqName = equipmentList[Number(key.split("-")[1])]?.name ?? "Экипировка";
      lines.push({ label: `${eqName}: ${d.name}`, amount: d.amount });
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scooterDamages, equipmentCards, cardStates, equipmentDamages, equipmentList]);

  return {
    enabled,
    rental,
    // state + setters
    cardStates,
    setCardStates,
    equipmentDamages,
    setEquipmentDamages,
    pickerKey,
    setPickerKey,
    scooterDamages,
    setScooterDamages,
    scooterPickerOpen,
    setScooterPickerOpen,
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

/**
 * v0.9: блок приёмки позиций — карточки (скутер + экипировка), дата/пробег,
 * судьба скутера, пикеры. Без сводки по залогу (она в расчёте дровера).
 */
export function ReturnIntakeSection({ intake }: { intake: ReturnIntake }) {
  const {
    rental,
    cardStates,
    setCardStates,
    equipmentDamages,
    setEquipmentDamages,
    pickerKey,
    setPickerKey,
    scooterDamages,
    setScooterDamages,
    scooterPickerOpen,
    setScooterPickerOpen,
    returnDate,
    setReturnDate,
    mileageAtReturn,
    setMileageAtReturn,
    scooterNextStatus,
    setScooterNextStatus,
    setScooterStatusTouched,
    scooter,
    scooterModel,
    scooterAvatar,
    equipmentItems,
    equipmentList,
    currentMileage,
    scooterCard,
  } = intake;

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
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
          Приёмка позиций
        </div>
        {/* Скутер — основная позиция, во всю ширину */}
        <ReturnItemCard
          title={rental.scooter}
          subtitle={scooterModel?.name ?? rental.scooter}
          imageUrl={scooterAvatar}
          fallbackIcon="scooter"
          state={scooterState}
          size="large"
          damageInfo={
            scooterState === "problem" && scooterDamages.length > 0
              ? scooterDamages.length === 1
                ? `${scooterDamages[0]!.name} — ${fmt(scooterDamages[0]!.amount)} ₽`
                : `${scooterDamages.length} позиций — ${fmt(scooterDamages.reduce((a, b) => a + b.amount, 0))} ₽`
              : undefined
          }
          onSetOk={() => {
            setCardStates((s) => ({ ...s, [scooterCard]: "ok" }));
            setScooterDamages([]);
          }}
          onSetProblem={() => {
            setCardStates((s) => ({ ...s, [scooterCard]: "problem" }));
            setScooterPickerOpen(true);
          }}
          onEditProblem={() => setScooterPickerOpen(true)}
        />
        {/* Экипировка — компактная сетка 2 колонки */}
        {equipmentList.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {equipmentList.map((eq, i) => {
              const key = `equipment-${i}` as CardKey;
              const damage = equipmentDamages[key];
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
                    cardStates[key] === "problem" && damage
                      ? `${damage.name} — ${fmt(damage.amount)} ₽`
                      : undefined
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
                    setPickerKey(key);
                  }}
                  onEditProblem={() => setPickerKey(key)}
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
            Пробег, км <span className="text-muted-2/70 normal-case">опц.</span>
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
        </div>
      </div>
      {currentMileage != null && mileageAtReturn && (
        <div className="-mt-2 text-[11px] text-muted-2">
          {Number(mileageAtReturn) > currentMileage && (
            <>
              Пробег скутера обновится:{" "}
              <b className="text-ink tabular-nums">
                {currentMileage.toLocaleString("ru-RU")}
              </b>{" "}
              →{" "}
              <b className="text-ink tabular-nums">
                {Number(mileageAtReturn).toLocaleString("ru-RU")}
              </b>{" "}
              км (+{(Number(mileageAtReturn) - currentMileage).toLocaleString("ru-RU")}).
            </>
          )}
          {Number(mileageAtReturn) > 0 &&
            Number(mileageAtReturn) < currentMileage && (
              <span className="text-orange-ink">
                ⚠ Введённое значение меньше текущего ({currentMileage.toLocaleString("ru-RU")} км) — изменение игнорируется.
              </span>
            )}
        </div>
      )}

      {/* v0.6.1: выбор статуса скутера после завершения */}
      {rental.scooterId != null && (
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
            Что делать со скутером?
          </label>
          <select
            value={scooterNextStatus}
            onChange={(e) => {
              setScooterStatusTouched(true);
              setScooterNextStatus(e.target.value as ScooterNextStatus);
            }}
            className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
          >
            <option value="rental_pool">Готов к аренде (в парк)</option>
            <option value="repair">В ремонт</option>
            <option value="for_sale">Выставить на продажу</option>
            <option value="disassembly">На разборку</option>
            <option value="buyout">Передать клиенту в выкуп</option>
          </select>
          <div className="mt-1 text-[10.5px] text-muted-2">
            По умолчанию — назад в парк. При ущербе обычно выбирают «В ремонт».
          </div>
        </div>
      )}

      {/* Picker позиций экипировки из прайса */}
      {pickerKey && pickerKey !== "scooter" && (
        <EquipmentDamagePicker
          onClose={() => {
            const closingKey = pickerKey;
            setPickerKey(null);
            if (closingKey && !equipmentDamages[closingKey]) {
              setCardStates((s) => {
                const next = { ...s };
                delete next[closingKey];
                return next;
              });
            }
          }}
          presetName={equipmentList[Number(pickerKey.split("-")[1])]?.name ?? null}
          onPick={(picked) => {
            const k = pickerKey;
            setEquipmentDamages((m) => ({ ...m, [k]: picked }));
            setPickerKey(null);
          }}
        />
      )}

      {/* Picker повреждений скутера (multi-select из прайса) */}
      {scooterPickerOpen && (
        <ScooterDamagePicker
          scooterModelId={scooter?.modelId ?? null}
          modelName={scooterModel?.name ?? null}
          initial={scooterDamages}
          onClose={() => {
            setScooterPickerOpen(false);
            if (scooterDamages.length === 0) {
              setCardStates((s) => {
                const next = { ...s };
                delete next[scooterCard];
                return next;
              });
            }
          }}
          onApply={(damages) => {
            setScooterDamages(damages);
            setScooterPickerOpen(false);
            if (damages.length === 0) {
              setCardStates((s) => {
                const next = { ...s };
                delete next[scooterCard];
                return next;
              });
            }
          }}
        />
      )}
    </div>
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
  const tone =
    state === "ok"
      ? "border-emerald-400 ring-1 ring-emerald-200/60 bg-emerald-50/40"
      : state === "problem"
        ? "border-orange-400 ring-1 ring-orange-200/60 bg-orange-soft/30"
        : "border-border bg-surface hover:border-blue-300";
  const isCompact = size === "compact";
  const imageSize = isCompact ? "h-12 w-12" : "h-14 w-14";
  const padding = isCompact ? "p-2.5" : "p-3";
  const titleSize = isCompact ? "text-[13px]" : "text-[14px]";
  const buttonHeight = isCompact ? "h-8" : "h-9";
  const buttonText = isCompact ? "text-[11.5px]" : "text-[12.5px]";
  return (
    <div className={cn("rounded-xl border transition-all", padding, tone)}>
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            "shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1 flex",
            imageSize,
            state === "ok"
              ? "ring-emerald-200 bg-emerald-50"
              : state === "problem"
                ? "ring-orange-200 bg-orange-soft/40"
                : "ring-border bg-surface-soft",
          )}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full bg-white object-contain" />
          ) : fallbackIcon === "scooter" ? (
            <Bike size={isCompact ? 22 : 26} className="text-muted-2" strokeWidth={1.5} />
          ) : (
            <ImageIcon size={isCompact ? 18 : 22} className="text-muted-2" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("font-semibold text-ink truncate leading-tight", titleSize)}>
            {title}
          </div>
          {subtitle && (
            <div className="text-[11px] text-muted-2 truncate">{subtitle}</div>
          )}
        </div>
      </div>
      <div className={cn("flex gap-1.5", isCompact ? "mt-2" : "mt-3 gap-2")}>
        <button
          type="button"
          onClick={onSetOk}
          className={cn(
            "flex-1 rounded-lg border font-semibold transition-colors",
            buttonHeight,
            buttonText,
            state === "ok"
              ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
              : "border-border bg-surface text-ink-2 hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700",
          )}
        >
          {isCompact ? "ОК" : "Без ущерба"}
        </button>
        <button
          type="button"
          onClick={onSetProblem}
          className={cn(
            "flex-1 rounded-lg border font-semibold transition-colors",
            buttonHeight,
            buttonText,
            state === "problem"
              ? "border-orange-500 bg-orange-500 text-white shadow-sm"
              : "border-border bg-surface text-ink-2 hover:border-orange-400 hover:bg-orange-soft/40 hover:text-orange-700",
          )}
        >
          {isCompact ? "Ущерб" : "Есть ущерб"}
        </button>
      </div>
      {state === "problem" && damageInfo && (
        <button
          type="button"
          onClick={onEditProblem}
          className={cn(
            "flex w-full items-center justify-between rounded-lg bg-orange-soft/50 px-2.5 py-1.5 text-orange-ink hover:bg-orange-soft/80",
            isCompact ? "mt-1.5 text-[11px]" : "mt-2.5 text-[12px]",
          )}
        >
          <span className="truncate font-semibold">{damageInfo}</span>
          <span className="ml-2 shrink-0 text-[10px] underline opacity-80">
            изменить
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * v0.4.66: picker повреждений скутера. Multi-select из прайса (группы
 * текущей модели + общие «Повреждения»/«Штрафы») + опция «свой вариант».
 */
export function ScooterDamagePicker({
  scooterModelId,
  modelName,
  initial,
  onApply,
  onClose,
}: {
  scooterModelId: number | null;
  modelName: string | null;
  initial: { name: string; amount: number; itemId?: number; isCustom: boolean }[];
  onApply: (damages: { name: string; amount: number; itemId?: number; isCustom: boolean }[]) => void;
  onClose: () => void;
}) {
  const groupsQ = useApiPriceList();
  const groups = groupsQ.data ?? [];
  const ownGroups = groups.filter(
    (g) => g.scooterModelId != null && g.scooterModelId === scooterModelId,
  );
  const generalGroups = groups.filter(
    (g) => g.scooterModelId == null && !g.name.toLowerCase().includes("экипировк"),
  );
  const otherModelGroups = groups.filter(
    (g) => g.scooterModelId != null && g.scooterModelId !== scooterModelId,
  );
  const visibleGroups = [...ownGroups, ...generalGroups, ...otherModelGroups];

  const [selected, setSelected] = useState(initial);
  const [customName, setCustomName] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const total = selected.reduce((s, d) => s + d.amount, 0);

  const isPicked = (itemId: number) => selected.some((s) => s.itemId === itemId);
  const togglePrice = (it: { id: number; name: string; priceA: number | null }) => {
    if (isPicked(it.id)) {
      setSelected((arr) => arr.filter((d) => d.itemId !== it.id));
    } else {
      setSelected((arr) => [
        ...arr,
        { itemId: it.id, name: it.name, amount: it.priceA ?? 0, isCustom: false },
      ]);
    }
  };
  const addCustom = () => {
    const amt = Math.floor(Number(customAmount));
    if (!customName.trim() || !Number.isFinite(amt) || amt <= 0) return;
    setSelected((arr) => [
      ...arr,
      { name: customName.trim(), amount: amt, isCustom: true },
    ]);
    setCustomName("");
    setCustomAmount("");
  };
  const removeCustom = (idx: number) => {
    setSelected((arr) => arr.filter((_, i) => i !== idx));
  };

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-ink/55 p-6 backdrop-blur-sm animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[560px] flex-col rounded-2xl bg-surface shadow-card-lg animate-modal-in"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "85vh" }}
      >
        <div className="flex items-center gap-3 rounded-t-2xl border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink">
              Повреждения скутера
            </div>
            {modelName && (
              <div className="text-[11px] text-muted-2">
                Прайс по модели · {modelName}
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
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {visibleGroups.length === 0 && (
            <div className="text-[12px] text-muted-2">
              Прайс пуст. Используй «свой вариант» ниже.
            </div>
          )}
          {visibleGroups.map((g) => (
            <div key={g.id}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2 mb-1.5">
                {g.name}
                {g.scooterModelId == null && (
                  <span className="ml-2 normal-case text-muted-2/70">общие</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {g.items.map((it) => {
                  const picked = isPicked(it.id);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => togglePrice(it)}
                      className={cn(
                        "flex items-center justify-between rounded-lg border px-3 py-2 text-[12.5px] transition-all",
                        picked
                          ? "border-orange-500 bg-orange-soft/40 text-orange-ink shadow-sm"
                          : "border-border bg-surface text-ink-2 hover:border-orange-300 hover:bg-orange-soft/20",
                      )}
                    >
                      <span className="truncate text-left">{it.name}</span>
                      <span className="ml-2 shrink-0 tabular-nums font-semibold">
                        {(it.priceA ?? 0).toLocaleString("ru-RU")} ₽
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {/* Custom */}
          <div className="border-t border-border pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2 mb-1.5">
              Свой вариант
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Описание (например: разбит фонарь)"
                className="h-9 flex-1 rounded-lg border border-border bg-surface px-3 text-[12.5px] outline-none focus:border-blue-600"
              />
              <input
                type="number"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="₽"
                className="h-9 w-24 rounded-lg border border-border bg-surface px-3 text-[12.5px] tabular-nums outline-none focus:border-blue-600"
              />
              <button
                type="button"
                onClick={addCustom}
                disabled={!customName.trim() || !(Number(customAmount) > 0)}
                className="h-9 rounded-lg bg-blue-600 px-3 text-[12.5px] font-semibold text-white disabled:opacity-40"
              >
                Добавить
              </button>
            </div>
            {selected.filter((s) => s.isCustom).length > 0 && (
              <div className="mt-2 space-y-1">
                {selected
                  .map((s, i) => ({ s, i }))
                  .filter((x) => x.s.isCustom)
                  .map(({ s, i }) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-orange-soft/40 px-3 py-1.5 text-[12px]"
                    >
                      <span className="truncate text-orange-ink">{s.name}</span>
                      <span className="ml-2 flex shrink-0 items-center gap-2">
                        <span className="tabular-nums font-semibold text-orange-ink">
                          {s.amount.toLocaleString("ru-RU")} ₽
                        </span>
                        <button
                          type="button"
                          onClick={() => removeCustom(i)}
                          className="text-orange-ink/70 hover:text-orange-ink"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-b-2xl border-t border-border bg-surface-soft px-5 py-3">
          <div className="text-[12px] text-muted-2">
            Выбрано: <b className="text-ink">{selected.length}</b> · итого{" "}
            <b className="text-ink tabular-nums">{total.toLocaleString("ru-RU")} ₽</b>
          </div>
          <button
            type="button"
            onClick={() => onApply(selected)}
            disabled={selected.length === 0}
            className="rounded-full bg-blue-600 px-5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * v0.4.62: модалка-пикер позиции из прайс-листа (группа «Экипировка»)
 * для фиксации ущерба по конкретной экипировке. Также позволяет
 * добавить «свой вариант» (название + сумма).
 */
export function EquipmentDamagePicker({
  presetName,
  onPick,
  onClose,
}: {
  presetName: string | null;
  onPick: (d: {
    name: string;
    amount: number;
    itemId?: number;
    isCustom: boolean;
  }) => void;
  onClose: () => void;
}) {
  const groupsQ = useApiPriceList();
  const groups = groupsQ.data ?? [];
  const equipGroup = groups.find((g) => g.name.toLowerCase().includes("экипировк"));
  const items = equipGroup?.items ?? [];
  const [customName, setCustomName] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-ink/55 p-6 backdrop-blur-sm animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] overflow-hidden rounded-2xl bg-surface shadow-card-lg animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
            Что с {presetName ? `«${presetName}»` : "экипировкой"}?
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2 mb-2">
            Позиции прайса
          </div>
          {items.length === 0 ? (
            <div className="py-2 text-[12px] text-muted-2">
              Прайс-лист пуст или группа «Экипировка» не найдена. Используй
              «свой вариант» ниже.
            </div>
          ) : (
            <div className="space-y-1">
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() =>
                    onPick({
                      name: it.name,
                      amount: it.priceA ?? 0,
                      itemId: it.id,
                      isCustom: false,
                    })
                  }
                  className="flex w-full items-center justify-between rounded-[8px] border border-border bg-surface px-3 py-2 text-[13px] hover:border-blue-600 hover:bg-blue-soft"
                >
                  <span className="truncate text-left">{it.name}</span>
                  <span className="tabular-nums font-semibold text-ink shrink-0 ml-2">
                    {(it.priceA ?? 0).toLocaleString("ru-RU")} ₽
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 border-t border-border pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2 mb-2">
              Свой вариант
            </div>
            <div className="space-y-2">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Например: разбит визор шлема"
                className="h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] outline-none focus:border-blue-600"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="Сумма ₽"
                  className="h-9 w-32 rounded-[10px] border border-border bg-surface px-3 text-[13px] tabular-nums outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  disabled={!customName.trim() || !(Number(customAmount) > 0)}
                  onClick={() =>
                    onPick({
                      name: customName.trim(),
                      amount: Math.floor(Number(customAmount)),
                      isCustom: true,
                    })
                  }
                  className="h-9 flex-1 rounded-[10px] bg-blue-600 text-white text-[13px] font-semibold disabled:opacity-40"
                >
                  Применить
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
