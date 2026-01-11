import { GeminiErrorType, ParsedGeminiError, ErrorRecoveryAction } from '../types';

/**
 * Error Service
 *
 * Parses and categorizes errors from the Google GenAI SDK,
 * providing user-friendly messages and recovery suggestions.
 */

// ============================================
// Error Detection Patterns
// ============================================

const ERROR_PATTERNS = {
  contextOverflow: [
    /context.*(length|limit|exceed|overflow)/i,
    /too many tokens/i,
    /maximum.*context/i,
    /input.*too (long|large)/i,
    /request.*too (long|large)/i,
    /INVALID_ARGUMENT.*length/i,
  ],
  rateLimit: [
    /rate.?limit/i,
    /quota.*exceed/i,
    /too many requests/i,
    /RESOURCE_EXHAUSTED/i,
    /429/,
  ],
  invalidApiKey: [
    /api.?key/i,
    /invalid.*key/i,
    /PERMISSION_DENIED/i,
    /UNAUTHENTICATED/i,
    /401/,
    /403/,
  ],
  safetyBlocked: [
    /safety/i,
    /blocked/i,
    /harmful/i,
    /SAFETY/i,
    /content.*filter/i,
  ],
  modelUnavailable: [
    /model.*unavailable/i,
    /overloaded/i,
    /503/i,
    /UNAVAILABLE/i,
    /capacity/i,
  ],
  networkError: [
    /network/i,
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /timeout/i,
    /fetch.*failed/i,
    /connection/i,
  ],
};

// ============================================
// User-Friendly Error Configurations
// ============================================

const ERROR_CONFIGS: Record<GeminiErrorType, {
  userMessage: string;
  suggestion: string;
  retryable: boolean;
  actions: ErrorRecoveryAction[];
}> = {
  [GeminiErrorType.CONTEXT_OVERFLOW]: {
    userMessage: 'This conversation has become too long for the AI to process.',
    suggestion: 'Start a new chat to continue. Your conversation history is saved and you can reference it later.',
    retryable: false,
    actions: [
      { label: 'Start New Chat', action: 'new_chat', primary: true },
      { label: 'Clear Old Messages', action: 'clear_context' },
    ],
  },
  [GeminiErrorType.RATE_LIMITED]: {
    userMessage: 'Too many requests. The API rate limit has been reached.',
    suggestion: 'Please wait a moment before sending another message.',
    retryable: true,
    actions: [
      { label: 'Wait & Retry', action: 'wait', primary: true },
      { label: 'Retry Now', action: 'retry' },
    ],
  },
  [GeminiErrorType.INVALID_API_KEY]: {
    userMessage: 'There\'s a problem with your API key.',
    suggestion: 'Please check that your Gemini API key is correct and has not expired.',
    retryable: false,
    actions: [
      { label: 'Check Settings', action: 'check_settings', primary: true },
    ],
  },
  [GeminiErrorType.SAFETY_BLOCKED]: {
    userMessage: 'This request was blocked by safety filters.',
    suggestion: 'Try rephrasing your message or adjusting safety settings.',
    retryable: false,
    actions: [
      { label: 'Check Settings', action: 'check_settings', primary: true },
      { label: 'Try Again', action: 'retry' },
    ],
  },
  [GeminiErrorType.MODEL_UNAVAILABLE]: {
    userMessage: 'The AI model is temporarily unavailable.',
    suggestion: 'The service may be experiencing high demand. Please try again in a few moments.',
    retryable: true,
    actions: [
      { label: 'Retry', action: 'retry', primary: true },
      { label: 'Wait & Retry', action: 'wait' },
    ],
  },
  [GeminiErrorType.NETWORK_ERROR]: {
    userMessage: 'Unable to connect to the AI service.',
    suggestion: 'Please check your internet connection and try again.',
    retryable: true,
    actions: [
      { label: 'Retry', action: 'retry', primary: true },
    ],
  },
  [GeminiErrorType.UNKNOWN]: {
    userMessage: 'An unexpected error occurred.',
    suggestion: 'Please try again. If the problem persists, try starting a new chat.',
    retryable: true,
    actions: [
      { label: 'Retry', action: 'retry', primary: true },
      { label: 'Start New Chat', action: 'new_chat' },
    ],
  },
};

// ============================================
// Helper Functions
// ============================================

/**
 * Extract error string from various error formats
 */
