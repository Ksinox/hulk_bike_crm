import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Download, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  useEffect(() => {
    setVideoError(false);
  }, [index]);

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

  // Свайп влево/вправо на тач-экранах.
  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
    touchX.current = null;
    if (dx > 50) go(-1);
    else if (dx < -50) go(1);
  };

  // Нативный полный экран ОС (на iOS — webkitEnterFullscreen с поворотом для
  // 16:9; на Android/десктопе — requestFullscreen). Вызывается из тапа = жест.
  const videoRef = useRef<HTMLVideoElement>(null);
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

  if (!cur) return null;

  return createPortal(
    // z-[200] над всем; portal в body — иначе fixed «ловится» трансформом
    // родителя (анимация шага мастера), и оверлей не на весь экран.
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/95 animate-fade-in"
      onClick={onClose}
    >
      {/* Верхняя панель */}
      <div
        className="flex items-center justify-between px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)]"
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

      {/* Содержимое */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden px-2 pb-3"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {cur.kind === "photo" ? (
          <img
            key={cur.url}
            src={cur.url}
            alt={cur.name ?? "повреждение"}
            className="max-h-full max-w-full animate-fade-in object-contain"
          />
        ) : cur.processing ? (
          <div className="flex max-w-xs flex-col items-center gap-2 px-8 text-center">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            <span className="text-[14px] font-medium text-white/85">
              Видео обрабатывается…
            </span>
            <span className="text-[12px] text-white/55">
              Готовим версию, которая откроется на любом устройстве. Обычно
              несколько секунд.
            </span>
          </div>
        ) : videoError ? (
          <div className="flex max-w-xs flex-col items-center gap-1.5 px-8 text-center">
            <span className="text-[14px] font-medium text-white/85">
              Предпросмотр видео недоступен в этом браузере.
            </span>
            <span className="text-[12px] text-white/55">
              Видео приложено к акту — оно сохранится и будет доступно после
              «Сохранить».
            </span>
          </div>
        ) : (
          // muted+autoPlay+playsInline — самый надёжный способ показать кадр
          // видео встроенно на iOS (без чёрного экрана); poster — пока грузится.
          // Звук включается тапом по контролам.
          <video
            key={cur.url}
            ref={videoRef}
            src={cur.url}
            poster={cur.poster || undefined}
            controls
            autoPlay
            muted
            playsInline
            preload="auto"
            className="max-h-full max-w-full bg-black"
            onError={() => setVideoError(true)}
          />
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

      {/* Точки-индикаторы */}
      {items.length > 1 && (
        <div
          className="flex flex-wrap justify-center gap-1.5 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
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
    </div>,
    document.body,
  );
}
