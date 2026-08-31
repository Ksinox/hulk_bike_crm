import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Printer,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { fileUrl } from "@/lib/files";
import { useAllClients } from "@/pages/clients/clientStore";
import { AddClientModal } from "@/pages/clients/AddClientModal";
import { SendApplicationButton } from "@/pages/applications/SendApplicationButton";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import {
  saleContractUrl,
  useCreateSaleDeal,
  useDeleteSaleDocument,
  useGenerateSaleContract,
  usePatchSaleDeal,
  useSaleDeals,
  useSaleManagers,
  useSignSaleDeal,
  useUploadSaleDocument,
  type SaleDeal,
} from "@/lib/api/sales";
import { ManagerAvatar } from "./SalesUI";
import { fmt } from "./salesUtils";

/**
 * Мастер сделки продажи (31.08) — этапы из задания заказчика:
 *   1) клиент (с паспортными данными — они уходят в договор);
 *   2) техника из списка продающихся;
 *   3) цена (можно отличную от той, что стоит в карточке);
 *   4) менеджер, который продал;
 *   5) договор — кнопка «Сформировать», печать;
 *   6) подпись — приложить фото подписанного договора и завершить.
 *
 * Черновик создаётся сразу после выбора клиента: если оформление прервали,
 * сделка не теряется — её видно в «Сделках» со статусом «Черновик» и можно
 * продолжить с того же места.
 */

const STEPS = [
  "Клиент",
  "Техника",
  "Цена",
  "Менеджер",
  "Договор",
  "Подпись",
] as const;

