import { useMemo, useState } from "react";
import {
  Banknote,
  CalendarClock,
  ListFilter,
  ChevronRight,
  Pencil,
  Percent,
  Plus,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast, confirmDialog } from "@/lib/toast";
import {
  useApiInvestors,
  useCreateInvestor,
  useDeleteInvestor,
  useInvestorPayouts,
  useMarkPayout,
  usePatchInvestor,
  useUnmarkPayout,
  type ApiInvestor,
} from "@/lib/api/investors";
import { ApiError } from "@/lib/api";
import { useApiScooters } from "@/lib/api/scooters";
import { AddScooterModal } from "@/pages/fleet/AddScooterModal";
import { ScooterName } from "@/components/ScooterName";
import { ElectricMark } from "@/components/PowerTypeBadge";

/**
 * Правки 2.0, п.6-8 + правки 27.08: инвесторы партнёрской техники.
 *
 * Список инвесторов с ФИО, количеством техники, размером инвестиций и
 * средним доходом. Внутри инвестора:
 *   • ПРОЦЕНТ инвестора (правка 27.08) — задаётся здесь, техника наследует;
 *   • выплаты: «накопилось → выплатили» — счётчик к выплате и история
 *     (никакого графика с нулевыми строками и выплат будущим числом);
 *   • его техника — строки кликабельны (карточка внутри партнёрки),
 *     добавить технику можно прямо отсюда (инвестор уже выбран).
 */

const fmt = (n: number) => n.toLocaleString("ru-RU");

/** Склонение для подписи количества выплат. */
function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

const WEEK_DAYS = [
  { value: 1, label: "понедельник" },
  { value: 2, label: "вторник" },
  { value: 3, label: "среда" },
  { value: 4, label: "четверг" },
  { value: 5, label: "пятница" },
  { value: 6, label: "суббота" },
  { value: 7, label: "воскресенье" },
];

/** «раз в неделю, по пятницам» / «раз в месяц, 5-го числа». */
export function payoutRule(period: "week" | "month", day: number): string {
  if (period === "month") return `раз в месяц, ${day}-го числа`;
  const d = WEEK_DAYS.find((x) => x.value === day)?.label ?? "пятница";
  return `раз в неделю, по ${d === "среда" || d === "пятница" || d === "суббота" ? d + "м" : d + "ам"}`;
}

function ruDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function ruDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ru-RU")} ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

