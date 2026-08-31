import { useMemo, useState } from "react";
import { Package, Pencil, Search, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useApiScooters, usePatchScooter } from "@/lib/api/scooters";
import type { ApiScooter } from "@/lib/api/types";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { EmptyState, SectionCard, StatTile } from "./SalesUI";
import { fmt, fmtCompact } from "./salesUtils";

/**
 * «В продаже» (31.08) — техника со статусом «Продаётся».
 *
 * Данные те же, что в карточке техники: пробег, комментарий, цена закупа и
 * цена продажи правятся здесь и сразу видны во вкладке «Скутеры» — это одно
 * и то же поле, а не вторая копия. Быстрая правка вынесена в маленькое окно,
 * чтобы проставить цену не открывая всю карточку.
 */

export function SalesStock({
  onOpenScooter,
  onSell,
}: {
  onOpenScooter: (id: number) => void;
  onSell: (scooterId: number) => void;
}) {
  const { data: scooters = [], isLoading } = useApiScooters();
  const { data: models = [] } = useApiScooterModels();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ApiScooter | null>(null);

  const modelById = useMemo(
    () => new Map(models.map((m) => [m.id, m] as const)),
    [models],
  );

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return scooters
      .filter((s) => s.baseStatus === "for_sale" && !s.archivedAt)
      .filter((s) => {
        if (!needle) return true;
        const model = s.modelId != null ? modelById.get(s.modelId) : null;
        return [s.name, s.vin, s.engineNo, s.frameNumber, s.purchaseBatch, model?.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => (b.salePrice ?? 0) - (a.salePrice ?? 0));
  }, [scooters, q, modelById]);

  const sums = useMemo(() => {
    const price = list.reduce((s, x) => s + (x.salePrice ?? 0), 0);
    const cost = list.reduce((s, x) => s + (x.purchasePrice ?? 0), 0);
    const noPrice = list.filter((x) => !x.salePrice).length;
    return { price, cost, profit: price - cost, noPrice };
  }, [list]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Единиц в продаже"
          value={fmt(list.length)}
          suffix="ед."
          hint={sums.noPrice ? `${sums.noPrice} без цены продажи` : "у всех есть цена"}
          icon={<Package size={13} />}
        />
        <StatTile
          label="Сумма к продаже"
          value={fmtCompact(sums.price)}
          suffix="₽"
          hint="по ценам из карточек"
          icon={<Tag size={13} />}
          accent
        />
        <StatTile
          label="Вложено (закуп)"
          value={fmtCompact(sums.cost)}
          suffix="₽"
          hint="сумма цен закупа"
        />
        <StatTile
          label="Ожидаемая прибыль"
          value={fmtCompact(sums.profit)}
          suffix="₽"
          hint={
            sums.price > 0
              ? `маржинальность ${Math.round((sums.profit / sums.price) * 100)}%`
              : "цены не заданы"
          }
        />
      </div>

      <SectionCard
        title="Техника в продаже"
        hint="статус «Продаётся» в разделе «Скутеры»"
        action={
          <div className="relative w-[220px] max-w-full">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Модель, VIN, двигатель…"
              className="h-8 w-full rounded-full border border-border bg-surface pl-8 pr-7 text-[12.5px] outline-none focus:border-emerald-500"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-2 hover:text-ink"
              >
                <X size={13} />
              </button>
            )}
          </div>
        }
      >
        {isLoading ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted">Загружаем…</div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Package size={22} />}
            title={q ? "Ничего не нашли" : "Техники в продаже нет"}
            text={
              q
                ? "Попробуйте другой запрос — ищем по модели, VIN, номеру двигателя и партии."
                : "Чтобы техника попала сюда, переведите её в статус «Продаётся» в карточке — в разделе «Скутеры»."
            }
          />
        ) : (
          <>
            {/* Телефон: карточки с крупными кнопками под палец. */}
            <div className="flex flex-col md:hidden">
              {list.map((s) => {
                const model = s.modelId != null ? modelById.get(s.modelId) : null;
                const profit = (s.salePrice ?? 0) - (s.purchasePrice ?? 0);
                return (
                  <div
                    key={s.id}
                    className="flex flex-col gap-2 border-b border-border/60 px-4 py-3 last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenScooter(s.id)}
                      className="flex flex-col gap-0.5 text-left"
                    >
                      <span className="text-[14px] font-bold text-ink">
                        {model?.name ?? s.name}
                      </span>
                      <span className="text-[11.5px] text-muted">
                        {fmt(s.mileage ?? 0)} км · VIN {s.vin || "—"}
                        {s.purchaseBatch && ` · ${s.purchaseBatch}`}
                      </span>
                    </button>
                    <div className="flex items-center gap-2">
                      {s.salePrice ? (
                        <span className="text-[15px] font-bold tabular-nums text-ink">
                          {fmt(s.salePrice)} ₽
                        </span>
                      ) : (
                        <span className="rounded-full bg-orange-soft px-2 py-0.5 text-[11px] font-bold text-orange-ink">
                          цена не задана
                        </span>
                      )}
                      {s.salePrice && s.purchasePrice != null && (
                        <span
                          className={cn(
                            "text-[12px] tabular-nums",
                            profit >= 0 ? "text-emerald-700" : "text-red-ink",
                          )}
                        >
                          {profit >= 0 ? "+" : ""}
                          {fmt(profit)} ₽
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditing(s)}
                        className="ml-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-soft text-muted"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onSell(s.id)}
                        className="h-10 rounded-full bg-emerald-600 px-4 text-[13px] font-bold text-white"
                      >
                        Продать
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] text-[12.5px]">
              <thead>
                <tr className="border-b border-border/60 text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
                  <th className="px-4 py-2 text-left font-bold">Техника</th>
                  <th className="px-2 py-2 text-left font-bold">Идентификация</th>
                  <th className="px-2 py-2 text-right font-bold">Пробег</th>
                  <th className="px-2 py-2 text-right font-bold">Закуп</th>
                  <th className="px-2 py-2 text-right font-bold">Цена продажи</th>
                  <th className="px-2 py-2 text-right font-bold">Прибыль</th>
                  <th className="px-4 py-2 text-right font-bold" />
                </tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const model = s.modelId != null ? modelById.get(s.modelId) : null;
                  const profit = (s.salePrice ?? 0) - (s.purchasePrice ?? 0);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => onOpenScooter(s.id)}
                      className="cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-surface-soft/60"
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-ink">
                          {model?.name ?? s.name}
                        </div>
                        <div className="text-[11px] text-muted-2">
                          {s.year ? `${s.year} г.` : "год не указан"}
                          {s.color && ` · ${s.color}`}
                          {s.purchaseBatch && ` · ${s.purchaseBatch}`}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-[11.5px] text-muted">
                        <div>VIN {s.vin || "—"}</div>
                        <div>двиг. {s.engineNo || "—"}</div>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {fmt(s.mileage ?? 0)} км
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-muted">
                        {s.purchasePrice != null ? `${fmt(s.purchasePrice)} ₽` : "—"}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {s.salePrice ? (
                          <span className="font-bold tabular-nums text-ink">
                            {fmt(s.salePrice)} ₽
                          </span>
                        ) : (
                          <span className="rounded-full bg-orange-soft px-2 py-0.5 text-[11px] font-bold text-orange-ink">
                            цена не задана
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2.5 text-right tabular-nums",
                          profit >= 0 ? "text-emerald-700" : "text-red-ink",
                        )}
                      >
                        {s.salePrice && s.purchasePrice != null
                          ? `${profit >= 0 ? "+" : ""}${fmt(profit)} ₽`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing(s);
                            }}
                            title="Быстрая правка цен и пробега"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-soft text-muted transition-colors hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSell(s.id);
                            }}
                            className="rounded-full bg-emerald-600 px-3 py-1.5 text-[11.5px] font-bold text-white transition-transform active:scale-[0.98]"
                          >
                            Продать
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </SectionCard>

      {editing && (
        <QuickEditDialog scooter={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

/**
 * Быстрая правка того, что нужно продавцу: пробег, закуп, цена продажи,
 * партия и комментарий. Пишет в карточку техники — те же поля, что в
 * «Скутерах», второй копии данных нет.
 */
function QuickEditDialog({
  scooter,
  onClose,
}: {
  scooter: ApiScooter;
  onClose: () => void;
}) {
  const patch = usePatchScooter();
  const [mileage, setMileage] = useState(String(scooter.mileage ?? ""));
  const [purchase, setPurchase] = useState(String(scooter.purchasePrice ?? ""));
  const [sale, setSale] = useState(String(scooter.salePrice ?? ""));
  const [batch, setBatch] = useState(scooter.purchaseBatch ?? "");
  const [note, setNote] = useState(scooter.note ?? "");

  const profit = (Number(sale) || 0) - (Number(purchase) || 0);

  const save = async () => {
    try {
      await patch.mutateAsync({
        id: scooter.id,
        patch: {
          mileage: Number(mileage) || 0,
          purchasePrice: purchase === "" ? null : Number(purchase),
          salePrice: sale === "" ? null : Number(sale),
          purchaseBatch: batch.trim() || null,
          note: note.trim() || null,
        },
      });
      toast.success("Данные техники обновлены");
      onClose();
    } catch {
      toast.error("Не удалось сохранить");
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 animate-backdrop-in">
      <div className="w-full max-w-[460px] rounded-2xl bg-surface p-5 shadow-card-lg animate-modal-in">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold text-ink">{scooter.name}</div>
            <div className="mt-0.5 text-[12px] text-muted">
              VIN {scooter.vin || "—"} · двиг. {scooter.engineNo || "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-2 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Пробег" suffix="км" value={mileage} onChange={setMileage} numeric />
          <Field label="Партия закупа" value={batch} onChange={setBatch} placeholder="Партия 3, апрель" />
          <Field
            label="Цена закупа"
            suffix="₽"
            value={purchase}
            onChange={setPurchase}
            numeric
          />
          <Field label="Цена продажи" suffix="₽" value={sale} onChange={setSale} numeric />
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-soft px-3 py-2 text-[12.5px]">
          <span className="text-muted">Прибыль со сделки</span>
          <b
            className={cn(
              "tabular-nums",
              profit >= 0 ? "text-emerald-700" : "text-red-ink",
            )}
          >
            {profit >= 0 ? "+" : ""}
            {fmt(profit)} ₽
          </b>
        </div>

        <label className="mt-3 flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
            Комментарий
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Что важно знать о состоянии, торге, комплектации"
            className="rounded-[12px] border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-emerald-500"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-[13px] font-semibold text-muted hover:text-ink"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={save}
            disabled={patch.isPending}
            className="rounded-full bg-emerald-600 px-5 py-2 text-[13px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  suffix,
  numeric,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  numeric?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </span>
      <span className="relative">
        <input
          inputMode={numeric ? "numeric" : undefined}
          value={value}
          placeholder={placeholder}
          onChange={(e) =>
            onChange(numeric ? e.target.value.replace(/[^\d]/g, "") : e.target.value)
          }
          className={cn(
            "h-10 w-full rounded-[12px] border border-border bg-surface pl-3 text-[14px] outline-none focus:border-emerald-500",
            numeric ? "font-semibold tabular-nums" : "",
            suffix ? "pr-9" : "pr-3",
          )}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-2">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}
