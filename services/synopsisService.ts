import { GoogleGenAI } from "@google/genai";
import { Message } from '../types';
import { SummaryService } from './summaryService';
import { SYNOPSIS_CONFIG, SYNOPSIS_PROMPT } from '../constants';

/**
 * Synopsis Service
 *
 * Generates lightweight session synopses for short conversations
 * to enable Session RAG for all sessions, not just those exceeding
 * the 50k token summarization threshold.
 *
 * Triggers:
 * - Session switch (when user leaves a session)
 * - Idle timeout (60 minutes of inactivity)
 */

/**
 * Generate a brief synopsis of the conversation
 */
async function generateSynopsis(
  apiKey: string,
  messages: Message[]
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  const conversationText = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n\n');

  const response = await ai.models.generateContent({
    model: SYNOPSIS_CONFIG.synopsisModel,
    contents: [{ role: 'user', parts: [{ text: SYNOPSIS_PROMPT + conversationText }] }],
    config: {
      temperature: 0.3,
      maxOutputTokens: SYNOPSIS_CONFIG.maxOutputTokens
    }
  });

  return response.text || '';
}

/**
 * Check if synopsis generation is needed and generate if so
 *
 * Handles all cases:
 * 1. No summary exists → Generate new synopsis
 * 2. Summary exists, no new messages → Skip
 * 3. Summary exists, has new messages → Append mini-synopsis
 */
export async function generateSynopsisIfNeeded(
  sessionId: string,
  messages: Message[],
  apiKey: string
): Promise<void> {
  const existingSummary = await SummaryService.getSummary(sessionId);
  const validMessages = messages.filter(m => !m.isError);

  // Case 1: No summary exists → generate full synopsis
  if (!existingSummary) {
    if (validMessages.length < SYNOPSIS_CONFIG.minMessages) {
      console.log('⏭️ Not enough messages for synopsis');
      return;
    }

    try {
      const synopsis = await generateSynopsis(apiKey, validMessages);
      await SummaryService.saveSummary(
        sessionId,
        synopsis,
        validMessages.length,
        apiKey  // Generates embedding
      );
      console.log('📝 Generated synopsis for session');
    } catch (error) {
      console.error('Synopsis generation failed:', error);
    }
    return;
  }

  // Case 2 & 3: Summary exists → check for new messages
  const summarizedCount = existingSummary.messagesSummarizedCount;
  const newMessages = validMessages.slice(summarizedCount);

  if (newMessages.length === 0) {
    console.log('✓ Session already up-to-date');
    return;
  }

  // Case 3: Append mini-synopsis for new messages
  try {
    const miniSynopsis = await generateSynopsis(apiKey, newMessages);
    const updatedText = `${existingSummary.summaryText}\n\n[Additional context:]\n${miniSynopsis}`;

    await SummaryService.saveSummary(
      sessionId,
      updatedText,
      validMessages.length,  // Update count
      apiKey  // Regenerates embedding
    );

    console.log(`📝 Appended ${newMessages.length} new messages to synopsis`);
  } catch (error) {
    console.error('Synopsis append failed:', error);
  }
}

/**
 * Check if synopsis should be generated (for deduplication)
 * Uses database check instead of in-memory Set (handles refresh, multiple tabs)
 */
export async function shouldGenerateSynopsis(
  sessionId: string,
  messageCount: number
): Promise<boolean> {
  const existing = await SummaryService.getSummary(sessionId);

  if (!existing) {
    return messageCount >= SYNOPSIS_CONFIG.minMessages;
  }

  return messageCount > existing.messagesSummarizedCount;
}
