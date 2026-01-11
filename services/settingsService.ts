import { supabase } from './supabase';
import { AppSettings, ModelType } from '../types';
import { DEFAULT_SETTINGS } from '../constants';

export class SettingsService {
    static async fetchSettings(userId: string): Promise<AppSettings | null> {
        const { data, error } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) {
            console.error('Error fetching settings:', error);
            return null;
        }

        if (!data) return null;

        // Map database columns to AppSettings interface
        return {
            model: data.model_preference as ModelType,
            temperature: data.temperature,
            systemInstruction: data.system_instruction || '',
            enableMemory: data.enable_memory,
            enableCrossSessionMemory: data.enable_saved_info ?? true,  // Map enable_saved_info to cross-session memory
            thinkingLevel: data.thinking_level as 'LOW' | 'HIGH',
            safetySettings: data.safety_settings || DEFAULT_SETTINGS.safetySettings,
        };
    }

    static async updateSettings(userId: string, settings: AppSettings): Promise<void> {
        const { error } = await supabase
            .from('user_settings')
            .upsert({
                user_id: userId,
                model_preference: settings.model,
                temperature: settings.temperature,
                system_instruction: settings.systemInstruction,
                enable_memory: settings.enableMemory,
                enable_saved_info: settings.enableCrossSessionMemory,  // Map cross-session memory to enable_saved_info
                thinking_level: settings.thinkingLevel,
                safety_settings: settings.safetySettings,
                updated_at: new Date().toISOString(),
            });

        if (error) {
            console.error('Error updating settings:', error);
            throw error;
        }
    }
}
