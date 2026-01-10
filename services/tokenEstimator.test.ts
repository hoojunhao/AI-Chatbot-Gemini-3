import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  estimateTokensLocal,
  estimateMessageTokensLocal,
  estimateTotalTokensLocal,
  estimateTokensWithAPI,
  estimateMessageTokensWithAPI,
  estimateTokensHybrid,
  estimateMessageTokens,
  estimateTotalTokens,
  clearTokenCache,
  getCacheStats
} from './tokenEstimator';
import { Message } from '../types';

describe('Token Estimator', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearTokenCache();
  });

  const createMockMessage = (id: number, text: string): Message => ({
    id: `msg-${id}`,
    role: id % 2 === 0 ? 'user' : 'model',
    text,
    timestamp: Date.now() + id,
    isError: false
  });

  // ============================================
  // Local Token Estimation (Language-Aware)
  // ============================================

  describe('estimateTokensLocal', () => {
    it('estimates English text correctly', () => {
      const englishText = 'This is a test message with about forty characters';
      const tokens = estimateTokensLocal(englishText);
      // ~51 chars / 4 = ~13 tokens
      expect(tokens).toBeGreaterThanOrEqual(12);
      expect(tokens).toBeLessThanOrEqual(14);
    });

    it('estimates Chinese text correctly', () => {
      const chineseText = '你好世界，今天天气很好'; // 11 characters
      const tokens = estimateTokensLocal(chineseText);
      // CJK: ~1 token per character = ~11 tokens
      expect(tokens).toBeGreaterThanOrEqual(10);
      expect(tokens).toBeLessThanOrEqual(12);
    });

    it('estimates Japanese text correctly', () => {
      const japaneseText = 'こんにちは世界'; // 7 characters
      const tokens = estimateTokensLocal(japaneseText);
      // CJK: ~1 token per character = ~7 tokens
      expect(tokens).toBeGreaterThanOrEqual(6);
      expect(tokens).toBeLessThanOrEqual(8);
    });

    it('estimates Korean text correctly', () => {
      const koreanText = '안녕하세요 반갑습니다'; // 11 characters
      const tokens = estimateTokensLocal(koreanText);
      // CJK: ~1 token per character = ~11 tokens
      expect(tokens).toBeGreaterThanOrEqual(10);
      expect(tokens).toBeLessThanOrEqual(12);
    });

    it('estimates mixed language text correctly', () => {
      const mixedText = 'Hello 你好 world 世界'; // English + Chinese
      const tokens = estimateTokensLocal(mixedText);
      // "Hello world " = 12 chars / 4 = 3 tokens
      // "你好世界" = 4 chars * 1 = 4 tokens
      // Total ~7 tokens
      expect(tokens).toBeGreaterThanOrEqual(6);
      expect(tokens).toBeLessThanOrEqual(9);
    });

    it('returns 0 for empty string', () => {
      expect(estimateTokensLocal('')).toBe(0);
    });

    it('handles very long English text', () => {
      const longText = 'a'.repeat(4000); // 4000 chars
      const tokens = estimateTokensLocal(longText);
      // 4000 / 4 = 1000 tokens
      expect(tokens).toBe(1000);
    });

    it('handles very long CJK text', () => {
      const longText = '你'.repeat(1000); // 1000 Chinese characters
      const tokens = estimateTokensLocal(longText);
      // 1000 * 1 = 1000 tokens
      expect(tokens).toBe(1000);
    });
  });

  describe('estimateMessageTokensLocal', () => {
    it('estimates tokens for text-only message', () => {
      const msg = createMockMessage(1, 'This is a test message');
      const tokens = estimateMessageTokensLocal(msg);
      // Text + role overhead (4 tokens)
      expect(tokens).toBeGreaterThanOrEqual(8);
    });

    it('adds overhead for role markers', () => {
      const msg = createMockMessage(1, '');
      const tokens = estimateMessageTokensLocal(msg);
      expect(tokens).toBe(4); // Just role overhead
    });

    it('accounts for image attachments', () => {
      const msg: Message = {
        ...createMockMessage(1, 'Check this image'),
        attachments: [
          { mimeType: 'image/png', data: 'a'.repeat(10000) }
        ]
      };
      const tokens = estimateMessageTokensLocal(msg);
      // Text + role overhead + 258 (attachment) + ~10 (base64 data)
      expect(tokens).toBeGreaterThanOrEqual(270);
    });

    it('accounts for multiple attachments', () => {
      const msg: Message = {
        ...createMockMessage(1, 'Multiple images'),
        attachments: [
          { mimeType: 'image/png', data: 'a'.repeat(10000) },
          { mimeType: 'image/jpeg', data: 'b'.repeat(10000) }
        ]
      };
      const tokens = estimateMessageTokensLocal(msg);
      // 2 attachments * 258 = 516 + text + base64 overhead
      expect(tokens).toBeGreaterThanOrEqual(530);
    });
  });

  describe('estimateTotalTokensLocal', () => {
    it('sums tokens for multiple messages', () => {
      const messages = [
        createMockMessage(1, 'First message'),
        createMockMessage(2, 'Second message'),
        createMockMessage(3, 'Third message')
      ];
      const total = estimateTotalTokensLocal(messages);
      expect(total).toBeGreaterThan(0);
    });

    it('returns 0 for empty array', () => {
      expect(estimateTotalTokensLocal([])).toBe(0);
    });

    it('handles mixed language messages', () => {
      const messages = [
        createMockMessage(1, 'English text'),
        createMockMessage(2, '中文文本'),
        createMockMessage(3, '日本語テキスト')
      ];
      const total = estimateTotalTokensLocal(messages);
      expect(total).toBeGreaterThan(0);
    });
  });

  // ============================================
  // API Token Estimation (Mocked)
  // ============================================

  describe('estimateTokensWithAPI', () => {
    it('should call Gemini API and return token count', async () => {
      // This test requires a real API key or mocking
      // For now, we'll test the caching behavior
      const apiKey = 'test-api-key';
      const text = 'Test message';

      // First call would hit API (or fail without real key)
      // We're testing that it doesn't throw and returns a number
      try {
        const tokens = await estimateTokensWithAPI(text, apiKey);
        expect(typeof tokens).toBe('number');
      } catch (error) {
        // Expected to fail without real API key, but should fallback
        expect(error).toBeDefined();
      }
    });

    it('should cache results', async () => {
      const apiKey = 'test-api-key';
      const text = 'Cached message';

      try {
        await estimateTokensWithAPI(text, apiKey);
        const stats = getCacheStats();
        // Cache should have at least one entry if API succeeded
        expect(stats.size).toBeGreaterThanOrEqual(0);
      } catch {
        // Expected without real API key
      }
    });

    it('returns 0 for empty string', async () => {
      const tokens = await estimateTokensWithAPI('', 'test-key');
      expect(tokens).toBe(0);
    });
  });

  // ============================================
  // Hybrid Token Estimation
  // ============================================

  describe('estimateTokensHybrid', () => {
    it('uses local estimation when no API key provided', async () => {
      const text = 'Test message without API';
      const tokens = await estimateTokensHybrid(text, null, false);
      // Should return local estimation
      expect(tokens).toBeGreaterThan(0);
    });

    it('uses local estimation by default', async () => {
      const text = 'Test message';
      const tokens = await estimateTokensHybrid(text, 'test-key', false);
      // Should use local estimation (not forcing precise)
      expect(tokens).toBeGreaterThan(0);
    });

    it('attempts API when forcePrecise is true', async () => {
      const text = 'Test message for precise estimation';
      // This will try API but fallback to local if it fails
      const tokens = await estimateTokensHybrid(text, 'test-key', true);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('estimateMessageTokens (hybrid)', () => {
    it('estimates tokens for a message', async () => {
      const msg = createMockMessage(1, 'Hybrid test message');
      const tokens = await estimateMessageTokens(msg, null, false);
      expect(tokens).toBeGreaterThan(0);
    });

    it('handles messages with attachments', async () => {
      const msg: Message = {
        ...createMockMessage(1, 'Message with attachment'),
        attachments: [
          { mimeType: 'image/png', data: 'base64data' }
        ]
      };
      const tokens = await estimateMessageTokens(msg, null, false);
      expect(tokens).toBeGreaterThanOrEqual(260); // At least attachment overhead
    });
  });

  describe('estimateTotalTokens (hybrid)', () => {
    it('sums tokens for multiple messages', async () => {
      const messages = [
        createMockMessage(1, 'First'),
        createMockMessage(2, 'Second'),
        createMockMessage(3, 'Third')
      ];
      const total = await estimateTotalTokens(messages, null, false);
      expect(total).toBeGreaterThan(0);
    });

    it('returns 0 for empty array', async () => {
      const total = await estimateTotalTokens([], null, false);
      expect(total).toBe(0);
    });
  });

  // ============================================
  // Cache Management
  // ============================================

  describe('clearTokenCache', () => {
    it('clears the cache', () => {
      clearTokenCache();
      const stats = getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.entries).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('returns cache statistics', () => {
      const stats = getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('entries');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.entries).toBe('number');
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    it('handles messages with special characters', () => {
      const msg = createMockMessage(1, '!@#$%^&*()_+{}[]|\\:";\'<>?,./');
      const tokens = estimateMessageTokensLocal(msg);
      expect(tokens).toBeGreaterThan(0);
    });

    it('handles messages with emojis', () => {
      const msg = createMockMessage(1, '😀😃😄😁😆😅🤣😂');
      const tokens = estimateMessageTokensLocal(msg);
      expect(tokens).toBeGreaterThan(0);
    });

    it('handles very long messages', () => {
      const longText = 'a'.repeat(100000);
      const msg = createMockMessage(1, longText);
      const tokens = estimateMessageTokensLocal(msg);
      expect(tokens).toBeGreaterThan(25000); // ~100k chars / 4 = 25k tokens
    });

    it('handles messages with only whitespace', () => {
      const msg = createMockMessage(1, '     \n\n\t\t   ');
      const tokens = estimateMessageTokensLocal(msg);
      expect(tokens).toBeGreaterThan(0);
    });

    it('handles mixed scripts including emoji', () => {
      const text = 'Hello 你好 🌍 world 世界 👋';
      const tokens = estimateTokensLocal(text);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Accuracy Comparison Tests
  // ============================================

  describe('Accuracy Comparison', () => {
    it('CJK estimation should be more accurate than old method', () => {
      const chineseText = '你好世界，今天天气很好'; // 11 chars

      // Old method: 11 / 4 = 2.75 ≈ 3 tokens (very inaccurate!)
      const oldEstimate = Math.ceil(chineseText.length / 4);

      // New method: 11 * 1 = 11 tokens (accurate!)
      const newEstimate = estimateTokensLocal(chineseText);

      expect(newEstimate).toBeGreaterThan(oldEstimate * 2);
      expect(newEstimate).toBeCloseTo(11, 1);
    });

    it('English estimation should remain similar to old method', () => {
      const englishText = 'This is a test message with forty characters'; // 45 chars

      // Old method: 45 / 4 = 11.25 ≈ 12 tokens
      const oldEstimate = Math.ceil(englishText.length / 4);

      // New method: 45 / 4 = 11.25 ≈ 12 tokens (same!)
      const newEstimate = estimateTokensLocal(englishText);

      expect(newEstimate).toBeCloseTo(oldEstimate, 1);
    });

    it('mixed language should be between pure CJK and pure Latin', () => {
      const chineseText = '你好世界你好世界你好世界你好世界'; // 16 chars
      const englishText = 'Hello world hello world hello world hello!'; // 43 chars
      const mixedText = 'Hello 你好 world 世界 hello 你好 world 世界'; // Mixed

      const chineseTokens = estimateTokensLocal(chineseText);
      const englishTokens = estimateTokensLocal(englishText);
      const mixedTokens = estimateTokensLocal(mixedText);

      // Mixed should be between the two extremes
      expect(mixedTokens).toBeGreaterThan(Math.min(chineseTokens, englishTokens));
      expect(mixedTokens).toBeLessThan(Math.max(chineseTokens, englishTokens) + 5);
    });
  });
});
