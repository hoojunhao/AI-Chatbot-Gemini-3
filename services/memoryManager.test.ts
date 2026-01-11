import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Message, UserMemory } from '../types';

// Use vi.hoisted to create mock functions that are available during hoisting
const { mockRetrieveRelevantMemories, mockExtractFacts, mockStoreMemories, mockBuildContextWithSummary } = vi.hoisted(() => ({
  mockRetrieveRelevantMemories: vi.fn(),
  mockExtractFacts: vi.fn(),
  mockStoreMemories: vi.fn(),
  mockBuildContextWithSummary: vi.fn()
}));

// Mock memoryService
vi.mock('./memoryService', () => ({
  getMemoryService: () => ({
    retrieveRelevantMemories: mockRetrieveRelevantMemories,
    extractFacts: mockExtractFacts,
    storeMemories: mockStoreMemories
  })
}));

// Mock summaryService
vi.mock('./summaryService', () => ({
  SummaryService: {
    buildContextWithSummary: mockBuildContextWithSummary
  }
}));

// Import after mocks
import { MemoryManager } from './memoryManager';

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;
  const testMessages: Message[] = [
    { id: '1', role: 'user', text: 'Hello', timestamp: 1000 },
    { id: '2', role: 'model', text: 'Hi there!', timestamp: 1001 }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    memoryManager = new MemoryManager('test-api-key');

    // Default mocks
    mockRetrieveRelevantMemories.mockResolvedValue([]);
    mockBuildContextWithSummary.mockResolvedValue(testMessages);
    mockExtractFacts.mockResolvedValue([]);
    mockStoreMemories.mockResolvedValue(undefined);
  });

  describe('buildContextWithMemory', () => {
    it('should return session context when no memories found', async () => {
      const context = await memoryManager.buildContextWithMemory(
        'user-123',
        'session-456',
        testMessages,
        'Hello'
      );

      expect(context).toEqual(testMessages);
      expect(mockRetrieveRelevantMemories).toHaveBeenCalledWith(
        'user-123',
        'Hello',
        expect.any(Number)
      );
    });

    it('should prepend memory context when memories are found', async () => {
      const mockMemories: UserMemory[] = [
        {
          id: 'mem-1',
          userId: 'user-123',
          factText: 'User prefers TypeScript',
          category: 'preference',
          confidence: 0.9,
          accessCount: 0,
          isPinned: false,
          isDeleted: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];

      mockRetrieveRelevantMemories.mockResolvedValue(mockMemories);

      const context = await memoryManager.buildContextWithMemory(
        'user-123',
        'session-456',
        testMessages,
        'Hello'
      );

      // Should have memory message + ack + original messages
      expect(context.length).toBe(testMessages.length + 2);
      expect(context[0].id).toBe('cross-session-memory');
      expect(context[0].text).toContain('User prefers TypeScript');
      expect(context[1].id).toBe('cross-session-memory-ack');
    });

    it('should handle memory retrieval failure gracefully', async () => {
      mockRetrieveRelevantMemories.mockRejectedValue(new Error('Retrieval failed'));

      const context = await memoryManager.buildContextWithMemory(
        'user-123',
        'session-456',
        testMessages,
        'Hello'
      );

      // Should fall back to session context only
      expect(context).toEqual(testMessages);
    });

    it('should handle summary service failure gracefully', async () => {
      mockBuildContextWithSummary.mockRejectedValue(new Error('Summary failed'));

      const context = await memoryManager.buildContextWithMemory(
        'user-123',
        'session-456',
        testMessages,
        'Hello'
      );

      // Should fall back to filtered messages
      expect(context).toBeInstanceOf(Array);
    });

    it('should sort memories by category', async () => {
      const mockMemories: UserMemory[] = [
        {
          id: 'mem-1',
          userId: 'user-123',
          factText: 'User likes coding',
          category: 'general',
          confidence: 0.9,
          accessCount: 0,
          isPinned: false,
          isDeleted: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        {
          id: 'mem-2',
          userId: 'user-123',
          factText: 'User name is John',
          category: 'personal',
          confidence: 0.95,
          accessCount: 0,
          isPinned: false,
          isDeleted: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];

      mockRetrieveRelevantMemories.mockResolvedValue(mockMemories);

      const context = await memoryManager.buildContextWithMemory(
        'user-123',
        'session-456',
        testMessages,
        'Hello'
      );

      // Personal should come before general in the formatted text
      const memoryText = context[0].text;
      const personalIndex = memoryText.indexOf('User name is John');
      const generalIndex = memoryText.indexOf('User likes coding');
      expect(personalIndex).toBeLessThan(generalIndex);
    });
  });

  describe('processConversationForMemories', () => {
    it('should not process when messages are too few', async () => {
      const shortMessages: Message[] = [
        { id: '1', role: 'user', text: 'Hi', timestamp: 1000 }
      ];

      await memoryManager.processConversationForMemories(
        'user-123',
        'session-456',
        shortMessages
      );

      expect(mockExtractFacts).not.toHaveBeenCalled();
    });

    it('should extract and store facts from recent messages', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', text: 'I prefer TypeScript', timestamp: 1000 },
        { id: '2', role: 'model', text: 'Got it!', timestamp: 1001 },
        { id: '3', role: 'user', text: 'Building a React app', timestamp: 1002 },
        { id: '4', role: 'model', text: 'Great!', timestamp: 1003 }
      ];

      mockExtractFacts.mockResolvedValue([
        { text: 'User prefers TypeScript', category: 'preference', confidence: 0.9 }
      ]);

      await memoryManager.processConversationForMemories(
        'user-123',
        'session-456',
        messages
      );

      expect(mockExtractFacts).toHaveBeenCalled();
      expect(mockStoreMemories).toHaveBeenCalled();
    });

    it('should not store when no facts are extracted', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', text: 'Hi', timestamp: 1000 },
        { id: '2', role: 'model', text: 'Hello!', timestamp: 1001 }
      ];

      mockExtractFacts.mockResolvedValue([]);

      await memoryManager.processConversationForMemories(
        'user-123',
        'session-456',
        messages
      );

      expect(mockStoreMemories).not.toHaveBeenCalled();
    });

    it('should filter out error messages', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', text: 'Hi', timestamp: 1000, isError: true },
        { id: '2', role: 'user', text: 'Hello', timestamp: 1001 },
        { id: '3', role: 'model', text: 'Hi there!', timestamp: 1002 }
      ];

      await memoryManager.processConversationForMemories(
        'user-123',
        'session-456',
        messages
      );

      // Should only process non-error messages
      if (mockExtractFacts.mock.calls.length > 0) {
        const processedMessages = mockExtractFacts.mock.calls[0][0];
        expect(processedMessages.every((m: Message) => !m.isError)).toBe(true);
      }
    });

    it('should handle extraction failure gracefully', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', text: 'Hi', timestamp: 1000 },
        { id: '2', role: 'model', text: 'Hello!', timestamp: 1001 }
      ];

      mockExtractFacts.mockRejectedValue(new Error('Extraction failed'));

      // Should not throw
      await expect(
        memoryManager.processConversationForMemories('user-123', 'session-456', messages)
      ).resolves.not.toThrow();
    });
  });
});
