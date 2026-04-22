import React, { useState } from 'react';
import { Calculator } from 'lucide-react';

export function IncomeCalculator() {
  const [orders, setOrders] = useState(30);
  const [pricePerOrder, setPricePerOrder] = useState(250);
  const [rentPlan, setRentPlan] = useState('month');

  const calculateIncome = () => {
    const totalIncome = orders * pricePerOrder;
    const rentCost = rentPlan === 'month' ? 500 : 800;
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
    <div className="bg-[#111] p-6 rounded-lg relative transform hover:scale-[1.02] transition-transform" style={{
      boxShadow: '8px 8px 0 rgba(0,165,80,0.5)'
    }}>
      <div className="absolute inset-0 bg-white/5" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,165,80,0.1) 10px, rgba(0,165,80,0.1) 20px)'
      }}></div>
      
      <h3 className="text-2xl font-black mb-6 text-[#00A550]" style={{
        textShadow: '2px 2px 0 #000'
      }}>
        <Calculator className="inline-block mr-2 mb-1" />
        КАЛЬКУЛЯТОР ДОХОДА
      </h3>

      <div className="space-y-6 relative z-10">
        <div>
          <label className="block text-sm font-bold mb-2">Количество заказов в день: {orders}</label>
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
        </div>

        <div>
          <label className="block text-sm font-bold mb-2">Средняя стоимость заказа: {pricePerOrder}₽</label>
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
        </div>

        <div>
          <label className="block text-sm font-bold mb-2">Тариф аренды:</label>
          <div className="flex gap-4">
            <button
              onClick={() => setRentPlan('trial')}
              className={`flex-1 py-2 px-4 rounded ${rentPlan === 'trial' ? 'bg-[#00A550] text-white' : 'bg-gray-700'}`}
            >
              Попробую (800₽/день)
            </button>
            <button
              onClick={() => setRentPlan('month')}
              className={`flex-1 py-2 px-4 rounded ${rentPlan === 'month' ? 'bg-[#00A550] text-white' : 'bg-gray-700'}`}
            >
              Месяц (500₽/день)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-gray-800 p-4 rounded text-center">
            <div className="text-sm font-bold mb-1">Доход</div>
            <div className="text-xl font-black text-[#00A550]">{income.totalIncome}₽</div>
          </div>
          <div className="bg-gray-800 p-4 rounded text-center">
            <div className="text-sm font-bold mb-1">Затраты</div>
            <div className="text-xl font-black text-red-500">{income.costs}₽</div>
          </div>
          <div className="bg-gray-800 p-4 rounded text-center">
            <div className="text-sm font-bold mb-1">Прибыль</div>
            <div className="text-xl font-black text-[#00A550]">{income.netIncome}₽</div>
          </div>
        </div>
      </div>
    </div>
  );
}