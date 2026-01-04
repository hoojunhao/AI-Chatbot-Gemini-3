# Gemini Clone - Memory & Authentication Implementation Plan

## 專案概述

將現有的 Gemini Clone 前端應用升級為全功能應用，包含：
- ✅ 使用者認證系統（Supabase Auth）
- ✅ 資料庫持久化（Supabase Database）
- ✅ Saved Info 功能（明確記憶）
- ✅ Memory 功能（對話歷史記憶）
- ✅ RAG 實作（使用 gemini-embedding-001）

---

## 技術堆疊

### 前端（維持現有）
- React 19
- TypeScript
- Tailwind CSS
- Lucide React

### 後端服務
- **Supabase**
  - PostgreSQL Database（含 pgvector extension）
  - Authentication（Email/Password + OAuth）
  - Row Level Security（RLS）
  - Real-time subscriptions
  - Edge Functions（可選）

### AI 服務
- Google Gemini API（對話生成）
- **gemini-embedding-001**（向量嵌入）

---

## 實施階段

### 📦 階段 1：Supabase 基礎設施建置（1-2 天）

#### 1.1 建立 Supabase 專案
```bash
# 1. 前往 https://supabase.com 建立新專案
# 2. 記錄以下資訊：
#    - Project URL
#    - anon (public) key
#    - service_role key（僅後端使用）
```

#### 1.2 安裝依賴
```bash
npm install @supabase/supabase-js
npm install @supabase/auth-helpers-react  # 如果需要 React hooks
```

#### 1.3 環境變數設定
建立 `.env.local` 檔案：
```env
# Supabase
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key

# Google Gemini
VITE_GEMINI_API_KEY=your_gemini_api_key
```

#### 1.4 初始化 Supabase Client
建立 `services/supabase.ts`：
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type definitions
export type Database = {
  public: {
    Tables: {
      profiles: { /* ... */ };
      saved_info: { /* ... */ };
      chat_sessions: { /* ... */ };
      messages: { /* ... */ };
      conversation_memories: { /* ... */ };
    };
  };
};
```

---

### 🗄️ 階段 2：資料庫 Schema 設計（1 天）

#### 2.1 啟用 pgvector Extension

在 Supabase SQL Editor 執行：
```sql
-- 啟用 pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
```

#### 2.2 建立資料表

```sql
-- ============================================
-- 1. 使用者個人資料表
-- ============================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- ============================================
-- 2. Saved Info（明確記憶）
-- ============================================
CREATE TABLE saved_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    category TEXT,  -- 'work', 'personal', 'preferences', etc.
    embedding vector(3072),  -- gemini-embedding-001 的維度
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_saved_info_user ON saved_info(user_id);
CREATE INDEX idx_saved_info_embedding ON saved_info USING ivfflat (embedding vector_cosine_ops);

-- RLS
ALTER TABLE saved_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own saved info"
    ON saved_info FOR ALL
    USING (auth.uid() = user_id);

-- ============================================
-- 3. 對話 Sessions
-- ============================================
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Chat',
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

-- RLS
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sessions"
    ON chat_sessions FOR ALL
    USING (auth.uid() = user_id);

-- ============================================
-- 4. 訊息記錄
-- ============================================
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'model')),
    content TEXT NOT NULL,
    attachments JSONB,  -- 儲存附件資訊
    is_error BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_created ON messages(created_at);

-- RLS (透過 session 的 user_id 判斷)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages"
    ON messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM chat_sessions
            WHERE chat_sessions.id = messages.session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own messages"
    ON messages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM chat_sessions
            WHERE chat_sessions.id = messages.session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );

-- ============================================
-- 5. 對話記憶（從對話中自動提取）
-- ============================================
CREATE TABLE conversation_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
    summary TEXT NOT NULL,
    topics TEXT[],  -- 主題標籤
    importance_score FLOAT DEFAULT 0.5 CHECK (importance_score >= 0 AND importance_score <= 1),
    embedding vector(3072),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_conv_memories_user ON conversation_memories(user_id);
