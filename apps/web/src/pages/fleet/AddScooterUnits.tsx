import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, ClipboardPaste, Hash, Plus, Sparkles, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SuggestInput } from "@/components/SuggestInput";
import { LatinInput, toLatin } from "@/components/LatinInput";
import {
  MAX_UNITS,
  digitsOnly,
  normalizeVin,
  parseGrid,
  plural,
  type Category,
  type CommonValues,
  type RowIssue,
  type UnitRow,
} from "./addScooterDraft";

/**
 * Шаг «Единицы» мастера добавления техники (релиз 2.0.1).
 *
 * Компьютер и планшет лёжа — таблица: строка «Для всех» сверху, ниже по
 * строке на скутер; Enter — вниз по столбцу, вставка из Excel заполняет
 * ячейки вправо и вниз. Телефон и планшет стоя — карточки с крупными
 * полями, те же данные.
 */

export type ColKey = "vin" | "engineNo" | "year" | "color" | "mileage" | "price" | "note";
type CommonKey = keyof CommonValues;

type ColDef = {
  key: ColKey;
  label: string;
  short: string;
  width: string;
  placeholder: string;
  mono?: boolean;
  numeric?: boolean;
  common: boolean;
};

export function columnsFor(category: Category): ColDef[] {
  return [
    { key: "vin", label: "Номер рамы (VIN)", short: "Рама (VIN)", width: "w-[190px]", placeholder: "SA36J-605232", mono: true, common: false },
    { key: "engineNo", label: "Номер двигателя", short: "Двигатель", width: "w-[150px]", placeholder: "A3E1-123456", mono: true, common: false },
    { key: "year", label: "Год выпуска", short: "Год", width: "w-[78px]", placeholder: "2020", numeric: true, common: true },
    { key: "color", label: "Цвет", short: "Цвет", width: "w-[120px]", placeholder: "Чёрный", common: true },
    { key: "mileage", label: "Пробег, км", short: "Пробег, км", width: "w-[100px]", placeholder: "0", numeric: true, common: true },
    category === "sale"
      ? { key: "price", label: "Цена продажи, ₽", short: "Цена продажи, ₽", width: "w-[130px]", placeholder: "95000", numeric: true, common: true }
      : { key: "price", label: "Рыночная стоимость, ₽", short: "Рыночная, ₽", width: "w-[120px]", placeholder: "150000", numeric: true, common: true },
    { key: "note", label: "Комментарий", short: "Комментарий", width: "min-w-[160px]", placeholder: "царапина на крыле", common: true },
  ];
}

function cleanValue(col: ColDef, raw: string): string {
  // Рама — только латиница (16.09): двойники → латиница, прочие русские — прочь.
  if (col.key === "vin") return normalizeVin(toLatin(raw).value);
  if (col.key === "engineNo") return raw.toUpperCase().slice(0, 50);
  if (col.key === "year") return digitsOnly(raw, 4);
  if (col.numeric) return digitsOnly(raw, 9);
  return raw.slice(0, col.key === "note" ? 500 : 50);
}

export function applyGrid(
  rows: UnitRow[],
  cols: ColDef[],
  startRow: number,
  startCol: ColKey,
  grid: string[][],
  makeRow: () => UnitRow,
): { rows: UnitRow[]; filled: number; cut: number } {
  const c0 = cols.findIndex((c) => c.key === startCol);
  const next = rows.map((r) => ({ ...r }));
  let filled = 0;
  let cut = 0;
  grid.forEach((cells, i) => {
    const ri = startRow + i;
    if (ri >= MAX_UNITS) {
      cut += 1;
      return;
    }
    while (next.length <= ri) next.push(makeRow());
    const row = next[ri]!;
    cells.forEach((cell, j) => {
      const col = cols[c0 + j];
      if (!col) return;
      (row as Record<ColKey, string>)[col.key] = cleanValue(col, cell);
    });
    filled += 1;
  });
  return { rows: next, filled, cut };
}

