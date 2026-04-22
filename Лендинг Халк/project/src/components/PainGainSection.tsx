import React from 'react';
import { PersonStanding, Car, Zap, Bike } from 'lucide-react';

export function PainGainSection() {
  const options = [
    {
      icon: PersonStanding,
      title: 'Пешком',
      description: 'мало заказов, низкий доход',
      type: 'negative'
    },
    {
      icon: Car,
      title: 'Машина',
      description: 'дорого, пробки, сложная парковка',
      type: 'negative'
    },
    {
      icon: Zap,
      title: 'Электротранспорт',
      description: 'быстро разряжается, привязка к станциям',
      type: 'negative'
    },
    {
      icon: Bike,
      title: 'Скутер',
      description: 'максимальная мобильность, выгодная аренда, высокая скорость доставки',
      type: 'positive'
    }
  ];

  return (
    <div className="mb-16">
      <h2 className="text-3xl font-black mb-8 text-center transform -skew-x-12" style={{
        textShadow: '4px 4px 0 #00A550',
        WebkitTextStroke: '2px #00A550'
      }}>
        ПОЧЕМУ КУРЬЕРАМ ЭТО ВЫГОДНО?
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {options.map((option, index) => {
          const Icon = option.icon;
          return (
            <div
              key={index}
              className={`relative p-6 rounded-lg transform hover:scale-105 transition-transform ${
                option.type === 'positive' ? 'bg-[#00A550]' : 'bg-gray-800'
              }`}
              style={{
                boxShadow: '6px 6px 0 rgba(0,0,0,0.5)'
              }}
            >
              <div className="absolute inset-0 bg-white opacity-10" style={{
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.1) 5px, rgba(0,0,0,0.1) 10px)'
              }}></div>
              
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={`w-6 h-6 ${option.type === 'positive' ? 'text-white' : 'text-gray-400'}`} />
                  <span className={`text-lg font-bold ${option.type === 'positive' ? 'text-white' : 'text-gray-300'}`}>
                    {option.title}
                  </span>
                  <span className={`text-2xl ml-auto ${option.type === 'positive' ? '✅' : '❌'}`}>
                    {option.type === 'positive' ? '✅' : '❌'}
                  </span>
                </div>
                <p className={`text-sm ${option.type === 'positive' ? 'text-white' : 'text-gray-400'}`}>
                  {option.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}