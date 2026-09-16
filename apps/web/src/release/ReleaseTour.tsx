import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import logoUrl from "@/assets/hulk-logo.png";
import type { RouteId } from "@/app/route";
import { useMe } from "@/lib/api/auth";
import { usePerms } from "@/lib/permissions";
import {
  useMyReleaseViews,
  useReleaseAction,
  type ReleaseView,
} from "@/lib/api/releases";
import {
  NEW_LABEL_DAYS,
  RELEASE_TOUR,
  RELEASE_TOURS,
  newSectionRoutes,
  type ReleaseTourConfig,
  type TourAnchor,
  type TourDevice,
  type TourItem,
} from "./tour";
import "./release-tour.css";

/**
 * Показ обновления (15.09): титул большой версии → карточки «Что изменилось»
 * → подсказки на месте. Концепт и правила — release/tour.ts.
 *
 * Монтируется в App внутри оболочки (компьютер и телефон). Конвейер
 * скриншотов отключает показ флагом localStorage `hulk-release-tour-skip`.
 */

const MAX_POSTPONES = 3;
const SKIP_KEY = "hulk-release-tour-skip";
const laterKey = (v: string) => `hulk-release-tour-later:${v}`;
const resumeHiddenKey = (v: string) => `hulk-release-tour-resume-hidden:${v}`;

