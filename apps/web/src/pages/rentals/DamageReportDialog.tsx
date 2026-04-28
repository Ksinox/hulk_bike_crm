import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Search,
  Plus,
  Minus,
  Trash2,
  X,
  Wrench,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type Rental } from "@/lib/mock/rentals";
import { toast } from "@/lib/toast";
import {
  type ApiPriceGroup,
  type ApiPriceItem,
  useApiPriceList,
} from "@/lib/api/price-list";
import {
  useCreateDamageReport,
  type CreateDamageItem,
} from "@/lib/api/damage-reports";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useApiClients } from "@/lib/api/clients";

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

type Selected = CreateDamageItem & {
  /** uid внутри корзины — позиция прейскуранта может выбираться несколько раз */
  uid: string;
};

/**
 * Модалка фиксации ущерба по аренде.
 *  - Слева: группы прейскуранта (свернутые карточки), фильтр по модели,
 *    поиск по позициям. По клику на позицию она улетает в «выбранные».
 *  - Справа: «Выбранные позиции» с кол-вом, переопределяемой ценой,
 *    обязательным комментарием, авто-итогом, зачётом залога.
 *  - При сохранении: создаётся damage_report, аренда → completed_damage,
 *    скутер (опц.) → repair, открывается превью документа для печати.
 */
