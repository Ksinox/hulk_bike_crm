import React, { useState } from 'react';
import { Star, TrendingUp, Calendar, ThumbsUp, MessageCircle } from 'lucide-react';
import { Testimonial } from './types';

interface TestimonialCardProps {
  testimonial: Testimonial;
  onPlay?: () => void;
}

export function TestimonialCard({ testimonial, onPlay }: TestimonialCardProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const incomeIncrease = ((testimonial.income.after - testimonial.income.before) / testimonial.income.before) * 100;

  const truncatedText = testimonial.text.length > 150 && !showFullText
    ? testimonial.text.slice(0, 150) + '...'
    : testimonial.text;

  return (
    <div className="bg-gray-800/50 backdrop-blur-md rounded-xl p-4 md:p-6 relative transform hover:scale-[1.02] transition-all duration-300 group border border-gray-700/50"
      style={{ boxShadow: '0 8px 32px rgba(0, 165, 80, 0.1)' }}
      data-aos="fade-up"
    >
      {/* Glow Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#00A550]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl blur-xl" />

      <div className="relative z-10">
        {/* Header - Improved mobile layout */}
        <div className="flex items-start md:items-center gap-3 md:gap-4 mb-4">
          <img 
            src={testimonial.avatar} 
            alt={testimonial.name}
            className="w-12 h-12 md:w-16 md:h-16 rounded-full object-cover border-2 border-[#00A550] group-hover:scale-110 transition-transform flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base md:text-lg truncate">{testimonial.name}</h3>
            <p className="text-sm text-gray-400 truncate">{testimonial.role}</p>
          </div>
          <div className="flex items-center">
            {[...Array(5)].map((_, i) => (
              <Star 
                key={i}
                className={`w-3 h-3 md:w-4 md:h-4 transition-transform hover:scale-125 ${
                  i < testimonial.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Video/Content - Improved mobile layout */}
        {testimonial.isVideo ? (
          <div 
            className="relative mb-4 rounded-xl overflow-hidden cursor-pointer group/video aspect-video"
            onClick={onPlay}
          >
            <img 
              src={testimonial.videoThumbnail} 
              alt="Video thumbnail"
              className="w-full h-full object-cover rounded-xl group-hover/video:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-black/50 group-hover/video:bg-black/30 transition-colors">
              {/* Play Button */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/video:opacity-100 transition-opacity duration-300">
                <div className="relative w-20 h-20">
                  {/* Outer ring animation */}
                  <div className="absolute inset-0 rounded-full border-2 border-[#00A550] animate-ping" />
                  {/* Inner circle */}
                  <div className="absolute inset-0 bg-[#00A550] rounded-full scale-90 flex items-center justify-center">
                    {/* Play icon */}
                    <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M8 5.14v14.72a1 1 0 001.5.87l11-7.36a1 1 0 000-1.74l-11-7.36a1 1 0 00-1.5.87z" fill="currentColor"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <p className="text-gray-300 text-sm md:text-base">{truncatedText}</p>
            {testimonial.text.length > 150 && (
              <button
                onClick={() => setShowFullText(!showFullText)}
                className="text-[#00A550] hover:underline mt-2 text-sm"
              >
                {showFullText ? 'Свернуть' : 'Читать полностью'}
              </button>
            )}
          </div>
        )}

        {/* Stats - Improved mobile layout */}
        <div className="grid grid-cols-2 gap-3 md:gap-4 mb-4">
          <div className="bg-gray-900/50 p-2 md:p-3 rounded-lg">
            <div className="text-xs md:text-sm text-gray-400">До</div>
            <div className="text-base md:text-lg font-bold">{testimonial.income.before.toLocaleString()}₽</div>
          </div>
          <div className="bg-gray-900/50 p-2 md:p-3 rounded-lg">
            <div className="text-xs md:text-sm text-gray-400">После</div>
            <div className="text-base md:text-lg font-bold text-[#00A550]">
              {testimonial.income.after.toLocaleString()}₽
              <span className="text-xs md:text-sm ml-1">
                (+{Math.round(incomeIncrease)}%)
              </span>
            </div>
          </div>
        </div>

        {/* Footer - Improved mobile layout */}
        <div className="flex items-center justify-between text-xs md:text-sm text-gray-400">
          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={() => setIsLiked(!isLiked)}
              className={`flex items-center gap-1 transition-colors ${
                isLiked ? 'text-[#00A550]' : 'hover:text-[#00A550]'
              }`}
            >
              <ThumbsUp className="w-3 h-3 md:w-4 md:h-4" />
              <span>{testimonial.likes + (isLiked ? 1 : 0)}</span>
            </button>
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3 md:w-4 md:h-4" />
              {testimonial.date}
            </div>
          </div>
          <a
            href={`https://wa.me/${testimonial.phone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 bg-[#00A550]/20 hover:bg-[#00A550]/30 rounded-full transition-colors text-[#00A550]"
          >
            <MessageCircle className="w-3 h-3 md:w-4 md:h-4" />
            <span className="hidden md:inline">Написать</span>
          </a>
        </div>
      </div>
    </div>
  );
}