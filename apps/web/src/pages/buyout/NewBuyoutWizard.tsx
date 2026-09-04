import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Printer,
  Radar,
  Search,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useAllClients } from "@/pages/clients/clientStore";
import { AddClientModal } from "@/pages/clients/AddClientModal";
import { SendApplicationButton } from "@/pages/applications/SendApplicationButton";
import { useApiScooters } from "@/lib/api/scooters";
import { useRentals } from "@/pages/rentals/rentalsStore";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import {
  buyoutContractUrl,
  useBuyoutContract,
  useBuyoutDeals,
  useBuyoutMarkups,
  useCreateBuyoutDeal,
  usePatchBuyoutDeal,
  useSignBuyoutDeal,
  type BuyoutDeal,
} from "@/lib/api/buyout";
import { saleFormUrl } from "@/pages/sales/saleForm";
import { fmt } from "@/pages/sales/salesUtils";

/**
 * Мастер сделки «аренда с выкупом» (01.09) — шаги из задания:
 *   1) клиент (анкета с паспортом, как в продаже);
 *   2) проверка по чёрным спискам — осознанная отметка менеджера;
 *   3) техника;
 *   4) условия: срок, наценка, первоначальный взнос, периодичность —
 *      всё считает встроенный калькулятор;
 *   5) AirTag — напоминание, без него сделку не подписать;
 *   6) договор и подписание.
 *
 * Черновик сохраняется на каждом шаге: прерванная сделка не теряется.
 */

const STEPS = ["Клиент", "Проверка", "Техника", "Условия", "Метка", "Договор"] as const;

const TERMS = [1, 2, 3, 4, 5, 6];

