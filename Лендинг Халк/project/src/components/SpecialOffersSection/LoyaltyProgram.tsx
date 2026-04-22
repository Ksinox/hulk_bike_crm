import React from 'react';
import { Trophy, Star, Crown, Users, Calendar, Headphones, CreditCard, Umbrella, ShieldCheck } from 'lucide-react';
import { LoyaltyTier } from './types';

const loyaltyTiers: LoyaltyTier[] = [
  {
    name: 'Начинающий',
    icon: 'Star',
    color: '#4ECDC4',
    requirements: {
      days: 60,
      referrals: 3
    },
    benefits: [
      'Скидка 10% на аренду',
      'Премиум экипировка',
      'Поддержка 24/7'
    ]
  },
  {
    name: 'Профессионал',
    icon: 'Trophy',
    color: '#FFD700',
    requirements: {
      days: 90,
      referrals: 10
    },
    benefits: [
      'Скидка 10% на аренду',
      'Премиум экипировка',
      'Бонусные дни аренды',
      'Приоритетная поддержка',
      '5% кэшбэк с оплат приведенных друзей'
    ]
  },
  {
    name: 'Эксперт',
    icon: 'Crown',
    color: '#FF6B6B',
    requirements: {
      days: 120,
      referrals: 20
    },
    benefits: [
      'Скидка 10% на аренду',
      'VIP экипировка',
      'Бонусные дни аренды',
      'Приоритетная поддержка 24/7',
      '10% кэшбэк с оплат приведенных друзей',
      'Бесплатный паркинг в непогоду',
      'Эксклюзивные условия выкупа',
      'Приоритет при выборе скутера'
    ]
  }
];

export function LoyaltyProgram() {
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Star': return <Star className="w-6 h-6" />;
      case 'Trophy': return <Trophy className="w-6 h-6" />;
      case 'Crown': return <Crown className="w-6 h-6" />;
      default: return null;
    }
  };

  return (
    <div className="mt-12">
      <h3 className="text-2xl font-black mb-8 text-center" style={{
        textShadow: '2px 2px 0 #00A550'
      }}>
        ПРОГРАММА ЛОЯЛЬНОСТИ
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {loyaltyTiers.map((tier, index) => (
          <div
            key={tier.name}
            className="relative bg-gray-800 rounded-lg p-6 transform hover:scale-[1.02] transition-all duration-300"
            style={{ boxShadow: `6px 6px 0 ${tier.color}33` }}
            data-aos="fade-up"
            data-aos-delay={index * 100}
          >
            {/* Background pattern */}
            <div className="absolute inset-0 bg-white/5 rounded-lg" style={{
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,165,80,0.1) 10px, rgba(0,165,80,0.1) 20px)'
            }}></div>

            <div className="relative z-10">
              {/* Icon and Title */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: tier.color }}>
                  {getIcon(tier.icon)}
                </div>
                <h4 className="text-xl font-bold">{tier.name}</h4>
              </div>

              {/* Requirements */}
              <div className="bg-gray-900 rounded p-4 mb-4">
                <div className="text-sm font-bold mb-2">Требования:</div>
                <div className="space-y-2 text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#00A550]" />
                    От {tier.requirements.days} дней аренды
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#00A550]" />
                    {tier.requirements.referrals} приведенных друзей
                  </div>
                </div>
              </div>

              {/* Benefits */}
              <div>
                <div className="text-sm font-bold mb-2">Преимущества:</div>
                <ul className="space-y-2">
                  {tier.benefits.map((benefit, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-[#00A550] mt-1">•</span>
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}