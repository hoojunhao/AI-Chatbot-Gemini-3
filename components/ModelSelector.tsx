import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { AppSettings, ModelType } from '../types';

interface ModelSelectorProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
}

type Mode = 'fast' | 'thinking' | 'pro';

const ModelSelector: React.FC<ModelSelectorProps> = ({ settings, onUpdateSettings }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getCurrentMode = (): Mode => {
    if (settings.model === ModelType.GEMINI_3_PRO) return 'pro';
    if (settings.model === ModelType.GEMINI_3_FLASH && settings.thinkingLevel === 'HIGH') return 'thinking';
    return 'fast';
  };

  const currentMode = getCurrentMode();

  const handleSelectMode = (mode: Mode) => {
    let newSettings = { ...settings };

    if (mode === 'fast') {
      newSettings.model = ModelType.GEMINI_3_FLASH;
      newSettings.thinkingLevel = 'LOW';
    } else if (mode === 'thinking') {
      newSettings.model = ModelType.GEMINI_3_FLASH;
      newSettings.thinkingLevel = 'HIGH';
    } else if (mode === 'pro') {
      newSettings.model = ModelType.GEMINI_3_PRO;
      // Thinking level doesn't strictly matter for Pro in this context
    }

    onUpdateSettings(newSettings);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left z-20" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-[#1e1f20] hover:bg-gray-200 dark:hover:bg-[#333] rounded-full text-gray-700 dark:text-gray-300 transition-colors"
      >
        <span className="text-sm font-medium">
          {currentMode === 'fast' && 'Fast'}
          {currentMode === 'thinking' && 'Thinking'}
          {currentMode === 'pro' && 'Pro'}
        </span>
        <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 right-0 w-60 bg-[#f0f4f9] dark:bg-[#1e1f20] rounded-2xl shadow-xl border border-white/20 dark:border-black/10 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-bottom-right">
          <div className="p-1.5 space-y-0.5">
            <div className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300">
              Gemini 3
            </div>

            {/* Fast Option */}
            <button
              onClick={() => handleSelectMode('fast')}
              className="w-full text-left p-2 rounded-xl hover:bg-white dark:hover:bg-[#333] transition-colors flex items-center justify-between group"
            >
              <div>
                <div className={`text-sm font-medium ${currentMode === 'fast' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                  Fast
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Answers quickly
                </div>
              </div>
              {currentMode === 'fast' && (
                <div className="bg-blue-600 rounded-full p-0.5">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              )}
            </button>

            {/* Thinking Option */}
            <button
              onClick={() => handleSelectMode('thinking')}
              className="w-full text-left p-2 rounded-xl hover:bg-white dark:hover:bg-[#333] transition-colors flex items-center justify-between group"
            >
              <div>
                <div className={`text-sm font-medium ${currentMode === 'thinking' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                  Thinking
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Solves complex problems
                </div>
              </div>
              {currentMode === 'thinking' && (
                <div className="bg-blue-600 rounded-full p-0.5">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              )}
            </button>

            {/* Pro Option */}
            <button
              onClick={() => handleSelectMode('pro')}
              className="w-full text-left p-2 rounded-xl hover:bg-white dark:hover:bg-[#333] transition-colors flex items-center justify-between group"
            >
              <div>
                <div className={`text-sm font-medium ${currentMode === 'pro' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                  Pro
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Thinks longer for advanced math & code
                </div>
              </div>
              {currentMode === 'pro' && (
                <div className="bg-blue-600 rounded-full p-0.5">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelSelector;