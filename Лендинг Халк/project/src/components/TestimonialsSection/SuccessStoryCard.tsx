import React from 'react';
import { TrendingUp, Package, DollarSign } from 'lucide-react';
import { SuccessStory } from './types';

interface SuccessStoryCardProps {
  story: SuccessStory;
}

export function SuccessStoryCard({ story }: SuccessStoryCardProps) {
  return (
    <div 
      className="bg-gray-800 rounded-lg overflow-hidden transform hover:scale-[1.02] transition-all duration-300"
      style={{ boxShadow: '6px 6px 0 rgba(0,165,80,0.3)' }}
      data-aos="fade-up"
    >
      <div className="relative h-48">
        <img 
          src={story.image} 
          alt={story.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent"></div>
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex items-center gap-3 mb-2">
            <img 
              src={story.avatar} 
              alt={story.name}
              className="w-12 h-12 rounded-full border-2 border-[#00A550]"
            />
            <div>
              <h3 className="font-bold">{story.name}</h3>
              <p className="text-sm text-gray-300">История успеха</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <h4 className="text-xl font-bold mb-3">{story.title}</h4>
        <p className="text-gray-400 mb-6">{story.description}</p>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 p-4 rounded text-center">
            <Package className="w-5 h-5 text-[#00A550] mx-auto mb-2" />
            <div className="text-sm text-gray-400">Рост заказов</div>
            <div className="font-bold text-[#00A550]">+{story.stats.ordersIncrease}%</div>
          </div>
          <div className="bg-gray-900 p-4 rounded text-center">
            <TrendingUp className="w-5 h-5 text-[#00A550] mx-auto mb-2" />
            <div className="text-sm text-gray-400">Рост дохода</div>
            <div className="font-bold text-[#00A550]">+{story.stats.incomeIncrease}%</div>
          </div>
          <div className="bg-gray-900 p-4 rounded text-center">
            <DollarSign className="w-5 h-5 text-[#00A550] mx-auto mb-2" />
            <div className="text-sm text-gray-400">Доход/мес</div>
            <div className="font-bold text-[#00A550]">{story.stats.monthlyIncome.toLocaleString()}₽</div>
          </div>
        </div>
      </div>
    </div>
  );
}