import { useEffect, useState } from "react";
import { AlertTriangle, Bike, Check, FileText, Image as ImageIcon, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Rental } from "@/lib/mock/rentals";
import { DatePicker } from "@/components/ui/date-picker";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useApiEquipment } from "@/lib/api/equipment";
import { useApiClients } from "@/lib/api/clients";
import { useApiClientDocs } from "@/lib/api/documents";
import { fileUrl } from "@/lib/files";
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
import { api } from "@/lib/api";
import { useActivityTimeline } from "@/lib/api/activity";
import { useApiScooter } from "@/lib/api/scooters";
import { useApiPriceList } from "@/lib/api/price-list";
import { DocumentPreviewModal } from "./DocumentPreviewModal";

/** v0.4.57: helper для записи компенсаций с залога. Использует
 *  существующий endpoint /debt/manual (kind=manual_charge). */
async function postManualCharge(rentalId: number, amount: number, comment: string) {
  try {
    await api.post(`/api/rentals/${rentalId}/debt/manual`, { amount, comment });
  } catch (e) {
    console.error("postManualCharge", e);
  }
}

/** v0.4.57: ISO yyyy-mm-dd → DD.MM.YYYY (формат inspection.dateActual). */
function isoDateToRu(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export type ActionKind =
  | "schedule"
  | "activate"
  | "cancel"
  | "receive"
  | "cancel-return"
  | "revert-overdue"
  | "complete"
  | "complete-damage"
  | "police"
  // v0.4.36: вернуть аренду из police/court обратно в работу
  | "revert-police"
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
  onOpenDamage,
}: {
  rental: Rental;
  action: ActionKind;
  onClose: () => void;
  /** Вызывается когда при «Завершить» обнаружен ущерб (галочка
   *  «Состояние скутера в порядке» НЕ стоит) — parent открывает
   *  DamageReportDialog. */
  onOpenDamage?: () => void;
}) {
  const [closing, setClosing] = useState(false);

  // Форма для возврата с ущербом / инцидента
  const [damageAmount, setDamageAmount] = useState<string>("3000");
  const [damageNote, setDamageNote] = useState<string>("");
  // v0.4.62: КАРТОЧНАЯ модель чек-листа возврата. Раньше были чекбоксы
  // «Состояние скутера ОК» / «Экипировка ОК» / «Залог готов к выдаче».
  // Это не работало для случая «один шлем повреждён, второй ОК» —
  // приходилось снимать общую галку и вводить общую сумму.
  //
  // Теперь: карточки на каждую позицию (1 скутер + N позиций
  // экипировки из rental.equipmentJson). У каждой карточки два
  // состояния: 'ok' / 'problem'. Изначально не выбрано.
  //   • problem на скутере → откроется DamageReportDialog
  //   • problem на экипировке → откроется picker позиций из прайс-листа
  //     (группа «Экипировка»), оператор выбирает причину и сумму
  //     (или вводит свою).
  // Залог-чекбокс убран: финальная сумма к возврату считается из
  // удержаний и показывается внизу.
  type CardKey = "scooter" | `equipment-${number}`;
  type CardState = "ok" | "problem";
  type EquipmentDamage = {
    name: string;
    amount: number;
    itemId?: number;
    isCustom: boolean;
  };
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
  const [equipmentDamages, setEquipmentDamages] = useState<
    Record<string, EquipmentDamage>
  >({});
  const [pickerKey, setPickerKey] = useState<CardKey | null>(null);
  // Дата фактического возврата.
  const [returnDate, setReturnDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  // v0.4.63: дополнительное удержание убрано — все удержания теперь
  // через карточки экипировки (или DamageReport для скутера).
  const depositWithhold = "0";
  const depositWithholdNote = "";
  // v0.4.57: пробег скутера при возврате. Опционально — некоторые
  // бизнесы ведут учёт пробега (для ТО / страховки). Пустое значение
  // не передаётся в API.
  const [mileageAtReturn, setMileageAtReturn] = useState<string>("");
  // Legacy-флаг для action="complete-damage" — в новом flow «Завершить»
  // ущерб открывается через onOpenDamage callback, без чекбокса.
  const [hasDamage] = useState(false);
  void hasDamage;

  // Для инцидента посреди аренды
  const [incidentType, setIncidentType] = useState("ДТП");

  // Для принятия платежа
  const [payType, setPayType] = useState<"rent" | "fine" | "damage" | "deposit">("rent");
  const [payAmount, setPayAmount] = useState<string>("1000");
  const [payMethod, setPayMethod] = useState<"cash" | "transfer">("cash");
  const [payNote, setPayNote] = useState<string>("");

  // v0.4.60: текущий пробег скутера для подсказки оператору в инпуте
  // «Пробег при возврате». Без неё оператор может ввести меньшее
  // значение и оно молча отбросится бэком.
  const scooterQ = useApiScooter(rental.scooterId ?? null);
  const currentMileage = scooterQ.data?.mileage ?? null;
  // v0.4.63: данные для аватарок и шапки.
  const modelsQ = useApiScooterModels();
  const equipmentQ = useApiEquipment();
  const clientsQ = useApiClients();
  const scooter = scooterQ.data ?? null;
  const scooterModel =
    scooter?.modelId != null
      ? (modelsQ.data ?? []).find((m) => m.id === scooter.modelId) ?? null
      : null;
  const scooterAvatar = fileUrl(scooterModel?.avatarKey, { variant: "thumb" });
  const equipmentItems = equipmentQ.data ?? [];
  const client = (clientsQ.data ?? []).find((c) => c.id === rental.clientId) ?? null;
  // v0.4.64: фото клиента (из client_documents kind='photo') — используется
  // в шапке окна завершения как «лицо аренды». Скутер уезжает в карточки
  // приёмки позиций.
  const clientDocsQ = useApiClientDocs(rental.clientId);
  const clientPhotoDoc = (clientDocsQ.data ?? []).find((d) => d.kind === "photo");
  const clientPhoto = clientPhotoDoc ? fileUrl(clientPhotoDoc.fileKey, { variant: "thumb" }) : null;

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
      // v0.4.62: КАРТОЧНАЯ модель приёма возврата.
      //   • На каждую позицию (скутер + каждая экипировка) — карточка с
      //     двумя состояниями: «В порядке» / «Есть проблема».
      //   • problem на скутере → откроется DamageReportDialog.
      //   • problem на экипировке → откроется picker позиций из прайса
      //     группы «Экипировка», оператор выбирает причину+сумму
      //     (или «свой вариант»).
      //   • Если экипировки нет — нет карточек экипировки, только скутер.
      //   • Внизу — финансовая сводка по залогу (без чекбокса).
      const equipmentList: { name: string; itemId?: number | null; price?: number }[] = [];
      if (rental.equipmentJson && rental.equipmentJson.length > 0) {
        for (const e of rental.equipmentJson) {
          equipmentList.push({
            name: e.name,
            itemId: e.itemId ?? null,
            price: e.price,
          });
        }
      } else if (rental.equipment && rental.equipment.length > 0) {
        for (const name of rental.equipment) {
          equipmentList.push({ name });
        }
      }
      const scooterCard: CardKey = "scooter";
      const scooterState = cardStates[scooterCard];
      const scooterDamaged = scooterState === "problem";
      const equipmentCards = equipmentList.map((_, i) => `equipment-${i}` as CardKey);
      const allCards: CardKey[] = [scooterCard, ...equipmentCards];
      const allDecided = allCards.every((k) => cardStates[k] != null);
      // Сумма удержаний по проблемной экипировке.
      const equipmentDamageTotal = equipmentCards.reduce((sum, key) => {
        if (cardStates[key] !== "problem") return sum;
        return sum + (equipmentDamages[key]?.amount ?? 0);
      }, 0);
      const depositTotal = rental.deposit || 2000;
      const cappedEquipDamage = Math.max(0, Math.min(depositTotal, equipmentDamageTotal));
      const withholdNum = Math.max(
        0,
        Math.min(
          Math.max(0, depositTotal - cappedEquipDamage),
          Math.floor(Number(depositWithhold) || 0),
        ),
      );
      const depositToReturn = Math.max(0, depositTotal - cappedEquipDamage - withholdNum);
      // Парс start для min даты возврата.
      const startMatch = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(rental.start);
      const minReturnDate = startMatch
        ? `${startMatch[3]}-${startMatch[2]}-${startMatch[1]}`
        : undefined;
      const todayIso = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })();
      // Все ли проблемы экипировки заполнены (выбрана позиция/сумма).
      const allEquipmentProblemsFilled = equipmentCards.every((key) => {
        if (cardStates[key] !== "problem") return true;
        const d = equipmentDamages[key];
        return !!d && d.amount > 0 && d.name.trim().length > 0;
      });
      return {
        title: "Завершить аренду",
        body: (
          <div className="space-y-4">
            {/* Карточки приёмки */}
            <div className="space-y-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                Приёмка позиций
              </div>
              <ReturnItemCard
                title={rental.scooter}
                subtitle={scooterModel?.name ?? rental.scooter}
                imageUrl={scooterAvatar}
                fallbackIcon="scooter"
                state={scooterState}
                onSetOk={() =>
                  setCardStates((s) => ({ ...s, [scooterCard]: "ok" }))
                }
                onSetProblem={() => {
                  setCardStates((s) => ({ ...s, [scooterCard]: "problem" }));
                }}
              />
              {equipmentList.map((eq, i) => {
                const key = `equipment-${i}` as CardKey;
                const damage = equipmentDamages[key];
                const eqItem = eq.itemId
                  ? equipmentItems.find((x) => x.id === eq.itemId)
                  : null;
                const eqAvatar = fileUrl(
                  eqItem?.avatarThumbKey ?? eqItem?.avatarKey,
                  { variant: "thumb" },
                );
                return (
                  <ReturnItemCard
                    key={key}
                    title={eq.name}
                    subtitle={
                      eq.price && eq.price > 0
                        ? `${fmt(eq.price)} ₽ при выдаче`
                        : "бесплатно"
                    }
                    imageUrl={eqAvatar}
                    fallbackIcon="equipment"
                    state={cardStates[key]}
                    damageInfo={
                      cardStates[key] === "problem" && damage
                        ? `${damage.name} — ${fmt(damage.amount)} ₽`
                        : undefined
                    }
                    onSetOk={() => {
                      setCardStates((s) => ({ ...s, [key]: "ok" }));
                      setEquipmentDamages((m) => {
                        const next = { ...m };
                        delete next[key];
                        return next;
                      });
                    }}
                    onSetProblem={() => {
                      setCardStates((s) => ({ ...s, [key]: "problem" }));
                      setPickerKey(key);
                    }}
                    onEditProblem={() => setPickerKey(key)}
                  />
                );
              })}
              {equipmentList.length === 0 && (
                <div className="text-[11px] text-muted-2">
                  Экипировка не выдавалась.
                </div>
              )}
            </div>

            {/* Дата возврата + пробег — в один ряд */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                  Дата возврата
                </label>
                <DatePicker
                  value={returnDate || null}
                  onChange={(v) => setReturnDate(v ?? "")}
                  minDate={minReturnDate}
                  maxDate={todayIso}
                  className="mt-1"
                  clearable={false}
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                  Пробег, км <span className="text-muted-2/70 normal-case">опц.</span>
                </label>
                <input
                  type="number"
                  min={currentMileage ?? 0}
                  value={mileageAtReturn}
                  onChange={(e) => setMileageAtReturn(e.target.value)}
                  placeholder={
                    currentMileage != null
                      ? `${currentMileage.toLocaleString("ru-RU")}`
                      : "—"
                  }
                  className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] tabular-nums outline-none focus:border-blue-600"
                />
              </div>
            </div>
            {currentMileage != null && mileageAtReturn && (
              <div className="-mt-2 text-[11px] text-muted-2">
                {Number(mileageAtReturn) > currentMileage && (
                  <>
                    Пробег скутера обновится:{" "}
                    <b className="text-ink tabular-nums">
                      {currentMileage.toLocaleString("ru-RU")}
                    </b>{" "}
                    →{" "}
                    <b className="text-ink tabular-nums">
                      {Number(mileageAtReturn).toLocaleString("ru-RU")}
                    </b>{" "}
                    км (+{(Number(mileageAtReturn) - currentMileage).toLocaleString("ru-RU")}).
                  </>
                )}
                {Number(mileageAtReturn) > 0 &&
                  Number(mileageAtReturn) < currentMileage && (
                    <span className="text-orange-ink">
                      ⚠ Введённое значение меньше текущего ({currentMileage.toLocaleString("ru-RU")} км) — изменение игнорируется.
                    </span>
                  )}
              </div>
            )}

            {/* Плашка damage flow для скутера */}
            {scooterDamaged && (
              <div className="flex items-start gap-2 rounded-[10px] border border-orange/40 bg-orange-soft/40 p-3 text-[12px] text-orange-ink">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  По скутеру отмечена проблема — после нажатия откроется
                  <b> «Зафиксировать ущерб»</b>: выберешь повреждения из
                  прейскуранта, рассчитаешь сумму и зачёт залога.
                </span>
              </div>
            )}

            {/* Финансовая сводка по залогу — только если скутер ок */}
            {!scooterDamaged && (
              <div className="rounded-xl border border-border bg-surface-soft/60 p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2 mb-2.5">
                  Залог
                </div>
                <div className="space-y-2 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-ink-2">Внесён при выдаче</span>
                    <span className="tabular-nums font-semibold text-ink">
                      {fmt(depositTotal)} ₽
                    </span>
                  </div>
                  {equipmentCards.map((key) => {
                    if (cardStates[key] !== "problem") return null;
                    const d = equipmentDamages[key];
                    if (!d) return null;
                    const eqName =
                      equipmentList[Number(key.split("-")[1])]?.name ?? "Экипировка";
                    return (
                      <div key={key} className="flex justify-between text-orange-ink">
                        <span className="truncate">
                          − {eqName}: {d.name}
                        </span>
                        <span className="tabular-nums">−{fmt(d.amount)} ₽</span>
                      </div>
                    );
                  })}
                  <div className="border-t border-border/60 pt-2.5 mt-1 flex items-center justify-between text-[14px] font-bold">
                    <span className="text-ink">К возврату клиенту</span>
                    <span className="tabular-nums text-blue-600">
                      {fmt(depositToReturn)} ₽
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Picker позиций экипировки из прайса */}
            {pickerKey && pickerKey !== "scooter" && (
              <EquipmentDamagePicker
                onClose={() => {
                  // Если оператор закрыл picker не выбрав — отменяем
                  // problem-state на этой карточке, чтоб не остаться без
                  // суммы и блокировать кнопку.
                  setPickerKey(null);
                  if (pickerKey && !equipmentDamages[pickerKey]) {
                    setCardStates((s) => {
                      const next = { ...s };
                      delete next[pickerKey];
                      return next;
                    });
                  }
                }}
                presetName={
                  equipmentList[Number(pickerKey.split("-")[1])]?.name ?? null
                }
                onPick={(picked) => {
                  setEquipmentDamages((m) => ({ ...m, [pickerKey]: picked }));
                  setPickerKey(null);
                }}
              />
            )}
          </div>
        ),
        cta: scooterDamaged ? "Перейти к фиксации ущерба" : "Завершить аренду",
        ctaTone: scooterDamaged ? "warn" : "primary",
        // Блокировка кнопки:
        //  • Все карточки должны быть в одном из состояний (ok/problem).
        //  • Проблемы экипировки должны иметь сумму и название.
        //  • При withhold > 0 — обязательная причина.
        //  • На damage-flow скутера → перенаправляем после подтверждения,
        //    кнопка активна как только скутер выбран.
        blocked: (() => {
          if (!allDecided) return true;
          if (scooterDamaged) return false;
          if (!allEquipmentProblemsFilled) return true;
          const wh = Math.floor(Number(depositWithhold) || 0);
          if (wh > 0 && !depositWithholdNote.trim()) return true;
          return false;
        })(),
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
      case "cancel-return":
        // Откат: пользователь случайно нажал «Завершить аренду», скутер
        // ещё у клиента, ничего не возвращали. Возвращаем в активный режим.
        setRentalStatus(rental.id, "active");
        break;
      case "revert-overdue":
        revertOverdue(rental.id);
        break;
      case "complete": {
        // v0.4.62: карточная модель. Логика:
        //   • Скутер problem → onOpenDamage (DamageReportDialog).
        //   • На каждую проблемную экипировку → manual_charge с суммой
        //     и названием выбранной позиции.
        //   • Дополнительное удержание → manual_charge.
        //   • equipmentOk = все equipment cards в state='ok'.
        //   • depositReturned = true (теперь это не вопрос —
        //     рассчитывается из удержаний).
        const scooterDamaged = cardStates["scooter"] === "problem";
        if (scooterDamaged) {
          if (onOpenDamage) {
            onOpenDamage();
            requestClose();
            return;
          }
          completeRentalWithDamage(
            rental.id,
            {
              dateActual: returnDate ? isoDateToRu(returnDate) : todayStr(),
              conditionOk: false,
              equipmentOk: false,
              depositReturned: false,
              damageNotes: "",
              mileage: mileageAtReturn ? Number(mileageAtReturn) : undefined,
            },
            0,
            "",
          );
          break;
        }
        const dateActual = returnDate ? isoDateToRu(returnDate) : todayStr();
        const equipmentOkAll = Object.entries(cardStates).every(
          ([k, v]) => k === "scooter" || v === "ok",
        );
        const charges: Promise<unknown>[] = [];
        // Списываем по каждой проблемной экипировке отдельной записью —
        // в истории долга будет видно ЗА ЧТО именно удерживали.
        for (const [key, state] of Object.entries(cardStates)) {
          if (key === "scooter" || state !== "problem") continue;
          const damage = equipmentDamages[key];
          if (!damage || damage.amount <= 0) continue;
          // Найдём имя позиции экипировки по индексу
          const idx = Number(key.split("-")[1]);
          const eqList =
            (rental.equipmentJson && rental.equipmentJson.length > 0
              ? rental.equipmentJson
              : (rental.equipment ?? []).map((n) => ({ name: n }))) ?? [];
          const eqName = (eqList[idx] as { name?: string } | undefined)?.name ?? "Экипировка";
          charges.push(
            postManualCharge(
              rental.id,
              damage.amount,
              `Компенсация экипировки «${eqName}»: ${damage.name}`,
            ),
          );
        }
        const withholdAmt = Math.max(0, Math.floor(Number(depositWithhold) || 0));
        if (withholdAmt > 0) {
          charges.push(
            postManualCharge(
              rental.id,
              withholdAmt,
              `Удержание из залога${depositWithholdNote ? `: ${depositWithholdNote}` : ""}`,
            ),
          );
        }
        Promise.all(charges).finally(() => {
          completeRentalNoDamage(rental.id, {
            dateActual,
            conditionOk: true,
            equipmentOk: equipmentOkAll,
            depositReturned: true,
            mileage: mileageAtReturn ? Number(mileageAtReturn) : undefined,
          });
        });
        break;
      }
      case "complete-damage":
        // Legacy путь, оставлен для совместимости, но из UI больше не вызывается.
        completeRentalWithDamage(
          rental.id,
          {
            dateActual: todayStr(),
            conditionOk: false,
            equipmentOk: false,
            depositReturned: false,
            damageNotes: damageNote,
          },
          Number(damageAmount) || 0,
          damageNote,
        );
        break;
      case "police":
        setRentalStatus(rental.id, "police");
        break;
      case "revert-police": {
        // v0.4.36/37: возвращаем аренду в обычный поток работы. Если
        // плановая дата возврата уже прошла — overdue, иначе active.
        // Scheduler делает только active→overdue (не наоборот), поэтому
        // если revert произошёл при будущей плановой дате, ставить
        // overdue нельзя — застрянет навсегда красным.
        const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(rental.endPlanned);
        const today = new Date();
        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const endKey = m ? `${m[3]}-${m[2]}-${m[1]}` : null;
        const next: "overdue" | "active" =
          endKey && endKey < todayKey ? "overdue" : "active";
        setRentalStatus(rental.id, next);
        break;
      }
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
          {action === "complete" ? (
            <RentalSummaryCard
              rental={rental}
              clientName={client?.name ?? null}
              clientPhone={client?.phone ?? null}
              clientPhoto={clientPhoto}
            />
          ) : (
            <div className="mb-3 flex items-center justify-between rounded-[10px] bg-surface-soft px-3 py-2 text-[12px]">
              <span>{rental.scooter}</span>
              <span className="text-muted-2">
                · {rental.start} — {rental.endPlanned}
              </span>
            </div>
          )}

          {action === "complete" && (
            <>
              <RentalExtensionsHint rentalId={rental.id} />
              <ReturnDocPreviewLink rentalId={rental.id} />
            </>
          )}

          {spec.body}
          {/*
           * v0.4.57: дубль чек-листа удалён. Чек-лист рендерится только
           * один раз внутри spec.body для action='complete' (см. начало
           * файла). До этого был второй блок чекбоксов с другими
           * лейблами, привязанный к тому же state — оператор видел
           * «всё уже отмечено» и жал «Завершить» не глядя.
           */}

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
              {/* v0.4.62: чекбокс «залог возвращён» удалён в новом
                  flow возврата (action='complete' использует карточки).
                  В legacy 'complete-damage' depositReturned всегда false
                  — ущерб = удержание залога, чекбокс лишний. */}
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
    case "cancel-return":
      return {
        title: "Отменить возврат",
        body: (
          <div className="text-[12px]">
            Аренда вернётся в статус <b>Активна</b>. Используйте если случайно
            нажали «Завершить аренду» — скутер фактически у клиента, никаких
            изменений по возврату не было.
          </div>
        ),
        cta: "Отменить возврат",
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
            Аренда перейдёт в статус <b>Полиция</b>. Из этого статуса можно
            вернуть аренду в работу через «Отменить дело», или закрыть как
            «Скутер вернулся».
          </div>
        ),
        cta: "Подать заявление",
        ctaTone: "danger",
      };
    case "revert-police":
      return {
        title: "Отменить дело",
        body: (
          <div>
            Аренда вернётся в обычный поток работы (статус <b>Просрочка</b>).
            Используйте если разбирательство закончилось, или скутер
            нашёлся, но клиент ещё не сдал — нужно продолжить взыскание
            долга обычным путём.
          </div>
        ),
        cta: "Вернуть в работу",
        ctaTone: "warn",
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

/**
 * v0.4.64: шапка окна «Завершить аренду» — карточка клиента.
 *
 * Логическое разделение: ВЕРХ = «кто сдаёт» (фото клиента + контакты),
 * НИЖЕ — «что сдаёт» (карточки скутера и экипировки в секции «Приёмка
 * позиций»). До этого скутер был и в шапке (как фоновая аватарка), и в
 * приёмке — дублирование. Теперь скутер только в приёмке.
 */
function RentalSummaryCard({
  rental,
  clientName,
  clientPhone,
  clientPhoto,
}: {
  rental: Rental;
  clientName: string | null;
  clientPhone: string | null;
  clientPhoto: string | null;
}) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-gradient-to-br from-blue-soft/40 to-surface-soft/60 p-3">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-surface ring-2 ring-white shadow-sm">
        {clientPhoto ? (
          <img
            src={clientPhoto}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-blue-soft/60">
            <UserRound size={32} className="text-blue-600/70" strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="text-[14px] font-bold text-ink truncate">
          {clientName ?? `Клиент #${rental.clientId}`}
        </div>
        {clientPhone && (
          <div className="text-[12px] text-ink-2 tabular-nums">
            {clientPhone}
          </div>
        )}
        <div className="flex items-center gap-2 text-[11px] text-muted-2">
          <span>{rental.start} — {rental.endPlanned}</span>
          <span>·</span>
          <span>{rental.days} дн</span>
          <span>·</span>
          <span className="font-semibold text-ink-2 tabular-nums">
            {fmt(rental.sum)} ₽
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * v0.4.63: карточка позиции для приёма возврата. Два состояния:
 * 'ok' (зелёный) или 'problem' (оранжевый). До выбора — нейтральный фон.
 *
 * UX: вся карточка кликабельна. Внутри — фото позиции (или fallback-иконка),
 * заголовок/подзаголовок, и две большие pill-кнопки «Без ущерба» / «Есть ущерб».
 * Если выбрано «Есть ущерб» — под пиллами показывается выбранная позиция
 * прайса с кнопкой «изменить».
 */
function ReturnItemCard({
  title,
  subtitle,
  imageUrl,
  fallbackIcon,
  state,
  damageInfo,
  onSetOk,
  onSetProblem,
  onEditProblem,
}: {
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  fallbackIcon: "scooter" | "equipment";
  state?: "ok" | "problem";
  damageInfo?: string;
  onSetOk: () => void;
  onSetProblem: () => void;
  onEditProblem?: () => void;
}) {
  const tone =
    state === "ok"
      ? "border-emerald-400 ring-1 ring-emerald-200/60 bg-emerald-50/40"
      : state === "problem"
        ? "border-orange-400 ring-1 ring-orange-200/60 bg-orange-soft/30"
        : "border-border bg-surface hover:border-blue-300";
  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-all",
        tone,
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1",
            state === "ok"
              ? "ring-emerald-200 bg-emerald-50"
              : state === "problem"
                ? "ring-orange-200 bg-orange-soft/40"
                : "ring-border bg-surface-soft",
          )}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-contain" />
          ) : fallbackIcon === "scooter" ? (
            <Bike size={26} className="text-muted-2" strokeWidth={1.5} />
          ) : (
            <ImageIcon size={22} className="text-muted-2" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink truncate leading-tight">
            {title}
          </div>
          {subtitle && (
            <div className="text-[11px] text-muted-2 truncate">{subtitle}</div>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onSetOk}
          className={cn(
            "h-9 flex-1 rounded-lg border text-[12.5px] font-semibold transition-colors",
            state === "ok"
              ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
              : "border-border bg-surface text-ink-2 hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700",
          )}
        >
          Без ущерба
        </button>
        <button
          type="button"
          onClick={onSetProblem}
          className={cn(
            "h-9 flex-1 rounded-lg border text-[12.5px] font-semibold transition-colors",
            state === "problem"
              ? "border-orange-500 bg-orange-500 text-white shadow-sm"
              : "border-border bg-surface text-ink-2 hover:border-orange-400 hover:bg-orange-soft/40 hover:text-orange-700",
          )}
        >
          Есть ущерб
        </button>
      </div>
      {state === "problem" && damageInfo && (
        <button
          type="button"
          onClick={onEditProblem}
          className="mt-2.5 flex w-full items-center justify-between rounded-lg bg-orange-soft/50 px-3 py-2 text-[12px] text-orange-ink hover:bg-orange-soft/80"
        >
          <span className="truncate font-semibold">{damageInfo}</span>
          <span className="ml-2 shrink-0 text-[11px] underline">изменить</span>
        </button>
      )}
    </div>
  );
}

/**
 * v0.4.62: модалка-пикер позиции из прайс-листа (группа «Экипировка»)
 * для фиксации ущерба по конкретной экипировке. Также позволяет
 * добавить «свой вариант» (название + сумма).
 */
function EquipmentDamagePicker({
  presetName,
  onPick,
  onClose,
}: {
  presetName: string | null;
  onPick: (d: {
    name: string;
    amount: number;
    itemId?: number;
    isCustom: boolean;
  }) => void;
  onClose: () => void;
}) {
  const groupsQ = useApiPriceList();
  const groups = groupsQ.data ?? [];
  const equipGroup = groups.find(
    (g) => g.name.toLowerCase().includes("экипировк"),
  );
  const items = equipGroup?.items ?? [];
  const [customName, setCustomName] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-ink/55 p-6 backdrop-blur-sm animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] overflow-hidden rounded-2xl bg-surface shadow-card-lg animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
            Что с {presetName ? `«${presetName}»` : "экипировкой"}?
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2 mb-2">
            Позиции прайса
          </div>
          {items.length === 0 ? (
            <div className="py-2 text-[12px] text-muted-2">
              Прайс-лист пуст или группа «Экипировка» не найдена. Используй
              «свой вариант» ниже.
            </div>
          ) : (
            <div className="space-y-1">
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() =>
                    onPick({
                      name: it.name,
                      amount: it.priceA ?? 0,
                      itemId: it.id,
                      isCustom: false,
                    })
                  }
                  className="flex w-full items-center justify-between rounded-[8px] border border-border bg-surface px-3 py-2 text-[13px] hover:border-blue-600 hover:bg-blue-soft"
                >
                  <span className="truncate text-left">{it.name}</span>
                  <span className="tabular-nums font-semibold text-ink shrink-0 ml-2">
                    {(it.priceA ?? 0).toLocaleString("ru-RU")} ₽
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 border-t border-border pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2 mb-2">
              Свой вариант
            </div>
            <div className="space-y-2">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Например: разбит визор шлема"
                className="h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] outline-none focus:border-blue-600"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="Сумма ₽"
                  className="h-9 w-32 rounded-[10px] border border-border bg-surface px-3 text-[13px] tabular-nums outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  disabled={
                    !customName.trim() || !(Number(customAmount) > 0)
                  }
                  onClick={() =>
                    onPick({
                      name: customName.trim(),
                      amount: Math.floor(Number(customAmount)),
                      isCustom: true,
                    })
                  }
                  className="h-9 flex-1 rounded-[10px] bg-blue-600 text-white text-[13px] font-semibold disabled:opacity-40"
                >
                  Применить
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * v0.4.57: подсказка о серии продлений в шапке окна «Завершить аренду».
 * Берёт events из activity_log и считает action='extended' /
 * 'rental_extended' / 'extension'. Если 0 — ничего не рисует.
 *
 * Зачем: до v0.4.57 продления плодили child rentals с parentRentalId,
 * сейчас inplace — но у одной аренды может быть N продлений, и
 * оператор перед завершением должен видеть «3 продления, серия 22 дн».
 */
function RentalExtensionsHint({ rentalId }: { rentalId: number }) {
  const q = useActivityTimeline("rental", rentalId, 200);
  const items = q.data?.items ?? [];
  const extensions = items.filter(
    (e) =>
      e.action === "extended" ||
      e.action === "rental_extended" ||
      e.action === "extension",
  );
  if (extensions.length === 0) return null;
  return (
    <div className="mt-1.5 text-[11px] text-muted-2">
      Продлений в этой аренде: <b className="text-ink">{extensions.length}</b>
      {" — "}
      <span title={extensions.map((e) => e.summary).join("\n")}>
        история в табе «История»
      </span>
    </div>
  );
}

/**
 * v0.4.57: ссылка-кнопка «Превью акта возврата» в шапке окна
 * «Завершить аренду». Открывает DocumentPreviewModal с шаблоном
 * act_return — оператор может проверить документ перед нажатием
 * «Завершить» и не зависит от того что сейчас в БД (документ
 * рендерится по живым данным).
 */
function ReturnDocPreviewLink({ rentalId }: { rentalId: number }) {
  const [open, setOpen] = useState(false);
  const base = window.location.origin.includes("localhost")
    ? "http://localhost:4000"
    : window.location.origin.replace("crm.", "api.");
  const htmlUrl = `${base}/api/rentals/${rentalId}/document/act_return?format=html`;
  const docxUrl = `${base}/api/rentals/${rentalId}/document/act_return?format=docx`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-soft/40 px-3 py-2 text-[12.5px] font-semibold text-blue-600 hover:bg-blue-soft/80"
      >
        <FileText size={14} />
        Превью акта возврата
      </button>
      {open && (
        <DocumentPreviewModal
          title="Акт возврата (предпросмотр)"
          htmlUrl={htmlUrl}
          docxUrl={docxUrl}
          docxFilename={`act_return_${rentalId}.docx`}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
