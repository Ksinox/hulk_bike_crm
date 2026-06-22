import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Search,
  Plus,
  Minus,
  Trash2,
  Pencil,
  X,
  Wrench,
  Loader2,
  Camera,
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
  usePatchDamageReport,
  useUploadDamageMedia,
  useDeleteDamageMedia,
  type ApiDamageReport,
  type ApiDamageMedia,
  type CreateDamageItem,
} from "@/lib/api/damage-reports";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useApiClients } from "@/lib/api/clients";
import {
  DamageMediaCapture,
  analyzeFile,
  type StagedMedia,
} from "./DamageMediaCapture";
import { useIsMobile } from "@/lib/useIsMobile";
import { MobileNumPad } from "@/mobile/MobileNumPad";

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
/**
 * Позиция для предзаполнения корзины при открытии диалога из потока
 * «Завершить аренду → Есть ущерб». Совпадает по форме с CreateDamageItem.
 */
export type DamageSeedItem = {
  priceItemId?: number | null;
  name: string;
  originalPrice: number;
  finalPrice: number;
  quantity: number;
  comment?: string | null;
};

export function DamageReportDialog({
  rental,
  existing,
  seedItems,
  submitLabel,
  onClose,
  onCreated,
}: {
  rental: Rental;
  /** Существующий акт — если передан, диалог работает в режиме редактирования. */
  existing?: ApiDamageReport | null;
  /**
   * v0.8.34 (F2): предзаполнить корзину при создании нового акта. Используется
   * потоком завершения аренды «с ущербом» — оператор получает тот же
   * полноценный диалог (редактируемые суммы, зачёт залога, тумблер «в ремонт»),
   * что и при «Зафиксировать ущерб» на активной аренде.
   */
  seedItems?: DamageSeedItem[];
  /** v0.8.34: переопределить подпись кнопки подтверждения (для flow завершения). */
  submitLabel?: string;
  onClose: () => void;
  onCreated?: (reportId: number) => void;
}) {
  const isEdit = !!existing;
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

  // Показываем ВСЕ группы прейскуранта — модельные текущей аренды
  // первыми, затем fallback (если выбран), затем общие (Штрафы /
  // Повреждения / Экипировка), затем группы под другие модели (на
  // случай если оператор хочет взять цену из чужой группы).
  const visibleGroups = [
    ...ownGroups,
    ...fallbackGroups,
    ...generalGroups,
    ...otherModelGroups.filter((g) => g.scooterModelId !== fallbackModelId),
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
  const [selected, setSelected] = useState<Selected[]>(() => {
    if (existing?.items?.length) {
      return existing.items.map((it, i) => ({
        uid: `existing-${it.id}-${i}`,
        priceItemId: it.priceItemId,
        name: it.name,
        originalPrice: it.originalPrice,
        finalPrice: it.finalPrice,
        quantity: it.quantity,
        comment: it.comment ?? "",
      }));
    }
    // v0.8.34 (F2): предзаполнение из потока завершения «с ущербом».
    if (seedItems?.length) {
      return seedItems.map((it, i) => ({
        uid: `seed-${i}-${Date.now()}`,
        priceItemId: it.priceItemId ?? null,
        name: it.name,
        originalPrice: it.originalPrice,
        finalPrice: it.finalPrice,
        quantity: it.quantity,
        comment: it.comment ?? "",
      }));
    }
    return [];
  });

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
  // Залог-предмет: rental.deposit === 0 — деньгами зачитывать нечего, предмет
  // удерживается у нас до полного покрытия долга (информационный режим).
  const depositIsItem = (rental.deposit ?? 0) <= 0;
  const depositMax = Math.min(rental.deposit ?? 0, total);
  const [depositCovered, setDepositCovered] = useState<number>(() => {
    if (existing) return existing.depositCovered ?? 0;
    // v0.8.34 (F2): при предзаполнении из потока завершения по умолчанию
    // зачитываем весь применимый залог (как делал прежний finalizeWithAct).
    if (seedItems?.length) {
      const seedTotal = seedItems.reduce(
        (s, it) => s + it.finalPrice * it.quantity,
        0,
      );
      return Math.min(rental.deposit ?? 0, seedTotal);
    }
    return 0;
  });
  useEffect(() => {
    // Если итог уменьшился ниже текущего зачёта — ужмём.
    setDepositCovered((c) => Math.min(c, depositMax));
  }, [depositMax]);
  const debt = Math.max(0, total - depositCovered);

  // По умолчанию ВЫКЛ — сотрудник явно решает, отправлять ли скутер в ремонт.
  const [sendToRepair, setSendToRepair] = useState(false);
  const [note, setNote] = useState(existing?.note ?? "");

  const create = useCreateDamageReport();
  const patch = usePatchDamageReport();
  const isPending = create.isPending || patch.isPending;

  // === Фото/видео повреждений ===
  // В режиме редактирования (акт уже есть) грузим сразу к existing.id.
  // При создании — стейджим локально и грузим после создания акта.
  const uploadMedia = useUploadDamageMedia();
  const deleteMedia = useDeleteDamageMedia();
  const [staged, setStaged] = useState<StagedMedia[]>([]);
  const [uploadedMedia, setUploadedMedia] = useState<ApiDamageMedia[]>(
    existing?.media ?? [],
  );
  const [mediaBusy, setMediaBusy] = useState(false);

  // Чистим objectURL'ы при размонтировании, чтобы не текла память.
  useEffect(() => {
    return () => {
      for (const s of staged) URL.revokeObjectURL(s.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Подхватываем обновления медиа с сервера в уже открытом диалоге: например
  // видео доперекодировалось (processing → ready, появилась обложка) — список
  // обновляется по поллингу запроса акта.
  useEffect(() => {
    if (existing?.media) setUploadedMedia(existing.media);
  }, [existing?.media]);

  const onPickMedia = async (files: File[]) => {
    const items = await Promise.all(files.map((f) => analyzeFile(f)));
    if (isEdit && existing) {
      // Акт уже есть — грузим сразу.
      setMediaBusy(true);
      setStaged((s) => [...s, ...items]);
      for (const it of items) {
        try {
          const m = await uploadMedia.mutateAsync({
            reportId: existing.id,
            file: it.file,
            durationSec: it.durationSec,
          });
          setUploadedMedia((u) => [...u, m]);
        } catch (e) {
          toast.error("Не удалось загрузить медиа", (e as Error).message ?? "");
        } finally {
          setStaged((s) => s.filter((x) => x.id !== it.id));
          URL.revokeObjectURL(it.previewUrl);
        }
      }
      setMediaBusy(false);
    } else {
      // Создание — копим локально, загрузим после создания акта.
      setStaged((s) => [...s, ...items]);
    }
  };

  const removeStaged = (id: string) => {
    setStaged((s) => {
      const it = s.find((x) => x.id === id);
      if (it) URL.revokeObjectURL(it.previewUrl);
      return s.filter((x) => x.id !== id);
    });
  };

  const removeUploaded = async (mediaId: number) => {
    setUploadedMedia((u) => u.filter((m) => m.id !== mediaId));
    try {
      await deleteMedia.mutateAsync(mediaId);
    } catch (e) {
      toast.error("Не удалось удалить медиа", (e as Error).message ?? "");
    }
  };

  // === Мобильный пошаговый мастер ===
  // На телефоне диалог разворачивается в полноэкранный мастер из 3 шагов:
  //  0 — что повреждено (поиск/прейскурант/своя позиция),
  //  1 — суммы и зачёт залога (правка через нативную клавиатуру MobileNumPad),
  //  2 — фото, комментарий, «в ремонт» и сохранение.
  // Десктоп использует прежний двухколоночный layout ниже без изменений.
  const isMobile = useIsMobile();
  const [step, setStep] = useState(0);
  const [stepDir, setStepDir] = useState<"fwd" | "back">("fwd");
  const [numpad, setNumpad] = useState<null | {
    label: string;
    sublabel?: string;
    hint?: string;
    initial: number;
    max?: number;
    onConfirm: (n: number) => void;
  }>(null);
  const goStep = (n: number) => {
    setStepDir(n >= step ? "fwd" : "back");
    setStep(n);
  };
  // «Своя позиция» — добавляем строку с priceItemId=null; имя/цену оператор
  // правит на шаге сумм (имя — инпут, цена — нативная клавиатура).
  const addCustomItem = () => {
    const uid = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setSelected((p) => [
      ...p,
      {
        uid,
        priceItemId: null,
        name: "Прочее повреждение",
        originalPrice: 0,
        finalPrice: 0,
        quantity: 1,
        comment: "",
      },
    ]);
  };
  const toggleGroup = (id: number) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // Защита от случайного закрытия: если есть несохранённые фото/видео (или при
  // создании — выбранные позиции) — переспрашиваем, чтобы работу не потерять.
  const guardedClose = () => {
    const hasUnsaved = staged.length > 0 || (!isEdit && selected.length > 0);
    if (
      hasUnsaved &&
      !window.confirm(
        "Закрыть без сохранения? Приложенные фото/видео и изменения пропадут.",
      )
    )
      return;
    requestClose();
  };

  // Минимальная валидация: должна быть выбрана хотя бы одна позиция.
  // Комментарии «где конкретно» опциональны — необязательно их заполнять,
  // чтобы создать акт.
  const valid = selected.length > 0;

  const onSubmit = async () => {
    if (!valid) {
      toast.error(
        "Не выбрано ни одной позиции",
        "Выберите позицию из прейскуранта",
      );
      return;
    }
    try {
      const items = selected.map((s) => ({
        priceItemId: s.priceItemId ?? null,
        name: s.name,
        originalPrice: s.originalPrice,
        finalPrice: s.finalPrice,
        quantity: s.quantity,
        comment: s.comment ?? null,
      }));
      const created = isEdit
        ? await patch.mutateAsync({
            id: existing!.id,
            patch: {
              items,
              depositCovered,
              note: note.trim() || null,
            },
          })
        : await create.mutateAsync({
            rentalId: rental.id,
            items,
            depositCovered,
            note: note.trim() || null,
            sendScooterToRepair: sendToRepair,
          });
      // Safety: API мог вернуть некорректный объект — защищаемся от null.
      if (!created || typeof created.id !== "number") {
        toast.error(
          "Акт создан, но превью недоступно",
          "Откройте акт через таб «Документы» в карточке аренды",
        );
        requestClose();
        return;
      }
      toast.success(
        isEdit ? "Акт обновлён" : "Акт создан",
        `Сумма ${fmt(created.total ?? 0)} ₽${
          !isEdit && sendToRepair ? ", скутер отправлен в ремонт" : ""
        }`,
      );
      // Закрываем сначала диалог. Превью открывается в parent через
      // onCreated после небольшой задержки чтобы избежать race condition
      // с одновременным unmount этого компонента.
      const reportId = created.id;
      // Догружаем приложенные при создании фото/видео к новому акту.
      // Best-effort: акт уже создан, при сбое медиа можно добавить позже.
      if (!isEdit && staged.length > 0) {
        setMediaBusy(true);
        for (const it of staged) {
          try {
            await uploadMedia.mutateAsync({
              reportId,
              file: it.file,
              durationSec: it.durationSec,
            });
          } catch {
            /* ignore — отчёт уже сохранён */
          }
          URL.revokeObjectURL(it.previewUrl);
        }
        setStaged([]);
        setMediaBusy(false);
      }
      requestClose();
      window.setTimeout(() => onCreated?.(reportId), 200);
    } catch (e) {
      console.error("damage report submit failed", e);
      toast.error(
        isEdit ? "Не удалось сохранить акт" : "Не удалось создать акт",
        (e as Error).message ?? "",
      );
    }
  };

  // ===================== МОБИЛЬНЫЙ МАСТЕР =====================
  if (isMobile) {
    const stepTitles = ["Что повреждено", "Расчёт и сохранение"];
    const stepCount = 2;
    const canNext = selected.length > 0;
    const stepAnim = stepDir === "fwd" ? "animate-wz-fwd" : "animate-wz-back";
    // Тап по позиции каталога: уже выбрана → +1 к кол-ву, иначе добавить.
    const addOrInc = (g: ApiPriceGroup, it: ApiPriceItem) => {
      const ex = selected.find((s) => s.priceItemId === it.id);
      if (ex) patchSel(ex.uid, { quantity: ex.quantity + 1 });
      else addItem(g, it);
    };
    const qtyFor = (id: number) =>
      selected
        .filter((s) => s.priceItemId === id)
        .reduce((n, s) => n + s.quantity, 0);
    // Карточка выбранной позиции — складывается наверх, редактируется тут же:
    // имя (для своей), цена/кол-во через нативную клавиатуру, комментарий, ×.
    const renderSelectedCard = (s: Selected) => (
      <div
        key={s.uid}
        className="animate-item-pop rounded-2xl border border-orange-200 bg-surface p-3 shadow-card-sm"
      >
        <div className="flex items-start gap-2">
          {s.priceItemId == null ? (
            <input
              value={s.name}
              onChange={(e) => patchSel(s.uid, { name: e.target.value })}
              placeholder="Название позиции"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface-soft px-2 py-1.5 text-[14px] font-semibold text-ink outline-none focus:border-blue-600"
            />
          ) : (
            <div className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-ink">
              {s.name}
            </div>
          )}
          <button
            type="button"
            onClick={() => removeUid(s.uid)}
            className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-full text-muted-2 active:bg-red-soft active:text-red-600"
          >
            <Trash2 size={15} />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-border bg-surface-soft">
            <button
              type="button"
              onClick={() =>
                patchSel(s.uid, { quantity: Math.max(1, s.quantity - 1) })
              }
              className="flex h-10 w-10 items-center justify-center text-ink-2 active:bg-border"
            >
              <Minus size={15} />
            </button>
            <button
              type="button"
              onClick={() =>
                setNumpad({
                  label: "Количество",
                  sublabel: s.name,
                  initial: s.quantity,
                  onConfirm: (n) =>
                    patchSel(s.uid, { quantity: Math.max(1, n) }),
                })
              }
              className="min-w-[34px] text-center text-[15px] font-semibold tabular-nums text-ink"
            >
              {s.quantity}
            </button>
            <button
              type="button"
              onClick={() => patchSel(s.uid, { quantity: s.quantity + 1 })}
              className="flex h-10 w-10 items-center justify-center text-ink-2 active:bg-border"
            >
              <Plus size={15} />
            </button>
          </div>
          <button
            type="button"
            onClick={() =>
              setNumpad({
                label: "Цена позиции",
                sublabel: s.name,
                hint:
                  s.originalPrice > 0
                    ? `из прейскуранта: ${fmt(s.originalPrice)} ₽`
                    : undefined,
                initial: s.finalPrice,
                onConfirm: (n) => patchSel(s.uid, { finalPrice: n }),
              })
            }
            className="flex h-10 flex-1 items-center justify-between rounded-xl border border-border bg-surface-soft px-3 active:border-blue-400"
          >
            <span className="text-[15px] font-semibold tabular-nums text-ink">
              {fmt(s.finalPrice)} ₽
            </span>
            <Pencil size={13} className="text-muted-2" />
          </button>
          <span className="shrink-0 text-[15px] font-bold tabular-nums text-orange-ink">
            {fmt(s.finalPrice * s.quantity)} ₽
          </span>
        </div>
        <input
          value={s.comment ?? ""}
          onChange={(e) => patchSel(s.uid, { comment: e.target.value })}
          placeholder="Комментарий — где именно (необязательно)"
          className="mt-2 w-full rounded-lg border border-border bg-surface-soft px-2.5 py-2 text-[13px] outline-none focus:border-blue-600"
        />
      </div>
    );

    const fallbackChips = needsFallback ? (
      <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
        <div className="font-semibold">По какому прайсу считать «Детали»?</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
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
                  "rounded-lg border border-border bg-white px-3 py-1.5 text-[13px] font-semibold",
                  fallbackModelId === mid && "border-amber-500 bg-amber-100",
                )}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </div>
    ) : null;

    return (
      <div
        className={cn(
          "fixed inset-0 z-[120] flex flex-col bg-surface",
          closing ? "animate-fade-out" : "animate-fade-in",
        )}
      >
        {/* HEADER */}
        <div className="flex items-center gap-2 border-b border-border bg-surface-soft px-3 py-2.5">
          <button
            type="button"
            onClick={step === 0 ? guardedClose : () => goStep(step - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-2 active:bg-border"
          >
            {step === 0 ? <X size={18} /> : <ChevronLeft size={20} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-ink">
              {isEdit ? "Изменить акт" : "Зафиксировать ущерб"}
            </div>
            <div className="truncate text-[11px] text-muted-2">
              {rental.scooter}
              {modelName ? ` · ${modelName}` : ""} · {clientName}
            </div>
          </div>
          <div className="text-[11px] font-semibold text-muted-2">
            {step + 1}/{stepCount}
          </div>
        </div>
        {/* PROGRESS */}
        <div className="h-1 w-full bg-border">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${((step + 1) / stepCount) * 100}%` }}
          />
        </div>
        <div className="px-4 pb-1 pt-3">
          <div className="text-[12px] font-bold uppercase tracking-wider text-blue-700">
            Шаг {step + 1} · {stepTitles[step]}
          </div>
        </div>

        {/* BODY */}
        <div key={step} className={cn("flex-1 overflow-y-auto px-4 pb-3", stepAnim)}>
          {/* ---------- ШАГ 0: что повреждено ---------- */}
          {step === 0 && (
            <>
              {/* Выбранные позиции — складываются НАВЕРХ, правятся тут же */}
              {selected.length > 0 && (
                <div className="flex flex-col gap-2 pb-1 pt-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-orange-ink">
                    Выбранные позиции ({selected.length})
                  </div>
                  {selected.map(renderSelectedCard)}
                </div>
              )}

              <div className="sticky top-0 z-10 -mx-4 border-b border-border bg-surface px-4 pb-2 pt-2">
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск по позициям…"
                    className="h-11 w-full rounded-xl border border-border bg-surface-soft pl-9 pr-3 text-[14px] outline-none focus:border-blue-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={addCustomItem}
                  className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 text-[14px] font-semibold text-blue-700 transition-transform active:scale-[0.99]"
                >
                  <Plus size={16} /> Своя позиция
                </button>
              </div>
              {fallbackChips}
              {list.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-muted-2">
                  <Loader2 size={14} className="animate-spin" /> Загружаем…
                </div>
              ) : visibleGroups.length === 0 ? (
                <div className="mt-2 rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-muted-2">
                  Прейскурант пуст. Заполните его в «Документы → Прейскурант».
                </div>
              ) : (
                <div className="flex flex-col gap-2 pt-2">
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
                        className="overflow-hidden rounded-2xl border border-border"
                      >
                        <button
                          type="button"
                          onClick={() => toggleGroup(g.id)}
                          className="flex w-full items-center gap-2 bg-surface-soft px-3 py-3 text-left active:bg-blue-50"
                        >
                          {isOpen || searchLower ? (
                            <ChevronDown size={16} className="text-muted-2" />
                          ) : (
                            <ChevronRight size={16} className="text-muted-2" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-semibold text-ink">
                                {g.name}
                              </span>
                              {linkedModel ? (
                                <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-700">
                                  {linkedModel.name}
                                </span>
                              ) : (
                                <span className="rounded-full bg-surface px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-2">
                                  общая
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-2">
                              {g.items.length} поз.
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
                              const cnt = qtyFor(it.id);
                              return (
                                <button
                                  key={it.id}
                                  type="button"
                                  onClick={() => addOrInc(g, it)}
                                  className={cn(
                                    "flex w-full items-center justify-between gap-2 px-3 py-3 text-left transition-colors active:bg-blue-100",
                                    cnt > 0 && "bg-orange-soft/30",
                                  )}
                                >
                                  <span className="min-w-0 flex-1 text-[14px] text-ink">
                                    {it.name}
                                  </span>
                                  <span className="text-[13px] font-semibold tabular-nums text-ink">
                                    {price == null ? "—" : `${fmt(price)} ₽`}
                                  </span>
                                  {cnt > 0 ? (
                                    <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[12px] font-bold text-white">
                                      ×{cnt}
                                    </span>
                                  ) : (
                                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-soft text-blue-600">
                                      <Plus size={16} />
                                    </span>
                                  )}
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
            </>
          )}

          {/* ---------- ШАГ 1: расчёт и сохранение ---------- */}
          {step === 1 && (
            <div className="flex flex-col gap-3 pt-1">
              {/* Зачёт из залога */}
              {depositIsItem ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
                  <b>Залог — предмет</b>, не деньги. Удерживайте предмет до
                  полного покрытия долга — деньгами зачитывать нечего.
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-surface-soft p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-2">
                      Зачесть из залога
                    </span>
                    <span className="text-[11px] text-muted-2">
                      макс {fmt(rental.deposit ?? 0)} ₽
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={depositMax <= 0}
                      onClick={() =>
                        setNumpad({
                          label: "Зачесть из залога",
                          hint: `макс ${fmt(depositMax)} ₽`,
                          initial: depositCovered,
                          max: depositMax,
                          onConfirm: setDepositCovered,
                        })
                      }
                      className="flex h-11 flex-1 items-center justify-between rounded-xl border border-border bg-surface px-3 active:border-blue-400 disabled:opacity-50"
                    >
                      <span className="text-[16px] font-bold tabular-nums text-ink">
                        {fmt(depositCovered)} ₽
                      </span>
                      <Pencil size={14} className="text-muted-2" />
                    </button>
                    <button
                      type="button"
                      disabled={depositMax <= 0}
                      onClick={() => setDepositCovered(depositMax)}
                      className={cn(
                        "h-11 rounded-xl border px-3 text-[13px] font-semibold",
                        depositCovered === depositMax && depositMax > 0
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-border bg-surface text-ink-2",
                      )}
                    >
                      Весь
                    </button>
                  </div>
                </div>
              )}

              {/* Итог / долг */}
              <div className="rounded-2xl border border-border bg-surface-soft p-3 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted-2">Итого по акту</span>
                  <span className="font-semibold tabular-nums text-ink">
                    {fmt(total)} ₽
                  </span>
                </div>
                {!depositIsItem && (
                  <div className="mt-1 flex justify-between">
                    <span className="text-muted-2">Зачёт из залога</span>
                    <span className="tabular-nums text-ink-2">
                      −{fmt(depositCovered)} ₽
                    </span>
                  </div>
                )}
                <div className="mt-1.5 flex justify-between border-t border-border pt-1.5 text-[14px] font-bold">
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
              </div>
              {debt > 0 && !depositIsItem && (
                <div className="flex items-start gap-1.5 rounded-2xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-[12px] leading-snug text-amber-900">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Остаток <b>{fmt(debt)} ₽</b> станет{" "}
                    <b>мягким долгом клиента</b> — поедет за ним, пока не
                    погасит. Досудебную претензию формировать необязательно.
                  </span>
                </div>
              )}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Комментарий к акту (необязательно)"
                rows={2}
                className="rounded-xl border border-border bg-surface-soft px-3 py-2 text-[14px] outline-none focus:border-blue-600"
              />
              <div className="flex flex-col gap-2 rounded-2xl border border-orange-200 bg-orange-soft/40 p-3">
                <div className="flex items-center gap-1.5 text-[13px] font-bold text-orange-ink">
                  <Camera size={14} /> Фото и видео повреждений
                  {uploadedMedia.length + staged.length > 0 && (
                    <span className="ml-auto rounded-full bg-white px-2 text-[12px] font-bold text-orange-ink">
                      {uploadedMedia.length + staged.length}
                    </span>
                  )}
                </div>
                <DamageMediaCapture
                  staged={staged}
                  uploaded={uploadedMedia}
                  onPick={onPickMedia}
                  onRemoveStaged={removeStaged}
                  onRemoveUploaded={removeUploaded}
                  busy={mediaBusy}
                  disabled={isPending}
                />
              </div>
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => setSendToRepair((v) => !v)}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface-soft p-3 text-left transition-transform active:scale-[0.99]"
                >
                  <span
                    className={cn(
                      "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                      sendToRepair ? "bg-blue-600" : "bg-muted-2/40",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                        sendToRepair ? "left-[22px]" : "left-0.5",
                      )}
                    />
                  </span>
                  <span className="flex items-center gap-1.5 text-[14px] font-medium text-ink">
                    <Wrench size={14} className="text-muted-2" /> Отправить
                    скутер в ремонт
                  </span>
                </button>
              )}
              {!isEdit && sendToRepair && rental.status === "active" && (
                <div className="flex items-start gap-1.5 rounded-2xl border border-blue-200 bg-blue-50/70 px-3 py-2.5 text-[12px] leading-snug text-blue-900">
                  <Wrench size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Скутер уедет в ремонт — на этой аренде он станет
                    недоступен. Чтобы клиент продолжил, <b>замените скутер</b> в
                    карточке аренды.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="border-t border-border bg-surface px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {step < stepCount - 1 && selected.length > 0 && (
            <div
              key={`sum-${selected.length}-${total}`}
              className="mb-2 flex animate-item-pop items-center justify-between"
            >
              <span className="text-[12px] text-muted-2">
                Выбрано {selected.length} · итог
              </span>
              <span className="text-[15px] font-bold tabular-nums text-ink">
                {fmt(total)} ₽
              </span>
            </div>
          )}
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => goStep(step - 1)}
                className="h-12 flex-1 rounded-2xl bg-surface-soft text-[15px] font-semibold text-ink-2 transition-transform active:scale-[0.98]"
              >
                Назад
              </button>
            )}
            {step < stepCount - 1 ? (
              <button
                type="button"
                onClick={() => goStep(step + 1)}
                disabled={!canNext}
                className="h-12 flex-[2] rounded-2xl bg-blue-600 text-[15px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                Далее
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={!valid || isPending || mediaBusy}
                className="h-12 flex-[2] rounded-2xl bg-red-600 text-[15px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {isPending || mediaBusy
                  ? "Сохраняем…"
                  : isEdit
                    ? "Сохранить"
                    : (submitLabel ?? "Создать акт")}
              </button>
            )}
          </div>
        </div>

        {numpad && (
          <MobileNumPad
            label={numpad.label}
            sublabel={numpad.sublabel}
            hint={numpad.hint}
            initial={numpad.initial}
            max={numpad.max}
            onCancel={() => setNumpad(null)}
            onConfirm={(n) => {
              numpad.onConfirm(n);
              setNumpad(null);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[120] flex items-stretch justify-center bg-ink/55 p-0 backdrop-blur-sm sm:items-center sm:p-4",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
    >
      <div
        className={cn(
          "flex h-[100dvh] w-full max-w-[1200px] flex-col overflow-hidden rounded-none bg-surface shadow-card-lg sm:h-auto sm:rounded-2xl",
          "max-h-[100dvh] sm:max-h-[92vh]",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <AlertTriangle size={18} className="text-amber-600" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink">
              {isEdit ? "Изменить акт" : "Зафиксировать ущерб"} — аренда #
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
              <div className="mt-2 text-[11px] leading-snug text-muted-2">
                Это позиции из прейскуранта (Документы → Прейскурант). Выбери,
                что повреждено — цену и количество можно поправить.
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
                            <div className="flex items-center gap-2">
                              <div className="text-[13px] font-semibold text-ink">
                                {g.name}
                              </div>
                              {linkedModel ? (
                                <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-700">
                                  {linkedModel.name}
                                </span>
                              ) : (
                                <span className="rounded-full bg-surface-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-2">
                                  общая
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-[10px] text-muted-2">
                              {g.items.length} поз.
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
                  Выберите позиции из прейскуранта, чтобы добавить их в акт.
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
              {depositIsItem ? (
                <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  <b>Залог — предмет</b>, не деньги. Удерживайте предмет до
                  полного покрытия долга — деньгами зачитывать нечего.
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span className="text-muted-2">
                    Зачесть из залога (макс {fmt(rental.deposit ?? 0)} ₽)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDepositCovered(depositMax)}
                      className={cn(
                        "rounded-[8px] border px-2 py-1 text-[12px] font-semibold",
                        depositCovered === depositMax && depositMax > 0
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-border bg-white text-ink-2 hover:border-blue-400",
                      )}
                      disabled={depositMax <= 0}
                      title="Зачесть весь возможный залог"
                    >
                      Весь залог
                    </button>
                    {/* v0.3.7: контролируем как строку, чтобы можно было
                        стирать и вводить значение в любом порядке. На blur
                        парсим в число и клампим в [0; depositMax]. Раньше
                        Number("")||0 сразу сбрасывал поле в 0 при стирании
                        и не давал нормально ввести сумму. */}
                    <DepositInput
                      value={depositCovered}
                      max={depositMax}
                      onChange={setDepositCovered}
                    />
                  </div>
                </div>
              )}
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
              {/* F2: остаток после зачёта залога — мягкий долг клиента. Едет
                  за ним (виден в делах и в новых арендах), досудебка — отдельно
                  и по желанию (не обязательна). */}
              {debt > 0 && !depositIsItem && (
                <div className="flex items-start gap-1.5 rounded-[10px] border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11.5px] leading-snug text-amber-900">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>
                    Остаток <b>{fmt(debt)} ₽</b> станет <b>мягким долгом клиента</b> —
                    поедет за ним: будет виден в его делах и в новых арендах, пока
                    не погасит. Досудебную претензию формировать{" "}
                    <b>необязательно</b> — это отдельный шаг.
                  </span>
                </div>
              )}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Комментарий к акту (необязательно)"
                rows={2}
                className="rounded-[8px] border border-border bg-white px-2 py-1 text-[12px] outline-none focus:border-blue-600"
              />
              {/* Фото/видео повреждений — приложить прямо при приёмке (с камеры). */}
              <div className="flex flex-col gap-2 rounded-[10px] border border-orange-200 bg-orange-soft/40 p-2.5">
                <div className="flex items-center gap-1.5 text-[12px] font-bold text-orange-ink">
                  <Camera size={13} /> Фото и видео повреждений
                  {uploadedMedia.length + staged.length > 0 && (
                    <span className="ml-auto rounded-full bg-white px-1.5 text-[11px] font-bold text-orange-ink">
                      {uploadedMedia.length + staged.length}
                    </span>
                  )}
                </div>
                <DamageMediaCapture
                  staged={staged}
                  uploaded={uploadedMedia}
                  onPick={onPickMedia}
                  onRemoveStaged={removeStaged}
                  onRemoveUploaded={removeUploaded}
                  busy={mediaBusy}
                  disabled={isPending}
                />
              </div>
              {!isEdit && (
                <label className="inline-flex items-center gap-2 text-[12px] text-ink-2">
                  <input
                    type="checkbox"
                    checked={sendToRepair}
                    onChange={(e) => setSendToRepair(e.target.checked)}
                  />
                  <Wrench size={12} className="text-muted-2" />
                  Отправить скутер в ремонт после сохранения
                </label>
              )}
              {/* F2: если скутер уходит в ремонт, аренда остаётся без скутера —
                  подсказываем заменить его, чтобы клиент продолжил кататься. */}
              {!isEdit && sendToRepair && rental.status === "active" && (
                <div className="flex items-start gap-1.5 rounded-[10px] border border-blue-200 bg-blue-50/70 px-3 py-2 text-[11.5px] leading-snug text-blue-900">
                  <Wrench size={13} className="mt-0.5 shrink-0" />
                  <span>
                    Скутер уедет в ремонт — на этой аренде он станет недоступен.
                    Чтобы клиент продолжил, <b>замените скутер</b>: в карточке аренды
                    нажмите на блок скутера → «Заменить».
                  </span>
                </div>
              )}
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
                disabled={!valid || isPending || mediaBusy}
                onClick={onSubmit}
                className="rounded-[10px] bg-red-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending || mediaBusy
                  ? "Сохраняем…"
                  : isEdit
                    ? "Сохранить изменения"
                    : (submitLabel ?? "Создать акт о повреждениях")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Поле ввода суммы зачёта из залога. Хранит строковое значение —
 * пользователь свободно стирает и вводит цифры. На blur парсит в число
 * и клампит в [0; max]. Если внешний `value` меняется (например при
 * нажатии «Весь залог») — синхронизируется.
 */
function DepositInput({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState<string>(String(value || 0));
  // Синхронизация при внешнем изменении (кнопка «Весь залог», смена rental)
  useEffect(() => {
    setText(String(value || 0));
  }, [value]);
  const commit = () => {
    const parsed = Number(text.replace(/\s+/g, ""));
    const next = Number.isFinite(parsed)
      ? Math.max(0, Math.min(max, Math.round(parsed)))
      : 0;
    onChange(next);
    setText(String(next));
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(e) => {
        // Принимаем только цифры. Пустая строка допускается — пользователь
        // продолжит ввод, парсинг отложим до blur.
        const v = e.target.value.replace(/[^\d]/g, "");
        setText(v);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      className="w-[100px] rounded-[8px] border border-border bg-white px-2 py-1 text-right text-[13px] tabular-nums"
    />
  );
}
