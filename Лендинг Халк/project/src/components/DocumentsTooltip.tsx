import React, { useState } from 'react';

export function DocumentsTooltip() {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        className="text-[#00A550] font-bold border-b-2 border-dashed border-[#00A550] hover:opacity-80"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        документами
      </button>
      {isVisible && (
        <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 bg-[#00A550] text-white p-3 rounded shadow-lg z-50" style={{
          boxShadow: '4px 4px 0 rgba(0,0,0,0.5)'
        }}>
          <span className="font-bold mb-2 block">Необходимые документы:</span>
          <span className="space-y-1 text-sm block">
            <span className="block">• Паспорт</span>
            <span className="block">• Права</span>
          </span>
          <span className="absolute w-3 h-3 bg-[#00A550] transform rotate-45 left-1/2 -translate-x-1/2 -bottom-1.5"></span>
        </span>
      )}
    </span>
  );
}