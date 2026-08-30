import { useMemo, useState } from "react";
import { Loader2, Lock, ScrollText, Search, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActivityPage } from "@/lib/api/activity";
import { ActivityEventRow } from "@/components/ActivityEventRow";
import { useDashboardDrawer } from "@/pages/dashboard/DashboardDrawer";

/**
 * «Скутеры → Журнал» — единая история всех действий с техникой.
 *
 * Задача заказчика (31.08), поставленная после инцидента: в парке было 62
 * единицы, стало 61, и по журналу нельзя было понять, что произошло. Теперь
 * все действия с техникой собраны в одном окне: добавление, удаление,
 * смена статуса, правка номеров рамы и двигателя, а также замены скутера в
 * арендах — они тоже переводят технику в другой статус.
 *
 * Записи журнала неизменяемы: в CRM нет способа их отредактировать или
 * удалить — ни у кого, включая директора. Это фиксируется подписью в шапке,
 * чтобы это было очевидно и проверяющему.
 */

const PAGE_SIZE = 40;

/** Быстрые фильтры по типу действия (поверх серверной категории). */
type Kind = "all" | "status" | "identity" | "added" | "removed" | "swap";

const KINDS: { id: Kind; label: string; hint: string }[] = [
  { id: "all", label: "Все действия", hint: "вся история по технике" },
  { id: "status", label: "Смена статуса", hint: "переводы между режимами" },
  { id: "identity", label: "Рама и двигатель", hint: "правки паспортных номеров" },
  { id: "added", label: "Добавление", hint: "новая техника в парке" },
  { id: "removed", label: "Архив и удаление", hint: "выбытие из парка" },
  { id: "swap", label: "Замены в арендах", hint: "снятая техника меняет статус" },
];

function matchesKind(kind: Kind, action: string): boolean {
  if (kind === "all") return true;
  if (kind === "status") return action === "status_changed";
  if (kind === "identity") return action === "identity_changed";
  if (kind === "added") return action === "created";
  if (kind === "removed") return action === "archived" || action === "deleted";
  if (kind === "swap") return action.includes("swap");
  return true;
}

export function ScooterJournal() {
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState<Kind>("all");
  const [query, setQuery] = useState("");
  const drawer = useDashboardDrawer();

  // Серверная категория «scooter» отбирает и события техники, и замены
  // скутера в арендах (они меняют статус снятой единицы).
  const { data, isLoading, isFetching } = useActivityPage(
    PAGE_SIZE,
    page * PAGE_SIZE,
    { category: "scooter" },
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (it) =>
        matchesKind(kind, it.action) &&
        (!q ||
          (it.summary ?? "").toLowerCase().includes(q) ||
          (it.userName ?? "").toLowerCase().includes(q)),
    );
  }, [items, kind, query]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      {/* Шапка: назначение блока + гарантия неизменяемости */}
      <div className="flex flex-wrap items-start gap-3 rounded-2xl bg-surface px-4 py-3 shadow-card-sm">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
          <ScrollText size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-ink">Журнал техники</div>
          <div className="mt-0.5 text-[12px] leading-snug text-muted">
            Все действия со скутерами: добавление, смена статуса, правка номеров
            рамы и двигателя, архив и удаление, замены в арендах. Клик по записи
            открывает карточку техники.
          </div>
        </div>
        <span
          title="Записи журнала нельзя отредактировать или удалить — ни оператору, ни директору"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green-soft px-3 py-1 text-[11.5px] font-bold text-green-ink"
        >
          <Lock size={12} /> Записи не удаляются
        </span>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название, VIN, рама, кто менял…"
            className="h-9 w-full rounded-full bg-surface pl-9 pr-3 text-[13px] text-ink shadow-card-sm outline-none placeholder:text-muted-2 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              title={k.hint}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                kind === k.id
                  ? "bg-ink text-white"
                  : "bg-surface text-muted shadow-card-sm hover:text-ink",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {/* Лента */}
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card-sm">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-16 text-[13px] text-muted">
            <Loader2 size={16} className="animate-spin" /> Загружаем журнал…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-soft text-muted-2">
              <ShieldAlert size={22} />
            </div>
            <div className="text-[14px] font-bold text-ink">
              Записей не нашлось
            </div>
            <div className="max-w-[420px] text-[12.5px] text-muted">
              {query || kind !== "all"
                ? "Попробуйте снять фильтр или уточнить запрос."
                : "Действий с техникой пока не было."}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filtered.map((it) => (
              <div key={it.id} className="px-1.5">
                <ActivityEventRow
                  item={it}
                  feed
                  onOpenScooter={drawer.openScooter}
                  onOpenRental={drawer.openRental}
                  onOpenClient={drawer.openClient}
                />
              </div>
            ))}
          </div>
        )}

        {/* Пагинация */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-soft/50 px-4 py-2.5 text-[12px]">
            <span className="text-muted-2">
              Страница {page + 1} из {pages} · всего записей {total}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page === 0 || isFetching}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-full bg-surface px-3 py-1.5 font-semibold text-ink-2 shadow-card-sm disabled:opacity-40"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={page + 1 >= pages || isFetching}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-full bg-surface px-3 py-1.5 font-semibold text-ink-2 shadow-card-sm disabled:opacity-40"
              >
                Дальше
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
