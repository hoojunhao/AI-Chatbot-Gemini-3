import { GoogleGenAI, Content, Part } from "@google/genai";
import { AppSettings, Message, ModelType } from "../types";

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

  // Construct history if memory is enabled
  let contents: Content[] = [];
  
  if (settings.enableMemory) {
    contents = history
      .filter(msg => !msg.isError) // Do not include error messages in context
      .map(msg => ({
        role: msg.role,
        parts: msg.attachments 
          ? [...msg.attachments.map(a => ({ inlineData: { mimeType: a.mimeType, data: a.data } })), { text: msg.text }]
          : [{ text: msg.text }]
    }));
  }

  // Add the new message to contents
  contents.push({ role: 'user', parts });

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
    if (settings.thinkingLevel === 'HIGH') {
      // High thinking level: Set max budget for Flash
      config.thinkingConfig = { thinkingBudget: 24576 };
      config.maxOutputTokens = 32768; 
    } else {
      // Low thinking level: Disable thinking to ensure speed
      config.thinkingConfig = { thinkingBudget: 0 };
    }
  }

  try {
    const responseStream = await ai.models.generateContentStream({
      model: settings.model,
      contents: contents,
      config: config
    });

    for await (const chunk of responseStream) {
      const text = chunk.text;
      if (text) {
        yield text;
      }
    }
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};