import React from 'react';
import { ContactButtons } from './ContactButtons';
import { LocationMap } from './LocationMap';

export function FinalCTASection() {
  return (
    <div className="mt-24 mb-24" data-aos="fade-up">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-black mb-6 transform -skew-x-12" style={{
          textShadow: '4px 4px 0 #00A550',
          WebkitTextStroke: '2px #00A550'
        }}>
          НАЧНИ ЗАРАБАТЫВАТЬ БОЛЬШЕ УЖЕ СЕГОДНЯ!
        </h2>
        <p className="text-xl text-[#00A550] font-bold mb-8">
          Первый день аренды – БЕСПЛАТНО! 🎁
        </p>
        
        <button className="bg-[#00A550] text-white text-xl font-black px-12 py-6 rounded-lg transform hover:scale-105 transition-all duration-300 mb-12" style={{
          boxShadow: '6px 6px 0 rgba(0,0,0,0.3)'
        }}>
          ЗАБРОНИРОВАТЬ СКУТЕР
        </button>

        <div className="max-w-2xl mx-auto mb-12">
          <ContactButtons />
        </div>
      </div>

      <LocationMap />
    </div>
  );
}