import React, { useState, useEffect } from 'react';
import { Star } from 'lucide-react';

interface ReviewButtonProps {
  onClick: () => void;
}

export function ReviewButton({ onClick }: ReviewButtonProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const testimonialEntry = entries[0];
        
        // Update visibility with a small delay for smoother transitions
        if (testimonialEntry.isIntersecting) {
          setTimeout(() => setIsVisible(true), 100);
        } else {
          setTimeout(() => setIsVisible(false), 100);
        }
      },
      {
        // Adjust rootMargin to start observing earlier
        rootMargin: '150px 0px -150px 0px',
        threshold: [0, 0.1, 0.5, 1]
      }
    );

    // Find the testimonials section
    const testimonialSection = document.getElementById('testimonials-section');
    if (testimonialSection) {
      observer.observe(testimonialSection);
    }

    return () => {
      if (testimonialSection) {
        observer.unobserve(testimonialSection);
      }
    };
  }, []);

  return (
    <button
      onClick={onClick}
      className={`fixed md:hidden z-40 bg-[#00A550] text-white py-4 rounded-full font-bold shadow-lg flex items-center justify-center gap-2 transition-all duration-300 ${
        isVisible 
          ? 'opacity-100 translate-y-0' 
          : 'opacity-0 translate-y-16'
      }`}
      style={{ 
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
        left: '24px',
        right: '24px',
        // Force hardware acceleration
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
        // Improve touch response
        WebkitTapHighlightColor: 'transparent',
        // Prevent text selection
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        // Smooth scrolling for iOS
        WebkitOverflowScrolling: 'touch',
        // Box shadow optimized for iOS
        boxShadow: '0 4px 12px rgba(0, 165, 80, 0.3), 0 2px 4px rgba(0, 0, 0, 0.1)'
      }}
    >
      <Star className="w-5 h-5" />
      <span className="font-bold" style={{ fontFamily: '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        Оставить отзыв
      </span>
    </button>
  );
}