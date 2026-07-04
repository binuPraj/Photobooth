import React from 'react';
import { Calendar, Type, Clock } from 'lucide-react';

interface ControlPanelProps {
  caption: string;
  onCaptionChange: (val: string) => void;
  subCaption: string;
  onSubCaptionChange: (val: string) => void;
  countdownDuration: number;
  onCountdownChange: (val: number) => void;
  disabled?: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  caption,
  onCaptionChange,
  subCaption,
  onSubCaptionChange,
  countdownDuration,
  onCountdownChange,
  disabled = false
}) => {
  return (
    <div className="flex flex-col gap-4 bg-stone-50/50 border border-stone-200/60 rounded-3xl p-5 sm:p-6">
      <label className="text-xs font-bold uppercase tracking-wider text-stone-500 font-sans">
        3. Customize Details
      </label>

      <div className="flex flex-col gap-3">
        {/* Caption Input */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-stone-600 flex items-center gap-1 font-sans">
            <Type className="w-3.5 h-3.5 text-stone-400" /> Title/Names
          </span>
          <input
            type="text"
            value={caption}
            onChange={(e) => onCaptionChange(e.target.value)}
            disabled={disabled}
            placeholder="e.g., Emily & Jack"
            maxLength={32}
            className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-sans outline-none focus:border-stone-400 disabled:opacity-60 transition-all text-stone-850"
          />
        </div>

        {/* Subcaption Input */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-stone-600 flex items-center gap-1 font-sans">
            <Calendar className="w-3.5 h-3.5 text-stone-400" /> Date/Location
          </span>
          <input
            type="text"
            value={subCaption}
            onChange={(e) => onSubCaptionChange(e.target.value)}
            disabled={disabled}
            placeholder="e.g., July 4, 2026"
            maxLength={32}
            className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-sans outline-none focus:border-stone-400 disabled:opacity-60 transition-all text-stone-850"
          />
        </div>

        {/* Countdown Timer Input */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-stone-600 flex items-center gap-1 font-sans">
            <Clock className="w-3.5 h-3.5 text-stone-400" /> Countdown Timer
          </span>
          <div className="flex gap-2">
            {[3, 5, 8].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => onCountdownChange(sec)}
                disabled={disabled}
                className={`flex-1 text-xs font-sans font-medium py-2 rounded-xl border transition-all ${
                  countdownDuration === sec
                    ? 'border-stone-900 bg-stone-950 text-white font-semibold shadow-sm'
                    : 'border-stone-250 bg-white text-stone-600 hover:bg-stone-50'
                } disabled:opacity-60`}
              >
                {sec}s
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
