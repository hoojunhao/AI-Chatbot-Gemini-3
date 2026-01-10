import { GoogleGenAI } from "@google/genai";
import { Message } from '../types';
import { TOKEN_ESTIMATION_CONFIG } from '../constants';

/**
 * Token Estimator Service
 *
 * Provides hybrid token counting with:
 * - Language-aware local estimation (fast, free, ~90% accurate)
 * - Periodic API validation (accurate, costs money)
 * - In-memory caching to reduce API calls
 */

// In-memory cache for token counts
const tokenCache = new Map<string, number>();

// Track API validation counter
let messageCountSinceLastValidation = 0;

/**
 * Creates a hash key for caching
 */
function createCacheKey(text: string): string {
  // Simple hash function for cache keys
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `token_${hash}_${text.length}`;
}

/**
 * Language-aware local token estimation
 *
 * Strategy:
 * - CJK characters (Chinese/Japanese/Korean): ~1 token per character
 * - Latin characters (English/European): ~4 characters per token
 */
export function estimateTokensLocal(text: string): number {
  if (!text) return 0;

  // Detect CJK characters (Chinese, Japanese, Korean)
  const cjkRegex = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g;
  const cjkChars = (text.match(cjkRegex) || []).length;
  const nonCjkChars = text.length - cjkChars;

  // Calculate tokens based on language
  const cjkTokens = cjkChars * TOKEN_ESTIMATION_CONFIG.cjkCharsPerToken;
  const latinTokens = nonCjkChars / TOKEN_ESTIMATION_CONFIG.latinCharsPerToken;

  return Math.ceil(cjkTokens + latinTokens);
}

/**
 * Estimates token count for a message (local only)
 */
export function estimateMessageTokensLocal(message: Message): number {
  let tokens = 0;

  // Text content
  tokens += estimateTokensLocal(message.text);

  // Attachments (images are ~258 tokens for inline data reference)
  if (message.attachments) {
    tokens += message.attachments.length * 258;

    // Base64 image data (rough estimate)
    message.attachments.forEach(att => {
      tokens += Math.ceil(att.data.length / 1000);
    });
  }

  // Role overhead (~4 tokens per message for role markers)
  tokens += 4;

  return tokens;
}

/**
 * Estimates total tokens for an array of messages (local only)
 */
export function estimateTotalTokensLocal(messages: Message[]): number {
  return messages.reduce((total, msg) => total + estimateMessageTokensLocal(msg), 0);
}

/**
 * Uses Gemini API to count tokens accurately
 *
 * This is the ground truth but costs money and time (~200ms per call)
 */
export async function estimateTokensWithAPI(
  text: string,
  apiKey: string
): Promise<number> {
  if (!text) return 0;

  // Check cache first
  const cacheKey = createCacheKey(text);
  if (tokenCache.has(cacheKey)) {
    return tokenCache.get(cacheKey)!;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Use countTokens method
    const result = await ai.models.countTokens({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text }]
        }
      ]
    });

    const tokenCount = result.totalTokens || 0;

    // Cache the result
    tokenCache.set(cacheKey, tokenCount);

    return tokenCount;
  } catch (error) {
    console.error('API token counting failed, falling back to local estimation:', error);
    return estimateTokensLocal(text);
  }
}

/**
 * Estimates tokens for a message with API accuracy
 */
export async function estimateMessageTokensWithAPI(
  message: Message,
  apiKey: string
): Promise<number> {
  let tokens = 0;

  // Text content
  tokens += await estimateTokensWithAPI(message.text, apiKey);

  // Attachments (use local estimation as API doesn't need to count base64)
  if (message.attachments) {
    tokens += message.attachments.length * 258;
    message.attachments.forEach(att => {
      tokens += Math.ceil(att.data.length / 1000);
    });
  }

  // Role overhead
  tokens += 4;

  return tokens;
}

/**
 * Hybrid token estimation
 *
 * Strategy:
 * 1. Use local estimation by default (fast, free)
 * 2. Every Nth message, validate with API
 * 3. Before summarization, always use API
 */
export async function estimateTokensHybrid(
  text: string,
  apiKey: string | null,
  forcePrecise: boolean = false
): Promise<number> {
  // If no API key, always use local
  if (!apiKey) {
    return estimateTokensLocal(text);
  }

  // If force precise (e.g., before summarization), use API
  if (forcePrecise && TOKEN_ESTIMATION_CONFIG.useAPIBeforeSummarization) {
    return estimateTokensWithAPI(text, apiKey);
  }

  // Check if we should validate with API
  messageCountSinceLastValidation++;
  const shouldValidate = messageCountSinceLastValidation >= TOKEN_ESTIMATION_CONFIG.useAPIValidationFrequency;

  if (shouldValidate) {
    messageCountSinceLastValidation = 0; // Reset counter
    return estimateTokensWithAPI(text, apiKey);
  }

  // Default: use local estimation
  return estimateTokensLocal(text);
}

/**
 * Estimates tokens for a message (hybrid approach)
 */
export async function estimateMessageTokens(
  message: Message,
  apiKey: string | null = null,
  forcePrecise: boolean = false
): Promise<number> {
  let tokens = 0;

  // Text content
  tokens += await estimateTokensHybrid(message.text, apiKey, forcePrecise);

  // Attachments
  if (message.attachments) {
    tokens += message.attachments.length * 258;
    message.attachments.forEach(att => {
      tokens += Math.ceil(att.data.length / 1000);
    });
  }

  // Role overhead
  tokens += 4;

  return tokens;
}

/**
 * Estimates total tokens for an array of messages (hybrid approach)
 */
export async function estimateTotalTokens(
  messages: Message[],
  apiKey: string | null = null,
  forcePrecise: boolean = false
): Promise<number> {
  let total = 0;
  for (const msg of messages) {
    total += await estimateMessageTokens(msg, apiKey, forcePrecise);
  }
  return total;
}

/**
 * Clears the token cache (useful for testing or memory management)
 */
export function clearTokenCache(): void {
  tokenCache.clear();
  messageCountSinceLastValidation = 0;
}

/**
 * Gets cache statistics
 */
export function getCacheStats(): { size: number; entries: number } {
  return {
    size: tokenCache.size,
    entries: tokenCache.size
  };
}
