import React, { useState, useEffect } from 'react';
import { Calculator, Calendar, CreditCard, TrendingUp, DollarSign } from 'lucide-react';
import { ScooterModel, PurchaseCalculation } from './types';

interface PurchaseCalculatorProps {
  model: ScooterModel;
}

export function PurchaseCalculator({ model }: PurchaseCalculatorProps) {
  // Calculate min/max initial payment based on model price
  const minInitialPayment = Math.ceil(model.base_price * 0.1);
  const maxInitialPayment = Math.floor(model.base_price * 0.5);
  
  const [initialPayment, setInitialPayment] = useState(minInitialPayment);
  const [months, setMonths] = useState(3);
  const [dailyPayment, setDailyPayment] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // Получаем базовую стоимость скутера
      const totalPrice = model.base_price;
      
      // Вычисляем общее количество дней
      const totalDays = months * 30;
      
      // Вычисляем сумму к выплате (общая стоимость минус первоначальный взнос)
      const remainingAmount = totalPrice - initialPayment;
      
      // Вычисляем ежедневный платеж
      const daily = remainingAmount / totalDays;
      
      setDailyPayment(Math.ceil(daily));
      setError(null);
    } catch (error: any) {
      console.error('Error calculating payments:', error);
      setError(error.message || 'Не удалось рассчитать план выкупа');
    }
  }, [model.base_price, initialPayment, months]);

  return (
    <div 
      className="relative p-6 rounded-2xl backdrop-blur-lg bg-gradient-to-b from-gray-900/90 to-black/90 border border-gray-800/50"
      style={{ boxShadow: '0 8px 32px rgba(0, 0, 0, 0.37)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#00A550] to-[#4CAF50]">
          <Calculator className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-xl font-bold">Калькулятор выкупа</h3>
      </div>

      <div className="space-y-6">
        {/* Initial Payment Slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">Первый взнос</label>
            <span className="text-lg font-bold text-white">{initialPayment.toLocaleString()}₽</span>
          </div>
          <input
            type="range"
            min={minInitialPayment}
            max={maxInitialPayment}
            step="1000"
            value={initialPayment}
            onChange={(e) => setInitialPayment(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            style={{
              backgroundImage: `linear-gradient(to right, #00A550 0%, #00A550 ${(initialPayment-minInitialPayment)*100/(maxInitialPayment-minInitialPayment)}%, #333 ${(initialPayment-minInitialPayment)*100/(maxInitialPayment-minInitialPayment)}%, #333 100%)`
            }}
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{minInitialPayment.toLocaleString()}₽</span>
            <span>{maxInitialPayment.toLocaleString()}₽</span>
          </div>
        </div>

        {/* Payment Period */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Срок выплаты</label>
          <div className="grid grid-cols-4 gap-2">
            {[3, 4, 5, 6].map(m => (
              <button
                key={m}
                onClick={() => setMonths(m)}
                className={`py-2 px-3 rounded-xl font-medium text-sm transition-all duration-300 ${
                  months === m
                    ? 'bg-gradient-to-r from-[#00A550] to-[#4CAF50] text-white shadow-lg shadow-[#00A550]/20'
                    : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
                }`}
              >
                {m} мес
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
            <div className="text-sm text-gray-400 mb-1">Стоимость скутера</div>
            <div className="text-2xl font-bold text-white">{model.base_price.toLocaleString()}₽</div>
          </div>
          
          <div className="bg-gradient-to-r from-[#1f4d3d] to-[#00A550] p-4 rounded-xl">
            <div className="text-sm text-gray-200 mb-1">Ежедневный платеж</div>
            <div className="text-2xl font-bold text-white">{dailyPayment.toLocaleString()}₽</div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 p-4 rounded-xl text-red-300">
            {error}
          </div>
        )}

        {/* CTA Button */}
        <a
          href={`https://wa.me/79958995829?text=Привет!%20👋%20Хочу%20купить%20${encodeURIComponent(model.name)}%20в%20рассрочку:%0A-%20Первый%20взнос:%20${initialPayment.toLocaleString()}₽%0A-%20Срок:%20${months}%20мес.%0A-%20Ежедневный%20платеж:%20${dailyPayment.toLocaleString()}₽`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full bg-[#00A550] text-center py-3 px-6 rounded-xl font-bold text-white hover:bg-[#008040] transition-colors"
        >
          Оформить выкуп
        </a>
      </div>
    </div>
  );
}