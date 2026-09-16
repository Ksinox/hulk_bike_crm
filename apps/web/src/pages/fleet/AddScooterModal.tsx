import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  HandCoins,
  HelpCircle,
  History,
  Key,
  Loader2,
  Minus,
  Plus,
  Tag,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCan } from "@/lib/permissions";
import { useRole } from "@/lib/role";
import { useIsMobile } from "@/lib/useIsMobile";
import { usePersistedFormState } from "@/lib/usePersistedState";
import { toast, confirmDialog } from "@/lib/toast";
import { fileUrl } from "@/lib/files";
import { ApiError } from "@/lib/api";
import {
  modelForRent,
  modelForSale,
  useApiScooterModels,
  type ApiScooterModel,
} from "@/lib/api/scooter-models";
import { useApiInvestors } from "@/lib/api/investors";
import {
  useAddScootersBatch,
  useApiScootersWithArchive,
  undoScootersBatch,
  useRentalSlots,
  useSetSlotsTotal,
  type BatchInput,
  type BatchRowError,
} from "@/lib/api/scooters";
import { ModelPicker } from "./ModelPicker";
import { scooterModelName } from "@/components/ScooterName";
import { rankSuggestions } from "@/components/SuggestInput";
import { TABLET_WIZARD_PANEL, TABLET_WIZARD_PANEL_WIDE } from "@/mobile/tablet";
import {
  ADD_SCOOTER_REOPEN_EVENT,
  MAX_UNITS,
  addScooterDraftKey,
  assignSlots,
  buildVinProfile,
  draftHasData,
  emptyDraft,
  fmtMoney,
  formatRanges,
  holdsSlot,
  lastModelPrice,
  newRow,
  normalizeVin,
  plural,
  requestAddScooterReopen,
  resizeRows,
  resolveRow,
  rowHasData,
  statusOf,
  validateRows,
  vinFormatWarning,
  type Category,
  type Draft,
  type FleetVinInfo,
  type RentalState,
  type RowIssue,
  type UnitRow,
} from "./addScooterDraft";
import { PasteListDialog, UnitsEditor, applyGrid, columnsFor, type ColKey } from "./AddScooterUnits";

/**
 * «Новая техника» — мастер добавления (релиз 2.0.1, правки заказчика 16.09).
 *
 * 1. Категория — первым шагом: от неё зависит всё остальное. На продажу —
 *    без арендного номера и тарифов, с ценой продажи; в аренду — номер и
 *    рыночная стоимость для договора.
 * 2. Модель и партия — модель из тех, что под эту категорию, количество,
 *    номер партии, дата и цена закупа — один раз на всю партию.
 * 3. Единицы — своё у каждой: рама, двигатель, пробег (таблицей или
 *    карточками), общее подставляется из строки «Для всех».
 * 4. Проверка — итог с номерами и суммами, потом одна транзакция на сервере.
 *
 * Черновик переживает обновление страницы и закрытие окна.
 */

const STEPS = ["Категория", "Модель и партия", "Единицы", "Проверка"] as const;
/** Для строки шагов на компьютере — коротко, чтобы не обрезалось. */
const STEPS_SHORT = ["Категория", "Модель", "Единицы", "Проверка"] as const;

const CATEGORY_CARDS: {
  id: Category;
  title: string;
  lead: string;
  points: string[];
  icon: typeof Key;
}[] = [
  {
    id: "rental",
    title: "В аренду",
    lead: "Сдаём клиентам",
    points: ["получит арендный номер", "модели — из тех, что сдаём", "рыночная стоимость — в договор"],
    icon: Key,
  },
  {
    id: "sale",
    title: "На продажу",
    lead: "Выставляем на витрину",
    points: ["без арендного номера и тарифов", "модели — из тех, что продаём", "цена продажи — сразу в «Продажи»"],
    icon: Tag,
  },
  {
    id: "buyout",
    title: "В выкуп",
    lead: "Клиент выкупает по графику",
    points: ["без арендного номера", "договор выкупа — в разделе «Выкуп»"],
    icon: HandCoins,
  },
  {
    id: "unassigned",
    title: "Пока не решили",
    lead: "Определимся позже",
    points: ["попадёт в «Не распределены»", "категорию можно выбрать потом"],
    icon: HelpCircle,
  },
];

const RENTAL_STATES: { value: RentalState; label: string }[] = [
  { value: "rental_pool", label: "Готов к аренде" },
  { value: "repair", label: "На ремонте" },
  { value: "dtp", label: "ДТП" },
  { value: "disassembly", label: "В разборке" },
];

const CATEGORY_TITLE: Record<Category, string> = {
  rental: "В аренду",
  sale: "На продажу",
  buyout: "В выкуп",
  unassigned: "Пока не решили",
};

/**
 * Раздел, где есть кнопка «Добавить», снова открывает окно после «Отменить»
 * в тосте — черновик уже лежит на месте.
 */
