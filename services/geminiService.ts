import { GoogleGenAI, Content, Part, GenerateContentParameters } from "@google/genai";
import { AppSettings, Message, ModelType } from "../types";
import { createSlidingWindow } from "./contextManager";

export const generateResponseStream = async function* (
  apiKey: string,
  settings: AppSettings,
  history: Message[],
  newMessage: string,
  attachments: { mimeType: string; data: string }[] = []
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

  // Construct history with SLIDING WINDOW if memory is enabled
  let contents: Content[] = [];

  if (settings.enableMemory) {
    // Calculate system instruction tokens for budget
    const systemInstructionTokens = settings.systemInstruction
      ? Math.ceil(settings.systemInstruction.length / 4)
      : 0;

    // Apply sliding window to history
    const contextWindow = createSlidingWindow(history, systemInstructionTokens);

    // Log context info for debugging
    console.log(`Context Window: ${contextWindow.messages.length}/${contextWindow.originalCount} messages, ~${contextWindow.estimatedTokens} tokens, truncated: ${contextWindow.truncated}`);

    // Convert windowed messages to Content format
    contents = contextWindow.messages.map(msg => ({
      role: msg.role,
      parts: msg.attachments
        ? [...msg.attachments.map(a => ({ inlineData: { mimeType: a.mimeType, data: a.data } })), { text: msg.text }]
        : [{ text: msg.text }]
    }));
  }

  // Add the new message to contents
  contents.push({ role: 'user', parts });

  // Generation Config
  const config: any = {
    systemInstruction: settings.systemInstruction,
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
      yield "I'm unable to generate a response for this request. It might have been flagged by safety filters.";
    }

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};