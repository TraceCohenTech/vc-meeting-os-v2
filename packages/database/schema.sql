-- VC Meeting OS v2 - Database Schema
-- Run in Supabase SQL Editor

-- =============================================
-- EXTENSIONS
-- =============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Normalize domain function (extract and lowercase domain from URL)
CREATE OR REPLACE FUNCTION normalize_domain(url TEXT)
RETURNS TEXT AS $$
DECLARE
  domain TEXT;
BEGIN
  IF url IS NULL OR url = '' THEN
    RETURN NULL;
  END IF;

  -- Remove protocol
  domain := REGEXP_REPLACE(url, '^https?://', '', 'i');
  -- Remove www.
  domain := REGEXP_REPLACE(domain, '^www\.', '', 'i');
  -- Remove path and everything after
  domain := SPLIT_PART(domain, '/', 1);
  -- Remove port
  domain := SPLIT_PART(domain, ':', 1);
  -- Lowercase
  domain := LOWER(TRIM(domain));

  IF domain = '' THEN
    RETURN NULL;
  END IF;

  RETURN domain;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================
-- PROFILES (extends auth.users)
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT,
  settings JSONB DEFAULT '{}',
  notification_email TEXT,
  digest_frequency TEXT DEFAULT 'weekly' CHECK (digest_frequency IN ('never', 'daily', 'weekly', 'monthly')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- INTEGRATIONS (Fireflies, Google Drive, etc.)
-- =============================================
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'fireflies', 'google_drive', 'zoom', 'otter'
  credentials JSONB DEFAULT '{}', -- API keys, tokens (encrypted at app level)
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  last_sync_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE INDEX idx_integrations_user_id ON integrations(user_id);

CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- FOLDERS (for organizing memos)
-- =============================================
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  icon TEXT,
  template JSONB DEFAULT '{}', -- Memo template configuration
  is_default BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_folders_user_id ON folders(user_id);

CREATE TRIGGER update_folders_updated_at
  BEFORE UPDATE ON folders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- COMPANIES
-- =============================================
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT,
  domain TEXT, -- Extracted from website
  normalized_domain TEXT, -- Lowercase, no www, for deduplication
  stage TEXT CHECK (stage IN ('idea', 'pre-seed', 'seed', 'series-a', 'series-b', 'series-c', 'growth', 'public')),
  status TEXT DEFAULT 'tracking' CHECK (status IN ('tracking', 'actively-reviewing', 'due-diligence', 'passed', 'invested', 'exited')),
  industry TEXT,
  founders JSONB DEFAULT '[]',
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_companies_user_id ON companies(user_id);
CREATE INDEX idx_companies_status ON companies(user_id, status);
CREATE INDEX idx_companies_normalized_domain ON companies(user_id, normalized_domain) WHERE normalized_domain IS NOT NULL;

-- Unique constraint on normalized_domain per user (when present)
CREATE UNIQUE INDEX idx_companies_unique_domain
  ON companies(user_id, normalized_domain)
  WHERE normalized_domain IS NOT NULL;

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-populate domain fields from website
CREATE OR REPLACE FUNCTION set_company_domain()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.website IS NOT NULL AND NEW.website != '' THEN
    NEW.domain := SPLIT_PART(REGEXP_REPLACE(REGEXP_REPLACE(NEW.website, '^https?://', '', 'i'), '^www\.', '', 'i'), '/', 1);
    NEW.normalized_domain := normalize_domain(NEW.website);
  ELSE
    NEW.domain := NULL;
    NEW.normalized_domain := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_company_domain_trigger
  BEFORE INSERT OR UPDATE OF website ON companies
  FOR EACH ROW EXECUTE FUNCTION set_company_domain();

-- =============================================
-- MEMOS (core entity)
-- =============================================
CREATE TABLE IF NOT EXISTS memos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,

  -- Source info
  source TEXT NOT NULL DEFAULT 'manual', -- 'fireflies', 'zoom', 'otter', 'manual', 'upload'
  source_id TEXT, -- External transcript ID

  -- Content
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT, -- AI-generated short summary

  -- Metadata
  meeting_date TIMESTAMPTZ,
  duration_minutes INT,
  participants TEXT[],
  tags TEXT[] DEFAULT '{}',

  -- External links
  drive_file_id TEXT,
  drive_url TEXT,

  -- Additional metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full-text search vector (generated column)
ALTER TABLE memos ADD COLUMN IF NOT EXISTS fts TSVECTOR
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(content, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(summary, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'D')
  ) STORED;

CREATE INDEX idx_memos_user_id ON memos(user_id);
CREATE INDEX idx_memos_user_meeting_date ON memos(user_id, meeting_date DESC);
CREATE INDEX idx_memos_company_id ON memos(company_id);
CREATE INDEX idx_memos_folder_id ON memos(folder_id);
CREATE INDEX idx_memos_source_id ON memos(user_id, source, source_id);
CREATE INDEX idx_memos_fts ON memos USING gin(fts);

-- Ensure one memo per external source_id per user (when present)
CREATE UNIQUE INDEX idx_memos_unique_source
  ON memos(user_id, source, source_id)
  WHERE source_id IS NOT NULL;

CREATE TRIGGER update_memos_updated_at
  BEFORE UPDATE ON memos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- TASKS
-- =============================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memo_id UUID REFERENCES memos(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX idx_tasks_due_date ON tasks(user_id, due_date) WHERE status = 'pending';
CREATE INDEX idx_tasks_memo_id ON tasks(memo_id);
CREATE INDEX idx_tasks_company_id ON tasks(company_id);

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-set completed_at when status changes to completed
CREATE OR REPLACE FUNCTION set_task_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    NEW.completed_at := NOW();
  ELSIF NEW.status != 'completed' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_task_completed_at_trigger
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_task_completed_at();

-- =============================================
-- CONVERSATIONS (AI Chat)
-- =============================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- MESSAGES (Chat messages)
-- =============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  sources JSONB DEFAULT '[]', -- Array of memo IDs used as context
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);

-- =============================================
-- MEMO REVISIONS (history of memo updates)
-- =============================================
CREATE TABLE IF NOT EXISTS memo_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memo_id UUID NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  meeting_date TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memo_revisions_memo_id ON memo_revisions(memo_id);
CREATE INDEX idx_memo_revisions_user_id ON memo_revisions(user_id);

-- =============================================
-- PROCESSING JOBS (for realtime progress)
-- =============================================
CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source identification
  source TEXT NOT NULL, -- 'fireflies', 'zoom', 'manual'
  source_id TEXT, -- External ID for idempotency

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  current_step TEXT,
  progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

  -- Results
  result JSONB DEFAULT '{}', -- Contains memo_id on success
  error TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_processing_jobs_user_id ON processing_jobs(user_id);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(user_id, status);
CREATE INDEX idx_processing_jobs_source ON processing_jobs(user_id, source, source_id);

CREATE TRIGGER update_processing_jobs_updated_at
  BEFORE UPDATE ON processing_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable REPLICA IDENTITY for realtime
ALTER TABLE processing_jobs REPLICA IDENTITY FULL;

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE memo_revisions ENABLE ROW LEVEL SECURITY;

-- Profiles: users own their profile
CREATE POLICY "Users can manage their own profile"
  ON profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Integrations: users own their integrations
CREATE POLICY "Users can manage their own integrations"
  ON integrations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Folders: users own their folders
CREATE POLICY "Users can manage their own folders"
  ON folders FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Companies: users own their companies
CREATE POLICY "Users can manage their own companies"
  ON companies FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Memos: users own their memos
CREATE POLICY "Users can manage their own memos"
  ON memos FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Tasks: users own their tasks
CREATE POLICY "Users can manage their own tasks"
  ON tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Conversations: users own their conversations
CREATE POLICY "Users can manage their own conversations"
  ON conversations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Messages: users can access messages in their conversations
CREATE POLICY "Users can manage messages in their conversations"
  ON messages FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = auth.uid()
    )
  );

