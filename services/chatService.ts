import { supabase } from './supabase';
import { ChatSession, Message } from '../types';

export class ChatService {

    // ============================================
    // Chat Sessions
    // ============================================

    static async fetchSessions(userId: string): Promise<ChatSession[]> {
        const { data, error } = await supabase
            .from('chat_sessions')
            .select(`
        id,
        title,
        is_pinned,
        created_at,
        updated_at
      `)
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Error fetching sessions:', error);
            throw error;
        }

        if (!data) return [];

        // Load messages for each session
        // Optimization: potentially load messages only for active session or lazy load
        // For now, mirroring previous behavior: load all messages (might be heavy eventually)
        // A better approach for scalability would be lazy loading messages, but let's stick to the current app structure for now
        const sessionsWithMessages = await Promise.all(
            data.map(async (session) => {
                const messages = await this.fetchMessages(session.id);
                return {
                    id: session.id,
                    title: session.title,
                    isPinned: session.is_pinned,
                    messages,
                    updatedAt: new Date(session.updated_at).getTime(),
                };
            })
        );

        return sessionsWithMessages;
    }

    static async createSession(userId: string, title: string = 'New Chat'): Promise<string> {
        const { data, error } = await supabase
            .from('chat_sessions')
            .insert({ user_id: userId, title })
            .select('id')
            .single();

        if (error) throw error;
        return data.id;
    }

    static async updateSession(sessionId: string, updates: { title?: string; is_pinned?: boolean }) {
        const { error } = await supabase
            .from('chat_sessions')
            .update(updates)
            .eq('id', sessionId);

        if (error) throw error;
    }

    static async deleteSession(sessionId: string) {
        const { error } = await supabase
            .from('chat_sessions')
            .delete()
            .eq('id', sessionId);

        if (error) throw error;
    }

    // ============================================
    // Messages
    // ============================================

    static async fetchMessages(sessionId: string): Promise<Message[]> {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true }); // Chronological order

        if (error) throw error;

        return data.map(msg => ({
            id: msg.id,
            role: msg.role as 'user' | 'model',
            text: msg.content,
            timestamp: new Date(msg.created_at).getTime(),
            attachments: msg.attachments, // JSONB structure should match
            isError: msg.is_error,
        }));
    }

    static async saveMessage(
        sessionId: string,
        role: 'user' | 'model',
        content: string,
        attachments?: any[],
        isError: boolean = false
    ): Promise<string> {
        const { data, error } = await supabase
            .from('messages')
            .insert({
                session_id: sessionId,
                role,
                content,
                attachments,
                is_error: isError,
            })
            .select('id')
            .single();

        if (error) throw error;

        // Update session updated_at
        await supabase
            .from('chat_sessions')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', sessionId);

        return data.id;
    }
}
