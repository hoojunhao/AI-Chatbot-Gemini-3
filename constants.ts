import { AppSettings, ModelType } from './types';

export const DEFAULT_SYSTEM_INSTRUCTION = "You are Gemini, a helpful and capable AI assistant.";

export const DEFAULT_SETTINGS: AppSettings = {
  model: ModelType.GEMINI_3_FLASH,
  temperature: 0.7,
  systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
  enableMemory: true,
  thinkingLevel: 'LOW',
  safetySettings: {
    sexuallyExplicit: 'BLOCK_ONLY_HIGH',
    hateSpeech: 'BLOCK_ONLY_HIGH',
    harassment: 'BLOCK_ONLY_HIGH',
    dangerousContent: 'BLOCK_ONLY_HIGH',
  }
};

// Context Window Configuration
export const CONTEXT_CONFIG = {
  // Maximum messages to include in context (count-based limit)
  MAX_MESSAGES: 50,

  // Maximum estimated tokens for context (token-based limit)
  MAX_CONTEXT_TOKENS: 100000,

  // Average characters per token (rough estimate for English text)
  CHARS_PER_TOKEN: 4,

  // Tokens reserved for system instruction
  SYSTEM_INSTRUCTION_BUFFER: 2000,

  // Tokens reserved for new message + response
  RESPONSE_BUFFER: 8000,

  // Minimum messages to always include (most recent)
  MIN_RECENT_MESSAGES: 5,
};