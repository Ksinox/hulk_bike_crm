import React from 'react';

export function HulkBikeLogo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="48" height="48" viewBox="0 0 100 100" className="text-[#00A550]">
        <g transform="translate(10,10)">
          <rect x="0" y="0" width="20" height="20" transform="rotate(30)" fill="currentColor"/>
          <rect x="40" y="0" width="20" height="20" transform="rotate(-15)" fill="currentColor"/>
          <rect x="20" y="40" width="20" height="20" transform="rotate(45)" fill="currentColor"/>
          <path d="M25,20 Q40,20 55,20 Q55,35 40,45 Q25,35 25,20" fill="currentColor"/>
          <path d="M35,25 Q40,30 45,25" fill="black" strokeWidth="2"/>
          <rect x="33" y="35" width="14" height="4" fill="white"/>
          <path d="M30,15 L35,20 L30,25" fill="none" stroke="black" strokeWidth="2"/>
          <path d="M50,15 L45,20 L50,25" fill="none" stroke="black" strokeWidth="2"/>
        </g>
      </svg>
      <div className="text-4xl font-black tracking-wider transform -skew-x-12">
        <span className="relative" style={{
          textShadow: '3px 3px 0 #00A550, -1px -1px 0 #00A550, 2px -2px 0 #00A550, -2px 2px 0 #00A550',
          WebkitTextStroke: '2px #00A550'
        }}>HULK</span>
        <span className="font-bold text-[#00A550] ml-1">BIKE</span>
      </div>
    </div>
  );
}