export function useAddScooterReopen(draftKey: string, open: () => void) {
  const cb = useRef(open);
  cb.current = open;
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<{ draftKey: string }>).detail?.draftKey === draftKey) cb.current();
    };
    window.addEventListener(ADD_SCOOTER_REOPEN_EVENT, on);
    return () => window.removeEventListener(ADD_SCOOTER_REOPEN_EVENT, on);
  }, [draftKey]);
}
export { addScooterDraftKey };

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function AddScooterModal({
  onClose,
  partner = false,
  defaultInvestorId,
  defaultCategory,
  skipCategory = false,
}: {
  onClose: () => void;
  /**
   * Правка 27.08: техника добавляется прямо из «Партнёрки». В этом режиме
   * единица всегда партнёрская, обязателен инвестор (его процент техника
   * наследует автоматически), модели — только электро.
   */
  partner?: boolean;
  /** Из карточки инвестора — он уже выбран. */
  defaultInvestorId?: number;
  /** Открыли из режима «Продажа»/«Аренда» — категория выбрана заранее. */
  defaultCategory?: Category;
  /**
   * Категория уже решена самим местом (кнопка «Добавить на продажу» в
   * «Продажах») — сразу шаг «Модель и партия».
   */
  skipCategory?: boolean;
}) {
  const isMobile = useIsMobile();
  const touch = isMobile;
  const role = useRole();
  const canProfit = useCan("data.profit");
  const showPurchase = role === "director" && canProfit;

  const draftKey = addScooterDraftKey(partner, defaultInvestorId);
  const freshDraft = () => {
    const d = emptyDraft(defaultCategory ?? (partner ? "rental" : null));
    if (defaultInvestorId != null) d.investorId = defaultInvestorId;
    if (skipCategory && defaultCategory) d.step = 1;
    return d;
  };
  const [draft, setDraft, clearDraft] = usePersistedFormState<Draft>(draftKey, freshDraft, {
    storage: "local",
    version: 1,
  });
  const [restoredAt, setRestoredAt] = useState<number | null>(() =>
    draftHasData(draft) ? draft.savedAt : null,
  );
  const patch = (p: Partial<Draft>) =>
    setDraft((d) => ({ ...d, ...p, savedAt: Date.now() }));

  const { data: models = [] } = useApiScooterModels();
  const fleetQ = useApiScootersWithArchive();
  const fleet = fleetQ.data ?? [];
  const slotsQ = useRentalSlots();
  const freeSlots = slotsQ.data?.free ?? [];
  const slotsTotal = slotsQ.data?.total ?? 0;
  const setSlotsTotal = useSetSlotsTotal();
  const { data: investorsData } = useApiInvestors();
  const investors = investorsData?.items ?? [];
  const addBatch = useAddScootersBatch();

  const [closing, setClosing] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [serverIssues, setServerIssues] = useState<Record<string, RowIssue[]>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bodyRef, bodyWidth] = useElementWidth<HTMLDivElement>();

  const { step, category, rows, common } = draft;
  const model = models.find((m) => m.id === draft.modelId) ?? null;
  const status = category ? statusOf(category, draft.rentalState) : "ready";
  const holds = holdsSlot(status);
  const purpose: "rent" | "sale" | null =
    category === "rental" ? "rent" : category === "sale" ? "sale" : null;
  const modelFits =
    !!model && (!purpose || (purpose === "rent" ? modelForRent(model) : modelForSale(model)));

  // Модель, выбранная под другую категорию, не подходит, пока её не
  // выбрали заново (или не подтвердили «Другие модели»).
  const [otherModelOk, setOtherModelOk] = useState(false);

  const fleetVins = useMemo(() => {
    const map = new Map<string, FleetVinInfo>();
    for (const s of fleet) {
      if (!s.vin) continue;
      const m = models.find((x) => x.id === s.modelId);
      const label = `${m?.name ?? scooterModelName(s.name)}${
        s.rentalSlot != null ? ` №${s.rentalSlot}` : s.uid ? ` · ID ${s.uid}` : ""
      }`;
      map.set(normalizeVin(s.vin), {
        label,
        where: s.archivedAt || s.deletedAt ? "archive" : "",
      });
    }
    return map;
  }, [fleet, models]);

  const recentBatches = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of [...fleet].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))) {
      const b = s.purchaseBatch?.trim();
      if (b && !seen.has(b)) seen.set(b, s.createdAt ?? "");
      if (seen.size >= 4) break;
    }
    return [...seen.keys()];
  }, [fleet]);

  // 16.09: цвет — подсказки из парка и из того, что уже вписали в эту партию.
  const colorSuggestions = useMemo(
    () => rankSuggestions([...fleet.map((s) => s.color), common.color, ...rows.map((r) => r.color)]),
    [fleet, common.color, rows],
  );

  // Какие рамы обычно у этой модели — по технике в базе (2.0.1).
  const vinProfile = useMemo(
    () =>
      model
        ? buildVinProfile(
            model.name,
            fleet.filter((s) => s.modelId === model.id).map((s) => s.vin),
          )
        : null,
    [model, fleet],
  );

  const localIssues = useMemo(
    () =>
      validateRows({
        rows,
        common,
        fleetVins,
        holds,
        freeSlots,
        slotsTotal,
        vinProfile,
      }),
    [rows, common, fleetVins, holds, freeSlots, slotsTotal, vinProfile],
  );
  const issues = useMemo(() => {
    const m = new Map(localIssues);
    for (const [k, list] of Object.entries(serverIssues)) {
      m.set(k, [...(m.get(k) ?? []), ...list]);
    }
    return m;
  }, [localIssues, serverIssues]);
  const blockingCount = [...issues.values()].flat().filter((x) => x.blocking).length;

  const slotPlan = useMemo(
    () => (holds ? assignSlots(rows, freeSlots) : rows.map(() => null)),
    [holds, rows, freeSlots],
  );
  const autoRows = rows.filter((r) => r.slot == null).length;
  const explicitFree = rows.filter((r) => r.slot != null && freeSlots.includes(r.slot)).length;
  const autoPool = freeSlots.length - explicitFree;
  const slotsShort = holds ? Math.max(0, autoRows - autoPool) : 0;
  const leftAfter = holds ? Math.max(0, freeSlots.length - rows.length) : null;

  const purchaseNum = draft.purchasePrice ? Number(draft.purchasePrice) : null;
  const resolved = useMemo(() => rows.map((r) => resolveRow(r, common)), [rows, common]);
  const withoutVin = resolved.filter((r) => !r.vin).length;
  const oddVinRows = resolved
    .map((r, i) => (r.vin && vinFormatWarning(r.vin, vinProfile) ? i + 1 : null))
    .filter((x): x is number => x != null);
  const priced = resolved.filter((r) => r.price !== "");
  const priceSum = priced.reduce((s, r) => s + Number(r.price), 0);

  /* ── переходы ── */
  const stepValid = [
    !!category,
    !!model &&
      (modelFits || otherModelOk) &&
      rows.length >= 1 &&
      slotsShort === 0 &&
      (!partner || draft.investorId != null) &&
      !slotsQ.isLoading,
    blockingCount === 0 && slotsShort === 0,
    blockingCount === 0 && slotsShort === 0 && !!model,
  ];
  const stepHint = [
    "Выберите, куда добавляем технику",
    !model
      ? "Выберите модель"
      : !(modelFits || otherModelOk)
        ? "Выберите модель заново"
        : slotsShort > 0
          ? `Не хватает ${slotsShort} ${plural(slotsShort, ["номера", "номеров", "номеров"])}`
          : partner && draft.investorId == null
            ? "Выберите инвестора"
            : "",
    blockingCount > 0
      ? `Исправьте ${blockingCount} ${plural(blockingCount, ["ошибку", "ошибки", "ошибок"])}`
      : slotsShort > 0
        ? "Не хватает арендных номеров"
        : "",
    "",
  ];

  const goStep = (s: Draft["step"]) => {
    setSubmitError(null);
    if (s === 2 && model && category) {
      // Цена «для всех» — последняя по модели, пока её не вписали сами.
      const untouched =
        common.price === "" ||
        (draft.pricePrefill != null && common.price === String(draft.pricePrefill));
      if (untouched) {
        const last = lastModelPrice(fleet, model.id, category);
        patch({
          step: s,
          common: { ...common, price: last != null ? String(last) : "" },
          pricePrefill: last,
        });
        requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
        return;
      }
    }
    patch({ step: s });
    requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
  };
  const next = () => {
    if (!stepValid[step]) return;
    if (step < 3) goStep((step + 1) as Draft["step"]);
    else void submit();
  };
  const back = () => {
    if (step === 0) requestClose();
    else goStep((step - 1) as Draft["step"]);
  };

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

  /* ── строки ── */
  const setRows = (updater: (rows: UnitRow[]) => UnitRow[]) =>
    setDraft((d) => {
      const nextRows = updater(d.rows);
      return { ...d, rows: nextRows, count: nextRows.length, savedAt: Date.now() };
    });
  const clearServerIssue = (key: string) =>
    setServerIssues((m) => {
      if (!m[key]) return m;
      const n = { ...m };
      delete n[key];
      return n;
    });
  const onRowChange = (key: string, p: Partial<UnitRow>) => {
    clearServerIssue(key);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  };
  const onRemoveRow = async (key: string) => {
    const row = rows.find((r) => r.key === key);
    if (row && rowHasData(row)) {
      const i = rows.indexOf(row);
      const ok = await confirmDialog({
        title: `Убрать единицу ${i + 1}?`,
        message: "Введённые в ней данные пропадут.",
        confirmText: "Убрать",
        danger: true,
      });
      if (!ok) return;
    }
    clearServerIssue(key);
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  };
  const setCount = async (n: number) => {
    const target = Math.max(1, Math.min(MAX_UNITS, n));
    if (target < rows.length) {
      const lost = rows.slice(target).filter(rowHasData).length;
      if (lost > 0) {
        const ok = await confirmDialog({
          title: `Оставить ${target} ${plural(target, ["единицу", "единицы", "единиц"])}?`,
          message: `У ${lost} из убираемых уже введены данные — они пропадут.`,
          confirmText: "Оставить",
          danger: true,
        });
        if (!ok) return;
      }
    }
    setRows((rs) => resizeRows(rs, target));
  };
  const cols = category ? columnsFor(category) : [];
  const pasteGrid = (rowIndex: number, col: ColKey, grid: string[][]) => {
    const res = applyGrid(rows, cols, rowIndex, col, grid, newRow);
    setServerIssues({});
    setRows(() => res.rows);
    toast.success(
      `Вставлено ${res.filled} ${plural(res.filled, ["строка", "строки", "строк"])}`,
      res.cut > 0 ? `Ещё ${res.cut} не поместились: в одной партии до ${MAX_UNITS} единиц.` : undefined,
    );
  };

  const addSlots = async () => {
    const target = slotsTotal + slotsShort;
    const ok = await confirmDialog({
      title: `Добавить ${slotsShort} ${plural(slotsShort, ["номер", "номера", "номеров"])}?`,
      message: `Всего арендных номеров станет ${target} (было ${slotsTotal}). Это же число меняется на странице «Скутеры».`,
      confirmText: `Сделать ${target}`,
    });
    if (!ok) return;
    try {
      await setSlotsTotal.mutateAsync(target);
    } catch (e) {
      toast.error("Не удалось изменить количество номеров", (e as Error).message);
    }
  };

  const startOver = async () => {
    const ok = await confirmDialog({
      title: "Начать заново?",
      message: "Черновик с введёнными данными удалится.",
      confirmText: "Начать заново",
      danger: true,
    });
    if (!ok) return;
    setDraft(freshDraft());
    setServerIssues({});
    setRestoredAt(null);
    setOtherModelOk(false);
  };

  /* ── отправка ── */
  const submit = async () => {
    if (!model || !category) return;
    setSubmitError(null);
    const body: BatchInput = {
      modelId: model.id,
      baseStatus: status,
      purchaseBatch: draft.batch.trim() || null,
      purchaseDate: draft.purchaseDate || null,
      purchasePrice: showPurchase && purchaseNum != null ? purchaseNum : null,
      isPartner: partner,
      investorId: partner ? draft.investorId : null,
      enableModelPurpose: !modelFits,
      units: rows.map((r) => {
        const v = resolveRow(r, common);
        return {
          vin: v.vin || null,
          engineNo: v.engineNo || null,
          year: v.year ? Number(v.year) : null,
          color: v.color || null,
          mileage: v.mileage ? Number(v.mileage) : 0,
          rentalSlot: holds ? r.slot : null,
          marketValue: category !== "sale" && v.price ? Number(v.price) : null,
          salePrice: category === "sale" && v.price ? Number(v.price) : null,
          note: v.note || null,
        };
      }),
    };
    // Снимок черновика — вернуть его, если нажмут «Отменить».
    const snapshot: Draft = { ...draft, step: 2, savedAt: Date.now() };
    try {
      const res = await addBatch.mutateAsync(body);
      const items = res.items;
      const n = items.length;
      const slots = items.map((s) => s.rentalSlot).filter((x): x is number => x != null);
      const what = `${n} ${plural(n, ["единица", "единицы", "единиц"])} · ${model.name}`;
      toast.action({
        title: `Добавлено: ${what}`,
        message:
          [
            slots.length ? `Номера ${formatRanges(slots)}` : null,
            category === "sale" ? "Уже в «Продажи → В продаже»" : null,
            body.purchaseBatch ? `партия «${body.purchaseBatch}»` : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
        actionLabel: "Отменить",
        onAction: async () => {
          try {
            await undoScootersBatch(items.map((s) => s.id));
            try {
              localStorage.setItem(`hulk-draft:${draftKey}:v1`, JSON.stringify(snapshot));
            } catch {
              /* хранилище недоступно — данные придётся ввести заново */
            }
            toast.success(
              "Добавление отменено",
              slots.length
                ? `Номера ${formatRanges(slots)} снова свободны. Данные — в черновике, поправьте и добавьте снова.`
                : "Данные — в черновике, поправьте и добавьте снова.",
            );
            requestAddScooterReopen(draftKey);
          } catch (e) {
            toast.error("Не удалось отменить", (e as Error).message);
          }
        },
      });
      clearDraft();
      requestClose();
    } catch (e) {
      const err = e as ApiError;
      const b = (err?.body ?? null) as { error?: string; rows?: BatchRowError[] } | null;
      if (b?.rows?.length) {
        const map: Record<string, RowIssue[]> = {};
        for (const r of b.rows) {
          const row = rows[r.index];
          if (!row) continue;
          const field = (r.field === "rentalSlot" ? "slot" : r.field) as keyof UnitRow;
          (map[row.key] ??= []).push({ field, message: r.message, blocking: true });
        }
        setServerIssues(map);
        goStep(2);
      }
      setSubmitError(err?.message || "Не удалось добавить технику");
    }
  };

  /* ── вёрстка ── */
  const tableMode = step === 2 && bodyWidth >= 880;
  const wide = step === 2 && (!isMobile || bodyWidth >= 880 || (typeof window !== "undefined" && window.innerWidth >= 1024));
  const title = partner ? "Техника инвестора" : "Новая техника";

  const body = (
    <>
      {restoredAt != null && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          <History size={14} className="shrink-0" />
          <span className="min-w-0 flex-1">
            Продолжаем черновик от{" "}
            {new Date(restoredAt).toLocaleString("ru-RU", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <button
            type="button"
            onClick={startOver}
            className={cn(
              "rounded-full border border-amber-300 bg-white px-3 font-semibold text-amber-900 hover:bg-amber-100",
              touch ? "h-10" : "h-7",
            )}
          >
            Начать заново
          </button>
        </div>
      )}

      {step === 0 && (
        <CategoryStep
          touch={touch}
          value={category}
          partner={partner}
          freeSlots={freeSlots.length}
          slotsTotal={slotsTotal}
          onPick={(c) => {
            if (c === category) {
              goStep(1);
              return;
            }
            // Цена в строках — это цена продажи ИЛИ рыночная стоимость.
            // Сменили продажу на аренду (или наоборот) — сумма больше не
            // про то же самое, стираем, чтобы не уехала не в то поле.
            const priceMeaningChanged = (c === "sale") !== (category === "sale");
            const m = models.find((x) => x.id === draft.modelId);
            const p2: "rent" | "sale" | null = c === "rental" ? "rent" : c === "sale" ? "sale" : null;
            const keepModel =
              !!m && (!p2 || (p2 === "rent" ? modelForRent(m) : modelForSale(m)));
            setDraft((d) => ({
              ...d,
              category: c,
              step: 1,
              modelId: keepModel ? d.modelId : null,
              common: priceMeaningChanged ? { ...d.common, price: "" } : d.common,
              rows: priceMeaningChanged ? d.rows.map((r) => ({ ...r, price: "" })) : d.rows,
              pricePrefill: priceMeaningChanged ? null : d.pricePrefill,
              savedAt: Date.now(),
            }));
            setOtherModelOk(false);
            setServerIssues({});
          }}
        />
      )}

      {step === 1 && category && (
        <div className="flex flex-col gap-5">
          <Block title="Модель" touch={touch}>
            <ModelPicker
              electricOnly={partner}
              purpose={purpose}
              size={touch ? "lg" : "md"}
              value={draft.modelId}
              onChange={(id, m: ApiScooterModel) => {
                patch({ modelId: id });
                const fitsNow =
                  !purpose || (purpose === "rent" ? modelForRent(m) : modelForSale(m));
                setOtherModelOk(!fitsNow);
              }}
            />
          </Block>

          <div className="grid gap-4 sm:grid-cols-2">
            <Block title="Сколько единиц" touch={touch}>
              <CountStepper touch={touch} value={rows.length} onChange={setCount} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[1, 2, 5, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCount(n)}
                    className={cn(
                      "rounded-full border px-3 font-semibold tabular-nums",
                      touch ? "h-10 min-w-12 text-[14px]" : "h-7 min-w-9 text-[12px]",
                      rows.length === n
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-border bg-white text-ink-2 hover:border-blue-600/50",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </Block>
            <Block
              title="Номер партии"
              hint={rows.length > 1 ? "по нему партия найдётся в поиске" : "необязательно"}
              touch={touch}
            >
              <input
                value={draft.batch}
                onChange={(e) => patch({ batch: e.target.value.slice(0, 120) })}
                placeholder="Например: Партия 3 · сентябрь"
                className={inputCls(touch)}
              />
              {recentBatches.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted-2">были:</span>
                  {recentBatches.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => patch({ batch: b })}
                      className={cn(
                        "max-w-[200px] truncate rounded-full border border-border bg-white px-2.5 font-medium text-ink-2 hover:border-blue-600/50",
                        touch ? "h-9 text-[13px]" : "h-6 text-[11.5px]",
                      )}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              )}
            </Block>
            <Block title="Дата покупки" touch={touch}>
              <input
                type="date"
                value={draft.purchaseDate}
                onChange={(e) => patch({ purchaseDate: e.target.value })}
                className={inputCls(touch)}
              />
            </Block>
            {showPurchase && (
              <Block
                title="Цена закупа за 1 шт., ₽"
                badge="только директору"
                touch={touch}
              >
                <input
                  value={draft.purchasePrice}
                  onChange={(e) => patch({ purchasePrice: e.target.value.replace(/\D/g, "").slice(0, 9) })}
                  inputMode="numeric"
                  placeholder="85000"
                  className={cn(inputCls(touch), "tabular-nums")}
                />
                {purchaseNum != null && rows.length > 1 && (
                  <div className="mt-1.5 text-[12px] text-muted">
                    {rows.length} × {fmtMoney(purchaseNum)} ={" "}
                    <b className="text-ink">{fmtMoney(purchaseNum * rows.length)}</b>
                  </div>
                )}
              </Block>
            )}
          </div>

          {category === "rental" && (
            <Block title="Состояние" touch={touch}>
              <div className="flex flex-wrap gap-1.5">
                {RENTAL_STATES.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => patch({ rentalState: o.value })}
                    className={cn(
                      "rounded-full border px-3.5 font-semibold",
                      touch ? "h-11 text-[14px]" : "h-8 text-[12.5px]",
                      draft.rentalState === o.value
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-border bg-white text-ink-2 hover:border-blue-600/50",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </Block>
          )}

          {holds && (
            <SlotsInfo
              touch={touch}
              loading={slotsQ.isLoading}
              free={freeSlots.length}
              total={slotsTotal}
              count={rows.length}
              plan={slotPlan}
              short={slotsShort}
              busy={setSlotsTotal.isPending}
              onAddSlots={addSlots}
            />
          )}

          {partner && (
            <Block title="Инвестор" touch={touch}>
              {investors.length === 0 ? (
                <div className="rounded-xl border border-orange-ink/30 bg-orange-soft/50 px-3 py-2 text-[12.5px] font-semibold text-orange-ink">
                  Сначала добавьте инвестора на вкладке «Инвесторы» — партнёрская
                  техника заводится через него.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {investors.map((inv) => (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => patch({ investorId: inv.id })}
                      className={cn(
                        "flex flex-col items-start rounded-xl border px-3 text-left",
                        touch ? "min-h-12 py-2" : "py-1.5",
                        draft.investorId === inv.id
                          ? "border-violet-500 bg-violet-50 text-violet-700"
                          : "border-border bg-white text-ink-2 hover:border-violet-400",
                      )}
                    >
                      <span className="text-[13px] font-semibold">{inv.name}</span>
                      {inv.share != null && (
                        <span className="text-[11px] text-muted-2">процент {inv.share} %</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </Block>
          )}
        </div>
      )}

      {step === 2 && category && (
        <UnitsEditor
          category={category}
          rows={rows}
          onRowChange={onRowChange}
          common={common}
          onCommonChange={(p) => patch({ common: { ...common, ...p } })}
          holds={holds}
          slotOf={(i) => slotPlan[i] ?? null}
          freeSlots={freeSlots}
          issues={issues}
          onAddRow={() => setRows((rs) => resizeRows(rs, rs.length + 1))}
          onRemoveRow={onRemoveRow}
          onPasteGrid={pasteGrid}
          onOpenPasteList={() => setPasteOpen(true)}
          tableMode={tableMode}
          touch={touch}
          colorSuggestions={colorSuggestions}
          pricePrefill={
            draft.pricePrefill != null && common.price === String(draft.pricePrefill)
              ? { value: draft.pricePrefill, modelName: model?.name ?? "" }
              : null
          }
        />
      )}

      {step === 3 && category && model && (
        <ReviewStep
          touch={touch}
          model={model}
          category={category}
          statusLabel={
            category === "rental"
              ? (RENTAL_STATES.find((s) => s.value === draft.rentalState)?.label ?? "")
              : ""
          }
          batch={draft.batch.trim()}
          purchaseDate={draft.purchaseDate}
          purchasePrice={showPurchase ? purchaseNum : null}
          rows={rows}
          resolved={resolved}
          slots={slotPlan}
          holds={holds}
          leftAfter={leftAfter}
          slotsTotal={slotsTotal}
          withoutVin={withoutVin}
          oddVinRows={oddVinRows}
          pricedCount={priced.length}
          priceSum={priceSum}
          enablesPurpose={!modelFits ? (purpose === "rent" ? "Сдаём в аренду" : "Продаём") : null}
          investorName={partner ? (investors.find((i) => i.id === draft.investorId)?.name ?? null) : null}
        />
      )}

    </>
  );

  // Ошибка сервера — у кнопок, а не внизу длинного списка, где её не видно.
  const errorBar = submitError && (
    <div
      role="alert"
      className="mb-2.5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700"
    >
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">{submitError}</span>
      <button
        type="button"
        onClick={() => setSubmitError(null)}
        aria-label="Скрыть"
        className="-my-1 -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-red-100"
      >
        <X size={14} />
      </button>
    </div>
  );

  const nextLabel =
    step === 3
      ? `Добавить ${rows.length} ${plural(rows.length, ["единицу", "единицы", "единиц"])}`
      : step === 2
        ? "Проверить"
        : "Далее";

  const footerSummary = category
    ? [
        CATEGORY_TITLE[category],
        model ? model.name : null,
        model ? `${rows.length} шт.` : null,
        holds && model && slotsShort === 0 && slotPlan.every((x) => x != null)
          ? `№ ${formatRanges(slotPlan as number[])}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const pasteDialog = pasteOpen && category && (
    <PasteListDialog
      touch={touch}
      category={category}
      onClose={() => setPasteOpen(false)}
      onApply={(grid, startCol) => {
        const firstEmpty =
          startCol === "vin" ? rows.findIndex((r) => !r.vin && !r.engineNo) : 0;
        pasteGrid(firstEmpty < 0 ? rows.length : firstEmpty, startCol, grid);
        setPasteOpen(false);
      }}
    />
  );

  // ============ Телефон и планшет — полноэкранный мастер ============
  if (isMobile) {
    return (
      <div
        data-wizard="add-scooter"
        className={cn(
          "fixed inset-0 z-[130] flex flex-col bg-surface lg:items-center lg:bg-ink/45 lg:backdrop-blur-sm",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
      >
        <div className={wide ? TABLET_WIZARD_PANEL_WIDE : TABLET_WIZARD_PANEL}>
          <div className="border-b border-border bg-surface-soft px-4 pb-2.5 pt-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-ink">{title}</div>
                <div className="truncate text-[12px] text-muted-2">
                  Шаг {step + 1} из 4{footerSummary ? ` · ${footerSummary}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={requestClose}
                aria-label="Закрыть"
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-border"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5">
              {STEPS.map((t, i) => (
                <div
                  key={t}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    i <= step ? "bg-blue-600" : "bg-border",
                  )}
                />
              ))}
            </div>
            <div className="mt-1.5 text-[13px] font-bold text-blue-700">{STEPS[step]}</div>
          </div>

          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
            {body}
          </div>

          <div
            className="border-t border-border bg-white px-4 pt-2.5"
            style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
          >
            {errorBar}
            {!stepValid[step] && stepHint[step] && (
              <div className="mb-2 text-center text-[12.5px] font-semibold text-muted">
                {stepHint[step]}
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={back}
                className="h-12 rounded-2xl bg-surface-soft px-5 text-[14px] font-semibold text-ink-2 active:bg-surface"
              >
                {step === 0 ? "Отмена" : "Назад"}
              </button>
              <button
                type="button"
                onClick={next}
                disabled={!stepValid[step] || addBatch.isPending}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-[15px] font-bold text-white active:bg-blue-700 disabled:opacity-45"
              >
                {addBatch.isPending && <Loader2 size={16} className="animate-spin" />}
                {step === 3 ? <Check size={16} /> : null}
                {nextLabel}
                {step < 3 && <ArrowRight size={16} />}
              </button>
            </div>
          </div>
        </div>
        {pasteDialog}
      </div>
    );
  }

  // ============ Компьютер — окно по центру ============
  return (
    <div
      data-wizard="add-scooter"
      className={cn(
        "fixed inset-0 z-[130] flex items-center justify-center bg-ink/55 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
    >
      <div
        className={cn(
          "flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg transition-[max-width] duration-300",
          wide ? "max-w-[1180px]" : step === 1 ? "max-w-[720px]" : "max-w-[680px]",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border bg-surface-soft px-6 pb-3 pt-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                {partner ? "Партнёрка" : "Скутеры"}
              </div>
              <div className="font-display text-[19px] font-extrabold text-ink">{title}</div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Закрыть"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
            >
              <X size={17} />
            </button>
          </div>
          <ol className="mt-3 flex items-center gap-1.5">
            {STEPS.map((t, i) => {
              const done = i < step;
              const current = i === step;
              const reachable = i < step;
              return (
                <li key={t} className="flex min-w-0 flex-1 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => goStep(i as Draft["step"])}
                    className={cn(
                      "flex min-w-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[12.5px] font-semibold",
                      current ? "bg-blue-600 text-white" : done ? "text-blue-700 hover:bg-blue-50" : "text-muted-2",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                        current ? "bg-white text-blue-700" : done ? "bg-blue-600 text-white" : "bg-border text-muted",
                      )}
                    >
                      {done ? <Check size={11} strokeWidth={3} /> : i + 1}
                    </span>
                    <span className="truncate">{STEPS_SHORT[i]}</span>
                  </button>
                  {i < STEPS.length - 1 && <span className="h-px min-w-3 flex-1 bg-border" />}
                </li>
              );
            })}
          </ol>
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-5">
          {body}
        </div>

        {submitError && <div className="border-t border-border bg-surface-soft px-6 pt-3">{errorBar}</div>}
        <div
          className={cn(
            "flex items-center gap-3 bg-surface-soft px-6 py-3",
            submitError ? "pt-0" : "border-t border-border",
          )}
        >
          <div className="min-w-0 flex-1 text-[12px] text-muted">
            {!stepValid[step] && stepHint[step] ? (
              <span className="font-semibold text-ink-2">{stepHint[step]}</span>
            ) : (
              footerSummary
            )}
          </div>
          <button
            type="button"
            onClick={back}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-4 text-[13px] font-semibold text-muted hover:bg-border"
          >
            {step === 0 ? (
              "Отмена"
            ) : (
              <>
                <ArrowLeft size={14} /> Назад
              </>
            )}
          </button>
          <button
            type="button"
            onClick={next}
            disabled={!stepValid[step] || addBatch.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-blue-600 px-5 text-[13px] font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-muted-2"
          >
            {addBatch.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : step === 3 ? (
              <Check size={14} />
            ) : null}
            {nextLabel}
            {step < 3 && <ArrowRight size={14} />}
          </button>
        </div>
      </div>
      {pasteDialog}
    </div>
  );
}

function inputCls(touch: boolean) {
  return cn(
    "w-full rounded-xl border border-border bg-white px-3 text-ink outline-none placeholder:text-muted-2/70 focus:border-blue-600",
    touch ? "h-12 text-[15px]" : "h-10 text-[13.5px]",
  );
}

function Block({
  title,
  hint,
  badge,
  touch,
  children,
}: {
  title: string;
  hint?: string;
  badge?: string;
  touch: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className={cn("font-bold text-ink", touch ? "text-[14.5px]" : "text-[13px]")}>{title}</h3>
        {hint && <span className="text-[11.5px] text-muted-2">{hint}</span>}
        {badge && (
          <span className="rounded-full bg-purple-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-ink">
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function CategoryStep({
  touch,
  value,
  partner,
  freeSlots,
  slotsTotal,
  onPick,
}: {
  touch: boolean;
  value: Category | null;
  partner: boolean;
  freeSlots: number;
  slotsTotal: number;
  onPick: (c: Category) => void;
}) {
  const cards = partner
    ? CATEGORY_CARDS.filter((c) => c.id === "rental" || c.id === "unassigned")
    : CATEGORY_CARDS;
  return (
    <div>
      <div className={cn("mb-3 font-bold text-ink", touch ? "text-[17px]" : "text-[15px]")}>
        Куда добавляем технику?
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {cards.map((c) => {
          const Icon = c.icon;
          const active = value === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.id)}
              className={cn(
                "group flex items-start gap-3 rounded-2xl border-2 text-left transition-colors",
                touch ? "p-4" : "p-3.5",
                active
                  ? "border-blue-600 bg-blue-50"
                  : "border-border bg-white hover:border-blue-600/50 active:bg-surface-soft",
              )}
            >
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-2xl",
                  touch ? "h-12 w-12" : "h-10 w-10",
                  active ? "bg-blue-600 text-white" : "bg-surface-soft text-ink-2 group-hover:text-blue-700",
                )}
              >
                <Icon size={touch ? 22 : 19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className={cn("font-extrabold", touch ? "text-[17px]" : "text-[15px]", active ? "text-blue-700" : "text-ink")}>
                    {c.title}
                  </span>
                  {c.id === "rental" && slotsTotal > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10.5px] font-bold",
                        freeSlots > 0 ? "bg-green-soft text-green-ink" : "bg-orange-soft text-orange-ink",
                      )}
                    >
                      свободно {freeSlots} из {slotsTotal}
                    </span>
                  )}
                </span>
                <span className="block text-[13px] font-semibold text-muted">{c.lead}</span>
                <span className="mt-1.5 flex flex-col gap-0.5">
                  {c.points.map((pt) => (
                    <span key={pt} className="flex items-start gap-1.5 text-[12px] leading-snug text-muted-2">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-2" />
                      {pt}
                    </span>
                  ))}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CountStepper({
  touch,
  value,
  onChange,
}: {
  touch: boolean;
  value: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const btn = cn(
    "flex shrink-0 items-center justify-center rounded-xl border border-border bg-white text-ink hover:border-blue-600/50 disabled:opacity-40",
    touch ? "h-12 w-14" : "h-10 w-11",
  );
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} disabled={value <= 1} onClick={() => onChange(value - 1)} aria-label="Меньше">
        <Minus size={18} />
      </button>
      <input
        value={text}
        inputMode="numeric"
        aria-label="Количество единиц"
        onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 2))}
        onBlur={() => {
          const n = Number(text);
          if (Number.isFinite(n) && n >= 1) onChange(n);
          else setText(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={cn(
          "w-full min-w-0 rounded-xl border border-border bg-white text-center font-extrabold tabular-nums text-ink outline-none focus:border-blue-600",
          touch ? "h-12 text-[20px]" : "h-10 text-[17px]",
        )}
      />
      <button
        type="button"
        className={btn}
        disabled={value >= MAX_UNITS}
        onClick={() => onChange(value + 1)}
        aria-label="Больше"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}

function SlotsInfo({
  touch,
  loading,
  free,
  total,
  count,
  plan,
  short,
  busy,
  onAddSlots,
}: {
  touch: boolean;
  loading: boolean;
  free: number;
  total: number;
  count: number;
  plan: (number | null)[];
  short: number;
  busy: boolean;
  onAddSlots: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-surface-soft px-4 py-3 text-[13px] text-muted">
        <Loader2 size={14} className="animate-spin" /> Считаем свободные номера…
      </div>
    );
  }
  const got = plan.filter((x): x is number => x != null);
  if (short > 0) {
    return (
      <div className="rounded-2xl border border-orange-ink/30 bg-orange-soft/50 px-4 py-3">
        <div className="text-[13.5px] font-bold text-orange-ink">
          Не хватает {short} {plural(short, ["арендного номера", "арендных номеров", "арендных номеров"])}
        </div>
        <div className="mt-0.5 text-[12.5px] text-orange-ink/90">
          Свободно {free} из {total}, а в партии {count}. Добавьте номера или
          заведите часть партии в «Пока не решили».
        </div>
        <button
          type="button"
          onClick={onAddSlots}
          disabled={busy}
          className={cn(
            "mt-2 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 font-bold text-white disabled:opacity-50",
            touch ? "h-11 text-[14px]" : "h-8 text-[12.5px]",
          )}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Добавить {short} {plural(short, ["номер", "номера", "номеров"])} ({total} → {total + short})
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-surface-soft px-4 py-3 text-[13px] text-muted">
      <span>
        Арендные номера: получат{" "}
        <b className="text-ink">{got.length ? formatRanges(got) : "—"}</b>
      </span>
      <span className="text-muted-2">
        свободно {free} из {total} → останется {Math.max(0, free - count)}
      </span>
      <span className="text-muted-2">номер можно поменять на следующем шаге</span>
    </div>
  );
}

function ReviewStep({
  touch,
  model,
  category,
  statusLabel,
  batch,
  purchaseDate,
  purchasePrice,
  rows,
  resolved,
  slots,
  holds,
  leftAfter,
  slotsTotal,
  withoutVin,
  oddVinRows,
  pricedCount,
  priceSum,
  enablesPurpose,
  investorName,
}: {
  touch: boolean;
  model: ApiScooterModel;
  category: Category;
  statusLabel: string;
  batch: string;
  purchaseDate: string;
  purchasePrice: number | null;
  rows: UnitRow[];
  resolved: ReturnType<typeof resolveRow>[];
  slots: (number | null)[];
  holds: boolean;
  leftAfter: number | null;
  slotsTotal: number;
  withoutVin: number;
  oddVinRows: number[];
  pricedCount: number;
  priceSum: number;
  enablesPurpose: string | null;
  investorName: string | null;
}) {
  const n = rows.length;
  const avatar = fileUrl(model.avatarKey, { variant: "thumb" });
  const got = slots.filter((x): x is number => x != null);
  const dateRu = purchaseDate ? purchaseDate.split("-").reverse().join(".") : "—";
  const priceLabel = category === "sale" ? "Цена продажи" : "Рыночная стоимость";
  const facts: { label: string; value: React.ReactNode }[] = [
    { label: "Куда", value: `${CATEGORY_TITLE[category]}${statusLabel ? ` · ${statusLabel}` : ""}` },
    ...(holds
      ? [
          {
            label: "Арендные номера",
            value: (
              <>
                {formatRanges(got)}
                {leftAfter != null && (
                  <span className="font-normal text-muted-2"> · свободно останется {leftAfter} из {slotsTotal}</span>
                )}
              </>
            ),
          },
        ]
      : [{ label: "Арендный номер", value: <span className="font-normal text-muted">не выдаётся</span> }]),
    { label: "Партия", value: batch || <span className="font-normal text-muted-2">не указана</span> },
    { label: "Дата покупки", value: dateRu },
    ...(purchasePrice != null
      ? [
          {
            label: "Закуп",
            value: `${n} × ${fmtMoney(purchasePrice)} = ${fmtMoney(purchasePrice * n)}`,
          },
        ]
      : []),
    {
      label: priceLabel,
      value:
        pricedCount === 0 ? (
          <span className="font-normal text-muted-2">не указана</span>
        ) : (
          <>
            {pricedCount === n && new Set(resolved.map((r) => r.price)).size === 1
              ? `${n} × ${fmtMoney(Number(resolved[0]!.price))} = ${fmtMoney(priceSum)}`
              : `итого ${fmtMoney(priceSum)}`}
            {pricedCount < n && (
              <span className="font-normal text-amber-700"> · не указана у {n - pricedCount}</span>
            )}
          </>
        ),
    },
    // Прибыль партии (продажа − закуп) — только директору (закуп видит
    // только он) и только когда известны обе цены у всех единиц: иначе
    // цифра была бы неправдой.
    ...(category === "sale" && purchasePrice != null && pricedCount === n
      ? [
          {
            label: "Прибыль (продажа − закуп)",
            value: (
              <span className={priceSum - purchasePrice * n >= 0 ? "text-green-ink" : "text-red-600"}>
                {fmtMoney(priceSum - purchasePrice * n)}
              </span>
            ),
          },
        ]
      : []),
    ...(investorName ? [{ label: "Инвестор", value: investorName }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-white p-3.5">
        <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-soft">
          {avatar ? <img src={avatar} alt="" className="h-full w-full object-contain" /> : <Tag size={22} className="text-muted-2" />}
        </div>
        <div className="min-w-0">
          <div className={cn("font-display font-extrabold leading-tight text-ink", touch ? "text-[22px]" : "text-[20px]")}>
            {n} × {model.name}
          </div>
          <div className="text-[13px] text-muted">
            {n} {plural(n, ["единица", "единицы", "единиц"])} добавятся одной операцией — либо все, либо ни одной
          </div>
        </div>
      </div>

      <dl className="grid overflow-hidden rounded-2xl border border-border bg-white sm:grid-cols-2">
        {facts.map((f) => (
          <div key={f.label} className="border-b border-border px-4 py-2.5 last:border-b-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
            <dt className="text-[11.5px] font-semibold text-muted-2">{f.label}</dt>
            <dd className="text-[14px] font-semibold tabular-nums text-ink">{f.value}</dd>
          </div>
        ))}
      </dl>

      {(withoutVin > 0 || enablesPurpose || oddVinRows.length > 0) && (
        <div className="flex flex-col gap-1.5">
          {enablesPurpose && (
            <div className="flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2 text-[12.5px] text-blue-800">
              <Check size={14} className="mt-0.5 shrink-0" />
              Модель «{model.name}» отметим: «{enablesPurpose}».
            </div>
          )}
          {oddVinRows.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Рама не похожа на обычные для {model.name} —{" "}
              {oddVinRows.length === 1 ? `строка ${oddVinRows[0]}` : `строки ${oddVinRows.join(", ")}`}.
              Проверьте номер: он пойдёт в договоры и акты.
            </div>
          )}
          {withoutVin > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {withoutVin === n ? "Ни у одной единицы" : `У ${withoutVin} из ${n}`} нет номера рамы — в актах и
              договорах будет пусто. Можно дописать потом в карточке.
            </div>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="border-b border-border bg-surface-soft px-4 py-2 text-[12px] font-bold text-muted">
          Единицы
        </div>
        <ul className="divide-y divide-border">
          {resolved.map((r, i) => (
            <li key={rows[i]!.key} className="flex items-center gap-3 px-4 py-2 text-[13px]">
              <span className="w-5 shrink-0 text-right text-[12px] font-bold tabular-nums text-muted-2">{i + 1}</span>
              {holds && (
                <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-ink px-1.5 text-[12px] font-bold tabular-nums text-white">
                  {slots[i]}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate font-mono text-[13px]", r.vin ? "text-ink" : "text-amber-700")}>
                  {r.vin || "без рамы"}
                </span>
                <span className="block truncate text-[11.5px] text-muted-2">
                  {[
                    r.engineNo && `двиг. ${r.engineNo}`,
                    r.year && `${r.year} г.`,
                    r.color,
                    `${Number(r.mileage || 0).toLocaleString("ru-RU")} км`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              {r.price && (
                <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-ink">
                  {fmtMoney(Number(r.price))}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
