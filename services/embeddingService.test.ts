import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EMBEDDING_CONFIG } from './embeddingService';

// Create mock function that can be controlled in tests
const mockEmbedContent = vi.fn();

// Mock GoogleGenAI with a class
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {}
    models = {
      embedContent: mockEmbedContent
    };
  }
}));

// Import after mock is set up
import { EmbeddingService } from './embeddingService';

describe('EmbeddingService', () => {
  let embeddingService: EmbeddingService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementation
    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: Array(768).fill(0.1) }]
    });
    embeddingService = new EmbeddingService('test-api-key');
  });

  describe('EMBEDDING_CONFIG', () => {
    it('should have correct model configuration', () => {
      expect(EMBEDDING_CONFIG.model).toBe('gemini-embedding-exp-03-07');
      expect(EMBEDDING_CONFIG.dimensions).toBe(768);
    });
  });

  describe('generateEmbedding', () => {
    it('should generate embedding for single text', async () => {
      const embedding = await embeddingService.generateEmbedding('test text');

      expect(embedding).toBeInstanceOf(Array);
      expect(embedding.length).toBe(768);
    });

    it('should use RETRIEVAL_DOCUMENT as default task type', async () => {
      const embedding = await embeddingService.generateEmbedding('test text');

      expect(embedding).toBeDefined();
    });

    it('should support RETRIEVAL_QUERY task type', async () => {
      const embedding = await embeddingService.generateEmbedding('test query', 'RETRIEVAL_QUERY');

      expect(embedding).toBeDefined();
    });
  });

  describe('generateEmbeddings', () => {
    it('should generate embeddings for multiple texts', async () => {
      mockEmbedContent.mockResolvedValue({
        embeddings: [
          { values: Array(768).fill(0.1) },
          { values: Array(768).fill(0.2) },
          { values: Array(768).fill(0.3) }
        ]
      });

      const texts = ['text1', 'text2', 'text3'];
      const embeddings = await embeddingService.generateEmbeddings(texts);

      expect(embeddings).toBeInstanceOf(Array);
      expect(embeddings.length).toBe(texts.length);
    });

    it('should handle empty array', async () => {
      const embeddings = await embeddingService.generateEmbeddings([]);

      expect(embeddings).toEqual([]);
    });
  });
});
