import React from 'react';
import { DivideIcon as LucideIcon } from 'lucide-react';

interface AdvantageCardProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  color: string;
}

export function AdvantageCard({ icon: Icon, title, description, color }: AdvantageCardProps) {
  return (
    <div 
      className="relative p-6 rounded-lg transform hover:scale-105 transition-all duration-300 bg-gray-800 group"
      style={{
        boxShadow: `6px 6px 0 ${color}33`
      }}
    >
      {/* Background pattern */}
      <div 
        className="absolute inset-0 bg-white opacity-5 rounded-lg transition-opacity group-hover:opacity-10"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 20px)'
        }}
      />

      {/* Glowing border effect on hover */}
      <div 
        className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          background: `linear-gradient(45deg, ${color}00, ${color}33)`,
          filter: 'blur(8px)',
          zIndex: -1
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        <div 
          className="w-12 h-12 rounded-lg mb-4 flex items-center justify-center transform group-hover:scale-110 transition-transform"
          style={{ backgroundColor: color }}
        >
          <Icon className="w-6 h-6 text-white" />
        </div>

        <h3 className="text-lg font-bold mb-2 group-hover:text-white transition-colors">
          {title}
        </h3>
        
        {description && (
          <p className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
            {description}
          </p>
        )}

        {/* Decorative corner */}
        <div 
          className="absolute top-0 right-0 w-8 h-8 transform translate-x-2 -translate-y-2 opacity-50"
          style={{
            background: color,
            clipPath: 'polygon(100% 0, 0 0, 100% 100%)'
          }}
        />
      </div>
    </div>
  );
}