import React from 'react';
import { FileCheck, ClipboardCheck, FileText, Rocket } from 'lucide-react';
import { DocumentsTooltip } from './DocumentsTooltip';

export function HowItWorks() {
  return (
    <div className="mt-24 mb-24" data-aos="fade-up">
      <h2 className="text-4xl font-black mb-12 text-center transform -skew-x-12" style={{
        textShadow: '4px 4px 0 #00A550',
        WebkitTextStroke: '2px #00A550'
      }}>
        КАК ЭТО РАБОТАЕТ
      </h2>

      <div className="relative">
        {/* Timeline line with animation */}
        <div className="absolute left-1/2 transform -translate-x-1/2 top-0 bottom-0 w-1 bg-[#00A550] opacity-50">
          <div className="absolute top-0 left-0 right-0 bottom-0 animate-pulse bg-[#00A550]"></div>
        </div>

        <div className="space-y-24">
          {/* Step 1 */}
          <div className="flex items-center gap-8" data-aos="fade-right">
            <div className="flex-1 text-right">
              <div className="inline-block bg-[#00A550] text-4xl font-black p-4 rounded-full transform -rotate-12 animate-bounce" style={{
                boxShadow: '4px 4px 0 rgba(0,0,0,0.5)'
              }}>
                1️⃣
              </div>
              <h3 className="text-xl font-bold mt-4">Выбираешь скутер и оставляешь заявку</h3>
            </div>
            <div className="w-8 h-8 bg-[#00A550] rounded-full z-10 flex items-center justify-center animate-ping">
              <div className="w-4 h-4 bg-white rounded-full"></div>
            </div>
            <div className="flex-1">
              <ClipboardCheck className="w-12 h-12 text-[#00A550] animate-pulse" />
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-center gap-8" data-aos="fade-left">
            <div className="flex-1 text-right">
              <FileText className="w-12 h-12 text-[#00A550] ml-auto animate-pulse" />
            </div>
            <div className="w-8 h-8 bg-[#00A550] rounded-full z-10 flex items-center justify-center animate-ping">
              <div className="w-4 h-4 bg-white rounded-full"></div>
            </div>
            <div className="flex-1">
              <div className="inline-block bg-[#00A550] text-4xl font-black p-4 rounded-full transform -rotate-12 animate-bounce" style={{
                boxShadow: '4px 4px 0 rgba(0,0,0,0.5)'
              }}>
                2️⃣
              </div>
              <h3 className="text-xl font-bold mt-4">Приезжаешь с <DocumentsTooltip /> – оформление за 5 минут</h3>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-center gap-8" data-aos="fade-right">
            <div className="flex-1 text-right">
              <div className="inline-block bg-[#00A550] text-4xl font-black p-4 rounded-full transform -rotate-12 animate-bounce" style={{
                boxShadow: '4px 4px 0 rgba(0,0,0,0.5)'
              }}>
                3️⃣
              </div>
              <h3 className="text-xl font-bold mt-4">Забираешь скутер и начинаешь зарабатывать!</h3>
            </div>
            <div className="w-8 h-8 bg-[#00A550] rounded-full z-10 flex items-center justify-center animate-ping">
              <div className="w-4 h-4 bg-white rounded-full"></div>
            </div>
            <div className="flex-1">
              <Rocket className="w-12 h-12 text-[#00A550] animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}