export function DamageReportDialog({
  rental,
  onClose,
  onCreated,
}: {
  rental: Rental;
  onClose: () => void;
  onCreated?: (reportId: number) => void;
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

  // Найдём modelId аренды через скутер + список моделей.
  const scooters = useApiScooters();
  const scooter = scooters.data?.find((s) => s.id === rental.scooterId);
  const scooterModelId = scooter?.modelId ?? null;
  const models = useApiScooterModels();
  const modelName =
    models.data?.find((m) => m.id === scooterModelId)?.name ?? null;
  const clients = useApiClients();
  const clientName =
    clients.data?.find((c) => c.id === rental.clientId)?.name ?? "—";

  const list = useApiPriceList();

  // Если у аренды модель есть, но в прейскуранте для неё нет своей группы
  // «Детали», предлагаем выбрать «по какому прайсу считать» из существующих
  // моделей-аналогов.
  const [fallbackModelId, setFallbackModelId] = useState<number | null>(null);
  const groups = list.data ?? [];
  const ownGroups = groups.filter(
    (g) => g.scooterModelId != null && g.scooterModelId === scooterModelId,
  );
  const fallbackGroups =
    fallbackModelId != null
      ? groups.filter((g) => g.scooterModelId === fallbackModelId)
      : [];
  const generalGroups = groups.filter((g) => g.scooterModelId == null);
  const otherModelGroups = groups.filter(
    (g) =>
      g.scooterModelId != null &&
      g.scooterModelId !== scooterModelId &&
      g.scooterModelId !== fallbackModelId,
  );
  const needsFallback =
    scooterModelId != null && ownGroups.length === 0 && otherModelGroups.length > 0;

  const visibleGroups = [
    ...ownGroups,
    ...fallbackGroups,
    ...generalGroups,
  ];

  const [openGroups, setOpenGroups] = useState<Set<number>>(new Set());
  useEffect(() => {
    // По умолчанию раскроем модельные/fallback группы.
    setOpenGroups(
      new Set([...ownGroups, ...fallbackGroups].map((g) => g.id)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, fallbackModelId, scooterModelId]);

  const [search, setSearch] = useState("");
  const searchLower = search.trim().toLowerCase();

  const matchItem = (it: ApiPriceItem) =>
    !searchLower || it.name.toLowerCase().includes(searchLower);

  // === Корзина «выбранных позиций» ===
  const [selected, setSelected] = useState<Selected[]>([]);

  const addItem = (g: ApiPriceGroup, it: ApiPriceItem) => {
    // Для legacy двух-колоночных групп берём приоритетно цену по модели аренды.
    const useB =
      g.hasTwoPrices &&
      modelName &&
      modelName.toLowerCase().includes("jog");
    const price = useB ? it.priceB ?? it.priceA ?? 0 : it.priceA ?? it.priceB ?? 0;
    const uid = `${it.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setSelected((prev) => [
      ...prev,
      {
        uid,
        priceItemId: it.id,
        name: it.name,
        originalPrice: price,
        finalPrice: price,
        quantity: 1,
        comment: "",
      },
    ]);
  };

  const removeUid = (uid: string) =>
    setSelected((p) => p.filter((s) => s.uid !== uid));

  const patchSel = (uid: string, patch: Partial<Selected>) =>
    setSelected((p) =>
      p.map((s) => (s.uid === uid ? { ...s, ...patch } : s)),
    );

  const total = selected.reduce(
    (s, it) => s + it.finalPrice * it.quantity,
    0,
  );

  // === Зачёт из залога ===
  const depositMax = Math.min(rental.deposit ?? 0, total);
  const [depositCovered, setDepositCovered] = useState(0);
  useEffect(() => {
    // Если итог уменьшился ниже текущего зачёта — ужмём.
    setDepositCovered((c) => Math.min(c, depositMax));
  }, [depositMax]);
  const debt = Math.max(0, total - depositCovered);

  const [sendToRepair, setSendToRepair] = useState(true);
  const [note, setNote] = useState("");

  const create = useCreateDamageReport();

  // Минимальная валидация: должна быть выбрана хотя бы одна позиция.
  // Комментарии «где конкретно» опциональны — необязательно их заполнять,
  // чтобы создать акт.
  const valid = selected.length > 0;

  const onSubmit = async () => {
    if (!valid) {
      toast.error("Не выбрано ни одной позиции", "Кликните на позицию слева");
      return;
    }
    try {
      const created = await create.mutateAsync({
        rentalId: rental.id,
        items: selected.map((s) => ({
          priceItemId: s.priceItemId ?? null,
          name: s.name,
          originalPrice: s.originalPrice,
          finalPrice: s.finalPrice,
          quantity: s.quantity,
          comment: s.comment ?? null,
        })),
        depositCovered,
        note: note.trim() || null,
        sendScooterToRepair: sendToRepair,
      });
      toast.success(
        "Акт создан",
        `Сумма ${fmt(created.total)} ₽${
          sendToRepair ? ", скутер отправлен в ремонт" : ""
        }`,
      );
      onCreated?.(created.id);
      requestClose();
    } catch (e) {
      toast.error("Не удалось создать акт", (e as Error).message ?? "");
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[120] flex items-center justify-center bg-ink/55 p-4 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onClick={requestClose}
    >
      <div
        className={cn(
          "flex w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          "max-h-[92vh]",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <AlertTriangle size={18} className="text-amber-600" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink">
              Зафиксировать ущерб — аренда #
              {String(rental.id).padStart(4, "0")}
            </div>
            <div className="text-[12px] text-muted-2">
              {rental.scooter}
              {modelName ? ` · ${modelName}` : ""} · {clientName}
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {/* BODY */}
        <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[1.2fr_1fr]">
          {/* === Прейскурант (слева) === */}
          <div className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по позициям..."
                  className="h-9 w-full rounded-[10px] border border-border bg-surface pl-9 pr-3 text-[13px] outline-none focus:border-blue-600"
                />
              </div>
              {needsFallback && (
                <div className="mt-2 rounded-[10px] bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  <div className="font-semibold">
                    По какому прайсу считать «Детали»?
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {Array.from(
                      new Set(
                        otherModelGroups
                          .map((g) => g.scooterModelId)
                          .filter((x): x is number => x != null),
                      ),
                    ).map((mid) => {
                      const m = models.data?.find((x) => x.id === mid);
                      if (!m) return null;
                      return (
                        <button
                          key={mid}
                          type="button"
                          onClick={() => setFallbackModelId(mid)}
                          className={cn(
                            "rounded-[8px] border border-border bg-white px-2 py-1 text-[12px] font-semibold hover:border-amber-400",
                            fallbackModelId === mid &&
                              "border-amber-500 bg-amber-100",
                          )}
                        >
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {list.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-muted-2">
                  <Loader2 size={14} className="animate-spin" /> Загружаем…
                </div>
              ) : visibleGroups.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-border p-6 text-center text-[12px] text-muted-2">
                  Прейскурант пуст. Заполните его в «Документы → Прейскурант».
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {visibleGroups.map((g) => {
                    const isOpen = openGroups.has(g.id);
                    const items = g.items.filter(matchItem);
                    if (searchLower && items.length === 0) return null;
                    const linkedModel =
                      g.scooterModelId != null
                        ? models.data?.find((m) => m.id === g.scooterModelId)
                        : null;
                    return (
                      <div
                        key={g.id}
                        className="overflow-hidden rounded-[12px] border border-border"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOpenGroups((s) => {
                              const next = new Set(s);
                              if (next.has(g.id)) next.delete(g.id);
                              else next.add(g.id);
                              return next;
                            })
                          }
                          className="flex w-full items-center gap-2 bg-surface-soft px-3 py-2 text-left hover:bg-blue-50"
                        >
                          {isOpen || searchLower ? (
                            <ChevronDown size={14} className="text-muted-2" />
                          ) : (
                            <ChevronRight size={14} className="text-muted-2" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold text-ink">
                              {g.name}
                            </div>
                            <div className="text-[10px] text-muted-2">
                              {linkedModel
                                ? `модель: ${linkedModel.name}`
                                : "общая"}{" "}
                              · {g.items.length} поз.
                            </div>
                          </div>
                        </button>
                        {(isOpen || searchLower) && (
                          <div className="divide-y divide-border">
                            {items.map((it) => {
                              const useB =
                                g.hasTwoPrices &&
                                modelName?.toLowerCase().includes("jog");
                              const price = useB
                                ? it.priceB
                                : it.priceA ?? it.priceB;
                              return (
                                <button
                                  key={it.id}
                                  type="button"
                                  onClick={() => addItem(g, it)}
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-blue-50"
                                >
                                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                                    {it.name}
                                  </span>
                                  <span className="text-[12px] font-semibold tabular-nums text-ink">
                                    {price == null ? "—" : `${fmt(price)} ₽`}
                                  </span>
                                  <Plus
                                    size={12}
                                    className="text-blue-600"
                                  />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* === Выбранные позиции (справа) === */}
          <div className="flex min-h-0 flex-col">
            <div className="border-b border-border px-4 py-2 text-[13px] font-semibold text-ink">
              Выбранные позиции ({selected.length})
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {selected.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-border p-6 text-center text-[12px] text-muted-2">
                  Нажмите на позиции слева, чтобы добавить их в акт.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {selected.map((s) => {
                    const discounted = s.finalPrice < s.originalPrice;
                    const discountPct =
                      s.originalPrice > 0 && discounted
                        ? Math.round(
                            ((s.originalPrice - s.finalPrice) /
                              s.originalPrice) *
                              100,
                          )
                        : 0;
                    return (
                      <div
                        key={s.uid}
                        className="rounded-[10px] border border-border bg-surface p-2"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold text-ink">
                              {s.name}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeUid(s.uid)}
                            className="rounded-[6px] p-1 text-muted-2 hover:bg-red-soft hover:text-red-600"
                            title="Убрать"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="mt-1.5 grid grid-cols-[auto_1fr_1fr] items-center gap-1.5">
                          {/* Qty */}
                          <div className="flex items-center gap-1 rounded-[8px] border border-border bg-white px-1">
                            <button
                              type="button"
                              onClick={() =>
                                patchSel(s.uid, {
                                  quantity: Math.max(1, s.quantity - 1),
                                })
                              }
                              className="rounded-[6px] p-0.5 text-muted-2 hover:bg-surface-soft hover:text-ink"
                            >
                              <Minus size={10} />
                            </button>
                            <span className="min-w-[20px] text-center text-[12px] tabular-nums">
                              {s.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                patchSel(s.uid, {
                                  quantity: s.quantity + 1,
                                })
                              }
                              className="rounded-[6px] p-0.5 text-muted-2 hover:bg-surface-soft hover:text-ink"
                            >
                              <Plus size={10} />
                            </button>
                          </div>
                          {/* Price */}
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={s.finalPrice}
                              onChange={(e) =>
                                patchSel(s.uid, {
                                  finalPrice: Math.max(
                                    0,
                                    Number(e.target.value) || 0,
                                  ),
                                })
                              }
                              className="w-full rounded-[8px] border border-border bg-white px-2 py-1 text-right text-[12px] tabular-nums"
                            />
                            <span className="text-[10px] text-muted-2">₽</span>
                          </div>
                          {/* Sum */}
                          <div className="text-right text-[13px] font-bold tabular-nums text-ink">
                            {fmt(s.finalPrice * s.quantity)} ₽
                          </div>
                        </div>
                        {discounted && (
                          <div className="mt-1 flex items-center gap-2 text-[11px]">
                            <span className="line-through text-muted-2 tabular-nums">
                              {fmt(s.originalPrice)} ₽
                            </span>
                            <span className="rounded-full bg-green-soft px-1.5 py-0.5 font-bold uppercase tracking-wider text-green-700">
                              −{discountPct}% скидка
                            </span>
                          </div>
                        )}
                        <input
                          value={s.comment ?? ""}
                          onChange={(e) =>
                            patchSel(s.uid, { comment: e.target.value })
                          }
                          placeholder="Где конкретно повреждение (необязательно)"
                          className="mt-1.5 w-full rounded-[8px] border border-border bg-white px-2 py-1 text-[12px] outline-none focus:border-blue-600"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* === Итог + параметры === */}
            <div className="flex flex-col gap-2 border-t border-border bg-surface-soft px-4 py-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-2">Итого по акту</span>
                <span className="font-bold tabular-nums text-ink">
                  {fmt(total)} ₽
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span className="text-muted-2">
                  Зачесть из залога (макс {fmt(rental.deposit ?? 0)} ₽)
                </span>
                <input
                  type="number"
                  min={0}
                  max={depositMax}
                  value={depositCovered}
                  onChange={(e) =>
                    setDepositCovered(
                      Math.max(
                        0,
                        Math.min(depositMax, Number(e.target.value) || 0),
                      ),
                    )
                  }
                  className="w-[100px] rounded-[8px] border border-border bg-white px-2 py-1 text-right text-[13px] tabular-nums"
                />
              </div>
              <div className="flex items-center justify-between text-[14px] font-bold">
                <span className="text-ink">К доплате (долг)</span>
                <span
                  className={cn(
                    "tabular-nums",
                    debt > 0 ? "text-red-600" : "text-green-600",
                  )}
                >
                  {fmt(debt)} ₽
                </span>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Комментарий к акту (необязательно)"
                rows={2}
                className="rounded-[8px] border border-border bg-white px-2 py-1 text-[12px] outline-none focus:border-blue-600"
              />
              <label className="inline-flex items-center gap-2 text-[12px] text-ink-2">
                <input
                  type="checkbox"
                  checked={sendToRepair}
                  onChange={(e) => setSendToRepair(e.target.checked)}
                />
                <Wrench size={12} className="text-muted-2" />
                Отправить скутер в ремонт после сохранения
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-[10px] bg-surface-soft px-4 py-2 text-[13px] font-semibold text-ink-2 hover:bg-surface"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!valid || create.isPending}
                onClick={onSubmit}
                className="rounded-[10px] bg-red-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {create.isPending ? "Сохраняем…" : "Создать акт о повреждениях"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
