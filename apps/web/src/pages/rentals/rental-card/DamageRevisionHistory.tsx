import { ShieldCheck, ShieldAlert, Loader2, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useDamageRevisions,
  type ApiDamageRevision,
} from "@/lib/api/damage-reports";

/**
 * Этап 2 — история правок акта + статус целостности хэш-цепочки. Показывает
 * каждую ревизию (снимок) с автором/датой/суммой, подтверждает что цепочка не
 * нарушена (защита от подделки) И раскрывает ПОЗИЦИОННЫЙ diff: что добавлено,
 * удалено или изменилось относительно предыдущей ревизии (а не только «сумма
 * стала другой»). Грузится лениво при раскрытии.
 */
function fmtMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}
function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const AGREEMENT_SHORT: Record<string, string> = {
  pending: "на согласовании",
  agreed: "согласовано",
  disputed: "спор",
};

type RItem = ApiDamageRevision["itemsJson"][number];

// Название позиции для diff: своя позиция с дефолтным именем «Прочее
// повреждение» показывается по комментарию (как и в печати акта).
function itemTitle(it: RItem): string {
  const name = (it.name ?? "").trim();
  const comment = (it.comment ?? "").trim();
  if ((name === "" || name === "Прочее повреждение") && comment) return comment;
  return name || "Позиция";
}
// Ключ сопоставления позиций между ревизиями: каталожные — по priceItemId,
// свои — по названию (после резолва).
function itemKey(it: RItem): string {
  return it.priceItemId != null
    ? `cat:${it.priceItemId}`
    : `custom:${itemTitle(it).toLowerCase()}`;
}
function lineSum(it: RItem): number {
  return it.finalPrice * it.quantity;
}

type DiffLine =
  | { kind: "add"; title: string; sum: number }
  | { kind: "remove"; title: string; sum: number }
  | { kind: "change"; title: string; from: number; to: number };

function diffItems(prev: RItem[] | null, cur: RItem[]): DiffLine[] {
  if (!prev) return [];
  const prevMap = new Map<string, RItem>();
  prev.forEach((it) => prevMap.set(itemKey(it), it));
  const curMap = new Map<string, RItem>();
  cur.forEach((it) => curMap.set(itemKey(it), it));
  const lines: DiffLine[] = [];
  for (const it of cur) {
    const old = prevMap.get(itemKey(it));
    if (!old) lines.push({ kind: "add", title: itemTitle(it), sum: lineSum(it) });
    else if (lineSum(old) !== lineSum(it))
      lines.push({
        kind: "change",
        title: itemTitle(it),
        from: lineSum(old),
        to: lineSum(it),
      });
  }
  for (const it of prev) {
    if (!curMap.has(itemKey(it)))
      lines.push({ kind: "remove", title: itemTitle(it), sum: lineSum(it) });
  }
  return lines;
}