export function NewBuyoutWizard({
  dealId: initialDealId,
  presetClientId,
  onClose,
}: {
  dealId?: number | null;
  presetClientId?: number | null;
  onClose: () => void;
}) {
  const { data: dealsData } = useBuyoutDeals();
  const { data: markupsData } = useBuyoutMarkups();
  const clients = useAllClients();
  const { data: scooters = [] } = useApiScooters();
  const rentals = useRentals();
  /** Техника с живой арендой — в выкуп нельзя (правило 04.09). */
  const busyScooterIds = useMemo(
    () =>
      new Set(
        rentals
          .filter(
            (r) =>
              r.status === "active" ||
              r.status === "overdue" ||
              r.status === "returning",
          )
          .map((r) => r.scooterId)
          .filter((id): id is number => id != null),
      ),
    [rentals],
  );
  const { data: models = [] } = useApiScooterModels();

  const createDeal = useCreateBuyoutDeal();
  const patchDeal = usePatchBuyoutDeal();
  const genContract = useBuyoutContract();
  const signDeal = useSignBuyoutDeal();

  const [dealId, setDealId] = useState<number | null>(initialDealId ?? null);
  const deal: BuyoutDeal | null =
    (dealId != null && dealsData?.items.find((d) => d.id === dealId)) || null;

  const [step, setStep] = useState(0);
  const [clientId, setClientId] = useState<number | null>(
    deal?.clientId ?? presetClientId ?? null,
  );
  const [blacklistChecked, setBlacklistChecked] = useState(
    deal?.blacklistChecked ?? false,
  );
  const [scooterId, setScooterId] = useState<number | null>(deal?.scooterId ?? null);
  const [termMonths, setTermMonths] = useState(deal?.termMonths ?? 3);
  const [period, setPeriod] = useState<"month" | "week">(deal?.period ?? "month");
  const [down, setDown] = useState(String(deal?.downPayment ?? ""));
  const [price, setPrice] = useState(String(deal?.scooterPrice ?? ""));
  const [startDate, setStartDate] = useState(deal?.startDate ?? "");
  const [airtag, setAirtag] = useState(deal?.airtagConfirmed ?? false);
  const [clientQ, setClientQ] = useState("");
  const [scooterQ, setScooterQ] = useState("");
  const [addClient, setAddClient] = useState(false);
  const [busy, setBusy] = useState(false);
  const hydrated = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Продолжение начатой сделки.
  useEffect(() => {
    if (initialDealId == null) {
      hydrated.current = true;
      return;
    }
    if (!deal || hydrated.current) return;
    hydrated.current = true;
    setClientId(deal.clientId);
    setBlacklistChecked(deal.blacklistChecked);
    setScooterId(deal.scooterId);
    setTermMonths(deal.termMonths);
    setPeriod(deal.period);
    setDown(String(deal.downPayment || ""));
    setPrice(String(deal.scooterPrice || ""));
    setStartDate(deal.startDate ?? "");
    setAirtag(deal.airtagConfirmed);
    if (deal.status === "contract") setStep(5);
    else if (deal.scooterId) setStep(3);
    else if (deal.clientId) setStep(2);
  }, [deal, initialDealId]);

  // Автофокус поля шага + Enter «дальше» — как в мастере продажи.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const el = bodyRef.current?.querySelector<HTMLElement>(
        "input:not([type=file]):not([type=checkbox]):not([disabled])",
      );
      el?.focus();
      if (el instanceof HTMLInputElement && el.value) el.select();
    }, 60);
    return () => window.clearTimeout(t);
  }, [step]);

  const modelById = useMemo(
    () => new Map(models.map((m) => [m.id, m] as const)),
    [models],
  );
  const stock = useMemo(
    () =>
      scooters.filter(
        (s) =>
          !s.archivedAt &&
          !s.isPartner &&
          // Пока техника у клиента — в выкуп не предлагаем: сначала
          // завершить аренду. Сервер это правило тоже держит.
          (!busyScooterIds.has(s.id) || s.id === scooterId) &&
          (s.baseStatus === "for_sale" ||
            s.baseStatus === "ready" ||
            s.baseStatus === "rental_pool" ||
            s.id === scooterId),
      ),
    [scooters, scooterId, busyScooterIds],
  );

  const client = clients.find((c) => c.id === clientId) ?? null;
  const scooter = scooters.find((s) => s.id === scooterId) ?? null;
  const markups = markupsData?.markups ?? {};

  // Калькулятор — считаем на месте, чтобы цифры менялись под рукой.
  const calc = useMemo(() => {
    const base =
      Number(price) ||
      scooter?.salePrice ||
      scooter?.marketValue ||
      scooter?.purchasePrice ||
      0;
    const markup = Number(markups[String(termMonths)] ?? 0);
    const total = base + markup;
    const downNum = Math.min(Number(down) || 0, total);
    const financed = total - downNum;
    const count = period === "week" ? termMonths * 4 : termMonths;
    const payment = count > 0 ? Math.ceil(financed / count / 100) * 100 : 0;
    const last = Math.max(0, financed - payment * (count - 1));
    return { base, markup, total, downNum, financed, count, payment, last };
  }, [price, scooter, markups, termMonths, down, period]);

  const hasPassport = !!(
    client &&
    (client.passportRaw || (client.passportSeries && client.passportNumber))
  );

  const persist = async (patch: Record<string, unknown>) => {
    if (dealId == null) {
      const created = await createDeal.mutateAsync(patch);
      setDealId(created.id);
      return created;
    }
    return patchDeal.mutateAsync({ id: dealId, ...patch });
  };

  const next = async () => {
    setBusy(true);
    try {
      if (step === 0) {
        if (!clientId) return toast.error("Выберите клиента");
        await persist({ clientId });
      } else if (step === 1) {
        if (!blacklistChecked) {
          return toast.error("Отметьте, что проверили клиента по чёрным спискам");
        }
        await persist({ blacklistChecked: true });
      } else if (step === 2) {
        if (!scooterId) return toast.error("Выберите технику");
        const created = await persist({ scooterId });
        if (!price && created?.scooterPrice) setPrice(String(created.scooterPrice));
      } else if (step === 3) {
        if (calc.total <= 0) return toast.error("Укажите стоимость техники");
        if (calc.financed <= 0) {
          return toast.error("Взнос покрывает всю сумму — это продажа, не выкуп");
        }
        await persist({
          scooterPrice: calc.base,
          termMonths,
          downPayment: calc.downNum,
          period,
          startDate: startDate || null,
        });
      } else if (step === 4) {
        if (!airtag) return toast.error("Подтвердите установку метки на технику");
        await persist({ airtagConfirmed: true });
      } else if (step === 5) {
        if (dealId != null) await genContract.mutateAsync(dealId);
      }
      setStep((s) => Math.min(STEPS.length - 1, s + 1));
    } catch {
      toast.error("Не удалось сохранить шаг");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (dealId == null) return;
    setBusy(true);
    try {
      await signDeal.mutateAsync(dealId);
      toast.success("Выкуп начат — график платежей построен");
      onClose();
    } catch {
      toast.error("Не удалось подписать сделку");
    } finally {
      setBusy(false);
    }
  };

  const canNext =
    (step === 0 && !!clientId) ||
    (step === 1 && blacklistChecked) ||
    (step === 2 && !!scooterId) ||
    (step === 3 && calc.total > 0 && calc.financed > 0) ||
    (step === 4 && airtag) ||
    step === 5;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    const el = e.target as HTMLElement;
    if (el.tagName === "TEXTAREA") return;
    e.preventDefault();
    if (step < STEPS.length - 1) {
      if (canNext && !busy) void next();
    } else if (!busy) void finish();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 animate-backdrop-in sm:items-center sm:p-4">
      <div className="flex h-[100dvh] w-full max-w-[720px] flex-col overflow-hidden bg-surface shadow-card-lg animate-modal-in sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
        <header className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-bold text-ink">
                {deal ? `Выкуп #${String(deal.id).padStart(4, "0")}` : "Аренда с выкупом"}
              </div>
              <div className="truncate text-[12px] text-muted">
                Шаг {step + 1} из {STEPS.length} · {STEPS[step]}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-2 hover:bg-surface-soft hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
          <div className="mt-3 flex gap-1">
            {STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                disabled={i > step}
                onClick={() => i < step && setStep(i)}
                className="flex min-w-0 flex-1 flex-col gap-1"
              >
                <span
                  className={cn(
                    "h-1.5 rounded-full transition-colors",
                    i < step ? "bg-blue-600" : i === step ? "bg-ink" : "bg-surface-soft",
                  )}
                />
                <span
                  className={cn(
                    "truncate text-[10px] font-semibold",
                    i === step ? "text-ink" : "text-muted-2",
                  )}
                >
                  {s}
                </span>
              </button>
            ))}
          </div>
        </header>

        <div
          ref={bodyRef}
          onKeyDown={onKeyDown}
          className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"
        >
          {step === 0 && (
            <div className="flex flex-col gap-3">
              <Hint text="Клиент забирает технику сразу, поэтому паспортные данные обязательны — они уходят в договор. Нового клиента можно завести здесь же или отправить ему анкету." />
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
                  />
                  <input
                    value={clientQ}
                    onChange={(e) => setClientQ(e.target.value)}
                    placeholder="Имя или телефон"
                    className="h-11 w-full rounded-[14px] border border-border bg-surface pl-9 pr-3 text-[14px] outline-none focus:border-blue-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setAddClient(true)}
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] bg-ink px-4 text-[13px] font-bold text-white"
                >
                  <UserPlus size={15} /> Новый
                </button>
                <SendApplicationButton
                  label="Анкета"
                  text="Здравствуйте! Для оформления аренды с выкупом в Халк Байк заполните, пожалуйста, короткую анкету с паспортными данными: "
                  formUrl={saleFormUrl()}
                  className="h-11 shrink-0 rounded-[14px]"
                />
              </div>
              {client && !hasPassport && (
                <Warn text="У клиента не заполнен паспорт — в договоре эти поля останутся пустыми." />
              )}
              <div className="flex flex-col overflow-hidden rounded-2xl border border-border">
                {clients
                  .filter((c) =>
                    clientQ.trim()
                      ? `${c.name} ${c.phone}`
                          .toLowerCase()
                          .includes(clientQ.trim().toLowerCase())
                      : true,
                  )
                  .slice(0, 40)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setClientId(c.id)}
                      className={cn(
                        "flex items-center gap-3 border-b border-border/60 px-3 py-3 text-left transition-colors last:border-b-0",
                        clientId === c.id ? "bg-blue-50" : "hover:bg-surface-soft/60",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink">
                          {c.name}
                          {c.blacklisted && (
                            <span className="ml-2 rounded-full bg-red-soft px-1.5 py-0.5 text-[10px] font-bold text-red-ink">
                              чёрный список
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[12px] text-muted">
                          {c.phone}
                        </span>
                      </span>
                      {clientId === c.id && (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
                          <Check size={14} />
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-3">
              <Hint text="Техника уезжает к клиенту до полной оплаты, поэтому проверка обязательна: посмотрите клиента по чёрным спискам и своим заметкам. Отметка — ваша ответственность, она остаётся в сделке." />
              {client?.blacklisted && (
                <Warn text="Клиент в чёрном списке CRM. Оформлять выкуп на него — плохая идея." />
              )}
              <button
                type="button"
                onClick={() => setBlacklistChecked((v) => !v)}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors",
                  blacklistChecked
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-border hover:bg-surface-soft/60",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
                    blacklistChecked
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-border-strong",
                  )}
                >
                  {blacklistChecked && <Check size={14} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold text-ink">
                    Клиент проверен по чёрным спискам
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">
                    {client?.name ?? "Клиент"} — проверен по нашей базе и внешним
                    источникам, ограничений не найдено.
                  </span>
                </span>
                <ShieldCheck
                  size={20}
                  className={cn(
                    "ml-auto shrink-0",
                    blacklistChecked ? "text-emerald-600" : "text-muted-2",
                  )}
                />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3">
              <Hint text="Выберите технику, которая уедет к клиенту. Стоимость подставится из карточки — на следующем шаге её можно изменить." />
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
                />
                <input
                  value={scooterQ}
                  onChange={(e) => setScooterQ(e.target.value)}
                  placeholder="Модель, VIN, номер двигателя"
                  className="h-11 w-full rounded-[14px] border border-border bg-surface pl-9 pr-3 text-[14px] outline-none focus:border-blue-600"
                />
              </div>
              <div className="flex flex-col overflow-hidden rounded-2xl border border-border">
                {stock
                  .filter((s) => {
                    const q = scooterQ.trim().toLowerCase();
                    if (!q) return true;
                    const m = s.modelId != null ? modelById.get(s.modelId)?.name : "";
                    return [s.name, s.vin, s.engineNo, m]
                      .filter(Boolean)
                      .join(" ")
                      .toLowerCase()
                      .includes(q);
                  })
                  .map((s) => {
                    const m = s.modelId != null ? modelById.get(s.modelId) : null;
                    const base =
                      s.salePrice ?? s.marketValue ?? s.purchasePrice ?? 0;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setScooterId(s.id);
                          setPrice(String(base || ""));
                        }}
                        className={cn(
                          "flex items-center gap-3 border-b border-border/60 px-3 py-3 text-left transition-colors last:border-b-0",
                          scooterId === s.id ? "bg-blue-50" : "hover:bg-surface-soft/60",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold text-ink">
                            {m?.name ?? s.name}
                            {s.rentalSlot != null && ` №${s.rentalSlot}`}
                          </span>
                          <span className="block truncate text-[12px] text-muted">
                            {fmt(s.mileage ?? 0)} км · VIN {s.vin || "—"}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-[13px] font-bold tabular-nums text-ink">
                          {base ? `${fmt(base)} ₽` : "цена не задана"}
                        </span>
                        {scooterId === s.id && (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                            <Check size={14} />
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3">
              <Hint text="Калькулятор считает всё сразу: наценка зависит от срока, взнос уменьшает остаток, остаток делится на равные платежи. Последний платёж добирает копейки округления." />

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                  Стоимость техники
                </span>
                <span className="relative">
                  <input
                    inputMode="numeric"
                    value={price}
                    onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="0"
                    className="h-12 w-full rounded-[14px] border-2 border-border bg-surface pl-4 pr-9 text-[20px] font-extrabold tabular-nums outline-none focus:border-blue-600"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] font-bold text-muted-2">
                    ₽
                  </span>
                </span>
              </label>

              <div>
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
                  Срок выкупа
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  {TERMS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTermMonths(t)}
                      className={cn(
                        "flex flex-col items-center rounded-xl border px-2 py-2 transition-colors",
                        termMonths === t
                          ? "border-blue-600 bg-blue-50"
                          : "border-border hover:bg-surface-soft/60",
                      )}
                    >
                      <span className="text-[14px] font-bold text-ink">{t} мес</span>
                      <span className="text-[10.5px] text-muted-2">
                        +{fmt(Number(markups[String(t)] ?? 0) / 1000)}к
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                    Первоначальный взнос
                  </span>
                  <span className="relative">
                    <input
                      inputMode="numeric"
                      value={down}
                      onChange={(e) => setDown(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="0"
                      className="h-11 w-full rounded-[14px] border border-border bg-surface pl-3 pr-8 text-[15px] font-bold tabular-nums outline-none focus:border-blue-600"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-2">
                      ₽
                    </span>
                  </span>
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                    Периодичность платежей
                  </span>
                  <div className="flex h-11 gap-1 rounded-[14px] bg-surface-soft p-1">
                    {(["month", "week"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPeriod(p)}
                        className={cn(
                          "flex-1 rounded-[11px] text-[13px] font-semibold transition-colors",
                          period === p
                            ? "bg-surface text-ink shadow-card-sm"
                            : "text-muted",
                        )}
                      >
                        {p === "month" ? "Раз в месяц" : "Раз в неделю"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                  Первый платёж
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-11 rounded-[14px] border border-border bg-surface px-3 text-[14px] tabular-nums outline-none focus:border-blue-600"
                />
              </label>

              {/* Итог калькулятора */}
              <div className="rounded-2xl bg-ink p-4 text-white">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                    К выплате по договору
                  </span>
                  <span className="font-display text-[26px] font-extrabold tabular-nums">
                    {fmt(calc.total)} ₽
                  </span>
                  <span className="text-[12px] text-white/70">
                    техника {fmt(calc.base)} ₽ + наценка {fmt(calc.markup)} ₽
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Tile label="Взнос" value={`${fmt(calc.downNum)} ₽`} />
                  <Tile label="Остаток" value={`${fmt(calc.financed)} ₽`} />
                  <Tile
                    label={period === "week" ? "Платёж в неделю" : "Платёж в месяц"}
                    value={`${fmt(calc.payment)} ₽`}
                    accent
                  />
                </div>
                <div className="mt-2 text-[12px] text-white/70">
                  {calc.count} платеж
                  {calc.count === 1 ? "" : calc.count < 5 ? "а" : "ей"} по{" "}
                  {fmt(calc.payment)} ₽
                  {calc.last !== calc.payment && calc.count > 1
                    ? `, последний — ${fmt(calc.last)} ₽`
                    : ""}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-3">
              <Hint text="Техника уезжает к клиенту до полной оплаты — на неё должна быть установлена метка поиска (AirTag). Без отметки сделку подписать нельзя." />
              <button
                type="button"
                onClick={() => setAirtag((v) => !v)}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors",
                  airtag
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-orange-300 bg-orange-soft/40 hover:bg-orange-soft/60",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
                    airtag
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-orange-400",
                  )}
                >
                  {airtag && <Check size={14} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold text-ink">
                    Метка установлена и проверена
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">
                    AirTag стоит на технике, отображается в приложении и спрятан так,
                    что его не найдут при беглом осмотре.
                  </span>
                </span>
                <Radar
                  size={20}
                  className={cn(
                    "ml-auto shrink-0",
                    airtag ? "text-emerald-600" : "text-orange-ink",
                  )}
                />
              </button>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-3">
              <Hint text="Проверьте условия — они уйдут в договор аренды с правом выкупа вместе с графиком платежей. Подписание построит график и переведёт технику в статус «Выкуп»." />
              <div className="flex flex-col gap-2 rounded-2xl bg-surface-soft p-3">
                <Row label="Клиент" value={client?.name ?? "—"} warn={!hasPassport} />
                <Row
                  label="Техника"
                  value={
                    scooter
                      ? `${(scooter.modelId != null ? modelById.get(scooter.modelId)?.name : null) ?? scooter.name}`
                      : "—"
                  }
                />
                <Row label="Выкупная стоимость" value={`${fmt(calc.total)} ₽`} />
                <Row label="Взнос" value={`${fmt(calc.downNum)} ₽`} />
                <Row
                  label="График"
                  value={`${calc.count} × ${fmt(calc.payment)} ₽ ${period === "week" ? "еженедельно" : "ежемесячно"}`}
                />
                <Row
                  label="Первый платёж"
                  value={startDate ? startDate.split("-").reverse().join(".") : "завтра"}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={dealId == null}
                  onClick={() => window.open(buyoutContractUrl(dealId!, "html"), "_blank")}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[13.5px] font-bold text-white disabled:opacity-50"
                >
                  <Printer size={16} /> Сформировать договор
                </button>
                <button
                  type="button"
                  disabled={dealId == null}
                  onClick={() => window.open(buyoutContractUrl(dealId!, "docx"), "_blank")}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-surface-soft px-5 text-[13.5px] font-semibold text-ink disabled:opacity-50"
                >
                  <FileText size={16} /> Скачать Word
                </button>
              </div>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3 sm:px-5">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="inline-flex h-11 items-center gap-1 rounded-full px-4 text-[13px] font-semibold text-muted hover:text-ink"
            >
              <ChevronLeft size={16} /> Назад
            </button>
          )}
          <div className="flex-1" />
          <span className="hidden text-[11px] text-muted-2 sm:inline">
            Enter — дальше
          </span>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              disabled={!canNext || busy}
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-blue-600 px-6 text-[14px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              Далее <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={busy}
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-blue-600 px-6 text-[14px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              <Check size={16} /> Подписать и начать выкуп
            </button>
          )}
        </footer>
      </div>

      {addClient && (
        <AddClientModal
          onClose={() => setAddClient(false)}
          onCreated={(c) => {
            setClientId(c.id);
            setAddClient(false);
          }}
        />
      )}
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-blue-700">
      {text}
    </p>
  );
}

function Warn({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-orange-soft px-3 py-2.5 text-[12.5px] text-orange-ink">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl px-2.5 py-2",
        accent ? "bg-white/15" : "bg-white/8",
      )}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">
        {label}
      </div>
      <div className="mt-0.5 text-[15px] font-bold tabular-nums text-white">
        {value}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-[150px] shrink-0 text-[11.5px] text-muted-2">{label}</span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[13.5px] font-semibold",
          warn ? "text-orange-ink" : "text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}
