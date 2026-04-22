import React, { useState } from 'react';
import { FAQAccordion } from './FAQAccordion';
import { FAQItem } from './types';

const faqItems: FAQItem[] = [
  {
    id: 1,
    question: "Подключаете ли вы к парку?",
    answer: "Да, у нас свой яндекс парк, поэтому мы подключим вас на выгодных условиях. Также возможен перевод к нам с другого парка.",
    category: "general",
    icon: "🚀"
  },
  {
    id: 2,
    question: "Какие документы нужны для аренды?",
    answer: "Для аренды скутера необходимы:\n• Паспорт гражданина РФ\n• Водительское удостоверение\n• Регистрация в РФ (предпочтение отдается клиентам имеющим регистрацию в Краснодаре и Краснодарском крае)",
    category: "documents",
    icon: "📄"
  },
  {
    id: 3,
    question: "Что входит в аренду?",
    answer: "В стоимость аренды включено:\n• Скутер в исправном состоянии\n• Комплект экипировки (шлем, зарядка, держатель, противоугонная цепь, короб или увеличенный багажник по запросу)\n• Техническое обслуживание\n• Техническая поддержка",
    category: "services",
    icon: "🛵"
  },
  {
    id: 4,
    question: "Что делать в случае ДТП?",
    answer: "Звоните в поддержку. Если есть свободный сотрудник, то он выезжает на место ДТП и пытается урегулировать ситуацию между участниками ДТП и принять обоснованное решение, чтобы вы не были обмануты и лишний раз не переплатили в случае вашей вины.",
    category: "support",
    icon: "🚨"
  }
];

export function FAQSection() {
  const [openItems, setOpenItems] = useState<number[]>([]);

  const toggleItem = (itemId: number) => {
    setOpenItems(prev => 
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  return (
    <div className="mt-24 mb-24" data-aos="fade-up">
      <h2 className="text-4xl font-black mb-12 text-center transform -skew-x-12" style={{
        textShadow: '4px 4px 0 #00A550',
        WebkitTextStroke: '2px #00A550'
      }}>
        ЧАСТО ЗАДАВАЕМЫЕ ВОПРОСЫ
      </h2>

      <div className="max-w-3xl mx-auto space-y-4 mb-32">
        {faqItems.map(item => (
          <FAQAccordion
            key={item.id}
            item={item}
            isOpen={openItems.includes(item.id)}
            onToggle={() => toggleItem(item.id)}
          />
        ))}
      </div>
    </div>
  );
}