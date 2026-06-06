import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator as CalcIcon,
  ChevronRight,
  Clock,
  GripHorizontal,
  Pin,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/useIsMobile";
import { useApiScooterModels, type ApiScooterModel } from "@/lib/api/scooter-models";
import { useApiEquipment, type ApiEquipmentItem } from "@/lib/api/equipment";
import { onCalculatorCommand } from "@/lib/calc/calcStore";
import {
  addDaysIso,
  computeQuote,
  DEFAULT_DEPOSIT,
  daysBetweenIso,
  daysWord,
  isoToDDMM,
  rub,
  tierLabelForDays,
  todayIso,
} from "@/lib/calc/rentalQuote";
import {
  createSession,
  genId,
  loadActiveId,
  loadPos,
  loadSessions,
  saveActiveId,
  savePos,
  saveSessions,
  type CalcSession,
  type CalcVariant,
  type WinPos,
} from "@/lib/calc/calcHistory";
import { CalcEquipmentCarousel, CalcModelCarousel } from "./CalcCarousels";
import { InlineRangeCalendar } from "@/components/ui/date-picker";

/**
 * Плавающий калькулятор аренды — быстрый расчёт для оператора «на телефоне».
 *
 * Открытие: кнопка внизу сайдбара, пункт в мобильном «Ещё», горячие клавиши
 * Alt+C / Num+ (см. calcStore + listener ниже). Окно смонтировано глобально
 * (App), плавает поверх СРМ и НЕ блокирует её (без затемнения на десктопе) —
 * можно таскать за шапку. На мобиле — нижний sheet.
 *
 * Считает РОВНО как анкета/оформление (lib/calc/rentalQuote — единый модуль).
 * История расчётов — локальная (этот браузер), в данные CRM ничего не пишет.
 */

const WIN_W = 384;
const DAY_PRESETS = [1, 3, 7, 14, 30];

function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

export function RentalCalculator() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  const applyCmd = useCallback((cmd: "toggle" | "open" | "close") => {
    setOpen((cur) => (cmd === "toggle" ? !cur : cmd === "open" ? true : false));
  }, []);

  // Команды из сайдбара/мобильного «Ещё».
  useEffect(() => onCalculatorCommand(applyCmd), [applyCmd]);

  // Горячие клавиши: Alt+C (по физической клавише — любая раскладка) и Num+.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === "KeyC") {
        e.preventDefault();
        applyCmd("toggle");
        return;
      }
      if (e.code === "NumpadAdd" && !isEditableTarget(e.target)) {
        e.preventDefault();
        applyCmd("toggle");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyCmd]);

  if (!open) return null;
  return (
    <CalculatorWindow isMobile={isMobile} onClose={() => setOpen(false)} />
  );
}

