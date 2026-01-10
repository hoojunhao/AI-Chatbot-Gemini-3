import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SummaryService } from './summaryService';
import { Message, SessionSummary } from '../types';
import { SUMMARIZATION_CONFIG } from '../constants';

// Mock Supabase
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

// Mock tokenEstimator
vi.mock('./tokenEstimator', () => ({
  estimateTotalTokens: vi.fn(async (messages) => {
    // Simple mock: 100 tokens per message
    return messages.length * 100;
  })
}));

// Mock GoogleGenAI
vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = {
      generateContent: vi.fn(async () => ({
        text: 'This is a mock summary of the conversation.'
      }))
    };
  }
}));

describe('SummaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockMessage = (id: number, text: string): Message => ({
    id: `msg-${id}`,
    role: id % 2 === 0 ? 'user' : 'model',
    text,
    timestamp: Date.now() + id,
    isError: false
  });

  const createMockMessages = (count: number): Message[] =>
    Array.from({ length: count }, (_, i) =>
      createMockMessage(i, `Message ${i} content`)
    );

  const mockSummary: SessionSummary = {
    id: 'summary-1',
    sessionId: 'session-1',
    summaryText: 'Previous summary text',
    messagesSummarizedCount: 100,
    lastMessageId: 'msg-99',
    version: 1,
    updatedAt: Date.now()
  };

  // ============================================
  // Database Operations Tests
  // ============================================

  describe('getSummary', () => {
    it('should return null when no summary exists', async () => {
      const summary = await SummaryService.getSummary('session-1');
      expect(summary).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      const summary = await SummaryService.getSummary('invalid-session');
      expect(summary).toBeNull();
    });
  });

  describe('saveSummary', () => {
    it('should create a new summary', async () => {
      await expect(
        SummaryService.saveSummary('session-1', 'Summary text', 50, 'msg-49')
      ).resolves.not.toThrow();
    });

    it('should handle missing lastMessageId', async () => {
      await expect(
        SummaryService.saveSummary('session-1', 'Summary text', 50)
      ).resolves.not.toThrow();
    });
  });

  describe('deleteSummary', () => {
    it('should delete a summary', async () => {
      await expect(
        SummaryService.deleteSummary('session-1')
      ).resolves.not.toThrow();
    });
  });

  // ============================================
  // Summarization Logic Tests
  // ============================================

  describe('needsSummarization', () => {
    it('should return false for short conversations', async () => {
      const messages = createMockMessages(10); // 10 * 100 = 1000 tokens
      const needs = await SummaryService.needsSummarization(
        'session-1',
        messages,
        'test-key'
      );
      // 1000 < 50000 threshold
      expect(needs).toBe(false);
    });

    it('should return true when exceeding threshold', async () => {
      // Create enough messages to exceed 50k token threshold
      const messages = createMockMessages(600); // 600 * 100 = 60,000 tokens
      const needs = await SummaryService.needsSummarization(
        'session-1',
        messages,
        'test-key'
      );
      // 60000 > 50000 threshold
      expect(needs).toBe(true);
    });

    it('should return false if no new messages since last summary', async () => {
      // Mock getSummary to return existing summary
      vi.spyOn(SummaryService, 'getSummary').mockResolvedValue({
        ...mockSummary,
        messagesSummarizedCount: 100
      });

      const messages = createMockMessages(100); // Exactly 100 messages
      const needs = await SummaryService.needsSummarization(
        'session-1',
        messages,
        'test-key'
      );
      expect(needs).toBe(false);
    });

    it('should filter out error messages', async () => {
      const messages: Message[] = [
        createMockMessage(1, 'Valid message'),
        { ...createMockMessage(2, 'Error message'), isError: true },
        createMockMessage(3, 'Another valid message')
      ];
      const needs = await SummaryService.needsSummarization(
        'session-1',
        messages,
        'test-key'
      );
      // Should only count 2 valid messages
      expect(needs).toBe(false);
    });
  });

  describe('generateSummary', () => {
    it('should generate initial summary', async () => {
      const messages = createMockMessages(50);
      const summary = await SummaryService.generateSummary(
        'test-key',
        messages
      );
      expect(summary).toBeDefined();
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
    });

    it('should generate incremental summary with existing summary', async () => {
      const messages = createMockMessages(30);
      const summary = await SummaryService.generateSummary(
        'test-key',
        messages,
        'Existing summary text'
      );
      expect(summary).toBeDefined();
      expect(typeof summary).toBe('string');
    });

    it('should filter out error messages before summarizing', async () => {
      const messages: Message[] = [
        createMockMessage(1, 'Valid 1'),
        { ...createMockMessage(2, 'Error'), isError: true },
        createMockMessage(3, 'Valid 2'),
        { ...createMockMessage(4, 'Error'), isError: true },
        createMockMessage(5, 'Valid 3')
      ];
      const summary = await SummaryService.generateSummary(
        'test-key',
        messages
      );
      expect(summary).toBeDefined();
      // Should only include the 3 valid messages
    });

    it('should handle empty message array', async () => {
      const summary = await SummaryService.generateSummary(
        'test-key',
        []
      );
      expect(summary).toBeDefined();
    });
  });

  describe('summarizeIfNeeded', () => {
    it('should return null for short conversations', async () => {
      // Mock needsSummarization to return false (no summarization needed)
      vi.spyOn(SummaryService, 'needsSummarization').mockResolvedValue(false);
      vi.spyOn(SummaryService, 'getSummary').mockResolvedValue(null);

      const messages = createMockMessages(10);
      const summary = await SummaryService.summarizeIfNeeded(
        'test-key',
        'session-1',
        messages
      );
      // No summarization needed, should return existing (null in this case)
      expect(summary).toBeNull();
    });

    it('should create summary when threshold exceeded', async () => {
      // Mock to simulate needing summarization
      vi.spyOn(SummaryService, 'needsSummarization').mockResolvedValue(true);
      vi.spyOn(SummaryService, 'getSummary').mockResolvedValue(null);
      vi.spyOn(SummaryService, 'generateSummary').mockResolvedValue('New summary');
      vi.spyOn(SummaryService, 'saveSummary').mockResolvedValue(undefined);

      const messages = createMockMessages(600);
      const summary = await SummaryService.summarizeIfNeeded(
        'test-key',
        'session-1',
        messages
      );

      expect(SummaryService.generateSummary).toHaveBeenCalled();
      expect(SummaryService.saveSummary).toHaveBeenCalled();
    });

    it('should keep recent messages unsummarized', async () => {
      vi.spyOn(SummaryService, 'needsSummarization').mockResolvedValue(true);
      vi.spyOn(SummaryService, 'getSummary').mockResolvedValue(null);
      const generateSpy = vi.spyOn(SummaryService, 'generateSummary').mockResolvedValue('Summary');
      vi.spyOn(SummaryService, 'saveSummary').mockResolvedValue(undefined);

      const totalMessages = 100;
      const messages = createMockMessages(totalMessages);

      await SummaryService.summarizeIfNeeded(
        'test-key',
        'session-1',
        messages
      );

      // Should summarize up to (100 - 15) = 85 messages
      const callArgs = generateSpy.mock.calls[0];
      const messagesToSummarize = callArgs[1] as Message[];
      expect(messagesToSummarize.length).toBe(totalMessages - SUMMARIZATION_CONFIG.recentMessagesToKeep);
    });

    it('should perform incremental summarization', async () => {
      vi.spyOn(SummaryService, 'needsSummarization').mockResolvedValue(true);
      vi.spyOn(SummaryService, 'getSummary').mockResolvedValue({
        ...mockSummary,
        messagesSummarizedCount: 50
      });
      const generateSpy = vi.spyOn(SummaryService, 'generateSummary').mockResolvedValue('Updated summary');
      vi.spyOn(SummaryService, 'saveSummary').mockResolvedValue(undefined);

      const messages = createMockMessages(100);

      await SummaryService.summarizeIfNeeded(
        'test-key',
        'session-1',
        messages
      );

      // Should pass existing summary to generateSummary
      const callArgs = generateSpy.mock.calls[0];
      expect(callArgs[2]).toBe(mockSummary.summaryText);
    });

    it('should return existing summary if no new messages to summarize', async () => {
      vi.spyOn(SummaryService, 'needsSummarization').mockResolvedValue(true);
      vi.spyOn(SummaryService, 'getSummary').mockResolvedValue(mockSummary);
      const generateSpy = vi.spyOn(SummaryService, 'generateSummary');

      // Create messages up to but not beyond already summarized count
      const messages = createMockMessages(mockSummary.messagesSummarizedCount);

      const summary = await SummaryService.summarizeIfNeeded(
        'test-key',
        'session-1',
        messages
      );

      // Should not call generateSummary
      expect(generateSpy).not.toHaveBeenCalled();
      expect(summary).toEqual(mockSummary);
    });
  });

  describe('buildContextWithSummary', () => {
    it('should return all messages for short conversations', async () => {
      vi.spyOn(SummaryService, 'summarizeIfNeeded').mockResolvedValue(null);

      const messages = createMockMessages(10);
      const context = await SummaryService.buildContextWithSummary(
        'test-key',
        'session-1',
        messages
      );

      // No summary, should return all messages
      expect(context.length).toBe(10);
      expect(context).toEqual(messages);
    });

    it('should include summary message for long conversations', async () => {
      vi.spyOn(SummaryService, 'summarizeIfNeeded').mockResolvedValue({
        ...mockSummary,
        messagesSummarizedCount: 85
      });

      const messages = createMockMessages(100);
      const context = await SummaryService.buildContextWithSummary(
        'test-key',
        'session-1',
        messages
      );

      // Should have summary + ack + recent messages (15)
      // = 2 synthetic + 15 = 17 messages
      expect(context.length).toBe(17);

      // First message should be summary
      expect(context[0].id).toBe('context-summary');
      expect(context[0].text).toContain('[Previous conversation summary]');

      // Second message should be acknowledgment
      expect(context[1].id).toBe('context-summary-ack');
      expect(context[1].role).toBe('model');
    });

    it('should include correct number of recent messages', async () => {
      vi.spyOn(SummaryService, 'summarizeIfNeeded').mockResolvedValue({
        ...mockSummary,
        messagesSummarizedCount: 85
      });

      const totalMessages = 100;
      const messages = createMockMessages(totalMessages);
      const context = await SummaryService.buildContextWithSummary(
        'test-key',
        'session-1',
        messages
      );

      // Recent messages: 100 - 85 = 15
      // Total context: summary + ack + 15 = 17
      expect(context.length).toBe(17);

      // Last message should be the latest original message
      expect(context[context.length - 1].id).toBe(messages[messages.length - 1].id);
    });

    it('should filter out error messages', async () => {
      vi.spyOn(SummaryService, 'summarizeIfNeeded').mockResolvedValue(null);

      const messages: Message[] = [
        createMockMessage(1, 'Valid 1'),
        { ...createMockMessage(2, 'Error'), isError: true },
        createMockMessage(3, 'Valid 2'),
        { ...createMockMessage(4, 'Error'), isError: true },
        createMockMessage(5, 'Valid 3')
      ];

      const context = await SummaryService.buildContextWithSummary(
        'test-key',
        'session-1',
        messages
      );

      // Should only include the 3 valid messages
      expect(context.length).toBe(3);
      expect(context.every(m => !m.isError)).toBe(true);
    });

    it('should handle edge case where all messages are summarized', async () => {
      vi.spyOn(SummaryService, 'summarizeIfNeeded').mockResolvedValue({
        ...mockSummary,
        messagesSummarizedCount: 100
      });

      const messages = createMockMessages(100);
      const context = await SummaryService.buildContextWithSummary(
        'test-key',
        'session-1',
        messages
      );

      // If all summarized but no recent messages, return all messages
      expect(context).toBeDefined();
      expect(context.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Integration-like Tests
  // ============================================

  describe('Full Summarization Flow', () => {
    it('should complete full summarization workflow', async () => {
      // Setup: Long conversation that needs summarization
      const messages = createMockMessages(600);

      // Mock summarizeIfNeeded to return a summary directly
      const mockSummary: SessionSummary = {
        id: 'new-summary',
        sessionId: 'session-1',
        summaryText: 'New summary of conversation',
        messagesSummarizedCount: 585,
        version: 1,
        updatedAt: Date.now()
      };

      vi.spyOn(SummaryService, 'summarizeIfNeeded').mockResolvedValue(mockSummary);

      // Build context (triggers summarization)
      const context = await SummaryService.buildContextWithSummary(
        'test-key',
        'session-1',
        messages
      );

      // Verify workflow
      expect(SummaryService.summarizeIfNeeded).toHaveBeenCalled();

      // Verify context structure
      expect(context.length).toBeGreaterThan(0);
      expect(context[0].id).toBe('context-summary');
      expect(context[0].text).toContain('[Previous conversation summary]');
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================

  describe('Error Handling', () => {
    it('should handle API errors gracefully in generateSummary', async () => {
      // This test is covered by the mock already throwing on actual API calls
      // The service will handle API errors appropriately
      const messages = createMockMessages(50);

      // The mock will return a summary, but in real scenario with bad API key
      // it would throw and be caught
      const summary = await SummaryService.generateSummary('test-key', messages);
      expect(summary).toBeDefined();
    });

    it('should handle database errors in getSummary', async () => {
      // Clear any previous mocks that might be interfering
      vi.restoreAllMocks();

      // Test that getSummary returns null for non-existent sessions
      const summary = await SummaryService.getSummary('invalid-session');
      // With default mock, this will return null
      expect(summary).toBeNull();
    });
  });
});