type EditorProps = {
  category: Category;
  rows: UnitRow[];
  onRowChange: (key: string, patch: Partial<UnitRow>) => void;
  common: CommonValues;
  onCommonChange: (patch: Partial<CommonValues>) => void;
  holds: boolean;
  /** Номер, который получит строка (с учётом «авто»). */
  slotOf: (index: number) => number | null;
  freeSlots: number[];
  issues: Map<string, RowIssue[]>;
  onAddRow: () => void;
  onRemoveRow: (key: string) => void;
  onPasteGrid: (rowIndex: number, col: ColKey, grid: string[][]) => void;
  onOpenPasteList: () => void;
  tableMode: boolean;
  touch: boolean;
  /** Цвета, которые уже вписывали, — подсказки в поле «Цвет». */
  colorSuggestions: string[];
  /** Цена «для всех» подставлена из последней по модели (пока не меняли). */
  pricePrefill?: { value: number; modelName: string } | null;
};

/**
 * Поле ячейки: у «Цвета» — с подсказками из вписанного раньше, у
 * остальных — обычное.
 */
type CellProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (v: string) => void;
  suggestions?: string[];
  touch: boolean;
  /** Рама: пишем латиницей при любой раскладке. */
  latin?: boolean;
};
function CellInput({ suggestions, touch, latin, onValueChange, ...rest }: CellProps) {
  if (latin) return <LatinInput {...rest} onValueChange={onValueChange} />;
  if (suggestions) {
    return <SuggestInput {...rest} touch={touch} suggestions={suggestions} onValueChange={onValueChange} />;
  }
  return <input {...rest} onChange={(e) => onValueChange(e.target.value)} />;
}

export function UnitsEditor(p: EditorProps) {
  const cols = columnsFor(p.category);
  const [slotFor, setSlotFor] = useState<string | null>(null);
  const slotRowIndex = slotFor ? p.rows.findIndex((r) => r.key === slotFor) : -1;

  const blocking = [...p.issues.values()].flat().filter((x) => x.blocking).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 text-[12.5px] text-muted">
          {p.tableMode
            ? p.touch
              ? "Строка «Для всех» подставляется в пустые ячейки. Столбцы из Excel вставляются в ячейку сразу на несколько строк."
              : "Строка «Для всех» подставляется в пустые ячейки. Можно вставить столбцы из Excel — встаньте в ячейку и нажмите Ctrl+V."
            : "Общее — один раз, ниже — своё у каждой единицы."}
        </div>
        <button
          type="button"
          onClick={p.onOpenPasteList}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface font-semibold text-ink-2 hover:border-blue-600/50 hover:text-blue-700",
            p.touch ? "h-11 px-4 text-[13px]" : "h-8 px-3 text-[12px]",
          )}
        >
          <ClipboardPaste size={14} /> Вставить списком
        </button>
      </div>

      {p.pricePrefill && (
        <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[12.5px] text-blue-900">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-blue-600" />
          <span>
            {p.category === "sale" ? "Цена продажи" : "Рыночная стоимость"} подставлена из
            последней по {p.pricePrefill.modelName}:{" "}
            <b>{p.pricePrefill.value.toLocaleString("ru-RU")} ₽</b>. Изменилась — поправьте в
            {p.tableMode ? " строке «Для всех»" : " «Одинаковое для всех»"}.
          </span>
        </div>
      )}

      {blocking > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">
          <AlertTriangle size={14} className="shrink-0" />
          {blocking === 1 ? "Одна ошибка — ячейка подсвечена красным." : `${blocking} ${plural(blocking, ["ошибка", "ошибки", "ошибок"])} — ячейки подсвечены красным.`}
        </div>
      )}

      {p.tableMode ? (
        <UnitsTable {...p} cols={cols} onSlotClick={setSlotFor} />
      ) : (
        <UnitsCards {...p} cols={cols} onSlotClick={setSlotFor} />
      )}

      {p.rows.length < MAX_UNITS && (
        <button
          type="button"
          onClick={p.onAddRow}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 self-start rounded-full border border-dashed border-blue-600/50 font-semibold text-blue-700 hover:bg-blue-50",
            p.touch ? "h-11 px-4 text-[13.5px]" : "h-8 px-3 text-[12px]",
          )}
        >
          <Plus size={14} /> Ещё единица
        </button>
      )}

      {slotFor && slotRowIndex >= 0 && (
        <SlotSheet
          touch={p.touch}
          rowNo={slotRowIndex + 1}
          current={p.rows[slotRowIndex]!.slot}
          auto={p.slotOf(slotRowIndex)}
          freeSlots={p.freeSlots}
          takenBy={(n) => {
            const i = p.rows.findIndex((r, idx) => idx !== slotRowIndex && r.slot === n);
            return i >= 0 ? i + 1 : null;
          }}
          onPick={(n) => {
            p.onRowChange(slotFor, { slot: n });
            setSlotFor(null);
          }}
          onClose={() => setSlotFor(null)}
        />
      )}
    </div>
  );
}

