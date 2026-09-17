import { useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Minus, Package, Plus, Search, Trash2, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { priceZones, splitPriceGroup, usePriceList, type ApiPriceItem } from "@/lib/api/price-list";
import { matchWords, suggestKey, SuggestInput } from "@/components/SuggestInput";
import { Switch } from "@/components/ui/switch";
import { digits, money } from "./serviceOrderUi";

/**
 * Работы и запчасти заказ-наряда (2.0.2) — один редактор для формы нового
 * ремонта и для карточки. В форме строки живут в черновике, в карточке
 * каждая правка сразу уходит на сервер.
 *
 * Под палец (телефон, планшет): название на всю ширину, ниже — количество
 * кнопками − / +, закуп и цена полями высотой 44px. На компьютере строка
 * одна и плотная: вводят с клавиатуры, Enter — в следующее поле.
 *
 * 2.0.2: и работы, и запчасти берутся из своего прайса («Из прайса» или
 * подсказкой по первым буквам названия). Своя позиция по умолчанию
 * сохраняется в прайс — в следующий раз её выберут из списка.
 */

/** Новая строка: что добавить и надо ли сохранить её в прайс. */
export type NewRowValue = {
  name: string;
  qty: number;
  price: number;
  cost: number;
  priceItemId: number | null;
  saveToPrice: boolean;
};

export type EditorItem = {
  key: string | number;
  name: string;
  qty: number;
  price: number;
  cost?: number;
};

export type ItemPatch = { name?: string; qty?: number; price?: number; cost?: number };

export function ItemsSection({
  kind,
  items,
  sum,
  touch,
  locked,
  withCost,
  onPatch,
  onRemove,
  onAdd,
  onPickFromPrice,
}: {
  kind: "work" | "part";
  items: EditorItem[];
  sum: number;
  touch: boolean;
  locked: boolean;
  withCost: boolean;
  onPatch: (key: EditorItem["key"], patch: ItemPatch) => void;
  onRemove: (key: EditorItem["key"]) => void;
  onAdd: (v: NewRowValue) => void;
  onPickFromPrice?: () => void;
}) {
  const isWork = kind === "work";
  const costOn = withCost && !isWork;
  return (
    <section className="mb-5" data-section={kind}>
      <div className="mb-2 flex min-h-9 items-center gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
          {isWork ? <Wrench size={13} /> : <Package size={13} />}
          {isWork ? "Работы" : "Запчасти"}
        </div>
        <span className="text-[13px] font-bold tabular-nums text-ink">{money(sum)}</span>
        {!locked && onPickFromPrice && (
          <button
            type="button"
            onClick={onPickFromPrice}
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 font-bold text-white hover:bg-ink-2",
              touch ? "h-11 text-[13.5px]" : "h-9 text-[12.5px]",
            )}
          >
            <Plus size={15} /> Из прайса
          </button>
        )}
      </div>
      {!isWork && costOn && !locked && (
        <div className="mb-2 text-[11.5px] text-muted-2">
          Закуп нужен для прибыли. Цену клиенту не указали — возьмём равной закупу.
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {items.length === 0 && locked && (
          <div className="rounded-xl border border-dashed border-border px-3 py-3 text-[12.5px] text-muted-2">
            {isWork ? "Работ нет." : "Запчастей нет."}
          </div>
        )}
        {items.map((it) => (
          <ItemRow
            key={it.key}
            item={it}
            touch={touch}
            locked={locked}
            withCost={costOn}
            onPatch={(p) => onPatch(it.key, p)}
            onRemove={() => onRemove(it.key)}
          />
        ))}
        {!locked && (
          <AddRow
            kind={kind}
            touch={touch}
            withCost={costOn}
            placeholder={isWork ? "Своя работа — название" : "Запчасть — начните писать название"}
            onAdd={onAdd}
          />
        )}
      </div>
    </section>
  );
}

function ItemRow({
  item,
  touch,
  locked,
  withCost,
  onPatch,
  onRemove,
}: {
  item: EditorItem;
  touch: boolean;
  locked: boolean;
  withCost: boolean;
  onPatch: (p: ItemPatch) => void;
  onRemove: () => void;
}) {
  const sum = item.price * item.qty;
  if (touch) {
    return (
      <div className="rounded-2xl bg-surface p-2.5 shadow-card-sm" data-item-row>
        <div className="flex items-center gap-2">
          <TextField
            value={item.name}
            disabled={locked}
            onCommit={(name) => onPatch({ name })}
            className="min-h-11 min-w-0 flex-1 text-[15px] font-semibold"
          />
          {!locked && (
            <button
              type="button"
              aria-label="Убрать"
              onClick={onRemove}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-2 active:bg-red-soft active:text-red-ink"
            >
              <Trash2 size={17} />
            </button>
          )}
        </div>
        <div
          className={cn(
            "mt-2 grid items-end gap-2",
            withCost ? "grid-cols-[auto_1fr_1fr]" : "grid-cols-[auto_1fr]",
          )}
        >
          <Labeled label="Кол-во">
            <Stepper value={item.qty} disabled={locked} touch onChange={(qty) => onPatch({ qty })} />
          </Labeled>
          {withCost && (
            <Labeled label="Закуп, ₽">
              <NumField value={item.cost ?? 0} disabled={locked} touch onCommit={(cost) => onPatch({ cost })} />
            </Labeled>
          )}
          <Labeled label="Цена, ₽">
            <NumField value={item.price} disabled={locked} touch onCommit={(price) => onPatch({ price })} />
          </Labeled>
        </div>
        {item.qty > 1 && (
          <div className="mt-1.5 text-right text-[12.5px] text-muted">
            {item.qty} × {money(item.price)} = <b className="text-ink">{money(sum)}</b>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface px-2.5 py-1.5 shadow-card-sm" data-item-row>
      <TextField
        value={item.name}
        disabled={locked}
        onCommit={(name) => onPatch({ name })}
        className="min-h-9 min-w-0 flex-1 text-[13px] font-semibold"
      />
      <Stepper value={item.qty} disabled={locked} onChange={(qty) => onPatch({ qty })} />
      {withCost && (
        <NumField
          value={item.cost ?? 0}
          disabled={locked}
          badge="закуп"
          className="w-[88px]"
          onCommit={(cost) => onPatch({ cost })}
        />
      )}
      <NumField
        value={item.price}
        disabled={locked}
        badge="цена"
        className="w-[96px]"
        onCommit={(price) => onPatch({ price })}
      />
      <span className="w-[92px] shrink-0 text-right text-[13px] font-bold tabular-nums text-ink">
        {money(sum)}
      </span>
      {locked ? (
        <span className="w-9 shrink-0" />
      ) : (
        <button
          type="button"
          title="Убрать"
          aria-label="Убрать"
          onClick={onRemove}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-2 hover:bg-red-soft hover:text-red-ink"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function AddRow({
  kind,
  touch,
  withCost,
  placeholder,
  onAdd,
}: {
  kind: "work" | "part";
  touch: boolean;
  withCost: boolean;
  placeholder: string;
  onAdd: (v: NewRowValue) => void;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [save, setSave] = useState(true);
  const nameRef = useRef<HTMLInputElement>(null);

  // Прайс того же вида: подсказки по названию и цена по выбору.
  const priceKind = kind === "work" ? "service" : "part";
  const { data } = usePriceList(priceKind);
  const byKey = useMemo(() => {
    const m = new Map<string, ApiPriceItem>();
    for (const g of data?.groups ?? []) for (const i of g.items) if (!m.has(suggestKey(i.name))) m.set(suggestKey(i.name), i);
    return m;
  }, [data]);
  const names = useMemo(() => [...byKey.values()].map((i) => i.name), [byKey]);
  const match = name.trim() ? byKey.get(suggestKey(name)) ?? null : null;
  const isNew = name.trim().length > 0 && !match;

  const pickName = (v: string) => {
    setName(v);
    const hit = byKey.get(suggestKey(v));
    // Выбрали из прайса — цена и закуп подставляются, их можно поправить.
    if (hit && v !== name) {
      if (hit.priceA != null) setPrice(String(hit.priceA));
      if (withCost && hit.cost != null) setCost(String(hit.cost));
    }
  };

  const ready = name.trim().length > 0;
  const submit = () => {
    if (!ready) {
      nameRef.current?.focus();
      return;
    }
    const c = Number(cost || 0);
    // Не поставили цену клиенту — значит, продаём по закупу.
    const p = price ? Number(price) : withCost ? c : 0;
    onAdd({
      name: match?.name ?? name.trim(),
      qty: Math.max(1, qty),
      price: p,
      cost: c,
      priceItemId: match?.id ?? null,
      saveToPrice: isNew && save,
    });
    setName("");
    setQty(1);
    setCost("");
    setPrice("");
    nameRef.current?.focus();
  };
  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  const inputCls = cn(
    "w-full rounded-xl border border-border bg-surface tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-muted-2 focus:border-blue-600",
    touch
      ? "h-11 px-2.5 text-right text-[15px] font-bold placeholder:text-[13px]"
      : "h-9 px-3 text-right text-[12.5px] font-bold",
  );
  const priceName = kind === "work" ? "прайс работ" : "прайс запчастей";

  const nameInput = (
    <SuggestInput
      ref={nameRef}
      value={name}
      onValueChange={pickName}
      suggestions={names}
      touch={touch}
      minChars={1}
      limit={touch ? 6 : 8}
      heading={kind === "work" ? "Из прайса работ" : "Из прайса запчастей"}
      meta={(s) => {
        const hit = byKey.get(suggestKey(s));
        return hit?.priceA != null ? money(hit.priceA) : null;
      }}
      onKeyDown={enter}
      placeholder={placeholder}
      enterKeyHint="next"
      data-add-name={kind}
      className={
        touch
          ? "h-11 w-full rounded-xl border border-border bg-surface px-3 text-[15px] text-ink outline-none placeholder:text-muted-2 focus:border-blue-600"
          : "h-9 min-w-0 flex-1 bg-transparent px-1 text-[13px] text-ink outline-none placeholder:text-muted-2"
      }
    />
  );

  // Строка-состояние под полем: из прайса или новая (и сохранять ли её).
  const status = !ready ? null : match ? (
    <div className="mt-1.5 flex items-center gap-1.5 px-1 text-[12px] font-semibold text-blue-700">
      <BookmarkPlus size={13} /> Из {kind === "work" ? "прайса работ" : "прайса запчастей"}
    </div>
  ) : (
    <label
      className={cn("mt-1.5 flex cursor-pointer items-center gap-2 px-1 text-[12px] text-ink-2", touch && "min-h-11")}
      data-save-to-price
    >
      <Switch checked={save} onChange={setSave} label={`Сохранить в ${priceName}`} />
      <span>
        {save ? (
          <>
            Новая — сохраним в <b>{priceName}</b>
          </>
        ) : (
          <>Только в этот ремонт</>
        )}
      </span>
    </label>
  );

  if (touch) {
    return (
      <div className="rounded-2xl border border-dashed border-border-strong p-2.5" data-add-row={kind}>
        {nameInput}
        {status}
        <div
          className={cn(
            "mt-2 grid items-end gap-2",
            withCost ? "grid-cols-[auto_1fr_1fr]" : "grid-cols-[auto_1fr]",
          )}
        >
          <Labeled label="Кол-во">
            <Stepper value={qty} touch onChange={setQty} />
          </Labeled>
          {withCost && (
            <Labeled label="Закуп, ₽">
              <input
                inputMode="numeric"
                value={cost}
                onChange={(e) => setCost(digits(e.target.value))}
                onKeyDown={enter}
                placeholder="0"
                className={inputCls}
              />
            </Labeled>
          )}
          <Labeled label="Цена, ₽">
            <input
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(digits(e.target.value))}
              onKeyDown={enter}
              placeholder={withCost ? "= закуп" : "0"}
              enterKeyHint="done"
              className={inputCls}
            />
          </Labeled>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!ready}
          className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-ink text-[14px] font-bold text-white disabled:bg-surface-soft disabled:text-muted-2"
        >
          <Plus size={16} /> Добавить
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-border-strong px-2.5 py-1.5" data-add-row={kind}>
      <div className="flex items-center gap-2">
        {nameInput}
        <Stepper value={qty} onChange={setQty} />
        {withCost && (
          <input
            inputMode="numeric"
            value={cost}
            onChange={(e) => setCost(digits(e.target.value))}
            onKeyDown={enter}
            placeholder="закуп"
            title="Закуп за штуку"
            className={cn(inputCls, "w-[88px]")}
          />
        )}
        <input
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(digits(e.target.value))}
          onKeyDown={enter}
          placeholder="цена"
          title="Цена клиенту за штуку"
          className={cn(inputCls, "w-[96px]")}
        />
        <span className="w-[92px] shrink-0" />
        <button
          type="button"
          onClick={submit}
          disabled={!ready}
          title="Добавить"
          aria-label="Добавить"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink text-white disabled:opacity-30"
        >
          <Plus size={15} />
        </button>
      </div>
      {status}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">{label}</span>
      {children}
    </label>
  );
}

/** Количество кнопками: под палец по 44px, на компьютере — 36px. */
export function Stepper({
  value,
  onChange,
  disabled,
  touch,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  touch?: boolean;
}) {
  const btn = cn(
    "flex shrink-0 items-center justify-center text-ink-2 disabled:opacity-30",
    touch ? "h-11 w-11 active:bg-surface-soft" : "h-9 w-8 hover:bg-surface-soft",
  );
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center overflow-hidden rounded-xl border border-border bg-surface",
        disabled && "bg-surface-soft",
      )}
    >
      {!disabled && (
        <button
          type="button"
          aria-label="Меньше"
          className={btn}
          disabled={value <= 1}
          onClick={() => onChange(Math.max(1, value - 1))}
        >
          <Minus size={touch ? 16 : 13} />
        </button>
      )}
      <span
        className={cn(
          "text-center font-bold tabular-nums text-ink",
          touch ? "w-9 text-[15px]" : "w-7 text-[12.5px]",
          disabled && (touch ? "h-11 leading-[44px]" : "h-9 leading-9"),
        )}
      >
        {value}
      </span>
      {!disabled && (
        <button
          type="button"
          aria-label="Больше"
          className={btn}
          disabled={value >= 999}
          onClick={() => onChange(Math.min(999, value + 1))}
        >
          <Plus size={touch ? 16 : 13} />
        </button>
      )}
    </span>
  );
}

/** Поле суммы: правка копится локально, уходит по уходу фокуса или Enter. */
export function NumField({
  value,
  onCommit,
  disabled,
  touch,
  badge,
  className,
}: {
  value: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
  touch?: boolean;
  badge?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft != null && draft !== String(value)) onCommit(Number(draft || 0));
    setDraft(null);
  };
  return (
    <span className={cn("relative block shrink-0", className)}>
      <input
        inputMode="numeric"
        disabled={disabled}
        value={draft ?? String(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(digits(e.target.value))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(null);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        className={cn(
          "w-full rounded-xl border border-border bg-surface px-2.5 text-right font-bold tabular-nums text-ink outline-none focus:border-blue-600 disabled:border-transparent disabled:bg-surface-soft disabled:text-ink-2",
          touch ? "h-11 text-[15px]" : "h-9 text-[12.5px]",
        )}
      />
      {badge && (
        <span className="pointer-events-none absolute -top-1.5 left-2 rounded bg-surface px-1 text-[9px] font-bold uppercase leading-3 text-muted-2">
          {badge}
        </span>
      )}
    </span>
  );
}

/** Название позиции — правится прямо в строке. */
function TextField({
  value,
  onCommit,
  disabled,
  className,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const v = draft?.trim();
    if (draft != null && v && v !== value) onCommit(v);
    setDraft(null);
  };
  // Длинные названия из прайса («Ремень вариатора — 810×17,5 — Yamaha Gear 4T»)
  // показываем целиком в две-три строки; поле ввода — только пока правят.
  const text = "py-1 text-left leading-snug [overflow-wrap:anywhere]";
  if (disabled) {
    return <span className={cn("flex items-center px-1 text-ink", className, text)}>{value}</span>;
  }
  if (draft == null) {
    return (
      <button
        type="button"
        title="Изменить название"
        onClick={() => setDraft(value)}
        className={cn(
          "flex items-center rounded-lg border border-transparent px-1.5 text-ink hover:border-border",
          className,
          text,
        )}
      >
        {value}
      </button>
    );
  }
  return (
    <input
      value={draft}
      title={value}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(null);
        }
      }}
      className={cn(
        "rounded-lg border border-transparent bg-transparent px-1.5 text-ink outline-none hover:border-border focus:border-blue-600 focus:bg-surface",
        className,
      )}
    />
  );
}