CREATE INDEX idx_conv_memories_topics ON conversation_memories USING GIN(topics);
CREATE INDEX idx_conv_memories_embedding ON conversation_memories USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_conv_memories_importance ON conversation_memories(importance_score DESC);

-- RLS
ALTER TABLE conversation_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own memories"
    ON conversation_memories FOR ALL
    USING (auth.uid() = user_id);

-- ============================================
-- 6. 使用者設定
-- ============================================
CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    enable_memory BOOLEAN DEFAULT TRUE,
    enable_saved_info BOOLEAN DEFAULT TRUE,
    model_preference TEXT DEFAULT 'gemini-3-flash',
    temperature FLOAT DEFAULT 1.0,
    system_instruction TEXT,
    safety_settings JSONB DEFAULT '{
        "sexuallyExplicit": "BLOCK_MEDIUM_AND_ABOVE",
        "hateSpeech": "BLOCK_MEDIUM_AND_ABOVE",
        "harassment": "BLOCK_MEDIUM_AND_ABOVE",
        "dangerousContent": "BLOCK_MEDIUM_AND_ABOVE"
    }'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own settings"
    ON user_settings FOR ALL
    USING (auth.uid() = user_id);

-- ============================================
-- 7. 自動更新 updated_at 的 Trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saved_info_updated_at BEFORE UPDATE ON saved_info
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 8. 新使用者自動建立 profile 和 settings
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- 建立 profile
    INSERT INTO profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name'
    );
    
    -- 建立預設設定
    INSERT INTO user_settings (user_id)
    VALUES (NEW.id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

#### 2.3 建立資料庫 Functions（輔助函數）

```sql
-- ============================================
-- 相似度搜尋函數（用於 RAG）
-- ============================================

-- 搜尋相似的 Saved Info
CREATE OR REPLACE FUNCTION search_saved_info(
    query_embedding vector(3072),
    user_uuid UUID,
    match_threshold FLOAT DEFAULT 0.5,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    category TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        saved_info.id,
        saved_info.content,
        saved_info.category,
        1 - (saved_info.embedding <=> query_embedding) AS similarity
    FROM saved_info
    WHERE 
        saved_info.user_id = user_uuid
        AND 1 - (saved_info.embedding <=> query_embedding) > match_threshold
    ORDER BY saved_info.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 搜尋相似的對話記憶
CREATE OR REPLACE FUNCTION search_conversation_memories(
    query_embedding vector(3072),
    user_uuid UUID,
    match_threshold FLOAT DEFAULT 0.5,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    summary TEXT,
    topics TEXT[],
    importance_score FLOAT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cm.id,
        cm.summary,
        cm.topics,
        cm.importance_score,
        1 - (cm.embedding <=> query_embedding) AS similarity
    FROM conversation_memories cm
    WHERE 
        cm.user_id = user_uuid
        AND 1 - (cm.embedding <=> query_embedding) > match_threshold
    ORDER BY 
        (1 - (cm.embedding <=> query_embedding)) * cm.importance_score DESC
    LIMIT match_count;
END;
$$;
```

---

### 🔐 階段 3：使用者認證實作（2-3 天）

#### 3.1 建立 Auth Context

建立 `contexts/AuthContext.tsx`：
```typescript
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
    // 檢查當前 session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 監聽 auth 狀態變化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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
        redirectTo: `${window.location.origin}/auth/callback`,
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
```

#### 3.2 建立登入/註冊頁面

建立 `components/Auth.tsx`：
```typescript
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, User as UserIcon, Sparkles } from 'lucide-react';

const Auth: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signIn, signUp, signInWithGoogle } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password, fullName);
        alert('註冊成功！請檢查您的電子郵件以驗證帳號。');
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      setError(err.message || '發生錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4">
      <div className="max-w-md w-full">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-2xl mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Gemini Clone
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {isSignUp ? '建立新帳號' : '登入您的帳號'}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  姓名
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="您的姓名"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                電子郵件
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  placeholder="your@email.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                密碼
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '處理中...' : (isSignUp ? '註冊' : '登入')}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">或</span>
            </div>
          </div>

          {/* Google Sign In */}
          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 border-2 border-gray-300 dark:border-gray-600 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="text-gray-700 dark:text-gray-300 font-medium">使用 Google 登入</span>
          </button>

          {/* Toggle Sign Up/In */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
            >
              {isSignUp ? '已有帳號？立即登入' : '還沒有帳號？立即註冊'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
```

#### 3.3 修改 `index.tsx` 加入 AuthProvider

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';
import Auth from './components/Auth';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const AppWithAuth = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return user ? <App /> : <Auth />;
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <AppWithAuth />
    </AuthProvider>
  </React.StrictMode>
);
```

---

### 💾 階段 4：資料持久化 - Chat Sessions（2 天）

#### 4.1 建立 Database Service

建立 `services/databaseService.ts`：
```typescript
import { supabase } from './supabase';
import { ChatSession, Message } from '../types';

