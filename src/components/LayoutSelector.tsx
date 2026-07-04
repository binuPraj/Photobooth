import React from 'react';
import { Layout } from '../types';
import { Columns2, Columns3, Columns4 } from 'lucide-react';

interface LayoutSelectorProps {
  layouts: Layout[];
  selectedLayout: Layout;
  onLayoutSelect: (layout: Layout) => void;
  disabled?: boolean;
}

export const LayoutSelector: React.FC<LayoutSelectorProps> = ({
  layouts,
  selectedLayout,
  onLayoutSelect,
  disabled = false
}) => {
  const getLayoutIcon = (photosCount: number) => {
    switch (photosCount) {
      case 2:
        return <Columns2 className="w-5 h-5" />;
      case 3:
        return <Columns3 className="w-5 h-5" />;
      case 4:
      default:
        return <Columns4 className="w-5 h-5" />;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-bold uppercase tracking-wider text-stone-500 font-sans">
        1. Select Layout
      </label>
      <div className="grid grid-cols-3 gap-2">
        {layouts.map((layout) => {
          const isSelected = selectedLayout.id === layout.id;
          return (
            <button
              key={layout.id}
              onClick={() => !disabled && onLayoutSelect(layout)}
              disabled={disabled}
              className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                disabled 
                  ? 'opacity-60 cursor-not-allowed'
                  : 'cursor-pointer hover:border-stone-400'
              } ${
                isSelected 
                  ? 'border-stone-900 bg-stone-900 text-white shadow-sm' 
                  : 'border-stone-200 bg-white text-stone-700'
              }`}
            >
              <div className="mb-1">{getLayoutIcon(layout.photosCount)}</div>
              <span className="text-xs font-semibold font-sans">{layout.name}</span>
              <span className={`text-[10px] ${isSelected ? 'text-stone-300' : 'text-stone-400'} font-sans`}>
                {layout.photosCount} photos
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
