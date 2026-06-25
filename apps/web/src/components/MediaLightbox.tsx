import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Download, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Лупа-увеличитель фото: размер квадратика и кратность зума.
const LOUPE_SIZE = 132; // px
const LOUPE_ZOOM = 2.6;

// Кэш video-элементов между открытиями лайтбокса: повторный тап по тому же
// ролику НЕ перекачивает его заново — буфер остаётся в переиспользуемом
// элементе. Ограничиваем ~6 роликами, чтобы не есть память.
const videoElCache = new Map<string, HTMLVideoElement>();

/**
 * Полноэкранный просмотрщик фото/видео (lightbox) — современный паттерн как в
 * iOS Photos / PhotoSwipe: затемнённый фон, фото по размеру экрана, видео
 * проигрывается ВСТРОЕННО (а не открывается сырым файлом в новой вкладке),
 * листание свайпом (мобила) и стрелками/клавиатурой (десктоп), счётчик и
 * точки-индикаторы, скачивание оригинала, закрытие по фону/Esc/×.
 *
 * Используется для просмотра приложенных к акту ущерба медиа.
 */
export type LightboxItem = {
  kind: "photo" | "video";
  /** URL для показа: view-вариант фото / оригинал видео / локальный objectURL. */
  url: string;
  /** Кадр-постер для видео (чтобы не было чёрного экрана до запуска). */
  poster?: string;
  /** Видео ещё перекодируется на сервере — показываем «обрабатывается». */
  processing?: boolean;
  /** URL оригинала для скачивания (если есть). */
  downloadUrl?: string;
  durationSec?: number | null;
  name?: string;
};

