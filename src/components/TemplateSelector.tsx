import React from 'react';
import { Template } from '../types';
import { Sparkles } from 'lucide-react';

interface TemplateSelectorProps {
  templates: Template[];
  selectedTemplate: Template;
  onTemplateSelect: (template: Template) => void;
  disabled?: boolean;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  templates,
  selectedTemplate,
  onTemplateSelect,
  disabled = false
}) => {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-bold uppercase tracking-wider text-stone-500 font-sans flex items-center gap-1">
        2. Choose Frame Theme
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
        {templates.map((template) => {
          const isSelected = selectedTemplate.id === template.id;
          return (
            <button
              key={template.id}
              onClick={() => !disabled && onTemplateSelect(template)}
              disabled={disabled}
              className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                disabled 
                  ? 'opacity-60 cursor-not-allowed'
                  : 'cursor-pointer hover:bg-stone-50'
              } ${
                isSelected 
                  ? 'border-stone-900 bg-stone-50 shadow-sm' 
                  : 'border-stone-200 bg-white'
              }`}
            >
              {/* Color Swatch Preview */}
              <div 
                className="w-10 h-10 rounded-xl border border-stone-200/80 flex items-center justify-center shrink-0 shadow-sm"
                style={{ backgroundColor: template.backgroundColor }}
              >
                <span 
                  className="text-xs font-bold tracking-wider"
                  style={{ color: template.textColor }}
                >
                  Aa
                </span>
              </div>

              {/* Text metadata */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-stone-850 truncate font-sans">
                    {template.name}
                  </h4>
                  {template.id === 'vintage-dark' && (
                    <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                  )}
                </div>
                <p className="text-[10px] text-stone-400 font-sans line-clamp-1">
                  {template.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
