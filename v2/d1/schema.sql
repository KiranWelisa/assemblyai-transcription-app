-- Transcription App v2 - D1 Schema

CREATE TABLE IF NOT EXISTS transcriptions (
  id TEXT PRIMARY KEY,
  assembly_ai_id TEXT UNIQUE NOT NULL,
  user_email TEXT NOT NULL,

  -- Content
  title TEXT,
  file_name TEXT,
  language TEXT,
  duration REAL,
  word_count INTEGER,
  preview TEXT,
  full_text TEXT,

  -- Metadata (JSON arrays)
  utterances TEXT DEFAULT '[]',
  company_names TEXT DEFAULT '[]',
  person_names TEXT DEFAULT '[]',

  -- Status
  status TEXT DEFAULT 'processing', -- processing, completed, error
  meeting_type TEXT,
  is_new INTEGER DEFAULT 1,
  viewed_at TEXT,

  -- Timestamps
  assembly_created_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_transcriptions_user_email ON transcriptions(user_email);
CREATE INDEX IF NOT EXISTS idx_transcriptions_user_status ON transcriptions(user_email, status);
CREATE INDEX IF NOT EXISTS idx_transcriptions_user_new ON transcriptions(user_email, is_new);
CREATE INDEX IF NOT EXISTS idx_transcriptions_created ON transcriptions(created_at DESC);

-- SSE connections tracking (for realtime updates)
CREATE TABLE IF NOT EXISTS sse_connections (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sse_user ON sse_connections(user_email);
