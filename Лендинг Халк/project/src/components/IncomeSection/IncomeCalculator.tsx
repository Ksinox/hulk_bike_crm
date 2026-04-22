import React, { useState } from 'react';
import { Calculator, Package, DollarSign, Fuel, TrendingUp } from 'lucide-react';

export function IncomeCalculator() {
  const [orders, setOrders] = useState(30);
  const [pricePerOrder, setPricePerOrder] = useState(250);
  const [rentPlan, setRentPlan] = useState('month');

  const calculateIncome = () => {
    const totalIncome = orders * pricePerOrder;
    const rentCost = rentPlan === 'month' ? 400 : 500;
    const fuelCost = (orders * 3) / 100 * 1.5 * 55;
    const totalCost = rentCost + fuelCost;
    const netIncome = totalIncome - totalCost;

    return {
      totalIncome: Math.round(totalIncome),
      costs: Math.round(totalCost),
      netIncome: Math.round(netIncome)
    };
  };

  const income = calculateIncome();

  return (
    <div 
      className="relative p-8 rounded-2xl transform hover:scale-[1.02] transition-all duration-300 overflow-hidden backdrop-blur-lg bg-gradient-to-b from-gray-800/90 to-gray-900/90 border border-gray-700/50"
      style={{
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
      }}
    >
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1f4d3d] to-[#00A550] opacity-10" />
      
      {/* Animated Glow Effect */}
      <div className="absolute -inset-2 bg-gradient-to-r from-transparent via-white/5 to-transparent blur-xl animate-glow" />

      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[#00A550] to-[#4CAF50]">
            <Calculator className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            Калькулятор дохода
          </h3>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* Left Column - Inputs */}
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Package className="w-4 h-4 text-[#00A550]" />
                  Количество заказов в день
                </label>
                <span className="text-lg font-bold text-white">{orders}</span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={orders}
                  onChange={(e) => setOrders(Number(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `linear-gradient(to right, #00A550 0%, #00A550 ${(orders-5)*100/45}%, #333 ${(orders-5)*100/45}%, #333 100%)`
                  }}
                />
                <div className="absolute -bottom-6 left-0 text-xs text-gray-400">5</div>
                <div className="absolute -bottom-6 right-0 text-xs text-gray-400">50</div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <DollarSign className="w-4 h-4 text-[#00A550]" />
                  Средняя стоимость заказа
                </label>
                <span className="text-lg font-bold text-white">{pricePerOrder}₽</span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min="150"
                  max="400"
                  value={pricePerOrder}
                  onChange={(e) => setPricePerOrder(Number(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `linear-gradient(to right, #00A550 0%, #00A550 ${(pricePerOrder-150)*100/250}%, #333 ${(pricePerOrder-150)*100/250}%, #333 100%)`
                  }}
                />
                <div className="absolute -bottom-6 left-0 text-xs text-gray-400">150₽</div>
                <div className="absolute -bottom-6 right-0 text-xs text-gray-400">400₽</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Тариф аренды</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setRentPlan('week')}
                  className={`py-3 px-4 rounded-xl font-medium transition-all duration-300 ${
                    rentPlan === 'week'
                      ? 'bg-gradient-to-r from-[#00A550] to-[#4CAF50] text-white shadow-lg shadow-[#00A550]/20'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  Неделя (500₽/день)
                </button>
                <button
                  onClick={() => setRentPlan('month')}
                  className={`py-3 px-4 rounded-xl font-medium transition-all duration-300 ${
                    rentPlan === 'month'
                      ? 'bg-gradient-to-r from-[#00A550] to-[#4CAF50] text-white shadow-lg shadow-[#00A550]/20'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  Месяц (400₽/день)
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Results */}
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                  <TrendingUp className="w-4 h-4 text-[#00A550]" />
                  Доход
                </div>
                <div className="text-2xl font-bold text-white">{income.totalIncome}₽</div>
              </div>
              <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                  <Fuel className="w-4 h-4 text-red-500" />
                  Затраты
                </div>
                <div className="text-2xl font-bold text-red-500">{income.costs}₽</div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-[#1f4d3d] to-[#00A550] p-6 rounded-xl">
              <div className="text-sm text-gray-200 mb-1">Чистая прибыль</div>
              <div className="text-3xl font-black text-white">{income.netIncome}₽</div>
              <div className="text-sm text-gray-200 mt-2">в день</div>
            </div>

            <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
              <div className="text-sm text-gray-400 mb-2">Прогноз на месяц</div>
              <div className="text-2xl font-bold text-white">{income.netIncome * 30}₽</div>
            </div>
          </div>
        </div>

        <div className="text-sm text-gray-400">
          💡 Расчёт включает расходы на топливо и аренду. Фактический доход может отличаться в зависимости от сезона и района работы.
        </div>
      </div>

      {/* Decorative Elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#00A550]/10 to-transparent rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-[#00A550]/10 to-transparent rounded-full blur-2xl" />
    </div>
  );
}