import React from 'react';
import { Calendar, CalendarDays, CalendarRange, CreditCard } from 'lucide-react';
import { ScooterModel, PricingPlan } from './types';

interface PricingCardsProps {
  model: ScooterModel;
}

export function PricingCards({ model }: PricingCardsProps) {
  const getPricing = (type: string) => {
    return model.current_pricing.find(p => p.pricing_type === type)?.price || 0;
  };

  const plans: PricingPlan[] = [
    {
      name: 'День',
      icon: 'Calendar',
      price: getPricing('daily'),
      period: 'день',
      features: [
        'Минимальный период аренды 3 дня',
        'Идеально для тест-драйва'
      ],
      color: 'from-[#1a4f7a] to-[#2d89c5]',
      popular: false,
      note: `Стоимость указана за ${model.name}`,
      minPeriod: 3,
      maxPeriod: 6
    },
    {
      name: 'Неделя',
      icon: 'CalendarRange',
      price: getPricing('weekly') * 7,
      oldPrice: getPricing('daily') * 7,
      period: '7 дней',
      features: [
        `Экономия ${getPricing('daily') * 7 - getPricing('weekly') * 7}₽`,
        `${getPricing('weekly')}₽ в день`
      ],
      color: 'from-[#2d1b4d] to-[#6b3fa0]',
      popular: false,
      note: `Стоимость указана за ${model.name}`,
      minPeriod: 7,
      maxPeriod: 29
    },
    {
      name: 'Месяц',
      icon: 'CalendarDays',
      price: getPricing('monthly') * 30,
      oldPrice: getPricing('daily') * 30,
      period: '30 дней',
      features: [
        `Экономия ${getPricing('daily') * 30 - getPricing('monthly') * 30}₽`,
        `${getPricing('monthly')}₽ в день`
      ],
      color: 'from-[#1f4d3d] to-[#00A550]',
      popular: true,
      note: `Стоимость указана за ${model.name}`,
      minPeriod: 30,
      maxPeriod: 365
    },
    {
      name: 'Выкуп',
      icon: 'CreditCard',
      price: getPricing('purchase'),
      period: 'день',
      features: [
        `Всего ${getPricing('purchase') * 30}₽ за 30 дней`,
        'Скутер остаётся у вас',
        `Экономия ${getPricing('daily') * 30 - getPricing('purchase') * 30}₽`
      ],
      color: 'from-[#4d1b1b] to-[#a03f3f]',
      popular: false,
      isPurchase: true,
      note: `Стоимость указана за ${model.name}`,
      minPeriod: 90,
      maxPeriod: 365
    }
  ];

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Calendar': return <Calendar className="w-8 h-8" />;
      case 'CalendarRange': return <CalendarRange className="w-8 h-8" />;
      case 'CalendarDays': return <CalendarDays className="w-8 h-8" />;
      case 'CreditCard': return <CreditCard className="w-8 h-8" />;
      default: return null;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {plans.map((plan, index) => (
        <div
          key={plan.name}
          className="relative"
          data-aos="fade-up"
          data-aos-delay={index * 100}
        >
          {plan.popular && (
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-[#00A550] to-[#4CAF50] text-white px-6 py-1 rounded-full text-sm font-bold z-20 shadow-lg">
              Популярный
            </div>
          )}
          <div
            className={`relative p-6 rounded-2xl transform hover:scale-105 transition-all duration-300 overflow-hidden backdrop-blur-lg ${
              plan.popular ? 'bg-gradient-to-b from-gray-800/90 to-gray-900/90' : 'bg-gradient-to-b from-gray-800/80 to-gray-900/80'
            } h-full border border-gray-700/50`}
            style={{
              boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
            }}
          >
            {/* Gradient Background */}
            <div className={`absolute inset-0 bg-gradient-to-br ${plan.color} opacity-10`} />
            
            {/* Animated Glow Effect */}
            <div className="absolute -inset-2 bg-gradient-to-r from-transparent via-white/5 to-transparent blur-xl animate-glow" />

            {/* Content */}
            <div className="relative z-10">
              <div
                className={`w-16 h-16 rounded-2xl mb-6 flex items-center justify-center bg-gradient-to-br ${plan.color}`}
              >
                {getIcon(plan.icon)}
              </div>

              <h3 className="text-2xl font-bold mb-4">{plan.name}</h3>

              <div className="mb-6">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-black bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                    {plan.price}₽
                  </span>
                  <span className="text-gray-400 mb-1">/ {plan.period}</span>
                </div>
                {plan.oldPrice && (
                  <div className="text-gray-500 line-through text-sm mt-1">
                    {plan.oldPrice}₽
                  </div>
                )}
              </div>

              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-gray-300">
                    <span className="text-[#00A550] text-lg">•</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <p className="text-sm text-gray-400 mb-6">{plan.note}</p>

              <a
                href={`https://wa.me/79958995829?text=Привет!%20👋%20Хочу%20арендовать%20${encodeURIComponent(model.name)}%20на%20${plan.name.toLowerCase()}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full py-3 px-6 rounded-xl font-bold transition-all duration-300 block text-center ${
                  plan.isPurchase
                    ? 'bg-gradient-to-r from-[#00A550] to-[#4CAF50] hover:from-[#008040] hover:to-[#3d8b40] text-white shadow-lg shadow-[#00A550]/20'
                    : 'bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500 text-white'
                }`}
              >
                Выбрать
              </a>
            </div>

            {/* Decorative Elements */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/5 to-transparent rounded-full blur-2xl" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-white/5 to-transparent rounded-full blur-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}