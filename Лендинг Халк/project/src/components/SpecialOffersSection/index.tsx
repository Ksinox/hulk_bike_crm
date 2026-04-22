import React from 'react';
import { OfferCard } from './OfferCard';
import { LoyaltyProgram } from './LoyaltyProgram';
import { Offer } from './types';

const offers: Offer[] = [
  {
    id: 1,
    title: "Приведи друга",
    description: "Получи 2000₽ за каждого приведенного друга",
    icon: "🎁",
    discount: "2000₽",
    conditions: [
      "Друг должен арендовать скутер минимум на 7 дней",
      "Бонус начисляется частями в течении месяца по 500₽ в неделю"
    ],
    isPopular: true
  },
  {
    id: 2,
    title: "Долгосрочная аренда",
    description: "Скидки при длительной аренде скутера",
    icon: "📅",
    discount: "До 20% скидка",
    conditions: [
      "От 2 месяцев: скидка 10%",
      "От 6 месяцев: скидка 15%",
      "От 12 месяцев: скидка 20%"
    ],
    note: "Акция действует при условии непрерывной аренды"
  },
  {
    id: 3,
    title: "Тест-драйв",
    description: "Попробуй скутер перед арендой",
    icon: "🚀",
    discount: "Бесплатно",
    conditions: [
      "Тестовая поездка до 10 минут",
      "Оцени качество техники",
      "Без обязательств"
    ]
  }
];

export function SpecialOffersSection() {
  return (
    <div className="mt-24 mb-24" data-aos="fade-up">
      <h2 className="text-4xl font-black mb-12 text-center transform -skew-x-12" style={{
        textShadow: '4px 4px 0 #00A550',
        WebkitTextStroke: '2px #00A550'
      }}>
        АКЦИИ И СПЕЦПРЕДЛОЖЕНИЯ
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {offers.map(offer => (
          <OfferCard key={offer.id} offer={offer} />
        ))}
      </div>

      <LoyaltyProgram />
    </div>
  );
}