export function MediaLightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: LightboxItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const cur = items[index];
  const canPrev = index > 0;
  const canNext = index < items.length - 1;
  // Сброс ошибки видео при смене кадра.
  const [videoError, setVideoError] = useState(false);
  // Как видео заполняет экран: "cover" = на весь экран без рамок (как
  // рилсы/шортсы, слегка обрезает края) / "contain" = вписать целиком (видно
  // весь кадр). Зафиксировано в "contain": видео всегда вписано, переключатель
  // «вписать/заполнить» убран (для весь-экран — отдельная кнопка).
  const [videoFit] = useState<"cover" | "contain">("contain");
  // Лупа для фото: долгий тап → квадратик с увеличенным участком над пальцем.
  const imgRef = useRef<HTMLImageElement>(null);
  const [loupe, setLoupe] = useState<{
    sx: number;
    sy: number;
    px: number;
    py: number;
    iw: number;
    ih: number;
  } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const startPt = useRef<{ x: number; y: number } | null>(null);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const isSwipe = useRef(false);
  useEffect(() => {
    setVideoError(false);
    setLoupe(null);
    // cur.url меняется, когда видео доготовилось (оригинал → mp4) — сбрасываем
    // ошибку, чтобы готовая универсальная версия проигралась.
  }, [index, cur.url]);
  useEffect(
    () => () => {
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
    },
    [],
  );

  const go = (d: number) => {
    const n = index + d;
    if (n >= 0 && n < items.length) onIndexChange(n);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length]);

  // Тач по ФОТО: долгий тап (~240мс без сдвига) → лупа, следует за пальцем;
  // быстрый горизонтальный свайп → листание. Различаем по удержанию/смещению.
  const showLoupeAt = (x: number, y: number) => {
    const img = imgRef.current;
    if (!img) return;
    const r = img.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const px = Math.max(0, Math.min(1, (x - r.left) / r.width));
    const py = Math.max(0, Math.min(1, (y - r.top) / r.height));
    setLoupe({ sx: x, sy: y, px, py, iw: r.width, ih: r.height });
  };
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    startPt.current = { x: t.clientX, y: t.clientY };
    lastPt.current = { x: t.clientX, y: t.clientY };
    isSwipe.current = false;
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    if (cur.kind === "photo") {
      holdTimer.current = window.setTimeout(() => {
        if (!isSwipe.current && lastPt.current) {
          showLoupeAt(lastPt.current.x, lastPt.current.y);
        }
      }, 240);
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    lastPt.current = { x: t.clientX, y: t.clientY };
    if (loupe) {
      showLoupeAt(t.clientX, t.clientY);
      return;
    }
    const s = startPt.current;
    if (s && (Math.abs(t.clientX - s.x) > 12 || Math.abs(t.clientY - s.y) > 12)) {
      isSwipe.current = true;
      if (holdTimer.current) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (loupe) {
      // лупа была активна → просто прячем, без листания
      setLoupe(null);
      startPt.current = null;
      return;
    }
    const s = startPt.current;
    startPt.current = null;
    if (!s) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - s.x;
    if (dx > 50) go(-1);
    else if (dx < -50) go(1);
  };

  // Нативный полный экран ОС (на iOS — webkitEnterFullscreen с поворотом для
  // 16:9; на Android/десктопе — requestFullscreen). Вызывается из тапа = жест.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const goFullscreen = () => {
    const v = videoRef.current as
      | (HTMLVideoElement & {
          webkitEnterFullscreen?: () => void;
          webkitRequestFullscreen?: () => void;
        })
      | null;
    if (!v) return;
    if (typeof v.webkitEnterFullscreen === "function") v.webkitEnterFullscreen();
    else if (typeof v.requestFullscreen === "function") void v.requestFullscreen();
    else if (typeof v.webkitRequestFullscreen === "function")
      v.webkitRequestFullscreen();
  };

  // A: переиспользуем video-элемент между открытиями — повторный тап не качает
  // ролик заново. Монтируем кэшированный элемент в host; при закрытии детачим
  // (но оставляем в кэше с буфером). Класс «вписать/заполнить» меняем на лету.
  const videoHostRef = useRef<HTMLDivElement>(null);
  const fitClass = (fit: "cover" | "contain") =>
    cn(
      "bg-black",
      fit === "cover"
        ? "h-full w-full object-cover"
        : "max-h-full max-w-full object-contain",
    );
  useEffect(() => {
    if (cur.kind !== "video" || videoError) return;
    const host = videoHostRef.current;
    if (!host) return;
    let el = videoElCache.get(cur.url);
    if (!el) {
      el = document.createElement("video");
      el.src = cur.url;
      el.controls = true;
      el.muted = true;
      el.playsInline = true;
      el.setAttribute("playsinline", "");
      el.setAttribute("webkit-playsinline", "");
      el.preload = "auto";
      if (cur.poster) el.poster = cur.poster;
      videoElCache.set(cur.url, el);
      if (videoElCache.size > 6) {
        for (const [k, v] of videoElCache) {
          if (k === cur.url) continue;
          v.removeAttribute("src");
          try {
            v.load();
          } catch {
            /* ignore */
          }
          videoElCache.delete(k);
          break;
        }
      }
    }
    const videoEl = el;
    videoEl.className = fitClass(videoFit);
    videoRef.current = videoEl;
    const onErr = () => setVideoError(true);
    videoEl.addEventListener("error", onErr);
    host.appendChild(videoEl);
    try {
      videoEl.currentTime = 0;
    } catch {
      /* ignore */
    }
    void videoEl.play().catch(() => {});
    return () => {
      videoEl.removeEventListener("error", onErr);
      videoEl.pause();
      if (videoEl.parentNode === host) host.removeChild(videoEl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur.kind, cur.url, cur.poster, videoError]);
  useEffect(() => {
    if (videoRef.current) videoRef.current.className = fitClass(videoFit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFit]);

  if (!cur) return null;

  return createPortal(
    // z-[200] над всем; portal в body — иначе fixed «ловится» трансформом
    // родителя (анимация шага мастера), и оверлей не на весь экран.
    <div
      className="fixed inset-0 z-[200] bg-black animate-fade-in"
      onClick={onClose}
    >
      {/* Верхняя панель — поверх медиа (оверлей), чтобы видео/фото занимали
          ВЕСЬ экран. */}
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[13px] font-medium tabular-nums text-white/80">
          {index + 1} / {items.length}
        </span>
        <div className="flex items-center gap-1">
          {cur.kind === "video" && !cur.processing && !videoError && (
            <button
              type="button"
              onClick={goFullscreen}
              aria-label="Во весь экран"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10"
            >
              <Maximize2 size={18} />
            </button>
          )}
          {cur.downloadUrl && (
            <a
              href={cur.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10"
              onClick={(e) => e.stopPropagation()}
              aria-label="Скачать оригинал"
            >
              <Download size={18} />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10"
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Содержимое — на ВЕСЬ экран (медиа object-contain заполняет область). */}
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {cur.kind === "photo" ? (
          <img
            key={cur.url}
            ref={imgRef}
            src={cur.url}
            alt={cur.name ?? "повреждение"}
            className="max-h-full max-w-full animate-fade-in object-contain"
          />
        ) : videoError ? (
          cur.processing ? (
            // Оригинал не проигрался на ЭТОМ устройстве (напр. HEVC на Android),
            // а универсальная версия ещё готовится в фоне.
            <div className="flex max-w-xs flex-col items-center gap-2 px-8 text-center">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span className="text-[14px] font-medium text-white/85">
                Готовим версию для этого устройства…
              </span>
              <span className="text-[12px] text-white/55">
                Видео уже сохранено. Универсальная версия откроется автоматически,
                как будет готова.
              </span>
            </div>
          ) : (
            <div className="flex max-w-xs flex-col items-center gap-1.5 px-8 text-center">
              <span className="text-[14px] font-medium text-white/85">
                Предпросмотр видео недоступен в этом браузере.
              </span>
              <span className="text-[12px] text-white/55">
                Видео приложено к акту — оно сохранится и будет доступно после
                «Сохранить».
              </span>
            </div>
          )
        ) : (
          // Играем СРАЗУ. Пока сервер готовит универсальную версию (processing),
          // показываем оригинал — на устройстве записи он проигрывается. Ждать
          // обработки не нужно: внизу — ненавязчивый индикатор «готовим».
          <>
            <div
              ref={videoHostRef}
              className="flex h-full w-full items-center justify-center"
            />
            {cur.processing && (
              <div className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top)+3.25rem)] z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-medium text-white/90 backdrop-blur-sm">
                <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Готовим версию для других устройств…
              </div>
            )}
          </>
        )}

        {canPrev && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:flex"
            aria-label="Назад"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {canNext && (
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:flex"
            aria-label="Вперёд"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* Точки-индикаторы — поверх медиа снизу. */}
      {items.length > 1 && (
        <div
          className={cn(
            "absolute inset-x-0 z-10 flex flex-wrap justify-center gap-1.5 px-4",
            // Видео: нативные контролы внизу — поднимаем точки над ними, чтобы
            // не налегали. Фото: точки у самого низа с градиентом-подложкой.
            cur.kind === "video"
              ? "bottom-[3.5rem]"
              : "bottom-0 bg-gradient-to-t from-black/50 to-transparent pb-[max(env(safe-area-inset-bottom),1rem)] pt-6",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onIndexChange(i)}
              aria-label={`Медиа ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-6 bg-white" : "w-1.5 bg-white/40",
              )}
            />
          ))}
        </div>
      )}

      {/* Лупа: квадратик с увеличенным участком фото над пальцем. Фон —
          тот же URL фото, увеличенный в LOUPE_ZOOM раз и спозиционированный
          так, чтобы точка под пальцем оказалась в центре лупы. */}
      {loupe && cur.kind === "photo" && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-30 overflow-hidden rounded-2xl border-2 border-white/85 shadow-2xl ring-1 ring-black/40"
          style={{
            width: LOUPE_SIZE,
            height: LOUPE_SIZE,
            left: Math.max(
              6,
              Math.min(
                window.innerWidth - LOUPE_SIZE - 6,
                loupe.sx - LOUPE_SIZE / 2,
              ),
            ),
            top:
              loupe.sy - LOUPE_SIZE - 28 >= 6
                ? loupe.sy - LOUPE_SIZE - 28
                : loupe.sy + 28,
            backgroundColor: "#000",
            backgroundImage: `url("${cur.url}")`,
            backgroundRepeat: "no-repeat",
            backgroundSize: `${loupe.iw * LOUPE_ZOOM}px ${loupe.ih * LOUPE_ZOOM}px`,
            backgroundPosition: `${LOUPE_SIZE / 2 - loupe.px * loupe.iw * LOUPE_ZOOM}px ${LOUPE_SIZE / 2 - loupe.py * loupe.ih * LOUPE_ZOOM}px`,
          }}
        >
          <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60" />
        </div>
      )}
    </div>,
    document.body,
  );
}