/**
 * Модели для фильтра прайса запчастей: по каким словам в названии позиции
 * понять, что она подходит. «Все модели» подходят всегда.
 */
const PART_MODELS: { id: string; label: string; words: string[]; guess: RegExp }[] = [
  { id: "gear", label: "Gear", words: ["gear"], guess: /gear/i },
  { id: "ay01", label: "Jog AY01", words: ["ay01"], guess: /ay01/i },
  { id: "jog", label: "Jog, Vino", words: ["jog 4t", "jog,", "jog (", "vino"], guess: /jog|vino|джог|вино/i },
  { id: "dio", label: "Dio", words: ["dio"], guess: /dio|дио/i },
  { id: "tank", label: "Tank, GY6 150", words: ["tank", "gy6", "китайские 1"], guess: /tank|танк|gy6|150|китай/i },
  { id: "ev", label: "Электро", words: ["электро"], guess: /aima|электр|u-5|u-2/i },
];

function fitsModel(name: string, modelId: string | null): boolean {
  if (!modelId) return true;
  const m = PART_MODELS.find((x) => x.id === modelId);
  if (!m) return true;
  const n = name.toLowerCase();
  if (n.includes("все модели")) return true;
  return m.words.some((w) => n.includes(w));
}

/** Модель из поля «Техника» ремонта: «Yamaha Gear 4T» → Gear. */
export function guessPartModel(vehicle?: string | null): string | null {
  if (!vehicle) return null;
  return PART_MODELS.find((m) => m.guess.test(vehicle))?.id ?? null;
}

