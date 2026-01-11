import { Message, UserMemory, SessionSummaryMatch } from '../types';
import { getMemoryService } from './memoryService';
import { getEmbeddingService } from './embeddingService';
import { SummaryService } from './summaryService';
import { supabase } from './supabase';
import { MEMORY_CONFIG, MEMORY_CONTEXT_HEADER, MEMORY_CONTEXT_FOOTER } from '../constants';

/**
 * Memory Manager
 *
 * Coordinates cross-session memory with existing context management.
 * Combines memories + session RAG + session summary + recent messages for optimal context.
 *
 * Token Budget:
 * - Cross-session memories: ~1000 tokens (max 10 facts)
 * - Session RAG (past sessions): ~1500 tokens (max 5 sessions)
 * - Session summary: ~2000 tokens
 * - Recent messages: remaining budget
 */
export class MemoryManager {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Build context with cross-session memories + session RAG + session summary + recent messages
   *
   * Context structure:
   * 1. [Memory context] - Facts remembered about user from other sessions
   * 2. [Model acknowledgment]
   * 3. [Session RAG] - Relevant snippets from past sessions
   * 4. [Model acknowledgment]
   * 5. [Session summary] - Summary of current session (if exists)
   * 6. [Model acknowledgment]
   * 7. Recent messages
   */
  async buildContextWithMemory(
    userId: string,
    sessionId: string,
    allMessages: Message[],
    currentQuery: string
  ): Promise<Message[]> {
    const memoryService = getMemoryService(this.apiKey);

    // 1. Retrieve relevant memories based on current query
    let memories: UserMemory[] = [];
    try {
      memories = await memoryService.retrieveRelevantMemories(
        userId,
        currentQuery,
        MEMORY_CONFIG.maxMemoriesToRetrieve
      );
      console.log(`🧠 Retrieved ${memories.length} relevant memories`);
    } catch (error) {
      console.error('Memory retrieval failed:', error);
      // Continue without memories
    }

    // 2. NEW: Retrieve relevant past session summaries (Session RAG)
    let relevantSessions: SessionSummaryMatch[] = [];
    try {
      relevantSessions = await this.retrieveRelevantSessions(
        userId,
        sessionId,  // Exclude current session
        currentQuery,
        MEMORY_CONFIG.maxSessionsToRetrieve
      );
      console.log(`📚 Retrieved ${relevantSessions.length} relevant past sessions`);
    } catch (error) {
      console.error('Session RAG retrieval failed:', error);
      // Continue without session RAG
    }

    // 3. Get session summary + recent messages (existing flow)
    let contextMessages: Message[];
    try {
      contextMessages = await SummaryService.buildContextWithSummary(
        this.apiKey,
        sessionId,
        allMessages
      );
    } catch (error) {
      console.error('Summary service failed, using all messages:', error);
      contextMessages = allMessages.filter(m => !m.isError);
    }

    // 4. Build context messages array
    const prependMessages: Message[] = [];

    // Add memory context if we have memories
    if (memories.length > 0) {
      const memoryContext = this.formatMemoriesAsContext(memories);
      prependMessages.push({
        id: 'cross-session-memory',
        role: 'user',
        text: memoryContext,
        timestamp: contextMessages[0]?.timestamp - 4 || Date.now(),
        isError: false,
      });
      prependMessages.push({
        id: 'cross-session-memory-ack',
        role: 'model',
        text: "I'll keep these details about you in mind.",
        timestamp: contextMessages[0]?.timestamp - 3 || Date.now(),
        isError: false,
      });
    }

    // Add session RAG context if we have relevant sessions
    if (relevantSessions.length > 0) {
      const sessionContext = this.formatSessionsAsContext(relevantSessions);
      prependMessages.push({
        id: 'session-rag-context',
        role: 'user',
        text: sessionContext,
        timestamp: contextMessages[0]?.timestamp - 2 || Date.now(),
        isError: false,
      });
      prependMessages.push({
        id: 'session-rag-context-ack',
        role: 'model',
        text: "I see the context from our past conversations. I'll reference this as needed.",
        timestamp: contextMessages[0]?.timestamp - 1 || Date.now(),
        isError: false,
      });
    }

    console.log(`📦 Context built: [Memories: ${memories.length}] + [Sessions: ${relevantSessions.length}] + [Current: ${contextMessages.length}]`);

    return [...prependMessages, ...contextMessages];
  }

