import React from 'react';

interface AlertModalProps {
  onClose: () => void;
}

export function AlertModal({ onClose }: AlertModalProps) {
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div 
        className="bg-gray-900 rounded-2xl p-8 max-w-md w-full relative transform hover:scale-[1.02] transition-all duration-300"
        style={{ boxShadow: '0 8px 32px rgba(0, 165, 80, 0.2)' }}
      >
        {/* Glow Effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#00A550]/10 to-transparent rounded-2xl blur-xl" />

        {/* Content */}
        <div className="relative z-10">
          <div className="text-4xl mb-4">😂</div>
          <h3 className="text-2xl font-bold mb-4">Такого не может быть!</h3>
          <p className="text-gray-400 mb-6">
            Доход после аренды скутера не может быть меньше, чем был до этого. 
            Наши курьеры только увеличивают свой заработок!
          </p>
          <button
            onClick={onClose}
            className="w-full bg-[#00A550] text-white py-3 rounded-lg hover:bg-[#008040] transition-colors"
          >
            Понятно
          </button>
        </div>

        {/* Decorative Elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#00A550]/10 to-transparent rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-[#00A550]/10 to-transparent rounded-full blur-xl" />
      </div>
    </div>
  );
}