-- Processing jobs: users own their jobs
CREATE POLICY "Users can manage their own processing jobs"
  ON processing_jobs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Memo revisions: users own their revisions
CREATE POLICY "Users can manage their own memo revisions"
  ON memo_revisions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================
-- REALTIME PUBLICATION
-- =============================================

-- Add processing_jobs to realtime publication for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE processing_jobs;

-- =============================================
-- HELPER FUNCTIONS FOR QUERIES
-- =============================================

-- Search memos with FTS and ranking
CREATE OR REPLACE FUNCTION search_memos(
  search_query TEXT,
  p_user_id UUID,
  result_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  summary TEXT,
  content TEXT,
  meeting_date TIMESTAMPTZ,
  company_id UUID,
  folder_id UUID,
  rank REAL
) AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.title,
    m.summary,
    m.content,
    m.meeting_date,
    m.company_id,
    m.folder_id,
    ts_rank(m.fts, websearch_to_tsquery('english', search_query)) AS rank
  FROM memos m
  WHERE m.user_id = p_user_id
    AND m.fts @@ websearch_to_tsquery('english', search_query)
  ORDER BY rank DESC, m.meeting_date DESC NULLS LAST
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Get tasks needing attention (overdue + due soon)
CREATE OR REPLACE FUNCTION get_attention_tasks(
  p_user_id UUID,
  hours_ahead INT DEFAULT 48
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  due_date TIMESTAMPTZ,
  priority TEXT,
  status TEXT,
  memo_id UUID,
  company_id UUID,
  is_overdue BOOLEAN
) AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.title,
    t.description,
    t.due_date,
    t.priority,
    t.status,
    t.memo_id,
    t.company_id,
    t.due_date < NOW() AS is_overdue
  FROM tasks t
  WHERE t.user_id = p_user_id
    AND t.status = 'pending'
    AND t.due_date IS NOT NULL
    AND t.due_date < NOW() + (hours_ahead || ' hours')::INTERVAL
  ORDER BY t.due_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Get user stats for dashboard
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'total_memos', (SELECT COUNT(*) FROM memos WHERE user_id = p_user_id),
    'total_companies', (SELECT COUNT(*) FROM companies WHERE user_id = p_user_id),
    'total_tasks', (SELECT COUNT(*) FROM tasks WHERE user_id = p_user_id),
    'pending_tasks', (SELECT COUNT(*) FROM tasks WHERE user_id = p_user_id AND status = 'pending'),
    'overdue_tasks', (SELECT COUNT(*) FROM tasks WHERE user_id = p_user_id AND status = 'pending' AND due_date < NOW()),
    'active_deals', (SELECT COUNT(*) FROM companies WHERE user_id = p_user_id AND status IN ('actively-reviewing', 'due-diligence')),
    'memos_this_week', (SELECT COUNT(*) FROM memos WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '7 days')
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Lock down function execute permissions
REVOKE ALL ON FUNCTION search_memos(TEXT, UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_attention_tasks(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_user_stats(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION search_memos(TEXT, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_attention_tasks(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_stats(UUID) TO authenticated;
