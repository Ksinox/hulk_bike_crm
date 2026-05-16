/**
 * v0.4.1 — страница «Настройки» (только для director / creator).
 *
 * Сейчас одна секция — «Финансы → День начала расчётного периода».
 * По умолчанию 15-е число. При изменении все KPI/отчёты, использующие
 * lib/billingPeriod, автоматически пересчитываются (через setter).
 *
 * UI намеренно минимальный — пока тут одна настройка. Позже сюда
 * приедут другие глобальные параметры (тарифы, штрафы, etc).
 */
import { useMemo, useState } from "react";
import { Save, Settings as SettingsIcon, Lock, AlertTriangle, CalendarClock } from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { useAppSettings, useSetAppSetting } from "@/lib/api/app-settings";
import {
  useBillingPeriodAnchors,
  useCurrentBillingPeriodInfo,
  useSwitchBillingPeriod,
} from "@/lib/api/billing-period";
import { planTransition, formatBillingDate } from "@/lib/billingPeriod";
import { toast } from "@/lib/toast";
import { useMe } from "@/lib/api/auth";

export function Settings() {
  const me = useMe();
  // v0.4.22: разрешаем менять настройки также роли 'admin' — заказчик
  // часто работает под админкой и хочет настраивать расчётный период
  // и часы работы без переключения на директорский профиль.
  // Бэкенд PUT /api/app-settings/:key всё ещё проверяет
  // director/creator (см. routes/app-settings.ts). Ослаблю и его.
  const isAdmin =
    me.data?.role === "director" ||
    me.data?.role === "creator" ||
    me.data?.role === "admin";
  const settingsQ = useAppSettings();
  const setMut = useSetAppSetting();
  const items = settingsQ.data ?? [];
  const map = new Map(items.map((s) => [s.key, s.value]));

  // v0.7: текущее правило и история переключений приходят из новой
  // таблицы billing_period_anchors. Старый app_settings.billing_period_start_day
  // сервер зеркалит автоматически — но источник правды теперь anchors.
  const currentInfoQ = useCurrentBillingPeriodInfo();
  const anchorsQ = useBillingPeriodAnchors();
  const switchMut = useSwitchBillingPeriod();
  const currentRule = currentInfoQ.data?.ruleStartDay ?? Number(map.get("billing_period_start_day") ?? "15");
  const transitionActive = currentInfoQ.data?.transitionActive ?? false;
  const currentPeriodLabel = currentInfoQ.data?.period.label ?? "—";
  const currentPeriodKind = currentInfoQ.data?.period.kind ?? "regular";

  const [periodStartDay, setPeriodStartDay] = useState<string>(
    String(currentRule),
  );

  // Превью того, как разложится переключение, если сохранить новое
  // значение прямо сейчас.
  const preview = useMemo(() => {
    const n = Number(periodStartDay);
    if (!Number.isFinite(n) || n < 1 || n > 28) return null;
    return planTransition(new Date(), currentRule, n);
  }, [periodStartDay, currentRule]);
  const [workStart, setWorkStart] = useState<string>(
    map.get("work_hours_start") ?? "9",
  );
  const [workEnd, setWorkEnd] = useState<string>(
    map.get("work_hours_end") ?? "22",
  );

  const saveWorkHours = async () => {
    const s = Number(workStart);
    const e = Number(workEnd);
    if (
      !Number.isFinite(s) ||
      !Number.isFinite(e) ||
      s < 0 ||
      s > 23 ||
      e < 1 ||
      e > 24 ||
      e <= s
    ) {
      toast.error(
        "Неверный график",
        "Открытие — час 0..23, закрытие — час 1..24, закрытие позже открытия.",
      );
      return;
    }
    try {
      await Promise.all([
        setMut.mutateAsync({
          key: "work_hours_start",
          value: String(Math.floor(s)),
        }),
        setMut.mutateAsync({
          key: "work_hours_end",
          value: String(Math.floor(e)),
        }),
      ]);
      toast.success(
        "График работы сохранён",
        `${s}:00 — ${e}:00. Часовой график выручки на дашборде использует эти границы.`,
      );
    } catch (e2) {
      toast.error("Не удалось сохранить", (e2 as Error).message ?? "");
    }
  };

  const savePeriodStartDay = async () => {
    const n = Number(periodStartDay);
    if (!Number.isFinite(n) || n < 1 || n > 28) {
      toast.error("Неверное значение", "Допустимо число от 1 до 28.");
      return;
    }
    if (n === currentRule) {
      toast.error(
        "Нечего переключать",
        "Это значение уже выставлено как текущее правило.",
      );
      return;
    }
    if (transitionActive) {
      toast.error(
        "Идёт переходный период",
        "Дождитесь окончания текущего переходного периода, затем переключите ещё раз.",
      );
      return;
    }
    try {
      const res = await switchMut.mutateAsync({ newStartDay: Math.floor(n) });
      toast.success(
        "Переключение запланировано",
        "Старый период доживёт до " +
          res.plan.currentPeriod.end +
          ". Переходный: " +
          res.plan.transitionStart +
          " — " +
          res.plan.transitionEnd +
          ". С " +
          res.plan.firstNewPeriodStart +
          " — новая схема.",
      );
    } catch (e) {
      toast.error("Не удалось переключить", (e as Error).message ?? "");
    }
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

      <header className="flex items-baseline gap-3">
        <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
          Настройки
        </h1>
      </header>

      {!isAdmin ? (
        <div className="rounded-2xl bg-surface p-8 text-center shadow-card-sm">
          <Lock size={32} className="mx-auto mb-2 text-muted-2" />
          <div className="text-[14px] font-semibold text-ink">
            Только директор и создатель системы могут менять настройки.
          </div>
          <div className="mt-1 text-[12px] text-muted">
            Зайдите под нужной ролью.
          </div>
        </div>
      ) : (
        <section className="rounded-2xl bg-surface p-5 shadow-card-sm">
          <div className="mb-3 flex items-center gap-2">
            <SettingsIcon size={16} className="text-blue-600" />
            <div className="text-[14px] font-semibold text-ink">Финансы</div>
          </div>

          <div className="rounded-[14px] border border-border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[13px] font-semibold text-ink">
                День начала расчётного периода
              </div>
              <div className="text-[11px] text-muted-2">
                Сейчас:{" "}
                <b className="text-ink">{currentRule}</b>{" "}
                <span className="text-muted">·</span>{" "}
                <span className={currentPeriodKind === "transition" ? "text-amber-700" : "text-muted"}>
                  {currentPeriodLabel}
                </span>
              </div>
            </div>
            <div className="mt-1 max-w-[640px] text-[12px] text-muted">
              Период длится с этого дня одного месяца по «день минус 1»
              следующего. При переключении старый период доживает свой
              срок естественно, затем короткий «переходный» — и только
              потом начинает работать новая схема. Исторические аренды
              остаются в своих периодах, цифры в KPI задним числом не
              скачут.
            </div>

            {transitionActive && (
              <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">
                <AlertTriangle size={14} className="mt-[2px] flex-none text-amber-700" />
                <div>
                  Сейчас идёт переходный период{" "}
                  <b>{currentPeriodLabel}</b>. Переключить правило ещё
                  раз можно только после его окончания.
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={28}
                value={periodStartDay}
                onChange={(e) => setPeriodStartDay(e.target.value)}
                disabled={transitionActive}
                className="h-10 w-24 rounded-[10px] border border-border bg-white px-3 text-[14px] text-ink outline-none focus:border-blue-600 disabled:opacity-50"
              />
              <span className="text-[12px] text-muted">
                число месяца (1–28)
              </span>
              <button
                type="button"
                onClick={savePeriodStartDay}
                disabled={switchMut.isPending || transitionActive}
                className="ml-auto inline-flex items-center gap-1 rounded-full bg-ink px-4 py-2 text-[12px] font-bold text-white hover:bg-blue-600 disabled:opacity-50"
              >
                <Save size={12} /> Сохранить
              </button>
            </div>

            {preview && Number(periodStartDay) !== currentRule && !transitionActive && (
              <div className="mt-3 rounded-[10px] border border-blue-100 bg-blue-50 p-3 text-[12px] text-ink">
                <div className="mb-1 flex items-center gap-2 font-semibold text-blue-900">
                  <CalendarClock size={14} /> Раскладка после сохранения
                </div>
                <ol className="space-y-1 pl-5 [list-style:decimal]">
                  <li>
                    Текущий период:{" "}
                    <b>
                      {formatBillingDate(preview.currentPeriod.start)} —{" "}
                      {formatBillingDate(
                        new Date(preview.currentPeriod.end.getTime() - 86_400_000),
                      )}
                    </b>{" "}
                    — доживает до конца как обычно.
                  </li>
                  <li>
                    Переходный:{" "}
                    <b>
                      {formatBillingDate(preview.transitionStart)} —{" "}
                      {formatBillingDate(preview.transitionEnd)}
                    </b>{" "}
                    — короткий период «для выравнивания», новые аренды
                    и платежи в эти дни идут сюда.
                  </li>
                  <li>
                    С{" "}
                    <b>{formatBillingDate(preview.firstNewPeriod.start)}</b> —
                    полноценные периоды по новой схеме (
                    {Number(periodStartDay)} → «последний день»).
                  </li>
                </ol>
              </div>
            )}

            {/* История переключений */}
            {(anchorsQ.data?.length ?? 0) > 1 && (
              <div className="mt-3 rounded-[10px] border border-border p-3 text-[12px]">
                <div className="mb-2 font-semibold text-ink">
                  История переключений
                </div>
                <table className="w-full text-left text-[11px]">
                  <thead className="text-muted-2">
                    <tr>
                      <th className="pb-1 font-normal">Дата</th>
                      <th className="pb-1 font-normal">Правило</th>
                      <th className="pb-1 font-normal">Тип</th>
                      <th className="pb-1 font-normal">Переходный до</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(anchorsQ.data ?? [])]
                      .sort((a, b) =>
                        b.effectiveFrom.localeCompare(a.effectiveFrom),
                      )
                      .map((a) => (
                        <tr key={a.id} className="border-t border-border/60">
                          <td className="py-1">{a.effectiveFrom}</td>
                          <td className="py-1">{a.ruleStartDay}</td>
                          <td className="py-1">
                            {a.kind === "transition" ? "переходный" : "обычный"}
                          </td>
                          <td className="py-1">
                            {a.transitionEndDate ?? "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-2 text-[11px] text-muted-2">
              Переключение действует мгновенно для всех пользователей —
              после следующего открытия страницы или ~минуты бездействия.
            </div>
          </div>

          {/* v0.4.21: график работы магазина */}
          <div className="mt-4 rounded-[14px] border border-border p-4">
            <div className="text-[13px] font-semibold text-ink">
              График работы магазина
            </div>
            <div className="mt-1 max-w-[640px] text-[12px] text-muted">
              Часы открытия/закрытия. Используются в почасовом графике
              выручки на дашборде (режим «День»). Можно ставить
              нестандартные часы — например для круглосуточной точки
              0–24.
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-muted">Открытие</span>
              <input
                type="number"
                min={0}
                max={23}
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                className="h-10 w-20 rounded-[10px] border border-border bg-white px-3 text-[14px] text-ink outline-none focus:border-blue-600"
              />
              <span className="text-[12px] text-muted">:00 → закрытие</span>
              <input
                type="number"
                min={1}
                max={24}
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
                className="h-10 w-20 rounded-[10px] border border-border bg-white px-3 text-[14px] text-ink outline-none focus:border-blue-600"
              />
              <span className="text-[12px] text-muted">:00</span>
              <button
                type="button"
                onClick={saveWorkHours}
                disabled={setMut.isPending}
                className="ml-auto inline-flex items-center gap-1 rounded-full bg-ink px-4 py-2 text-[12px] font-bold text-white hover:bg-blue-600 disabled:opacity-50"
              >
                <Save size={12} /> Сохранить
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
