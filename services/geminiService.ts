import { GoogleGenAI, Content, Part, GenerateContentParameters } from "@google/genai";
import { AppSettings, Message, ModelType, GeminiErrorType, UserLocation } from "../types";
import { createSlidingWindow } from "./contextManager";
import { SummaryService } from "./summaryService";
import { getMemoryManager } from "./memoryManager";
import { parseGeminiError, isContextOverflow, isRetryableError, getRetryDelay } from "./errorService";
import { LocationService } from "./locationService";

// ============================================
// DateTime Context for Real-Time Awareness
// ============================================

function getCurrentDateTimeContext(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  };
  const formatted = now.toLocaleString(undefined, options);
  const isoDate = now.toISOString().split('T')[0]; // YYYY-MM-DD

  return `[Current Date & Time: ${formatted} (${isoDate})]`;
}

// ============================================
// Custom Error Class
// ============================================

export class GeminiApiError extends Error {
  type: GeminiErrorType;
  userMessage: string;
  suggestion: string;
  retryable: boolean;
  httpCode?: number;

  constructor(parsedError: ReturnType<typeof parseGeminiError>) {
    super(parsedError.message);
    this.name = 'GeminiApiError';
    this.type = parsedError.type;
    this.userMessage = parsedError.userMessage;
    this.suggestion = parsedError.suggestion;
    this.retryable = parsedError.retryable;
    this.httpCode = parsedError.httpCode;
  }
}

