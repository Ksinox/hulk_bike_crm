import React from 'react';
import { X, Gauge, Thermometer, Fuel, Ruler, Bike, Settings } from 'lucide-react';
import { ScooterModel } from '../PricingSection/types';
import { PurchaseCalculator } from '../PricingSection/PurchaseCalculator';

const images: Record<string, string> = {
  'HDIO2024': 'https://i.postimg.cc/Qtr146ZL/Whats-App-Image-2025-02-03-at-20-01-50-2.jpg',
  'YJOG2024': 'https://i.postimg.cc/Kctkp70F/jog-white.jpg',
  'YGEAR2024': 'https://i.postimg.cc/6QZCfkSL/Whats-App-Image-2025-02-03-at-20-01-50-1.jpg'
};

interface ScooterModalProps {
  model: ScooterModel;
  onClose: () => void;
}

export function ScooterModal({ model, onClose }: ScooterModalProps) {
  const specs = model.specs as any;
  const pricing = {
    daily: model.current_pricing.find(p => p.pricing_type === 'daily')?.price || 0,
    weekly: model.current_pricing.find(p => p.pricing_type === 'weekly')?.price || 0,
    monthly: model.current_pricing.find(p => p.pricing_type === 'monthly')?.price || 0
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative bg-gray-900 w-full max-w-6xl rounded-2xl overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white z-10"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Header with Image */}
        <div className="relative h-64 sm:h-80">
          <img 
            src={images[model.model_code]} 
            alt={model.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent"></div>
          <div className="absolute bottom-4 left-4 right-4">
            <h3 className="text-2xl font-bold mb-2">{model.name}</h3>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-1">
                <Gauge className="w-4 h-4 text-[#00A550]" />
                <span>{specs.maxSpeed} км/ч</span>
              </div>
              <div className="flex items-center gap-1">
                <Fuel className="w-4 h-4 text-[#00A550]" />
                <span>{specs.fuelTank}л</span>
              </div>
              <div className="flex items-center gap-1">
                <Thermometer className="w-4 h-4 text-[#00A550]" />
                <span>{specs.cooling}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="p-6 grid md:grid-cols-2 gap-8">
          {/* Left Column - Specs & Pricing */}
          <div className="space-y-8">
            {/* Specifications */}
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[#00A550] font-medium">
                  <Settings className="w-5 h-5" />
                  Двигатель
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Тип:</span>
                    <div className="font-medium">{specs.engine}</div>
                  </div>
                  <div>
                    <span className="text-gray-400">Охлаждение:</span>
                    <div className="font-medium">{specs.cooling}</div>
                  </div>
                  <div>
                    <span className="text-gray-400">Объем:</span>
                    <div className="font-medium">{specs.engineVolume} см³</div>
                  </div>
                  <div>
                    <span className="text-gray-400">Макс. скорость:</span>
                    <div className="font-medium">{specs.maxSpeed} км/ч</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[#00A550] font-medium">
                  <Ruler className="w-5 h-5" />
                  Размеры
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Длина:</span>
                    <div className="font-medium">{specs.length} мм</div>
                  </div>
                  <div>
                    <span className="text-gray-400">Ширина:</span>
                    <div className="font-medium">{specs.width} мм</div>
                  </div>
                  <div>
                    <span className="text-gray-400">Высота:</span>
                    <div className="font-medium">{specs.height} мм</div>
                  </div>
                  <div>
                    <span className="text-gray-400">База:</span>
                    <div className="font-medium">{specs.wheelbase} мм</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[#00A550] font-medium">
                  <Bike className="w-5 h-5" />
                  Шины
                </div>
                <div className="grid grid-cols-1 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Передняя:</span>
                    <div className="font-medium">{specs.tires.front}</div>
                  </div>
                  <div>
                    <span className="text-gray-400">Задняя:</span>
                    <div className="font-medium">{specs.tires.rear}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pricing Cards */}
            <div className="space-y-4">
              <h4 className="text-lg font-bold">Тарифы аренды</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-800 p-4 rounded-lg">
                  <div className="text-sm text-gray-400">День</div>
                  <div className="text-xl font-bold text-[#00A550]">{pricing.daily}₽</div>
                </div>
                <div className="bg-gray-800 p-4 rounded-lg">
                  <div className="text-sm text-gray-400">Неделя</div>
                  <div className="text-xl font-bold text-[#00A550]">{pricing.weekly}₽/день</div>
                </div>
                <div className="bg-gray-800 p-4 rounded-lg">
                  <div className="text-sm text-gray-400">Месяц</div>
                  <div className="text-xl font-bold text-[#00A550]">{pricing.monthly}₽/день</div>
                </div>
              </div>

              <a
                href={`https://wa.me/79958995829?text=Привет!%20👋%20Хочу%20арендовать%20${encodeURIComponent(model.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-[#00A550] text-center py-3 px-6 rounded-xl font-bold text-white hover:bg-[#008040] transition-colors mt-6"
              >
                Арендовать
              </a>
            </div>
          </div>

          {/* Right Column - Purchase Calculator */}
          <div>
            <PurchaseCalculator model={model} />
          </div>
        </div>
      </div>
    </div>
  );
}