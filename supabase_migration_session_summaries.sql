-- ============================================
-- Migration: Add session_summaries table
-- Purpose: Store conversation summaries for context management
-- ============================================

-- Create the session_summaries table
CREATE TABLE IF NOT EXISTS session_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  messages_summarized_count INTEGER NOT NULL DEFAULT 0,
  last_message_id UUID REFERENCES messages(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Each session can only have one summary
  UNIQUE(session_id)
);

-- Create index for fast lookups by session
CREATE INDEX IF NOT EXISTS idx_session_summaries_session_id
ON session_summaries(session_id);

-- ============================================
-- Trigger: Auto-update updated_at timestamp
-- ============================================

CREATE OR REPLACE FUNCTION update_session_summary_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_summaries_updated_at
  BEFORE UPDATE ON session_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_session_summary_timestamp();

-- ============================================
-- Row Level Security (RLS) Policies
-- ============================================

-- Enable RLS on the table
ALTER TABLE session_summaries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own summaries
CREATE POLICY "Users can view own summaries"
ON session_summaries FOR SELECT
USING (
  session_id IN (
    SELECT id FROM chat_sessions WHERE user_id = auth.uid()
  )
);

-- Policy: Users can only insert summaries for their own sessions
CREATE POLICY "Users can create own summaries"
ON session_summaries FOR INSERT
WITH CHECK (
  session_id IN (
    SELECT id FROM chat_sessions WHERE user_id = auth.uid()
  )
);

-- Policy: Users can only update their own summaries
CREATE POLICY "Users can update own summaries"
ON session_summaries FOR UPDATE
USING (
  session_id IN (
    SELECT id FROM chat_sessions WHERE user_id = auth.uid()
  )
);

-- Policy: Users can only delete their own summaries
CREATE POLICY "Users can delete own summaries"
ON session_summaries FOR DELETE
USING (
  session_id IN (
    SELECT id FROM chat_sessions WHERE user_id = auth.uid()
  )
);

-- ============================================
-- Verification queries (optional - comment out after testing)
-- ============================================

-- Uncomment these to verify the migration:
-- SELECT * FROM session_summaries;
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'session_summaries';
