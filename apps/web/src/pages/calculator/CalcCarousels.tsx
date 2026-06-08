import { useEffect, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperClass } from "swiper/types";
import { EffectCoverflow } from "swiper/modules";
import { Bike, Check, Package } from "lucide-react";
import "swiper/css";
import "swiper/css/effect-coverflow";
import type { ApiScooterModel } from "@/lib/api/scooter-models";
import type { ApiEquipmentItem } from "@/lib/api/equipment";
import { fileUrl } from "@/lib/files";
import { rateForDays, rub } from "@/lib/calc/rentalQuote";

/**
 * Компактные coverflow-карусели для калькулятора — тот же «орбитальный»
 * слайдер, что в публичной анкете (public/ScooterCoverflow), но на данных
 * CRM (ApiScooterModel / ApiEquipmentItem), с fileUrl и брендовыми токенами.
 * Аватарки моделей/экипировки — публичные ассеты, crossOrigin не нужен
 * (как в каталогах CRM).
 */

const COVERFLOW = {
  rotate: 22,
  stretch: 0,
  depth: 110,
  modifier: 1,
  slideShadows: false,
} as const;

export function CalcModelCarousel({
  models,
  valueId,
  days,
  onSelect,
}: {
  models: ApiScooterModel[];
  valueId: number | null;
  /** Текущее число дней — чтобы показать ставку именно для этого срока. */
  days: number;
  onSelect: (id: number | null) => void;
}) {
  const swiperRef = useRef<SwiperClass | null>(null);
  const initialIdx = Math.max(
    0,
    models.findIndex((m) => m.id === valueId),
  );
  const [activeIdx, setActiveIdx] = useState(initialIdx);

  // Выбор пришёл снаружи (загрузка варианта из истории) — центрируем на нём.
  useEffect(() => {
    const idx = models.findIndex((m) => m.id === valueId);
    if (idx >= 0 && idx !== activeIdx) {
      setActiveIdx(idx);
      swiperRef.current?.slideTo(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueId, models.length]);

  // Авто-выбор отцентрованной модели: живой пересчёт при пролистывании и
  // сразу при открытии. Если выбор сброшен (valueId=null) — берём текущую
  // центральную карточку (в калькуляторе модель выбрана всегда).
  useEffect(() => {
    if (valueId == null && models.length > 0) {
      const idx = Math.min(Math.max(0, activeIdx), models.length - 1);
      onSelect(models[idx]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueId, models.length, activeIdx]);

  if (models.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-soft px-4 py-5 text-center text-[12px] text-muted">
        Нет активных моделей в каталоге «Скутеры → Модели».
      </div>
    );
  }

  const centered = models[activeIdx] ?? models[0] ?? null;

  return (
    <div>
      <Swiper
        modules={[EffectCoverflow]}
        effect="coverflow"
        grabCursor
        centeredSlides
        slidesPerView="auto"
        spaceBetween={6}
        initialSlide={initialIdx}
        coverflowEffect={COVERFLOW}
        onSwiper={(s) => {
          swiperRef.current = s;
        }}
        onSlideChange={(s) => {
          setActiveIdx(s.activeIndex);
          const m = models[s.activeIndex];
          if (m) onSelect(m.id);
        }}
        className="!overflow-visible !pb-1"
      >
        {models.map((m, i) => {
          const selected = valueId === m.id;
          // Единое правило проекта: аватарки — всегда avatarKey (прозрачный
          // оригинал PNG/WebP), НЕ avatarThumbKey (кропнутый JPEG, у которого
          // альфа залита чёрным). variant:"thumb" сервер ресайзит сохраняя альфу.
          const src = fileUrl(m.avatarKey, { variant: "thumb" });
          const rate = rateForDays(m, days);
          return (
            <SwiperSlide key={m.id} className="!w-[150px]">
              <button
                type="button"
                onClick={() => {
                  swiperRef.current?.slideTo(i);
                  setActiveIdx(i);
                  onSelect(m.id);
                }}
                className={`group relative w-full overflow-hidden rounded-[18px] border-2 bg-surface text-left shadow-card-sm transition-all ${
                  selected ? "border-ink ring-2 ring-ink/10" : "border-border"
                }`}
              >
                <div className="relative aspect-[4/5] w-full bg-gradient-to-b from-surface-soft to-border/40">
                  {src ? (
                    <img
                      src={src}
                      alt={m.name}
                      className="absolute inset-0 h-full w-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-2">
                      <Bike size={40} strokeWidth={1.3} />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-2.5">
                    <div className="truncate text-[14px] font-extrabold leading-tight text-white drop-shadow">
                      {m.name}
                    </div>
                    <div className="text-[11px] font-semibold text-white/85">
                      {rub(rate)} ₽/сут
                    </div>
                  </div>
                  {selected && (
                    <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white shadow">
                      <Check size={14} strokeWidth={2.6} />
                    </div>
                  )}
                </div>
              </button>
            </SwiperSlide>
          );
        })}
      </Swiper>

      <div className="mt-1 text-center text-[11px] text-muted">
        {centered ? (
          <>
            тариф{" "}
            <span className="font-semibold text-ink/70">{centered.name}</span>{" "}
            на {days} дн · {rub(rateForDays(centered, days))} ₽/сут
          </>
        ) : (
          "листайте · тап = выбрать"
        )}
      </div>
    </div>
  );
}

export function CalcEquipmentCarousel({
  items,
  selectedIds,
  onToggle,
}: {
  items: ApiEquipmentItem[];
  selectedIds: number[];
  onToggle: (id: number) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-soft px-4 py-4 text-center text-[12px] text-muted">
        Каталог экипировки пуст.
      </div>
    );
  }
  const selectedCount = items.filter((e) => selectedIds.includes(e.id)).length;

  return (
    <div>
      <Swiper
        modules={[EffectCoverflow]}
        effect="coverflow"
        grabCursor
        centeredSlides
        slidesPerView="auto"
        spaceBetween={6}
        coverflowEffect={COVERFLOW}
        className="!overflow-visible !pb-1"
      >
        {items.map((e) => {
          const selected = selectedIds.includes(e.id);
          const free = e.isFree || e.price === 0;
          // Единое правило: avatarKey (прозрачный), не avatarThumbKey (JPEG/чёрный фон).
          const src = fileUrl(e.avatarKey, { variant: "thumb" });
          return (
            <SwiperSlide key={e.id} className="!w-[128px]">
              <button
                type="button"
                onClick={() => onToggle(e.id)}
                className={`group relative w-full overflow-hidden rounded-[16px] border-2 bg-surface text-left shadow-card-sm transition-all ${
                  selected ? "border-ink ring-2 ring-ink/10" : "border-border"
                }`}
              >
                <div className="relative aspect-square w-full bg-gradient-to-b from-surface to-surface-soft">
                  {src ? (
                    <img
                      src={src}
                      alt={e.name}
                      className="absolute inset-0 h-full w-full object-contain p-2.5"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-2">
                      <Package size={34} strokeWidth={1.3} />
                    </div>
                  )}
                  {selected && (
                    <div className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white shadow">
                      <Check size={13} strokeWidth={2.6} />
                    </div>
                  )}
                </div>
                <div className="border-t border-border px-2.5 py-2">
                  <div className="truncate text-[12.5px] font-bold leading-tight text-ink">
                    {e.name}
                  </div>
                  <div
                    className={`mt-0.5 text-[11.5px] font-semibold ${
                      free ? "text-green-ink" : "text-muted"
                    }`}
                  >
                    {free ? "бесплатно" : `+ ${rub(e.price)} ₽/сут`}
                  </div>
                </div>
              </button>
            </SwiperSlide>
          );
        })}
      </Swiper>

      <div className="mt-1 text-center text-[11px] text-muted">
        {selectedCount > 0
          ? `выбрано: ${selectedCount}`
          : "листайте · тап = добавить (можно несколько)"}
      </div>
    </div>
  );
}
