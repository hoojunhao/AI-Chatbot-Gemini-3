import React from 'react';
import { X, Shield, Brain } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  isLoggedIn?: boolean;
  onOpenMemoryManager?: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  isLoggedIn = false,
  onOpenMemoryManager,
}) => {
  if (!isOpen) return null;

  const handleChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onUpdateSettings({ ...settings, [key]: value });
  };

  const handleSafetyChange = (key: keyof AppSettings['safetySettings'], value: string) => {
    onUpdateSettings({
      ...settings,
      safetySettings: {
        ...settings.safetySettings,
        [key]: value
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#1e1f20] rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-[#333]">
          <h2 className="text-xl font-medium text-gray-800 dark:text-gray-100">Settings</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-[#333] rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-8">
          
          {/* Memory, Temperature & System Prompt */}
          <section className="space-y-6">
             <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Enable Memory</h3>
                    <p className="text-xs text-gray-500">Allow Gemini to remember previous messages in this session.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings.enableMemory} onChange={(e) => handleChange('enableMemory', e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
             </div>

             {/* Cross-Session Memory */}
             {isLoggedIn && (
               <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-100 dark:border-blue-800/30">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <Brain className="w-5 h-5 text-blue-500" />
                     <div>
                       <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Remember Me Across Sessions</h3>
                       <p className="text-xs text-gray-500">Gemini will remember facts about you across different conversations.</p>
                     </div>
                   </div>
                   <label className="relative inline-flex items-center cursor-pointer">
                     <input
                       type="checkbox"
                       checked={settings.enableCrossSessionMemory}
                       onChange={(e) => handleChange('enableCrossSessionMemory', e.target.checked)}
                       className="sr-only peer"
                     />
                     <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                   </label>
                 </div>
                 {settings.enableCrossSessionMemory && onOpenMemoryManager && (
                   <button
                     onClick={() => {
                       onClose();
                       onOpenMemoryManager();
                     }}
                     className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                   >
                     <Brain className="w-3 h-3" />
                     Manage Your Memories
                   </button>
                 )}
               </div>
             )}

             <div>
                <div className="flex justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Temperature</h3>
                    <span className="text-xs font-mono text-gray-500 bg-gray-100 dark:bg-[#333] px-2 py-0.5 rounded">{settings.temperature}</span>
                </div>
                <input 
                    type="range" 
                    min="0" 
                    max="2" 
                    step="0.1" 
                    value={settings.temperature} 
                    onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                />
                <p className="text-xs text-gray-500 mt-2">Lower values for more deterministic responses, higher for more creative ones.</p>
             </div>

             <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">System Instructions</h3>
                <textarea 
                  value={settings.systemInstruction}
                  onChange={(e) => handleChange('systemInstruction', e.target.value)}
                  placeholder="e.g. You are an expert coding assistant..."
                  className="w-full h-24 p-3 rounded-xl bg-gray-50 dark:bg-[#2a2b2d] border border-gray-200 dark:border-[#444] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none dark:text-gray-200 placeholder-gray-400"
                />
             </div>
          </section>

          {/* Safety Settings */}
          <section>
             <div className="flex items-center gap-2 mb-4">
               <Shield className="w-4 h-4 text-orange-500" />
               <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Safety Filters</h3>
             </div>
             
             <div className="space-y-3">
               {[
                 { key: 'sexuallyExplicit', label: 'Sexually Explicit' },
                 { key: 'hateSpeech', label: 'Hate Speech' },
                 { key: 'harassment', label: 'Harassment' },
                 { key: 'dangerousContent', label: 'Dangerous Content' },
               ].map((item) => (
                 <div key={item.key} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#2a2b2d] transition-colors">
                   <span className="text-sm text-gray-700 dark:text-gray-300">{item.label}</span>
                   <select 
                    // @ts-ignore
                     value={settings.safetySettings[item.key as keyof typeof settings.safetySettings]}
                     onChange={(e) => handleSafetyChange(item.key as keyof AppSettings['safetySettings'], e.target.value)}
                     className="text-xs bg-transparent text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-[#444] rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                   >
                     <option value="BLOCK_NONE">None</option>
                     <option value="BLOCK_ONLY_HIGH">Block High</option>
                     <option value="BLOCK_MEDIUM_AND_ABOVE">Block Med+</option>
                     <option value="BLOCK_LOW_AND_ABOVE">Block Low+</option>
                   </select>
                 </div>
               ))}
             </div>
          </section>
        </div>
        
        <div className="p-4 border-t border-gray-100 dark:border-[#333] flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium text-sm transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;