export class DatabaseService {
  
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

    if (error) throw error;

    // 為每個 session 載入訊息
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
      .order('created_at', { ascending: true });

    if (error) throw error;

    return data.map(msg => ({
      id: msg.id,
      role: msg.role as 'user' | 'model',
      text: msg.content,
      timestamp: new Date(msg.created_at).getTime(),
      attachments: msg.attachments,
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

    // 更新 session 的 updated_at
    await supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    return data.id;
  }
}
```

#### 4.2 修改 App.tsx 使用資料庫

在 `components/App.tsx` 中：
```typescript
import { useAuth } from '../contexts/AuthContext';
import { DatabaseService } from '../services/databaseService';

function App() {
  const { user, signOut } = useAuth();
  
  // 載入使用者的 sessions
  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user]);

  const loadSessions = async () => {
    try {
      const sessions = await DatabaseService.fetchSessions(user!.id);
      setSessions(sessions);
      if (sessions.length > 0) {
        setCurrentSessionId(sessions[0].id);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  };

  const createNewSession = async () => {
    try {
      const sessionId = await DatabaseService.createSession(user!.id);
      const newSession: ChatSession = {
        id: sessionId,
        title: 'New Chat',
        messages: [],
        updatedAt: Date.now(),
        isPinned: false
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(sessionId);
      // ...
    } catch (error) {
      console.error('Error creating session:', error);
    }
  };

  // 修改 handleSendMessage 儲存到資料庫
  const handleSendMessage = async () => {
    // ... existing code ...
    
    try {
      // 儲存使用者訊息
      await DatabaseService.saveMessage(
        activeSessionId,
        'user',
        userMessage.text,
        userMessage.attachments
      );

      // ... API call ...

      // 儲存 AI 回應
      await DatabaseService.saveMessage(
        activeSessionId,
        'model',
        fullResponse
      );
      
    } catch (error) {
      // ...
    }
  };

  // ... rest of the component
}
```

---

### 🧠 階段 5：Saved Info 功能（2-3 天）

#### 5.1 建立 Embedding Service

建立 `services/embeddingService.ts`：
```typescript
import { GoogleGenerativeAI } from '@google/genai';

export class EmbeddingService {
  private client: GoogleGenerativeAI;
  private model = 'gemini-embedding-001';

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async getEmbedding(text: string): Promise<number[]> {
    const model = this.client.getGenerativeModel({ model: this.model });
    
    const result = await model.embedContent({
      content: { parts: [{ text }] }
    });

    return result.embedding.values;
  }

  async getEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.getEmbedding(text)));
  }

