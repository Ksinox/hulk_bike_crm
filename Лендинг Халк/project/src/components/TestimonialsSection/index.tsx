import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TestimonialCard } from './TestimonialCard';
import { SuccessStoryCard } from './SuccessStoryCard';
import { VideoModal } from './VideoModal';
import { ReviewButton } from './ReviewButton';
import { AlertModal } from './AlertModal';
import { SuccessNotification } from './SuccessNotification';
import { Testimonial, SuccessStory } from './types';

const testimonials: Testimonial[] = [
  {
    id: 1,
    name: "Александр Петров",
    avatar: "https://images.unsplash.com/photo-1633332755192-727a05c4013d?auto=format&fit=crop&q=80&w=200",
    role: "Курьер Яндекс.Еда",
    rating: 5,
    text: "Работаю на скутере уже 3 месяца. Доход вырос в 2 раза по сравнению с работой пешком. Очень доволен!",
    income: {
      before: 45000,
      after: 90000
    },
    date: "15.03.2024",
    likes: 24,
    phone: "+79958995829"
  },
  {
    id: 2,
    name: "Мария Иванова",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200",
    role: "Курьер Delivery Club",
    rating: 5,
    text: "Спасибо HULK BIKE за возможность арендовать скутер! Теперь успеваю делать больше заказов и зарабатывать достойно.",
    income: {
      before: 35000,
      after: 85000
    },
    date: "20.03.2024",
    likes: 18,
    phone: "+79958995829"
  },
  {
    id: 3,
    name: "Дмитрий Соколов",
    avatar: "https://images.unsplash.com/photo-1639149888905-fb39731f2e6c?auto=format&fit=crop&q=80&w=200",
    role: "Курьер СберМаркет",
    rating: 5,
    isVideo: true,
    videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    videoThumbnail: "https://images.unsplash.com/photo-1590496793929-36417d3117de?auto=format&fit=crop&q=80&w=800",
    income: {
      before: 40000,
      after: 95000
    },
    date: "25.03.2024",
    likes: 32,
    phone: "+79958995829",
    text: "Видео отзыв о работе на скутере"
  }
];

const successStories: SuccessStory[] = [
  {
    id: 1,
    name: "Игорь Васильев",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200",
    title: "От пешего курьера до владельца скутера",
    description: "Начинал пешим курьером, но быстро понял, что нужно что-то менять. Взял скутер в аренду с выкупом, и через 3 месяца он окупил себя полностью!",
    stats: {
      ordersIncrease: 180,
      incomeIncrease: 210,
      monthlyIncome: 120000
    },
    image: "https://images.unsplash.com/photo-1625038032515-308ab14d10b9?auto=format&fit=crop&q=80&w=800"
  },
  {
    id: 2,
    name: "Анна Морозова",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=200",
    title: "Как я увеличила доход на 40% за месяц",
    description: "Благодаря скутеру я стала успевать делать в 2 раза больше заказов. Теперь зарабатываю достаточно, чтобы помогать семье.",
    stats: {
      ordersIncrease: 140,
      incomeIncrease: 160,
      monthlyIncome: 95000
    },
    image: "https://images.unsplash.com/photo-1619771914272-e3c1ba17ba4d?auto=format&fit=crop&q=80&w=800"
  }
];

export function TestimonialsSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);

  const handlePrev = () => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex(prev => Math.min(testimonials.length - 2, prev + 1));
  };

  const handleReviewSubmit = () => {
    setShowReviewForm(false);
    setShowSuccessNotification(true);
  };

  return (
    <div 
      id="testimonials-section" 
      className="mt-12 md:mt-24 relative pb-24 md:pb-0" 
      data-aos="fade-up"
    >
      <h2 className="heading-style text-4xl font-black mb-12 text-center">
        ОТЗЫВЫ НАШИХ КУРЬЕРОВ
      </h2>

      {/* Success Stories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
        {successStories.map(story => (
          <SuccessStoryCard key={story.id} story={story} />
        ))}
      </div>

      {/* Testimonials Carousel */}
      <div className="relative">
        <div className="flex gap-8">
          {testimonials.slice(currentIndex, currentIndex + 2).map(testimonial => (
            <div key={testimonial.id} className="flex-1">
              <TestimonialCard 
                testimonial={testimonial}
                onPlay={testimonial.isVideo ? () => setSelectedVideo(testimonial.videoUrl) : undefined}
              />
            </div>
          ))}
        </div>

        <button 
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 bg-[#00A550] p-2 rounded-full ${
            currentIndex === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#008040]'
          }`}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <button 
          onClick={handleNext}
          disabled={currentIndex >= testimonials.length - 2}
          className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 bg-[#00A550] p-2 rounded-full ${
            currentIndex >= testimonials.length - 2 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#008040]'
          }`}
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Review Button */}
      <ReviewButton onClick={() => setShowReviewForm(true)} />

      {/* Modals */}
      {selectedVideo && (
        <VideoModal 
          videoUrl={selectedVideo}
          onClose={() => setSelectedVideo(null)}
        />
      )}

      {showReviewForm && (
        <AlertModal onClose={() => setShowReviewForm(false)} />
      )}

      {showSuccessNotification && (
        <SuccessNotification onClose={() => setShowSuccessNotification(false)} />
      )}
    </div>
  );
}