function getErrorString(error: unknown): string {
  if (typeof error === 'string') return error;

  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === 'object' && error !== null) {
    const e = error as any;

    // Google GenAI SDK error format
    if (e.error?.message) return e.error.message;
    if (e.message) return e.message;
    if (e.statusText) return e.statusText;

    // Try to stringify
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

/**
 * Extract HTTP status code from error
 */
function getHttpCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;

  const e = error as any;

  if (e.status) return e.status;
  if (e.statusCode) return e.statusCode;
  if (e.error?.code) return e.error.code;
  if (e.code && typeof e.code === 'number') return e.code;

  // Try to extract from message
  const match = getErrorString(error).match(/\b(4\d{2}|5\d{2})\b/);
  if (match) return parseInt(match[1]);

  return undefined;
}

/**
 * Detect error type from error object or message
 */
function detectErrorType(error: unknown): GeminiErrorType {
  const errorString = getErrorString(error);
  const httpCode = getHttpCode(error);

  // Check each pattern category
  if (ERROR_PATTERNS.contextOverflow.some(pattern => pattern.test(errorString))) {
    return GeminiErrorType.CONTEXT_OVERFLOW;
  }
  if (ERROR_PATTERNS.rateLimit.some(pattern => pattern.test(errorString))) {
    return GeminiErrorType.RATE_LIMITED;
  }
  if (ERROR_PATTERNS.invalidApiKey.some(pattern => pattern.test(errorString))) {
    return GeminiErrorType.INVALID_API_KEY;
  }
  if (ERROR_PATTERNS.safetyBlocked.some(pattern => pattern.test(errorString))) {
    return GeminiErrorType.SAFETY_BLOCKED;
  }
  if (ERROR_PATTERNS.modelUnavailable.some(pattern => pattern.test(errorString))) {
    return GeminiErrorType.MODEL_UNAVAILABLE;
  }
  if (ERROR_PATTERNS.networkError.some(pattern => pattern.test(errorString))) {
    return GeminiErrorType.NETWORK_ERROR;
  }

  // Fallback to HTTP code detection
  if (httpCode) {
    if (httpCode === 429) return GeminiErrorType.RATE_LIMITED;
    if (httpCode === 401 || httpCode === 403) return GeminiErrorType.INVALID_API_KEY;
    if (httpCode === 503) return GeminiErrorType.MODEL_UNAVAILABLE;
    if (httpCode === 400) {
      // 400 could be context overflow - check message
      if (/length|token|context/i.test(errorString)) {
        return GeminiErrorType.CONTEXT_OVERFLOW;
      }
    }
  }

  return GeminiErrorType.UNKNOWN;
}

// ============================================
// Public API
// ============================================

/**
 * Main error parsing function
 *
 * Takes any error from the Gemini API and returns a structured,
 * user-friendly error object.
 */
export function parseGeminiError(error: unknown): ParsedGeminiError {
  const type = detectErrorType(error);
  const config = ERROR_CONFIGS[type];
  const httpCode = getHttpCode(error);

  return {
    type,
    message: getErrorString(error),
    userMessage: config.userMessage,
    suggestion: config.suggestion,
    retryable: config.retryable,
    httpCode,
    rawError: error,
  };
}

/**
 * Get recovery actions for an error type
 */
export function getRecoveryActions(errorType: GeminiErrorType): ErrorRecoveryAction[] {
  return ERROR_CONFIGS[errorType]?.actions || ERROR_CONFIGS[GeminiErrorType.UNKNOWN].actions;
}

/**
 * Check if an error indicates context overflow
 */
export function isContextOverflow(error: unknown): boolean {
  return detectErrorType(error) === GeminiErrorType.CONTEXT_OVERFLOW;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const type = detectErrorType(error);
  return ERROR_CONFIGS[type]?.retryable || false;
}

/**
 * Format error for display in chat
 */
export function formatErrorForChat(parsedError: ParsedGeminiError): string {
  return `**${parsedError.userMessage}**\n\n${parsedError.suggestion}`;
}

/**
 * Get retry delay for rate-limited errors (exponential backoff)
 *
 * @param attemptNumber - The retry attempt number (0-indexed)
 * @returns Delay in milliseconds
 */
export function getRetryDelay(attemptNumber: number): number {
  const baseDelay = 1000; // 1 second
  const maxDelay = 30000; // 30 seconds
  const delay = Math.min(baseDelay * Math.pow(2, attemptNumber), maxDelay);
  return delay + Math.random() * 1000; // Add jitter
}
