import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { FAQItem } from './types';

interface FAQAccordionProps {
  item: FAQItem;
  isOpen: boolean;
  onToggle: () => void;
}

export function FAQAccordion({ item, isOpen, onToggle }: FAQAccordionProps) {
  return (
    <div 
      className="bg-gray-800 rounded-lg overflow-hidden transform hover:scale-[1.01] transition-all duration-300"
      style={{ boxShadow: '4px 4px 0 rgba(0,165,80,0.2)' }}
    >
      <button
        className="w-full p-6 text-left flex items-center justify-between gap-4"
        onClick={onToggle}
      >
        <div className="flex items-center gap-4">
          <div className="text-2xl">{item.icon}</div>
          <span className="font-bold text-lg">{item.question}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-6 h-6 text-[#00A550] flex-shrink-0" />
        ) : (
          <ChevronDown className="w-6 h-6 text-[#00A550] flex-shrink-0" />
        )}
      </button>
      
      <div 
        className={`overflow-hidden transition-all duration-300 ${
          isOpen ? 'max-h-96' : 'max-h-0'
        }`}
      >
        <div className="p-6 pt-0 text-gray-400">
          {item.answer}
        </div>
      </div>
    </div>
  );
}