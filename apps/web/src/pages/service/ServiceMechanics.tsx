import { useMemo, useState } from "react";
import { Archive, Pencil, Plus, RotateCcw, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useCan } from "@/lib/permissions";
import { TABLET_WIZARD_PANEL } from "@/mobile/tablet";
import {
  useSaveServiceMechanic,
  useServiceMechanics,
  useServiceOrders,
  type ServiceMechanic,
} from "@/lib/api/service-orders";
import { digits, money } from "./serviceOrderUi";

/**
 * Механики сторонних ремонтов (правки 7.0, п.2).
 *
 * Механик — не учётка CRM, как менеджер продаж: имя и процент с конечной
 * прибыли ремонта (к оплате − закуп запчастей). Процент копируется в наряд
 * при назначении — если директор поменяет процент, прошлые ремонты
 * посчитаются по-старому.
 */

/** Выбор механика в наряде: кнопки с именами, «Без механика» — первой. */
export function MechanicChips({
  value,
  onChange,
  touch,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  touch: boolean;
}) {
  const canRepairProfit = useCan("data.repairProfit");
  const { data: all = [] } = useServiceMechanics();
  // Архивного механика оставляем в списке, только если он уже стоит в наряде.
  const list = all.filter((m) => !m.archivedAt || m.id === value);
  if (list.length === 0) return null;
  const chip = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full px-3.5 font-semibold transition-colors",
      touch ? "h-11 text-[14px]" : "h-9 text-[13px]",
      active ? "bg-ink text-white" : "bg-surface text-ink-2 shadow-card-sm hover:bg-border",
    );
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Механик" data-mechanic-chips>
      <button type="button" role="radio" aria-checked={value == null} onClick={() => onChange(null)} className={chip(value == null)}>
        Без механика
      </button>
      {list.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={value === m.id}
          onClick={() => onChange(m.id)}
          className={chip(value === m.id)}
        >
          <Wrench size={touch ? 14 : 13} className={value === m.id ? "text-white/70" : "text-muted-2"} />
          {m.name}
          {canRepairProfit && m.percent != null && (
            <span className={cn("tabular-nums", value === m.id ? "text-white/60" : "text-muted-2")}>{m.percent}%</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Справочник механиков — открывает директор кнопкой «Механики». */
export function MechanicsSheet({ touch, onClose }: { touch: boolean; onClose: () => void }) {
  const canRepairProfit = useCan("data.repairProfit");
  const { data: all = [], isLoading } = useServiceMechanics();
  const { data: orders = [] } = useServiceOrders();
  const save = useSaveServiceMechanic();
  const [editId, setEditId] = useState<number | "new" | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const active = all.filter((m) => !m.archivedAt);
  const archived = all.filter((m) => m.archivedAt);

  /** За всё время: сколько оплаченных ремонтов и сколько механику с них. */
  const stats = useMemo(() => {
    const map = new Map<number, { paid: number; share: number; inWork: number }>();
    for (const o of orders) {
      if (o.mechanicId == null) continue;
      const s = map.get(o.mechanicId) ?? { paid: 0, share: 0, inWork: 0 };
      if (o.status === "paid") {
        s.paid++;
        s.share += o.totals.mechanicShare ?? 0;
      } else if (o.status === "in_work" || o.status === "done") s.inWork++;
      map.set(o.mechanicId, s);
    }
    return map;
  }, [orders]);

  const submit = async (m: { id?: number; name: string; percent: number }) => {
    try {
      await save.mutateAsync(m);
      setEditId(null);
      toast.success(m.id ? "Механик сохранён" : "Механик добавлен", `${m.name} · ${m.percent}% с прибыли ремонта`);
    } catch (e) {
      const b = (e as ApiError)?.body as { message?: string } | undefined;
      toast.error("Не сохранилось", b?.message ?? (e as Error).message);
    }
  };
  const setArchived = async (m: ServiceMechanic, archived: boolean) => {
    try {
      await save.mutateAsync({ id: m.id, archived });
      toast.success(archived ? `${m.name} — в архиве` : `${m.name} снова в списке`,
        archived ? "В новых ремонтах его не выбрать; прошлые ремонты не меняются." : undefined);
    } catch (e) {
      const b = (e as ApiError)?.body as { message?: string } | undefined;
      toast.error("Не сохранилось", b?.message ?? (e as Error).message);
    }
  };

  const body = (
    <>
      <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="font-display text-[20px] font-extrabold text-ink">Механики</div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-muted">
            Процент — с прибыли ремонта: к оплате минус закуп запчастей. Новый процент действует для ремонтов,
            где механика назначат после правки.
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl text-muted-2 hover:bg-surface-soft hover:text-ink",
            touch ? "h-11 w-11" : "h-9 w-9",
          )}
        >
          <X size={touch ? 20 : 17} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-mechanics-sheet>
        {isLoading ? (
          <div className="py-10 text-center text-[13px] text-muted-2">Загрузка…</div>
        ) : (
          <div className="flex flex-col gap-2">
            {active.length === 0 && editId !== "new" && (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
                <div className="text-[14px] font-bold text-ink">Механиков пока нет</div>
                <div className="mx-auto mt-1 max-w-[380px] text-[12.5px] leading-relaxed text-muted">
                  Добавьте механика с процентом — в ремонте его выберут, и CRM сама посчитает его долю и нашу прибыль.
                </div>
              </div>
            )}
            {active.map((m) =>
              editId === m.id ? (
                <MechanicForm
                  key={m.id}
                  touch={touch}
                  initial={m}
                  busy={save.isPending}
                  onCancel={() => setEditId(null)}
                  onSave={(v) => submit({ id: m.id, ...v })}
                />
              ) : (
                <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-surface-soft px-4 py-3" data-mechanic-row={m.name}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-[15px] font-extrabold text-ink shadow-card-sm">
                    {m.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold text-ink">{m.name}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {[
                        canRepairProfit && m.percent != null ? `${m.percent}% с прибыли` : null,
                        `оплачено ремонтов ${stats.get(m.id)?.paid ?? 0}`,
                        (stats.get(m.id)?.inWork ?? 0) > 0 ? `в работе ${stats.get(m.id)!.inWork}` : null,
                        canRepairProfit && (stats.get(m.id)?.share ?? 0) > 0 ? `ему ${money(stats.get(m.id)!.share)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditId(m.id)}
                    aria-label={`Изменить: ${m.name}`}
                    className={cn(
                      "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-surface font-bold text-ink shadow-card-sm hover:bg-border",
                      touch ? "h-11 w-11" : "h-9 px-3 text-[12.5px]",
                    )}
                  >
                    <Pencil size={14} />
                    {!touch && "Изменить"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setArchived(m, true)}
                    aria-label={`В архив: ${m.name}`}
                    title="В архив"
                    className={cn(
                      "inline-flex shrink-0 items-center justify-center rounded-xl text-muted-2 hover:bg-surface hover:text-ink",
                      touch ? "h-11 w-11" : "h-9 w-9",
                    )}
                  >
                    <Archive size={15} />
                  </button>
                </div>
              ),
            )}

            {editId === "new" ? (
              <MechanicForm
                touch={touch}
                busy={save.isPending}
                onCancel={() => setEditId(null)}
                onSave={(v) => submit(v)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditId("new")}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border font-bold text-ink-2 hover:border-ink/30 hover:text-ink",
                  touch ? "h-12 text-[14px]" : "h-11 text-[13px]",
                )}
              >
                <Plus size={16} /> Добавить механика
              </button>
            )}

            {archived.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowArchive((v) => !v)}
                  className="inline-flex h-10 items-center rounded-xl px-2 text-[12.5px] font-semibold text-muted hover:text-ink"
                >
                  {showArchive ? "Скрыть архив" : `В архиве: ${archived.length}`}
                </button>
                {showArchive &&
                  archived.map((m) => (
                    <div key={m.id} className="mt-1.5 flex items-center gap-3 rounded-2xl border border-border px-4 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-muted">{m.name}</span>
                      <button
                        type="button"
                        onClick={() => setArchived(m, false)}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-surface-soft px-3 font-bold text-ink-2 hover:bg-border",
                          touch ? "h-11 text-[13.5px]" : "h-9 text-[12.5px]",
                        )}
                      >
                        <RotateCcw size={14} /> Вернуть
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  if (touch) {
    return (
      <div
        className="fixed inset-0 z-[70] flex flex-col bg-surface lg:items-center lg:bg-ink/45 lg:backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Механики"
      >
        <div className={cn(TABLET_WIZARD_PANEL, "relative")}>{body}</div>
      </div>
    );
  }
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Механики"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[min(760px,92vh)] w-full max-w-[620px] flex-col overflow-hidden rounded-3xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {body}
      </div>
    </div>
  );
}

function MechanicForm({
  touch,
  initial,
  busy,
  onCancel,
  onSave,
}: {
  touch: boolean;
  initial?: ServiceMechanic;
  busy: boolean;
  onCancel: () => void;
  onSave: (v: { name: string; percent: number }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [pct, setPct] = useState(initial?.percent != null ? String(initial.percent) : "");
  const [tried, setTried] = useState(false);
  const pctNum = pct === "" ? NaN : Number(pct);
  const nameOk = name.trim().length > 0;
  const pctOk = Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= 100;
  const input = cn(
    "w-full rounded-xl border bg-surface px-3 text-ink outline-none placeholder:text-muted-2 focus:border-blue-600",
    touch ? "h-12 text-[16px]" : "h-10 text-[13.5px]",
  );
  const submit = () => {
    setTried(true);
    if (nameOk && pctOk) onSave({ name: name.trim(), percent: pctNum });
  };
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-3" data-mechanic-form>
      <div className="grid grid-cols-[1fr_120px] gap-2.5">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[12px] font-semibold text-ink-2">Имя</span>
          <input
            autoFocus={!touch}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Как зовут механика"
            autoComplete="off"
            className={cn(input, tried && !nameOk ? "border-red-ink/60" : "border-border")}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-ink-2">% с прибыли</span>
          <span
            className={cn(
              "flex items-center rounded-xl border bg-surface pr-3 focus-within:border-blue-600",
              tried && !pctOk ? "border-red-ink/60" : "border-border",
            )}
          >
            <input
              inputMode="numeric"
              value={pct}
              onChange={(e) => setPct(digits(e.target.value).slice(0, 3))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="30"
              aria-label="Процент с прибыли"
              className={cn(input, "border-0 text-right tabular-nums focus:border-0")}
            />
            <span className="text-[15px] font-bold text-muted-2">%</span>
          </span>
        </label>
      </div>
      {tried && (!nameOk || !pctOk) && (
        <div className="mt-2 text-[12.5px] font-semibold text-red-ink">
          {!nameOk ? "Впишите имя" : "Процент — от 0 до 100"}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={cn("flex-1 rounded-xl bg-surface font-bold text-muted shadow-card-sm", touch ? "h-12 text-[14px]" : "h-10 text-[13px]")}
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className={cn("flex-[1.6] rounded-xl bg-ink font-bold text-white disabled:opacity-50", touch ? "h-12 text-[14px]" : "h-10 text-[13px]")}
        >
          {busy ? "Сохраняем…" : initial ? "Сохранить" : "Добавить"}
        </button>
      </div>
    </div>
  );
}
