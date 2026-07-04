import React from 'react';
import { Camera, Sparkles } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-40 bg-[#FCFAF7]/80 backdrop-blur-md border-b border-stone-200/60 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-600 shadow-sm border border-rose-100">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-sans tracking-tight text-stone-900 flex items-center gap-1.5">
              PhotoBooth <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-medium tracking-wide">Studio</span>
            </h1>
            <p className="text-xs text-stone-500 font-sans hidden sm:block">Create beautiful aesthetic digital photo strips</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs sm:text-sm font-sans font-medium text-stone-600">
          <div className="flex items-center gap-1 bg-stone-100 px-3 py-1.5 rounded-full text-stone-700">
            <Sparkles className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
            <span>Pinterest Style templates</span>
          </div>
        </div>
      </div>
    </header>
  );
};
