import React from 'react';
import { UserLocation } from '../types';
import { LocationService } from '../services/locationService';
import { Loader2 } from 'lucide-react';

interface LocationDisplayProps {
  location: UserLocation | null;
  loading: boolean;
  onUpdateLocation: () => void;
  isOpen: boolean;
}

const LocationDisplay: React.FC<LocationDisplayProps> = ({
  location,
  loading,
  onUpdateLocation,
  isOpen,
}) => {
  const strings = LocationService.getLocalizedStrings();

  // Don't render when sidebar is collapsed
  if (!isOpen) return null;

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-2">
        {/* Blue dot indicator */}
        <div className="mt-1.5 flex-shrink-0">
          {loading ? (
            <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
          ) : (
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Location name */}
          <div className="text-sm font-medium text-blue-600 dark:text-blue-400 truncate">
            {loading ? (
              <span className="text-gray-500 dark:text-gray-400">...</span>
            ) : location ? (
              location.displayName
            ) : (
              <span className="text-gray-500 dark:text-gray-400">Location unavailable</span>
            )}
          </div>

          {/* Subtext and update link */}
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            <span>{location?.source === 'gps' ? strings.basedOn.replace('IP address', 'GPS') : strings.basedOn}</span>
            <span className="mx-1">·</span>
            <button
              onClick={onUpdateLocation}
              disabled={loading}
              className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {strings.updateLocation}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationDisplay;
