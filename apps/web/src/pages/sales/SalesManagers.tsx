import { useMemo, useState } from "react";
import { ChevronLeft, Pencil, Trash2, UserPlus, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast, confirmDialog } from "@/lib/toast";
import { useMe } from "@/lib/api/auth";
import {
  useCreateSaleManager,
  useDeleteSaleManager,
  usePatchSaleManager,
  useSaleDeals,
  useSaleManagers,
  type SaleManager,
} from "@/lib/api/sales";
import { EmptyState, ManagerAvatar, SectionCard, StatTile } from "./SalesUI";
import { fmt, ruDateShort, STATUS_CLASS, STATUS_LABEL, totals } from "./salesUtils";

/**
 * «Менеджеры» (31.08): кто продаёт, под каким процентом и с какой историей.
 *
 * Менеджер — не учётка CRM: продавать может человек без доступа в систему.
 * Процент считается с ПРИБЫЛИ сделки и фиксируется в момент продажи, чтобы
 * смена процента не переписала уже выплаченные вознаграждения.
 */

const COLORS = [
  { id: "blue", cls: "bg-blue-100 text-blue-700" },
  { id: "purple", cls: "bg-violet-100 text-violet-700" },
  { id: "green", cls: "bg-emerald-100 text-emerald-700" },
  { id: "orange", cls: "bg-orange-100 text-orange-700" },
  { id: "pink", cls: "bg-pink-100 text-pink-700" },
];