/**
 * Выбор из прайса — работы или запчасти (2.0.2). Накрывает панель целиком;
 * на телефоне строки по 52px. Можно выбрать несколько подряд.
 */
export function PricePicker({
  kind,
  touch,
  withCost,
  vehicle,
  onClose,
  onPick,
}: {
  kind: "work" | "part";
  touch: boolean;
  /** Техника из ремонта — фильтр моделей выбирается сам. */
  vehicle?: string | null;
  /** Показать закуп (запчасти, есть право на прибыль ремонтов). */
  withCost?: boolean;
  onClose: () => void;
  onPick: (item: ApiPriceItem) => void;
}) {
  const { data, isLoading } = usePriceList(kind === "work" ? "service" : "part");
  const [q, setQ] = useState("");
  const [zone, setZone] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(() => (kind === "part" ? guessPartModel(vehicle) : null));
  const [picked, setPicked] = useState<number[]>([]);
  const groups = data?.groups ?? [];
  const needle = suggestKey(q);
  const isWork = kind === "work";
  const zones = useMemo(() => priceZones(groups), [groups]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Поиск ищет по всему прайсу; зона сужает список, пока поиск пуст.
  const shown = groups
    .filter((g) => needle || !zone || splitPriceGroup(g.name).zone === zone)
    .map((g) => ({
      g,
      items: g.items.filter(
        (i) => fitsModel(i.name, isWork ? null : model) && (!needle || matchWords(`${i.name} ${g.name}`, needle)),
      ),
    }))
    .filter((x) => x.items.length > 0);
  let lastZone: string | null = null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-surface" data-price-picker={kind}>
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2" />
          <input
            autoFocus={!touch}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={isWork ? "Найти работу в прайсе" : "Найти запчасть: ремень, колодки, Gear…"}
            className={cn(
              "w-full rounded-xl border border-border bg-surface pl-9 pr-3 outline-none focus:border-blue-600",
              touch ? "h-11 text-[15px]" : "h-10 text-[13px]",
            )}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-xl font-bold",
            picked.length ? "bg-ink px-4 text-white" : "text-muted-2 hover:bg-surface-soft hover:text-ink",
            touch ? "h-11 min-w-11" : "h-10 min-w-10",
          )}
        >
          {picked.length ? `Готово · ${picked.length}` : <X size={18} />}
        </button>
      </header>
      {!isWork && (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-4 py-2" data-model-chips>
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-2">Для</span>
          {[{ id: null, label: "Все модели" } as { id: string | null; label: string }, ...PART_MODELS].map((m) => (
            <button
              key={m.id ?? "all"}
              type="button"
              onClick={() => setModel(m.id)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-3 font-semibold",
                touch ? "h-10 text-[13.5px]" : "h-8 text-[12.5px]",
                model === m.id ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700 hover:bg-blue-100",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
      {zones.length > 1 && !needle && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border px-4 py-2" data-zone-chips>
          {[null, ...zones].map((zn) => (
            <button
              key={zn ?? "all"}
              type="button"
              onClick={() => setZone(zn)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-3 font-semibold",
                touch ? "h-10 text-[13.5px]" : "h-8 text-[12.5px]",
                zone === zn ? "bg-ink text-white" : "bg-surface-soft text-ink-2 hover:bg-border",
              )}
            >
              {zn ?? "Все"}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!isLoading && groups.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted">
            {isWork ? "Прайс работ" : "Прайс запчастей"} пока пуст. Он ведётся в «Документах» →
            «Прейскурант». Свою позицию можно вписать в строке внизу — она сохранится в прайс.
          </div>
        )}
        {groups.length > 0 && shown.length === 0 && (
          <div className="px-1 py-6 text-center text-[13px] text-muted">
            Не нашли «{q}». Закройте список и впишите позицию сами — она сохранится в прайс.
          </div>
        )}
        {shown.map(({ g, items }) => {
          const { zone: gz, sub } = splitPriceGroup(g.name);
          const zoneHead = gz && gz !== lastZone ? gz : null;
          lastZone = gz;
          return (
          <div key={g.id} className="mb-4">
            {zoneHead && (
              <div className="mb-2 mt-1 font-display text-[16px] font-extrabold text-ink" data-zone-head>
                {zoneHead}
              </div>
            )}
            <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-2">{sub}</div>
            <div className="flex flex-col gap-1">
              {items.map((i) => {
                const n = picked.filter((x) => x === i.id).length;
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => {
                      onPick(i);
                      setPicked((p) => [...p, i.id]);
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-3 text-left",
                      touch ? "min-h-[52px] py-1.5 active:bg-blue-50" : "py-2 hover:bg-blue-50",
                      n > 0 && "bg-blue-50",
                    )}
                  >
                    <span className={cn("min-w-0 flex-1 font-semibold text-ink", touch ? "text-[15px]" : "text-[13px]")}>
                      {i.name}
                    </span>
                    {n > 0 && (
                      <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
                        добавлено{n > 1 ? ` ×${n}` : ""}
                      </span>
                    )}
                    <span className="flex shrink-0 flex-col items-end leading-tight">
                      <span className={cn("font-bold tabular-nums text-ink-2", touch ? "text-[15px]" : "text-[13px]")}>
                        {money(i.priceA ?? 0)}
                      </span>
                      {withCost && i.cost != null && (
                        <span className="text-[11px] tabular-nums text-muted-2">закуп {money(i.cost)}</span>
                      )}
                    </span>
                    <Plus size={16} className="shrink-0 text-blue-600" />
                  </button>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
