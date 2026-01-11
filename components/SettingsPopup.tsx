import React, { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, ChevronRight, Check, Sun, Moon, Monitor, Loader2 } from 'lucide-react';
import { ThemePreference, UserLocation } from '../types';
import { LocationService } from '../services/locationService';

interface SettingsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPreferences: () => void;
  themePreference: ThemePreference;
  onSetThemePreference: (pref: ThemePreference) => void;
  userLocation: UserLocation | null;
  locationLoading: boolean;
  onUpdateLocation: () => void;
}

const SettingsPopup: React.FC<SettingsPopupProps> = ({
  isOpen,
  onClose,
  onOpenPreferences,
  themePreference,
  onSetThemePreference,
  userLocation,
  locationLoading,
  onUpdateLocation,
}) => {
  const [showThemeSubmenu, setShowThemeSubmenu] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const strings = LocationService.getLocalizedStrings();

  // Close popup when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
        setShowThemeSubmenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showThemeSubmenu) {
          setShowThemeSubmenu(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, showThemeSubmenu]);

  // Reset submenu state when popup closes
  useEffect(() => {
    if (!isOpen) {
      setShowThemeSubmenu(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePreferencesClick = () => {
    onOpenPreferences();
    onClose();
  };

  const handleThemeSelect = (pref: ThemePreference) => {
    onSetThemePreference(pref);
    onClose();
  };

  return (
    <div
      ref={popupRef}
      className="absolute bottom-full mb-2 left-0 w-72 bg-[#f0f4f9] dark:bg-[#1e1f20] rounded-2xl shadow-lg border border-gray-200/50 dark:border-[#333]/50 z-50"
    >
      {/* Menu Items */}
      <div className="py-2">
        {/* Preferences */}
        <button
          onClick={handlePreferencesClick}
          className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#333] transition-colors cursor-pointer"
        >
          <SlidersHorizontal className="w-4 h-4 text-gray-500" />
          <span>Preferences</span>
        </button>

        {/* Theme with Submenu */}
        <div
          className="relative"
          onMouseEnter={() => setShowThemeSubmenu(true)}
          onMouseLeave={() => setShowThemeSubmenu(false)}
        >
          <button
            className="flex items-center justify-between w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#333] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Sun className="w-4 h-4 text-gray-500" />
              <span>Theme</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>

          {/* Theme Submenu */}
          {showThemeSubmenu && (
            <div className="absolute left-full top-0 w-[184px] bg-[#f0f4f9] dark:bg-[#1e1f20] rounded-lg shadow-lg border border-gray-200/50 dark:border-[#333]/50 py-1">
              {/* System */}
              <button
                onClick={() => handleThemeSelect('system')}
                className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#333] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Monitor className="w-4 h-4 text-gray-500" />
                  <span>System</span>
                </div>
                {themePreference === 'system' && (
                  <Check className="w-4 h-4 text-blue-500" />
                )}
              </button>

              {/* Light */}
              <button
                onClick={() => handleThemeSelect('light')}
                className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#333] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Sun className="w-4 h-4 text-gray-500" />
                  <span>Light</span>
                </div>
                {themePreference === 'light' && (
                  <Check className="w-4 h-4 text-blue-500" />
                )}
              </button>

              {/* Dark */}
              <button
                onClick={() => handleThemeSelect('dark')}
                className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#333] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Moon className="w-4 h-4 text-gray-500" />
                  <span>Dark</span>
                </div>
                {themePreference === 'dark' && (
                  <Check className="w-4 h-4 text-blue-500" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Location Section - Non-interactive */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-[#333]">
        <div className="flex items-start gap-2">
          {/* Blue dot indicator */}
          <div className="mt-1.5 flex-shrink-0">
            {locationLoading ? (
              <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
            ) : (
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Location name */}
            <div className="text-xs font-medium text-blue-600 dark:text-blue-400 break-words">
              {locationLoading ? (
                <span className="text-gray-500 dark:text-gray-400">...</span>
              ) : userLocation ? (
                userLocation.displayName
              ) : (
                <span className="text-gray-500 dark:text-gray-400">Location unavailable</span>
              )}
            </div>

            {/* Subtext and update link */}
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              <span>{userLocation?.source === 'gps' ? 'From your device' : strings.basedOn}</span>
              <span className="mx-1">·</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateLocation();
                }}
                disabled={locationLoading}
                className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {strings.updateLocation}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPopup;
