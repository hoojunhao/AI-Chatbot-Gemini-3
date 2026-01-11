# Google Maps Personal Places Integration Plan

## Overview

Allow AI to be aware of user's saved places (Home, Work) for personalized responses, plus enable Gemini Maps Grounding for real-time location data in AI responses.

## Simplified Approach

**No additional API keys required!**

- **Saved Places**: Simple text input with optional geocoding via free OpenStreetMap Nominatim (already used in app)
- **Maps Grounding**: Built into Gemini API - uses your existing `VITE_GEMINI_API_KEY`
- **"Use Current Location"**: Leverage existing `locationService.ts` to save current position as Home/Work

---

## Implementation Steps

### Phase 1: Database Schema

Create `user_places` table in Supabase:

```sql
CREATE TABLE user_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL, -- 'home', 'work', or custom label
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  city TEXT,
  region TEXT,
  country TEXT,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, label)
);

-- RLS policies
ALTER TABLE user_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own places"
ON user_places FOR ALL USING (auth.uid() = user_id);
```

### Phase 2: Types

**File: [types.ts](types.ts)**

```typescript
export interface SavedPlace {
  id: string;
  userId: string;
  label: string; // 'home', 'work', or custom
  address?: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  region?: string;
  country?: string;
  displayName: string;
  createdAt: number;
  updatedAt: number;
}
```

**File: [types.ts](types.ts)** - Update AppSettings

```typescript
export interface AppSettings {
  // ... existing fields
  enableSavedPlaces: boolean;      // Include saved places in AI context
  enableMapsGrounding: boolean;    // Enable real-time Maps data for location queries
}
```

### Phase 3: Places Service

**File: [services/placesService.ts](services/placesService.ts)** (new)

```typescript
export class PlacesService {
  // CRUD operations
  static async fetchPlaces(userId: string): Promise<SavedPlace[]>;
  static async savePlace(userId: string, place: Partial<SavedPlace>): Promise<SavedPlace>;
  static async deletePlace(userId: string, placeId: string): Promise<void>;

  // Geocode address using existing Nominatim (free, no API key)
  static async geocodeAddress(address: string): Promise<{lat: number, lng: number, displayName: string} | null>;

  // Format for AI context
  static formatPlacesContext(places: SavedPlace[]): string;
  // Example output: "[User's Saved Places: Home - Taipei, Taiwan (25.03°N, 121.57°E); Work - Taoyuan City, Taiwan (24.99°N, 121.31°E)]"
}
```

### Phase 4: Simple UI Components

**File: [components/SavedPlacesSection.tsx](components/SavedPlacesSection.tsx)** (new)

Simple inline section in Settings (not a separate page):

```typescript
// Features:
// - List of saved places (Home, Work)
// - "Add Place" button
// - Edit/Delete per place

// Add Place Form:
// - Label dropdown: Home | Work | Custom
// - Address text input with "Search" button (geocodes via Nominatim)
// - OR "Use Current Location" button (uses existing locationService)
// - Display resolved location before saving
```

**File: [components/Settings.tsx](components/Settings.tsx)** - Modify

Add "Saved Places" section:
- Toggle: "Enable saved places for personalized responses"
- Toggle: "Enable Maps grounding for location queries"
- SavedPlacesSection component

### Phase 5: Gemini Context Integration

**File: [services/geminiService.ts](services/geminiService.ts)**

```typescript
// Add parameter to generateResponseStream
savedPlaces?: SavedPlace[],

// Build context
const placesContext = savedPlaces?.length
  ? PlacesService.formatPlacesContext(savedPlaces)
  : '';

const enhancedSystemInstruction = [
  dateTimeContext,
  locationContext,
  placesContext,  // "[User's Saved Places: Home - Taipei, Taiwan; Work - Taoyuan City]"
  settings.systemInstruction
].filter(Boolean).join('\n\n');
```

### Phase 6: Gemini Maps Grounding

**File: [services/geminiService.ts](services/geminiService.ts)**

Maps Grounding is **built into Gemini API** - no extra API key needed!

```typescript
// Detect location queries
function isLocationQuery(message: string): boolean {
  const keywords = ['near', 'nearby', 'restaurant', 'cafe', 'hotel',
    'directions', 'how to get', 'where is', 'find places', 'near my home', 'near my work'];
  return keywords.some(k => message.toLowerCase().includes(k));
}

// In generateResponseStream:
const useGrounding = settings.enableMapsGrounding && isLocationQuery(newMessage);

const params: GenerateContentParameters = {
  model: settings.model,
  contents: contents,
  config: {
    ...config,
    tools: useGrounding ? [{ googleMaps: {} }] : undefined,
    toolConfig: useGrounding ? {
      retrievalConfig: {
        latLng: {
          latitude: savedPlaces?.find(p => p.label === 'home')?.latitude ?? userLocation?.latitude,
          longitude: savedPlaces?.find(p => p.label === 'home')?.longitude ?? userLocation?.longitude
        }
      }
    } : undefined
  }
};
```

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| [types.ts](types.ts) | Modify | Add `SavedPlace` type, update `AppSettings` |
| [constants.ts](constants.ts) | Modify | Add default values for new settings |
| [services/placesService.ts](services/placesService.ts) | Create | CRUD + geocoding + context formatting |
| [services/settingsService.ts](services/settingsService.ts) | Modify | Handle new settings fields |
| [services/geminiService.ts](services/geminiService.ts) | Modify | Add places context + Maps grounding |
| [components/SavedPlacesSection.tsx](components/SavedPlacesSection.tsx) | Create | Simple UI for managing places |
| [components/Settings.tsx](components/Settings.tsx) | Modify | Add toggles + SavedPlacesSection |
| [App.tsx](App.tsx) | Modify | Load saved places on auth |
| Supabase | Migration | Create `user_places` table |

---

## No Additional API Keys Required

- **Geocoding**: Uses existing OpenStreetMap Nominatim (free, already in `locationService.ts`)
- **Maps Grounding**: Built into Gemini API, uses existing `VITE_GEMINI_API_KEY`
- **Current Location**: Uses existing browser Geolocation API

---

## Verification Plan

### 1. Saved Places
- [ ] Can add Home by typing address → geocodes correctly
- [ ] Can add Work using "Use Current Location" button
- [ ] Places persist in database across sessions
- [ ] Can edit and delete places

### 2. AI Context
- [ ] Ask: "What's the weather at my home?" → AI knows Home location
- [ ] Ask: "How far is my work from the airport?" → AI uses Work location

### 3. Maps Grounding
- [ ] Ask: "Find restaurants near my home" → Real restaurant data in response
- [ ] Ask: "What's 2+2?" → No Maps grounding triggered (saves API calls)
