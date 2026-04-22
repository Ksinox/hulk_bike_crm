import React, { useState } from 'react';
import { Gauge, Thermometer, Fuel, Ruler, Bike, Settings, Package, Scale, TrendingUp } from 'lucide-react';
import { ScooterModel } from '../PricingSection/types';
import { PurchaseCalculator } from '../PricingSection/PurchaseCalculator';

interface ScooterDetailsProps {
  model: ScooterModel;
}

export function ScooterDetails({ model }: ScooterDetailsProps) {
  const [selectedTariff, setSelectedTariff] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const specs = model.specs as any;
  const pricing = {
    daily: model.current_pricing.find(p => p.pricing_type === 'daily')?.price || 0,
    weekly: model.current_pricing.find(p => p.pricing_type === 'weekly')?.price || 0,
    monthly: model.current_pricing.find(p => p.pricing_type === 'monthly')?.price || 0
  };

  // Расчет экономии для каждого тарифа
  const savings = {
    weekly: {
      perDay: pricing.daily - pricing.weekly,
      total: (pricing.daily - pricing.weekly) * 7
    },
    monthly: {
      perDay: pricing.daily - pricing.monthly,
      total: (pricing.daily - pricing.monthly) * 30
    }
  };

  const getTariffName = (type: 'daily' | 'weekly' | 'monthly') => {
    switch (type) {
      case 'daily': return 'день';
      case 'weekly': return 'неделю';
      case 'monthly': return 'месяц';
    }
  };

  const getWhatsAppMessage = (type: 'daily' | 'weekly' | 'monthly') => {
    const tariffName = getTariffName(type);
    const price = pricing[type];
    return `Привет!%20👋%20Хочу%20арендовать%20${encodeURIComponent(model.name)}%20на%20${tariffName}%20по%20тарифу%20${price}₽/день`;
  };

  return (
    <div className="relative mt-8 px-4 md:px-0">
      {/* Заголовок с названием модели */}
      <div className="absolute -top-16 left-0 right-0">
        <h3 className="text-2xl md:text-3xl font-black text-center" style={{
          textShadow: '2px 2px 0 #00A550'
        }}>
          {model.name}
        </h3>
      </div>

      <div className="bg-gray-900/50 backdrop-blur-lg rounded-2xl border border-gray-800/50">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 p-4 md:p-8">
          {/* Характеристики */}
          <div className="space-y-4 md:space-y-6">
            <h3 className="text-xl md:text-2xl font-bold text-[#00A550] flex items-center gap-2">
              <Settings className="w-5 h-5 md:w-6 md:h-6" />
              Характеристики
            </h3>
            
            <div className="grid gap-4">
              <div className="bg-gray-800/80 p-4 md:p-5 rounded-xl hover:bg-gray-800/60 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#00A550]/20 flex items-center justify-center group-hover:bg-[#00A550]/30 transition-colors">
                    <Settings className="w-5 h-5 md:w-6 md:h-6 text-[#00A550]" />
                  </div>
                  <div>
                    <div className="text-base md:text-lg font-medium">{specs.engine}</div>
                    <div className="text-[#00A550]">{specs.engineVolume} см³</div>
                  </div>
                </div>
                <div className="text-xs md:text-sm text-gray-400">Тип двигателя</div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                {[
                  { icon: Gauge, value: `${specs.maxSpeed} км/ч`, label: 'Макс. скорость' },
                  { icon: Fuel, value: `${specs.fuelTank}л`, label: 'Объем бака' },
                  { icon: Scale, value: `${specs.weight} кг`, label: 'Вес' },
                  { icon: Package, value: specs.seats, label: 'Мест' }
                ].map((item, index) => (
                  <div 
                    key={index}
                    className="bg-gray-800/80 p-3 md:p-4 rounded-xl hover:bg-gray-800/60 transition-colors group"
                  >
                    <div className="flex items-center gap-2 mb-1 md:mb-2">
                      <item.icon className="w-5 h-5 md:w-6 md:h-6 text-[#00A550] group-hover:scale-110 transition-transform" />
                      <span className="text-base md:text-lg">{item.value}</span>
                    </div>
                    <span className="text-xs md:text-sm text-gray-400">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Тарифы */}
          <div className="space-y-4 md:space-y-6">
            <h3 className="text-xl md:text-2xl font-bold text-[#00A550] flex items-center gap-2">
              <Package className="w-5 h-5 md:w-6 md:h-6" />
              Тарифы аренды
            </h3>
            
            <div className="space-y-3 md:space-y-4">
              {[
                { 
                  type: 'daily' as const, 
                  label: 'День', 
                  price: pricing.daily, 
                  minPeriod: 1 
                },
                { 
                  type: 'weekly' as const, 
                  label: 'Неделя', 
                  price: pricing.weekly, 
                  minPeriod: 7,
                  savings: savings.weekly
                },
                { 
                  type: 'monthly' as const, 
                  label: 'Месяц', 
                  price: pricing.monthly, 
                  minPeriod: 30,
                  savings: savings.monthly
                }
              ].map((tariff) => (
                <div
                  key={tariff.type}
                  onClick={() => setSelectedTariff(tariff.type)}
                  className={`relative overflow-hidden p-4 md:p-6 rounded-xl cursor-pointer transform hover:scale-[1.02] transition-all duration-300 ${
                    selectedTariff === tariff.type
                      ? 'bg-gradient-to-br from-[#00A550] to-[#4CAF50]'
                      : 'bg-gray-800/80 hover:bg-gray-800/60'
                  }`}
                >
                  {/* Анимированный фон */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-1500" />
                  
                  <div className="relative">
                    <div className={`text-base md:text-lg mb-1 ${selectedTariff === tariff.type ? 'text-white' : 'text-gray-400'}`}>
                      {tariff.label}
                    </div>
                    <div className={`text-2xl md:text-3xl font-bold ${selectedTariff === tariff.type ? 'text-white' : ''}`}>
                      {tariff.price}₽<span className="text-sm md:text-base font-normal">/день</span>
                    </div>

                    {/* Информация об экономии */}
                    {tariff.savings && (
                      <div className={`mt-2 md:mt-3 ${selectedTariff === tariff.type ? 'text-white/90' : 'text-gray-400'}`}>
                        <div className="flex items-center gap-1.5 text-xs md:text-sm">
                          <TrendingUp className="w-4 h-4" />
                          <span>Экономия {tariff.savings.perDay}₽/день</span>
                        </div>
                        <div className="text-xs md:text-sm mt-1">
                          Всего -{tariff.savings.total}₽ за период
                        </div>
                      </div>
                    )}

                    {selectedTariff === tariff.type && (
                      <div className="text-xs md:text-sm text-white/80 mt-2">
                        Минимум {tariff.minPeriod} {tariff.minPeriod === 1 ? 'день' : 'дней'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <a
              href={`https://wa.me/79958995829?text=${getWhatsAppMessage(selectedTariff)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-[#00A550] text-center py-3 md:py-4 px-6 rounded-xl font-bold text-base md:text-lg text-white hover:bg-[#008040] transition-colors transform hover:scale-[1.02] active:scale-95"
            >
              Арендовать
            </a>
          </div>

          {/* Калькулятор выкупа */}
          <div className="lg:col-span-1">
            <PurchaseCalculator model={model} />
          </div>
        </div>
      </div>
    </div>
  );
}