export function InvestorsTab({
  onOpenScooter,
}: {
  /** Открыть карточку техники внутри партнёрки. */
  onOpenScooter: (id: number) => void;
}) {
  const { data, isLoading } = useApiInvestors();
  const investors = data?.items ?? [];
  const [openId, setOpenId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ApiInvestor | null>(null);

  const totals = useMemo(
    () => ({
      units: investors.reduce((s, i) => s + i.units, 0),
      invested: investors.reduce((s, i) => s + i.invested, 0),
      monthly: investors.reduce((s, i) => s + i.monthlyIncome, 0),
    }),
    [investors],
  );

  const open = investors.find((i) => i.id === openId) ?? null;

  /**
   * Форма рендерится и в списке, и в карточке инвестора. Раньше она жила
   * только в ветке списка — из-за раннего return кнопка «Изменить» ставила
   * флаг, но форму никто не показывал (баг из фидбэка 27.08).
   */
  const form = formOpen && (
    <InvestorForm
      initial={editing}
      onClose={() => {
        setFormOpen(false);
        setEditing(null);
      }}
    />
  );

  if (open) {
    return (
      <>
        <InvestorDetails
          investor={open}
          onBack={() => setOpenId(null)}
          onEdit={() => {
            setEditing(open);
            setFormOpen(true);
          }}
          onOpenScooter={onOpenScooter}
        />
        {form}
      </>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      {/* Итоги по всем инвесторам */}
      {investors.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryTile
            label="Инвесторов"
            value={String(investors.length)}
            hint={`${totals.units} ед. техники`}
          />
          <SummaryTile
            label="Размер инвестиций"
            value={`${fmt(totals.invested)} ₽`}
            hint="сумма закупа их техники"
          />
          <SummaryTile
            label="Выплаты в месяц"
            value={`${fmt(totals.monthly)} ₽`}
            hint="средний доход инвесторов"
            accent
          />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl bg-surface shadow-card-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="text-[13px] font-bold text-ink">Инвесторы</div>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[12.5px] font-bold text-white transition-transform active:scale-[0.98]"
          >
            <UserPlus size={14} /> Добавить инвестора
          </button>
        </div>

        {isLoading ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted">
            Загружаем…
          </div>
        ) : investors.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
              <Wallet size={22} />
            </div>
            <div className="text-[15px] font-bold text-ink">
              Инвесторов пока нет
            </div>
            <div className="max-w-[460px] text-[13px] leading-relaxed text-muted">
              Партнёрская техника заводится через инвестора: добавьте его —
              и сможете сразу привязать к нему электротранспорт. По каждому
              будет видно количество единиц, размер инвестиций и доход.
            </div>
          </div>
        ) : (
          <>
            {/* Шапка таблицы — только на широком экране */}
            <div className="hidden grid-cols-[2fr_auto_1fr_1.2fr_1.2fr_auto] gap-3 border-b border-border/60 px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-2 lg:grid">
              <span>Инвестор</span>
              <span className="text-right">Процент</span>
              <span className="text-right">Техника</span>
              <span className="text-right">Инвестиции</span>
              <span className="text-right">Доход в месяц</span>
              <span />
            </div>
            {investors.map((inv) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => setOpenId(inv.id)}
                className="grid w-full grid-cols-2 gap-x-3 gap-y-1 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-soft/50 lg:grid-cols-[2fr_auto_1fr_1.2fr_1.2fr_auto] lg:items-center"
              >
                <span className="col-span-2 min-w-0 lg:col-span-1">
                  <span className="block truncate text-[14px] font-bold text-ink">
                    {inv.name}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted-2">
                    {inv.phone && <span>{inv.phone}</span>}
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock size={11} />
                      {payoutRule(inv.payoutPeriod, inv.payoutDay)}
                    </span>
                  </span>
                </span>
                <Cell label="Процент" value={`${inv.share} %`} accent />
                <Cell label="Техника" value={`${inv.units} ед.`} />
                <Cell label="Инвестиции" value={`${fmt(inv.invested)} ₽`} />
                <Cell
                  label="Доход в месяц"
                  value={`${fmt(inv.monthlyIncome)} ₽`}
                  accent
                />
                <ChevronRight
                  size={16}
                  className="hidden shrink-0 text-muted-2 lg:block"
                />
              </button>
            ))}
          </>
        )}
      </div>

      {form}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-3 shadow-card-sm",
        accent ? "bg-violet-600 text-white" : "bg-surface",
      )}
    >
      <div
        className={cn(
          "text-[10.5px] font-bold uppercase tracking-wider",
          accent ? "text-white/70" : "text-muted-2",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-[24px] font-extrabold leading-none tabular-nums",
          accent ? "text-white" : "text-ink",
        )}
      >
        {value}
      </div>
      <div
        className={cn(
          "mt-1 text-[11.5px]",
          accent ? "text-white/70" : "text-muted-2",
        )}
      >
        {hint}
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <span className="min-w-0 lg:text-right">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-2 lg:hidden">
        {label}
      </span>
      <span
        className={cn(
          "block truncate text-[13.5px] font-bold tabular-nums",
          accent ? "text-violet-700" : "text-ink",
        )}
      >
        {value}
      </span>
    </span>
  );
}

