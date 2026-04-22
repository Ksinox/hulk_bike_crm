import React from 'react';
import { MapPin, Clock } from 'lucide-react';
import { Location } from './types';

const locations: Location[] = [
  {
    id: 1,
    name: "Пункт выдачи в Краснодаре",
    address: "ул. Корницкого, 47",
    coordinates: {
      lat: 45.0355,
      lng: 38.9875
    },
    workingHours: "09:00 - 21:00",
    phone: "+7 (995) 899-58-29"
  }
];

export function LocationMap() {
  return (
    <div className="grid md:grid-cols-2 gap-8">
      <div className="space-y-6">
        <h3 className="text-2xl font-bold mb-4">Пункт выдачи</h3>
        <div className="space-y-4">
          {locations.map(location => (
            <div
              key={location.id}
              className="bg-gray-800 p-6 rounded-lg transform hover:scale-[1.02] transition-all duration-300"
              style={{ boxShadow: '4px 4px 0 rgba(0,165,80,0.3)' }}
            >
              <h4 className="text-lg font-bold mb-2">{location.name}</h4>
              <div className="space-y-2 text-gray-300">
                <div className="flex items-start gap-2">
                  <MapPin className="w-5 h-5 text-[#00A550] mt-1" />
                  <span>{location.address}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="w-5 h-5 text-[#00A550] mt-1" />
                  <span>{location.workingHours}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="relative h-[400px] bg-gray-800 rounded-lg overflow-hidden">
        <iframe
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2819.0636982859386!2d38.985311715537894!3d45.035499979098234!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x40f04f9c3f331f45%3A0x88f62d0c5e6c7e3a!2z0YPQuy4g0JrQvtGA0L3QuNGG0LrQvtCz0L4sIDQ3LCDQmtGA0LDRgdC90L7QtNCw0YAsINCa0YDQsNGB0L3QvtC00LDRgNGB0LrQuNC5INC60YDQsNC5LCAzNTAwODc!5e0!3m2!1sru!2sru!4v1645789012345!5m2!1sru!2sru"
          width="100%"
          height="100%"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        ></iframe>
      </div>
    </div>
  );
}