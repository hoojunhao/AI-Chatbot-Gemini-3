import { AppSettings, ModelType, SummarizationConfig, TokenEstimationConfig, MemoryConfig, SynopsisConfig } from './types';

export const DEFAULT_SYSTEM_INSTRUCTION = "You are Gemini, a helpful and capable AI assistant.";

export const DEFAULT_SETTINGS: AppSettings = {
  model: ModelType.GEMINI_3_FLASH,
  temperature: 0.7,
  systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
  enableMemory: true,
  enableCrossSessionMemory: true,  // Enabled by default
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

// ============================================
// Cross-Session Memory Configuration
// ============================================

export const MEMORY_CONFIG: MemoryConfig = {
  // Model for fact extraction
  extractionModel: 'gemini-2.0-flash',

  // Number of recent messages to analyze for fact extraction (last N turns)
  extractionWindowSize: 6,

  // Minimum confidence score to store a fact
  minConfidenceThreshold: 0.7,

  // Similarity threshold for deduplication (0.8 = semantically similar)
  deduplicationThreshold: 0.8,

  // Minimum similarity for retrieval (lowered from 0.7 for better recall)
  retrievalThreshold: 0.5,

  // Maximum memories to retrieve per query
  maxMemoriesToRetrieve: 10,

  // Maximum tokens for memory context
  maxMemoryTokens: 1000,

  // Session RAG configuration
  maxSessionsToSearch: 60,    // Only search last N sessions for RAG
  sessionRagThreshold: 0.5,   // Minimum similarity for session retrieval
  maxSessionsToRetrieve: 5,   // Max sessions to inject as context
};

export const MEMORY_EXTRACTION_PROMPT = `You are a memory extraction assistant. Analyze the following conversation and extract PERMANENT facts about the user that will remain true over time.

Focus on extracting ONLY permanent facts:
1. Personal preferences (e.g., "User prefers concise explanations")
2. Interests and hobbies (e.g., "User is interested in machine learning")
3. Personal information (e.g., "User's name is John", "User's home city is Singapore")
4. Relationships (e.g., "User has a girlfriend named Sarah")
5. Profession/role (e.g., "User is a software engineer")
6. Technical skills (e.g., "User knows TypeScript and React")
7. Ongoing projects (e.g., "User is building a chat application")

Rules:
- ONLY extract PERMANENT facts that will remain true over time
- DO extract: name, relationships, home city, profession, preferences, technical skills, ongoing projects
- DO NOT extract: current activities, today's plans, current location, temporary events, what user is doing right now
- If a fact might change tomorrow, DO NOT extract it
- ALWAYS use "User" as the subject, never the user's actual name (e.g., "User is named John", NOT "John is the user's name")
- Do NOT extract facts about the AI assistant
- Do NOT extract sensitive information like passwords or API keys
- Each fact should be a single, atomic statement
- Be concise - each fact should be one sentence
- Assign a confidence score (0.0-1.0) based on how clearly stated the fact is

Respond in JSON format:
{
  "facts": [
    {"text": "fact about user", "category": "preference|interest|personal|technical|project|general", "confidence": 0.9}
  ]
}

If no memorable facts are found, respond with: {"facts": []}

Conversation:
`;

export const MEMORY_CONTEXT_HEADER = `[What I remember about you from previous conversations]`;
export const MEMORY_CONTEXT_FOOTER = `[End of memories]`;

// ============================================
// Session Synopsis Configuration
// ============================================

export const SYNOPSIS_CONFIG: SynopsisConfig = {
  idleTimeoutMs: 60 * 60 * 1000,  // 60 minutes
  minMessages: 1,                  // No minimum - even 1 message gets synopsis
  synopsisModel: 'gemini-2.0-flash',
  maxOutputTokens: 200,
};

export const SYNOPSIS_PROMPT = `Summarize this conversation in 2-3 sentences. Focus on:
- Key topics discussed
- Names, places, or specific items mentioned (preserve exact spelling/characters)
- Any decisions or plans made

Keep it under 100 words. Preserve non-English text exactly as written.

Conversation:
`;