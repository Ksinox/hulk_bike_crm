import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ChevronRight,
  Link2,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast, confirmDialog } from "@/lib/toast";
import {
  patchRental,
  getRentalChainIds,
  useRentals,
  useArchivedRentals,
  useChainPayments,
} from "./rentalsStore";
import {
  useApiScooterSwaps,
  useDeleteRental,
  useDeleteScooterSwap,
} from "@/lib/api/rentals";
import { useApiScooters } from "@/lib/api/scooters";
import type { Rental } from "@/lib/mock/rentals";

/** Унифицированный пункт «замена скутера» в модалке. Объединяет два
 *  источника: legacy-связку с другим scooterId vs предка и запись
 *  in-place свапа из scooter_swaps. */
type SwapItem = {
  kind: "rental" | "swap";
  id: number;
  prevScooterId: number | null;
  newScooterId: number;
  reason: string | null;
  swapAt: string;
  feeAmount: number;
};

/**
 * Редактирование существующей аренды + связок (продлений).
 *
 * Если у аренды есть цепочка (parent + child-продления), сверху появляется
 * список «связок». Можно переключаться между ними — форма ниже редактирует
 * выбранную связку. Каждую связку можно удалить, если у неё нет более
 * поздних продлений (иначе нарушится цепочка).
 */