  // ============================================
  // Session RAG Methods
  // ============================================

  /**
   * Retrieve relevant past session summaries using semantic search
   */
  private async retrieveRelevantSessions(
    userId: string,
    currentSessionId: string,
    query: string,
    limit: number
  ): Promise<SessionSummaryMatch[]> {
    const embeddingService = getEmbeddingService(this.apiKey);
    const queryEmbedding = await embeddingService.generateEmbedding(query, 'RETRIEVAL_QUERY');
    const formattedEmbedding = `[${queryEmbedding.join(',')}]`;

    const { data, error } = await supabase.rpc('match_session_summaries', {
      p_user_id: userId,
      p_query_embedding: formattedEmbedding,
      p_match_threshold: MEMORY_CONFIG.sessionRagThreshold,
      p_match_count: limit + 1,  // +1 to account for filtering current session
      p_max_sessions: MEMORY_CONFIG.maxSessionsToSearch,
    });

    if (error) throw error;

    // Filter out the current session
    const filtered = (data || []).filter(
      (s: SessionSummaryMatch) => s.session_id !== currentSessionId
    );

    return filtered.slice(0, limit);
  }

  /**
   * Format past sessions as context with time information
   */
  private formatSessionsAsContext(sessions: SessionSummaryMatch[]): string {
    if (sessions.length === 0) return '';

    const lines = sessions.map(s => {
      const date = new Date(s.updated_at);
      const relativeTime = this.getRelativeTime(date);
      const absoluteDate = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      return `From ${relativeTime} (${absoluteDate}):\n"${s.summary_text}"`;
    });

    return `[Relevant context from past conversations]\n${lines.join('\n\n')}\n[End of past context]`;
  }

  /**
   * Get relative time string (e.g., "2 days ago", "yesterday")
   */
  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  }

  /**
   * Format memories as context text
   */
  private formatMemoriesAsContext(memories: UserMemory[]): string {
    if (memories.length === 0) return '';

    // Sort by category for better organization
    const categoryOrder: Record<string, number> = {
      personal: 1,
      preference: 2,
      interest: 3,
      project: 4,
      technical: 5,
      general: 6,
    };

    const sorted = [...memories].sort((a, b) => {
      const aOrder = categoryOrder[a.category] || 99;
      const bOrder = categoryOrder[b.category] || 99;
      return aOrder - bOrder;
    });

    const facts = sorted.map(m => `- ${m.factText}`).join('\n');

    return `${MEMORY_CONTEXT_HEADER}\n${facts}\n${MEMORY_CONTEXT_FOOTER}`;
  }

  /**
   * Process conversation for memory extraction (BACKGROUND)
   *
   * This runs after the AI response is complete.
   * Fire-and-forget - does not block the user.
   */
  async processConversationForMemories(
    userId: string,
    sessionId: string,
    allMessages: Message[]
  ): Promise<void> {
    const memoryService = getMemoryService(this.apiKey);

    // Only analyze recent messages (extraction window)
    const validMessages = allMessages.filter(m => !m.isError);
    const recentMessages = validMessages.slice(-MEMORY_CONFIG.extractionWindowSize);

    if (recentMessages.length < 2) {
      // Need at least one exchange to extract facts
      return;
    }

    console.log(`🔍 Analyzing ${recentMessages.length} messages for memory extraction...`);

    try {
      // Extract facts from recent conversation
      const facts = await memoryService.extractFacts(recentMessages);

      if (facts.length === 0) {
        console.log('💭 No new facts extracted');
        return;
      }

      console.log(`💡 Extracted ${facts.length} facts`);

      // Store memories with deduplication
      // Note: We don't pass messageId since frontend uses temp IDs that don't exist in DB
      await memoryService.storeMemories(
        userId,
        facts,
        sessionId
      );

      console.log('✅ Memory extraction complete');
    } catch (error) {
      console.error('Memory extraction failed:', error);
      // Don't throw - this is background processing
    }
  }
}

// ============================================
// Singleton Factory
// ============================================

let memoryManagerInstance: MemoryManager | null = null;

export function getMemoryManager(apiKey: string): MemoryManager {
  if (!memoryManagerInstance) {
    memoryManagerInstance = new MemoryManager(apiKey);
  }
  return memoryManagerInstance;
}
