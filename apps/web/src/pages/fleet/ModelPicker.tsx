import { useMemo, useState } from "react";
import { ChevronDown, Search, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/files";
import {
  modelForRent,
  modelForSale,
  useApiScooterModels,
  type ApiScooterModel,
} from "@/lib/api/scooter-models";
import { ElectricMark, PetrolMark } from "@/components/PowerTypeBadge";

/**
 * Выбор модели скутера при добавлении.
 * Показывает модели с quickPick=true как кнопки-карточки (аватарка + имя).
 * Для остальных — строка поиска с дропдауном. Работает с любым количеством
 * моделей в каталоге.
 */
export function ModelPicker({
  value,
  onChange,
  electricOnly = false,
  purpose = null,
  size = "md",
}: {
  value: number | null;
  onChange: (modelId: number, model: ApiScooterModel) => void;
  /**
   * Правка 28.08: партнёрка — это электротранспорт. При добавлении оттуда
   * выбор типа не нужен: показываем только электро-модели и прячем фильтр
   * категорий, чтобы оператор не выбрал бензиновую по ошибке.
   */
  electricOnly?: boolean;
  /**
   * Релиз 2.0.1: под какую категорию выбираем. «rent» — только модели,
   * которые сдаём, «sale» — которые продаём, без тарифов в плитках.
   * Остальные модели прячутся под «Другие модели».
   */
  purpose?: "rent" | "sale" | null;
  /** «lg» — крупные плитки под палец (мастер на телефоне и планшете). */
  size?: "md" | "lg";
}) {
  const { data: allModels = [], isLoading } = useApiScooterModels();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  // Правка 24.08: если в каталоге есть оба типа техники — даём отсеять
  // категорию, чтобы не искать электричку глазами среди бензиновых.
  const [power, setPower] = useState<"all" | "petrol" | "electric">("all");
  const [showOthers, setShowOthers] = useState(false);
  const fits = (m: ApiScooterModel) =>
    !purpose || (purpose === "rent" ? modelForRent(m) : modelForSale(m));

  // Видимый список — только активные модели. Неактивная модель в БД
  // остаётся для истории, но в выборах CRM не показывается.
  // Если value указывает на неактивную (старая запись) — не теряем
  // её, чтобы пользователь мог её увидеть в форме.
  const visible = useMemo(
    () =>
      allModels.filter(
        (m) =>
          (m.active || m.id === value) &&
          (!electricOnly || m.isElectric) &&
          fits(m),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allModels, value, electricOnly, purpose],
  );
  /** Активные модели не под эту категорию — по кнопке «Другие модели». */
  const others = useMemo(
    () =>
      purpose
        ? allModels.filter(
            (m) => m.active && (!electricOnly || m.isElectric) && !fits(m),
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allModels, electricOnly, purpose],
  );
  const hasBothPowerTypes = useMemo(
    () =>
      visible.some((m) => m.isElectric) && visible.some((m) => !m.isElectric),
    [visible],
  );
  const models = useMemo(
    () =>
      power === "all"
        ? visible
        : visible.filter((m) =>
            power === "electric" ? m.isElectric : !m.isElectric,
          ),
    [visible, power],
  );

  // Небольшой список (продажа, партнёрка) — все модели плитками; большой —
  // плитками только быстрый выбор, остальное через поиск.
  const quickPick = useMemo(
    () =>
      models.length <= 9
        ? models
        : models.filter((m) => m.quickPick && m.active),
    [models],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    return models
      .filter((m) => m.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [models, query]);

  const selected =
    models.find((m) => m.id === value) ??
    others.find((m) => m.id === value) ??
    null;
  const selectedIsOther = !!selected && !fits(selected);

  const tileSub = (m: ApiScooterModel) =>
    purpose === "sale"
      ? modelForRent(m)
        ? "аренда и продажа"
        : "только продажа"
      : `${m.shortRate} ₽/сут · 3–6 дн`;
  const otherSub = () =>
    purpose === "sale" ? "сейчас только аренда" : "сейчас только продажа";

  return (
    <div className="flex flex-col gap-2">
      {/* Фильтр категорий — только если в парке есть оба типа техники. */}
      {hasBothPowerTypes && !electricOnly && (
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["all", "Все"],
              ["petrol", "Бензин"],
              ["electric", "Электро"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPower(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors",
                power === key
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-border bg-surface text-muted hover:border-blue-600/40",
              )}
            >
              {key === "electric" && <ElectricMark size="sm" />}
              {key === "petrol" && <PetrolMark size="sm" />}
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Быстрый выбор */}
      {quickPick.length > 0 && (
        <div
          className={cn(
            "grid grid-cols-2 sm:grid-cols-3",
            size === "lg" ? "gap-2" : "gap-1.5",
          )}
        >
          {quickPick.map((m) => {
            const active = m.id === value;
            // v0.4.62: квадратные карточки в пикере — thumb-вариант.
            const avatar = fileUrl(m.avatarKey, { variant: "thumb" });
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChange(m.id, m)}
                className={cn(
                  "flex items-center gap-2 border bg-surface text-left transition-colors",
                  size === "lg"
                    ? "min-h-[56px] rounded-2xl px-3 py-2.5"
                    : "rounded-[10px] px-2.5 py-2",
                  active
                    ? "border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/30"
                    : "border-border text-ink-2 hover:border-blue-600/50",
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Tag size={14} className="text-muted-2" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold">
                      {m.name}
                    </span>
                    {m.isElectric ? (
                      <ElectricMark size="sm" />
                    ) : (
                      <PetrolMark size="sm" />
                    )}
                  </div>
                  <div className="truncate text-[10px] text-muted-2">
                    {tileSub(m)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Модели не под эту категорию — спрятаны, но доступны. */}
      {others.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowOthers((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full px-1 py-1 text-[12px] font-semibold text-blue-700 hover:text-blue-800"
          >
            <ChevronDown
              size={14}
              className={cn("transition-transform", showOthers && "rotate-180")}
            />
            {showOthers ? "Скрыть другие модели" : `Другие модели · ${others.length}`}
          </button>
          {showOthers && (
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {others.map((m) => {
                const active = m.id === value;
                const avatar = fileUrl(m.avatarKey, { variant: "thumb" });
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onChange(m.id, m)}
                    className={cn(
                      "flex items-center gap-2 border border-dashed text-left transition-colors",
                      size === "lg"
                        ? "min-h-[56px] rounded-2xl px-3 py-2.5"
                        : "rounded-[10px] px-2.5 py-2",
                      active
                        ? "border-amber-500 bg-amber-50 text-amber-900"
                        : "border-border bg-surface-soft/60 text-muted hover:border-amber-400",
                    )}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white opacity-80">
                      {avatar ? (
                        <img src={avatar} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <Tag size={14} className="text-muted-2" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{m.name}</div>
                      <div className="truncate text-[10px] text-muted-2">{otherSub()}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Поиск остальных моделей */}
      {models.length > quickPick.length && (
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Найти другую модель…"
            className="h-9 w-full rounded-[10px] border border-border bg-surface pl-9 pr-8 text-[13px] text-ink outline-none focus:border-blue-600"
          />
          {query && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-2 hover:text-ink"
            >
              <X size={12} />
            </button>
          )}
          {focused && filtered.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[220px] overflow-y-auto rounded-[10px] bg-surface shadow-card-lg ring-1 ring-border">
              {filtered.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(m.id, m);
                    setQuery("");
                    setFocused(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-soft"
                >
                  {m.isElectric ? (
                    <ElectricMark size="sm" />
                  ) : (
                    <PetrolMark size="sm" />
                  )}
                  <span className="flex-1 truncate text-[13px] text-ink">
                    {m.name}
                  </span>
                  {purpose !== "sale" && (
                    <span className="text-[11px] text-muted-2">
                      {m.dayRate}/{m.shortRate}/{m.weekRate}/{m.monthRate} ₽
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!isLoading && models.length === 0 && (
        <div className="rounded-[10px] bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          {purpose === "sale"
            ? "Нет моделей для продажи. Выберите из «Других моделей» или отметьте «Продаём» в «Скутеры → Модели»."
            : purpose === "rent"
              ? "Нет моделей для аренды. Выберите из «Других моделей» или отметьте «Сдаём в аренду» в «Скутеры → Модели»."
              : "Каталог моделей пуст. Добавьте модели в «Скутеры → Модели» — они здесь появятся."}
        </div>
      )}

      {selected && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-2">
          {selected.isElectric ? (
            <ElectricMark size="sm" withText />
          ) : (
            <PetrolMark size="sm" withText />
          )}
          {purpose === "sale" ? (
            <span>
              Выбрано: <b className="text-ink">{selected.name}</b>
              {selectedIsOther && " · при добавлении отметим модель «Продаём»"}
            </span>
          ) : (
            <span>
              Выбрано: <b className="text-ink">{selected.name}</b> · ₽/сут:
              1–2 дня <b className="text-ink">{selected.dayRate}</b>, 3–6 дней{" "}
              <b className="text-ink">{selected.shortRate}</b>, 7–29 дней{" "}
              <b className="text-ink">{selected.weekRate}</b>, 30+ дней{" "}
              <b className="text-ink">{selected.monthRate}</b>
              {selectedIsOther && " · при добавлении отметим модель «Сдаём в аренду»"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Преобразует имя модели в legacy-enum для совместимости (jog/gear/honda/tank). */
export function modelEnumFromName(name: string): "jog" | "gear" | "honda" | "tank" {
  const lower = name.toLowerCase();
  if (lower.includes("jog")) return "jog";
  if (lower.includes("gear")) return "gear";
  if (lower.includes("honda")) return "honda";
  if (lower.includes("tank")) return "tank";
  return "jog";
}

/** Префикс для имени скутера: «Yamaha Jog» → «Jog», «Honda DIO» → «Honda». */
export function scooterPrefixFromModelName(name: string): string {
  // Берём последнее слово из имени модели — обычно оно короткое (Jog, Gear, DIO, T150)
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "Scooter";
  return parts[parts.length - 1]!;
}
