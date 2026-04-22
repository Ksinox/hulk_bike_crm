import React, { useState } from 'react';
import { Phone, MessageCircle, Clock, X } from 'lucide-react';
import { SupportContact } from './types';

const supportContacts: SupportContact[] = [
  {
    type: 'Телефон',
    value: '+7 (999) 123-45-67',
    icon: 'Phone',
    available: '24/7'
  },
  {
    type: 'WhatsApp',
    value: '+7 (999) 123-45-67',
    icon: 'MessageCircle',
    available: '9:00 - 21:00'
  }
];

export function EmergencySupport() {
  const [isOpen, setIsOpen] = useState(false);

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Phone': return <Phone className="w-5 h-5" />;
      case 'MessageCircle': return <MessageCircle className="w-5 h-5" />;
      default: return null;
    }
  };

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] md:bottom-8 right-4 md:right-8 z-[100]">
      {/* Support Modal */}
      {isOpen && (
        <div 
          className="absolute bottom-full right-0 mb-4 w-80 bg-gray-800 rounded-lg p-6 transform transition-transform"
          style={{ boxShadow: '6px 6px 0 rgba(0,165,80,0.3)' }}
        >
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>

          <h3 className="text-xl font-bold mb-4">Срочная помощь</h3>

          <div className="space-y-4">
            {supportContacts.map((contact, index) => (
              <div 
                key={index}
                className="bg-gray-900 rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {getIcon(contact.icon)}
                    <span className="font-bold">{contact.type}</span>
                  </div>
                  <a 
                    href={contact.type === 'WhatsApp' 
                      ? `https://wa.me/${contact.value.replace(/\D/g, '')}`
                      : `tel:${contact.value.replace(/\D/g, '')}`
                    }
                    className="text-[#00A550] hover:underline"
                  >
                    {contact.value}
                  </a>
                </div>
                <div className="text-sm text-gray-400 flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {contact.available}
                </div>
              </div>
            ))}
          </div>

          <p className="text-sm text-gray-400 mt-4">
            Техническая поддержка работает круглосуточно. Среднее время ответа - 2 минуты.
          </p>
        </div>
      )}

      {/* Support Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`bg-[#00A550] text-white px-6 py-3 rounded-full font-bold flex items-center gap-2 hover:bg-[#008040] transition-colors shadow-lg ${
          isOpen ? 'ring-4 ring-[#00A550]/30' : ''
        }`}
        style={{ boxShadow: '0 4px 12px rgba(0,165,80,0.3)' }}
      >
        <Phone className="w-5 h-5" />
        Срочная помощь
      </button>
    </div>
  );
}