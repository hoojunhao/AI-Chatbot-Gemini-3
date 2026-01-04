import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Zap, Brain, Sparkles } from 'lucide-react';
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
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#2a2b2d] text-gray-600 dark:text-gray-300 transition-colors"
      >
        <span className="text-lg font-medium text-gray-600 dark:text-gray-200">
          {currentMode === 'fast' && 'Gemini 3 Flash'}
          {currentMode === 'thinking' && 'Gemini 3 Thinking'}
          {currentMode === 'pro' && 'Gemini 3 Pro'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-[320px] bg-[#f0f4f9] dark:bg-[#1e1f20] rounded-2xl shadow-xl border border-white/20 dark:border-black/10 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-left">
          <div className="p-2 space-y-1">
            <div className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Model Selection
            </div>

            {/* Fast Option */}
            <button
              onClick={() => handleSelectMode('fast')}
              className="w-full text-left p-3 rounded-xl hover:bg-white dark:hover:bg-[#333] transition-colors flex items-start justify-between group"
            >
              <div className="flex gap-3">
                <div className={`mt-1 ${currentMode === 'fast' ? 'text-blue-600' : 'text-gray-500'}`}>
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className={`font-medium ${currentMode === 'fast' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                    Fast
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Answers quickly
                  </div>
                </div>
              </div>
              {currentMode === 'fast' && (
                <div className="bg-blue-600 rounded-full p-1 mt-1">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              )}
            </button>

            {/* Thinking Option */}
            <button
              onClick={() => handleSelectMode('thinking')}
              className="w-full text-left p-3 rounded-xl hover:bg-white dark:hover:bg-[#333] transition-colors flex items-start justify-between group"
            >
              <div className="flex gap-3">
                <div className={`mt-1 ${currentMode === 'thinking' ? 'text-blue-600' : 'text-gray-500'}`}>
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <div className={`font-medium ${currentMode === 'thinking' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                    Thinking
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Solves complex problems
                  </div>
                </div>
              </div>
              {currentMode === 'thinking' && (
                <div className="bg-blue-600 rounded-full p-1 mt-1">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              )}
            </button>

            {/* Pro Option */}
            <button
              onClick={() => handleSelectMode('pro')}
              className="w-full text-left p-3 rounded-xl hover:bg-white dark:hover:bg-[#333] transition-colors flex items-start justify-between group"
            >
              <div className="flex gap-3">
                <div className={`mt-1 ${currentMode === 'pro' ? 'text-blue-600' : 'text-gray-500'}`}>
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className={`font-medium ${currentMode === 'pro' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                    Pro
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Thinks longer for advanced math & code
                  </div>
                </div>
              </div>
              {currentMode === 'pro' && (
                <div className="bg-blue-600 rounded-full p-1 mt-1">
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