export const generateResponseStream = async function* (
  apiKey: string,
  settings: AppSettings,
  history: Message[],
  newMessage: string,
  attachments: { mimeType: string; data: string }[] = [],
  sessionId?: string,  // Add sessionId parameter for summarization (optional for guest users)
  userId?: string,     // Add userId parameter for cross-session memory
  retryAttempt: number = 0,  // For auto-retry with exponential backoff
  userLocation?: UserLocation | null,  // User's location for context-aware responses
  isTemporary: boolean = false  // Skip memory/summarization for temporary chats
) {
  if (!apiKey) throw new Error("API Key is missing");

  const ai = new GoogleGenAI({ apiKey });

  // Construct parts for the new message
  const parts: Part[] = [];

  // Add attachments
  attachments.forEach(att => {
    parts.push({
      inlineData: {
        mimeType: att.mimeType,
        data: att.data
      }
    });
  });

  // Add text
  parts.push({ text: newMessage });

  // Construct history with SUMMARIZATION + SLIDING WINDOW if memory is enabled
  let contents: Content[] = [];

  if (settings.enableMemory) {
    let contextMessages: Message[];

    if (sessionId && userId && settings.enableCrossSessionMemory && !isTemporary) {
      // Logged-in user with cross-session memory enabled (not temporary chat)
      try {
        const memoryManager = getMemoryManager(apiKey);
        contextMessages = await memoryManager.buildContextWithMemory(
          userId,
          sessionId,
          history,
          newMessage
        );
        console.log(`🧠 Context with cross-session memory: ${contextMessages.length} messages`);
      } catch (error) {
        console.error('Memory manager failed, falling back to summarization:', error);
        // Fallback to summarization only
        try {
          contextMessages = await SummaryService.buildContextWithSummary(
            apiKey,
            sessionId,
            history
          );
          console.log(`📦 Fallback - Context with summarization: ${contextMessages.length} messages`);
        } catch (summaryError) {
          console.error('Summarization also failed, using sliding window:', summaryError);
          const systemInstructionTokens = settings.systemInstruction
            ? Math.ceil(settings.systemInstruction.length / 4)
            : 0;
          const contextWindow = createSlidingWindow(history, systemInstructionTokens);
          contextMessages = contextWindow.messages;
          console.log(`⚠️ Final fallback - Sliding window: ${contextWindow.messages.length}/${contextWindow.originalCount} messages`);
        }
      }
    } else if (sessionId && !isTemporary) {
      // Logged-in user without cross-session memory: Use summarization for context management
      try {
        contextMessages = await SummaryService.buildContextWithSummary(
          apiKey,
          sessionId,
          history
        );
        console.log(`📦 Context with summarization: ${contextMessages.length} messages`);
      } catch (error) {
        console.error('Summarization failed, falling back to sliding window:', error);
        // Fallback to sliding window if summarization fails
        const systemInstructionTokens = settings.systemInstruction
          ? Math.ceil(settings.systemInstruction.length / 4)
          : 0;
        const contextWindow = createSlidingWindow(history, systemInstructionTokens);
        contextMessages = contextWindow.messages;
        console.log(`⚠️ Fallback - Sliding window: ${contextWindow.messages.length}/${contextWindow.originalCount} messages`);
      }
    } else if (isTemporary) {
      // Temporary chat: Use sliding window only (no memory/summarization)
      const systemInstructionTokens = settings.systemInstruction
        ? Math.ceil(settings.systemInstruction.length / 4)
        : 0;
      const contextWindow = createSlidingWindow(history, systemInstructionTokens);
      contextMessages = contextWindow.messages;
      console.log(`🕐 Temporary chat - Sliding window: ${contextWindow.messages.length}/${contextWindow.originalCount} messages`);
    } else {
      // Guest user: Use sliding window only (no database access)
      const systemInstructionTokens = settings.systemInstruction
        ? Math.ceil(settings.systemInstruction.length / 4)
        : 0;
      const contextWindow = createSlidingWindow(history, systemInstructionTokens);
      contextMessages = contextWindow.messages;
      console.log(`👤 Guest - Sliding window: ${contextWindow.messages.length}/${contextWindow.originalCount} messages`);
    }

    // Convert messages to Content format for Gemini API
    contents = contextMessages.map(msg => ({
      role: msg.role,
      parts: msg.attachments
        ? [...msg.attachments.map(a => ({ inlineData: { mimeType: a.mimeType, data: a.data } })), { text: msg.text }]
        : [{ text: msg.text }]
    }));
  }

  // Add the new message to contents
  contents.push({ role: 'user', parts });

  // Generation Config with real-time and location awareness
  const dateTimeContext = getCurrentDateTimeContext();
  const locationContext = userLocation
    ? LocationService.formatLocationContext(userLocation)
    : '';

  const enhancedSystemInstruction = [
    dateTimeContext,
    locationContext,
    settings.systemInstruction
  ].filter(Boolean).join('\n\n');

  const config: any = {
    systemInstruction: enhancedSystemInstruction,
    temperature: settings.temperature,
    safetySettings: [
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: settings.safetySettings.sexuallyExplicit },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: settings.safetySettings.hateSpeech },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: settings.safetySettings.harassment },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: settings.safetySettings.dangerousContent },
    ]
  };

  // Thinking configuration logic
  if (settings.model === ModelType.GEMINI_3_FLASH) {
    config.thinkingConfig = {
      includeThoughts: true,
      thinkingLevel: settings.thinkingLevel === 'HIGH' ? "high" : "low"
    };
  }

  try {
    const params: GenerateContentParameters = {
      model: settings.model,
      contents: contents,
      config: config
    };

    const responseStream = await ai.models.generateContentStream(params);

    let hasYielded = false;

    for await (const chunk of responseStream) {
      const parts = chunk.candidates?.[0]?.content?.parts;

      // Check for safety blocks in the response
      const finishReason = chunk.candidates?.[0]?.finishReason;
      if (finishReason === 'SAFETY') {
        const error = parseGeminiError({ message: 'Response blocked by safety filters' });
        error.type = GeminiErrorType.SAFETY_BLOCKED;
        throw new GeminiApiError(error);
      }

      if (parts) {
        for (const part of parts) {
          // Check for native thinking part
          // @ts-ignore
          if (part.thought) {
            // @ts-ignore
            const thoughtText = typeof part.thought === 'string' ? part.thought : part.text;
            if (thoughtText) {
              yield `<thinking>${thoughtText}</thinking>`;
            }
          } else if (part.text) {
            yield part.text;
          }
        }
      } else {
        const text = chunk.text;
        if (text) {
          hasYielded = true;
          yield text;
        }
      }

      // Ensure we mark as yielded if we got parts
      if (parts && parts.length > 0) {
        hasYielded = true;
      }
    }

    if (!hasYielded) {
      // Check if this might be a safety filter issue
      const error = parseGeminiError({ message: 'No response generated - possibly filtered' });
      error.type = GeminiErrorType.SAFETY_BLOCKED;
      throw new GeminiApiError(error);
    }

    // Background memory extraction (fire-and-forget) - skip for temporary chats
    if (settings.enableCrossSessionMemory && userId && sessionId && !isTemporary) {
      const memoryManager = getMemoryManager(apiKey);
      memoryManager.processConversationForMemories(userId, sessionId, history)
        .catch(err => console.error('Background memory extraction failed:', err));
    }

  } catch (error) {
    console.error("Gemini API Error:", error);

    // If already a GeminiApiError, re-throw
    if (error instanceof GeminiApiError) {
      throw error;
    }

    // Parse the error
    const parsedError = parseGeminiError(error);

    // Check for context overflow specifically
    if (isContextOverflow(error)) {
      console.warn('Context overflow detected - conversation too long');
      parsedError.type = GeminiErrorType.CONTEXT_OVERFLOW;
      parsedError.userMessage = 'This conversation has become too long for the AI to process.';
      parsedError.suggestion = 'Please start a new chat to continue. Your conversation history is saved.';
    }

    // Auto-retry for retryable errors (with limit)
    if (isRetryableError(error) && retryAttempt < 3) {
      const delay = getRetryDelay(retryAttempt);
      console.log(`🔄 Retrying in ${Math.round(delay)}ms (attempt ${retryAttempt + 1}/3)...`);

      await new Promise(resolve => setTimeout(resolve, delay));

      // Recursive retry with yield*
      yield* generateResponseStream(
        apiKey,
        settings,
        history,
        newMessage,
        attachments,
        sessionId,
        userId,
        retryAttempt + 1,
        userLocation,
        isTemporary
      );
      return;
    }

    throw new GeminiApiError(parsedError);
  }
};