function DiffRow({ line }: { line: DiffLine }) {
  if (line.kind === "add") {
    return (
      <div className="flex items-start gap-1.5 text-[11.5px] text-green-ink">
        <Plus size={12} className="mt-0.5 shrink-0" />
        <span className="min-w-0 flex-1">
          Добавлена «{line.title}»{" "}
          <span className="font-semibold tabular-nums">
            +{fmtMoney(line.sum)} ₽
          </span>
        </span>
      </div>
    );
  }
  if (line.kind === "remove") {
    return (
      <div className="flex items-start gap-1.5 text-[11.5px] text-red-ink">
        <Minus size={12} className="mt-0.5 shrink-0" />
        <span className="min-w-0 flex-1">
          Удалена «{line.title}»{" "}
          <span className="font-semibold tabular-nums line-through opacity-70">
            {fmtMoney(line.sum)} ₽
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-1.5 text-[11.5px] text-amber-700">
      <span className="mt-0.5 shrink-0 font-bold">≈</span>
      <span className="min-w-0 flex-1">
        «{line.title}»{" "}
        <span className="tabular-nums line-through opacity-70">
          {fmtMoney(line.from)} ₽
        </span>{" "}
        →{" "}
        <span className="font-semibold tabular-nums">{fmtMoney(line.to)} ₽</span>
      </span>
    </div>
  );
}

export function DamageRevisionHistory({ reportId }: { reportId: number }) {
  const { data, isLoading } = useDamageRevisions(reportId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-[12px] text-muted-2">
        <Loader2 size={14} className="animate-spin" /> Загружаем историю…
      </div>
    );
  }

  const revs = data?.revisions ?? [];
  if (revs.length === 0) {
    return (
      <div className="rounded-lg bg-surface-soft px-3 py-2 text-[12px] text-muted-2">
        Правок не было — акт в исходной редакции.
      </div>
    );
  }

  const ok = data?.integrity?.ok ?? true;
  const brokenAt = data?.integrity?.brokenAt ?? null;

  // Ревизии приходят в хронологическом порядке (1..N). Считаем diff каждой
  // относительно предыдущей, затем выводим в обратном порядке (свежие сверху).
  const enriched = revs.map((r, i) => ({
    rev: r,
    prevTotal: i > 0 ? revs[i - 1]!.total : null,
    diff: diffItems(i > 0 ? revs[i - 1]!.itemsJson : null, r.itemsJson),
    isCreation: i === 0,
  }));

  return (
    <div className="flex flex-col gap-2">
      {/* Статус целостности — главная защита от подделки. */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold",
          ok ? "bg-green-soft text-green-ink" : "bg-red-soft text-red-ink",
        )}
      >
        {ok ? (
          <ShieldCheck size={15} className="shrink-0" />
        ) : (
          <ShieldAlert size={15} className="shrink-0" />
        )}
        {ok
          ? "Целостность подтверждена — цепочка ревизий не нарушена"
          : `Цепочка нарушена на ревизии ${brokenAt} — возможна подделка!`}
      </div>

      <ol className="flex flex-col gap-1.5">
        {[...enriched].reverse().map(({ rev: r, prevTotal, diff, isCreation }, idx) => {
          const isCurrent = idx === 0;
          const sumChanged = prevTotal != null && prevTotal !== r.total;
          return (
            <li
              key={r.id}
              className={cn(
                "flex items-start gap-2 rounded-lg px-3 py-2",
                isCurrent ? "bg-blue-50" : "bg-surface-soft",
              )}
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-white">
                {r.revisionNo}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-ink">
                  Ревизия {r.revisionNo}
                  {isCurrent && (
                    <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                      текущая
                    </span>
                  )}
                  {isCreation && (
                    <span className="text-[10px] font-medium text-muted-2">
                      · создание ({r.itemsJson.length}{" "}
                      {r.itemsJson.length === 1 ? "позиция" : "позиций"})
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-2">
                  {fmtWhen(r.createdAt)} · {r.editedByUserName ?? "—"} ·{" "}
                  {AGREEMENT_SHORT[r.clientAgreement] ?? r.clientAgreement}
                </div>
                {/* Позиционный diff относительно предыдущей ревизии. */}
                {!isCreation && (
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    {diff.length > 0 ? (
                      diff.map((line, i) => <DiffRow key={i} line={line} />)
                    ) : (
                      <div className="text-[11.5px] text-muted-2">
                        Позиции не менялись (правка реквизитов/согласования).
                      </div>
                    )}
                    {sumChanged && (
                      <div className="mt-0.5 text-[11.5px] font-semibold text-ink-2">
                        Итог:{" "}
                        <span className="tabular-nums line-through opacity-60">
                          {fmtMoney(prevTotal!)} ₽
                        </span>{" "}
                        →{" "}
                        <span className="tabular-nums">{fmtMoney(r.total)} ₽</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-[13px] font-bold tabular-nums text-ink">
                {fmtMoney(r.total)} ₽
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
