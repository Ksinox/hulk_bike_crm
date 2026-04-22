import React, { useState } from 'react';
import { Copy, Check, Calendar, Info } from 'lucide-react';
import { Offer } from './types';

interface OfferCardProps {
  offer: Offer;
}

export function OfferCard({ offer }: OfferCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (offer.code) {
      navigator.clipboard.writeText(offer.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div 
      className={`relative bg-gray-800 rounded-lg p-6 transform hover:scale-[1.02] transition-all duration-300 ${
        offer.isPopular ? 'border-2 border-[#00A550]' : ''
      }`}
      style={{ boxShadow: '6px 6px 0 rgba(0,165,80,0.3)' }}
      data-aos="fade-up"
    >
      {offer.isPopular && (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-[#00A550] text-white px-4 py-1 rounded-full text-sm font-bold">
          Популярное
        </div>
      )}

      {/* Background pattern */}
      <div className="absolute inset-0 bg-white/5 rounded-lg" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,165,80,0.1) 10px, rgba(0,165,80,0.1) 20px)'
      }}></div>

      <div className="relative z-10">
        {/* Icon and Title */}
        <div className="flex items-start gap-4 mb-4">
          <div className="text-4xl">{offer.icon}</div>
          <div>
            <h3 className="text-xl font-bold mb-1">{offer.title}</h3>
            <p className="text-gray-400 text-sm">{offer.description}</p>
          </div>
        </div>

        {/* Discount */}
        <div className="bg-[#00A550]/10 rounded-lg p-4 mb-4">
          <div className="text-[#00A550] text-2xl font-black">{offer.discount}</div>
        </div>

        {/* Conditions */}
        {offer.conditions && (
          <div className="mb-4">
            <div className="text-sm font-bold mb-2 flex items-center gap-1">
              <Info className="w-4 h-4" />
              Условия:
            </div>
            <ul className="space-y-1">
              {offer.conditions.map((condition, index) => (
                <li key={index} className="text-sm text-gray-400 flex items-start gap-2">
                  <span className="text-[#00A550] mt-1">•</span>
                  {condition}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Notes */}
        {offer.note && (
          <p className="text-sm text-gray-400 mb-4">{offer.note}</p>
        )}

        {/* Valid Until */}
        {offer.validUntil && (
          <div className="flex items-center gap-1 text-sm text-gray-400 mb-4">
            <Calendar className="w-4 h-4" />
            Действует до {offer.validUntil}
          </div>
        )}

        {/* Promo Code */}
        {offer.code && (
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-900 px-3 py-2 rounded font-mono text-[#00A550]">
              {offer.code}
            </code>
            <button
              onClick={handleCopy}
              className="bg-[#00A550] p-2 rounded hover:bg-[#008040] transition-colors"
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}