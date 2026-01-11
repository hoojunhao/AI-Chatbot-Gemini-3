export enum ModelType {
  GEMINI_3_FLASH = 'gemini-3-flash-preview',
  GEMINI_3_PRO = 'gemini-3-pro-preview',
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isError?: boolean;
  attachments?: Attachment[];
}

export interface Attachment {
  mimeType: string;
  data: string; // Base64
  name?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  isPinned?: boolean;
}

export interface AppSettings {
  model: ModelType;
  temperature: number;
  systemInstruction: string;
  enableMemory: boolean;
  enableCrossSessionMemory: boolean;  // Cross-session AI memory (remember user across sessions)
  thinkingLevel: 'LOW' | 'HIGH';
  safetySettings: {
    sexuallyExplicit: 'BLOCK_NONE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_LOW_AND_ABOVE';
    hateSpeech: 'BLOCK_NONE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_LOW_AND_ABOVE';
    harassment: 'BLOCK_NONE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_LOW_AND_ABOVE';
    dangerousContent: 'BLOCK_NONE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_LOW_AND_ABOVE';
  };
}

export interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onTogglePinSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onOpenSettings: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  // Location props
  userLocation: UserLocation | null;
  locationLoading: boolean;
  onUpdateLocation: () => void;
}

// ============================================
// Summarization Types
// ============================================

export interface SessionSummary {
  id: string;
  sessionId: string;
  summaryText: string;
  messagesSummarizedCount: number;
  version: number;
  updatedAt: number;
}

export interface SummarizationConfig {
  // Trigger summarization after this many tokens
  summarizationThreshold: number;
  // Number of recent messages to keep unsummarized
  recentMessagesToKeep: number;
  // Maximum tokens for summary text
  maxSummaryTokens: number;
  // Model to use for summarization (can be cheaper/faster model)
  summarizationModel: string;
}

export interface TokenEstimationConfig {
  // Method to use: 'local', 'api', or 'hybrid'
  method: 'local' | 'api' | 'hybrid';
  // For hybrid mode: use API validation every N messages
  useAPIValidationFrequency: number;
  // Always use API before summarization for precision
  useAPIBeforeSummarization: boolean;
  // Language-aware estimation factors
  cjkCharsPerToken: number;
  latinCharsPerToken: number;
}

// ============================================
// Error Handling Types
// ============================================

export enum GeminiErrorType {
  CONTEXT_OVERFLOW = 'CONTEXT_OVERFLOW',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_API_KEY = 'INVALID_API_KEY',
  SAFETY_BLOCKED = 'SAFETY_BLOCKED',
  MODEL_UNAVAILABLE = 'MODEL_UNAVAILABLE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export interface ParsedGeminiError {
  type: GeminiErrorType;
  message: string;
  userMessage: string;
  suggestion: string;
  retryable: boolean;
  httpCode?: number;
  rawError?: unknown;
}

export interface ErrorRecoveryAction {
  label: string;
  action: 'new_chat' | 'retry' | 'clear_context' | 'check_settings' | 'wait';
  primary?: boolean;
}

// ============================================
// Cross-Session Memory Types
// ============================================

export type MemoryCategory = 'preference' | 'interest' | 'personal' | 'technical' | 'project' | 'general';

export interface UserMemory {
  id: string;
  userId: string;
  factText: string;
  category: MemoryCategory;
  confidence: number;
  embedding?: number[];
  sourceSessionId?: string;
  sourceMessageId?: string;
  accessCount: number;
  lastAccessedAt?: number;
  isPinned: boolean;
  isDeleted: boolean;
  createdAt: number;
  updatedAt: number;
  similarity?: number;  // Only present when retrieved via semantic search
}

export interface ExtractedFact {
  text: string;
  category: MemoryCategory;
  confidence: number;
}

export interface MemoryConfig {
  extractionModel: string;
  extractionWindowSize: number;
  minConfidenceThreshold: number;
  deduplicationThreshold: number;
  retrievalThreshold: number;
  maxMemoriesToRetrieve: number;
  maxMemoryTokens: number;
  // Session RAG config
  maxSessionsToSearch: number;
  sessionRagThreshold: number;
  maxSessionsToRetrieve: number;
}

// Session summary match result from RAG search
export interface SessionSummaryMatch {
  session_id: string;
  summary_text: string;
  similarity: number;
  updated_at: string;
}

// ============================================
// Session Synopsis Types
// ============================================

export interface SynopsisConfig {
  idleTimeoutMs: number;      // Idle timeout in milliseconds
  minMessages: number;        // Minimum messages required for synopsis
  synopsisModel: string;      // Model to use for synopsis generation
  maxOutputTokens: number;    // Max tokens for synopsis output
}

// ============================================
// Location Types
// ============================================

export interface UserLocation {
  latitude: number;
  longitude: number;
  city?: string;
  region?: string;
  country?: string;
  displayName: string;  // Localized short format (e.g., "台灣桃園市中壢區")
  source: 'ip' | 'gps';
  timestamp: number;
}