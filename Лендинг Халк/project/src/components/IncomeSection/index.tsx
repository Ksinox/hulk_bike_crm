import React from 'react';
import { PainGainSection } from './PainGainSection';
import { IncomeCalculator } from './IncomeCalculator';

export function IncomeSection() {
  return (
    <div className="mt-24 mb-24" data-aos="fade-up">
      <h2 className="text-4xl font-black mb-12 text-center transform -skew-x-12" style={{
        textShadow: '4px 4px 0 #00A550',
        WebkitTextStroke: '2px #00A550'
      }}>
        ЗАРАБАТЫВАЙ БОЛЬШЕ С HULK BIKE
      </h2>
      
      <div className="space-y-12">
        <PainGainSection />
        <IncomeCalculator />
      </div>
    </div>
  );
}