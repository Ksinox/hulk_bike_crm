import { useEffect, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperClass } from "swiper/types";
import { EffectCoverflow } from "swiper/modules";
import { Bike, Check } from "lucide-react";
import "swiper/css";
import "swiper/css/effect-coverflow";
import { applicationApi, type RentalModel } from "./applicationApi";

/**
 * Coverflow-карусель скутеров для публичной анкеты (шаг «модель»).
 * Карточки летят «по орбите» — центральная крупно, соседние выглядывают по
 * краям и наклонены. Свайп/перетаскивание листает. Сверху — тарифы того
 * скутера, что сейчас в центре (меняются вместе с карточкой). Тап по карточке
 * = выбрать модель.
 */

const TARIFF_TIERS: { label: string; key: keyof RentalModel }[] = [
  { label: "1–2 дня", key: "dayRate" },
  { label: "3–6 дней", key: "shortRate" },
  { label: "7–29 дней", key: "weekRate" },
  { label: "30+ дней", key: "monthRate" },
];

export function ScooterCoverflow({
  models,
  value,
  onSelect,
}: {
  models: RentalModel[];
  /** Имя выбранной модели ("" если не выбрана). */
  value: string;
  onSelect: (name: string) => void;
}) {
  const swiperRef = useRef<SwiperClass | null>(null);
  // Индекс карточки в центре (для показа её тарифов сверху). Стартуем с
  // выбранной модели, иначе с первой.
  const initialIdx = Math.max(
    0,
    models.findIndex((m) => m.name === value),
  );
  const [activeIdx, setActiveIdx] = useState(initialIdx);

  // Если выбор пришёл снаружи (восстановление черновика) — центрируем на нём.
  useEffect(() => {
    const idx = models.findIndex((m) => m.name === value);
    if (idx >= 0 && idx !== activeIdx) {
      setActiveIdx(idx);
      swiperRef.current?.slideTo(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, models.length]);

  const centered = models[activeIdx] ?? models[0] ?? null;

  return (
    <div>
      {/* Тарифы скутера в центре — «прилетают» вместе с карточкой. */}
      {centered && (
        <div key={centered.id} className="mb-3 animate-[fadeUp_.28s_ease]">
          <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
          <div className="mb-1.5 text-center text-[12px] text-slate-500">
            Тарифы <span className="font-semibold text-slate-700">{centered.name}</span> · ₽/сут
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {TARIFF_TIERS.map((t) => (
              <div
                key={t.key}
                className="rounded-xl border border-slate-200 bg-white px-1 py-2 text-center"
              >
                <div className="text-[16px] font-extrabold leading-none tabular-nums text-slate-900">
                  {Number(centered[t.key]).toLocaleString("ru-RU")}
                </div>
                <div className="mt-1 text-[9.5px] uppercase leading-tight tracking-wide text-slate-400">
                  {t.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Сама карусель — coverflow с орбитальным наклоном соседей. */}
      <Swiper
        modules={[EffectCoverflow]}
        effect="coverflow"
        grabCursor
        centeredSlides
        slidesPerView="auto"
        spaceBetween={8}
        initialSlide={initialIdx}
        coverflowEffect={{
          rotate: 24,
          stretch: 0,
          depth: 160,
          modifier: 1,
          slideShadows: false,
        }}
        onSwiper={(s) => {
          swiperRef.current = s;
        }}
        onSlideChange={(s) => setActiveIdx(s.activeIndex)}
        className="!overflow-visible !pb-2"
      >
        {models.map((m, i) => {
          const selected = value === m.name;
          const fromRate = Math.min(
            m.dayRate,
            m.shortRate,
            m.weekRate,
            m.monthRate,
          );
          return (
            <SwiperSlide key={m.id} className="!w-[210px]">
              <button
                type="button"
                onClick={() => {
                  if (i !== activeIdx) {
                    swiperRef.current?.slideTo(i);
                    setActiveIdx(i);
                  }
                  onSelect(selected ? "" : m.name);
                }}
                className={`group relative w-full overflow-hidden rounded-[26px] border-2 bg-white text-left shadow-lg transition-all ${
                  selected
                    ? "border-slate-900 ring-2 ring-slate-900/15"
                    : "border-slate-200/70"
                }`}
              >
                {/* Аватарка скутера — крупно, на мягком градиенте. */}
                <div className="relative aspect-[4/5] w-full bg-gradient-to-b from-slate-50 to-slate-200">
                  {m.avatarUrl ? (
                    <img
                      src={applicationApi.modelAvatarUrl(
                        m.avatarUrl + "?variant=view",
                      )}
                      alt={m.name}
                      className="absolute inset-0 h-full w-full object-cover"
                      draggable={false}
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300">
                      <Bike size={64} strokeWidth={1.2} />
                    </div>
                  )}
                  {/* затемнение снизу под подпись */}
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3.5">
                    <div className="min-w-0">
                      <div className="truncate text-[20px] font-extrabold leading-tight text-white drop-shadow">
                        {m.name}
                      </div>
                      <div className="text-[12.5px] font-medium text-white/85">
                        от {fromRate.toLocaleString("ru-RU")} ₽/сут
                      </div>
                    </div>
                  </div>
                  {selected && (
                    <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg">
                      <Check size={18} strokeWidth={2.4} />
                    </div>
                  )}
                </div>
              </button>
            </SwiperSlide>
          );
        })}
      </Swiper>

      <div className="mt-1 text-center text-[12px] text-slate-500">
        {value
          ? `Выбрано: ${value}`
          : "Листайте вбок · тапните по скутеру, чтобы выбрать"}
      </div>
    </div>
  );
}
