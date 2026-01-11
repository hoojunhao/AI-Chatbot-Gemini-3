import { GoogleGenAI } from "@google/genai";
import { supabase } from './supabase';
import { Message, SessionSummary } from '../types';
import { SUMMARIZATION_CONFIG, SUMMARIZATION_PROMPTS } from '../constants';
import { estimateTotalTokens } from './tokenEstimator';
import { getEmbeddingService } from './embeddingService';

/**
 * Summary Service
 *
 * Manages conversation summaries for intelligent context compression.
 * Uses Google GenAI SDK for summarization and Supabase for persistence.
 *
 * Features:
 * - Token-based summarization triggering
 * - Incremental summary updates
 * - Database persistence with RLS
 * - On-demand summarization (user waits for completion)
 */
export class SummaryService {

  // ============================================
  // Database Operations
  // ============================================

  /**
   * Fetch existing summary for a session
   */
  static async getSummary(sessionId: string): Promise<SessionSummary | null> {
    try {
      const { data, error } = await supabase
        .from('session_summaries')
        .select('*')
        .eq('session_id', sessionId)
        .maybeSingle(); // Use maybeSingle() instead of single() to avoid 406 when no rows exist

      if (error || !data) return null;

      return {
        id: data.id,
        sessionId: data.session_id,
        summaryText: data.summary_text,
        messagesSummarizedCount: data.messages_summarized_count,
        version: data.version,
        updatedAt: new Date(data.updated_at).getTime(),
      };
    } catch (error) {
      console.error('Error fetching summary:', error);
      return null;
    }
  }

  /**
   * Save or update summary for a session (with embedding for RAG)
   */
  static async saveSummary(
    sessionId: string,
    summaryText: string,
    messagesSummarizedCount: number,
    apiKey?: string
  ): Promise<void> {
    const existing = await this.getSummary(sessionId);

    // Generate embedding for Session RAG (if apiKey provided)
    let formattedEmbedding: string | null = null;
    if (apiKey) {
      try {
        const embeddingService = getEmbeddingService(apiKey);
        const embedding = await embeddingService.generateEmbedding(
          summaryText,
          'RETRIEVAL_DOCUMENT'
        );
        formattedEmbedding = `[${embedding.join(',')}]`;
        console.log('🔍 Generated embedding for session summary');
      } catch (error) {
        console.error('Failed to generate summary embedding:', error);
        // Continue without embedding - not critical
      }
    }

    if (existing) {
      // Update existing summary
      const updateData: Record<string, unknown> = {
        summary_text: summaryText,
        messages_summarized_count: messagesSummarizedCount,
        version: existing.version + 1,
      };
      if (formattedEmbedding) {
        updateData.embedding = formattedEmbedding;
      }

      const { error } = await supabase
        .from('session_summaries')
        .update(updateData)
        .eq('session_id', sessionId);

      if (error) {
        console.error('Error updating summary:', error);
        throw error;
      }
    } else {
      // Create new summary
      const insertData: Record<string, unknown> = {
        session_id: sessionId,
        summary_text: summaryText,
        messages_summarized_count: messagesSummarizedCount,
        version: 1,
      };
      if (formattedEmbedding) {
        insertData.embedding = formattedEmbedding;
      }

      const { error } = await supabase
        .from('session_summaries')
        .insert(insertData);

      if (error) {
        console.error('Error creating summary:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        console.error('Attempted to insert:', { sessionId, summaryText: summaryText.substring(0, 100), messagesSummarizedCount });
        throw error;
      }
    }
  }

  /**
   * Delete summary when session is deleted
   */
  static async deleteSummary(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('session_summaries')
      .delete()
      .eq('session_id', sessionId);

    if (error) {
      console.error('Error deleting summary:', error);
      throw error;
    }
  }

  // ============================================
  // Summarization Logic
  // ============================================

  /**
   * Check if summarization is needed based on token count
   */
  static async needsSummarization(
    sessionId: string,
    allMessages: Message[],
    apiKey: string | null
  ): Promise<boolean> {
    const summary = await this.getSummary(sessionId);
    const summarizedCount = summary?.messagesSummarizedCount || 0;

    // Get messages that haven't been summarized yet
    const validMessages = allMessages.filter(m => !m.isError);
    const newMessages = validMessages.slice(summarizedCount);

    if (newMessages.length === 0) {
      return false;
    }

    // Calculate total token count for new messages
    const newMessagesTokens = await estimateTotalTokens(newMessages, apiKey, true);

    // Add summary tokens if it exists
    const summaryTokens = summary ? await estimateTotalTokens([{
      id: 'summary',
      role: 'user',
      text: summary.summaryText,
      timestamp: Date.now(),
      isError: false
    }], apiKey, true) : 0;

    const totalTokens = summaryTokens + newMessagesTokens;

    return totalTokens >= SUMMARIZATION_CONFIG.summarizationThreshold;
  }

  /**
   * Generate summary using Gemini API
   */
  static async generateSummary(
    apiKey: string,
    messages: Message[],
    existingSummary?: string
  ): Promise<string> {
    const ai = new GoogleGenAI({ apiKey });

    // Format messages for the prompt
    const formattedMessages = messages
      .filter(msg => !msg.isError)
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
      .join('\n\n');

    let prompt: string;

    if (existingSummary) {
      // Incremental summarization
      prompt = SUMMARIZATION_PROMPTS.incremental
        .replace('{existingSummary}', existingSummary)
        .replace('{newMessages}', formattedMessages);
    } else {
      // Initial summarization
      prompt = SUMMARIZATION_PROMPTS.initial + formattedMessages;
    }

    try {
      const response = await ai.models.generateContent({
        model: SUMMARIZATION_CONFIG.summarizationModel,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0.3, // Lower temperature for more consistent summaries
          maxOutputTokens: SUMMARIZATION_CONFIG.maxSummaryTokens,
        }
      });

      const summaryText = response.text || '';

      // Truncate if somehow too long (shouldn't happen with maxOutputTokens)
      if (summaryText.length > SUMMARIZATION_CONFIG.maxSummaryTokens * 4) {
        return summaryText.substring(0, SUMMARIZATION_CONFIG.maxSummaryTokens * 4) + '...';
      }

      return summaryText;
    } catch (error) {
      console.error('Summarization failed:', error);
      throw error;
    }
  }