  // 計算餘弦相似度
  static cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }
}
```

#### 5.2 建立 Memory Service

建立 `services/memoryService.ts`：
```typescript
import { supabase } from './supabase';
import { EmbeddingService } from './embeddingService';

export interface SavedInfo {
  id: string;
  content: string;
  category?: string;
  createdAt: number;
}

export class MemoryService {
  private embeddingService: EmbeddingService;

  constructor(geminiApiKey: string) {
    this.embeddingService = new EmbeddingService(geminiApiKey);
  }

  // ============================================
  // Saved Info Management
  // ============================================

  async addSavedInfo(userId: string, content: string, category?: string): Promise<void> {
    // 生成 embedding
    const embedding = await this.embeddingService.getEmbedding(content);

    const { error } = await supabase
      .from('saved_info')
      .insert({
        user_id: userId,
        content,
        category,
        embedding,
      });

    if (error) throw error;
  }

  async getSavedInfo(userId: string): Promise<SavedInfo[]> {
    const { data, error } = await supabase
      .from('saved_info')
      .select('id, content, category, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data.map(item => ({
      id: item.id,
      content: item.content,
      category: item.category,
      createdAt: new Date(item.created_at).getTime(),
    }));
  }

  async updateSavedInfo(infoId: string, content: string): Promise<void> {
    // 重新生成 embedding
    const embedding = await this.embeddingService.getEmbedding(content);

    const { error } = await supabase
      .from('saved_info')
      .update({ content, embedding })
      .eq('id', infoId);

    if (error) throw error;
  }

  async deleteSavedInfo(infoId: string): Promise<void> {
    const { error } = await supabase
      .from('saved_info')
      .delete()
      .eq('id', infoId);

    if (error) throw error;
  }

  // ============================================
  // Search Saved Info (RAG)
  // ============================================

  async searchSavedInfo(
    userId: string,
    query: string,
    threshold: number = 0.5,
    limit: number = 5
  ): Promise<Array<SavedInfo & { similarity: number }>> {
    // 生成查詢的 embedding
    const queryEmbedding = await this.embeddingService.getEmbedding(query);

    const { data, error } = await supabase.rpc('search_saved_info', {
      query_embedding: queryEmbedding,
      user_uuid: userId,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) throw error;

    return data.map((item: any) => ({
      id: item.id,
      content: item.content,
      category: item.category,
      similarity: item.similarity,
      createdAt: 0, // RPC 不回傳，如需要可修改
    }));
  }

  // ============================================
  // Conversation Memories (自動提取)
  // ============================================

  async extractMemoriesFromConversation(
    userId: string,
    sessionId: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<void> {
    // 這裡使用 Gemini 來分析對話並提取記憶
    // 實作邏輯類似前面討論的
    
    if (messages.length < 4) return; // 太短的對話不提取

    // TODO: 呼叫 Gemini 分析對話
    // TODO: 儲存提取的記憶到 conversation_memories 表
  }

  async searchConversationMemories(
    userId: string,
    query: string,
    threshold: number = 0.5,
    limit: number = 5
  ) {
    const queryEmbedding = await this.embeddingService.getEmbedding(query);

    const { data, error } = await supabase.rpc('search_conversation_memories', {
      query_embedding: queryEmbedding,
      user_uuid: userId,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) throw error;
    return data;
  }
}
```

#### 5.3 建立 Saved Info 管理 UI

建立 `components/SavedInfoPanel.tsx`：
```typescript
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, X, Check } from 'lucide-react';
import { MemoryService, SavedInfo } from '../services/memoryService';
import { useAuth } from '../contexts/AuthContext';

interface SavedInfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
  memoryService: MemoryService;
}

