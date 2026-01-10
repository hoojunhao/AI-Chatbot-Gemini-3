import { Message } from '../types';
import { CONTEXT_CONFIG } from '../constants';

/**
 * Context Manager for Sliding Window Implementation
 *
 * Manages conversation history to fit within API context limits
 * using the Google GenAI SDK TypeScript patterns.
 */

export interface ContextWindow {
  messages: Message[];
  estimatedTokens: number;
  truncated: boolean;
  originalCount: number;
}

/**
 * Estimates token count for a message
 * Based on average of 4 characters per token for English text
 */
export function estimateMessageTokens(message: Message): number {
  let tokens = 0;

  // Text content
  tokens += Math.ceil(message.text.length / CONTEXT_CONFIG.CHARS_PER_TOKEN);

  // Attachments (images are ~258 tokens for inline data reference)
  if (message.attachments) {
    tokens += message.attachments.length * 258;

    // Base64 image data (very rough estimate)
    message.attachments.forEach(att => {
      // Base64 is ~1.37x the binary size, and images use special tokenization
      tokens += Math.ceil(att.data.length / 1000); // Rough estimate
    });
  }

  // Role overhead (~4 tokens per message for role markers)
  tokens += 4;

  return tokens;
}

/**
 * Estimates total tokens for an array of messages
 */
export function estimateTotalTokens(messages: Message[]): number {
  return messages.reduce((total, msg) => total + estimateMessageTokens(msg), 0);
}

/**
 * Creates a sliding window of messages that fits within token limits
 *
 * Strategy:
 * 1. Always include the most recent MIN_RECENT_MESSAGES
 * 2. Add older messages until we hit MAX_MESSAGES or MAX_CONTEXT_TOKENS
 * 3. Prioritize recent messages over older ones
 */
export function createSlidingWindow(
  history: Message[],
  systemInstructionTokens: number = 0
): ContextWindow {
  // Filter out error messages first
  const validMessages = history.filter(msg => !msg.isError);

  if (validMessages.length === 0) {
    return {
      messages: [],
      estimatedTokens: 0,
      truncated: false,
      originalCount: 0
    };
  }

  // Calculate available token budget
  const availableTokens = CONTEXT_CONFIG.MAX_CONTEXT_TOKENS
    - CONTEXT_CONFIG.SYSTEM_INSTRUCTION_BUFFER
    - CONTEXT_CONFIG.RESPONSE_BUFFER
    - systemInstructionTokens;

  // Start from the most recent messages
  const windowMessages: Message[] = [];
  let currentTokens = 0;

  // Iterate from newest to oldest
  for (let i = validMessages.length - 1; i >= 0; i--) {
    const message = validMessages[i];
    const messageTokens = estimateMessageTokens(message);

    // Check if adding this message would exceed limits
    const wouldExceedTokens = currentTokens + messageTokens > availableTokens;
    const wouldExceedCount = windowMessages.length >= CONTEXT_CONFIG.MAX_MESSAGES;

    // Always include minimum recent messages regardless of token count
    const isBelowMinimum = windowMessages.length < CONTEXT_CONFIG.MIN_RECENT_MESSAGES;

    if ((wouldExceedTokens || wouldExceedCount) && !isBelowMinimum) {
      break;
    }

    // Add message to the beginning of the window (maintain chronological order)
    windowMessages.unshift(message);
    currentTokens += messageTokens;
  }

  return {
    messages: windowMessages,
    estimatedTokens: currentTokens,
    truncated: windowMessages.length < validMessages.length,
    originalCount: validMessages.length
  };
}

/**
 * Validates that the context window is within acceptable limits
 */
export function validateContextWindow(window: ContextWindow): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (window.estimatedTokens > CONTEXT_CONFIG.MAX_CONTEXT_TOKENS * 0.9) {
    warnings.push('Context is approaching token limit');
  }

  if (window.messages.length >= CONTEXT_CONFIG.MAX_MESSAGES) {
    warnings.push('Context has reached message count limit');
  }

  if (window.truncated) {
    warnings.push(`${window.originalCount - window.messages.length} messages were truncated`);
  }

  return {
    valid: window.estimatedTokens <= CONTEXT_CONFIG.MAX_CONTEXT_TOKENS,
    warnings
  };
}
