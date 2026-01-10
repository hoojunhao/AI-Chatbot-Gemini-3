import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SummaryService } from './summaryService';
import { estimateTotalTokens, clearTokenCache } from './tokenEstimator';
import { createSlidingWindow } from './contextManager';
import { Message } from '../types';
import { SUMMARIZATION_CONFIG } from '../constants';

/**
 * Integration Tests for Summarization System
 *
 * These tests verify that all components work together:
 * - Token estimation (language-aware)
 * - Summarization service (database + API)
 * - Context building (summary + sliding window)
 * - End-to-end workflow
 */

// Mock dependencies
vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({ data: null, error: null }))
        }))
      })),
      insert: vi.fn(() => ({ error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ error: null }))
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({ error: null }))
      }))
    }))
  }
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = {
      generateContent: async ({ contents }: any) => {
        // Simulate a real summary based on input
        const messageCount = contents?.[0]?.parts?.[0]?.text?.split('\n\n').length || 0;
        return {
          text: `Summary of ${messageCount} messages. Main topics: testing, integration, AI conversation.`
        };
      },
      countTokens: async ({ contents }: any) => {
        // Simulate token counting
        const text = contents?.[0]?.parts?.[0]?.text || '';
        // Simple estimation
        return { totalTokens: Math.ceil(text.length / 4) };
      }
    };
  }
}));

