import { UserLocation } from '../types';

// ============================================
// Location Service
// ============================================
// Provides IP-based and browser geolocation services

export class LocationService {
  private static readonly IP_API_URL = 'https://ipapi.co/json/';
  private static readonly NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';

  /**
   * Get approximate location from IP address (no permission needed)
   */
  static async getLocationFromIP(): Promise<UserLocation> {
    try {
      const response = await fetch(this.IP_API_URL);
      if (!response.ok) {
        throw new Error(`IP geolocation failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.reason || 'IP geolocation failed');
      }

      // Build localized display name (IP API doesn't provide district-level detail)
      const displayName = this.buildDisplayName(undefined, data.city, data.region, data.country_name);

      return {
        latitude: data.latitude,
        longitude: data.longitude,
        city: data.city,
        region: data.region,
        country: data.country_name,
        displayName,
        source: 'ip',
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('IP geolocation error:', error);
      throw error;
    }
  }

  /**
   * Get precise location from browser Geolocation API (requires permission)
   */
  static async getLocationFromBrowser(): Promise<UserLocation> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;

            // Reverse geocode to get address
            const address = await this.reverseGeocode(latitude, longitude);

            return resolve({
              latitude,
              longitude,
              city: address.city,
              region: address.region,
              country: address.country,
              displayName: address.displayName,
              source: 'gps',
              timestamp: Date.now(),
            });
          } catch (error) {
            // If reverse geocoding fails, return coordinates only
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              displayName: `${position.coords.latitude.toFixed(4)}°, ${position.coords.longitude.toFixed(4)}°`,
              source: 'gps',
              timestamp: Date.now(),
            });
          }
        },
        (error) => {
          let message = 'Location access denied';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = 'Location permission denied';
              break;
            case error.POSITION_UNAVAILABLE:
              message = 'Location information unavailable';
              break;
            case error.TIMEOUT:
              message = 'Location request timed out';
              break;
          }
          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // 5 minutes cache
        }
      );
    });
  }

  /**
   * Reverse geocode coordinates to address using OpenStreetMap Nominatim
   */
  private static async reverseGeocode(
    lat: number,
    lon: number
  ): Promise<{ district?: string; city?: string; region?: string; country?: string; displayName: string }> {
    const lang = navigator.language.split('-')[0]; // e.g., 'zh' from 'zh-TW'
    const url = `${this.NOMINATIM_URL}?lat=${lat}&lon=${lon}&format=json&accept-language=${lang}&addressdetails=1&zoom=18`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'GeminiChat/1.0', // Nominatim requires User-Agent
      },
    });

    if (!response.ok) {
      throw new Error(`Reverse geocoding failed: ${response.status}`);
    }

    const data = await response.json();
    const address = data.address || {};

    // Log full address for debugging
    console.log('📍 Nominatim address response:', address);

    // Extract all address components from most specific to least
    const road = address.road || address.street;
    const neighbourhood = address.neighbourhood || address.quarter || address.hamlet;
    const suburb = address.suburb || address.city_district || address.borough;
    const village = address.village;
    const town = address.town;
    const city = address.city;
    const county = address.county;
    const region = address.state || address.province;
    const country = address.country;

    // Build display name matching IP format: district, city, country
    // Use town as district (e.g., "Zhongli District"), suburb is too granular (village level)
    const displayCity = city || county;
    const displayDistrict = town || suburb;

    return {
      district: displayDistrict,
      city: displayCity,
      region,
      country,
      displayName: this.buildDisplayName(displayDistrict, displayCity, region, country),
    };
  }

  /**
   * Build a localized display name with 3 levels: District, City, Country
   */
  private static buildFullDisplayName(addr: {
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    village?: string;
    town?: string;
    city?: string;
    county?: string;
    region?: string;
    country?: string;
  }): string {
    const lang = navigator.language;

    // Determine the 3 levels: district, city, country
    // Priority: suburb (district) → town → village → neighbourhood
    const district = addr.suburb || addr.town || addr.village || addr.neighbourhood;
    const city = addr.city || addr.county || addr.region;
    const country = addr.country;

    // For CJK languages, use country-city-district order (no commas)
    if (lang.startsWith('zh') || lang.startsWith('ja') || lang.startsWith('ko')) {
      const parts: string[] = [];
      if (country) parts.push(country);
      if (city && city !== country) parts.push(city);
      if (district && district !== city) parts.push(district);
      return parts.join('') || 'Unknown location';
    }

    // For Western languages, use district, city, country order with commas
    const parts: string[] = [];
    if (district && district !== city) parts.push(district);
    if (city && city !== country) parts.push(city);
    if (country) parts.push(country);
    return parts.join(', ') || 'Unknown location';
  }

  /**
   * Build a localized display name from address components
   * Format varies by locale (e.g., "台灣桃園市中壢區" vs "Zhongli District, Taoyuan City, Taiwan")
   */
  private static buildDisplayName(district?: string, city?: string, region?: string, country?: string): string {
    const lang = navigator.language;
    const parts: string[] = [];

    // For CJK languages, use country-region-city-district order (no commas)
    if (lang.startsWith('zh') || lang.startsWith('ja') || lang.startsWith('ko')) {
      if (country) parts.push(country);
      if (region && region !== city) parts.push(region);
      if (city) parts.push(city);
      if (district && district !== city) parts.push(district);
      return parts.join('') || 'Unknown location';
    }

    // For Western languages, use district, city, region, country order
    if (district && district !== city) parts.push(district);
    if (city) parts.push(city);
    if (region && region !== city) parts.push(region);
    if (country) parts.push(country);
    return parts.join(', ') || 'Unknown location';
  }

  /**
   * Format location for system instruction
   */
  static formatLocationContext(location: UserLocation): string {
    const coordStr = `${Math.abs(location.latitude).toFixed(2)}°${location.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(location.longitude).toFixed(2)}°${location.longitude >= 0 ? 'E' : 'W'}`;
    return `[User Location: ${location.displayName} (${coordStr})]`;
  }

  /**
   * Get localized strings for UI
   */
  static getLocalizedStrings(): { basedOn: string; updateLocation: string } {
    const lang = navigator.language;

    // Chinese
    if (lang.startsWith('zh')) {
      return {
        basedOn: '根據裝置的位置資訊',
        updateLocation: '更新位置',
      };
    }

    // Japanese
    if (lang.startsWith('ja')) {
      return {
        basedOn: 'デバイスの位置情報に基づく',
        updateLocation: '位置を更新',
      };
    }

    // Korean
    if (lang.startsWith('ko')) {
      return {
        basedOn: '기기 위치 정보 기반',
        updateLocation: '위치 업데이트',
      };
    }

    // Default: English
    return {
      basedOn: 'Based on your IP address',
      updateLocation: 'Update location',
    };
  }
}
