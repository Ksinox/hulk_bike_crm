import { useMemo, useState } from "react";
import { Handshake, Pencil } from "lucide-react";
import { ElectricMark } from "@/components/PowerTypeBadge";
import { ScooterName, scooterModelName } from "@/components/ScooterName";
import { Topbar } from "@/pages/dashboard/Topbar";
import {
  useApiScooters,
  usePartnerShare,
  usePatchScooter,
  useSetPartnerShare,
} from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useApiPayments, type ApiPayment } from "@/lib/api/payments";
import { useApiRentals, useApiRentalsArchived } from "@/lib/api/rentals";
import { useBillingPeriodAnchors } from "@/lib/api/billing-period";
import { currentBillingPeriod } from "@/lib/billingPeriod";
import { DEFAULT_PARTNER_SHARE } from "@/lib/partner";
import { navigate } from "@/app/navigationStore";
import { toast, pickAction } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Пункт 11 — раздел «Партнёрка»: расчёт выплат инвестору по партнёрской
 * технике (модели с флагом «Партнёрская», пункт 14).
 *
 * По каждой единице: выручка за расчётный период → доля инвестора
 * (процент на единицу, по умолчанию 50 %) → наша доля. Процент меняется
 * прямо здесь. Общая «Выручка» на дашборде уже показана ЗА ВЫЧЕТОМ доли
 * инвестора — этот раздел отвечает на вопрос «сколько выплатить партнёру».
 */

const fmt = (n: number) => n.toLocaleString("ru-RU");

/** Критерии выручки — те же, что в useRevenue.ts. */
function countsAsRevenue(p: ApiPayment): boolean {
  if (!p.paid || !p.paidAt) return false;
  if (p.excludedFromRevenue) return false;
  if (p.type === "deposit" || p.type === "refund") return false;
  if (p.method === "deposit" && p.type !== "deposit_forfeit") return false;
  return true;
}

