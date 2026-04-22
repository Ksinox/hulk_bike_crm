import React from 'react';
import { Phone, MessageCircle, Send } from 'lucide-react';
import { ContactMethod } from './types';

const contacts: ContactMethod[] = [
  {
    type: 'WhatsApp',
    value: '+7 (999) 123-45-67',
    icon: 'MessageCircle',
    primary: true
  },
  {
    type: 'Телефон',
    value: '+7 (999) 123-45-67',
    icon: 'Phone'
  },
  {
    type: 'Telegram',
    value: '@hulk_bike',
    icon: 'Send'
  }
];

export function ContactButtons() {
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Phone': return <Phone className="w-5 h-5" />;
      case 'MessageCircle': return <MessageCircle className="w-5 h-5" />;
      case 'Send': return <Send className="w-5 h-5" />;
      default: return null;
    }
  };

  const getLink = (contact: ContactMethod) => {
    switch (contact.type) {
      case 'WhatsApp':
        return `https://wa.me/${contact.value.replace(/\D/g, '')}`;
      case 'Telegram':
        return `https://t.me/${contact.value.replace('@', '')}`;
      case 'Телефон':
        return `tel:${contact.value.replace(/\D/g, '')}`;
      default:
        return '#';
    }
  };

  return (
    <div className="flex flex-wrap gap-4 justify-center">
      {contacts.map((contact, index) => (
        <a
          key={index}
          href={getLink(contact)}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold transition-all transform hover:scale-105 ${
            contact.primary
              ? 'bg-[#00A550] text-white hover:bg-[#008040]'
              : 'bg-gray-800 text-white hover:bg-gray-700'
          }`}
          style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.3)' }}
        >
          {getIcon(contact.icon)}
          <span>{contact.type}</span>
        </a>
      ))}
    </div>
  );
}