export function NewSaleWizard({
  dealId: initialDealId,
  presetScooterId,
  onClose,
}: {
  /** Продолжить уже начатую сделку. */
  dealId?: number | null;
  /** Открыть сразу с выбранной техникой (кнопка «Продать» в списке). */
  presetScooterId?: number | null;
  onClose: () => void;
}) {
  const { data: dealsData } = useSaleDeals();
  const clients = useAllClients();
  const { data: scooters = [] } = useApiScooters();
  const { data: models = [] } = useApiScooterModels();
  const { data: managersData } = useSaleManagers();
  const managers = managersData?.items ?? [];

  const createDeal = useCreateSaleDeal();
  const patchDeal = usePatchSaleDeal();
  const genContract = useGenerateSaleContract();
  const signDeal = useSignSaleDeal();
  const upload = useUploadSaleDocument();
  const delDoc = useDeleteSaleDocument();

  const [dealId, setDealId] = useState<number | null>(initialDealId ?? null);
  const deal: SaleDeal | null =
    (dealId != null && dealsData?.items.find((d) => d.id === dealId)) || null;

  const [step, setStep] = useState(0);
  const [clientId, setClientId] = useState<number | null>(deal?.clientId ?? null);
  const [scooterId, setScooterId] = useState<number | null>(
    deal?.scooterId ?? presetScooterId ?? null,
  );
  const [price, setPrice] = useState<string>(deal?.price ? String(deal.price) : "");
  const [managerId, setManagerId] = useState<number | null>(deal?.managerId ?? null);
  const [comment, setComment] = useState(deal?.comment ?? "");
  const [clientQ, setClientQ] = useState("");
  const [scooterQ, setScooterQ] = useState("");
  const [addClient, setAddClient] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);

  // Продолжение начатой сделки: подставляем сохранённое и встаём на первый
  // незаполненный шаг, чтобы не прокликивать заново то, что уже указано.
  //
  // Только для сделки, ОТКРЫТОЙ на продолжение (initialDealId). Иначе
  // эффект срабатывал и на черновик, который мы сами создали на первом
  // шаге, и затирал уже выбранное — например технику, подставленную
  // кнопкой «Продать» (тогда «Далее» на шаге 2 оставалась неактивной).
  useEffect(() => {
    if (initialDealId == null) {
      hydrated.current = true;
      return;
    }
    if (!deal || hydrated.current) return;
    hydrated.current = true;
    setClientId(deal.clientId);
    setScooterId(deal.scooterId);
    setPrice(deal.price ? String(deal.price) : "");
    setManagerId(deal.managerId);
    setComment(deal.comment ?? "");
    if (deal.status === "contract") setStep(5);
    else if (deal.managerId) setStep(4);
    else if (deal.price) setStep(3);
    else if (deal.scooterId) setStep(2);
    else if (deal.clientId) setStep(1);
  }, [deal, initialDealId]);

  const modelById = useMemo(
    () => new Map(models.map((m) => [m.id, m] as const)),
    [models],
  );

  const stock = useMemo(
    () =>
      scooters.filter(
        (s) =>
          !s.archivedAt &&
          (s.baseStatus === "for_sale" || s.id === scooterId),
      ),
    [scooters, scooterId],
  );

  const client = clients.find((c) => c.id === clientId) ?? null;
  const scooter = scooters.find((s) => s.id === scooterId) ?? null;
  const manager = managers.find((m) => m.id === managerId) ?? null;
  const purchase = scooter?.purchasePrice ?? deal?.purchasePrice ?? null;
  const priceNum = Number(price) || 0;
  const profit = purchase != null ? priceNum - purchase : null;

  const hasPassport = !!(
    client &&
    (client.passportRaw ||
      (client.passportSeries && client.passportNumber))
  );

  /** Сохраняем шаг в черновик; создаём сделку при первом сохранении. */
  const persist = async (patch: {
    clientId?: number | null;
    scooterId?: number | null;
    managerId?: number | null;
    price?: number;
    comment?: string | null;
  }) => {
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
        if (!clientId) {
          toast.error("Выберите клиента");
          return;
        }
        await persist({ clientId });
      } else if (step === 1) {
        if (!scooterId) {
          toast.error("Выберите технику");
          return;
        }
        const created = await persist({ scooterId });
        // Цену подставляем из карточки, если оператор ещё не задал свою.
        if (!price && created?.price) setPrice(String(created.price));
        else if (!price && scooter?.salePrice) setPrice(String(scooter.salePrice));
      } else if (step === 2) {
        if (priceNum <= 0) {
          toast.error("Укажите продажную стоимость");
          return;
        }
        await persist({ price: priceNum, comment: comment.trim() || null });
      } else if (step === 3) {
        await persist({ managerId });
      } else if (step === 4) {
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
      toast.success("Продажа оформлена — техника переведена в «Продан»");
      onClose();
    } catch {
      toast.error("Не удалось завершить сделку");
    } finally {
      setBusy(false);
    }
  };

  const canNext =
    (step === 0 && !!clientId) ||
    (step === 1 && !!scooterId) ||
    (step === 2 && priceNum > 0) ||
    step === 3 ||
    step === 4;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 animate-backdrop-in sm:items-center sm:p-4">
      <div className="flex h-[100dvh] w-full max-w-[720px] flex-col overflow-hidden bg-surface shadow-card-lg animate-modal-in sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
        {/* Шапка + степпер */}
        <header className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-bold text-ink">
                {deal ? `Сделка #${String(deal.id).padStart(4, "0")}` : "Новая продажа"}
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
                className={cn(
                  "group flex min-w-0 flex-1 flex-col gap-1",
                  i < step ? "cursor-pointer" : "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 rounded-full transition-colors",
                    i < step
                      ? "bg-emerald-500"
                      : i === step
                        ? "bg-ink"
                        : "bg-surface-soft",
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

        {/* Тело шага */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {step === 0 && (
            <StepClient
              clients={clients}
              q={clientQ}
              setQ={setClientQ}
              clientId={clientId}
              setClientId={setClientId}
              onAddClient={() => setAddClient(true)}
            />
          )}

          {step === 1 && (
            <StepScooter
              stock={stock}
              modelById={modelById}
              q={scooterQ}
              setQ={setScooterQ}
              scooterId={scooterId}
              setScooterId={setScooterId}
            />
          )}

          {step === 2 && (
            <StepPrice
              price={price}
              setPrice={setPrice}
              comment={comment}
              setComment={setComment}
              purchase={purchase}
              profit={profit}
              cardPrice={scooter?.salePrice ?? null}
            />
          )}

          {step === 3 && (
            <StepManager
              managers={managers}
              managerId={managerId}
              setManagerId={setManagerId}
              profit={profit}
            />
          )}

          {step === 4 && (
            <StepContract
              dealId={dealId}
              client={client?.name ?? "—"}
              hasPassport={hasPassport}
              scooterLabel={
                scooter
                  ? (scooter.modelId != null ? modelById.get(scooter.modelId)?.name : null) ??
                    scooter.name
                  : "—"
              }
              price={priceNum}
              manager={manager?.name ?? null}
            />
          )}

          {step === 5 && (
            <StepSign
              deal={deal}
              onPick={() => fileRef.current?.click()}
              onDelete={async (docId) => {
                if (dealId == null) return;
                await delDoc.mutateAsync({ dealId, docId });
              }}
              uploading={upload.isPending}
            />
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file || dealId == null) return;
              try {
                await upload.mutateAsync({ dealId, file });
                toast.success("Копия договора приложена");
              } catch {
                toast.error("Не удалось загрузить файл");
              }
            }}
          />
        </div>

        {/* Навигация */}
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
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              disabled={!canNext || busy}
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-emerald-600 px-6 text-[14px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {step === 4 ? "Договор сформирован" : "Далее"}
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={busy}
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-emerald-600 px-6 text-[14px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              <Check size={16} /> Завершить сделку
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

/* ==================== шаги ==================== */

function StepClient({
  clients,
  q,
  setQ,
  clientId,
  setClientId,
  onAddClient,
}: {
  clients: ReturnType<typeof useAllClients>;
  q: string;
  setQ: (v: string) => void;
  clientId: number | null;
  setClientId: (id: number) => void;
  onAddClient: () => void;
}) {
  const needle = q.trim().toLowerCase();
  const list = clients
    .filter((c) =>
      needle ? `${c.name} ${c.phone}`.toLowerCase().includes(needle) : true,
    )
    .slice(0, 40);
  const selected = clients.find((c) => c.id === clientId) ?? null;
  const hasPassport = !!(
    selected &&
    (selected.passportRaw || (selected.passportSeries && selected.passportNumber))
  );

  return (
    <div className="flex flex-col gap-3">
      <StepHint text="Покупатель попадёт в договор — нужны паспортные данные. Если клиента ещё нет в базе, заведите его здесь же или отправьте ему анкету: заполненная придёт в «Заявки», оттуда одним нажатием станет клиентом." />
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Имя или телефон"
            className="h-11 w-full rounded-[14px] border border-border bg-surface pl-9 pr-3 text-[14px] outline-none focus:border-emerald-500"
          />
        </div>
        <button
          type="button"
          onClick={onAddClient}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] bg-ink px-4 text-[13px] font-bold text-white"
        >
          <UserPlus size={15} /> Новый
        </button>
        <SendApplicationButton
          label="Анкета"
          text="Здравствуйте! Для оформления покупки скутера в Халк Байк заполните, пожалуйста, короткую анкету с паспортными данными: "
          className="h-11 shrink-0 rounded-[14px]"
        />
      </div>

      {selected && !hasPassport && (
        <div className="flex items-start gap-2 rounded-xl bg-orange-soft px-3 py-2.5 text-[12.5px] text-orange-ink">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            У клиента не заполнен паспорт — в договоре эти поля останутся
            пустыми. Заполните анкету в карточке клиента.
          </span>
        </div>
      )}

      <div className="flex flex-col overflow-hidden rounded-2xl border border-border">
        {list.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-muted">
            Никого не нашли — заведите нового клиента.
          </div>
        ) : (
          list.map((c) => {
            const ok = !!(c.passportRaw || (c.passportSeries && c.passportNumber));
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setClientId(c.id)}
                className={cn(
                  "flex items-center gap-3 border-b border-border/60 px-3 py-3 text-left transition-colors last:border-b-0",
                  clientId === c.id ? "bg-emerald-50" : "hover:bg-surface-soft/60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">
                    {c.name}
                  </span>
                  <span className="block truncate text-[12px] text-muted">
                    {c.phone}
                    {!ok && " · паспорт не заполнен"}
                  </span>
                </span>
                {clientId === c.id && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check size={14} />
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function StepScooter({
  stock,
  modelById,
  q,
  setQ,
  scooterId,
  setScooterId,
}: {
  stock: ReturnType<typeof useApiScooters>["data"] & object;
  modelById: Map<number, { name: string }>;
  q: string;
  setQ: (v: string) => void;
  scooterId: number | null;
  setScooterId: (id: number) => void;
}) {
  const needle = q.trim().toLowerCase();
  const list = (stock ?? []).filter((s) => {
    if (!needle) return true;
    const model = s.modelId != null ? modelById.get(s.modelId)?.name : "";
    return [s.name, s.vin, s.engineNo, model]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  return (
    <div className="flex flex-col gap-3">
      <StepHint text="Показана техника со статусом «Продаётся». Если нужной единицы нет — переведите её в продажу в карточке техники." />
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Модель, VIN, номер двигателя"
          className="h-11 w-full rounded-[14px] border border-border bg-surface pl-9 pr-3 text-[14px] outline-none focus:border-emerald-500"
        />
      </div>
      <div className="flex flex-col overflow-hidden rounded-2xl border border-border">
        {list.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-muted">
            Техники в продаже нет.
          </div>
        ) : (
          list.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScooterId(s.id)}
              className={cn(
                "flex items-center gap-3 border-b border-border/60 px-3 py-3 text-left transition-colors last:border-b-0",
                scooterId === s.id ? "bg-emerald-50" : "hover:bg-surface-soft/60",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-ink">
                  {(s.modelId != null ? modelById.get(s.modelId)?.name : null) ?? s.name}
                </span>
                <span className="block truncate text-[12px] text-muted">
                  {fmt(s.mileage ?? 0)} км · VIN {s.vin || "—"}
                  {s.engineNo && ` · двиг. ${s.engineNo}`}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[13px] font-bold tabular-nums text-ink">
                  {s.salePrice ? `${fmt(s.salePrice)} ₽` : "цена не задана"}
                </span>
                {s.purchasePrice != null && (
                  <span className="block text-[11px] text-muted-2">
                    закуп {fmt(s.purchasePrice)} ₽
                  </span>
                )}
              </span>
              {scooterId === s.id && (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Check size={14} />
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function StepPrice({
  price,
  setPrice,
  comment,
  setComment,
  purchase,
  profit,
  cardPrice,
}: {
  price: string;
  setPrice: (v: string) => void;
  comment: string;
  setComment: (v: string) => void;
  purchase: number | null;
  profit: number | null;
  cardPrice: number | null;
}) {
  const priceNum = Number(price) || 0;
  const margin = priceNum > 0 && profit != null ? Math.round((profit / priceNum) * 100) : null;
  return (
    <div className="flex flex-col gap-3">
      <StepHint text="По умолчанию подставлена цена из карточки техники. Если договорились о другой — впишите её здесь: в карточке цена останется прежней, а в сделку уйдёт фактическая." />
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
          Продажная стоимость
        </span>
        <span className="relative">
          <input
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            className="h-14 w-full rounded-[16px] border-2 border-border bg-surface pl-4 pr-10 font-display text-[26px] font-extrabold tabular-nums outline-none focus:border-emerald-500"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[18px] font-bold text-muted-2">
            ₽
          </span>
        </span>
      </label>

      {cardPrice != null && cardPrice !== priceNum && (
        <button
          type="button"
          onClick={() => setPrice(String(cardPrice))}
          className="self-start rounded-full bg-surface-soft px-3 py-1.5 text-[12px] font-semibold text-muted hover:text-ink"
        >
          Вернуть цену из карточки — {fmt(cardPrice)} ₽
        </button>
      )}

      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Закуп" value={purchase != null ? `${fmt(purchase)} ₽` : "—"} />
        <MiniStat
          label="Прибыль"
          value={profit != null ? `${profit >= 0 ? "+" : ""}${fmt(profit)} ₽` : "—"}
          tone={profit != null && profit < 0 ? "bad" : "good"}
        />
        <MiniStat label="Маржа" value={margin != null ? `${margin}%` : "—"} />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
          Комментарий к сделке
        </span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="Торг, доукомплектация, договорённости"
          className="rounded-[14px] border border-border bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-emerald-500"
        />
      </label>
    </div>
  );
}

function StepManager({
  managers,
  managerId,
  setManagerId,
  profit,
}: {
  managers: { id: number; name: string; avatarColor: string; commissionPct: number }[];
  managerId: number | null;
  setManagerId: (id: number | null) => void;
  profit: number | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <StepHint text="Кто провёл продажу. Его процент считается с прибыли сделки и фиксируется в момент подписания — последующая смена процента историю не изменит." />
      {managers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">
          Менеджеров пока нет. Сделку можно оформить без менеджера, а список
          завести во вкладке «Менеджеры».
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {managers.map((m) => {
            const cut =
              profit != null && m.commissionPct > 0
                ? Math.max(0, Math.round((profit * m.commissionPct) / 100))
                : null;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setManagerId(managerId === m.id ? null : m.id)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
                  managerId === m.id
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-border hover:bg-surface-soft/60",
                )}
              >
                <ManagerAvatar name={m.name} color={m.avatarColor} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">
                    {m.name}
                  </span>
                  <span className="block text-[12px] text-muted">
                    {m.commissionPct}% с прибыли
                    {cut != null && ` · ему ${fmt(cut)} ₽`}
                  </span>
                </span>
                {managerId === m.id && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StepContract({
  dealId,
  client,
  hasPassport,
  scooterLabel,
  price,
  manager,
}: {
  dealId: number | null;
  client: string;
  hasPassport: boolean;
  scooterLabel: string;
  price: number;
  manager: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <StepHint text="Проверьте данные — они уйдут в договор купли-продажи. Договор откроется в новой вкладке, оттуда его можно распечатать или скачать в Word." />
      <div className="flex flex-col gap-2 rounded-2xl bg-surface-soft p-3">
        <SummaryRow label="Покупатель" value={client} warn={!hasPassport} />
        <SummaryRow label="Техника" value={scooterLabel} />
        <SummaryRow label="Стоимость" value={`${fmt(price)} ₽`} />
        <SummaryRow label="Менеджер" value={manager ?? "не указан"} />
      </div>
      {!hasPassport && (
        <div className="flex items-start gap-2 rounded-xl bg-orange-soft px-3 py-2.5 text-[12.5px] text-orange-ink">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            Паспорт покупателя не заполнен — в договоре останутся пустые места.
            Их можно дописать от руки или заполнить анкету и сформировать заново.
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={dealId == null}
          onClick={() => window.open(saleContractUrl(dealId!, "html"), "_blank")}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[13.5px] font-bold text-white disabled:opacity-50"
        >
          <Printer size={16} /> Сформировать договор
        </button>
        <button
          type="button"
          disabled={dealId == null}
          onClick={() => window.open(saleContractUrl(dealId!, "docx"), "_blank")}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-surface-soft px-5 text-[13.5px] font-semibold text-ink disabled:opacity-50"
        >
          <FileText size={16} /> Скачать Word
        </button>
      </div>
    </div>
  );
}

function StepSign({
  deal,
  onPick,
  onDelete,
  uploading,
}: {
  deal: SaleDeal | null;
  onPick: () => void;
  onDelete: (docId: number) => void;
  uploading: boolean;
}) {
  const docs = deal?.documents ?? [];
  return (
    <div className="flex flex-col gap-3">
      <StepHint text="Распечатайте договор, подпишите его с клиентом, сфотографируйте подписанный экземпляр и приложите сюда. После этого сделка закрывается: техника переходит в статус «Продан», продажа попадает в отчёты." />

      <ol className="flex flex-col gap-2">
        <CheckItem done={!!deal?.contractAt} text="Договор сформирован" />
        <CheckItem done={docs.length > 0} text="Копия подписанного договора приложена" />
      </ol>

      <button
        type="button"
        onClick={onPick}
        disabled={uploading || !deal}
        className="flex h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border text-[13px] font-semibold text-muted transition-colors hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50"
      >
        <ImageIcon size={22} />
        {uploading ? "Загружаем…" : "Приложить фото или PDF договора"}
      </button>

      {docs.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {docs.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-2 rounded-xl border border-border p-2"
            >
              {d.mimeType.startsWith("image/") ? (
                <img
                  src={fileUrl(d.fileKey, { variant: "thumb" }) ?? undefined}
                  alt={d.fileName}
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-muted">
                  <FileText size={18} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-ink">
                  {d.title || d.fileName}
                </span>
                <span className="block text-[11px] text-muted-2">
                  {Math.round(d.size / 1024)} КБ
                </span>
              </span>
              <button
                type="button"
                onClick={() => onDelete(d.id)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-2 hover:bg-red-soft hover:text-red-ink"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {docs.length === 0 && (
        <div className="text-[12px] text-muted-2">
          Завершить сделку можно и без копии — тогда в списке сделок она будет
          помечена как «без скана договора», чтобы вы про неё не забыли.
        </div>
      )}
    </div>
  );
}

/* ==================== мелочи ==================== */

function StepHint({ text }: { text: string }) {
  return (
    <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-blue-700">
      {text}
    </p>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-xl bg-surface-soft px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-[15px] font-bold tabular-nums",
          tone === "bad" ? "text-red-ink" : tone === "good" ? "text-emerald-700" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function SummaryRow({
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
      <span className="w-[110px] shrink-0 text-[11.5px] text-muted-2">{label}</span>
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

function CheckItem({ done, text }: { done: boolean; text: string }) {
  return (
    <li className="flex items-center gap-2 text-[13px]">
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          done ? "bg-emerald-600 text-white" : "bg-surface-soft text-muted-2",
        )}
      >
        <Check size={12} />
      </span>
      <span className={done ? "text-ink" : "text-muted"}>{text}</span>
    </li>
  );
}