export function Partners() {
  const { data: scooters = [] } = useApiScooters();
  const { data: models = [] } = useApiScooterModels();
  const { data: payments = [] } = useApiPayments();
  const { data: active = [] } = useApiRentals();
  const { data: archived = [] } = useApiRentalsArchived();
  const anchorsQ = useBillingPeriodAnchors();
  const patchScooter = usePatchScooter();
  const shareQ = usePartnerShare();
  const setShare = useSetPartnerShare();
  const [commonStr, setCommonStr] = useState("");
  const [commonEdit, setCommonEdit] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [shareStr, setShareStr] = useState("");

  const period = useMemo(
    () => currentBillingPeriod(new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchorsQ.data],
  );

  // Выручка периода по каждому партнёрскому скутеру + итоги.
  const calc = useMemo(() => {
    const modelById = new Map(models.map((m) => [m.id, m] as const));
    // Правка 24.08: партнёрская — сама единица техники.
    const partnerScooters = scooters.filter((s) => s.isPartner);
    const fallbackShare = shareQ.data?.value ?? DEFAULT_PARTNER_SHARE;
    const partnerIds = new Set(partnerScooters.map((s) => s.id));
    const rentalToScooter = new Map<number, number>();
    for (const r of [...active, ...archived]) {
      if (r.scooterId != null && partnerIds.has(r.scooterId)) {
        rentalToScooter.set(r.id, r.scooterId);
      }
    }
    const revenueByScooter = new Map<number, number>();
    for (const p of payments) {
      if (!countsAsRevenue(p)) continue;
      if (p.rentalId == null) continue;
      const scooterId = rentalToScooter.get(p.rentalId);
      if (scooterId == null) continue;
      const t = new Date(p.paidAt!).getTime();
      if (t < period.start.getTime() || t >= period.end.getTime()) continue;
      revenueByScooter.set(
        scooterId,
        (revenueByScooter.get(scooterId) ?? 0) + p.amount,
      );
    }
    const items = partnerScooters.map((s) => {
      const revenue = revenueByScooter.get(s.id) ?? 0;
      const custom = s.partnerShare != null;
      const sharePct = s.partnerShare ?? fallbackShare;
      const payout = Math.floor((revenue * sharePct) / 100);
      const model = s.modelId != null ? modelById.get(s.modelId) : null;
      return {
        scooter: s,
        modelName: model?.name ?? "—",
        isElectric: model?.isElectric ?? false,
        custom,
        revenue,
        sharePct,
        payout,
        ours: revenue - payout,
      };
    });
    const totals = items.reduce(
      (acc, it) => ({
        revenue: acc.revenue + it.revenue,
        payout: acc.payout + it.payout,
        ours: acc.ours + it.ours,
      }),
      { revenue: 0, payout: 0, ours: 0 },
    );
    return { items, totals };
  }, [models, scooters, active, archived, payments, period, shareQ.data]);

  /**
   * Общий процент инвестора. Если у части техники выставлен свой —
   * спрашиваем, что делать: применить ко всем (сбросив персональные)
   * или сохранить общий, оставив персональные как есть.
   */
  const saveCommonShare = async () => {
    const value = Number(commonStr.replace(/\D/g, ""));
    if (!Number.isFinite(value) || value < 0 || value > 100) return;
    const custom = shareQ.data?.custom ?? [];
    let mode: "default" | "apply_all" = "default";
    if (custom.length > 0) {
      const names = custom
        .map((c) => scooterModelName(c.name) + " \u2014 " + c.share + " %")
        .join(", ");
      const answer = await pickAction({
        title: "Применить " + value + " % ко всей технике?",
        message:
          "У части техники выставлен свой процент: " +
          names +
          ". Что делать с ней?",
        options: [
          {
            id: "keep",
            label: "Оставить персональные",
            hint: "Общий процент применится ко всем, кроме этой техники",
            tone: "primary",
          },
          {
            id: "all",
            label: "Применить ко всем",
            hint: "Персональные проценты будут сброшены на общий",
          },
        ],
      });
      if (!answer) return;
      mode = answer === "all" ? "apply_all" : "default";
    }
    try {
      const res = await setShare.mutateAsync({ value, mode });
      toast.success(
        "Процент инвестора обновлён",
        mode === "apply_all"
          ? "Теперь " +
              value +
              " % по всей партнёрской технике (персональных сброшено: " +
              res.reset +
              ")."
          : "Общий процент \u2014 " + value + " %. Персональные сохранены.",
      );
      setCommonEdit(false);
    } catch {
      toast.error("Не удалось сохранить процент");
    }
  };

  const saveShare = async (id: number) => {
    const pct = Number(shareStr.replace(/\D/g, ""));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return;
    try {
      await patchScooter.mutateAsync({ id, patch: { partnerShare: pct } });
      toast.success("Процент изменён", `Доля инвестора теперь ${pct} %.`);
      setEditId(null);
    } catch {
      toast.error("Не удалось сохранить", "Попробуйте ещё раз");
    }
  };

  const periodLabel = `${period.start.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} — ${new Date(period.end.getTime() - 1).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`;

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
          Партнёрка
        </h1>
        <span className="rounded-full bg-violet-100 px-3 py-1 text-[12px] font-bold text-violet-700">
          {calc.items.length}{" "}
          {calc.items.length === 1 ? "единица" : "единиц"} техники
        </span>
        <div className="flex-1" />
        <span className="text-[12.5px] text-muted">
          Расчётный период: <b className="text-ink-2">{periodLabel}</b>
        </span>
      </div>

      {calc.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface px-6 py-16 text-center shadow-card-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Handshake size={26} />
          </div>
          <div className="text-[16px] font-bold text-ink">
            Партнёрской техники пока нет
          </div>
          <div className="max-w-[440px] text-[13px] leading-relaxed text-muted">
            Отметьте скутер как партнёрский в его карточке (Скутеры →
            карточка техники) — он появится здесь с расчётом выплат.
            Партнёрство задаётся у каждой единицы отдельно: у одной модели
            могут быть и наши экземпляры, и партнёрские.
          </div>
        </div>
      ) : (
        <>
          {/* Общий процент инвестора (правка заказчика 24.08) */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50/50 px-4 py-3">
            <span className="text-[12.5px] font-semibold text-ink-2">
              Процент инвестора по умолчанию
            </span>
            {commonEdit ? (
              <span className="flex items-center gap-1.5">
                <input
                  autoFocus
                  inputMode="numeric"
                  value={commonStr}
                  onChange={(e) =>
                    setCommonStr(e.target.value.replace(/\D/g, ""))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveCommonShare();
                    if (e.key === "Escape") setCommonEdit(false);
                  }}
                  className="h-9 w-16 rounded-lg border border-violet-300 bg-white px-2 text-center text-[14px] font-bold tabular-nums outline-none focus:border-violet-500"
                />
                <span className="text-[13px] font-bold text-ink-2">%</span>
                <button
                  type="button"
                  onClick={saveCommonShare}
                  disabled={setShare.isPending}
                  className="h-9 rounded-lg bg-violet-600 px-3 text-[12.5px] font-bold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
                >
                  Применить
                </button>
                <button
                  type="button"
                  onClick={() => setCommonEdit(false)}
                  className="h-9 rounded-lg px-2 text-[12.5px] font-semibold text-muted hover:text-ink"
                >
                  Отмена
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCommonStr(
                    String(shareQ.data?.value ?? DEFAULT_PARTNER_SHARE),
                  );
                  setCommonEdit(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[14px] font-bold tabular-nums text-violet-700 shadow-card-sm transition-colors hover:bg-violet-100"
              >
                {shareQ.data?.value ?? DEFAULT_PARTNER_SHARE} %
                <Pencil size={12} className="opacity-60" />
              </button>
            )}
            <span className="text-[11.5px] text-muted">
              Применяется ко всей партнёрской технике, у которой не задан свой
              процент.
              {(shareQ.data?.custom.length ?? 0) > 0 &&
                " Сейчас со своим процентом: " +
                  shareQ.data?.custom.length +
                  "."}
            </span>
          </div>

          {/* Итоги периода */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-surface p-4 shadow-card-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Выручка партнёрской техники
              </div>
              <div className="mt-1 font-display text-[26px] font-extrabold tabular-nums text-ink">
                {fmt(calc.totals.revenue)} ₽
              </div>
            </div>
            <div className="rounded-2xl bg-violet-600 p-4 text-white shadow-card">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                К выплате инвестору
              </div>
              <div className="mt-1 font-display text-[26px] font-extrabold tabular-nums">
                {fmt(calc.totals.payout)} ₽
              </div>
            </div>
            <div className="rounded-2xl bg-surface p-4 shadow-card-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Наша доля (в общей выручке)
              </div>
              <div className="mt-1 font-display text-[26px] font-extrabold tabular-nums text-green-ink">
                {fmt(calc.totals.ours)} ₽
              </div>
            </div>
          </div>

          {/* Таблица техники */}
          <div className="overflow-x-auto rounded-2xl bg-surface shadow-card-sm">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-muted-2">
                  <th className="px-4 py-3">Техника</th>
                  <th className="px-4 py-3 text-right">Выручка за период</th>
                  <th className="px-4 py-3 text-right">% инвестора</th>
                  <th className="px-4 py-3 text-right">Выплата инвестору</th>
                  <th className="px-4 py-3 text-right">Наша доля</th>
                </tr>
              </thead>
              <tbody>
                {calc.items.map((it) => (
                  <tr
                    key={it.scooter.id}
                    className="border-t border-border/60 transition-colors hover:bg-surface-soft/60"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          navigate({ route: "fleet", scooterId: it.scooter.id })
                        }
                        className="flex items-center gap-2 text-left font-semibold text-ink hover:text-blue-700"
                      >
                        <ScooterName
                          name={it.scooter.name}
                          number={it.scooter.rentalSlot}
                          exNumber={it.scooter.exRentalSlot}
                          size="sm"
                        />
                        {it.isElectric && <ElectricMark size="sm" />}
                        <span className="text-[11px] font-normal text-muted-2">
                          {it.modelName}
                          {it.scooter.uid ? ` · ID ${it.scooter.uid}` : ""}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      {fmt(it.revenue)} ₽
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editId === it.scooter.id ? (
                        <span className="inline-flex items-center gap-1">
                          <input
                            autoFocus
                            inputMode="numeric"
                            value={shareStr}
                            onChange={(e) =>
                              setShareStr(e.target.value.replace(/\D/g, ""))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveShare(it.scooter.id);
                              if (e.key === "Escape") setEditId(null);
                            }}
                            className="h-8 w-14 rounded-lg border border-blue-300 bg-white px-1 text-center text-[13px] font-bold tabular-nums outline-none focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => saveShare(it.scooter.id)}
                            className="h-8 rounded-lg bg-blue-600 px-2 text-[11px] font-bold text-white"
                          >
                            ОК
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditId(it.scooter.id);
                            setShareStr(String(it.sharePct));
                          }}
                          title={
                            it.custom
                              ? "Персональный процент для этой единицы. Клик — изменить"
                              : "Берётся общий процент. Клик — задать свой"
                          }
                          className={cn(
                            "inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-bold tabular-nums transition-colors",
                            it.custom
                              ? "bg-violet-50 text-violet-700 hover:bg-violet-100"
                              : "text-muted hover:bg-surface-soft hover:text-ink",
                          )}
                        >
                          {it.sharePct} %
                          {it.custom && (
                            <span className="text-[9px] font-bold uppercase">
                              свой
                            </span>
                          )}
                          <Pencil size={11} className="opacity-60" />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-violet-700">
                      {fmt(it.payout)} ₽
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-bold tabular-nums",
                        it.ours > 0 ? "text-green-ink" : "text-muted",
                      )}
                    >
                      {fmt(it.ours)} ₽
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-[11.5px] leading-relaxed text-muted-2">
            Выручка считается по правилам общей «Выручки» (без залогов и
            возвратов). Общая выручка на дашборде уже показана за вычетом
            доли инвестора. Процент задаётся на единицу техники — по
            умолчанию {DEFAULT_PARTNER_SHARE} %.
          </div>
        </>
      )}
    </main>
  );
}