const SavedInfoPanel: React.FC<SavedInfoPanelProps> = ({ isOpen, onClose, memoryService }) => {
  const { user } = useAuth();
  const [savedInfos, setSavedInfos] = useState<SavedInfo[]>([]);
  const [newInfo, setNewInfo] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      loadSavedInfos();
    }
  }, [isOpen, user]);

  const loadSavedInfos = async () => {
    try {
      const infos = await memoryService.getSavedInfo(user!.id);
      setSavedInfos(infos);
    } catch (error) {
      console.error('Error loading saved info:', error);
    }
  };

  const handleAdd = async () => {
    if (!newInfo.trim()) return;
    setLoading(true);
    try {
      await memoryService.addSavedInfo(user!.id, newInfo.trim());
      setNewInfo('');
      await loadSavedInfos();
    } catch (error) {
      console.error('Error adding saved info:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editContent.trim()) return;
    setLoading(true);
    try {
      await memoryService.updateSavedInfo(id, editContent.trim());
      setEditingId(null);
      await loadSavedInfos();
    } catch (error) {
      console.error('Error updating saved info:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這條記憶嗎？')) return;
    setLoading(true);
    try {
      await memoryService.deleteSavedInfo(id);
      await loadSavedInfos();
    } catch (error) {
      console.error('Error deleting saved info:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#1e1f20] rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-[#333]">
          <h2 className="text-xl font-medium text-gray-800 dark:text-gray-100">Saved Info</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-[#333] rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Add New */}
        <div className="p-6 border-b border-gray-100 dark:border-[#333]">
          <div className="flex gap-2">
            <input
              type="text"
              value={newInfo}
              onChange={(e) => setNewInfo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="例如：我是素食者、我在 Google 工作..."
              className="flex-1 px-4 py-2 rounded-xl bg-gray-50 dark:bg-[#2a2b2d] border border-gray-200 dark:border-[#444] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleAdd}
              disabled={loading || !newInfo.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6">
          {savedInfos.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p>還沒有任何記憶</p>
              <p className="text-sm mt-2">新增一些關於你的資訊，讓 Gemini 更了解你！</p>
            </div>
          ) : (
            <div className="space-y-3">
              {savedInfos.map((info) => (
                <div
                  key={info.id}
                  className="bg-gray-50 dark:bg-[#2a2b2d] rounded-xl p-4 group hover:bg-gray-100 dark:hover:bg-[#333] transition-colors"
                >
                  {editingId === info.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdate(info.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-[#1e1f20] border border-gray-300 dark:border-[#444] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleUpdate(info.id)}
                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <p className="text-gray-700 dark:text-gray-200 text-sm flex-1">{info.content}</p>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                        <button
                          onClick={() => {
                            setEditingId(info.id);
                            setEditContent(info.content);
                          }}
                          className="p-1.5 hover:bg-gray-200 dark:hover:bg-[#444] rounded-lg"
                        >
                          <Edit2 className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => handleDelete(info.id)}
                          className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SavedInfoPanel;
```

---

### 🎯 階段 6：RAG 整合（2-3 天）

#### 6.1 修改 geminiService.ts 整合記憶

```typescript
import { GoogleGenerativeAI } from '@google/genai';
import { MemoryService } from './memoryService';

export async function generateResponseWithMemory(
  apiKey: string,
  userId: string,
  memoryService: MemoryService,
  settings: AppSettings,
  history: Message[],
  userMessage: string,
  attachments?: any[]
) {
  // 1. 搜尋相關的 Saved Info
  const relevantSavedInfo = await memoryService.searchSavedInfo(
    userId,
    userMessage,
    0.5, // threshold
    5    // top 5
  );

  // 2. 搜尋相關的對話記憶
  const relevantMemories = await memoryService.searchConversationMemories(
    userId,
    userMessage,
    0.5,
    5
  );

  // 3. 建構增強的 System Prompt
  let enhancedSystemPrompt = settings.systemInstruction || '';

  if (relevantSavedInfo.length > 0) {
    enhancedSystemPrompt += '\n\n## User Information:\n';
    relevantSavedInfo.forEach(info => {
      enhancedSystemPrompt += `- ${info.content}\n`;
    });
  }

  if (relevantMemories.length > 0) {
    enhancedSystemPrompt += '\n\n## Context from Past Conversations:\n';
    relevantMemories.forEach(mem => {
      enhancedSystemPrompt += `- ${mem.summary}\n`;
    });
  }

  // 4. 呼叫 Gemini API
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: settings.model,
    systemInstruction: enhancedSystemPrompt,
    generationConfig: {
      temperature: settings.temperature,
    },
    safetySettings: [
      // ... safety settings
    ],
  });

  // ... rest of the streaming logic
}
```

---

### 📊 階段 7：監控與優化（持續進行）

#### 7.1 效能監控

```typescript
// 在關鍵操作加入時間追蹤
const startTime = performance.now();

// ... operation ...

const endTime = performance.now();
console.log(`Operation took ${endTime - startTime}ms`);

// 特別監控：
// - Embedding 生成時間
// - 向量搜尋時間
// - API 回應時間
```

#### 7.2 成本追蹤

建立一個簡單的使用統計表：
```sql
CREATE TABLE usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    operation_type TEXT, -- 'embedding', 'chat', 'search'
    tokens_used INT,
    cost_usd DECIMAL(10, 6),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 📋 檢查清單

### 功能完成度
- [ ] Supabase 專案建立
- [ ] 資料庫 Schema 部署
- [ ] 使用者註冊/登入
- [ ] OAuth (Google) 登入
- [ ] Chat Sessions 持久化
- [ ] Messages 持久化
- [ ] Saved Info CRUD
- [ ] Embedding 生成
- [ ] 向量搜尋（RAG）
- [ ] Conversation Memory 提取
- [ ] UI 整合
- [ ] 測試所有功能

### 安全性
- [ ] RLS 政策已啟用
- [ ] API Keys 使用環境變數
- [ ] SQL Injection 防護
- [ ] XSS 防護
- [ ] CORS 設定
- [ ] Rate Limiting（考慮使用 Supabase Edge Functions）

### 效能
- [ ] 向量索引已建立
- [ ] 資料庫查詢已優化
- [ ] 前端狀態管理優化
- [ ] 懶載入（Lazy Loading）
- [ ] 快取策略

---

## 🚀 部署建議

### Vercel 部署（推薦）
```bash
# 安裝 Vercel CLI
npm i -g vercel

# 部署
vercel

# 設定環境變數（在 Vercel Dashboard）
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GEMINI_API_KEY=...
```

### 環境變數管理
- 開發環境：`.env.local`
- 測試環境：Vercel Preview
- 正式環境：Vercel Production

---

## 💰 成本估算

### Supabase
- Free Tier：500MB 資料庫、50K 月活躍用戶
- Pro Plan：$25/月（8GB 資料庫、100K MAU）

### Google Gemini API
- gemini-3-flash：免費（有限制）
- gemini-embedding-001：~$0.025/1M 字元

### 預估月成本（1000 用戶）
- Supabase：$0 - $25
- Gemini Embeddings：約 $5 - $10
- 總計：**$5 - $35/月**

---

## 📚 參考資源

- [Supabase Docs](https://supabase.com/docs)
- [pgvector Guide](https://github.com/pgvector/pgvector)
- [Gemini API Docs](https://ai.google.dev/docs)
- [React 19 Docs](https://react.dev)

---

## 🎯 下一步

完成以上階段後，可以考慮：
1. **多模態支援**：圖片、音訊記憶
2. **記憶分類**：自動標籤、分組
3. **記憶時效性**：設定過期時間
4. **分享功能**：分享對話或記憶
5. **團隊協作**：多人共享記憶庫
6. **匯出功能**：匯出所有資料
7. **進階分析**：記憶使用統計

---

**預計總開發時間：10-15 天**

需要任何階段的詳細程式碼或協助嗎？祝開發順利！🚀