  /**
   * Main summarization workflow (ON-DEMAND)
   *
   * Checks if summarization is needed and performs it if so.
   * Returns the summary text (existing or newly generated).
   * User waits for this to complete before response is generated.
   */
  static async summarizeIfNeeded(
    apiKey: string,
    sessionId: string,
    allMessages: Message[]
  ): Promise<SessionSummary | null> {
    const validMessages = allMessages.filter(m => !m.isError);
    const totalMessages = validMessages.length;

    // Check if we need to summarize
    const needsSummary = await this.needsSummarization(sessionId, allMessages, apiKey);

    if (!needsSummary) {
      // Return existing summary if available
      return await this.getSummary(sessionId);
    }

    console.log(`🔄 Summarizing session ${sessionId}: ${totalMessages} messages`);

    // Get existing summary
    const existingSummary = await this.getSummary(sessionId);
    const alreadySummarizedCount = existingSummary?.messagesSummarizedCount || 0;

    // Determine which messages to summarize
    // Keep the most recent messages unsummarized
    const messagesToKeep = SUMMARIZATION_CONFIG.recentMessagesToKeep;
    const cutoffIndex = Math.max(0, totalMessages - messagesToKeep);

    // Messages that need to be added to summary
    const messagesToSummarize = validMessages.slice(alreadySummarizedCount, cutoffIndex);

    if (messagesToSummarize.length === 0) {
      console.log('✓ No new messages to summarize');
      return existingSummary;
    }

    console.log(`📝 Summarizing ${messagesToSummarize.length} messages (keeping last ${messagesToKeep})`);

    // Generate new summary
    const newSummary = await this.generateSummary(
      apiKey,
      messagesToSummarize,
      existingSummary?.summaryText
    );

    // Save to database (with embedding for Session RAG)
    await this.saveSummary(
      sessionId,
      newSummary,
      cutoffIndex,
      apiKey
    );

    console.log('✓ Summary saved to database with embedding');

    // Return updated summary
    return await this.getSummary(sessionId);
  }

  /**
   * Build context with summary + recent messages
   *
   * This is what gets sent to the Gemini API.
   * The summary is invisible to the user.
   */
  static async buildContextWithSummary(
    apiKey: string,
    sessionId: string,
    allMessages: Message[]
  ): Promise<Message[]> {
    // Perform summarization if needed (user waits for this)
    const summary = await this.summarizeIfNeeded(apiKey, sessionId, allMessages);

    const validMessages = allMessages.filter(m => !m.isError);

    if (!summary) {
      // No summary, return all messages (for short conversations)
      return validMessages;
    }

    // Get messages that weren't summarized
    const recentMessages = validMessages.slice(summary.messagesSummarizedCount);

    if (recentMessages.length === 0) {
      // Edge case: all messages were summarized
      return validMessages;
    }

    // Create a synthetic message containing the summary
    const summaryMessage: Message = {
      id: 'context-summary',
      role: 'user',
      text: `[Previous conversation summary]\n${summary.summaryText}\n[End of summary - conversation continues below]`,
      timestamp: recentMessages[0]?.timestamp - 1 || Date.now(),
      isError: false
    };

    // Also add an acknowledgment from the assistant
    const ackMessage: Message = {
      id: 'context-summary-ack',
      role: 'model',
      text: 'I understand the context from our previous conversation. Let me continue helping you.',
      timestamp: recentMessages[0]?.timestamp - 1 || Date.now(),
      isError: false
    };

    console.log(`📦 Context built: [Summary] + ${recentMessages.length} recent messages`);

    return [summaryMessage, ackMessage, ...recentMessages];
  }
}