function CalculatorWindow({
  isMobile,
  onClose,
}: {
  isMobile: boolean;
  onClose: () => void;
}) {
  const { data: allModels = [] } = useApiScooterModels();
  const models = useMemo(() => allModels.filter((m) => m.active), [allModels]);
  const { data: equipment = [] } = useApiEquipment();

  const [view, setView] = useState<"calc" | "history">("calc");

  // ── сессии (история) ──
  const [sessions, setSessions] = useState<CalcSession[]>(() => loadSessions());
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveId());

  const updateSessions = useCallback((next: CalcSession[]) => {
    setSessions(next);
    saveSessions(next);
  }, []);

  // Гарантируем активную сессию при открытии.
  useEffect(() => {
    if (sessions.length === 0) {
      const s = createSession();
      setSessions([s]);
      saveSessions([s]);
      setActiveId(s.id);
      saveActiveId(s.id);
    } else if (!activeId || !sessions.some((s) => s.id === activeId)) {
      setActiveId(sessions[0]!.id);
      saveActiveId(sessions[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;

  // ── рабочая область (живой расчёт) ──
  const [modelId, setModelId] = useState<number | null>(null);
  const [equipmentIds, setEquipmentIds] = useState<number[]>([]);
  const [startIso, setStartIso] = useState<string>(() => todayIso());
  const [days, setDays] = useState<number>(7);
  const [deposit, setDeposit] = useState<number>(DEFAULT_DEPOSIT);

  const model = models.find((m) => m.id === modelId) ?? null;
  const selectedEquip = equipment.filter((e) => equipmentIds.includes(e.id));
  const quote = computeQuote({ model, equipment: selectedEquip, days, deposit });
  const endIso = addDaysIso(startIso, days);

  const setDaysClamped = (n: number) =>
    setDays(Math.max(1, Math.min(365, Math.round(n || 1))));

  const toggleEquip = (id: number) =>
    setEquipmentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const resetWorkspace = () => {
    setModelId(null);
    setEquipmentIds([]);
    setStartIso(todayIso());
    setDays(7);
    setDeposit(DEFAULT_DEPOSIT);
  };

  // ── фиксация варианта ──
  const fixVariant = () => {
    if (!activeSession || !model) return;
    const v: CalcVariant = {
      id: genId(),
      modelId,
      modelName: model.name,
      equipmentIds: [...equipmentIds],
      equipmentNames: selectedEquip.map((e) => e.name),
      startIso,
      days,
      rentRate: quote.rentRate,
      rentSum: quote.rentSum,
      equipDaily: quote.equipDaily,
      equipSum: quote.equipSum,
      deposit: quote.deposit,
      total: quote.total,
      createdAtIso: new Date().toISOString(),
    };
    updateSessions(
      sessions.map((s) =>
        s.id === activeSession.id ? { ...s, variants: [...s.variants, v] } : s,
      ),
    );
  };

  const loadVariant = (v: CalcVariant) => {
    setModelId(v.modelId);
    setEquipmentIds(v.equipmentIds);
    setStartIso(v.startIso);
    setDays(v.days);
    setDeposit(v.deposit);
    setView("calc");
  };

  const deleteVariant = (vid: string) => {
    if (!activeSession) return;
    updateSessions(
      sessions.map((s) =>
        s.id === activeSession.id
          ? { ...s, variants: s.variants.filter((v) => v.id !== vid) }
          : s,
      ),
    );
  };

  // ── сессии: создать / открыть / удалить / переименовать ──
  const newSession = () => {
    const s = createSession();
    updateSessions([s, ...sessions]);
    setActiveId(s.id);
    saveActiveId(s.id);
    resetWorkspace();
    setView("calc");
  };

  const openSession = (sid: string) => {
    setActiveId(sid);
    saveActiveId(sid);
    setView("calc");
  };

  const deleteSession = (sid: string) => {
    const next = sessions.filter((s) => s.id !== sid);
    updateSessions(next);
    if (activeId === sid) {
      const na = next[0]?.id ?? null;
      setActiveId(na);
      saveActiveId(na);
    }
  };

  const renameSession = (sid: string, title: string) => {
    updateSessions(sessions.map((s) => (s.id === sid ? { ...s, title } : s)));
  };

  // ── перетаскивание (только десктоп) ──
  const [pos, setPos] = useState<WinPos>(
    () =>
      loadPos() ?? {
        x: Math.max(16, window.innerWidth - WIN_W - 24),
        y: 76,
      },
  );
  const drag = useRef<{
    sx: number;
    sy: number;
    bx: number;
    by: number;
  } | null>(null);

  // Удержать окно в пределах вьюпорта при открытии/ресайзе.
  useEffect(() => {
    if (isMobile) return;
    const clamp = () =>
      setPos((p) => ({
        x: Math.min(Math.max(8, p.x), Math.max(8, window.innerWidth - WIN_W - 8)),
        y: Math.min(Math.max(8, p.y), Math.max(8, window.innerHeight - 320)),
      }));
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [isMobile]);

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if (isMobile) return;
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    drag.current = { sx: e.clientX, sy: e.clientY, bx: pos.x, by: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHeaderPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const nx = Math.min(
      Math.max(8, d.bx + (e.clientX - d.sx)),
      Math.max(8, window.innerWidth - WIN_W - 8),
    );
    const ny = Math.min(
      Math.max(8, d.by + (e.clientY - d.sy)),
      Math.max(8, window.innerHeight - 320),
    );
    setPos({ x: nx, y: ny });
  };
  const onHeaderPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    savePos(pos);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const onRootKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };

  const variantCount = activeSession?.variants.length ?? 0;

  // ── шапка (общая для десктопа и мобилы) ──
  const header = (
    <div
      onPointerDown={onHeaderPointerDown}
      onPointerMove={onHeaderPointerMove}
      onPointerUp={onHeaderPointerUp}
      className={cn(
        "flex select-none items-center gap-2 border-b border-border bg-surface px-3.5 py-2.5",
        !isMobile && "cursor-move rounded-t-[20px]",
      )}
      style={{ touchAction: "none" }}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-ink text-white">
        <CalcIcon size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13.5px] font-bold leading-tight text-ink">
          Калькулятор аренды
        </div>
        <div className="truncate text-[10.5px] text-muted-2">
          быстрый расчёт · цена как при оформлении
        </div>
      </div>
      {!isMobile && (
        <GripHorizontal size={15} className="shrink-0 text-muted-2" />
      )}
      <button
        type="button"
        data-no-drag
        onClick={onClose}
        aria-label="Закрыть"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-2 transition-colors hover:bg-surface-soft hover:text-ink"
      >
        <X size={16} />
      </button>
    </div>
  );

  const tabs = (
    <div className="flex items-center gap-1 border-b border-border bg-surface-soft/60 px-2 py-1.5">
      <TabBtn active={view === "calc"} onClick={() => setView("calc")}>
        Расчёт
      </TabBtn>
      <TabBtn active={view === "history"} onClick={() => setView("history")}>
        <Clock size={12} className="mr-1 inline" />
        История{sessions.length > 0 ? ` · ${sessions.length}` : ""}
      </TabBtn>
    </div>
  );

  const body =
    view === "calc" ? (
      <CalcView
        models={models}
        equipment={equipment}
        modelId={modelId}
        onSelectModel={setModelId}
        equipmentIds={equipmentIds}
        onToggleEquip={toggleEquip}
        startIso={startIso}
        endIso={endIso}
        days={days}
        onStart={setStartIso}
        onDays={setDaysClamped}
        deposit={deposit}
        onDeposit={setDeposit}
        quote={quote}
        session={activeSession}
        onRenameSession={(t) => activeSession && renameSession(activeSession.id, t)}
        onNewSession={newSession}
        onLoadVariant={loadVariant}
        onDeleteVariant={deleteVariant}
      />
    ) : (
      <HistoryView
        sessions={sessions}
        activeId={activeId}
        onOpen={openSession}
        onDelete={deleteSession}
        onNew={newSession}
      />
    );

  const footer = view === "calc" && (
    <div className="border-t border-border bg-surface px-3.5 py-2.5">
      {/* Итог «К выдаче» — всегда виден (не уходит под фолд при скролле тела). */}
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            К выдаче
          </div>
          <div className="text-[10px] text-muted-2">
            {rub(quote.perDay)} ₽/сут · залог {rub(quote.deposit)} ₽
          </div>
        </div>
        <div className="font-display text-[25px] font-extrabold leading-none tabular-nums text-ink">
          {rub(quote.total)} ₽
        </div>
      </div>
      <button
        type="button"
        onClick={fixVariant}
        disabled={!model}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-[14px] font-bold text-white shadow-card-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Pin size={16} /> Зафиксировать{variantCount > 0 ? ` (${variantCount})` : ""}
      </button>
      {!model && (
        <div className="mt-1.5 text-center text-[11px] text-muted-2">
          выберите скутер, чтобы зафиксировать
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-[120] flex flex-col justify-end bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        onKeyDown={onRootKeyDown}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl bg-surface shadow-card-lg animate-sheet-up"
        >
          {header}
          {tabs}
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3.5 py-3">
            {body}
          </div>
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-[120]"
      style={{ left: pos.x, top: pos.y, width: WIN_W }}
      onKeyDown={onRootKeyDown}
    >
      {/* Высота привязана к позиции окна: окно никогда не вылезает за низ
          экрана, поэтому липкий футер с итогом всегда виден, куда бы его
          ни перетащили. */}
      <div
        className="flex flex-col overflow-hidden rounded-[20px] border border-border bg-surface shadow-card-lg ring-1 ring-black/5"
        style={{ maxHeight: `calc(100dvh - ${Math.round(pos.y) + 16}px)` }}
      >
        {header}
        {tabs}
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3.5 py-3">
          {body}
        </div>
        {footer}
      </div>
    </div>
  );
}

/* ───────────────────────── Расчёт (рабочая область) ───────────────────────── */

function CalcView({
  models,
  equipment,
  modelId,
  onSelectModel,
  equipmentIds,
  onToggleEquip,
  startIso,
  endIso,
  days,
  onStart,
  onDays,
  deposit,
  onDeposit,
  quote,
  session,
  onRenameSession,
  onNewSession,
  onLoadVariant,
  onDeleteVariant,
}: {
  models: ApiScooterModel[];
  equipment: ApiEquipmentItem[];
  modelId: number | null;
  onSelectModel: (id: number | null) => void;
  equipmentIds: number[];
  onToggleEquip: (id: number) => void;
  startIso: string;
  endIso: string;
  days: number;
  onStart: (iso: string) => void;
  onDays: (n: number) => void;
  deposit: number;
  onDeposit: (n: number) => void;
  quote: ReturnType<typeof computeQuote>;
  session: CalcSession | null;
  onRenameSession: (title: string) => void;
  onNewSession: () => void;
  onLoadVariant: (v: CalcVariant) => void;
  onDeleteVariant: (vid: string) => void;
}) {
  const hasEquip = equipmentIds.length > 0;
  return (
    <div className="flex flex-col gap-3.5">
      {/* Заголовок сессии + «Новый» */}
      <div className="flex items-center gap-2">
        <input
          value={session?.title ?? ""}
          onChange={(e) => onRenameSession(e.target.value)}
          placeholder="Название расчёта"
          className="h-8 min-w-0 flex-1 rounded-[9px] border border-transparent bg-surface-soft px-2.5 text-[12.5px] font-semibold text-ink outline-none transition-colors focus:border-blue-600 focus:bg-surface"
        />
        <button
          type="button"
          onClick={onNewSession}
          className="flex h-8 shrink-0 items-center gap-1 rounded-[9px] bg-surface-soft px-2.5 text-[12px] font-semibold text-ink transition-colors hover:bg-blue-50 hover:text-blue-700"
        >
          <Plus size={14} /> Новый
        </button>
      </div>

      {/* Скутер */}
      <Section label="Скутер">
        <CalcModelCarousel
          models={models}
          valueId={modelId}
          days={days}
          onSelect={onSelectModel}
        />
      </Section>

      {/* Экипировка */}
      <Section label="Экипировка" hint="по желанию">
        <CalcEquipmentCarousel
          items={equipment}
          selectedIds={equipmentIds}
          onToggle={onToggleEquip}
        />
      </Section>

      {/* Период — открытый календарь (как в анкете): тап начало → тап конец.
          Сверху быстрые пресеты дней; снизу — итоговая строка с тарифом. */}
      <Section label="Период">
        <div className="mb-2 flex flex-wrap gap-1">
          {DAY_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onDays(p)}
              className={cn(
                "h-7 rounded-full px-3 text-[12px] font-semibold transition-colors",
                days === p
                  ? "bg-ink text-white"
                  : "bg-surface-soft text-muted hover:bg-blue-50 hover:text-blue-700",
              )}
            >
              {p} дн
            </button>
          ))}
        </div>
        <InlineRangeCalendar
          from={startIso}
          to={endIso}
          onChange={({ from, to }) => {
            onStart(from);
            onDays(Math.max(1, daysBetweenIso(from, to)));
          }}
        />
        <div className="mt-2 text-center text-[12px] text-muted">
          с {isoToDDMM(startIso)} по {isoToDDMM(endIso)} ·{" "}
          <span className="font-semibold text-ink/70">
            {days} {daysWord(days)}
          </span>{" "}
          · тариф {tierLabelForDays(days)}
        </div>
      </Section>

      {/* Разбивка */}
      <div className="rounded-2xl border border-border bg-surface-soft/50 p-3">
        <BreakRow
          label="Аренда"
          sub={`${rub(quote.rentRate)} ₽/сут × ${days}`}
          value={`${rub(quote.rentSum)} ₽`}
        />
        {hasEquip && (
          <BreakRow
            label="Экипировка"
            sub={`${rub(quote.equipDaily)} ₽/сут × ${days}`}
            value={`${rub(quote.equipSum)} ₽`}
          />
        )}
        <div className="flex items-center justify-between gap-2 py-1.5">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink">Залог</div>
            <div className="text-[11px] text-muted-2">возвращается</div>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={deposit}
              min={0}
              step={500}
              onChange={(e) =>
                onDeposit(Math.max(0, Math.round(Number(e.target.value) || 0)))
              }
              className="h-8 w-[78px] rounded-[8px] border border-border bg-surface px-2 text-right text-[13px] font-semibold tabular-nums text-ink outline-none focus:border-blue-600"
            />
            <span className="text-[12px] text-muted">₽</span>
          </div>
        </div>

      </div>

      {/* Зафиксированные варианты */}
      {session && session.variants.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-2">
            <Pin size={12} /> Зафиксировано · {session.variants.length}
          </div>
          {session.variants.map((v, i) => (
            <VariantRow
              key={v.id}
              index={i + 1}
              variant={v}
              onLoad={() => onLoadVariant(v)}
              onDelete={() => onDeleteVariant(v.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VariantRow({
  index,
  variant: v,
  onLoad,
  onDelete,
}: {
  index: number;
  variant: CalcVariant;
  onLoad: () => void;
  onDelete: () => void;
}) {
  const equipLabel =
    v.equipmentNames.length > 0
      ? ` + ${v.equipmentNames.length} экип.`
      : "";
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2 shadow-card-sm">
      <button
        type="button"
        onClick={onLoad}
        title="Загрузить в расчёт"
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 px-1 text-[10px] font-bold text-blue-700">
            {index}
          </span>
          <span className="truncate text-[12.5px] font-bold text-ink">
            {v.modelName}
            {equipLabel}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted">
          {v.days} {daysWord(v.days)} · {isoToDDMM(v.startIso)}–
          {isoToDDMM(addDaysIso(v.startIso, v.days))} · залог {rub(v.deposit)}
        </div>
      </button>
      <div className="shrink-0 text-right">
        <div className="text-[13px] font-extrabold tabular-nums text-ink">
          {rub(v.total)} ₽
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Удалить вариант"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-2 transition-colors hover:bg-red-soft hover:text-red-ink"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/* ───────────────────────── История ───────────────────────── */

function HistoryView({
  sessions,
  activeId,
  onOpen,
  onDelete,
  onNew,
}: {
  sessions: CalcSession[];
  activeId: string | null;
  onOpen: (sid: string) => void;
  onDelete: (sid: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onNew}
        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-surface-soft text-[13px] font-semibold text-ink transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
      >
        <Plus size={15} /> Новый расчёт
      </button>

      {sessions.length === 0 && (
        <div className="px-2 py-8 text-center text-[12.5px] text-muted-2">
          Здесь будут сохранённые расчёты по клиентам.
        </div>
      )}

      {sessions.map((s) => {
        const totals = s.variants.map((v) => v.total);
        const min = totals.length ? Math.min(...totals) : 0;
        const max = totals.length ? Math.max(...totals) : 0;
        const range =
          totals.length === 0
            ? "нет вариантов"
            : min === max
              ? `${rub(min)} ₽`
              : `${rub(min)}–${rub(max)} ₽`;
        return (
          <div
            key={s.id}
            className={cn(
              "flex items-center gap-2 rounded-xl border bg-surface p-2.5 shadow-card-sm",
              s.id === activeId ? "border-blue-300 ring-1 ring-blue-200" : "border-border",
            )}
          >
            <button
              type="button"
              onClick={() => onOpen(s.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-ink">
                  {s.title}
                </div>
                <div className="truncate text-[11px] text-muted">
                  {s.variants.length}{" "}
                  {s.variants.length === 1
                    ? "вариант"
                    : s.variants.length < 5
                      ? "варианта"
                      : "вариантов"}{" "}
                  · {range}
                </div>
              </div>
              <ChevronRight size={16} className="shrink-0 text-muted-2" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(s.id)}
              aria-label="Удалить расчёт"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-2 transition-colors hover:bg-red-soft hover:text-red-ink"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────── мелочи ───────────────────────── */

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-2">
          {label}
        </span>
        {hint && <span className="text-[10.5px] text-muted-2">· {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function BreakRow({
  label,
  sub,
  value,
}: {
  label: string;
  sub: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-ink">{label}</div>
        <div className="text-[11px] text-muted-2">{sub}</div>
      </div>
      <div className="shrink-0 text-[13px] font-bold tabular-nums text-ink">
        {value}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-7 items-center rounded-full px-3 text-[12px] font-semibold transition-colors",
        active
          ? "bg-ink text-white"
          : "text-muted hover:bg-surface-soft hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