function readSession(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeSession(key: string) {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    /* приватный режим — показ просто вернётся при перезагрузке */
  }
}
function tourSkipped(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const reduceMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Карточки для человека и устройства (не больше шести). */
export function tourCards(
  device: TourDevice,
  isManager: boolean,
  cfg: ReleaseTourConfig = RELEASE_TOUR,
): TourItem[] {
  return cfg.items
    .filter((i) => i.devices.includes(device))
    .filter((i) =>
      i.audience === "all" ? true : i.audience === "managers" ? isManager : !isManager,
    )
    .slice(0, 6);
}

type QueuedHint = {
  /** Выпуск, в чей прогресс пишется «понятно». */
  version: string;
  anchor: TourAnchor;
  title: string;
  text: string;
  eyebrow: string;
  /** Ключ «понятно» на сервере; у подсказки «где найти» его нет. */
  key: string | null;
  /** «Понятно» у подсказки «где найти» открывает раздел. */
  open?: RouteId;
};

export function ReleaseTour({
  route,
  onSelect,
  isMobile,
}: {
  route: RouteId;
  onSelect: (id: RouteId) => void;
  isMobile: boolean;
}) {
  const { data: me } = useMe();
  const perms = usePerms();
  const skip = tourSkipped();
  const viewsQ = useMyReleaseViews(!!me && !skip);
  const act = useReleaseAction();
  const device: TourDevice = isMobile ? "phone" : "desktop";
  const isManager = me?.role === "creator" || me?.role === "director";
  const viewOf = useCallback(
    (version: string): ReleaseView | undefined =>
      viewsQ.data?.views.find((v) => v.version === version),
    [viewsQ.data],
  );
  const newStaff = viewsQ.data?.staffKind === "new";
  const createdDay = (viewsQ.data?.accountCreatedAt ?? "").slice(0, 10);

  // Выпуски, которые человеку ещё показать, — от старого к новому. Новому
  // сотруднику — только вышедшие после того, как завели его аккаунт.
  const pending = useMemo(
    () =>
      RELEASE_TOURS.filter((r) => {
        if (tourCards(device, isManager, r).length === 0) return false;
        if (newStaff && (!createdDay || r.date <= createdDay)) return false;
        const v = viewOf(r.version);
        return v?.status !== "completed" && (v?.postponedCount ?? 0) < MAX_POSTPONES;
      }),
    [device, isManager, newStaff, createdDay, viewOf],
  );
  // «Позже» у любого выпуска — откладывает показ целиком до следующего входа.
  const laterNow =
    readSession(laterKey("all")) || pending.some((r) => readSession(laterKey(r.version)));
  const cfg: ReleaseTourConfig = pending[0] ?? RELEASE_TOUR;
  const cards = useMemo(() => tourCards(device, isManager, cfg), [device, isManager, cfg]);
  const view = viewOf(cfg.version);
  const completed = pending.length === 0;

  const [phase, setPhase] = useState<"none" | "intro" | "cards" | "hint">("none");
  const [cardIdx, setCardIdx] = useState(0);
  const [entering, setEntering] = useState(false);
  const [queue, setQueue] = useState<QueuedHint[]>([]);
  const [qi, setQi] = useState(0);
  const [resumeHidden, setResumeHidden] = useState(() => readSession(resumeHiddenKey("all")));
  /** Выпуск, для которого уже решали, показывать ли его сейчас. */
  const started = useRef<string | null>(null);
  // То же в состоянии — чтобы кнопка «Продолжить» появилась и тогда, когда
  // показ отложен и больше ничего не перерисовывается (после F5).
  const [startedFor, setStartedFor] = useState<string | null>(null);

  const record = act.mutate;

  // ── Автостарт при входе; досмотрел выпуск — следом следующий ──
  useEffect(() => {
    if (skip || !me || !viewsQ.data || completed) return;
    if (started.current === cfg.version || phase !== "none") return;
    started.current = cfg.version;
    setStartedFor(cfg.version);
    if (laterNow) return;
    // Продолжаем с последней ПОКАЗАННОЙ карточки: отметка ставится при показе,
    // а не при прочтении, и повторная отрисовка не должна её пропускать.
    const seen = Math.min(Math.max(0, (view?.cardsSeen ?? 0) - 1), cards.length - 1);
    if (cfg.major && (view?.cardsSeen ?? 0) === 0) setPhase("intro");
    else {
      setCardIdx(Math.max(0, seen));
      setEntering(!reduceMotion());
      setPhase("cards");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, me, viewsQ.data, completed, cfg.version, phase, laterNow]);

  // ── Карточка на экране — отметка «посмотрел N карточек» ──
  useEffect(() => {
    if (phase !== "cards") return;
    if ((view?.cardsSeen ?? 0) < cardIdx + 1) {
      record({ version: cfg.version, action: "card", cardsSeen: cardIdx + 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, cardIdx]);

  const postpone = useCallback(() => {
    // «Позже» — до следующего входа для всех выпусков сразу: иначе следом
    // выскочил бы показ следующей версии.
    writeSession(laterKey("all"));
    writeSession(laterKey(cfg.version));
    record({ version: cfg.version, action: "postpone" });
    setPhase("none");
  }, [cfg.version, record]);

  const finishCards = useCallback(() => {
    record({ version: cfg.version, action: "complete", cardsSeen: cards.length });
    setPhase("none");
  }, [cfg.version, record, cards.length]);

  const startHints = useCallback(
    (item: TourItem, withPath: boolean, version: string) => {
      const done = new Set(viewOf(version)?.hintsDone ?? []);
      const q: QueuedHint[] = [];
      const path = item.path?.[device];
      if (withPath && path && item.route && item.route !== route) {
        q.push({
          version,
          anchor: path.anchor,
          title: `Где найти «${item.title}»`,
          text: path.text,
          eyebrow: item.kind === "new" ? "Новый раздел" : "Изменилось",
          key: null,
          open: item.route,
        });
      }
      (item.hints?.[device] ?? []).forEach((h, i) => {
        const key = `${item.id}:${device}:${i}`;
        if (done.has(key)) return;
        q.push({ ...h, version, eyebrow: `Новое · ${item.title}`, key });
      });
      if (q.length === 0) return false;
      if (!q[0]!.open && item.route && item.route !== route) onSelect(item.route);
      setQueue(q);
      setQi(0);
      setPhase("hint");
      return true;
    },
    [device, onSelect, route, viewOf],
  );

  // ── Первый заход в раздел: метка «новое» гаснет, подсказки на месте ──
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const visitRecorded = useRef(new Set<string>());
  const hintsTried = useRef(new Set<string>());
  useEffect(() => {
    if (skip || !viewsQ.data) return;
    if (!visitRecorded.current.has(route)) {
      visitRecorded.current.add(route);
      for (const r of RELEASE_TOURS) {
        const visited = new Set(viewOf(r.version)?.sectionsVisited ?? []);
        if (!visited.has(route) && newSectionRoutes(r).includes(route)) {
          record({ version: r.version, action: "visit", section: route });
        }
      }
    }
    // Пока открыт титул или карточки — подсказок нет. Таймер снимается, если
    // в этот же момент открылся показ: иначе подсказка перебила бы титул.
    if (phase !== "none" || hintsTried.current.has(route)) return;
    // «Посмотрю позже» — и подсказки ждут следующего входа.
    if (laterNow) return;
    // Подсказки на месте — из любого выпуска, у кого они ещё не закрыты.
    let found: { item: TourItem; version: string } | null = null;
    for (const r of RELEASE_TOURS) {
      if (newStaff && (!createdDay || r.date <= createdDay)) continue;
      const done = new Set(viewOf(r.version)?.hintsDone ?? []);
      const item = tourCards(device, isManager, r).find(
        (i) =>
          i.route === route &&
          (i.hints?.[device] ?? []).some((_, k) => !done.has(`${i.id}:${device}:${k}`)),
      );
      if (item) {
        found = { item, version: r.version };
        break;
      }
    }
    if (!found) return;
    const hit = found;
    const t = window.setTimeout(() => {
      if (phaseRef.current !== "none") return;
      hintsTried.current.add(route);
      startHints(hit.item, false, hit.version);
    }, 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, phase, viewsQ.data, laterNow]);

  const hintOk = () => {
    const h = queue[qi];
    if (!h) return;
    if (h.key) record({ version: h.version, action: "hint", hint: h.key });
    if (h.open) onSelect(h.open);
    if (qi + 1 >= queue.length) {
      setQueue([]);
      setPhase("none");
    } else setQi(qi + 1);
  };
  const hintSkip = () => {
    setQueue([]);
    setPhase("none");
  };

  const showWhere = () => {
    const item = cards[cardIdx];
    if (!item) return;
    const nextIdx = Math.min(cardIdx + 1, cards.length - 1);
    record({ version: cfg.version, action: "card", cardsSeen: Math.max(cardIdx + 1, view?.cardsSeen ?? 0) });
    setCardIdx(nextIdx);
    if (!startHints(item, true, cfg.version)) setPhase("none");
  };

  const resume = () => {
    const idx = Math.min(Math.max(0, (view?.cardsSeen ?? 0) - 1), cards.length - 1);
    setCardIdx(Math.max(0, idx));
    setEntering(!reduceMotion());
    setPhase("cards");
  };

  if (skip || !me) return null;

  const showResume =
    phase === "none" &&
    !!viewsQ.data &&
    startedFor != null &&
    !completed &&
    !resumeHidden &&
    cards.length > 0;

  return (
    <>
      {phase === "intro" && (
        <IntroScreen
          label={cfg.label}
          subtitle={cfg.subtitle}
          count={cards.length}
          onWatch={() => {
            setCardIdx(0);
            setEntering(!reduceMotion());
            setPhase("cards");
          }}
          onLater={postpone}
        />
      )}

      {phase === "cards" && cards[cardIdx] && (
        <CardsScreen
          item={cards[cardIdx]!}
          index={cardIdx}
          total={cards.length}
          device={device}
          label={cfg.label}
          major={cfg.major}
          perms={perms}
          isManager={isManager}
          entering={entering}
          onEntered={() => setEntering(false)}
          onNext={() => (cardIdx >= cards.length - 1 ? finishCards() : setCardIdx(cardIdx + 1))}
          onPrev={cardIdx > 0 ? () => setCardIdx(cardIdx - 1) : undefined}
          onShow={cards[cardIdx]!.hints?.[device]?.length || cards[cardIdx]!.path?.[device] ? showWhere : undefined}
          onLater={postpone}
        />
      )}

      {phase === "hint" && queue[qi] && (
        <HintLayer
          key={`${qi}:${queue[qi]!.title}`}
          hint={queue[qi]!}
          step={qi + 1}
          total={queue.length}
          onOk={hintOk}
          onSkip={hintSkip}
        />
      )}

      {showResume && (
        <button type="button" className="rt-resume" onClick={resume}>
          Продолжить знакомство с {cfg.label}
          <span
            role="button"
            aria-label="Скрыть до следующего входа"
            className="rt-resume-close"
            onClick={(e) => {
              e.stopPropagation();
              writeSession(resumeHiddenKey("all"));
              setResumeHidden(true);
            }}
          >
            <X size={14} />
          </span>
        </button>
      )}
    </>
  );
}

/* ───────────────────────── титул большой версии ───────────────────────── */

function IntroScreen({
  label,
  subtitle,
  count,
  onWatch,
  onLater,
}: {
  label: string;
  subtitle: string;
  count: number;
  onWatch: () => void;
  onLater: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [diving, setDiving] = useState(false);

  useEffect(() => {
    if (reduceMotion() || !canvasRef.current) return;
    return confetti(canvasRef.current, 1850);
  }, []);

  const watch = () => {
    if (reduceMotion()) {
      onWatch();
      return;
    }
    setDiving(true);
    window.setTimeout(onWatch, 720);
  };

  return (
    <div className="rt-root">
      <div
        className={`rt-intro${diving ? " diving" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Халк Байк CRM, версия ${label}`}
      >
        <div className="rt-rays" aria-hidden="true" />
        <div className="rt-glow" aria-hidden="true" />
        <canvas ref={canvasRef} className="rt-confetti" aria-hidden="true" />
        <div className="rt-content">
          <div className="rt-logo-scene" aria-hidden="true">
            <div className="rt-logo-float">
              <div className="rt-logo-bob">
                <div className="rt-logo-tile">
                  <div className="rt-logo-face front">
                    <img src={logoUrl} alt="" />
                    <span className="rt-logo-sheen" />
                  </div>
                  <div className="rt-logo-face back">{label}</div>
                </div>
              </div>
            </div>
            <div className="rt-logo-floor" />
          </div>
          <div className="rt-intro-text">
            <div className="rt-kicker">Халк Байк · CRM</div>
            <h2 className="rt-title">
              Версия <span>{label}</span>
            </h2>
            <p className="rt-sub">{subtitle}</p>
            <div className="rt-actions">
              <button type="button" className="rt-watch" onClick={watch} autoFocus>
                Смотреть, что нового
              </button>
              <button type="button" className="rt-later" onClick={onLater}>
                Позже
              </button>
            </div>
            <div className="rt-meta">
              {count} {plural(count, "перемена", "перемены", "перемен")} · около двух минут
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Праздничная россыпь из центра логотипа. Возвращает остановку. */
function confetti(canvas: HTMLCanvasElement, delay: number): () => void {
  const box = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = box.width * dpr;
  canvas.height = box.height * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  ctx.scale(dpr, dpr);
  const colors = ["#6CAD2F", "#a6e36b", "#ffffff", "#2563EB", "#F0A500"];
  const cx = box.width / 2;
  const cy = box.height * 0.36;
  const parts = Array.from({ length: 140 }, () => {
    const a = Math.random() * Math.PI * 2;
    const sp = (0.35 + Math.random() * 0.9) * box.width * 0.012;
    return {
      x: cx,
      y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - box.height * 0.006,
      w: 3 + Math.random() * 5,
      h: 6 + Math.random() * 8,
      r: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[(Math.random() * colors.length) | 0]!,
    };
  });
  const t0 = performance.now() + delay;
  let raf = 0;
  const life = 2600;
  const frame = (now: number) => {
    const t = now - t0;
    if (t < 0) {
      raf = requestAnimationFrame(frame);
      return;
    }
    ctx.clearRect(0, 0, box.width, box.height);
    for (const p of parts) {
      p.vy += box.height * 0.00032;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      ctx.restore();
    }
    if (t < life) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, box.width, box.height);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

/* ───────────────────────── «Что изменилось» ───────────────────────── */

function CardsScreen({
  item,
  index,
  total,
  device,
  label,
  major,
  perms,
  isManager,
  entering,
  onEntered,
  onNext,
  onPrev,
  onShow,
  onLater,
}: {
  item: TourItem;
  index: number;
  total: number;
  device: TourDevice;
  label: string;
  major: boolean;
  perms: Record<string, boolean>;
  isManager: boolean;
  entering: boolean;
  onEntered: () => void;
  onNext: () => void;
  onPrev?: () => void;
  onShow?: () => void;
  onLater: () => void;
}) {
  const last = index === total - 1;
  const after = item.img[device] ?? item.img.desktop ?? item.img.phone ?? "";
  const before = item.before?.[device];
  const pos = item.imgPos?.[device] ?? "center top";
  const points = item.points
    .map((p) =>
      typeof p === "string"
        ? p
        : (p.perm && !perms[p.perm]) || (p.managers && !isManager)
          ? null
          : p.text,
    )
    .filter((p): p is string => !!p);

  useEffect(() => {
    if (!entering) return;
    const t = window.setTimeout(onEntered, 650);
    return () => window.clearTimeout(t);
  }, [entering, onEntered]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onLater();
      if (e.key === "ArrowRight") onNext();
      if (e.key === "ArrowLeft") onPrev?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onLater, onNext, onPrev]);

  return (
    <div className="rt-root">
      <div className="rt-takeover">
        <div className="rt-scrim" />
        <div
          className={`rt-sheet${entering ? " enter" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Что изменилось в CRM"
        >
          <div className="rt-media">
            {before ? (
              <BeforeAfter key={item.id} before={before} after={after} pos={pos} title={item.title} />
            ) : (
              <img key={item.id} src={after} alt={`${item.title}: как выглядит`} style={{ objectPosition: pos }} />
            )}
          </div>
          <div className="rt-body">
            <div className="rt-top">
              <div className="rt-top-row">
                <span className="rt-brand">
                  <img src={logoUrl} alt="" />
                  {major ? "Халк Байк CRM" : "Обновление"} <b>{label}</b>
                </span>
                <button type="button" className="rt-later-link" onClick={onLater}>
                  Посмотрю позже
                </button>
              </div>
              <div className="rt-progress" aria-hidden="true">
                {Array.from({ length: total }, (_, i) => (
                  <span key={i} className={i <= index ? "on" : ""} />
                ))}
              </div>
            </div>
            <span className={`rt-kind ${item.kind}`}>
              {item.kind === "new" ? (item.path ? "Новый раздел" : "Новое") : "Изменилось"}
            </span>
            <h2 className="rt-card-title">{item.title}</h2>
            <p className="rt-headline">{item.headline}</p>
            {item.why && (
              <p className="rt-why">
                <b>Зачем.</b> {item.why}
              </p>
            )}
            <ul className="rt-points">
              {points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <div className="rt-card-actions">
              {onShow && (
                <button type="button" className="rt-btn rt-show" onClick={onShow}>
                  Показать где
                </button>
              )}
              {onPrev && device === "desktop" && (
                <button type="button" className="rt-btn rt-next" onClick={onPrev}>
                  Назад
                </button>
              )}
              <button type="button" className={`rt-btn rt-next${last ? " primary" : ""}`} onClick={onNext}>
                {last ? "Готово" : "Дальше"}
              </button>
              <span className="rt-count">
                {index + 1} из {total}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * «Было / стало» с ползунком. Как в концепте: сразу после открытия линия сама
 * проходит влево и вправо — человек видит, что сравнение двигается. Плюс
 * ручка на линии и подпись «потяните», пока её не тронули.
 */
function BeforeAfter({ before, after, pos, title }: { before: string; after: string; pos: string; title: string }) {
  const [v, setV] = useState(50);
  const [touched, setTouched] = useState(false);
  const touchedRef = useRef(false);

  useEffect(() => {
    if (reduceMotion()) return;
    const frames: Array<[number, number]> = [[0, 50], [650, 22], [1300, 76], [1850, 50]];
    let raf = 0;
    let t0 = 0;
    const tick = (now: number) => {
      if (touchedRef.current) return;
      if (!t0) t0 = now;
      const t = now - t0;
      let val = 50;
      for (let i = 1; i < frames.length; i++) {
        const [ta, va] = frames[i - 1]!;
        const [tb, vb] = frames[i]!;
        if (t <= tb) {
          const k = (t - ta) / (tb - ta);
          val = va + (vb - va) * (0.5 - Math.cos(Math.PI * k) / 2);
          break;
        }
        val = vb;
      }
      setV(val);
      if (t < frames[frames.length - 1]![0]) raf = requestAnimationFrame(tick);
    };
    const start = window.setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 500);
    return () => {
      window.clearTimeout(start);
      cancelAnimationFrame(raf);
    };
  }, []);

  const grab = () => {
    touchedRef.current = true;
    setTouched(true);
  };

  return (
    <div className="rt-ba" style={{ ["--pos" as string]: `${v}%` }}>
      <img src={after} alt={`Стало: ${title}`} style={{ objectPosition: pos }} />
      <img className="rt-ba-before" src={before} alt={`Было: ${title}`} style={{ objectPosition: pos }} />
      <div className="rt-ba-line" />
      <div className="rt-ba-knob" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" />
        </svg>
      </div>
      {!touched && <span className="rt-ba-hint">Потяните, чтобы сравнить</span>}
      <span className="rt-ba-tag l">Было</span>
      <span className="rt-ba-tag r">Стало</span>
      <input
        type="range"
        min={0}
        max={100}
        step={0.5}
        value={v}
        onPointerDown={grab}
        onChange={(e) => {
          grab();
          setV(Number(e.target.value));
        }}
        aria-label="Сравнить: было и стало"
      />
    </div>
  );
}

/* ───────────────────────── подсказка на месте ───────────────────────── */

function findAnchor(a: TourAnchor): HTMLElement | null {
  const visible = (el: Element | null | undefined): el is HTMLElement => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  for (const t of a.tour ?? []) {
    const el = [...document.querySelectorAll(`[data-tour="${t}"]`)].find(visible);
    if (el) return el as HTMLElement;
  }
  if (a.placeholder) {
    const el = [...document.querySelectorAll("input")].find(
      (i) => visible(i) && (i.getAttribute("placeholder") ?? "").startsWith(a.placeholder!),
    );
    if (el) return el;
  }
  if (a.text) {
    const want = a.text.toLowerCase();
    const els = [...document.querySelectorAll("button, a, [role=tab]")]
      .filter(visible)
      .filter((el) => {
        const t = (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
        return t.startsWith(want) && t.length <= want.length + 8;
      })
      .sort((x, y) => (x.textContent ?? "").length - (y.textContent ?? "").length);
    return (els[0] as HTMLElement | undefined) ?? null;
  }
  return null;
}

type Rect = { top: number; left: number; width: number; height: number };

function HintLayer({
  hint,
  step,
  total,
  onOk,
  onSkip,
}: {
  hint: QueuedHint;
  step: number;
  total: number;
  onOk: () => void;
  onSkip: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [lost, setLost] = useState(false);
  const scrolled = useRef(false);

  // Раздел может ещё рисоваться: ищем якорь до трёх секунд, потом следим за
  // его положением (прокрутка, раскрытие меню).
  useEffect(() => {
    let alive = true;
    const t0 = Date.now();
    const tick = () => {
      if (!alive) return;
      const el = findAnchor(hint.anchor);
      if (el) {
        if (!scrolled.current) {
          scrolled.current = true;
          const r0 = el.getBoundingClientRect();
          if (r0.top < 60 || r0.bottom > window.innerHeight - 60) {
            el.scrollIntoView({ block: "center", behavior: "smooth" });
          }
        }
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        setLost(false);
      } else if (Date.now() - t0 > 3000) {
        setRect(null);
        setLost(true);
      }
      window.setTimeout(tick, 250);
    };
    tick();
    return () => {
      alive = false;
    };
  }, [hint]);

  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const popW = Math.min(280, vw - 32);
  const pad = 6;
  let popStyle: React.CSSProperties;
  if (rect) {
    const below = rect.top + rect.height + 14;
    const placeBelow = below + 190 < vh || rect.top < 220;
    const top = placeBelow ? below : Math.max(12, rect.top - 14 - 190);
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - popW / 2), vw - popW - 16);
    popStyle = { top, left, width: popW };
  } else {
    popStyle = { top: vh / 2 - 90, left: vw / 2 - popW / 2, width: popW };
  }

  if (!rect && !lost) return null;

  return (
    <div className="rt-hint-layer">
      {rect && (
        <div
          className="rt-spot"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
        />
      )}
      <div className="rt-pop" style={popStyle} role="dialog" aria-label={hint.title}>
        <div className="rt-pop-eyebrow">{hint.eyebrow}</div>
        <div className="rt-pop-title">{hint.title}</div>
        <p className="rt-pop-text">{hint.text}</p>
        <div className="rt-pop-foot">
          {total > 1 && (
            <span className="rt-pop-step">
              {step} из {total}
            </span>
          )}
          <button type="button" className="rt-btn rt-pop-skip" onClick={onSkip}>
            Пропустить
          </button>
          <button type="button" className="rt-btn rt-pop-ok" onClick={onOk}>
            {hint.open ? "Открыть" : "Понятно"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── метка «новое» в меню ───────────────────────── */

/**
 * Разделы с меткой «новое»: новые разделы релиза, пока человек в них не
 * заходил и не прошло 7 дней с выкладки.
 */
export function useNewSections(): (id: string) => boolean {
  const { data: me } = useMe();
  const q = useMyReleaseViews(!!me && !tourSkipped());
  return useMemo(() => {
    if (!q.data) return () => false;
    const fresh = new Set<RouteId>();
    for (const r of RELEASE_TOURS) {
      const until = new Date(`${r.date}T00:00:00`).getTime() + NEW_LABEL_DAYS * 86_400_000;
      if (Date.now() > until) continue;
      const v = q.data.views.find((x) => x.version === r.version);
      const visited = new Set(v?.sectionsVisited ?? []);
      for (const id of newSectionRoutes(r)) if (!visited.has(id)) fresh.add(id);
    }
    return (id: string) => fresh.has(id as RouteId);
  }, [q.data]);
}
