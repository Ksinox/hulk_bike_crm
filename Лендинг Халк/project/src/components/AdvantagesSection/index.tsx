import React from 'react';
import { AdvantageCard } from './AdvantageCard';
import { 
  Clock, Shield, Wallet, CreditCard, MessageSquare, Gift, 
  Wrench, HardHat, Settings, Rocket, Zap 
} from 'lucide-react';

export function AdvantagesSection() {
  const advantages = [
    {
      icon: Clock,
      title: 'Оформление за 5 минут',
      description: 'Оформление типового договора проката скутера с прозрачными условиями для вас',
      color: '#FF6B6B'
    },
    {
      icon: Wallet,
      title: 'Минимальный залог',
      description: 'Базовый залог за прокат скутера составляет всего 2000 руб',
      color: '#4ECDC4'
    },
    {
      icon: CreditCard,
      title: 'Скутер окупает аренду за 2-3 заказа',
      color: '#45B7D1'
    },
    {
      icon: MessageSquare,
      title: 'Удобное бронирование через сайт или WhatsApp',
      color: '#96CEB4'
    },
    {
      icon: Gift,
      title: 'Первый день бесплатно!',
      description: 'При условии выбора тарифа превышающего 7 дней аренды',
      color: '#FF8C42'
    },
    {
      icon: Wrench,
      title: 'Помощь на дороге',
      description: 'Пробитое колесо или порванный ремень вариатора не проблема мы быстро устраним неисправности на месте и вы снова вернетесь к работе, так же выезжаем на место ДТП и стараемся мирно и справедливо урегулировать конфликт с вторым участником дтп для того чтобы вы не платили за чужой ущерб',
      color: '#D4A5A5'
    },
    {
      icon: HardHat,
      title: 'Полная экипировка',
      description: 'Даем все возможное снаряжение хорошего качества оно включает в себя: Защитный шлем, Зарядку usb, закрытый или открытый держатель для телефона, противоугонная цепь, муфты для защиты рук от холода, также по запросу: защитный ветровик, увеличенный багажник или термокороб + часть скутеров оснащена подогревами ручек',
      color: '#9B5DE5'
    },
    {
      icon: Settings,
      title: 'Бесплатное техобслуживание',
      description: 'В нашей команде есть профессиональный механик который своевременно сменит все технические жидкости и произведет техническое обслуживание что позволит не делать долгих пауз во время работы',
      color: '#00BBF9'
    },
    {
      icon: Rocket,
      title: 'Подключим к нашему Яндекс парку на выгодных условиях',
      color: '#F15BB5'
    },
    {
      icon: Zap,
      title: 'Спортивная сборка',
      description: 'В нашем парке есть скутеры со спортивной сборкой, которые имеют увеличенную мощность двигателя и улучшенную динамику разгона. Это позволяет быстрее доставлять заказы и зарабатывать больше. Скутеры оснащены усиленной подвеской и тормозной системой для безопасной езды.',
      color: '#FFD700'
    }
  ];

  return (
    <div className="mt-24 mb-24" data-aos="fade-up">
      <h2 className="text-4xl font-black mb-12 text-center transform -skew-x-12" style={{
        textShadow: '4px 4px 0 #00A550',
        WebkitTextStroke: '2px #00A550'
      }}>
        НАШИ ПРЕИМУЩЕСТВА
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {advantages.map((advantage, index) => (
          <div
            key={index}
            data-aos="fade-up"
            data-aos-delay={index * 100}
            data-aos-anchor-placement="top-bottom"
            className="md:transform md:hover:scale-105 md:transition-transform"
          >
            <AdvantageCard {...advantage} />
          </div>
        ))}
      </div>
    </div>
  );
}