import {
  createSlidingWindow,
  estimateMessageTokens,
  estimateTotalTokens,
  validateContextWindow
} from './contextManager';
import { Message } from '../types';

describe('Context Manager', () => {
  const createMockMessage = (id: number, textLength: number = 100): Message => ({
    id: `msg-${id}`,
    role: id % 2 === 0 ? 'user' : 'model',
    text: 'a'.repeat(textLength),
    timestamp: Date.now() + id,
    isError: false
  });

  describe('estimateMessageTokens', () => {
    it('estimates tokens based on text length', () => {
      const msg = createMockMessage(1, 400); // 400 chars = ~100 tokens
      const tokens = estimateMessageTokens(msg);
      expect(tokens).toBeGreaterThanOrEqual(100);
      expect(tokens).toBeLessThanOrEqual(110); // Allow for overhead
    });

    it('adds overhead for role markers', () => {
      const msg = createMockMessage(1, 0); // Empty text
      const tokens = estimateMessageTokens(msg);
      expect(tokens).toBe(4); // Just the role overhead
    });

    it('accounts for attachments', () => {
      const msg: Message = {
        ...createMockMessage(1, 100),
        attachments: [
          { mimeType: 'image/png', data: 'a'.repeat(10000) }
        ]
      };
      const tokens = estimateMessageTokens(msg);
      expect(tokens).toBeGreaterThan(100); // Text + attachment overhead
    });
  });

  describe('estimateTotalTokens', () => {
    it('sums tokens for multiple messages', () => {
      const messages = [
        createMockMessage(1, 400), // ~104 tokens
        createMockMessage(2, 400), // ~104 tokens
        createMockMessage(3, 400), // ~104 tokens
      ];
      const total = estimateTotalTokens(messages);
      expect(total).toBeGreaterThanOrEqual(300);
      expect(total).toBeLessThanOrEqual(330);
    });

    it('returns 0 for empty array', () => {
      expect(estimateTotalTokens([])).toBe(0);
    });
  });

  describe('createSlidingWindow', () => {
    it('returns all messages when under limits', () => {
      const messages = Array.from({ length: 10 }, (_, i) => createMockMessage(i));
      const window = createSlidingWindow(messages);

      expect(window.messages.length).toBe(10);
      expect(window.truncated).toBe(false);
      expect(window.originalCount).toBe(10);
    });

    it('truncates when exceeding MAX_MESSAGES', () => {
      const messages = Array.from({ length: 100 }, (_, i) => createMockMessage(i));
      const window = createSlidingWindow(messages);

      expect(window.messages.length).toBeLessThanOrEqual(50);
      expect(window.truncated).toBe(true);
      expect(window.originalCount).toBe(100);
    });

    it('keeps most recent messages', () => {
      const messages = Array.from({ length: 100 }, (_, i) => createMockMessage(i));
      const window = createSlidingWindow(messages);

      // Last message should be the most recent
      const lastWindowMsg = window.messages[window.messages.length - 1];
      const lastOriginalMsg = messages[messages.length - 1];
      expect(lastWindowMsg.id).toBe(lastOriginalMsg.id);
    });

    it('filters out error messages', () => {
      const messages: Message[] = [
        createMockMessage(1),
        { ...createMockMessage(2), isError: true },
        createMockMessage(3),
        { ...createMockMessage(4), isError: true },
        createMockMessage(5),
      ];
      const window = createSlidingWindow(messages);

      expect(window.messages.length).toBe(3);
      expect(window.messages.every(m => !m.isError)).toBe(true);
      expect(window.originalCount).toBe(3); // Only valid messages count
    });

    it('returns empty window for empty input', () => {
      const window = createSlidingWindow([]);

      expect(window.messages).toEqual([]);
      expect(window.estimatedTokens).toBe(0);
      expect(window.truncated).toBe(false);
      expect(window.originalCount).toBe(0);
    });

    it('maintains chronological order', () => {
      const messages = Array.from({ length: 100 }, (_, i) => createMockMessage(i));
      const window = createSlidingWindow(messages);

      // Check that messages are in ascending order by id
      for (let i = 1; i < window.messages.length; i++) {
        const prevId = parseInt(window.messages[i - 1].id.split('-')[1]);
        const currId = parseInt(window.messages[i].id.split('-')[1]);
        expect(currId).toBeGreaterThan(prevId);
      }
    });

    it('always includes minimum recent messages even if they exceed token limit', () => {
      // Create 10 messages where each is very long (will exceed token limit)
      const messages = Array.from({ length: 10 }, (_, i) =>
        createMockMessage(i, 50000) // 50k chars each = ~12.5k tokens each
      );
      const window = createSlidingWindow(messages);

      // Should still include at least MIN_RECENT_MESSAGES (5)
      expect(window.messages.length).toBeGreaterThanOrEqual(5);
    });

    it('accounts for system instruction tokens in budget', () => {
      // Create 30 messages with 4000 chars each (~1000 tokens each = 30k total)
      // Available budget: 100k - 2k system buffer - 8k response = 90k tokens
      const messages = Array.from({ length: 30 }, (_, i) => createMockMessage(i, 4000));
      const windowWithoutSysInstruction = createSlidingWindow(messages, 0);
      // With 70k token system instruction, budget becomes 20k, fitting ~20 messages
      const windowWithSysInstruction = createSlidingWindow(messages, 70000);

      // Window with large system instruction should include fewer messages
      expect(windowWithSysInstruction.messages.length).toBeLessThan(windowWithoutSysInstruction.messages.length);
      expect(windowWithoutSysInstruction.messages.length).toBe(30); // All fit
      expect(windowWithSysInstruction.messages.length).toBeLessThanOrEqual(20); // Reduced by token limit
    });
  });

  describe('validateContextWindow', () => {
    it('validates a normal context window', () => {
      const messages = Array.from({ length: 10 }, (_, i) => createMockMessage(i));
      const window = createSlidingWindow(messages);
      const validation = validateContextWindow(window);

      expect(validation.valid).toBe(true);
      expect(validation.warnings.length).toBe(0);
    });

    it('warns when approaching token limit', () => {
      const window = createSlidingWindow(
        Array.from({ length: 10 }, (_, i) => createMockMessage(i, 10000))
      );
      // Manually set to high token count for testing
      const highTokenWindow = { ...window, estimatedTokens: 95000 };
      const validation = validateContextWindow(highTokenWindow);

      expect(validation.warnings).toContain('Context is approaching token limit');
    });

    it('warns when reaching message count limit', () => {
      const messages = Array.from({ length: 100 }, (_, i) => createMockMessage(i));
      const window = createSlidingWindow(messages);
      const validation = validateContextWindow(window);

      expect(validation.warnings.some(w => w.includes('message count limit'))).toBe(true);
    });

    it('warns when messages are truncated', () => {
      const messages = Array.from({ length: 100 }, (_, i) => createMockMessage(i));
      const window = createSlidingWindow(messages);
      const validation = validateContextWindow(window);

      expect(validation.warnings.some(w => w.includes('truncated'))).toBe(true);
    });

    it('marks as invalid when exceeding max tokens', () => {
      const window = createSlidingWindow([]);
      const invalidWindow = { ...window, estimatedTokens: 150000 };
      const validation = validateContextWindow(invalidWindow);

      expect(validation.valid).toBe(false);
    });
  });
});