export function RentalEditModal({
  rental,
  onClose,
}: {
  rental: Rental;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
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

  // === Цепочка продлений ===
  const activeRentals = useRentals();
  const archivedRentals = useArchivedRentals();
  const allRentals = useMemo(
    () => [...activeRentals, ...archivedRentals],
    [activeRentals, archivedRentals],
  );
  const chainIds = useMemo(
    () => getRentalChainIds(rental.id, allRentals),
    [rental.id, allRentals],
  );
  const chainRentals = useMemo(
    () =>
      chainIds
        .map((id) => allRentals.find((r) => r.id === id))
        .filter((r): r is Rental => !!r)
        // Скрываем вручную удалённые связки (archivedBy != null).
        // Авто-архивные родители при продлении (archivedBy == null) остаются.
        .filter((r) => !r.archivedBy),
    [chainIds, allRentals],
  );
  const hasChain = chainRentals.length > 1;

  // Сводные метрики по живым связкам — для отображения в шапке модалки.
  // При сохранении/удалении они обновляются реактивно через react-query.
  const liveChainIds = useMemo(
    () => chainRentals.map((r) => r.id),
    [chainRentals],
  );
  const chainPays = useChainPayments(liveChainIds);
  const chainDays = chainRentals.reduce((s, r) => s + (r.days || 0), 0);
  const chainSum = chainRentals.reduce((s, r) => s + (r.sum || 0), 0);
  const chainPaid = chainPays
    .filter((p) => p.paid && p.type !== "refund" && p.type !== "deposit")
    .reduce((s, p) => s + p.amount, 0);

  // Текущая связка для редактирования
  const [currentId, setCurrentId] = useState<number>(rental.id);
  const currentRental =
    chainRentals.find((r) => r.id === currentId) ?? rental;

  const deleteRental = useDeleteRental();
  // История in-place замен скутера для этой аренды (свапы пишутся
  // в scooter_swaps после рефакторинга /swap-scooter). Их нужно
  // показать в модалке отдельной секцией, чтобы можно было синхронно
  // с карточкой удалить лишние замены.
  const swapsQ = useApiScooterSwaps(rental.id);
  const swaps = swapsQ.data ?? [];
  const { data: apiScooters = [] } = useApiScooters();
  const deleteSwap = useDeleteScooterSwap();

  /** Это «базовая» (корневая) связка цепочки? — её удалять нельзя. */
  const isRootSegment = (seg: Rental): boolean =>
    seg.parentRentalId == null;

  /**
   * Замена скутера vs обычное продление. Раньше определяли по тексту
   * note ("замена скутера: ..." vs "продление ..."), но в legacy
   * данных встречалось расхождение: scooterId фактически менялся, а
   * note был "продление" — модалка считала это продлением, хотя в
   * блоке «Ранее в этой аренде» (вкладка Условия) логика считала
   * замену по фактическому scooterId. Из-за этого UI рассинхронился.
   *
   * Теперь — единая логика: ЗАМЕНА = scooterId отличается от предка
   * в цепочке. Если scooter тот же — продление. Опираемся на factual
   * data, а не на маркер в note.
   */
  const isSwap = (seg: Rental): boolean => {
    if (seg.parentRentalId == null) return false;
    const parent = allRentals.find((r) => r.id === seg.parentRentalId);
    if (!parent) return /замена скутера/i.test(seg.note ?? "");
    return parent.scooterId !== seg.scooterId;
  };

  const onDeleteSwap = async (swapId: number) => {
    const ok = await confirmDialog({
      title: "Удалить запись о замене?",
      message:
        "Запись из истории замен скутера будет удалена. Текущий скутер аренды не изменится — это очистка истории. Документы (акт замены) после этого тоже не увидят эту запись.",
      confirmText: "Удалить",
      cancelText: "Отмена",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteSwap.mutateAsync(swapId);
      toast.success("Запись о замене удалена", "");
    } catch (e) {
      toast.error("Не удалось удалить", (e as Error).message ?? "");
    }
  };

  // Множественный выбор для batch-удаления продлений и замен.
  // Ключ: "rental:N" — id связки, "swap:N" — id записи scooter_swaps.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const clearSelection = () => setSelectedKeys(new Set());

  /**
   * Массовое удаление выбранных продлений и замен.
   * Выполняется ПОСЛЕДОВАТЕЛЬНО — чтобы revert логика DELETE
   * /scooter-swaps работала корректно (она опирается на «последняя ли
   * запись» — при параллельных запросах будет race condition).
   * Связки (rentals) удаляются после свапов: меньше шансов потерять
   * head-связку до возрождения родителя.
   */
  const bulkDelete = async () => {
    const keys = [...selectedKeys];
    if (keys.length === 0) return;
    const ok = await confirmDialog({
      title: `Удалить выбранные (${keys.length})?`,
      message:
        "Выбранные связки и записи о заменах будут удалены. Связки уйдут в архив, замены отменят возврат скутера. Операция применится последовательно.",
      confirmText: "Удалить",
      cancelText: "Отмена",
      danger: true,
    });
    if (!ok) return;
    const swapIds = keys
      .filter((k) => k.startsWith("swap:"))
      .map((k) => Number(k.slice("swap:".length)));
    const rentalIds = keys
      .filter((k) => k.startsWith("rental:"))
      .map((k) => Number(k.slice("rental:".length)));

    let failed = 0;
    // Сначала свапы — у них есть revert, удаляем последовательно
    // от новых к старым (чтобы каждое удаление было «последним»).
    const swapIdsOrdered = [...swapIds].sort((a, b) => b - a);
    for (const sid of swapIdsOrdered) {
      try {
        await deleteSwap.mutateAsync(sid);
      } catch {
        failed++;
      }
    }
    // Потом связки — от head к корню (по убыванию id).
    const rentalIdsOrdered = [...rentalIds].sort((a, b) => b - a);
    for (const rid of rentalIdsOrdered) {
      try {
        await deleteRental.mutateAsync(rid);
      } catch {
        failed++;
      }
    }
    clearSelection();
    if (failed > 0) {
      toast.error(
        "Удалено частично",
        `Не удалось удалить ${failed} элементов из ${keys.length}.`,
      );
    } else {
      toast.success(
        "Удалено",
        `Снято ${keys.length} ${keys.length === 1 ? "элемент" : "элементов"}.`,
      );
    }
  };

  const onDeleteSegment = async (segId: number) => {
    const seg = chainRentals.find((r) => r.id === segId);
    if (seg && isRootSegment(seg)) {
      toast.error(
        "Нельзя удалить базовую",
        "Базовую связку удалить нельзя — на ней держится вся цепочка. Удалите аренду целиком через меню «Действия» или используйте «Очистить все действия».",
      );
      return;
    }
    const ok = await confirmDialog({
      title: "Удалить связку?",
      message: `Связка #${String(segId).padStart(4, "0")} будет перемещена в архив. Её потомки переподцепятся к предыдущей связке цепочки.`,
      confirmText: "Удалить",
      cancelText: "Отмена",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRental.mutateAsync(segId);
      toast.success("Связка удалена", `#${String(segId).padStart(4, "0")}`);
      // Если удалили текущую — переключимся на ближайшего ПРЕДКА в
      // цепочке (parentRentalId), а не закрываем модалку. Так оператор
      // продолжает работать с теми же данными.
      if (segId === currentId) {
        const removed = chainRentals.find((r) => r.id === segId);
        const parentId = removed?.parentRentalId ?? null;
        const remaining = chainRentals.filter((r) => r.id !== segId);
        const nextActive =
          (parentId != null && remaining.find((r) => r.id === parentId)) ||
          remaining[remaining.length - 1] ||
          null;
        if (nextActive) {
          setCurrentId(nextActive.id);
        } else {
          requestClose();
        }
      }
    } catch (e) {
      toast.error("Не удалось удалить", (e as Error).message ?? "");
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/55 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onClick={requestClose}
    >
      <div
        className={cn(
          "mt-12 w-full max-w-[560px] overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-soft px-5 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              Изменить аренду
            </div>
            <div className="text-[15px] font-bold text-ink">
              Аренда #{String(rental.id).padStart(4, "0")}
              {hasChain && (
                <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                  серия из {chainRentals.length}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {/* Сводка по серии — обновляется на лету при правке/удалении связок. */}
        <div className="grid grid-cols-3 gap-2 border-b border-border bg-white px-5 py-3 text-center">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
              За всё время
            </div>
            <div className="font-display text-[18px] font-extrabold tabular-nums text-blue-600">
              {chainPaid.toLocaleString("ru-RU")} ₽
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
              Дней в серии
            </div>
            <div className="font-display text-[18px] font-extrabold tabular-nums text-ink">
              {chainDays}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
              План аренды
            </div>
            <div className="font-display text-[18px] font-extrabold tabular-nums text-ink">
              {chainSum.toLocaleString("ru-RU")} ₽
            </div>
          </div>
        </div>

        {/* Bulk-actions bar — появляется когда что-то выбрано чекбоксами. */}
        {selectedKeys.size > 0 && (
          <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2 text-[12px]">
            <span className="font-semibold text-amber-900">
              Выбрано: {selectedKeys.size}
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-amber-800 underline hover:text-amber-900"
            >
              сбросить
            </button>
            <button
              type="button"
              onClick={bulkDelete}
              disabled={deleteRental.isPending || deleteSwap.isPending}
              className="ml-auto inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 size={12} /> Удалить выбранные
            </button>
          </div>
        )}

        {hasChain && (
          <div className="border-b border-border bg-surface-soft/50 px-5 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
              <Link2 size={12} /> Связки серии (продления)
            </div>
            <div className="flex flex-col gap-1">
              {(() => {
                // В этой секции только настоящие продления (scooterId
                // не менялся) + базовая. Замены (legacy и in-place)
                // ниже в общей секции «Замены скутера».
                const ordered = chainRentals.filter(
                  (seg) => isRootSegment(seg) || !isSwap(seg),
                );
                let extIdx = 0;
                return ordered.map((seg) => {
                  const isActive = seg.id === currentId;
                  const isRoot = isRootSegment(seg);
                  if (!isRoot) extIdx++;
                  const label = isRoot ? "Базовая" : `Продл. ${extIdx}`;
                  const tone = isRoot
                    ? "bg-green-soft text-green-ink"
                    : "bg-purple-soft text-purple-ink";
                  const checkKey = `rental:${seg.id}`;
                  const checked = selectedKeys.has(checkKey);
                  return (
                    <div
                      key={seg.id}
                      className={cn(
                        "group flex items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-[12px]",
                        isActive
                          ? "border-blue-500 bg-blue-50"
                          : "border-border bg-white hover:border-blue-300",
                      )}
                    >
                      {!isRoot && (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleKey(checkKey)}
                          title="Отметить для массового удаления"
                          className="h-3.5 w-3.5 cursor-pointer accent-red-600"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setCurrentId(seg.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                            tone,
                          )}
                        >
                          {label}
                        </span>
                        <span className="font-mono font-semibold text-ink">
                          #{String(seg.id).padStart(4, "0")}
                        </span>
                        <span className="text-muted-2">
                          {seg.start.slice(0, 5)} → {seg.endPlanned.slice(0, 5)}
                        </span>
                        <span className="text-muted-2">· {seg.days} дн</span>
                        <span className="ml-auto font-semibold tabular-nums text-ink">
                          {seg.sum.toLocaleString("ru-RU")} ₽
                        </span>
                        {isActive && (
                          <ChevronRight size={12} className="text-blue-600" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSegment(seg.id)}
                        disabled={isRoot || deleteRental.isPending}
                        title={
                          isRoot
                            ? "Базовую связку удалить нельзя"
                            : "Удалить связку"
                        }
                        className={cn(
                          "rounded-[6px] p-1",
                          isRoot
                            ? "cursor-not-allowed text-muted-2 opacity-30"
                            : "text-muted-2 hover:bg-red-soft hover:text-red-600",
                        )}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
            <div className="mt-2 text-[11px] text-muted-2">
              Кликните по связке, чтобы её отредактировать. Чекбоксом
              отметьте несколько — для массового удаления.
            </div>
          </div>
        )}

        {(() => {
          // Объединённая секция «Замены скутера»:
          //  - legacy замены: связки цепочки, у которых scooterId
          //    отличается от scooterId предка (старая архитектура,
          //    где свап создавал child rental);
          //  - in-place замены: записи из таблицы scooter_swaps
          //    (новая архитектура).
          // Обе с одинаковым UI и checkbox для bulk-delete. Тип SwapItem
          // вынесен на module-scope (vite/babel плохо переваривает
          // локальные type-decl внутри JSX-IIFE).
          const legacyItems: SwapItem[] = chainRentals
            .filter((seg) => !isRootSegment(seg) && isSwap(seg))
            .map((seg) => {
              const parent = allRentals.find(
                (r) => r.id === seg.parentRentalId,
              );
              return {
                kind: "rental" as const,
                id: seg.id,
                prevScooterId: parent?.scooterId ?? null,
                newScooterId: seg.scooterId ?? 0,
                reason:
                  /замена скутера:\s*(.+)$/iu.exec(seg.note ?? "")?.[1] ??
                  null,
                swapAt: seg.start,
                feeAmount: 0,
              };
            });
          const inplaceItems: SwapItem[] = swaps.map((s) => ({
            kind: "swap" as const,
            id: s.id,
            prevScooterId: s.prevScooterId,
            newScooterId: s.newScooterId,
            reason: s.reason,
            swapAt: s.swapAt,
            feeAmount: s.feeAmount,
          }));
          const all = [...legacyItems, ...inplaceItems].sort((a, b) =>
            a.swapAt.localeCompare(b.swapAt),
          );
          if (all.length === 0) return null;
          return (
            <div className="border-b border-border bg-surface-soft/50 px-5 py-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
                <ArrowLeftRight size={12} /> Замены скутера ({all.length})
              </div>
              <div className="flex flex-col gap-1">
                {all.map((it) => {
                  const prev = apiScooters.find(
                    (s) => s.id === it.prevScooterId,
                  );
                  const next = apiScooters.find(
                    (s) => s.id === it.newScooterId,
                  );
                  const dtSrc = it.swapAt;
                  const dt = /^\d{2}\.\d{2}\.\d{4}$/.test(dtSrc)
                    ? dtSrc
                    : (() => {
                        const d = new Date(dtSrc);
                        return Number.isNaN(d.getTime())
                          ? dtSrc
                          : `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
                      })();
                  const checkKey = `${it.kind}:${it.id}`;
                  const checked = selectedKeys.has(checkKey);
                  const onClickDelete = () => {
                    if (it.kind === "swap") {
                      onDeleteSwap(it.id);
                    } else {
                      onDeleteSegment(it.id);
                    }
                  };
                  return (
                    <div
                      key={`${it.kind}-${it.id}`}
                      className="group flex items-center gap-2 rounded-[10px] border border-border bg-white px-2.5 py-1.5 text-[12px]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleKey(checkKey)}
                        title="Отметить для массового удаления"
                        className="h-3.5 w-3.5 cursor-pointer accent-red-600"
                      />
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                        Замена
                      </span>
                      <span className="font-semibold text-ink">
                        {prev?.name ?? `#${it.prevScooterId ?? "?"}`}
                      </span>
                      <span className="text-muted-2">→</span>
                      <span className="font-semibold text-ink">
                        {next?.name ?? `#${it.newScooterId}`}
                      </span>
                      {it.reason && (
                        <span
                          className="ml-1 truncate text-muted-2"
                          title={it.reason}
                        >
                          · {it.reason}
                        </span>
                      )}
                      <span className="ml-auto text-muted-2">{dt}</span>
                      {it.feeAmount > 0 && (
                        <span className="font-semibold tabular-nums text-amber-700">
                          +{it.feeAmount.toLocaleString("ru-RU")} ₽
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={onClickDelete}
                        disabled={
                          deleteSwap.isPending || deleteRental.isPending
                        }
                        title="Удалить замену"
                        className="rounded-[6px] p-1 text-muted-2 hover:bg-red-soft hover:text-red-600"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-[11px] text-muted-2">
                История замен скутера в этой аренде. Удаление чистит запись
                истории — для последней записи также возвращает предыдущий
                скутер на аренду.
              </div>
            </div>
          );
        })()}

        <RentalEditForm
          key={currentRental.id}
          rental={currentRental}
          // Если правим НЕ базовую связку — нижняя граница даты выдачи =
          // дата выдачи базовой. Базовую можно править свободно.
          minStartDate={
            currentRental.parentRentalId == null
              ? null
              : chainRentals[0]?.start ?? null
          }
          // После сохранения модалка НЕ закрывается — пользователь может
          // продолжить править эту связку или переключиться на другую.
          // Цифры в карточке аренды и в списке связок обновятся
          // автоматически через инвалидацию react-query.
          onSaved={() => {}}
          onCancel={requestClose}
        />
      </div>
    </div>
  );
}

/**
 * Внутренняя форма правки одной связки. Ключуется по rental.id чтобы
 * перемонтироваться (и сбросить локальное состояние) при смене связки.
 */
function RentalEditForm({
  rental,
  minStartDate,
  onSaved,
  onCancel,
}: {
  rental: Rental;
  /** Запрет ставить дату выдачи раньше указанной (формат ДД.ММ.ГГГГ).
   *  Используется для не-базовых связок: их дата выдачи не может быть
   *  раньше даты выдачи базовой связки цепочки. */
  minStartDate?: string | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  // Скутер сюда не подкручивается. Замена скутера — отдельный flow через
  // карточку «Условия» (кнопка «Заменить скутер»), который создаёт новую
  // связку. Здесь меняются только параметры: даты, тариф, дни, заметка.
  const [startDate, setStartDate] = useState(rental.start);
  const [startTime, setStartTime] = useState(rental.startTime ?? "14:00");
  const [endPlanned, setEndPlanned] = useState(rental.endPlanned);
  const [endTime, setEndTime] = useState(rental.startTime ?? "12:00");
  const [rate, setRate] = useState<number>(rental.rate);
  const initialDays =
    computeDaysBetween(rental.start, rental.endPlanned) ?? rental.days;
  const [days, setDays] = useState<number>(initialDays);
  const [note, setNote] = useState<string>(rental.note ?? "");
  const [saving, setSaving] = useState(false);

  const lastChanged = useRef<"dates" | "days" | "init">("init");

  useEffect(() => {
    if (lastChanged.current === "days") {
      lastChanged.current = "init";
      return;
    }
    const d = computeDaysBetween(startDate, endPlanned);
    if (d != null && d !== days) {
      lastChanged.current = "dates";
      setDays(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endPlanned]);

  useEffect(() => {
    if (lastChanged.current === "dates") {
      lastChanged.current = "init";
      return;
    }
    const newEnd = addDaysToDDMMYYYY(startDate, days);
    if (newEnd && newEnd !== endPlanned) {
      lastChanged.current = "days";
      setEndPlanned(newEnd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const dirty =
    startDate !== rental.start ||
    startTime !== (rental.startTime ?? "14:00") ||
    endPlanned !== rental.endPlanned ||
    rate !== rental.rate ||
    days !== rental.days ||
    rate * days !== rental.sum ||
    (note ?? "") !== (rental.note ?? "");

  // Проверка нижней границы даты выдачи (для не-базовых связок).
  const startTooEarly = (() => {
    if (!minStartDate) return false;
    const min = parseDDMMYYYY(minStartDate);
    const cur = parseDDMMYYYY(startDate);
    if (!min || !cur) return false;
    return cur.getTime() < min.getTime();
  })();

  const submit = async () => {
    if (saving) return;
    if (startTooEarly) {
      toast.error(
        "Дата выдачи слишком ранняя",
        `Не может быть раньше базовой связки (${minStartDate}). Если хотите сместить начало аренды — правьте базовую связку.`,
      );
      return;
    }
    setSaving(true);
    try {
      const newSum = rate * days;

      const patch: Partial<Rental> = {};
      if (startDate !== rental.start) patch.start = startDate;
      if (endPlanned !== rental.endPlanned) patch.endPlanned = endPlanned;
      if (rate !== rental.rate) patch.rate = rate;
      if (days !== rental.days) patch.days = days;
      if (newSum !== rental.sum) patch.sum = newSum;
      if ((note ?? "") !== (rental.note ?? "")) {
        patch.note = note.trim() || undefined;
      }
      patch.startTime = startTime;
      if (Object.keys(patch).length > 0) {
        patchRental(rental.id, patch);
      }

      toast.success(
        "Связка изменена",
        "Запись добавлена в журнал действий на дашборде.",
      );
      onSaved();
    } catch (e) {
      toast.error("Не удалось сохранить", (e as Error).message ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="rounded-[10px] bg-blue-50 px-3 py-2 text-[12px] text-blue-700">
          Замена скутера — отдельная операция. Откройте вкладку{" "}
          <b>«Условия»</b> и нажмите «Заменить скутер» рядом с карточкой
          скутера.
        </div>

        <div className="grid grid-cols-[1.3fr_1fr] gap-2">
          <Field label="Дата выдачи (ДД.ММ.ГГГГ)">
            <input
              type="text"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="22.04.2026"
              className={cn(
                "h-10 w-full rounded-[10px] border bg-white px-3 font-mono text-[14px] outline-none",
                startTooEarly
                  ? "border-red-500 focus:border-red-500"
                  : "border-border focus:border-blue",
              )}
            />
            {startTooEarly && (
              <div className="mt-1 text-[11px] text-red-600">
                Не раньше базовой связки ({minStartDate}).
              </div>
            )}
          </Field>
          <Field label="Время">
            <input
              type="text"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              placeholder="14:30"
              className="h-10 w-full rounded-[10px] border border-border bg-white px-3 font-mono text-[14px] outline-none focus:border-blue"
            />
          </Field>
        </div>

        <div className="grid grid-cols-[1.3fr_1fr] gap-2">
          <Field label="Плановый возврат (ДД.ММ.ГГГГ)">
            <input
              type="text"
              value={endPlanned}
              onChange={(e) => setEndPlanned(e.target.value)}
              placeholder="26.04.2026"
              className="h-10 w-full rounded-[10px] border border-border bg-white px-3 font-mono text-[14px] outline-none focus:border-blue"
            />
          </Field>
          <Field label="Время">
            <input
              type="text"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              placeholder="14:30"
              className="h-10 w-full rounded-[10px] border border-border bg-white px-3 font-mono text-[14px] outline-none focus:border-blue"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Тариф, ₽/сут">
            <input
              type="number"
              value={rate}
              onChange={(e) =>
                setRate(Math.max(0, Number(e.target.value) || 0))
              }
              className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none focus:border-blue"
            />
          </Field>
          <Field label="Дней">
            <input
              type="number"
              value={days}
              onChange={(e) =>
                setDays(Math.max(1, Number(e.target.value) || 1))
              }
              className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none focus:border-blue"
            />
          </Field>
        </div>

        <div className="rounded-[10px] bg-surface-soft px-3 py-2 text-[12px] text-muted">
          Новая сумма по этой связке:{" "}
          <b className="text-ink">
            {(rate * days).toLocaleString("ru-RU")} ₽
          </b>
        </div>

        <Field label="Заметка">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-[10px] border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-blue"
          />
        </Field>

        <div className="text-[11px] text-muted-2">
          Изменения фиксируются в журнале действий с указанием автора.
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border bg-surface-soft px-5 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full bg-surface px-4 py-2 text-[13px] font-semibold text-ink-2 hover:bg-border"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!dirty || saving || startTooEarly}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold transition-colors",
            !dirty || saving
              ? "cursor-not-allowed bg-surface text-muted-2"
              : "bg-ink text-white hover:bg-blue-600",
          )}
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Сохранить
        </button>
      </div>
    </>
  );
}

/** Парсит «DD.MM.YYYY» в Date или null если формат битый. */
function parseDDMMYYYY(s: string): Date | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (
    d.getFullYear() !== yyyy ||
    d.getMonth() !== mm - 1 ||
    d.getDate() !== dd
  ) {
    return null;
  }
  return d;
}

function fmtDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function computeDaysBetween(startStr: string, endStr: string): number | null {
  const s = parseDDMMYYYY(startStr);
  const e = parseDDMMYYYY(endStr);
  if (!s || !e) return null;
  const diff = Math.round((e.getTime() - s.getTime()) / 86_400_000);
  return diff > 0 ? diff : null;
}

function addDaysToDDMMYYYY(startStr: string, days: number): string | null {
  const s = parseDDMMYYYY(startStr);
  if (!s) return null;
  const e = new Date(s.getTime() + days * 86_400_000);
  return fmtDDMMYYYY(e);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </div>
      {children}
    </div>
  );
}
