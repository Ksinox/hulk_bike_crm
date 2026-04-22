import React, { useState, useEffect } from 'react';
import { getScooterModels } from '../../lib/supabase';
import { ScooterCard } from './ScooterCard';
import { ScooterDetails } from './ScooterDetails';
import { ScooterModel } from '../PricingSection/types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function ScooterSection() {
  const [models, setModels] = useState<ScooterModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<ScooterModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scrollPosition, setScrollPosition] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadModels() {
      try {
        setLoading(true);
        setError(null);
        const data = await getScooterModels();
        if (mounted) {
          setModels(data || []);
          if (data && data.length > 0) {
            setSelectedModel(data[0]);
          }
        }
      } catch (err) {
        console.error('Error loading scooter models:', err);
        if (mounted) {
          setError('Не удалось загрузить модели скутеров');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadModels();

    return () => {
      mounted = false;
    };
  }, []);

  const handleScroll = (direction: 'left' | 'right') => {
    const container = document.getElementById('scooter-cards-container');
    if (!container) return;

    const scrollAmount = direction === 'left' ? -320 : 320;
    const newPosition = scrollPosition + scrollAmount;
    
    container.scrollTo({
      left: newPosition,
      behavior: 'smooth'
    });
    
    setScrollPosition(newPosition);
  };

  if (error) {
    return (
      <div className="mt-12 md:mt-24 mb-12 md:mb-24 text-center px-4">
        <p className="text-red-500 mb-4">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="bg-[#00A550] text-white px-6 py-3 rounded-lg hover:bg-[#008040] transition-colors"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-12 md:mt-24 mb-12 md:mb-24 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#00A550] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="mt-12 md:mt-24 mb-12 md:mb-24 px-4 md:px-0">
      <h2 className="text-3xl md:text-4xl font-black mb-8 md:mb-12 text-center transform -skew-x-12" style={{
        textShadow: '4px 4px 0 #00A550',
        WebkitTextStroke: '2px #00A550'
      }}>
        ВЫБЕРИ СВОЙ СКУТЕР
      </h2>

      {/* Мобильная карусель скутеров */}
      <div className="relative mb-8">
        <div 
          id="scooter-cards-container"
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory hide-scrollbar pb-4"
          style={{
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {models.map((model) => (
            <div 
              key={model.id}
              className="flex-none w-[280px] md:w-[320px] snap-center"
            >
              <ScooterCard
                model={model}
                isSelected={selectedModel?.id === model.id}
                onClick={() => setSelectedModel(model)}
              />
            </div>
          ))}
        </div>

        {/* Кнопки навигации (только для десктопа) */}
        <div className="hidden md:block">
          <button 
            onClick={() => handleScroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 bg-[#00A550] p-2 rounded-full hover:bg-[#008040] transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button 
            onClick={() => handleScroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 bg-[#00A550] p-2 rounded-full hover:bg-[#008040] transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Индикаторы слайдов (только для мобильных) */}
      <div className="flex justify-center gap-2 mb-8 md:hidden">
        {models.map((model, index) => (
          <div
            key={model.id}
            className={`w-2 h-2 rounded-full transition-colors ${
              selectedModel?.id === model.id
                ? 'bg-[#00A550]'
                : 'bg-gray-600'
            }`}
          />
        ))}
      </div>

      {/* Детальная информация */}
      {selectedModel && (
        <div className="lg:col-span-3">
          <ScooterDetails model={selectedModel} />
        </div>
      )}
    </div>
  );
}