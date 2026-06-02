import { Swiper, SwiperSlide } from "swiper/react";
import { EffectCoverflow } from "swiper/modules";
import { Check, Package } from "lucide-react";
import "swiper/css";
import "swiper/css/effect-coverflow";
import { applicationApi, type RentalEquipment } from "./applicationApi";

/**
 * Coverflow-карусель экипировки (та же «орбита», что и у скутеров). Отличие —
 * мультивыбор: тап по карточке добавляет/убирает позицию (галка). Сверху над
 * карусели — счётчик выбранного.
 */
export function EquipmentCoverflow({
  items,
  selectedIds,
  onToggle,
}: {
  items: RentalEquipment[];
  selectedIds: number[];
  onToggle: (id: number) => void;
}) {
  const selectedCount = items.filter((e) => selectedIds.includes(e.id)).length;

  return (
    <div>
      <div className="mb-2 text-center text-[12px] text-slate-500">
        {selectedCount > 0
          ? `Выбрано: ${selectedCount} ${selectedCount === 1 ? "позиция" : selectedCount < 5 ? "позиции" : "позиций"}`
          : "Листайте · тапните, чтобы добавить (можно несколько)"}
      </div>

      <Swiper
        modules={[EffectCoverflow]}
        effect="coverflow"
        grabCursor
        centeredSlides
        slidesPerView="auto"
        spaceBetween={8}
        coverflowEffect={{
          rotate: 24,
          stretch: 0,
          depth: 150,
          modifier: 1,
          slideShadows: false,
        }}
        className="!overflow-visible !pb-2"
      >
        {items.map((e) => {
          const selected = selectedIds.includes(e.id);
          const free = e.isFree || e.price === 0;
          return (
            <SwiperSlide key={e.id} className="!w-[190px]">
              <button
                type="button"
                onClick={() => onToggle(e.id)}
                className={`group relative w-full overflow-hidden rounded-[24px] border-2 bg-white text-left shadow-lg transition-all ${
                  selected
                    ? "border-slate-900 ring-2 ring-slate-900/15"
                    : "border-slate-200/70"
                }`}
              >
                <div className="relative aspect-square w-full bg-gradient-to-b from-white to-slate-100">
                  {e.avatarUrl ? (
                    <img
                      src={applicationApi.modelAvatarUrl(
                        e.avatarUrl + "?variant=thumb",
                      )}
                      alt={e.name}
                      className="absolute inset-0 h-full w-full object-contain p-3"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300">
                      <Package size={48} strokeWidth={1.2} />
                    </div>
                  )}
                  {selected && (
                    <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg">
                      <Check size={18} strokeWidth={2.4} />
                    </div>
                  )}
                </div>
                <div className="border-t border-slate-100 px-3.5 py-3">
                  <div className="truncate text-[15px] font-bold leading-tight text-slate-900">
                    {e.name}
                  </div>
                  <div
                    className={`mt-0.5 text-[13px] font-semibold ${
                      free ? "text-emerald-600" : "text-slate-500"
                    }`}
                  >
                    {free
                      ? "бесплатно"
                      : `+ ${e.price.toLocaleString("ru-RU")} ₽/сут`}
                  </div>
                </div>
              </button>
            </SwiperSlide>
          );
        })}
      </Swiper>
    </div>
  );
}
