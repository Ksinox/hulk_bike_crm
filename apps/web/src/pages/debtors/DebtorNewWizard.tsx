/**
 * Wizard создания должника. Минимальная версия для Фазы 3:
 *  Шаг 1 — внешний клиент (ФИО + телефон), потом будет search по CRM.
 *  Шаг 2 — тип долга (4 карточки).
 *  Шаг 3 — сумма, психо, комментарий.
 *
 * Дальнейшие развилки (досудебка/страховая) — добавим в Фазе 5.
 */
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Search,
  User,
  X,
  Phone,
} from "lucide-react";
import { useCreateDebtor } from "@/lib/api/debtors";
import { useApiClients } from "@/lib/api/clients";
import { TYPE_LABEL, type DebtType } from "@/lib/debtors/types";
import { toast } from "@/lib/toast";

const TYPE_OPTIONS: { id: DebtType; title: string; descr: string }[] = [
  {
    id: "dtp_guilty",
    title: "ДТП · виновник",
    descr: "Сбил/задел кого-то. Дальше досудебка или юрист.",
  },
  {
    id: "dtp_victim",
    title: "ДТП · потерпевший",
    descr: "Клиент пострадал. Документы в страховую, оценка, выплата.",
  },
  {
    id: "damage",
    title: "Ущерб",
    descr: "Поломка/повреждение скутера клиентом. Прямой долг + график.",
  },
  {
    id: "theft",
    title: "Угон",
    descr: "Скутер не вернули. Признал → юрист + график. Нет → полиция.",
  },
  {
    id: "rental_overdue",
    title: "Просрочка аренды",
    descr: "Старая задолженность по аренде, не закрытая клиентом.",
  },
];

