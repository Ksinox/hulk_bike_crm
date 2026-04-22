import React, { useState, useEffect } from 'react';
import { PricingCards } from './PricingCards';
import { PurchaseCalculator } from './PurchaseCalculator';
import { ScooterModel } from './types';
import { getScooterModels } from '../../lib/supabase';

export function PricingSection() {
  const [models, setModels] = useState<ScooterModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<ScooterModel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadModels() {
      try {
        const data = await getScooterModels();
        setModels(data);
        if (data.length > 0) {
          setSelectedModel(data[0]);
        }
      } catch (error) {
        console.error('Error loading scooter models:', error);
      } finally {
        setLoading(false);
      }
    }

    loadModels();
  }, []);

  if (loading || !selectedModel) {
    return (
      <div className="mt-24 mb-24 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#00A550] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="mt-24 mb-24" data-aos="fade-up">
      <h2 className="text-4xl font-black mb-12 text-center transform -skew-x-12" style={{
        textShadow: '4px 4px 0 #00A550',
        WebkitTextStroke: '2px #00A550'
      }}>
        СТОИМОСТЬ И ТАРИФЫ
      </h2>

      {/* Model Selector */}
      <div className="flex justify-center mb-12">
        <div className="inline-flex bg-gray-800 rounded-lg p-1">
          {models.map((model) => (
            <button
              key={model.id}
              onClick={() => setSelectedModel(model)}
              className={`px-6 py-3 rounded-lg font-bold transition-all duration-300 ${
                selectedModel.id === model.id
                  ? 'bg-[#00A550] text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {model.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-16">
        <PricingCards model={selectedModel} />
        <PurchaseCalculator model={selectedModel} />
      </div>
    </div>
  );
}