export function SalesManagers({ onOpenDeal }: { onOpenDeal: (id: number) => void }) {
  const { data, isLoading } = useSaleManagers();
  const { data: dealsData } = useSaleDeals();
  const { data: me } = useMe();
  const isDirector = me?.role === "director" || me?.role === "creator";
  const managers = data?.items ?? [];
  const deals = dealsData?.items ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SaleManager | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const del = useDeleteSaleManager();

  const statsById = useMemo(() => {
    const map = new Map<number, ReturnType<typeof totals>>();
    for (const m of managers) {
      map.set(
        m.id,
        totals(deals.filter((d) => d.managerId === m.id && d.status === "signed")),
      );
    }
    return map;
  }, [managers, deals]);

  const open = managers.find((m) => m.id === openId) ?? null;

  const form = formOpen && (
    <ManagerForm
      initial={editing}
      onClose={() => {
        setFormOpen(false);
        setEditing(null);
      }}
    />
  );

  if (open) {
    const history = deals
      .filter((d) => d.managerId === open.id)
      .sort(
        (a, b) =>
          new Date(b.soldAt ?? b.createdAt).getTime() -
          new Date(a.soldAt ?? a.createdAt).getTime(),
      );
    const t = statsById.get(open.id) ?? totals([]);
    return (
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setOpenId(null)}
            className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-muted shadow-card-sm hover:text-ink"
          >
            <ChevronLeft size={14} /> Все менеджеры
          </button>
          <ManagerAvatar name={open.name} color={open.avatarColor} size={36} />
          <div className="min-w-0">
            <div className="text-[17px] font-bold text-ink">{open.name}</div>
            <div className="text-[12px] text-muted">
              процент {open.commissionPct}% с прибыли
              {open.phone && ` · ${open.phone}`}
            </div>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => {
              setEditing(open);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink shadow-card-sm"
          >
            <Pencil size={13} /> Изменить
          </button>
        </div>

        <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
          <StatTile label="Продано" value={fmt(t.units)} suffix="ед." hint="за всё время" />
          <StatTile label="Выручка" value={fmt(t.revenue)} suffix="₽" accent />
          <StatTile label="Прибыль" value={fmt(t.profit)} suffix="₽" hint={`маржа ${t.marginPct}%`} />
          <StatTile
            label="Вознаграждение"
            value={fmt(t.commission)}
            suffix="₽"
            hint={`${open.commissionPct}% с прибыли`}
          />
        </div>

        <SectionCard title="История продаж" hint={`${history.length} сделок`}>
          {history.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-muted">
              Сделок пока нет.
            </div>
          ) : (
            <div className="flex flex-col">
              {history.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onOpenDeal(d.id)}
                  className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-soft/60"
                >
                  <span className="w-[70px] shrink-0 text-[11.5px] text-muted-2">
                    {ruDateShort(d.soldAt ?? d.createdAt)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {d.modelName || d.scooterName || "Техника"}
                    </span>
                    <span className="block truncate text-[11.5px] text-muted">
                      {d.clientName ?? "клиент не указан"}
                      {d.vin && ` · VIN ${d.vin}`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[13px] font-bold tabular-nums text-ink">
                      {fmt(d.price)} ₽
                    </span>
                    {d.managerCommission ? (
                      <span className="block text-[11px] tabular-nums text-emerald-700">
                        ему {fmt(d.managerCommission)} ₽
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                      STATUS_CLASS[d.status],
                    )}
                  >
                    {STATUS_LABEL[d.status]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
        {form}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SectionCard
        title="Менеджеры продаж"
        hint="процент считается с прибыли сделки"
        action={
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[12.5px] font-bold text-white transition-transform active:scale-[0.98]"
          >
            <UserPlus size={14} /> Добавить менеджера
          </button>
        }
      >
        {isLoading ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted">Загружаем…</div>
        ) : managers.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title="Менеджеров пока нет"
            text="Добавьте продавцов — тогда в сделке можно будет указать, кто её провёл, а в отчёте появится рейтинг и вознаграждение по каждому."
          />
        ) : (
          <>
            <div className="flex flex-col md:hidden">
              {managers.map((m) => {
                const t = statsById.get(m.id) ?? totals([]);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setOpenId(m.id)}
                    className="flex items-center gap-3 border-b border-border/60 px-4 py-3 text-left last:border-b-0 active:bg-surface-soft/60"
                  >
                    <ManagerAvatar name={m.name} color={m.avatarColor} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-ink">
                        {m.name}
                      </span>
                      <span className="block text-[12px] text-muted">
                        {m.commissionPct}% с прибыли · продано {t.units} ед.
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[13px] font-bold tabular-nums text-ink">
                        {fmt(t.revenue)} ₽
                      </span>
                      <span className="block text-[11px] tabular-nums text-emerald-700">
                        +{fmt(t.profit)} ₽
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="border-b border-border/60 text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
                  <th className="px-4 py-2 text-left font-bold">Менеджер</th>
                  <th className="px-2 py-2 text-right font-bold">Процент</th>
                  <th className="px-2 py-2 text-right font-bold">Продано</th>
                  <th className="px-2 py-2 text-right font-bold">Выручка</th>
                  <th className="px-2 py-2 text-right font-bold">Прибыль</th>
                  <th className="px-2 py-2 text-right font-bold">Вознаграждение</th>
                  <th className="px-4 py-2 text-right font-bold" />
                </tr>
              </thead>
              <tbody>
                {managers.map((m) => {
                  const t = statsById.get(m.id) ?? totals([]);
                  return (
                    <tr
                      key={m.id}
                      onClick={() => setOpenId(m.id)}
                      className="cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-surface-soft/60"
                    >
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <ManagerAvatar name={m.name} color={m.avatarColor} size={30} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink">
                              {m.name}
                            </span>
                            <span className="block truncate text-[11px] text-muted-2">
                              {m.phone || "телефон не указан"}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right font-bold tabular-nums text-ink">
                        {m.commissionPct}%
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{t.units}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {fmt(t.revenue)} ₽
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-emerald-700">
                        {fmt(t.profit)} ₽
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-muted">
                        {t.commission ? `${fmt(t.commission)} ₽` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing(m);
                              setFormOpen(true);
                            }}
                            title="Изменить"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-soft text-muted transition-colors hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Pencil size={13} />
                          </button>
                          {isDirector && (
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const ok = await confirmDialog({
                                  title: `Удалить «${m.name}»?`,
                                  message:
                                    "Если за менеджером есть сделки, он не удалится, а уйдёт из списка — история продаж останется читаемой.",
                                  confirmText: "Удалить",
                                  danger: true,
                                });
                                if (!ok) return;
                                try {
                                  const res = await del.mutateAsync(m.id);
                                  toast.success(
                                    res.archived
                                      ? "Менеджер убран из списка — история сохранена"
                                      : "Менеджер удалён",
                                  );
                                } catch {
                                  toast.error("Не удалось удалить");
                                }
                              }}
                              title="Удалить"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-soft text-muted transition-colors hover:bg-red-soft hover:text-red-ink"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
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
      {form}
    </div>
  );
}

function ManagerForm({
  initial,
  onClose,
}: {
  initial: SaleManager | null;
  onClose: () => void;
}) {
  const create = useCreateSaleManager();
  const patch = usePatchSaleManager();
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [pct, setPct] = useState(String(initial?.commissionPct ?? 0));
  const [color, setColor] = useState(initial?.avatarColor ?? "blue");
  const [note, setNote] = useState(initial?.note ?? "");

  const save = async () => {
    if (!name.trim()) {
      toast.error("Укажите имя менеджера");
      return;
    }
    const body = {
      name: name.trim(),
      phone: phone.trim() || null,
      commissionPct: Math.min(100, Number(pct) || 0),
      avatarColor: color,
      note: note.trim() || null,
    };
    try {
      if (initial) await patch.mutateAsync({ id: initial.id, ...body });
      else await create.mutateAsync(body);
      toast.success(initial ? "Менеджер изменён" : "Менеджер добавлен");
      onClose();
    } catch {
      toast.error("Не удалось сохранить");
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 animate-backdrop-in">
      <div className="w-full max-w-[440px] rounded-2xl bg-surface p-5 shadow-card-lg animate-modal-in">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[16px] font-bold text-ink">
              {initial ? "Менеджер" : "Новый менеджер"}
            </div>
            <div className="mt-0.5 text-[12px] text-muted">
              Процент считается с прибыли сделки и фиксируется в момент продажи.
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-2 hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <ManagerAvatar name={name || "?"} color={color} size={44} />
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setColor(c.id)}
                className={cn(
                  "h-7 w-7 rounded-full transition-transform",
                  c.cls,
                  color === c.id ? "ring-2 ring-ink ring-offset-2" : "hover:scale-105",
                )}
              />
            ))}
          </div>
        </div>

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
            Имя
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Иван Петров"
            className="h-10 rounded-[12px] border border-border bg-surface px-3 text-[14px] outline-none focus:border-emerald-500"
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Телефон
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 …"
              className="h-10 rounded-[12px] border border-border bg-surface px-3 text-[14px] outline-none focus:border-emerald-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Процент с прибыли
            </span>
            <span className="relative">
              <input
                inputMode="numeric"
                value={pct}
                onChange={(e) => setPct(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                className="h-10 w-full rounded-[12px] border border-border bg-surface pl-3 pr-8 text-[14px] font-semibold tabular-nums outline-none focus:border-emerald-500"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-2">
                %
              </span>
            </span>
          </label>
        </div>

        <label className="mt-3 flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
            Заметка
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Необязательно"
            className="h-10 rounded-[12px] border border-border bg-surface px-3 text-[14px] outline-none focus:border-emerald-500"
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
            disabled={create.isPending || patch.isPending}
            className="rounded-full bg-emerald-600 px-5 py-2 text-[13px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
