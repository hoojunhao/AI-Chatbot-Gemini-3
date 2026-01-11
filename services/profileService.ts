import { supabase } from './supabase';

export interface UserProfile {
    id: string;
    email: string;
    user_name: string | null;
    avatar_url: string | null;
    location: string | null;
}

export class ProfileService {
    static async getProfile(userId: string): Promise<UserProfile | null> {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, email, user_name, avatar_url, location')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Error fetching profile:', error);
            return null;
        }

        return data;
    }

    static async updateProfile(userId: string, updates: Partial<Pick<UserProfile, 'user_name' | 'avatar_url' | 'location'>>): Promise<boolean> {
        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', userId);

        if (error) {
            console.error('Error updating profile:', error);
            return false;
        }

        return true;
    }
}