export function DebtorNewWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // v0.6: должника берём из CRM (clientId) — тогда дело свяжется с карточкой
  // клиента и попадёт в его «Долговую историю». Ручной ввод оставлен как
  // запасной для людей не из базы (напр. виновник ДТП — третье лицо).
  const [selectedClient, setSelectedClient] = useState<{
    id: number;
    name: string;
    phone: string;
  } | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [externalName, setExternalName] = useState("");
  const [externalPhone, setExternalPhone] = useState("");
  const [type, setType] = useState<DebtType | null>(null);
  const [totalAmount, setTotalAmount] = useState("");
  const [psyRating, setPsyRating] = useState(3);
  const [clientStatus, setClientStatus] = useState<"active" | "closed">("active");
  const [comment, setComment] = useState("");
  const create = useCreateDebtor();

  const clientsQ = useApiClients();
  const searchResults = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return [];
    const digits = q.replace(/\D/g, "");
    return (clientsQ.data ?? [])
      .filter((c) => {
        const byName = c.name.toLowerCase().includes(q);
        const byPhone =
          digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits);
        return byName || byPhone;
      })
      .slice(0, 8);
  }, [clientSearch, clientsQ.data]);

  const canStep2 = selectedClient
    ? true
    : manualMode &&
      externalName.trim().length > 0 &&
      externalPhone.trim().length > 0;
  const canStep3 = type != null;
  const canCreate = Number(totalAmount) > 0 && type != null && canStep2;

  const submit = async () => {
    if (!canCreate || !type) return;
    try {
      const row = await create.mutateAsync({
        // Привязка к клиенту CRM (приоритет) либо внешний человек вручную.
        clientId: selectedClient ? selectedClient.id : null,
        externalName: selectedClient ? null : externalName.trim(),
        externalPhone: selectedClient ? null : externalPhone.trim(),
        type,
        totalAmount: Math.floor(Number(totalAmount)),
        psyRating,
        clientStatus,
        comment: comment.trim() || null,
      });
      toast.success(
        "Дело заведено",
        `${row.caseNumber} · открываю карточку…`,
      );
      onCreated(row.id);
    } catch (e) {
      toast.error("Не удалось создать", (e as Error).message);
    }
  };

  return (
    <section className="mx-auto w-full max-w-[680px]">
      <div className="rounded-[22px] bg-white shadow-card-lg">
        <header className="border-b border-border bg-gradient-to-b from-[#F2F6FD] to-white p-6">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-2">
            Новое дело · шаг {step} из 3
          </div>
          <h2 className="m-0 font-display text-[26px] font-bold tracking-[-0.018em] text-ink">
            {step === 1 && "Кто должник?"}
            {step === 2 && "Какой тип долга?"}
            {step === 3 && "Сумма и приоритет"}
          </h2>
          <div className="mt-4 flex gap-1.5">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${
                  s < step
                    ? "bg-emerald-500"
                    : s === step
                    ? "bg-ink"
                    : "bg-surface-soft"
                }`}
              />
            ))}
          </div>
        </header>

        <div className="p-6">
          {step === 1 && (
            <div className="space-y-4">
              {selectedClient ? (
                /* Выбранный клиент из CRM */
                <div className="flex items-center gap-3 rounded-[12px] border border-blue-200 bg-blue-50 p-3.5">
                  <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-white text-blue-700">
                    <User size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-ink">
                      {selectedClient.name}
                    </div>
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-muted">
                      <Phone size={11} /> {selectedClient.phone}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClient(null);
                      setClientSearch("");
                    }}
                    className="rounded-full p-1.5 text-muted-2 hover:bg-white hover:text-ink"
                    title="Выбрать другого"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : !manualMode ? (
                /* Поиск клиента в CRM */
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                    Клиент из базы
                  </label>
                  <div className="relative">
                    <Search
                      size={15}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
                    />
                    <input
                      autoFocus
                      className="h-11 w-full rounded-[10px] border border-border bg-white pl-9 pr-3 text-[14px] text-ink outline-none focus:border-ink"
                      placeholder="Поиск по ФИО или телефону…"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                    />
                  </div>
                  {clientSearch.trim() && (
                    <div className="mt-2 max-h-[240px] overflow-auto rounded-[12px] border border-border">
                      {searchResults.length === 0 ? (
                        <div className="px-3 py-4 text-center text-[12.5px] text-muted-2">
                          {clientsQ.isLoading
                            ? "Загрузка клиентов…"
                            : "Не найдено. Можно ввести вручную ниже."}
                        </div>
                      ) : (
                        searchResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() =>
                              setSelectedClient({
                                id: c.id,
                                name: c.name,
                                phone: c.phone,
                              })
                            }
                            className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-blue-50"
                          >
                            <div className="grid h-8 w-8 flex-none place-items-center rounded-full bg-surface-soft text-[11px] font-semibold text-ink">
                              {c.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-[13.5px] font-semibold text-ink">
                                {c.name}
                              </div>
                              <div className="text-[12px] text-muted">
                                {c.phone}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setManualMode(true)}
                    className="mt-3 text-[12.5px] font-semibold text-blue-700 hover:underline"
                  >
                    Нет в базе — ввести вручную (внешний человек)
                  </button>
                </div>
              ) : (
                /* Ручной ввод — внешний человек (не клиент CRM) */
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      ФИО
                    </label>
                    <input
                      className="h-11 w-full rounded-[10px] border border-border bg-white px-3.5 text-[14px] text-ink outline-none focus:border-ink"
                      placeholder="Иван Петров"
                      value={externalName}
                      onChange={(e) => setExternalName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      Телефон
                    </label>
                    <input
                      className="h-11 w-full rounded-[10px] border border-border bg-white px-3.5 text-[14px] text-ink outline-none focus:border-ink"
                      placeholder="+7 925 …"
                      value={externalPhone}
                      onChange={(e) => setExternalPhone(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setManualMode(false);
                      setExternalName("");
                      setExternalPhone("");
                    }}
                    className="text-[12.5px] font-semibold text-blue-700 hover:underline"
                  >
                    ← Выбрать клиента из базы
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 gap-2.5">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setType(opt.id)}
                  className={`flex items-start justify-between gap-3 rounded-[14px] border p-4 text-left transition-all ${
                    type === opt.id
                      ? "border-ink shadow-[0_0_0_4px_rgba(11,18,32,0.06)]"
                      : "border-border hover:border-border-strong"
                  }`}
                >
                  <div>
                    <div className="text-[15px] font-semibold leading-tight text-ink">
                      {opt.title}
                    </div>
                    <div className="mt-1 text-[12.5px] leading-[1.45] text-muted">
                      {opt.descr}
                    </div>
                  </div>
                  <div
                    className={`grid h-5 w-5 flex-none place-items-center rounded-full border-2 ${
                      type === opt.id
                        ? "border-ink bg-ink text-white"
                        : "border-border-strong"
                    }`}
                  >
                    {type === opt.id && <Check size={11} strokeWidth={3} />}
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Сумма долга
                </label>
                <div className="flex items-baseline gap-2.5 rounded-[14px] border-2 border-ink bg-gradient-to-b from-white to-[#FAFBFD] px-5 py-3.5 shadow-[0_0_0_4px_rgba(11,18,32,0.06)]">
                  <input
                    inputMode="numeric"
                    className="flex-1 border-none bg-transparent font-display text-[36px] font-bold leading-none tracking-[-0.022em] text-ink outline-none"
                    placeholder="0"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value.replace(/[^\d]/g, ""))}
                  />
                  <span className="font-display text-[28px] font-semibold leading-none text-muted-2">
                    ₽
                  </span>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Психо-портрет клиента
                </label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPsyRating(n)}
                      className={`h-11 flex-1 rounded-[10px] border text-[14px] font-semibold transition-colors ${
                        psyRating === n
                          ? "border-ink bg-ink text-white"
                          : "border-border text-ink hover:border-ink"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 text-[11.5px] text-muted">
                  1 — сложный (мутный, кредиты, конфликты) · 5 — лояльный
                </div>
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Статус клиента
                </label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setClientStatus("active")}
                    className={`h-10 flex-1 rounded-[10px] border text-[13px] font-semibold ${
                      clientStatus === "active"
                        ? "border-ink bg-ink text-white"
                        : "border-border text-ink"
                    }`}
                  >
                    Действующий
                  </button>
                  <button
                    type="button"
                    onClick={() => setClientStatus("closed")}
                    className={`h-10 flex-1 rounded-[10px] border text-[13px] font-semibold ${
                      clientStatus === "closed"
                        ? "border-ink bg-ink text-white"
                        : "border-border text-ink"
                    }`}
                  >
                    Закрытый
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Комментарий (необязательно)
                </label>
                <textarea
                  rows={3}
                  className="w-full resize-none rounded-[10px] border border-border bg-white p-3 text-[13px] text-ink outline-none focus:border-ink"
                  placeholder="Где, когда, ссылки, доп. контакты…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
              {type && (
                <div className="rounded-[10px] bg-surface-soft px-4 py-3 text-[12.5px] text-muted">
                  Тип: <b className="text-ink">{TYPE_LABEL[type]}</b> ·
                  стартовая стадия: <b className="text-ink">Заведено</b> →
                  оператор переведёт дальше из карточки.
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center gap-2.5 border-t border-border bg-surface-soft p-4">
          <button
            type="button"
            onClick={step === 1 ? onClose : () => setStep((s) => (s - 1) as 1 | 2 | 3)}
            className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
          >
            <ArrowLeft size={13} />
            {step === 1 ? "Отмена" : "Назад"}
          </button>
          {step < 3 ? (
            <button
              type="button"
              disabled={step === 1 ? !canStep2 : !canStep3}
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              className="ml-auto inline-flex h-11 items-center gap-2 rounded-[10px] bg-ink px-5 text-[14px] font-semibold text-white disabled:opacity-40"
            >
              Далее
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              disabled={!canCreate || create.isPending}
              onClick={submit}
              className="ml-auto inline-flex h-11 items-center gap-2 rounded-[10px] bg-ink px-5 text-[14px] font-semibold text-white disabled:opacity-40"
            >
              <Plus size={14} />
              Создать дело
            </button>
          )}
        </footer>
      </div>
    </section>
  );
}
