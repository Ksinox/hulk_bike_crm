/**
 * v0.4.0 — модалка выбора пунктов из прейскуранта повреждений.
 *
 * Используется в Service.tsx для добавления пунктов в чек-лист ремонта.
 * Заказчик: «при нажатии "+ пункт" открывается модалка с прейскурантом
 * повреждений, чтобы выбрать те которые хотим ещё добавить».
 *
 * UI: список групп (по моделям скутеров), внутри — позиции с чекбоксами.
 * Поле поиска фильтрует по name. Выбранные позиции добавляются в чек-лист
 * через переданный onAdd колбэк.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiPriceList } from "@/lib/api/price-list";

export type PickedItem = {
  /** Название (попадёт в repair_progress.title) */
  title: string;
  /** Цена-снимок (priceA из прайса) */
  priceSnapshot: number;
  /** Сколько штук добавить (qty) */
  qty: number;
};

export function PriceItemsPicker({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  /** Возвращается массив выбранных пунктов; модалка закроется после. */
  onAdd: (items: PickedItem[]) => void;
}) {
  const { data: groups = [], isLoading } = useApiPriceList();
  const [closing, setClosing] = useState(false);
  const [search, setSearch] = useState("");
  // selected: itemId -> qty
  const [selected, setSelected] = useState<Map<number, number>>(new Map());

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) =>
          i.name.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, q]);

  const toggle = (itemId: number) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.set(itemId, 1);
      return next;
    });
  };

  const setQty = (itemId: number, qty: number) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (qty <= 0) next.delete(itemId);
      else next.set(itemId, Math.min(qty, 99));
      return next;
    });
  };

  const submit = () => {
    if (selected.size === 0) {
      requestClose();
      return;
    }
    const out: PickedItem[] = [];
    for (const g of groups) {
      for (const item of g.items) {
        const qty = selected.get(item.id);
        if (!qty) continue;
        out.push({
          title: item.name,
          priceSnapshot: item.priceA ?? 0,
          qty,
        });
      }
    }
    onAdd(out);
    requestClose();
  };

  const totalSum = (() => {
    let s = 0;
    for (const g of groups) {
      for (const i of g.items) {
        const qty = selected.get(i.id);
        if (!qty) continue;
        s += (i.priceA ?? 0) * qty;
      }
    }
    return s;
  })();

  return (
    <div
      className={cn(
        "fixed inset-0 z-[120] flex items-center justify-center bg-ink/55 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
    >
      <div
        className={cn(
          "flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
            Прейскурант повреждений
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-border bg-surface-soft px-5 py-2">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по позиции…"
              className="h-9 w-full rounded-full bg-white pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-muted-2 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isLoading && (
            <div className="text-[13px] text-muted">Загружаем прайс…</div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="text-[13px] text-muted">Ничего не найдено.</div>
          )}
          {filtered.map((g) => (
            <div key={g.id} className="mb-3">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-2">
                {g.name}
              </div>
              <div className="flex flex-col gap-1">
                {g.items.map((i) => {
                  const isOn = selected.has(i.id);
                  const qty = selected.get(i.id) ?? 0;
                  return (
                    <div
                      key={i.id}
                      className={cn(
                        "flex items-center gap-2 rounded-[10px] border px-3 py-1.5 text-[12px]",
                        isOn
                          ? "border-blue-500 bg-blue-50"
                          : "border-border bg-surface-soft hover:border-blue-300",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(i.id)}
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border",
                          isOn
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-border bg-white",
                        )}
                      >
                        {isOn && <Check size={12} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggle(i.id)}
                        className="min-w-0 flex-1 text-left font-semibold text-ink"
                      >
                        {i.name}
                      </button>
                      {i.priceA != null && (
                        <span className="text-muted-2 tabular-nums">
                          {i.priceA.toLocaleString("ru-RU")} ₽
                        </span>
                      )}
                      {isOn && (
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={qty}
                          onChange={(e) =>
                            setQty(i.id, Number(e.target.value) || 1)
                          }
                          className="h-7 w-14 rounded-[6px] border border-border bg-white px-2 text-[12px] text-ink outline-none focus:border-blue-600"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-soft px-5 py-3">
          <div className="text-[12px] text-muted">
            Выбрано: <b className="text-ink">{selected.size}</b>
            {totalSum > 0 && (
              <>
                {" "}
                · итого{" "}
                <b className="tabular-nums text-ink">
                  {totalSum.toLocaleString("ru-RU")} ₽
                </b>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="rounded-full border border-border bg-surface px-4 py-1.5 text-[12px] font-semibold text-muted hover:bg-border"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={selected.size === 0}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-[12px] font-bold text-white",
                selected.size === 0
                  ? "cursor-not-allowed bg-surface text-muted-2"
                  : "bg-blue-600 hover:bg-blue-700",
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
