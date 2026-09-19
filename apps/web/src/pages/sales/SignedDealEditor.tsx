import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { ApiError } from "@/lib/api";
import { confirmDialog, toast } from "@/lib/toast";
import { Sensitive } from "@/components/Sensitive";
import { useCan } from "@/lib/permissions";
import { useEditSignedDeal, useSaleManagers, type SaleDeal } from "@/lib/api/sales";
import { ManagerAvatar } from "./SalesUI";
import { fmt } from "./salesUtils";

/**
 * Правки 7.0 (п.7): директор исправляет проданную сделку — цену продажи,
 * закуп, менеджера и его процент. Прибыль и вознаграждение пересчитываются
 * на глазах; сохранение спрашивает подтверждение со списком изменений.
 * Закуп, как и везде, открывается ключом директора.
 */
export function SignedDealEditor({ deal, onDone }: { deal: SaleDeal; onDone: () => void }) {
  const canProfit = useCan("data.profit");
  const { data: mgrData } = useSaleManagers();
  const managers = mgrData?.items ?? [];
  const edit = useEditSignedDeal();

  const [price, setPrice] = useState(String(deal.price));
  const [purchase, setPurchase] = useState(deal.purchasePrice != null ? String(deal.purchasePrice) : "");
  const [managerId, setManagerId] = useState<number | null>(deal.managerId);
  const [pct, setPct] = useState(String(deal.managerCommissionPct ?? 0));

  const priceN = Number(price || 0);
  const purchaseN = purchase === "" ? null : Number(purchase);
  const pctN = managerId == null ? 0 : Math.min(100, Number(pct || 0));
  const profit = priceN - (purchaseN ?? 0);
  const commission = pctN > 0 ? Math.max(0, Math.round((profit * pctN) / 100)) : 0;

  // Менеджер сделки мог уйти в архив — всё равно показываем его кнопкой.
  const options = useMemo(() => {
    const list = managers.map((m) => ({ id: m.id, name: m.name, color: m.avatarColor, pct: m.commissionPct }));
    if (deal.managerId != null && !list.some((m) => m.id === deal.managerId)) {
      list.unshift({
        id: deal.managerId,
        name: deal.managerName ?? "менеджер",
        color: deal.managerColor ?? "blue",
        pct: deal.managerCommissionPct ?? 0,
      });
    }
    return list;
  }, [managers, deal]);

  const pickManager = (id: number | null) => {
    setManagerId(id);
    const m = options.find((x) => x.id === id);
    // Сменили менеджера — его процент по умолчанию (можно поправить).
    if (id !== deal.managerId) setPct(String(m?.pct ?? 0));
    else setPct(String(deal.managerCommissionPct ?? 0));
  };

  const changes: string[] = [];
  if (priceN !== deal.price) changes.push(`цена продажи ${fmt(deal.price)} → ${fmt(priceN)} ₽`);
  if (canProfit && (purchaseN ?? null) !== (deal.purchasePrice ?? null))
    changes.push(`закуп ${deal.purchasePrice != null ? fmt(deal.purchasePrice) : "—"} → ${purchaseN != null ? fmt(purchaseN) : "—"} ₽`);
  if (managerId !== deal.managerId)
    changes.push(`менеджер ${deal.managerName ?? "—"} → ${options.find((m) => m.id === managerId)?.name ?? "—"}`);
  if (canProfit && managerId != null && pctN !== (deal.managerCommissionPct ?? 0))
    changes.push(`процент ${deal.managerCommissionPct ?? 0} → ${pctN}%`);

  const valid = priceN >= 1 && (purchaseN == null || purchaseN >= 0) && pctN >= 0 && pctN <= 100;

  const save = async () => {
    if (!valid || changes.length === 0) return;
    const ok = await confirmDialog({
      title: `Исправить сделку #${String(deal.id).padStart(4, "0")}?`,
      message: `${changes.join(" · ")}. Изменение попадёт в журнал с прежними цифрами.`,
      confirmText: "Сохранить",
    });
    if (!ok) return;
    try {
      await edit.mutateAsync({
        id: deal.id,
        ...(priceN !== deal.price ? { price: priceN } : {}),
        ...(canProfit && (purchaseN ?? null) !== (deal.purchasePrice ?? null) ? { purchasePrice: purchaseN } : {}),
        ...(managerId !== deal.managerId ? { managerId } : {}),
        ...(canProfit && managerId != null ? { managerCommissionPct: pctN } : {}),
      });
      toast.success("Сделка исправлена", changes.join(" · "));
      onDone();
    } catch (e) {
      const b = (e as ApiError)?.body as { message?: string } | undefined;
      toast.error("Не сохранилось", b?.message ?? (e as Error).message);
    }
  };

  const input =
    "h-11 w-full rounded-xl border border-border bg-surface px-3 text-right text-[16px] font-bold tabular-nums text-ink outline-none focus:border-blue-600";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-3.5" data-signed-edit>
      <div className="text-[13px] font-bold text-ink">Исправить проданную сделку</div>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Цена продажи, ₽">
          <input
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 9))}
            aria-label="Цена продажи"
            className={input}
          />
        </Field>
        {canProfit && (
          <Field label="Закуп, ₽">
            <Sensitive block>
              <input
                inputMode="numeric"
                value={purchase}
                onChange={(e) => setPurchase(e.target.value.replace(/\D/g, "").slice(0, 9))}
                placeholder="—"
                aria-label="Закуп"
                className={input}
              />
            </Sensitive>
          </Field>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">Кто продал</div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Менеджер">
          {options.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={managerId === m.id}
              onClick={() => pickManager(m.id)}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-full pl-1.5 pr-3.5 text-[13.5px] font-semibold transition-colors",
                managerId === m.id ? "bg-ink text-white" : "bg-surface text-ink-2 shadow-card-sm hover:bg-border",
              )}
            >
              <ManagerAvatar name={m.name} color={m.color} size={30} />
              {m.name}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={managerId == null}
            onClick={() => pickManager(null)}
            className={cn(
              "inline-flex h-11 items-center rounded-full px-3.5 text-[13.5px] font-semibold transition-colors",
              managerId == null ? "bg-ink text-white" : "bg-surface text-muted shadow-card-sm hover:bg-border",
            )}
          >
            Без менеджера
          </button>
        </div>
      </div>

      {canProfit && managerId != null && (
        <div className="grid grid-cols-[120px_1fr] items-end gap-2.5">
          <Field label="% с прибыли">
            <input
              inputMode="numeric"
              value={pct}
              onChange={(e) => setPct(e.target.value.replace(/\D/g, "").slice(0, 3))}
              aria-label="Процент менеджера с прибыли"
              className={input}
            />
          </Field>
          <div className="pb-2.5 text-[12.5px] text-muted">
            менеджеру{" "}
            <Sensitive>
              <b className="tabular-nums text-emerald-700">{fmt(commission)} ₽</b>
            </Sensitive>
          </div>
        </div>
      )}

      {canProfit && (
        <div className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-[12.5px]">
          <span className="text-muted">Прибыль со сделки</span>
          <Sensitive>
            <b className={cn("tabular-nums", profit >= 0 ? "text-emerald-700" : "text-red-ink")}>
              {profit >= 0 ? "+" : ""}
              {fmt(profit)} ₽
            </b>
          </Sensitive>
        </div>
      )}

      {!valid && <div className="text-[12.5px] font-semibold text-red-ink">Цена продажи больше нуля, процент — от 0 до 100</div>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="h-11 flex-1 rounded-xl bg-surface text-[13.5px] font-bold text-muted shadow-card-sm"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!valid || changes.length === 0 || edit.isPending}
          className="h-11 flex-[1.6] rounded-xl bg-ink text-[13.5px] font-bold text-white disabled:opacity-40"
        >
          {edit.isPending ? "Сохраняем…" : changes.length ? "Сохранить" : "Нет изменений"}
        </button>
      </div>
    </div>
  );
}

/** Подпись поля — div, а не label: закуп внутри скрытого блока, и нажатие
 *  по подписи не должно «протыкать» его к полю ввода. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">{label}</span>
      {children}
    </div>
  );
}
