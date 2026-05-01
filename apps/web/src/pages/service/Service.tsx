import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bike,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Search,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiScooters, usePatchScooter } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import {
  useApiRentals,
  useApiRentalsArchived,
} from "@/lib/api/rentals";
import { useApiClients } from "@/lib/api/clients";
import {
  useDamageReports,
  type ApiDamageReport,
} from "@/lib/api/damage-reports";
import { fileUrl } from "@/lib/files";
import { MODEL_LABEL } from "@/lib/mock/rentals";
import { navigate } from "@/app/navigationStore";
import { confirmDialog, toast } from "@/lib/toast";
import type { ApiRental, ApiScooter, ScooterModel } from "@/lib/api/types";

/**
 * Раздел «Ремонты» — список скутеров со статусом repair с возможностью
 * пройтись по чек-листу повреждений и вернуть скутер в парк аренды.
 *
 * MVP-вариант (заказчик: «пока так сделай, потом дотюним»):
 *  - чек-лист и заметки по пунктам — локальный state, без персиста
 *    (после перезагрузки страницы сбрасывается);
 *  - источник damage items — последний damage_report по аренде, в которой
 *    этот скутер был активен;
 *  - кнопка «Готов к аренде» переводит baseStatus → rental_pool через
 *    стандартный usePatchScooter().
 */
export function Service() {
  const { data: scooters = [], isLoading: scLoading } = useApiScooters();
  const { data: models = [] } = useApiScooterModels();
  const [search, setSearch] = useState("");

  const inRepair = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scooters
      .filter((s) => !s.archivedAt && s.baseStatus === "repair")
      .filter((s) => {
        if (!q) return true;
        const linked = models.find((m) => m.id === s.modelId);
        const label = linked?.name ?? MODEL_LABEL[s.model] ?? "";
        return `${s.name} ${label}`.toLowerCase().includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [scooters, models, search]);

  if (scLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-2">
        <Loader2 size={20} className="mr-2 animate-spin" /> Загружаем парк…
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold text-ink">
            Ремонты
          </h1>
          <div className="text-[12px] text-muted-2">
            Скутеры в обслуживании. Когда готов — отметьте пункты и
            верните в парк аренды.
          </div>
        </div>
        <div className="relative w-[280px]">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или модели…"
            className="h-9 w-full rounded-[10px] border border-border bg-surface pl-9 pr-3 text-[13px] outline-none focus:border-blue-600"
          />
        </div>
      </header>

      <div className="rounded-2xl bg-surface-soft/50 px-3 py-2 text-[12px] text-muted-2">
        В ремонте сейчас{" "}
        <b className="text-ink">{inRepair.length}</b>{" "}
        {pluralRu(inRepair.length, ["скутер", "скутера", "скутеров"])}.
      </div>

      {inRepair.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
          <CheckCircle2 size={36} className="text-green-600" />
          <div className="text-[14px] font-bold text-ink">
            Ни одного скутера в ремонте
          </div>
          <div className="max-w-[420px] text-[12px] text-muted-2">
            Когда оператор отправит скутер на обслуживание (через акт о
            повреждениях с галкой «отправить в ремонт» или через смену
            статуса), он появится здесь.
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {inRepair.map((scooter) => (
            <RepairCard key={scooter.id} scooter={scooter} />
          ))}
        </div>
      )}
    </div>
  );
}

