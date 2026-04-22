import React from 'react';
import { Fuel, Gauge, Thermometer } from 'lucide-react';
import { ScooterModel } from '../PricingSection/types';

const images: Record<string, string> = {
  'HDIO2024': 'https://i.postimg.cc/Qtr146ZL/Whats-App-Image-2025-02-03-at-20-01-50-2.jpg',
  'YJOG2024': 'https://i.postimg.cc/Kctkp70F/jog-white.jpg',
  'YGEAR2024': 'https://i.postimg.cc/6QZCfkSL/Whats-App-Image-2025-02-03-at-20-01-50-1.jpg'
};

interface ScooterCardProps {
  model: ScooterModel;
  isSelected?: boolean;
  onClick: () => void;
}

export function ScooterCard({ model, isSelected, onClick }: ScooterCardProps) {
  const specs = model.specs as any;
  const dailyPrice = model.current_pricing.find(p => p.pricing_type === 'daily')?.price || 0;

  return (
    <div 
      onClick={onClick}
      className={`relative transform transition-all duration-300 cursor-pointer group touch-action-pan-x ${
        isSelected 
          ? 'bg-gradient-to-br from-[#00A550]/20 to-[#00A550]/5 scale-[1.02]'
          : 'bg-gray-800/50 hover:scale-[1.02]'
      }`}
      style={{
        borderRadius: '24px',
        boxShadow: isSelected 
          ? '0 8px 32px rgba(0, 165, 80, 0.2)' 
          : '0 8px 32px rgba(0, 0, 0, 0.2)'
      }}
    >
      {/* Выделение активной карточки */}
      {isSelected && (
        <div className="absolute inset-0 rounded-[24px] border-2 border-[#00A550] animate-pulse" />
      )}

      {/* Основной контент */}
      <div className="relative p-4 md:p-6 z-10">
        {/* Бейдж с типом охлаждения */}
        <div className="absolute top-4 right-4 bg-gray-900/90 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 z-20">
          <Thermometer className="w-4 h-4 md:w-5 md:h-5 text-[#00A550]" />
          <span className="text-sm font-medium">{specs.cooling}</span>
        </div>

        {/* Изображение */}
        <div className="relative aspect-[4/3] mb-4 md:mb-6 group-hover:scale-105 transition-transform">
          <img 
            src={images[model.model_code]} 
            alt={model.name}
            className="w-full h-full object-cover rounded-2xl"
            draggable="false"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900/50 to-transparent rounded-2xl" />
        </div>

        {/* Информация */}
        <div>
          <h3 className="text-xl md:text-2xl font-bold mb-4">{model.name}</h3>

          {/* Характеристики */}
          <div className="grid grid-cols-2 gap-3 md:gap-4 mb-4 md:mb-6">
            <div className="bg-gray-900/50 p-3 md:p-4 rounded-xl group-hover:bg-gray-900/70 transition-colors">
              <div className="flex items-center gap-2 mb-1 md:mb-2">
                <Gauge className="w-5 h-5 md:w-6 md:h-6 text-[#00A550] group-hover:scale-110 transition-transform" />
                <span className="text-base md:text-lg">{specs.maxSpeed} км/ч</span>
              </div>
              <span className="text-xs md:text-sm text-gray-400">Макс. скорость</span>
            </div>
            <div className="bg-gray-900/50 p-3 md:p-4 rounded-xl group-hover:bg-gray-900/70 transition-colors">
              <div className="flex items-center gap-2 mb-1 md:mb-2">
                <Fuel className="w-5 h-5 md:w-6 md:h-6 text-[#00A550] group-hover:scale-110 transition-transform" />
                <span className="text-base md:text-lg">{specs.fuelTank}л</span>
              </div>
              <span className="text-xs md:text-sm text-gray-400">Объем бака</span>
            </div>
          </div>

          {/* Цена */}
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs md:text-sm text-gray-400">Стоимость аренды</div>
              <div className="text-xl md:text-2xl font-bold text-[#00A550]">
                от {dailyPrice}₽<span className="text-sm md:text-base font-normal text-gray-400">/день</span>
              </div>
            </div>
            <button className="bg-[#00A550] text-white px-4 md:px-6 py-2 rounded-xl text-sm md:text-base font-medium hover:bg-[#008040] transition-colors transform active:scale-95">
              Выбрать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}