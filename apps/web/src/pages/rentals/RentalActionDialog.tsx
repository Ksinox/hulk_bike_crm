import { useEffect, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Rental } from "@/lib/mock/rentals";
import {
  addPayment,
  addRentalIncident,
  completeRentalNoDamage,
  completeRentalWithDamage,
  revertOverdue,
  setRentalDamage,
  setRentalStatus,
} from "./rentalsStore";
import { clientStore } from "@/pages/clients/clientStore";

export type ActionKind =
  | "schedule"
  | "activate"
  | "cancel"
  | "receive"
  | "revert-overdue"
  | "complete"
  | "complete-damage"
  | "police"
  | "incident"
  | "record-damage"
  | "claim"
  | "lawyer"
  | "addPayment"
  | "set-damage"
  | "mark-unreachable"
  | "unmark-unreachable";

function todayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

type Spec = {
  title: string;
  body: React.ReactNode;
  cta: string;
  ctaTone: "primary" | "warn" | "danger";
  /**
   * Если true — кнопка CTA заблокирована (например, не пройден
   * чек-лист). При нажатии не вызывается handleConfirm.
   */
  blocked?: boolean;
};

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

export function RentalActionDialog({
  rental,
  action,
  onClose,
}: {
  rental: Rental;
  action: ActionKind;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);

  // Форма для возврата с ущербом / инцидента
  const [damageAmount, setDamageAmount] = useState<string>("3000");
  const [damageNote, setDamageNote] = useState<string>("");
  const [returnOk, setReturnOk] = useState(true);
  const [equipmentOk, setEquipmentOk] = useState(true);
  const [depositBack, setDepositBack] = useState(true);
  // Единый сценарий «Завершить аренду» — галка «Есть ущерб?»
  // включает блок суммы и описания. Без галки — обычное завершение.
  const [hasDamage, setHasDamage] = useState(false);

  // Для инцидента посреди аренды
  const [incidentType, setIncidentType] = useState("ДТП");

  // Для принятия платежа
  const [payType, setPayType] = useState<"rent" | "fine" | "damage" | "deposit">("rent");
  const [payAmount, setPayAmount] = useState<string>("1000");
  const [payMethod, setPayMethod] = useState<"cash" | "transfer">("cash");
  const [payNote, setPayNote] = useState<string>("");

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spec: Spec = (() => {
    if (action === "complete") {
      const isInspectionStep =
        rental.status === "active" || rental.status === "overdue";
      // Чек-лист подтверждения выдачи убран по решению заказчика —
      // аренда сразу полностью оформлена при создании, никаких
      // блокировок «сначала подтвердите оплату».

      // Шаг 1: пользователь жмёт «Завершить аренду» — переводим в режим
      // приёма (returning). Это позволяет вернуться к чек-листу позже,
      // если приём прерывается (что-то надо уточнить, клиент уехал и т.п.).
      if (isInspectionStep) {
        return {
          title: "Завершить аренду — начать приём",
          body: (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-[10px] bg-blue-50 px-3 py-2 text-[12px] text-blue-700">
                <Check size={14} className="mt-0.5 shrink-0" />
                <span>
                  Клиент привёз скутер. Откроется режим осмотра — заполните
                  чек-лист в табе «Возврат» и затем подтвердите завершение
                  с галкой «Есть ущерб», если что-то нашли.
                </span>
              </div>
            </div>
          ),
          cta: "Начать приём",
          ctaTone: "primary",
        };
      }
      // Шаг 2: уже returning — единое окно с чек-листом и галкой ущерба.
      return {
        title: "Завершить аренду",
        body: (
          <div className="space-y-3">
            <div className="rounded-[10px] border border-border bg-surface-soft p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2 mb-2">
                Чек-лист приёма
              </div>
              <div className="space-y-1.5 text-[13px]">
                <Checkline
                  checked={equipmentOk}
                  onChange={setEquipmentOk}
                  label="Экипировка возвращена в полном объёме"
                />
                <Checkline
                  checked={returnOk}
                  onChange={setReturnOk}
                  label="Состояние скутера в порядке"
                />
                <Checkline
                  checked={depositBack}
                  onChange={setDepositBack}
                  label="Залог возвращён клиенту"
                />
              </div>
            </div>

            <label className="flex items-start gap-2 rounded-[10px] border border-border bg-surface-soft p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasDamage}
                onChange={(e) => setHasDamage(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-orange"
              />
              <div className="flex-1">
                <div className="text-[13px] font-bold text-ink">Есть ущерб?</div>
                <div className="text-[11px] text-muted">
                  Отметьте, если при осмотре нашли повреждения. Появятся поля для
                  суммы и описания, ущерб создаст платёж типа «damage».
                </div>
              </div>
            </label>

            {hasDamage && (
              <div className="space-y-2 rounded-[10px] border border-orange/30 bg-orange-soft/40 p-3">
                <div className="flex items-center gap-2 text-[12px] font-bold text-orange-ink">
                  <AlertTriangle size={14} /> Фиксация ущерба
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                    Сумма ущерба, ₽
                  </label>
                  <input
                    type="number"
                    value={damageAmount}
                    onChange={(e) => setDamageAmount(e.target.value)}
                    className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] tabular-nums outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                    Описание повреждений
                  </label>
                  <textarea
                    value={damageNote}
                    onChange={(e) => setDamageNote(e.target.value)}
                    rows={2}
                    placeholder="Например: разбит пластик передней панели, царапина на сиденье"
                    className="mt-1 w-full resize-y rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-blue-600"
                  />
                </div>
              </div>
            )}
          </div>
        ),
        cta: hasDamage ? "Завершить с ущербом" : "Завершить аренду",
        ctaTone: hasDamage ? "warn" : "primary",
        // Чек-лист обязателен. При ущербе галка «Состояние ОК» естественно
        // не нужна (ущерб = не ок), но экипировку и залог всё равно
        // подтверждаем. Без ущерба — все три галки.
        blocked: hasDamage
          ? !equipmentOk || !depositBack
          : !equipmentOk || !returnOk || !depositBack,
      };
    }
    return specFor(action, rental);
  })();

  const handleConfirm = () => {
    switch (action) {
      case "schedule":
        setRentalStatus(rental.id, "meeting");
        break;
      case "activate":
        setRentalStatus(rental.id, "active");
        break;
      case "cancel":
        setRentalStatus(rental.id, "cancelled");
        break;
      case "receive":
        setRentalStatus(rental.id, "returning");
        break;
      case "revert-overdue":
        revertOverdue(rental.id);
        break;
      case "complete":
        // Если в active/overdue → переводим в returning (фиксируем что
        // скутер привезли). Если уже в returning → закрываем сделку,
        // решая вопрос ущерба галкой внутри окна.
        if (rental.status === "active" || rental.status === "overdue") {
          setRentalStatus(rental.id, "returning");
        } else if (hasDamage) {
          completeRentalWithDamage(
            rental.id,
            {
              dateActual: todayStr(),
              conditionOk: false,
              equipmentOk,
              depositReturned: depositBack,
              damageNotes: damageNote,
            },
            Number(damageAmount) || 0,
            damageNote,
          );
        } else {
          completeRentalNoDamage(rental.id, {
            dateActual: todayStr(),
            conditionOk: returnOk,
            equipmentOk,
            depositReturned: depositBack,
          });
        }
        break;
      case "complete-damage":
        // Legacy путь, оставлен для совместимости, но из UI больше не вызывается.
        completeRentalWithDamage(
          rental.id,
          {
            dateActual: todayStr(),
            conditionOk: false,
            equipmentOk,
            depositReturned: depositBack,
            damageNotes: damageNote,
          },
          Number(damageAmount) || 0,
          damageNote,
        );
        break;
      case "police":
        setRentalStatus(rental.id, "police");
        break;
      case "lawyer":
        setRentalStatus(rental.id, "court");
        break;
      case "incident":
        addRentalIncident(rental.id, {
          type: incidentType,
          date: todayStr(),
          damage: Number(damageAmount) || 0,
          note: damageNote,
        });
        break;
      case "record-damage": {
        const amt = Number(damageAmount) || 0;
        if (amt > 0) {
          addPayment({
            rentalId: rental.id,
            type: "damage",
            amount: amt,
            date: todayStr(),
            method: "cash",
            paid: true,
            note: "частичная оплата ущерба",
          });
        }
        break;
      }
      case "claim":
        // Заглушка: в реальности — генерация досудебной претензии
        break;
      case "addPayment": {
        const amt = Number(payAmount) || 0;
        if (amt > 0) {
          addPayment({
            rentalId: rental.id,
            type: payType,
            amount: amt,
            date: todayStr(),
            method: payMethod,
            paid: true,
            note: payNote.trim() || undefined,
          });
        }
        break;
      }
      case "set-damage": {
        const amt = Number(damageAmount) || 0;
        setRentalDamage(rental.id, amt);
        break;
      }
      case "mark-unreachable":
        clientStore.setUnreachable(rental.clientId, true);
        break;
      case "unmark-unreachable":
        clientStore.setUnreachable(rental.clientId, false);
        break;
    }
    requestClose();
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[120] flex items-center justify-center bg-ink/55 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onClick={requestClose}
    >
      <div
        className={cn(
          "w-full max-w-[520px] overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
            {spec.title}
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 text-[13px] text-ink-2">
          <div className="mb-3 flex items-center justify-between rounded-[10px] bg-surface-soft px-3 py-2 text-[12px]">
            <span>{rental.scooter}</span>
            <span className="text-muted-2">· {rental.start} — {rental.endPlanned}</span>
          </div>

          {spec.body}

          {action === "complete" && (
            <div className="mt-3 flex flex-col gap-2">
              <Checkbox checked={returnOk} onChange={setReturnOk} label="Состояние скутера ОК" />
              <Checkbox checked={equipmentOk} onChange={setEquipmentOk} label="Экипировка в порядке" />
              <Checkbox checked={depositBack} onChange={setDepositBack} label={`Залог ${fmt(rental.deposit || 2000)} ₽ возвращён клиенту`} />
            </div>
          )}

          {action === "incident" && (
            <div className="mt-3 flex flex-col gap-2">
              <label className="text-[12px] font-semibold text-ink">
                Тип инцидента
                <select
                  value={incidentType}
                  onChange={(e) => setIncidentType(e.target.value)}
                  className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
                >
                  <option value="ДТП">ДТП</option>
                  <option value="Повреждение скутера">Повреждение скутера</option>
                  <option value="Эвакуация на штрафстоянку">Эвакуация на штрафстоянку</option>
                  <option value="Кража / пропажа">Кража / пропажа</option>
                  <option value="Жалоба">Жалоба</option>
                  <option value="Другое">Другое</option>
                </select>
              </label>
              <label className="text-[12px] font-semibold text-ink">
                Оценка ущерба, ₽
                <input
                  type="number"
                  value={damageAmount}
                  onChange={(e) => setDamageAmount(e.target.value)}
                  className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
                />
                <div className="mt-0.5 text-[10px] text-muted-2">
                  можно 0 — если ущерб ещё не посчитан
                </div>
              </label>
              <label className="text-[12px] font-semibold text-ink">
                Описание
                <textarea
                  value={damageNote}
                  onChange={(e) => setDamageNote(e.target.value)}
                  placeholder="Например: клиент попал в ДТП на перекрёстке, повреждено переднее крыло и фонарь"
                  rows={3}
                  className="mt-1 w-full resize-y rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-blue-600"
                />
              </label>
            </div>
          )}

          {action === "addPayment" && (
            <div className="mt-3 flex flex-col gap-2">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                  Тип платежа
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {(
                    [
                      ["rent", "Аренда"],
                      ["fine", "Штраф"],
                      ["damage", "Ущерб"],
                      ["deposit", "Залог"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setPayType(k)}
                      className={cn(
                        "rounded-[10px] px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
                        payType === k
                          ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600"
                          : "bg-surface-soft text-muted hover:bg-border",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[12px] font-semibold text-ink">
                  Сумма, ₽
                  <input
                    type="number"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
                  />
                </label>
                <div>
                  <div className="mb-1 text-[12px] font-semibold text-ink">
                    Метод
                  </div>
                  <div className="flex gap-1.5">
                    {(["cash", "transfer"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPayMethod(m)}
                        className={cn(
                          "flex-1 rounded-[10px] px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
                          payMethod === m
                            ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600"
                            : "bg-surface-soft text-muted hover:bg-border",
                        )}
                      >
                        {m === "cash" ? "Наличные" : "Перевод"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <label className="text-[12px] font-semibold text-ink">
                Комментарий
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="Необязательно"
                  className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
                />
              </label>
            </div>
          )}

          {action === "set-damage" && (
            <div className="mt-3 flex flex-col gap-2">
              <label className="text-[12px] font-semibold text-ink">
                Сумма ущерба, ₽
                <input
                  type="number"
                  value={damageAmount}
                  onChange={(e) => setDamageAmount(e.target.value)}
                  placeholder="0 — убрать плашку"
                  className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
                />
                <div className="mt-0.5 text-[10px] text-muted-2">
                  Укажите 0, чтобы снять отметку об ущербе.
                </div>
              </label>
            </div>
          )}

          {action === "record-damage" && (
            <div className="mt-3 flex flex-col gap-2">
              <label className="text-[12px] font-semibold text-ink">
                Сумма оплаты, ₽
                <input
                  type="number"
                  value={damageAmount}
                  onChange={(e) => setDamageAmount(e.target.value)}
                  className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
                />
              </label>
              <label className="text-[12px] font-semibold text-ink">
                Комментарий
                <input
                  type="text"
                  value={damageNote}
                  onChange={(e) => setDamageNote(e.target.value)}
                  placeholder="Необязательно"
                  className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
                />
              </label>
            </div>
          )}

          {action === "complete-damage" && (
            <div className="mt-3 flex flex-col gap-2">
              <label className="text-[12px] font-semibold text-ink">
                Сумма ущерба, ₽
                <input
                  type="number"
                  value={damageAmount}
                  onChange={(e) => setDamageAmount(e.target.value)}
                  className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
                />
              </label>
              <label className="text-[12px] font-semibold text-ink">
                Описание повреждений
                <textarea
                  value={damageNote}
                  onChange={(e) => setDamageNote(e.target.value)}
                  placeholder="Например: царапина на переднем крыле, треснул пластик фары"
                  rows={3}
                  className="mt-1 w-full resize-y rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-blue-600"
                />
              </label>
              <Checkbox
                checked={depositBack}
                onChange={setDepositBack}
                label={`Залог ${fmt(rental.deposit || 2000)} ₽ возвращён (иначе удерживается в счёт ущерба)`}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-soft px-5 py-3">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-[12px] font-semibold text-muted hover:bg-border"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={spec.blocked ? requestClose : handleConfirm}
            disabled={spec.blocked}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors",
              spec.blocked
                ? "cursor-not-allowed bg-surface-soft text-muted-2"
                : spec.ctaTone === "primary"
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : spec.ctaTone === "warn"
                    ? "bg-orange text-white hover:bg-orange-ink"
                    : spec.ctaTone === "danger"
                      ? "bg-red text-white hover:bg-red-ink"
                      : "",
            )}
          >
            <Check size={13} /> {spec.cta}
          </button>
        </div>
      </div>
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-[10px] bg-surface-soft px-3 py-2 text-[12px] text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-blue-600"
      />
      {label}
    </label>
  );
}

function specFor(action: ActionKind, rental: Rental): Spec {
  switch (action) {
    case "schedule":
      return {
        title: "Назначить встречу",
        body: (
          <div>
            Перевести заявку в статус <b>Встреча</b>? Встреча требуется для сверки
            паспорта и водительских прав до выдачи скутера.
          </div>
        ),
        cta: "Назначить встречу",
        ctaTone: "primary",
      };
    case "activate":
      return {
        title: "Выдать скутер",
        body: (
          <div>
            Аренда перейдёт в статус <b>Активна</b>. Убедитесь что:
            <ul className="mt-2 list-disc pl-5 text-[12px] text-muted">
              <li>паспорт и права сверены с оригиналами</li>
              <li>подписан договор и Акт выдачи</li>
              <li>фото документов отправлены в Telegram-канал</li>
              <li>записано видео состояния скутера</li>
              <li>получена оплата и залог {rental.deposit || 2000} ₽</li>
            </ul>
          </div>
        ),
        cta: "Выдать и активировать",
        ctaTone: "primary",
      };
    case "cancel":
      return {
        title: "Отменить заявку",
        body: (
          <div>
            Заявка будет переведена в статус <b>Отменена</b> — её нельзя будет
            возобновить (нужно будет создать новую).
          </div>
        ),
        cta: "Отменить заявку",
        ctaTone: "danger",
      };
    case "receive":
      return {
        title: "Принять возврат",
        body: (
          <div>
            Клиент привёз скутер. Откроется режим осмотра — заполните чек-лист
            возврата в табе «Возврат». После осмотра завершите аренду без или с
            ущербом.
          </div>
        ),
        cta: "Начать приём возврата",
        ctaTone: "primary",
      };
    case "revert-overdue":
      return {
        title: "Снять просрочку",
        body: (
          <div className="text-[12px]">
            Аренда вернётся в статус <b>Активна</b>, накопленные штрафы по
            просрочке будут списаны. Используйте, если у вас хорошие отношения с
            клиентом и договорились без штрафа.
          </div>
        ),
        cta: "Снять просрочку",
        ctaTone: "primary",
      };
    case "complete":
      return {
        title: "Завершить без ущерба",
        body: (
          <div className="flex items-start gap-2 rounded-[10px] bg-green-soft/60 px-3 py-2 text-[12px] text-green-ink">
            <Check size={14} className="mt-0.5 shrink-0" />
            <span>
              Подтвердите пункты чек-листа. Аренда будет закрыта, залог можно
              вернуть клиенту.
            </span>
          </div>
        ),
        cta: "Завершить",
        ctaTone: "primary",
      };
    case "complete-damage":
      return {
        title: "Завершить с ущербом",
        body: (
          <div className="flex items-start gap-2 rounded-[10px] bg-orange-soft/70 px-3 py-2 text-[12px] text-orange-ink">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Зафиксируйте сумму и описание повреждений. По аренде будет создан
              инцидент и начислен платёж типа «ущерб». Приоритет списания:
              штрафы → ущерб → неустойка → аренда.
            </span>
          </div>
        ),
        cta: "Завершить с ущербом",
        ctaTone: "warn",
      };
    case "police":
      return {
        title: "Подать в полицию",
        body: (
          <div>
            Аренда перейдёт в статус <b>Полиция</b>. Переход обратно невозможен
            без возврата скутера. Убедитесь что предупреждение клиента отправлено.
          </div>
        ),
        cta: "Подать заявление",
        ctaTone: "danger",
      };
    case "lawyer":
      return {
        title: "Передать юристу",
        body: (
          <div>
            Аренда перейдёт в статус <b>Суд</b>. Юрист получит пакет: договор,
            акты, претензия, переписка.
          </div>
        ),
        cta: "Передать юристу",
        ctaTone: "danger",
      };
    case "incident":
      return {
        title: "Зафиксировать инцидент",
        body: (
          <div className="text-[12px]">
            Инцидент посреди аренды: ДТП, эвакуация на штрафстоянку, сломанный
            скутер и т.п. Запись появится в истории этой аренды, в профиле
            клиента и в общем разделе инцидентов.
          </div>
        ),
        cta: "Создать инцидент",
        ctaTone: "warn",
      };
    case "record-damage":
      return {
        title: "Записать оплату ущерба",
        body: (
          <div className="text-[12px]">
            Введите сумму, которую клиент заплатил по ущербу. Когда общая сумма
            будет погашена, аренда автоматически закроется. Приоритет списания:
            штрафы → ущерб → неустойка → аренда.
          </div>
        ),
        cta: "Зафиксировать",
        ctaTone: "primary",
      };
    case "claim":
      return {
        title: "Составить досудебную претензию",
        body: (
          <div className="text-[12px]">
            Сформируется документ с перечнем повреждений, суммой и сроком для
            добровольной оплаты. Клиент подписывает претензию (признаёт вину).
            Если откажется — передать юристу.
          </div>
        ),
        cta: "Сформировать претензию",
        ctaTone: "warn",
      };
    case "addPayment":
      return {
        title: "Принять платёж",
        body: (
          <div className="text-[12px]">
            Записать получение средств: доплата аренды, штраф, возврат залога и
            т.п. Платёж появится в табе «Платежи».
          </div>
        ),
        cta: "Зафиксировать",
        ctaTone: "primary",
      };
    case "set-damage":
      return {
        title: rental.damageAmount
          ? "Изменить сумму ущерба"
          : "Зафиксировать ущерб",
        body: (
          <div className="text-[12px]">
            Информативная плашка — отображается в KPI карточки аренды. Сама по
            себе не списывает платёж, нужна чтобы видеть сумму предполагаемого
            ущерба (клиент разбил скутер, ДТП, пропажа деталей и т. п.).
            Оплату фиксируйте через «Принять платёж» типа «Ущерб».
          </div>
        ),
        cta: "Сохранить",
        ctaTone: "warn",
      };
    case "mark-unreachable":
      return {
        title: "Отметить: не выходит на связь",
        body: (
          <div className="text-[12px]">
            Клиент <b>{"перестал отвечать"}</b> на звонки и сообщения. Ярлык
            появится и на карточке клиента, и на всех его арендах. Такие клиенты
            попадают под фильтр <b>Проблемные</b>.
          </div>
        ),
        cta: "Отметить",
        ctaTone: "warn",
      };
    case "unmark-unreachable":
      return {
        title: "Снять отметку «не выходит на связь»",
        body: (
          <div className="text-[12px]">
            Ярлык будет убран у клиента и у всех его аренд.
          </div>
        ),
        cta: "Снять",
        ctaTone: "primary",
      };
  }
}

/** Строка чек-листа с галкой — для единого окна «Завершить аренду». */
function Checkline({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-blue-600"
      />
      <span className={cn("text-[13px]", checked ? "text-ink" : "text-muted")}>
        {label}
      </span>
    </label>
  );
}
