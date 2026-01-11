import { GoogleGenAI } from "@google/genai";
import { supabase } from "./supabase";
import { getEmbeddingService } from "./embeddingService";
import { Message, UserMemory, ExtractedFact, MemoryCategory } from "../types";
import { MEMORY_CONFIG, MEMORY_EXTRACTION_PROMPT } from "../constants";

// ============================================
// Database Row Type (matches Supabase schema)
// ============================================

interface UserMemoryRow {
  id: string;
  user_id: string;
  fact_text: string;
  category: string;
  confidence: number;
  embedding: string | null;  // pgvector returns as string
  source_session_id: string | null;
  source_message_id: string | null;
  access_count: number;
  last_accessed_at: string | null;
  is_pinned: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

interface MatchMemoryResult {
  id: string;
  fact_text: string;
  category: string;
  confidence: number;
  similarity: number;
  created_at: string;
}

// ============================================
// Row to Domain Object Converter
// ============================================

function rowToUserMemory(row: UserMemoryRow): UserMemory {
  return {
    id: row.id,
    userId: row.user_id,
    factText: row.fact_text,
    category: row.category as MemoryCategory,
    confidence: row.confidence,
    sourceSessionId: row.source_session_id || undefined,
    sourceMessageId: row.source_message_id || undefined,
    accessCount: row.access_count,
    lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at).getTime() : undefined,
    isPinned: row.is_pinned,
    isDeleted: row.is_deleted,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

// ============================================
// Memory Service Class
// ============================================

export class MemoryService {
  private apiKey: string;
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Format embedding array for pgvector
   * pgvector expects format like '[0.1,0.2,0.3]'
   */
  private formatEmbeddingForPgvector(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }

  /**
   * Extract facts from recent messages using Gemini
   */
  async extractFacts(messages: Message[]): Promise<ExtractedFact[]> {
    if (messages.length === 0) return [];

    // Build conversation text
    const conversationText = messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
      .join('\n\n');

    const prompt = MEMORY_EXTRACTION_PROMPT + conversationText;

    try {
      const response = await this.ai.models.generateContent({
        model: MEMORY_CONFIG.extractionModel,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0.1,  // Low temperature for consistent extraction
          responseMimeType: 'application/json',
        },
      });

      const text = response.text;
      if (!text) return [];

      const parsed = JSON.parse(text);

      if (!parsed.facts || !Array.isArray(parsed.facts)) {
        return [];
      }

      // Filter by confidence threshold and validate categories
      const validCategories: MemoryCategory[] = ['preference', 'interest', 'personal', 'technical', 'project', 'general'];

      return parsed.facts
        .filter((f: any) =>
          f.text &&
          typeof f.confidence === 'number' &&
          f.confidence >= MEMORY_CONFIG.minConfidenceThreshold
        )
        .map((f: any) => ({
          text: f.text,
          category: validCategories.includes(f.category) ? f.category : 'general',
          confidence: f.confidence,
        }));
    } catch (error) {
      console.error('Fact extraction failed:', error);
      return [];
    }
  }

  /**
   * Store memories with deduplication
   */
  async storeMemories(
    userId: string,
    facts: ExtractedFact[],
    sessionId?: string,
    messageId?: string
  ): Promise<void> {
    if (facts.length === 0) return;

    const embeddingService = getEmbeddingService(this.apiKey);

    for (const fact of facts) {
      try {
        // Generate embedding for the fact
        const embedding = await embeddingService.generateEmbedding(
          fact.text,
          'RETRIEVAL_DOCUMENT'
        );

        // Format embedding for pgvector
        const formattedEmbedding = this.formatEmbeddingForPgvector(embedding);

        // Check for duplicates using semantic similarity
        const { data: existingMemories, error: rpcError } = await supabase.rpc('match_user_memories', {
          p_user_id: userId,
          p_query_embedding: formattedEmbedding,
          p_match_threshold: MEMORY_CONFIG.deduplicationThreshold,
          p_match_count: 1,
        });

        if (rpcError) {
          console.error('RPC error during deduplication check:', rpcError);
          // Continue to try inserting anyway
        }

        if (existingMemories && existingMemories.length > 0) {
          // Update existing memory if new confidence is higher
          const existing = existingMemories[0] as MatchMemoryResult;
          if (fact.confidence > existing.confidence) {
            await supabase
              .from('user_memories')
              .update({
                fact_text: fact.text,
                confidence: fact.confidence,
                embedding: formattedEmbedding,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);
            console.log(`📝 Updated memory: ${fact.text.substring(0, 50)}...`);
          }
          continue;
        }

        // Insert new memory
        const { error } = await supabase.from('user_memories').insert({
          user_id: userId,
          fact_text: fact.text,
          category: fact.category,
          confidence: fact.confidence,
          embedding: formattedEmbedding,
          source_session_id: sessionId || null,
          source_message_id: messageId || null,
        });

        if (error) {
          // Handle unique constraint violation (same fact_text)
          if (error.code === '23505') {
            console.log(`⏭️ Duplicate fact skipped: ${fact.text.substring(0, 50)}...`);
            continue;
          }
          throw error;
        }

        console.log(`💾 Stored new memory: ${fact.text.substring(0, 50)}...`);
      } catch (error) {
        console.error('Failed to store memory:', error);
        // Continue with other facts
      }
    }
  }

  /**
   * Retrieve relevant memories using semantic search
   */
  async retrieveRelevantMemories(
    userId: string,
    query: string,
    limit: number = MEMORY_CONFIG.maxMemoriesToRetrieve
  ): Promise<UserMemory[]> {
    try {
      const embeddingService = getEmbeddingService(this.apiKey);

      // Generate query embedding
      const queryEmbedding = await embeddingService.generateEmbedding(
        query,
        'RETRIEVAL_QUERY'
      );

      // Format embedding for pgvector
      const formattedEmbedding = this.formatEmbeddingForPgvector(queryEmbedding);

      // Search using pgvector
      const { data, error } = await supabase.rpc('match_user_memories', {
        p_user_id: userId,
        p_query_embedding: formattedEmbedding,
        p_match_threshold: MEMORY_CONFIG.retrievalThreshold,
        p_match_count: limit,
      });

      if (error) throw error;

      if (!data || data.length === 0) {
        return [];
      }

      // Update access counts for retrieved memories using raw SQL
      // (Supabase JS client doesn't support incrementing in updates easily)
      const memoryIds = data.map((m: MatchMemoryResult) => m.id);
      await supabase
        .from('user_memories')
        .update({
          last_accessed_at: new Date().toISOString(),
        })
        .in('id', memoryIds);

      // Increment access counts separately using RPC
      // This is a fire-and-forget operation (ignore errors)
      for (const id of memoryIds) {
        supabase.rpc('increment_memory_access_count', { memory_id: id }).then(
          () => {},  // Success - do nothing
          () => {}   // Error - ignore silently
        );
      }

      // Map to UserMemory with similarity scores
      return data.map((row: MatchMemoryResult) => ({
        id: row.id,
        userId,
        factText: row.fact_text,
        category: row.category as MemoryCategory,
        confidence: row.confidence,
        similarity: row.similarity,
        createdAt: new Date(row.created_at).getTime(),
        accessCount: 0,
        isPinned: false,
        isDeleted: false,
        updatedAt: new Date(row.created_at).getTime(),
      }));
    } catch (error) {
      console.error('Memory retrieval failed:', error);
      return [];
    }
  }

  /**
   * Get all memories for a user (for management UI)
   */
  async getAllMemories(userId: string): Promise<UserMemory[]> {
    const { data, error } = await supabase
      .from('user_memories')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(rowToUserMemory);
  }

  /**
   * Delete a memory (soft delete)
   */
  async deleteMemory(memoryId: string): Promise<void> {
    const { error } = await supabase
      .from('user_memories')
      .update({ is_deleted: true })
      .eq('id', memoryId);

    if (error) throw error;
  }

  /**
   * Edit memory text (regenerates embedding)
   */
  async editMemory(memoryId: string, newText: string): Promise<void> {
    const embeddingService = getEmbeddingService(this.apiKey);

    // Generate new embedding
    const embedding = await embeddingService.generateEmbedding(
      newText,
      'RETRIEVAL_DOCUMENT'
    );

    // Format embedding for pgvector
    const formattedEmbedding = this.formatEmbeddingForPgvector(embedding);

    const { error } = await supabase
      .from('user_memories')
      .update({
        fact_text: newText,
        embedding: formattedEmbedding,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memoryId);

    if (error) throw error;
  }

  /**
   * Toggle pin status
   */
  async togglePinMemory(memoryId: string): Promise<void> {
    // First get current pin status
    const { data: current, error: fetchError } = await supabase
      .from('user_memories')
      .select('is_pinned')
      .eq('id', memoryId)
      .single();

    if (fetchError) throw fetchError;

    const { error } = await supabase
      .from('user_memories')
      .update({ is_pinned: !current.is_pinned })
      .eq('id', memoryId);

    if (error) throw error;
  }

  /**
   * Clear all memories for a user
   */
  async clearAllMemories(userId: string): Promise<void> {
    const { error } = await supabase
      .from('user_memories')
      .update({ is_deleted: true })
      .eq('user_id', userId);

    if (error) throw error;
  }
}

// ============================================
// Singleton Factory
// ============================================

let memoryServiceInstance: MemoryService | null = null;

export function getMemoryService(apiKey: string): MemoryService {
  if (!memoryServiceInstance) {
    memoryServiceInstance = new MemoryService(apiKey);
  }
  return memoryServiceInstance;
}
