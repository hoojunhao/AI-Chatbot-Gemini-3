import { GoogleGenAI, EmbedContentRequest } from "@google/genai";

// ============================================
// Configuration
// ============================================

const EMBEDDING_CONFIG = {
  model: 'gemini-embedding-exp-03-07',  // Latest embedding model
  dimensions: 768,  // MRL reduced from 3072 for efficiency
};

// ============================================
// Embedding Service
// ============================================

export class EmbeddingService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Generate embedding for a single text
   * @param text - Text to embed
   * @param taskType - Type of embedding task (affects optimization)
   * @returns Array of embedding values (768 dimensions)
   */
  async generateEmbedding(
    text: string,
    taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' = 'RETRIEVAL_DOCUMENT'
  ): Promise<number[]> {
    try {
      const request: EmbedContentRequest = {
        model: EMBEDDING_CONFIG.model,
        contents: [{ parts: [{ text }] }],
        config: {
          taskType,
          outputDimensionality: EMBEDDING_CONFIG.dimensions,
        },
      };

      const response = await this.ai.models.embedContent(request);

      if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error('No embeddings returned from API');
      }

      const values = response.embeddings[0].values;
      if (!values) {
        throw new Error('Embedding values are undefined');
      }

      return values;
    } catch (error) {
      console.error('Embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * @param texts - Array of texts to embed
   * @param taskType - Type of embedding task
   * @returns Array of embedding arrays
   */
  async generateEmbeddings(
    texts: string[],
    taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' = 'RETRIEVAL_DOCUMENT'
  ): Promise<number[][]> {
    // Process in batches of 100 (API limit)
    const batchSize = 100;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const request: EmbedContentRequest = {
        model: EMBEDDING_CONFIG.model,
        contents: batch.map(text => ({ parts: [{ text }] })),
        config: {
          taskType,
          outputDimensionality: EMBEDDING_CONFIG.dimensions,
        },
      };

      const response = await this.ai.models.embedContent(request);

      if (!response.embeddings) {
        throw new Error('No embeddings returned from API');
      }

      for (const embedding of response.embeddings) {
        if (!embedding.values) {
          throw new Error('Embedding values are undefined');
        }
        results.push(embedding.values);
      }
    }

    return results;
  }
}

// ============================================
// Singleton Factory
// ============================================

let embeddingServiceInstance: EmbeddingService | null = null;

export function getEmbeddingService(apiKey: string): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService(apiKey);
  }
  return embeddingServiceInstance;
}

export { EMBEDDING_CONFIG };
