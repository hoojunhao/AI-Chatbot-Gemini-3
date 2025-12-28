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