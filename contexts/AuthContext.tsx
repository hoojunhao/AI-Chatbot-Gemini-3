import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signUp: (email: string, password: string, fullName: string) => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    signInWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check current session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);

            // Clean up hash after initial OAuth redirect
            if (session && window.location.hash) {
                setTimeout(() => {
                    window.history.replaceState(null, '', window.location.pathname + window.location.search);
                }, 100);
            }
        });

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);

            // Cleanup hash after Supabase processes OAuth tokens
            if (session) {
                // Small delay to ensure Supabase has finished processing
                setTimeout(() => {
                    if (window.location.hash) {
                        window.history.replaceState(null, '', window.location.pathname + window.location.search);
                    }
                }, 100);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // Clean up hash after Supabase processes OAuth tokens
    useEffect(() => {
        const cleanupHash = () => {
            const hash = window.location.hash;
            const hasTrailingHash = window.location.href.endsWith('#');

            // Remove trailing # or non-auth hashes
            if (hasTrailingHash && !hash) {
                window.history.replaceState(null, '', window.location.href.slice(0, -1));
            } else if (hash && !hash.includes('access_token') && !hash.includes('refresh_token')) {
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        };

        // Run cleanup after a delay to catch leftover hash
        const timeoutId = setTimeout(cleanupHash, 500);

        return () => clearTimeout(timeoutId);
    }, [session]);

    const signUp = async (email: string, password: string, fullName: string) => {
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                },
            },
        });
        if (error) throw error;
    };

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw error;
    };

    const signOut = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    };

    const signInWithGoogle = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin,
            },
        });
        if (error) throw error;
    };

    return (
        <AuthContext.Provider value={{
            user,
            session,
            loading,
            signUp,
            signIn,
            signOut,
            signInWithGoogle,
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};