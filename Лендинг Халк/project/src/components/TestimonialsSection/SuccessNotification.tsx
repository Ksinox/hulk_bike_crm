import React, { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface SuccessNotificationProps {
  onClose: () => void;
}

export function SuccessNotification({ onClose }: SuccessNotificationProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-4 right-4 z-[100] animate-slide-in">
      <div className="bg-[#00A550] text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 transform hover:scale-105 transition-transform">
        <CheckCircle2 className="w-6 h-6" />
        <div>
          <h4 className="font-bold">Отзыв отправлен!</h4>
          <p className="text-sm opacity-90">Спасибо за ваш отзыв</p>
        </div>
      </div>
    </div>
  );
}