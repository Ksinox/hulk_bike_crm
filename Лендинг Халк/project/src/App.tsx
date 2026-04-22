import React, { useState, useEffect } from 'react';
import { Clock, Fuel, FileCheck, CreditCard, Menu, X } from 'lucide-react';
import { Timer } from './components/Timer';
import { HowItWorks } from './components/HowItWorks';
import { IncomeSection } from './components/IncomeSection';
import { ScooterSection } from './components/ScooterSection';
import { AdvantagesSection } from './components/AdvantagesSection';
import { TestimonialsSection } from './components/TestimonialsSection';
import { SpecialOffersSection } from './components/SpecialOffersSection';
import { FAQSection } from './components/FAQSection';
import { FinalCTASection } from './components/FinalCTASection';

function App() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const secondSectionStart = window.innerHeight;
      
      if (currentScrollY < secondSectionStart) {
        setIsHeaderVisible(true);
        return;
      }
      
      if (currentScrollY > lastScrollY) {
        setIsHeaderVisible(false);
      } else {
        setIsHeaderVisible(true);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    const headerHeight = 80;
    
    if (element) {
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerHeight;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
    setIsMobileMenuOpen(false);
  };

  const menuItems = [
    { id: 'income', label: 'Доход' },
    { id: 'how-it-works', label: 'Как это работает' },
    { id: 'advantages', label: 'Преимущества' },
    { id: 'scooters', label: 'Скутеры' },
    { id: 'testimonials', label: 'Отзывы' },
    { id: 'faq', label: 'FAQ' }
  ];

  return (
    <div className="min-h-screen bg-[#111] text-white relative overflow-hidden">
      {/* SVG Filters */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <filter id="heading-filter">
            <feFlood floodColor="#00A550" result="flood1" />
            <feFlood floodColor="#00A550" result="flood2" />
            <feComposite in="flood1" in2="SourceAlpha" operator="in" result="text"/>
            <feGaussianBlur in="text" stdDeviation="1" result="blur"/>
            <feOffset in="blur" dx="2" dy="2" result="offsetBlur"/>
            <feMerge>
              <feMergeNode in="offsetBlur"/>
              <feMergeNode in="flood2"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* Header with Logo */}
      <header className={`fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-lg border-b border-gray-800/50 transition-transform duration-300 ${
        isHeaderVisible ? 'translate-y-0' : '-translate-y-full'
      }`}>
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <img 
            src="https://i.postimg.cc/bNtZSx24/logo.png" 
            alt="Hulk Bike Logo" 
            className="h-16 w-auto object-contain"
          />
          <nav className="hidden md:flex items-center gap-6 ml-auto">
            {menuItems.map(item => (
              <button 
                key={item.id}
                onClick={() => scrollToSection(item.id)} 
                className="text-gray-300 hover:text-[#00A550] transition-colors"
              >
                {item.label}
              </button>
            ))}
          </nav>
          <button 
            className="md:hidden text-white"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-black/95 backdrop-blur-lg border-b border-gray-800/50">
            <div className="container mx-auto px-4 py-4">
              <div className="flex flex-col gap-4">
                {menuItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => scrollToSection(item.id)}
                    className="text-gray-300 hover:text-[#00A550] transition-colors text-left py-2"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <div 
        className="relative flex items-start pt-20"
        style={{
          backgroundImage: 'url(https://i.postimg.cc/Yq5mdnHp/image.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          minHeight: 'calc(100vh - 80px)',
          marginTop: '80px'
        }}
      >
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            {/* Left Column - Main Content */}
            <div>
              {/* Promo Timer */}
              <div className="backdrop-blur-lg bg-white/10 rounded-lg p-2 md:p-4 border border-[#00A550] relative group mb-4 md:mb-8 max-w-xl">
                <div className="absolute inset-0 rounded-xl bg-[#00A550] opacity-20 blur-md group-hover:opacity-30 transition-opacity"></div>
                <div className="absolute inset-0 rounded-xl border border-[#00A550] shadow-[0_0_15px_rgba(0,165,80,0.5)] animate-pulse"></div>
                
                <div className="relative z-10">
                  <p className="text-sm md:text-xl font-bold mb-1 md:mb-2 text-white">
                    🎁 ПЕРВЫЙ ДЕНЬ АРЕНДЫ{' '}
                    <span 
                      className="relative group/tooltip cursor-help"
                      title="При аренде от 7 дней"
                    >
                      <span className="border-b border-dashed border-white">БЕСПЛАТНО!</span>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-[#00A550] text-white p-2 rounded text-xs opacity-0 group-hover/tooltip:opacity-100 transition-opacity">
                        При аренде от 7 дней
                        <span className="absolute w-2 h-2 bg-[#00A550] transform rotate-45 left-1/2 -translate-x-1/2 -bottom-1"></span>
                      </span>
                    </span>
                  </p>
                  <div className="flex items-center gap-1 md:gap-3 text-xs md:text-base">
                    <Clock className="w-3 h-3 md:w-5 md:h-5 text-[#00A550]" />
                    <span className="font-medium">До конца акции:</span>
                    <Timer />
                  </div>
                </div>
              </div>

              <div className="space-y-4 md:space-y-8">
                <h2 className="text-4xl md:text-6xl font-black leading-tight transform -skew-x-12" style={{
                  textShadow: '4px 4px 0 #00A550',
                  WebkitTextStroke: '2px #00A550'
                }}>
                  ДОСТАВЛЯЙ БЫСТРЕЕ – ЗАРАБАТЫВАЙ БОЛЬШЕ!
                </h2>
                <p className="text-xl md:text-3xl text-[#00A550] font-bold transform -skew-x-12" style={{
                  textShadow: '2px 2px 0 #000'
                }}>
                  БЕРИ СКУТЕР В АРЕНДУ И ЗАБУДЬ ПРО ПРОБКИ!
                </p>

                <div className="grid grid-cols-3 gap-4 max-w-2xl">
                  <div className="backdrop-blur-lg bg-white/10 rounded-xl p-4 border border-white/20 hover:bg-white/20 transition-all duration-300 flex flex-col items-center text-center">
                    <Fuel className="w-10 h-10 text-[#00A550] mb-2" />
                    <span className="text-sm leading-tight font-medium">1,5 л на 100 км</span>
                  </div>
                  <div className="backdrop-blur-lg bg-white/10 rounded-xl p-4 border border-white/20 hover:bg-white/20 transition-all duration-300 flex flex-col items-center text-center">
                    <FileCheck className="w-10 h-10 text-[#00A550] mb-2" />
                    <span className="text-sm leading-tight font-medium">5 минут на оформление</span>
                  </div>
                  <div className="backdrop-blur-lg bg-white/10 rounded-xl p-4 border border-white/20 hover:bg-white/20 transition-all duration-300 flex flex-col items-center text-center">
                    <CreditCard className="w-10 h-10 text-[#00A550] mb-2" />
                    <span className="text-sm leading-tight font-medium">Аренда под выкуп</span>
                  </div>
                </div>

                <a 
                  href="https://wa.me/79958995829?text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82!%20%F0%9F%91%8B%20%D0%A5%D0%BE%D1%87%D1%83%20%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D0%BE%D0%B2%D0%B0%D1%82%D1%8C%20%D1%81%D0%BA%D1%83%D1%82%D0%B5%D1%80"
                  target="_blank"
                  rel="noopener noreferrer" 
                  className="inline-block bg-gradient-to-r from-[#00A550] to-[#4CAF50] text-xl md:text-2xl font-black py-4 md:py-6 px-8 md:px-12 rounded-xl hover:scale-105 transition-all duration-300 shadow-lg shadow-[#00A550]/20" 
                >
                  <span className="hidden md:inline">ЗАБРОНИРОВАТЬ СКУТЕР</span>
                  <span className="md:hidden">ЗАБРОНИРОВАТЬ</span>
                </a>
              </div>
            </div>

            {/* Right Column - Image or additional content */}
            <div className="hidden lg:block">
              {/* Additional content */}
            </div>
          </div>
        </div>
      </div>

      {/* Other Sections */}
      <div className="container mx-auto px-4">
        {[
          { id: 'income', component: <IncomeSection /> },
          { id: 'how-it-works', component: <HowItWorks /> },
          { id: 'advantages', component: <AdvantagesSection /> }
        ].map((section, index) => (
          <div 
            key={section.id}
            id={section.id}
            className="pt-4 md:pt-12 pb-4 md:pb-12"
            style={{
              marginTop: index === 0 ? '0' : '-20px'
            }}
          >
            {section.component}
          </div>
        ))}

        <div id="scooters" className="pt-4 md:pt-12 pb-4 md:pb-12">
          <ScooterSection />
        </div>

        {[
          { id: 'testimonials', component: <TestimonialsSection /> },
          { id: 'special-offers', component: <SpecialOffersSection /> },
          { id: 'faq', component: <FAQSection /> }
        ].map((section, index) => (
          <div 
            key={section.id}
            id={section.id}
            className="pt-4 md:pt-12 pb-4 md:pb-12"
          >
            {section.component}
          </div>
        ))}

        <div className="pb-4 md:pb-12">
          <FinalCTASection />
        </div>
      </div>
    </div>
  );
}

export default App;