/** Карточка инвестора: выплаты (накопилось → выплатили) + его техника. */
function InvestorDetails({
  investor,
  onBack,
  onEdit,
  onOpenScooter,
}: {
  investor: ApiInvestor;
  onBack: () => void;
  onEdit: () => void;
  onOpenScooter: (id: number) => void;
}) {
  const { data: scooters = [] } = useApiScooters();
  /**
   * Правка 31.08 (заказчик): детализация выплат — история за прошлые
   * периоды с выбором произвольного диапазона. По умолчанию показываем
   * всю историю; период сужает список и даёт итог за него.
   */
  const [detailOpen, setDetailOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const payoutsQ = useInvestorPayouts(
    investor.id,
    detailOpen && (from || to) ? { from: from || undefined, to: to || undefined } : undefined,
  );
  const mark = useMarkPayout();
  const unmark = useUnmarkPayout();
  const del = useDeleteInvestor();
  const [addOpen, setAddOpen] = useState(false);

  const units = scooters.filter((s) => s.investorId === investor.id);
  const payouts = payoutsQ.data;
  const accrued = payouts?.accrued.amount ?? 0;

  /** Выплатить накопленное: подтверждение → POST (сумму считает сервер). */
  const payOut = async () => {
    if (accrued <= 0) return;
    const ok = await confirmDialog({
      title: `Выплатить ${fmt(accrued)} ₽ инвестору?`,
      message: `${investor.name} · процент ${investor.share} %. Счётчик «к выплате» обнулится, в истории останется запись с датой и суммой.`,
      confirmText: "Выплатить",
    });
    if (!ok) return;
    try {
      await mark.mutateAsync({ id: investor.id });
      toast.success(
        "Выплата проведена",
        `${fmt(accrued)} ₽ · ${investor.name}. Счётчик обнулён.`,
      );
      payoutsQ.refetch();
    } catch (e) {
      const body = (e as ApiError)?.body as { error?: string } | undefined;
      if (body?.error === "nothing_to_pay") {
        toast.error("Нет средств к выплате", "Доля инвестора ещё не накопилась");
        payoutsQ.refetch();
      } else {
        toast.error("Не получилось", "Попробуйте ещё раз");
      }
    }
  };

  /** Отменить выплату (провели по ошибке). */
  const undoPayout = async (rec: { id: number; amount: number; paidAt: string }) => {
    const ok = await confirmDialog({
      title: `Отменить выплату ${fmt(rec.amount)} ₽?`,
      message: `Запись от ${ruDateTime(rec.paidAt)} удалится, сумма вернётся в «к выплате».`,
      confirmText: "Отменить выплату",
      danger: true,
    });
    if (!ok) return;
    try {
      await unmark.mutateAsync({ id: investor.id, payoutId: rec.id });
      toast.success("Выплата отменена", "Сумма вернулась в «к выплате»");
      payoutsQ.refetch();
    } catch {
      toast.error("Не получилось", "Попробуйте ещё раз");
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Удалить инвестора «${investor.name}»?`,
      message:
        units.length > 0
          ? `У него ${units.length} ед. техники — сначала перепривяжите её к другому инвестору.`
          : "Инвестор скроется из списка. История выплат сохранится.",
      confirmText: "Удалить",
      danger: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(investor.id);
      toast.success("Инвестор удалён");
      onBack();
    } catch {
      toast.error("Не удалось удалить", "Сначала перепривяжите его технику");
    }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 shadow-card-sm hover:text-ink"
        >
          ← К списку
        </button>
        <h2 className="font-display text-[22px] font-extrabold leading-none text-ink">
          {investor.name}
        </h2>
        <span className="rounded-full bg-violet-600 px-2.5 py-1 text-[11.5px] font-bold text-white">
          {investor.share} %
        </span>
        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11.5px] font-bold text-violet-700">
          {payoutRule(investor.payoutPeriod, investor.payoutDay)}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 shadow-card-sm hover:text-ink"
        >
          <Pencil size={13} /> Изменить
        </button>
        <button
          type="button"
          onClick={remove}
          className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-red-ink hover:bg-red-soft"
        >
          Удалить
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          label="Техника"
          value={`${investor.units} ед.`}
          hint="в парке инвестора"
        />
        <SummaryTile
          label="Инвестиции"
          value={`${fmt(investor.invested)} ₽`}
          hint="сумма закупа"
        />
        <SummaryTile
          label="Доход в месяц"
          value={`${fmt(investor.monthlyIncome)} ₽`}
          hint="в среднем"
          accent
        />
      </div>

      {/* Выплаты (правка 27.08): накопилось → выплатили → история. */}
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-ink">Выплаты</span>
            <button
              type="button"
              onClick={() => setDetailOpen((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold transition-colors",
                detailOpen
                  ? "bg-violet-600 text-white"
                  : "bg-violet-50 text-violet-700 hover:bg-violet-100",
              )}
            >
              <ListFilter size={12} />
              Детализация
            </button>
          </div>
          {payouts && (
            <div className="text-[11.5px] text-muted">
              день выплаты: {ruDate(payouts.nextDue.date)}
              {payouts.nextDue.isToday && (
                <span className="ml-1.5 rounded-full bg-amber-400 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-amber-950">
                  сегодня
                </span>
              )}
            </div>
          )}
        </div>

        {payoutsQ.isLoading ? (
          <div className="px-4 py-8 text-center text-[13px] text-muted">
            Считаем выплаты…
          </div>
        ) : (
          <>
            {/* Счётчик к выплате + кнопка */}
            <div className="flex flex-wrap items-center gap-4 border-b border-border/60 px-4 py-4">
              <div className="min-w-[160px]">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
                  К выплате сейчас
                </div>
                <div
                  className={cn(
                    "mt-1 font-display text-[30px] font-extrabold leading-none tabular-nums",
                    accrued > 0 ? "text-violet-700" : "text-muted-2",
                  )}
                >
                  {fmt(accrued)} ₽
                </div>
                <div className="mt-1 text-[11.5px] text-muted-2">
                  {investor.share} % от выручки его техники · копится с каждой
                  оплаты
                </div>
              </div>
              <div className="flex-1" />
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={payOut}
                  disabled={accrued <= 0 || mark.isPending}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[13.5px] font-bold transition-transform",
                    accrued > 0
                      ? "bg-violet-600 text-white active:scale-[0.98]"
                      : "cursor-not-allowed bg-surface-soft text-muted-2",
                  )}
                >
                  <Banknote size={15} />
                  {accrued > 0 ? `Выплатить ${fmt(accrued)} ₽` : "Нет средств к выплате"}
                </button>
                {payouts && payouts.accrued.paidTotal > 0 && (
                  <span className="text-[11px] text-muted-2">
                    всего выплачено: {fmt(payouts.accrued.paidTotal)} ₽
                  </span>
                )}
              </div>
            </div>

            {/* Детализация: произвольный период + итог за него */}
            {detailOpen && (
              <div className="flex flex-wrap items-end gap-3 border-b border-border/60 bg-surface-soft/40 px-4 py-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
                    Период с
                  </span>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="h-9 rounded-[10px] border border-border bg-surface px-2.5 text-[13px] tabular-nums outline-none focus:border-violet-500"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
                    по
                  </span>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-9 rounded-[10px] border border-border bg-surface px-2.5 text-[13px] tabular-nums outline-none focus:border-violet-500"
                  />
                </label>
                {(from || to) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFrom("");
                      setTo("");
                    }}
                    className="h-9 rounded-full px-3 text-[12.5px] font-semibold text-muted hover:text-ink"
                  >
                    Сбросить
                  </button>
                )}
                <div className="ml-auto text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
                    {from || to ? "Выплачено за период" : "Выплачено за всё время"}
                  </div>
                  <div className="font-display text-[20px] font-extrabold tabular-nums text-ink">
                    {fmt(payouts?.periodTotal ?? 0)} ₽
                  </div>
                  <div className="text-[11px] text-muted-2">
                    {payouts?.history.length ?? 0}{" "}
                    {plural(payouts?.history.length ?? 0, [
                      "выплата",
                      "выплаты",
                      "выплат",
                    ])}
                  </div>
                </div>
              </div>
            )}

            {/* История выплат */}
            {(payouts?.history.length ?? 0) === 0 ? (
              <div className="px-4 py-6 text-center text-[12.5px] text-muted-2">
                {from || to
                  ? "За выбранный период выплат не было."
                  : "Выплат ещё не было — история появится после первой выплаты."}
              </div>
            ) : (
              payouts!.history.map((rec) => (
                <div
                  key={rec.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-4 py-2.5 last:border-b-0"
                >
                  <span className="min-w-[130px] text-[13px] tabular-nums text-ink-2">
                    {ruDateTime(rec.paidAt)}
                  </span>
                  {rec.by && (
                    <span className="text-[11.5px] text-muted-2">{rec.by}</span>
                  )}
                  {rec.note && (
                    <span className="truncate text-[11.5px] text-muted">
                      {rec.note}
                    </span>
                  )}
                  <span className="ml-auto font-display text-[16px] font-extrabold tabular-nums text-ink">
                    {fmt(rec.amount)} ₽
                  </span>
                  <button
                    type="button"
                    onClick={() => undoPayout(rec)}
                    className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-muted-2 hover:bg-red-soft hover:text-red-ink"
                    title="Отменить выплату (провели по ошибке)"
                  >
                    отменить
                  </button>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* Техника инвестора: строки кликабельны, добавить — прямо отсюда. */}
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="text-[13px] font-bold text-ink">
            Техника инвестора · {units.length}
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[12.5px] font-bold text-white transition-transform active:scale-[0.98]"
          >
            <Plus size={14} /> Добавить технику
          </button>
        </div>
        {units.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-muted">
            Техники пока нет — добавьте её кнопкой выше, инвестор уже выбран.
          </div>
        ) : (
          units.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpenScooter(s.id)}
              className="flex w-full items-center gap-2.5 border-b border-border/60 px-4 py-2.5 text-left text-[13.5px] transition-colors last:border-b-0 hover:bg-surface-soft/50"
            >
              <ElectricMark size="sm" />
              <ScooterName
                name={s.name}
                number={s.rentalSlot ?? undefined}
                exNumber={s.exRentalSlot ?? undefined}
                className="font-bold text-ink"
              />
              <span className="text-[12px] text-muted-2">ID {s.uid ?? "—"}</span>
              <span className="ml-auto text-[12.5px] text-muted">
                {s.purchasePrice ? `${fmt(s.purchasePrice)} ₽` : "цена не указана"}
              </span>
              <ChevronRight size={15} className="shrink-0 text-muted-2" />
            </button>
          ))
        )}
      </div>

      {addOpen && (
        <AddScooterModal
          partner
          defaultInvestorId={investor.id}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}

/** Форма инвестора: ФИО, телефон, ПРОЦЕНТ и настройки выплат. */
function InvestorForm({
  initial,
  onClose,
}: {
  initial: ApiInvestor | null;
  onClose: () => void;
}) {
  const create = useCreateInvestor();
  const patch = usePatchInvestor();
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [share, setShare] = useState<string>(String(initial?.share ?? 50));
  const [period, setPeriod] = useState<"week" | "month">(
    initial?.payoutPeriod ?? "week",
  );
  const [day, setDay] = useState<number>(initial?.payoutDay ?? 5);
  const [saving, setSaving] = useState(false);

  const shareNum = Number(share);
  const shareValid =
    share.trim() !== "" && Number.isInteger(shareNum) && shareNum >= 0 && shareNum <= 100;

  const save = async () => {
    if (!name.trim() || !shareValid) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        phone: phone.trim() || null,
        share: shareNum,
        payoutPeriod: period,
        payoutDay: day,
      };
      if (initial) {
        await patch.mutateAsync({ id: initial.id, ...body });
        toast.success(
          "Инвестор обновлён",
          `Процент ${shareNum} % · ${payoutRule(period, day)}`,
        );
      } else {
        await create.mutateAsync(body);
        toast.success(
          "Инвестор добавлен",
          `${name.trim()} · ${shareNum} % · ${payoutRule(period, day)}`,
        );
      }
      onClose();
    } catch {
      toast.error("Не удалось сохранить", "Попробуйте ещё раз");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-stretch justify-center bg-ink/55 sm:items-center sm:p-6 sm:backdrop-blur-sm">
      <div className="flex h-[100dvh] w-full flex-col bg-surface sm:h-auto sm:max-w-[520px] sm:rounded-2xl sm:shadow-card-lg">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
              {initial ? "Изменение" : "Новый инвестор"}
            </div>
            <div className="mt-0.5 font-display text-[20px] font-extrabold text-ink">
              {initial ? initial.name : "Добавить инвестора"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-2 hover:bg-surface-soft hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
              ФИО инвестора <span className="text-red-ink">*</span>
            </span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Волков Игорь Петрович"
              className="h-10 w-full rounded-[10px] border border-border bg-surface px-3.5 text-[14px] outline-none focus:border-blue-600"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Телефон
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 900 000-00-00"
              className="h-10 w-full rounded-[10px] border border-border bg-surface px-3.5 text-[14px] outline-none focus:border-blue-600"
            />
          </label>

          {/* Правка 27.08: процент — свойство инвестора, техника наследует. */}
          <div className="rounded-[14px] border border-violet-200 bg-violet-50/40 p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-700">
              <Percent size={12} /> Процент инвестора{" "}
              <span className="text-red-ink">*</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                inputMode="numeric"
                value={share}
                onChange={(e) => setShare(e.target.value.replace(/\D/g, ""))}
                className={cn(
                  "h-10 w-24 rounded-[10px] border bg-white px-3 text-center text-[16px] font-bold tabular-nums outline-none",
                  shareValid
                    ? "border-violet-300 focus:border-violet-500"
                    : "border-red-300 focus:border-red-400",
                )}
              />
              <span className="text-[15px] font-bold text-ink-2">%</span>
              <span className="text-[11.5px] leading-snug text-muted">
                его доля от выручки его техники. Вся техника этого инвестора
                наследует процент автоматически.
              </span>
            </div>
          </div>

          {/* П.6: периодичность и день выплаты */}
          <div className="rounded-[14px] border border-violet-200 bg-violet-50/40 p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-700">
              <CalendarClock size={12} /> Выплаты инвестору
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              {(
                [
                  ["week", "Раз в неделю"],
                  ["month", "Раз в месяц"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setPeriod(key);
                    setDay(5);
                  }}
                  className={cn(
                    "rounded-[10px] border px-3 py-2 text-[12.5px] font-semibold transition-colors",
                    period === key
                      ? "border-violet-500 bg-violet-500 text-white"
                      : "border-border bg-surface text-ink-2 hover:border-violet-400",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                {period === "week" ? "День недели" : "Число месяца"}
              </div>
              {period === "week" ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {WEEK_DAYS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDay(d.value)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[12px] font-semibold capitalize transition-colors",
                        day === d.value
                          ? "bg-ink text-white"
                          : "bg-surface text-muted hover:text-ink",
                      )}
                    >
                      {d.label.slice(0, 2)}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={day}
                  onChange={(e) =>
                    setDay(Math.min(28, Math.max(1, Number(e.target.value) || 1)))
                  }
                  className="mt-1.5 h-9 w-24 rounded-[10px] border border-border bg-surface px-3 text-[13px] tabular-nums outline-none focus:border-blue-600"
                />
              )}
            </div>

            <div className="mt-2.5 text-[11.5px] text-muted">
              Это напоминание, не ограничение: в день выплаты подсветим, что
              пора платить — <b className="text-ink-2">{payoutRule(period, day)}</b>.
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-soft px-5 py-3">
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
            disabled={!name.trim() || !shareValid || saving}
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
          >
            <Plus size={14} /> {initial ? "Сохранить" : "Добавить"}
          </button>
        </div>
      </div>
    </div>
  );
}
