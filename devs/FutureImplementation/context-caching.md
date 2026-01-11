# Google Gemini Context Caching Implementation Plan

## Overview

Implement Google Gemini's Context Caching API to achieve up to **90% cost savings** on cached tokens. The cache will store system instruction + cross-session memories for logged-in users.

## Key Requirements

| Requirement | Decision |
|-------------|----------|
| Cache Target | System instruction + cross-session memories |
| Users | Logged-in users only |
| TTL Management | Automatic (24hr default, extend 1hr on use) |
| UI Feedback | Console logging only |
| Min Tokens | 1,024 (Flash) / 4,096 (Pro) |

## Implementation Steps

### Step 1: Add Types and Configuration

**Files:** [types.ts](types.ts), [constants.ts](constants.ts)

Add `CacheMetadata` and `CacheConfig` interfaces:
```typescript
interface CacheMetadata {
  cacheName: string;      // From ai.caches.create()
  userId: string;
  contentHash: string;    // Hash to detect content changes
  model: string;
  tokenCount: number;
  createdAt: number;
  expiresAt: number;
}
```

Add cache configuration constants:
```typescript
export const CACHE_CONFIG = {
  minTokensFlash: 1024,
  minTokensPro: 4096,
  defaultTtlSeconds: 86400,   // 24 hours
  refreshTtlSeconds: 3600,    // 1 hour extension on use
  displayNamePrefix: 'user-context-',
};
```

### Step 2: Create CacheService

**New File:** `services/cacheService.ts`

Core methods:
- `getOrCreateCache(userId, model, systemInstruction, memories)` - Returns cache name or null
- `invalidateCache(userId)` - Deletes cache when content changes
- `refreshCacheTTL(cacheName)` - Extends TTL on cache hit

Key logic:
1. Generate content hash from system instruction + memories
2. Check if valid cache exists (not expired, hash matches, same model)
3. If valid: refresh TTL, return cache name (cache hit)
4. If invalid/missing: check token threshold, create new cache if met
5. Log all operations to console

### Step 3: Integrate with GeminiService

**File:** [services/geminiService.ts](services/geminiService.ts)

Modify `generateResponseStream()` (~lines 84-210):

```typescript
// Before building context, try to get cache
let cacheName: string | null = null;

if (enableCrossSessionMemory && userId && !isTemporary) {
  const cacheService = getCacheService(apiKey);
  const memories = await memoryService.retrieveRelevantMemories(userId, newMessage);
  cacheName = await cacheService.getOrCreateCache(userId, model, systemInstruction, memories);
}

// When making API call
const config = {
  temperature: settings.temperature,
  safetySettings: [...],
  // Include system instruction ONLY if not using cache
  ...(cacheName ? {} : { systemInstruction: enhancedSystemInstruction }),
  // Add cachedContent if available
  ...(cacheName ? { cachedContent: cacheName } : {}),
};
```

### Step 4: Add Cache Invalidation Triggers

**File:** [services/memoryService.ts](services/memoryService.ts)

After memory storage/update/delete operations:
```typescript
const cacheService = getCacheService(apiKey);
await cacheService.invalidateCache(userId);
console.log('Cache invalidated due to memory update');
```

**File:** [services/settingsService.ts](services/settingsService.ts)

When system instruction changes, flag for cache invalidation.

### Step 5: Console Logging Format

```
[CACHE HIT] User: abc123... | Cache: cachedContents/xyz | Time: 15ms
   90% cost savings on cached tokens

[CACHE MISS] User: abc123... | Reason: Below threshold (800/1024 tokens)

[CACHE CREATED] User: abc123... | Tokens: 2500 | Time: 250ms
   Future requests will use cached context
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `services/cacheService.ts` | **CREATE** - Core cache management |
| `types.ts` | **MODIFY** - Add cache types |
| `constants.ts` | **MODIFY** - Add CACHE_CONFIG |
| `services/geminiService.ts` | **MODIFY** - Use cache in API calls |
| `services/memoryService.ts` | **MODIFY** - Invalidate on memory changes |

## Cache Lifecycle

```
User sends message
       │
       ▼
┌─────────────────────────┐
│ Check existing cache    │
│ (in-memory metadata)    │
└───────────┬─────────────┘
            │
     ┌──────┴──────┐
     │             │
  Valid?        Invalid/Missing
     │             │
     ▼             ▼
┌─────────┐  ┌──────────────────┐
│ Refresh │  │ Token threshold  │
│ TTL     │  │ met?             │
└────┬────┘  └────────┬─────────┘
     │         Yes    │    No
     │          ▼     │     ▼
     │    ┌─────────┐ │ ┌─────────┐
     │    │ Create  │ │ │ No cache│
     │    │ cache   │ │ │ (skip)  │
     │    └────┬────┘ │ └─────────┘
     │         │      │
     └────┬────┘      │
          │           │
          ▼           │
   Use cachedContent  │
   in API request     │
          │           │
          └───────────┘
```

## Edge Cases

| Case | Handling |
|------|----------|
| Cache expired | Create new on next request |
| Memories changed | Content hash mismatch → new cache |
| System instruction changed | New cache on next request |
| Below token threshold | Skip caching, log reason |
| API error | Graceful fallback to non-cached |
| Model changed | Create cache for new model |
| Temporary chat | Always skip caching |

## Verification

1. **Cache Creation**: Send message as logged-in user with sufficient memories → see "CACHE CREATED" log
2. **Cache Hit**: Send another message → see "CACHE HIT" log with 90% savings note
3. **Cache Invalidation**: Update a memory → see "Cache invalidated" log, next message creates new cache
4. **Threshold Check**: New user with few memories → see "CACHE MISS" with threshold reason
5. **API Dashboard**: Verify cached_content_token_count appears in usage stats

## Sources

- [Context caching | Gemini API](https://ai.google.dev/gemini-api/docs/caching)
- [Caching API Reference](https://ai.google.dev/api/caching)
