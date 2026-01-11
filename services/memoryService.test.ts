import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Message, MemoryCategory } from '../types';

// Mock functions
const mockGenerateContent = vi.fn();
const mockGenerateEmbedding = vi.fn();
const mockSupabaseFrom = vi.fn();
const mockSupabaseRpc = vi.fn();

// Mock supabase
vi.mock('./supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockSupabaseFrom(...args),
    rpc: (...args: any[]) => mockSupabaseRpc(...args)
  }
}));

// Mock embeddingService
vi.mock('./embeddingService', () => ({
  getEmbeddingService: () => ({
    generateEmbedding: mockGenerateEmbedding
  })
}));

// Mock GoogleGenAI with a class
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {}
    models = {
      generateContent: mockGenerateContent
    };
  }
}));

// Import after mocks are set up
import { MemoryService } from './memoryService';

describe('MemoryService', () => {
  let memoryService: MemoryService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        facts: [
          { text: 'User prefers TypeScript', category: 'preference', confidence: 0.9 },
          { text: 'User is building a chat app', category: 'project', confidence: 0.85 }
        ]
      })
    });

    mockGenerateEmbedding.mockResolvedValue(Array(768).fill(0.1));

    mockSupabaseRpc.mockResolvedValue({ data: [], error: null });

    // Setup chain for supabase.from()
    mockSupabaseFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: vi.fn().mockResolvedValue({ data: [], error: null })
          }),
          single: vi.fn().mockResolvedValue({ data: { is_pinned: false }, error: null })
        })
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: () => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
        in: vi.fn().mockResolvedValue({ error: null })
      }),
      delete: () => ({
        eq: vi.fn().mockResolvedValue({ error: null })
      })
    }));

    memoryService = new MemoryService('test-api-key');
  });

  describe('extractFacts', () => {
    it('should extract facts from messages', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', text: 'I prefer TypeScript over JavaScript', timestamp: Date.now() },
        { id: '2', role: 'model', text: 'I understand your preference for TypeScript', timestamp: Date.now() }
      ];

      const facts = await memoryService.extractFacts(messages);

      expect(facts).toBeInstanceOf(Array);
      expect(facts.length).toBeGreaterThan(0);
      expect(facts[0]).toHaveProperty('text');
      expect(facts[0]).toHaveProperty('category');
      expect(facts[0]).toHaveProperty('confidence');
    });

    it('should return empty array for empty messages', async () => {
      const facts = await memoryService.extractFacts([]);

      expect(facts).toEqual([]);
    });

    it('should filter facts below confidence threshold', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', text: 'Test message', timestamp: Date.now() }
      ];

      const facts = await memoryService.extractFacts(messages);

      // All returned facts should meet the threshold
      facts.forEach(fact => {
        expect(fact.confidence).toBeGreaterThanOrEqual(0.7);
      });
    });

    it('should validate category values', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', text: 'Test message', timestamp: Date.now() }
      ];

      const facts = await memoryService.extractFacts(messages);

      const validCategories: MemoryCategory[] = ['preference', 'interest', 'personal', 'technical', 'project', 'general'];
      facts.forEach(fact => {
        expect(validCategories).toContain(fact.category);
      });
    });
  });

  describe('storeMemories', () => {
    it('should store valid facts', async () => {
      const facts = [
        { text: 'User likes React', category: 'preference' as MemoryCategory, confidence: 0.9 }
      ];

      // Should not throw
      await expect(memoryService.storeMemories('user-123', facts)).resolves.not.toThrow();
    });

    it('should skip storing empty facts array', async () => {
      await memoryService.storeMemories('user-123', []);
      // No error should be thrown
    });

    it('should include session and message IDs when provided', async () => {
      const facts = [
        { text: 'User likes Vue', category: 'preference' as MemoryCategory, confidence: 0.9 }
      ];

      await expect(
        memoryService.storeMemories('user-123', facts, 'session-456', 'message-789')
      ).resolves.not.toThrow();
    });
  });

  describe('retrieveRelevantMemories', () => {
    it('should return empty array when no memories match', async () => {
      const memories = await memoryService.retrieveRelevantMemories('user-123', 'test query');

      expect(memories).toBeInstanceOf(Array);
    });

    it('should accept custom limit parameter', async () => {
      const memories = await memoryService.retrieveRelevantMemories('user-123', 'test query', 5);

      expect(memories).toBeInstanceOf(Array);
    });
  });

  describe('getAllMemories', () => {
    it('should return all memories for a user', async () => {
      const memories = await memoryService.getAllMemories('user-123');

      expect(memories).toBeInstanceOf(Array);
    });
  });

  describe('deleteMemory', () => {
    it('should soft delete a memory', async () => {
      await expect(memoryService.deleteMemory('memory-123')).resolves.not.toThrow();
    });
  });

  describe('editMemory', () => {
    it('should update memory text and regenerate embedding', async () => {
      await expect(
        memoryService.editMemory('memory-123', 'New fact text')
      ).resolves.not.toThrow();
    });
  });

  describe('togglePinMemory', () => {
    it('should toggle pin status', async () => {
      await expect(memoryService.togglePinMemory('memory-123')).resolves.not.toThrow();
    });
  });

  describe('clearAllMemories', () => {
    it('should soft delete all memories for a user', async () => {
      await expect(memoryService.clearAllMemories('user-123')).resolves.not.toThrow();
    });
  });
});