function RepairCard({ scooter }: { scooter: ApiScooter }) {
  const { data: models = [] } = useApiScooterModels();
  const { data: clients = [] } = useApiClients();
  const { data: activeRentals = [] } = useApiRentals();
  const { data: archivedRentals = [] } = useApiRentalsArchived();
  const patch = usePatchScooter();

  const allRentals = useMemo(
    () => [...activeRentals, ...archivedRentals],
    [activeRentals, archivedRentals],
  );
  // Последняя аренда, где этот скутер был активен. Сортируем по startAt
  // (новейшая первой).
  const rentalsForScooter = useMemo(
    () =>
      allRentals
        .filter((r) => r.scooterId === scooter.id)
        .sort((a, b) => b.startAt.localeCompare(a.startAt)),
    [allRentals, scooter.id],
  );
  const lastRental = rentalsForScooter[0] ?? null;

  // Damage reports подгружаем по последней аренде (там обычно и фиксировался
  // ущерб, отправивший скутер в ремонт). Если их нет — возможно скутер
  // отправлен в ремонт без акта (через смену статуса вручную).
  const damageQ = useDamageReports(lastRental?.id ?? null);
  const lastReport = useMemo<ApiDamageReport | null>(() => {
    const reports = damageQ.data ?? [];
    if (reports.length === 0) return null;
    return [...reports].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )[0]!;
  }, [damageQ.data]);

  // Локальный state чек-листа: id позиции → done/notes. Не персистится,
  // только в течение сессии страницы.
  const [doneMap, setDoneMap] = useState<Record<number, boolean>>({});
  const [notesMap, setNotesMap] = useState<Record<number, string>>({});
  const allDone =
    !!lastReport &&
    lastReport.items.length > 0 &&
    lastReport.items.every((it) => doneMap[it.id]);

  const linkedModel = models.find((m) => m.id === scooter.modelId);
  const modelName =
    linkedModel?.name ?? MODEL_LABEL[scooter.model] ?? "—";
  const avatarSrc = fileUrl(linkedModel?.avatarKey);
  const lastClientName = lastRental
    ? clients.find((c) => c.id === lastRental.clientId)?.name
    : null;

  const finishRepair = async () => {
    if (lastReport && !allDone) {
      const ok = await confirmDialog({
        title: "Не все пункты отмечены",
        message:
          "Чек-лист по последнему акту не закрыт полностью. Всё равно вернуть скутер в парк аренды? (Поставьте галки на готовых пунктах перед этим — для дисциплины процессов).",
        confirmText: "Всё равно вернуть",
        cancelText: "Отмена",
      });
      if (!ok) return;
    } else {
      const ok = await confirmDialog({
        title: "Скутер починен?",
        message:
          "Скутер вернётся в «Парк аренды» и его можно будет выдавать новым клиентам. Если нужно ещё подержать в работе — отмените.",
        confirmText: "Готов к аренде",
        cancelText: "Отмена",
      });
      if (!ok) return;
    }
    try {
      await patch.mutateAsync({
        id: scooter.id,
        patch: { baseStatus: "rental_pool" },
      });
      toast.success("Скутер в парке", `${scooter.name} готов к аренде`);
    } catch (e) {
      toast.error("Не удалось", (e as Error).message ?? "");
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card-sm">
      <div className="flex items-start gap-3">
        <RepairThumb avatarSrc={avatarSrc} model={scooter.model} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() =>
                  navigate({ route: "fleet", scooterId: scooter.id })
                }
                className="text-left"
              >
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-2">
                  <Wrench size={11} className="text-orange-600" /> На ремонте
                </div>
                <div className="mt-0.5 font-display text-[18px] font-extrabold leading-tight text-ink">
                  {scooter.name}
                </div>
                <div className="text-[12px] text-muted-2">{modelName}</div>
              </button>
            </div>
            <button
              type="button"
              onClick={() =>
                navigate({ route: "fleet", scooterId: scooter.id })
              }
              title="Открыть карточку скутера"
              className="rounded-[6px] p-1 text-muted-2 hover:bg-surface-soft hover:text-ink"
            >
              <ExternalLink size={14} />
            </button>
          </div>

          {lastRental && (
            <RentalContext
              rental={lastRental}
              clientName={lastClientName ?? null}
            />
          )}
        </div>
      </div>

      {/* === Чек-лист повреждений === */}
      <div className="mt-3 rounded-xl border border-border bg-surface-soft/40 p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-2">
          <Wrench size={11} /> Чек-лист по акту
          {lastReport && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
              акт #{lastReport.id}
            </span>
          )}
        </div>

        {damageQ.isLoading ? (
          <div className="text-[12px] text-muted-2">Загружаем акт…</div>
        ) : !lastReport ? (
          <div className="text-[12px] text-muted-2">
            Скутер в ремонте без акта о повреждениях. Отметьте «Готов к
            аренде» когда закончите обслуживание.
          </div>
        ) : lastReport.items.length === 0 ? (
          <div className="text-[12px] text-muted-2">
            В акте нет позиций — нечего отмечать.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {lastReport.items.map((item) => {
              const done = !!doneMap[item.id];
              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-[10px] border bg-white px-3 py-2 transition-colors",
                    done ? "border-green-500 bg-green-soft/30" : "border-border",
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setDoneMap((p) => ({ ...p, [item.id]: !done }))
                    }
                    className="flex w-full items-start gap-2 text-left"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                        done
                          ? "bg-green-600 text-white"
                          : "border border-border bg-white",
                      )}
                    >
                      {done && <Check size={12} strokeWidth={3} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "text-[13px] font-semibold",
                          done
                            ? "text-green-ink line-through decoration-1"
                            : "text-ink",
                        )}
                      >
                        {item.name}
                        {item.quantity > 1 && (
                          <span className="ml-1 text-[11px] text-muted-2">
                            × {item.quantity}
                          </span>
                        )}
                      </div>
                      {item.comment && (
                        <div className="text-[11px] text-muted-2">
                          {item.comment}
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] tabular-nums text-muted-2">
                      {(item.finalPrice * item.quantity).toLocaleString(
                        "ru-RU",
                      )}{" "}
                      ₽
                    </span>
                  </button>
                  <input
                    value={notesMap[item.id] ?? ""}
                    onChange={(e) =>
                      setNotesMap((p) => ({ ...p, [item.id]: e.target.value }))
                    }
                    placeholder="Что сделано: «заменён рычаг», «прокачаны тормоза»…"
                    className="mt-1 h-7 w-full rounded-[8px] border border-border bg-white px-2 text-[12px] outline-none focus:border-blue-600"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="text-[11px] text-muted-2">
          {lastReport && lastReport.items.length > 0
            ? `Отмечено: ${lastReport.items.filter((it) => doneMap[it.id]).length} из ${lastReport.items.length}`
            : "Чек-листа нет — оператор сам решает когда готов"}
        </div>
        <button
          type="button"
          onClick={finishRepair}
          disabled={patch.isPending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-[13px] font-bold transition-colors",
            allDone || !lastReport
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-ink text-white hover:bg-blue-600",
            patch.isPending && "opacity-50",
          )}
        >
          {patch.isPending && <Loader2 size={14} className="animate-spin" />}
          <CheckCircle2 size={14} /> Готов к аренде
        </button>
      </div>
    </div>
  );
}

function RentalContext({
  rental,
  clientName,
}: {
  rental: ApiRental;
  clientName: string | null;
}) {
  const start = formatRuDateTime(rental.startAt);
  return (
    <button
      type="button"
      onClick={() =>
        navigate({ route: "rentals", rentalId: rental.id })
      }
      className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
      title="Открыть аренду, в которой скутер был на момент ремонта"
    >
      <Bike size={11} />
      Из аренды #{String(rental.id).padStart(4, "0")}
      {clientName && (
        <>
          <span className="text-blue-700/60">·</span>
          {clientName}
        </>
      )}
      <span className="text-blue-700/60">·</span>
      {start}
      <ArrowRight size={10} />
    </button>
  );
}

function RepairThumb({
  avatarSrc,
  model,
}: {
  avatarSrc: string | null | undefined;
  model: ScooterModel;
}) {
  if (avatarSrc) {
    return (
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-surface-soft">
        <img
          src={avatarSrc}
          alt={MODEL_LABEL[model]}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-ink text-white">
      <Bike size={32} strokeWidth={1.5} />
    </div>
  );
}

function formatRuDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function pluralRu(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n);
  const n10 = a % 10;
  const n100 = a % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
}
