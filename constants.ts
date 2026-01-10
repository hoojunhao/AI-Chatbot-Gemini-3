import { AppSettings, ModelType, SummarizationConfig, TokenEstimationConfig } from './types';

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

// ============================================
// Summarization Configuration
// ============================================

export const SUMMARIZATION_CONFIG: SummarizationConfig = {
  // Trigger summarization when context exceeds 50k tokens
  summarizationThreshold: 50000,

  // Keep last 15 messages unsummarized for context quality
  recentMessagesToKeep: 15,

  // Maximum tokens for the summary itself
  maxSummaryTokens: 2000,

  // Use fast/cheap model for summarization
  summarizationModel: 'gemini-2.0-flash',
};

export const TOKEN_ESTIMATION_CONFIG: TokenEstimationConfig = {
  // Use hybrid approach: local + periodic API validation
  method: 'hybrid',

  // Use Gemini API every 10 messages to validate accuracy
  useAPIValidationFrequency: 10,

  // Always use API before summarization for precision
  useAPIBeforeSummarization: true,

  // Language-aware estimation factors
  cjkCharsPerToken: 1.0,     // Chinese/Japanese/Korean: ~1 token per character
  latinCharsPerToken: 4.0,   // English/European: ~4 characters per token
};

// ============================================
// Summarization Prompts
// ============================================

export const SUMMARIZATION_PROMPTS = {
  initial: `Summarize the following conversation between user and assistant. Focus ONLY on the actual conversation topics and content exchanged, NOT on system instructions, persona descriptions, or role-play setup.

Extract and preserve:
- Main topics discussed and questions asked
- Key information, facts, or details shared
- Decisions made or solutions found
- Important context needed for future messages
- Any unresolved questions or ongoing discussions

Ignore and exclude:
- Meta-discussion about AI personas or system instructions
- Role-play character descriptions or setup
- Instructions about how to behave or respond

Keep the summary concise (under 300 words) and focused on conversation content only.

Conversation:
`,

  incremental: `You have an existing conversation summary and new messages to add.

Create an updated summary that:
- Combines the old summary with new conversation topics
- Removes outdated or superseded information
- Focuses ONLY on actual conversation content (topics, facts, decisions)
- Excludes meta-information about personas, system instructions, or role-play setup
- Stays concise (under 300 words)

Previous Summary:
{existingSummary}

New Messages:
{newMessages}

Provide only the updated summary:`,
};