function issueFor(list: RowIssue[] | undefined, field: keyof UnitRow) {
  const all = (list ?? []).filter((x) => x.field === field);
  return all.find((x) => x.blocking) ?? all[0] ?? null;
}

/* ───────────── Таблица ───────────── */

function UnitsTable(
  p: EditorProps & { cols: ColDef[]; onSlotClick: (key: string) => void },
) {
  const tableRef = useRef<HTMLTableElement>(null);
  const cellH = p.touch ? "h-11" : "h-9";

  const focusCell = (row: number, col: ColKey) => {
    const el = tableRef.current?.querySelector<HTMLInputElement>(
      `input[data-row="${row}"][data-col="${col}"]`,
    );
    el?.focus();
    el?.select();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: ColKey) => {
    if (e.key === "Enter" || (e.key === "ArrowDown" && !e.altKey)) {
      e.preventDefault();
      if (row + 1 < p.rows.length) focusCell(row + 1, col);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (row > 0) focusCell(row - 1, col);
      else focusCell(-1, col);
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>, row: number, col: ColKey) => {
    const text = e.clipboardData.getData("text");
    const t = text.replace(/\r/g, "").replace(/\n+$/, "");
    if (!t.includes("\n") && !t.includes("\t")) return;
    e.preventDefault();
    p.onPasteGrid(row, col, parseGrid(text));
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table ref={tableRef} className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-surface-soft text-left text-[11px] font-bold text-muted">
            <th className="w-10 px-2 py-2 text-center">№</th>
            {p.holds && <th className="w-[92px] px-1.5 py-2">Номер</th>}
            {p.cols.map((c) => (
              <th key={c.key} className={cn("px-1.5 py-2", c.width)}>
                {c.short}
              </th>
            ))}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {/* Для всех */}
          <tr className="border-t border-border bg-blue-50/60">
            <td className="px-2 text-center text-[10.5px] font-bold uppercase leading-tight text-blue-700">
              для
              <br />
              всех
            </td>
            {p.holds && (
              <td className="px-1.5 text-[11px] text-blue-700/80">по порядку</td>
            )}
            {p.cols.map((c) =>
              c.common ? (
                <td key={c.key} className="px-1 py-1.5">
                  <CellInput
                    data-row={-1}
                    data-col={c.key}
                    touch={p.touch}
                    suggestions={c.key === "color" ? p.colorSuggestions : undefined}
                    value={p.common[c.key as CommonKey]}
                    onValueChange={(v) => p.onCommonChange({ [c.key]: cleanValue(c, v) })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "ArrowDown") {
                        e.preventDefault();
                        focusCell(0, c.key);
                      }
                    }}
                    inputMode={c.numeric ? "numeric" : undefined}
                    placeholder={c.placeholder}
                    aria-label={`${c.label} — для всех`}
                    className={cn(
                      "w-full rounded-lg border border-blue-200 bg-white px-2 font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted-2/70 focus:border-blue-600",
                      cellH,
                      c.numeric && "tabular-nums",
                    )}
                  />
                </td>
              ) : (
                <td key={c.key} className="px-2 text-[11px] text-muted-2">
                  у каждого своё
                </td>
              ),
            )}
            <td />
          </tr>

          {p.rows.map((r, i) => {
            const list = p.issues.get(r.key);
            const slot = p.slotOf(i);
            const slotIssue = issueFor(list, "slot");
            const rowErrors = (list ?? []).filter((x) => x.blocking);
            return (
              <tr
                key={r.key}
                className={cn(
                  "border-t border-border align-top",
                  rowErrors.length ? "bg-red-50/40" : "bg-surface",
                )}
              >
                <td className="px-2 pt-3 text-center text-[12px] font-bold tabular-nums text-muted-2">
                  {i + 1}
                </td>
                {p.holds && (
                  <td className="px-1 py-1.5">
                    <SlotButton
                      slot={slot}
                      manual={r.slot != null}
                      error={slotIssue?.blocking ? slotIssue.message : null}
                      heightClass={cellH}
                      onClick={() => p.onSlotClick(r.key)}
                    />
                  </td>
                )}
                {p.cols.map((c) => {
                  const iss = issueFor(list, c.key);
                  const inherited = c.common ? p.common[c.key as CommonKey] : "";
                  return (
                    <td key={c.key} className="px-1 py-1.5">
                      <CellInput
                        data-row={i}
                        data-col={c.key}
                        touch={p.touch}
                        latin={c.key === "vin"}
                        suggestions={c.key === "color" ? p.colorSuggestions : undefined}
                        value={r[c.key]}
                        onValueChange={(v) => p.onRowChange(r.key, { [c.key]: cleanValue(c, v) })}
                        onKeyDown={(e) => onKey(e, i, c.key)}
                        onPaste={(e) => onPaste(e, i, c.key)}
                        inputMode={c.numeric ? "numeric" : undefined}
                        autoCapitalize={c.mono ? "characters" : undefined}
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder={inherited || (c.key === "vin" && i === 0 ? c.placeholder : "")}
                        aria-label={`${c.label}, строка ${i + 1}`}
                        title={iss?.message}
                        className={cn(
                          "w-full rounded-lg border bg-white px-2 text-ink outline-none placeholder:text-muted-2 focus:border-blue-600",
                          cellH,
                          c.mono && "font-mono text-[12.5px]",
                          c.numeric && "tabular-nums",
                          iss?.blocking
                            ? "border-red-400 bg-red-50"
                            : iss && c.key === "vin" && r.vin
                              ? "border-amber-300"
                              : "border-border",
                        )}
                      />
                      {iss?.blocking ? (
                        <div className="mt-0.5 text-[10.5px] font-semibold leading-tight text-red-600">
                          {iss.message}
                        </div>
                      ) : iss && c.key === "vin" && r.vin ? (
                        <div className="mt-0.5 text-[10.5px] font-semibold leading-tight text-amber-700">
                          {iss.message}
                        </div>
                      ) : null}
                    </td>
                  );
                })}
                <td className="px-1 pt-1.5 text-center">
                  {p.rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => p.onRemoveRow(r.key)}
                      title="Убрать строку"
                      aria-label={`Убрать строку ${i + 1}`}
                      className={cn(
                        "inline-flex w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-red-50 hover:text-red-600",
                        cellH,
                      )}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SlotButton({
  slot,
  manual,
  error,
  heightClass,
  onClick,
}: {
  slot: number | null;
  manual: boolean;
  error: string | null;
  heightClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={error ?? (manual ? "Номер выбран вручную" : "Первый свободный номер")}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-lg border px-2 text-left",
        heightClass,
        error
          ? "border-red-400 bg-red-50"
          : slot == null
            ? "border-amber-300 bg-amber-50"
            : "border-border bg-white hover:border-blue-600/50",
      )}
    >
      {slot != null ? (
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-ink px-1.5 text-[12px] font-bold tabular-nums text-white">
          {slot}
        </span>
      ) : (
        <span className="text-[11px] font-semibold text-amber-800">нет</span>
      )}
      <span className={cn("text-[10.5px] font-semibold", error ? "text-red-600" : "text-muted-2")}>
        {error ? "занят" : manual ? "свой" : "авто"}
      </span>
    </button>
  );
}

/* ───────────── Карточки (телефон, планшет стоя) ───────────── */

function UnitsCards(
  p: EditorProps & { cols: ColDef[]; onSlotClick: (key: string) => void },
) {
  const commonCols = p.cols.filter((c) => c.common);
  const [commonOpen, setCommonOpen] = useState(true);
  const filledCommon = commonCols.filter((c) => p.common[c.key as CommonKey]).length;

  const focusNext = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const all = [
      ...document.querySelectorAll<HTMLInputElement>("[data-unit-field]"),
    ];
    const at = all.indexOf(e.currentTarget);
    const next = all[at + 1];
    if (next) next.focus();
    else e.currentTarget.blur();
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Для всех */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/60">
        <button
          type="button"
          onClick={() => setCommonOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span>
            <span className="block text-[14px] font-bold text-blue-800">Одинаковое для всех</span>
            <span className="block text-[12px] text-blue-700/80">
              {filledCommon
                ? `заполнено ${filledCommon} из ${commonCols.length} — подставится в каждую`
                : "год, цвет, пробег, стоимость — один раз"}
            </span>
          </span>
          <span className="text-[12px] font-semibold text-blue-700">
            {commonOpen ? "Свернуть" : "Открыть"}
          </span>
        </button>
        {commonOpen && (
          <div className="grid grid-cols-2 gap-2.5 px-4 pb-4 sm:grid-cols-3">
            {commonCols.map((c) => (
              <label
                key={c.key}
                className={cn(
                  "flex flex-col gap-1",
                  c.key === "note" && "col-span-2",
                  c.key === "price" && "col-span-2 sm:col-span-1",
                )}
              >
                <span className="text-[12px] font-semibold text-blue-900/80">{c.label}</span>
                <CellInput
                  data-unit-field
                  touch={p.touch}
                  suggestions={c.key === "color" ? p.colorSuggestions : undefined}
                  value={p.common[c.key as CommonKey]}
                  onValueChange={(v) => p.onCommonChange({ [c.key]: cleanValue(c, v) })}
                  onKeyDown={focusNext}
                  inputMode={c.numeric ? "numeric" : undefined}
                  enterKeyHint="next"
                  placeholder={c.placeholder}
                  className={cn(
                    "h-12 w-full rounded-xl border border-blue-200 bg-white px-3 text-[15px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted-2/70 focus:border-blue-600",
                    c.numeric && "tabular-nums",
                  )}
                />
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {p.rows.map((r, i) => {
          const list = p.issues.get(r.key);
          const slot = p.slotOf(i);
          const slotIssue = issueFor(list, "slot");
          const bad = (list ?? []).some((x) => x.blocking);
          return (
            <div
              key={r.key}
              className={cn(
                "rounded-2xl border bg-white p-3.5",
                bad ? "border-red-300" : "border-border",
              )}
            >
              <div className="mb-2.5 flex items-center gap-2">
                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-surface-soft px-2 text-[12px] font-bold tabular-nums text-muted">
                  {i + 1}
                </span>
                <span className="text-[14px] font-bold text-ink">Единица {i + 1}</span>
                <span className="flex-1" />
                {p.rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => p.onRemoveRow(r.key)}
                    aria-label={`Убрать единицу ${i + 1}`}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-muted-2 active:bg-red-50 active:text-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              {p.holds && (
                <button
                  type="button"
                  onClick={() => p.onSlotClick(r.key)}
                  className={cn(
                    "mb-2.5 flex h-12 w-full items-center gap-2.5 rounded-xl border px-3 text-left",
                    slotIssue?.blocking
                      ? "border-red-400 bg-red-50"
                      : slot == null
                        ? "border-amber-300 bg-amber-50"
                        : "border-border bg-surface-soft/50",
                  )}
                >
                  <Hash size={15} className="shrink-0 text-muted-2" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-muted">
                    Арендный номер
                  </span>
                  {slot != null ? (
                    <span className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-ink px-2 text-[13px] font-bold tabular-nums text-white">
                      {slot}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[12px] font-bold text-amber-800">
                      нет
                    </span>
                  )}
                  <span className="shrink-0 text-[11px] font-semibold text-muted-2">
                    {r.slot != null ? "свой" : "авто"}
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-muted-2" />
                </button>
              )}
              {!p.holds ? null : slotIssue?.blocking ? (
                <div className="-mt-1.5 mb-2 text-[12px] font-semibold text-red-600">{slotIssue.message}</div>
              ) : slot == null ? (
                <div className="-mt-1.5 mb-2 text-[12px] font-semibold text-amber-800">
                  Свободные номера закончились — добавьте номера на шаге «Модель и партия»
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2.5">
                {p.cols.map((c) => {
                  const iss = issueFor(list, c.key);
                  const inherited = c.common ? p.common[c.key as CommonKey] : "";
                  // Общее уже задано — поле свёрнуто в подпись, чтобы
                  // карточка не росла. Нажали — можно поменять у этой единицы.
                  return (
                    <CardField
                      key={c.key}
                      col={c}
                      value={r[c.key]}
                      inherited={inherited}
                      issue={iss}
                      wide={c.key === "vin" || c.key === "engineNo" || c.key === "note" || c.key === "price"}
                      onKeyDown={focusNext}
                      suggestions={c.key === "color" ? p.colorSuggestions : undefined}
                      onChange={(v) => p.onRowChange(r.key, { [c.key]: cleanValue(c, v) })}
                    />
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

function CardField({
  col,
  value,
  inherited,
  issue,
  wide,
  suggestions,
  onChange,
  onKeyDown,
}: {
  col: ColDef;
  suggestions?: string[];
  value: string;
  inherited: string;
  issue: RowIssue | null;
  wide: boolean;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const collapsed = col.common && inherited !== "" && value === "" && !expanded;
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(
          "flex min-h-11 flex-col justify-center rounded-xl bg-surface-soft/70 px-3 py-1.5 text-left",
          wide && "col-span-2",
        )}
      >
        <span className="text-[11px] font-semibold text-muted-2">{col.label} · как у всех</span>
        <span className="truncate text-[14px] font-semibold text-ink">{inherited}</span>
      </button>
    );
  }
  return (
    <label className={cn("flex flex-col gap-1", wide && "col-span-2")}>
      <span className="text-[12px] font-semibold text-muted">{col.label}</span>
      <CellInput
        data-unit-field
        touch
        latin={col.key === "vin"}
        suggestions={suggestions}
        value={value}
        autoFocus={expanded}
        onValueChange={onChange}
        onKeyDown={onKeyDown}
        inputMode={col.numeric ? "numeric" : undefined}
        autoCapitalize={col.mono ? "characters" : undefined}
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="next"
        placeholder={inherited || col.placeholder}
        className={cn(
          "h-12 w-full rounded-xl border bg-white px-3 text-[15px] text-ink outline-none placeholder:text-muted-2/50 focus:border-blue-600",
          col.mono && "font-mono text-[14.5px] tracking-wide",
          col.numeric && "tabular-nums",
          issue?.blocking ? "border-red-400 bg-red-50" : "border-border",
        )}
      />
      {issue && (issue.blocking || col.key !== "vin" || value) && (
        <span
          className={cn(
            "text-[12px] font-semibold leading-snug",
            issue.blocking ? "text-red-600" : "text-amber-700",
          )}
        >
          {issue.message}
        </span>
      )}
    </label>
  );
}

/* ───────────── Выбор арендного номера ───────────── */

function SlotSheet({
  touch,
  rowNo,
  current,
  auto,
  freeSlots,
  takenBy,
  onPick,
  onClose,
}: {
  touch: boolean;
  rowNo: number;
  current: number | null;
  auto: number | null;
  freeSlots: number[];
  takenBy: (n: number) => number | null;
  onPick: (n: number | null) => void;
  onClose: () => void;
}) {
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

  return (
    <div
      className={cn(
        "fixed inset-0 z-[160] flex bg-ink/40",
        touch ? "items-end justify-center" : "items-center justify-center p-6",
      )}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-[80dvh] w-full flex-col bg-surface shadow-card-lg",
          touch ? "max-w-[640px] rounded-t-3xl" : "max-w-[460px] rounded-2xl",
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-ink">Арендный номер · единица {rowNo}</div>
            <div className="text-[12px] text-muted-2">Свободно {freeSlots.length}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface-soft"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          <button
            type="button"
            onClick={() => onPick(null)}
            className={cn(
              "mb-3 flex w-full items-center justify-between rounded-xl border px-3.5 text-left",
              touch ? "h-12" : "h-10",
              current == null ? "border-blue-600 bg-blue-50 text-blue-700" : "border-border hover:border-blue-600/50",
            )}
          >
            <span className="text-[13.5px] font-semibold">Первый свободный по порядку</span>
            <span className="text-[12px] font-semibold">{auto != null && current == null ? `сейчас №${auto}` : ""}</span>
          </button>
          <div className={cn("grid gap-1.5", touch ? "grid-cols-6" : "grid-cols-8")}>
            {freeSlots.map((n) => {
              const other = takenBy(n);
              const active = current === n;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={other != null}
                  onClick={() => onPick(n)}
                  title={other != null ? `Выбран в строке ${other}` : undefined}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-xl border font-bold tabular-nums",
                    touch ? "h-12 text-[15px]" : "h-10 text-[13px]",
                    active
                      ? "border-ink bg-ink text-white"
                      : other != null
                        ? "cursor-not-allowed border-border bg-surface-soft text-muted-2"
                        : "border-border bg-white text-ink hover:border-blue-600/60",
                  )}
                >
                  {n}
                  {other != null && <span className="text-[9px] font-semibold leading-none">стр. {other}</span>}
                </button>
              );
            })}
          </div>
          {freeSlots.length === 0 && (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              Свободных номеров нет — увеличьте общее количество на шаге «Модель и партия».
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Вставить списком ───────────── */

export function PasteListDialog({
  touch,
  category,
  onApply,
  onClose,
}: {
  touch: boolean;
  category: Category;
  onApply: (grid: string[][], startCol: ColKey) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const cols = columnsFor(category);
  const [startCol, setStartCol] = useState<ColKey>("vin");
  const grid = text.trim() ? parseGrid(text) : [];
  const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const c0 = cols.findIndex((c) => c.key === startCol);
  const covered = cols.slice(c0, c0 + width).map((c) => c.short.toLowerCase());

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

  return (
    <div
      className={cn(
        "fixed inset-0 z-[160] flex bg-ink/40",
        touch ? "items-end justify-center" : "items-center justify-center p-6",
      )}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-[90dvh] w-full flex-col bg-surface shadow-card-lg",
          touch ? "max-w-[640px] rounded-t-3xl" : "max-w-[560px] rounded-2xl",
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-ink">Вставить списком</div>
            <div className="text-[12px] text-muted-2">
              Каждый скутер — с новой строки. Столбцы из Excel вставятся по порядку.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface-soft"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto p-4">
          <div>
            <div className="mb-1.5 text-[12px] font-semibold text-muted">Первый столбец — это</div>
            <div className="flex flex-wrap gap-1.5">
              {cols.slice(0, 2).map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setStartCol(c.key)}
                  className={cn(
                    "rounded-full border px-3 font-semibold",
                    touch ? "h-10 text-[13px]" : "h-8 text-[12px]",
                    startCol === c.key
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-border bg-white text-ink-2",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={touch ? 7 : 9}
            autoFocus
            spellCheck={false}
            placeholder={"SA36J-605232\tA3E1-100231\nSA36J-605233\tA3E1-100232\nSA36J-605234\tA3E1-100233"}
            className="w-full resize-y rounded-xl border border-border bg-white px-3 py-2.5 font-mono text-[13.5px] leading-relaxed text-ink outline-none focus:border-blue-600"
          />
          <div className="text-[12.5px] text-muted">
            {grid.length === 0
              ? "Скопируйте столбцы из таблицы поставщика или наберите номера рам через перевод строки."
              : `Распознано: ${grid.length} ${plural(grid.length, ["строка", "строки", "строк"])}` +
                (covered.length ? ` · столбцы: ${covered.join(", ")}` : "") +
                (grid.length > MAX_UNITS ? ` · добавим первые ${MAX_UNITS}` : "")}
          </div>
        </div>
        <div
          className="flex gap-2 border-t border-border px-4 py-3"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "rounded-full bg-surface-soft px-5 font-semibold text-ink-2",
              touch ? "h-12 text-[14px]" : "h-9 text-[13px]",
            )}
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={grid.length === 0}
            onClick={() => onApply(grid, startCol)}
            className={cn(
              "flex-1 rounded-full bg-blue-600 px-5 font-bold text-white disabled:opacity-40",
              touch ? "h-12 text-[14px]" : "h-9 text-[13px]",
            )}
          >
            Заполнить {grid.length > 0 ? `${Math.min(grid.length, MAX_UNITS)} ${plural(Math.min(grid.length, MAX_UNITS), ["строку", "строки", "строк"])}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