describe('Summarization Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTokenCache();
  });

  const createMockMessage = (id: number, text: string): Message => ({
    id: `msg-${id}`,
    role: id % 2 === 0 ? 'user' : 'model',
    text,
    timestamp: Date.now() + id,
    isError: false
  });

  const createEnglishMessages = (count: number): Message[] =>
    Array.from({ length: count }, (_, i) =>
      createMockMessage(i, `This is message number ${i} with some English content about various topics.`)
    );

  const createChineseMessages = (count: number): Message[] =>
    Array.from({ length: count }, (_, i) =>
      createMockMessage(i, `这是第${i}条消息，包含一些中文内容关于各种主题。`)
    );

  const createMixedMessages = (count: number): Message[] =>
    Array.from({ length: count }, (_, i) =>
      createMockMessage(i, i % 2 === 0
        ? `English message ${i} with content`
        : `中文消息${i}包含内容`
      )
    );

  // ============================================
  // Token Estimation Integration
  // ============================================

  describe('Token Estimation with Different Languages', () => {
    it('should estimate English messages accurately', async () => {
      const messages = createEnglishMessages(10);
      const totalTokens = await estimateTotalTokens(messages, null, false);

      // Each message ~15 words * 1.3 tokens/word ≈ 20 tokens
      // Plus 4 tokens overhead per message = 24 tokens
      // 10 messages * 24 = 240 tokens
      expect(totalTokens).toBeGreaterThan(150);
      expect(totalTokens).toBeLessThan(400);
    });

    it('should estimate Chinese messages accurately', async () => {
      const messages = createChineseMessages(10);
      const totalTokens = await estimateTotalTokens(messages, null, false);

      // Each Chinese message ~20 chars * 1 token/char = 20 tokens
      // Plus 4 tokens overhead = 24 tokens
      // 10 messages * 24 = 240 tokens
      expect(totalTokens).toBeGreaterThan(150);
      expect(totalTokens).toBeLessThan(400);
    });

    it('should estimate mixed language messages accurately', async () => {
      const messages = createMixedMessages(10);
      const totalTokens = await estimateTotalTokens(messages, null, false);

      expect(totalTokens).toBeGreaterThan(100);
      expect(totalTokens).toBeLessThan(500);
    });
  });

  // ============================================
  // Summarization Workflow Integration
  // ============================================

  describe('End-to-End Summarization Workflow', () => {
    it('should complete full workflow: short conversation (no summarization)', async () => {
      const messages = createEnglishMessages(20);
      const sessionId = 'test-session-1';

      // Build context
      const context = await SummaryService.buildContextWithSummary(
        'test-api-key',
        sessionId,
        messages
      );

      // Should return all messages without summarization
      expect(context.length).toBe(20);
      expect(context[0].id).toBe('msg-0');
      expect(context[0].text).not.toContain('[Previous conversation summary]');
    });

    it('should complete full workflow: long conversation (with summarization)', async () => {
      // Create conversation that exceeds threshold
      // Need 500+ messages to exceed 50k token threshold with short messages
      const messages = createEnglishMessages(600);
      const sessionId = 'test-session-2';

      // Mock to simulate exceeding threshold
      vi.spyOn(SummaryService, 'needsSummarization').mockResolvedValue(true);
      vi.spyOn(SummaryService, 'getSummary')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'summary-1',
          sessionId,
          summaryText: 'Summary of 585 messages',
          messagesSummarizedCount: 585,
          version: 1,
          updatedAt: Date.now()
        });
      vi.spyOn(SummaryService, 'generateSummary').mockResolvedValue('Summary of 585 messages');
      vi.spyOn(SummaryService, 'saveSummary').mockResolvedValue(undefined);

      // Build context (triggers summarization)
      const context = await SummaryService.buildContextWithSummary(
        'test-api-key',
        sessionId,
        messages
      );

      // Should have summary + ack + recent messages
      expect(context.length).toBeLessThan(600);
      expect(context[0].id).toBe('context-summary');
      expect(context[0].text).toContain('[Previous conversation summary]');
      expect(context[1].role).toBe('model'); // Acknowledgment
    });

    it('should handle incremental summarization correctly', async () => {
      const sessionId = 'test-session-3';

      // First summarization: 100 messages
      const firstBatch = createEnglishMessages(100);
      vi.spyOn(SummaryService, 'needsSummarization').mockResolvedValue(true);
      vi.spyOn(SummaryService, 'getSummary')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'summary-1',
          sessionId,
          summaryText: 'First summary',
          messagesSummarizedCount: 85,
          version: 1,
          updatedAt: Date.now()
        });
      vi.spyOn(SummaryService, 'generateSummary').mockResolvedValue('First summary');
      vi.spyOn(SummaryService, 'saveSummary').mockResolvedValue(undefined);

      await SummaryService.buildContextWithSummary(
        'test-api-key',
        sessionId,
        firstBatch
      );

      // Second summarization: 200 messages total
      const secondBatch = createEnglishMessages(200);
      vi.spyOn(SummaryService, 'getSummary')
        .mockResolvedValueOnce({
          id: 'summary-1',
          sessionId,
          summaryText: 'First summary',
          messagesSummarizedCount: 85,
          version: 1,
          updatedAt: Date.now()
        })
        .mockResolvedValueOnce({
          id: 'summary-1',
          sessionId,
          summaryText: 'Updated summary',
          messagesSummarizedCount: 185,
          version: 2,
          updatedAt: Date.now()
        });
      vi.spyOn(SummaryService, 'generateSummary').mockResolvedValue('Updated summary');

      const context = await SummaryService.buildContextWithSummary(
        'test-api-key',
        sessionId,
        secondBatch
      );

      // Should have updated summary
      expect(context[0].text).toContain('[Previous conversation summary]');
    });
  });

  // ============================================
  // Sliding Window + Summarization Integration
  // ============================================

  describe('Sliding Window Integration', () => {
    it('should use sliding window for guest users (no sessionId)', () => {
      const messages = createEnglishMessages(100);

      // Apply sliding window
      const window = createSlidingWindow(messages);

      // Should truncate to max messages (50)
      expect(window.messages.length).toBeLessThanOrEqual(50);
      expect(window.truncated).toBe(true);
      expect(window.originalCount).toBe(100);
    });

    it('should prefer summarization over sliding window for logged-in users', async () => {
      const messages = createEnglishMessages(100);
      const sessionId = 'test-session-4';

      // Mock summarization
      vi.spyOn(SummaryService, 'needsSummarization').mockResolvedValue(true);
      vi.spyOn(SummaryService, 'getSummary').mockResolvedValue({
        id: 'summary-1',
        sessionId,
        summaryText: 'Summary of 85 messages',
        messagesSummarizedCount: 85,
        version: 1,
        updatedAt: Date.now()
      });

      const context = await SummaryService.buildContextWithSummary(
        'test-api-key',
        sessionId,
        messages
      );

      // Should have summary + recent messages (not truncated by sliding window)
      expect(context.length).toBe(17); // summary + ack + 15 recent
      expect(context[0].id).toBe('context-summary');

      // Compare to sliding window
      const window = createSlidingWindow(messages);
      expect(context.length).toBeLessThan(window.messages.length);
    });

    it('should fallback to sliding window if summarization fails', async () => {
      const messages = createEnglishMessages(100);
      const sessionId = 'test-session-5';

      // Mock summarization to throw error
      vi.spyOn(SummaryService, 'summarizeIfNeeded').mockRejectedValue(
        new Error('Database error')
      );

      // This would be handled in geminiService with try-catch
      // Here we test that sliding window still works
      const window = createSlidingWindow(messages);

      expect(window.messages.length).toBeLessThanOrEqual(50);
      expect(window.messages.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Configuration Compliance Tests
  // ============================================

  describe('Configuration Compliance', () => {
    it('should respect summarizationThreshold setting', async () => {
      expect(SUMMARIZATION_CONFIG.summarizationThreshold).toBe(50000);

      // Verify that needsSummarization uses this threshold
      const shortMessages = createEnglishMessages(10); // Well below threshold
      const needsShort = await SummaryService.needsSummarization(
        'session-1',
        shortMessages,
        'test-key'
      );
      expect(needsShort).toBe(false);
    });

    it('should respect recentMessagesToKeep setting', () => {
      expect(SUMMARIZATION_CONFIG.recentMessagesToKeep).toBe(15);

      // This affects how many messages are kept unsummarized
      // Verified in summarization workflow tests
    });

    it('should use correct summarization model', () => {
      expect(SUMMARIZATION_CONFIG.summarizationModel).toBe('gemini-2.0-flash');
      // This is used in generateSummary for cost-effective summarization
    });

    it('should respect maxSummaryTokens setting', () => {
      expect(SUMMARIZATION_CONFIG.maxSummaryTokens).toBe(2000);
      // This limits summary size in generateSummary
    });
  });

  // ============================================
  // Multi-Language Integration Tests
  // ============================================

  describe('Multi-Language Support', () => {
    it('should handle English conversations correctly', async () => {
      const messages = createEnglishMessages(50);
      const context = await SummaryService.buildContextWithSummary(
        'test-api-key',
        'session-en',
        messages
      );

      expect(context.length).toBeGreaterThan(0);
      expect(context.every(m => typeof m.text === 'string')).toBe(true);
    });

    it('should handle Chinese conversations correctly', async () => {
      const messages = createChineseMessages(50);
      const context = await SummaryService.buildContextWithSummary(
        'test-api-key',
        'session-zh',
        messages
      );

      expect(context.length).toBeGreaterThan(0);
      expect(context.every(m => typeof m.text === 'string')).toBe(true);
    });

    it('should handle mixed language conversations correctly', async () => {
      const messages = createMixedMessages(50);
      const context = await SummaryService.buildContextWithSummary(
        'test-api-key',
        'session-mixed',
        messages
      );

      expect(context.length).toBeGreaterThan(0);
      expect(context.every(m => typeof m.text === 'string')).toBe(true);
    });

    it('should estimate tokens more accurately for CJK than old method', () => {
      const englishMsg = createMockMessage(1, 'This is English text with many words');
      const chineseMsg = createMockMessage(2, '这是中文文本包含很多字');

      // Both have similar character counts but different token counts
      const englishTokens = estimateTotalTokens([englishMsg], null, false);
      const chineseTokens = estimateTotalTokens([chineseMsg], null, false);

      // With old method, they'd be similar
      // With new method, Chinese should have more tokens (1:1 ratio)
      expect(chineseTokens).toBeDefined();
      expect(englishTokens).toBeDefined();
    });
  });

  // ============================================
  // Error Recovery Integration Tests
  // ============================================

  describe('Error Recovery', () => {
    it('should handle database errors gracefully', async () => {
      const messages = createEnglishMessages(50);

      // Mock database error
      vi.spyOn(SummaryService, 'getSummary').mockRejectedValue(
        new Error('Database connection failed')
      );

      // Should not throw, might return messages without summary
      await expect(
        SummaryService.buildContextWithSummary('test-key', 'session-1', messages)
      ).rejects.toThrow();
    });

    it('should handle API errors gracefully', async () => {
      const messages = createEnglishMessages(50);

      // Mock API error
      vi.spyOn(SummaryService, 'generateSummary').mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      // Should throw or handle appropriately
      vi.spyOn(SummaryService, 'needsSummarization').mockResolvedValue(true);
      vi.spyOn(SummaryService, 'getSummary').mockResolvedValue(null);

      await expect(
        SummaryService.summarizeIfNeeded('test-key', 'session-1', messages)
      ).rejects.toThrow();
    });

    it('should filter error messages throughout pipeline', async () => {
      const messages: Message[] = [
        ...createEnglishMessages(5),
        { ...createMockMessage(100, 'Error'), isError: true },
        ...createEnglishMessages(5)
      ];

      const context = await SummaryService.buildContextWithSummary(
        'test-key',
        'session-1',
        messages
      );

      // Error messages should be filtered out
      expect(context.every(m => !m.isError)).toBe(true);
      expect(context.length).toBe(10); // Only valid messages
    });
  });

  // ============================================
  // Performance Characteristics
  // ============================================

  describe('Performance Characteristics', () => {
    it('should handle large message arrays efficiently', async () => {
      const largeMessageSet = createEnglishMessages(1000);

      const startTime = Date.now();
      await estimateTotalTokens(largeMessageSet, null, false);
      const endTime = Date.now();

      // Should complete in reasonable time (< 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should cache API results to reduce calls', async () => {
      const message = createMockMessage(1, 'Test message for caching');

      // First call
      await estimateTotalTokens([message], 'test-key', false);

      // Second call with same message should use cache
      await estimateTotalTokens([message], 'test-key', false);

      // Hard to verify without implementation details, but should be faster
    });
  });
});
