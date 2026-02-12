-- Reminders table for Smart Follow-up System
-- Run this in your Supabase SQL Editor

-- =============================================
-- REMINDERS (Smart Follow-up System)
-- =============================================
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  memo_id UUID REFERENCES memos(id) ON DELETE SET NULL,

  -- Reminder details
  type TEXT NOT NULL CHECK (type IN ('commitment', 'stale_relationship', 'follow_up', 'deadline', 'intro_request')),
  title TEXT NOT NULL,
  context TEXT, -- Additional context about why this reminder exists

  -- Scheduling
  due_date TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'dismissed', 'snoozed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),

  -- Metadata
  source_text TEXT, -- Original text that triggered this reminder (e.g., the commitment made)
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_reminders_user_id ON reminders(user_id);
CREATE INDEX idx_reminders_user_status ON reminders(user_id, status);
CREATE INDEX idx_reminders_user_due_date ON reminders(user_id, due_date) WHERE status = 'pending';
CREATE INDEX idx_reminders_contact_id ON reminders(contact_id);
CREATE INDEX idx_reminders_company_id ON reminders(company_id);
CREATE INDEX idx_reminders_memo_id ON reminders(memo_id);
CREATE INDEX idx_reminders_type ON reminders(user_id, type);

CREATE TRIGGER update_reminders_updated_at
  BEFORE UPDATE ON reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-set completed_at when status changes to completed
CREATE OR REPLACE FUNCTION set_reminder_completed_at()
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

CREATE TRIGGER set_reminder_completed_at_trigger
  BEFORE UPDATE ON reminders
  FOR EACH ROW EXECUTE FUNCTION set_reminder_completed_at();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Reminders: users own their reminders
CREATE POLICY "Users can manage their own reminders"
  ON reminders FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================
-- HELPER FUNCTION: Get pending reminders with related data
-- =============================================
CREATE OR REPLACE FUNCTION get_pending_reminders(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  type TEXT,
  title TEXT,
  context TEXT,
  due_date TIMESTAMPTZ,
  priority TEXT,
  status TEXT,
  contact_id UUID,
  contact_name TEXT,
  company_id UUID,
  company_name TEXT,
  memo_id UUID,
  memo_title TEXT,
  source_text TEXT,
  is_overdue BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.type,
    r.title,
    r.context,
    r.due_date,
    r.priority,
    r.status,
    r.contact_id,
    c.name AS contact_name,
    r.company_id,
    co.name AS company_name,
    r.memo_id,
    m.title AS memo_title,
    r.source_text,
    (r.due_date IS NOT NULL AND r.due_date < NOW()) AS is_overdue,
    r.created_at
  FROM reminders r
  LEFT JOIN contacts c ON r.contact_id = c.id
  LEFT JOIN companies co ON r.company_id = co.id
  LEFT JOIN memos m ON r.memo_id = m.id
  WHERE r.user_id = p_user_id
    AND r.status = 'pending'
    AND (r.snoozed_until IS NULL OR r.snoozed_until <= NOW())
  ORDER BY
    CASE WHEN r.due_date < NOW() THEN 0 ELSE 1 END, -- Overdue first
    r.priority = 'high' DESC,
    r.due_date ASC NULLS LAST,
    r.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_pending_reminders(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_pending_reminders(UUID) TO authenticated;

-- =============================================
-- HELPER FUNCTION: Get stale relationships
-- Returns contacts not seen in X days
-- =============================================
CREATE OR REPLACE FUNCTION get_stale_relationships(
  p_user_id UUID,
  p_days_threshold INT DEFAULT 30
)
RETURNS TABLE (
  contact_id UUID,
  contact_name TEXT,
  email TEXT,
  company_id UUID,
  company_name TEXT,
  last_met_date TIMESTAMPTZ,
  days_since_contact INT,
  meeting_count BIGINT
) AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    c.id AS contact_id,
    c.name AS contact_name,
    c.email,
    c.company_id,
    co.name AS company_name,
    c.last_met_date,
    EXTRACT(DAY FROM NOW() - COALESCE(c.last_met_date, c.created_at))::INT AS days_since_contact,
    (SELECT COUNT(*) FROM contact_memos cm WHERE cm.contact_id = c.id) AS meeting_count
  FROM contacts c
  LEFT JOIN companies co ON c.company_id = co.id
  WHERE c.user_id = p_user_id
    AND (
      c.last_met_date IS NULL
      OR c.last_met_date < NOW() - (p_days_threshold || ' days')::INTERVAL
    )
    -- Only include contacts we've met at least once
    AND EXISTS (SELECT 1 FROM contact_memos cm WHERE cm.contact_id = c.id)
  ORDER BY
    c.last_met_date ASC NULLS FIRST,
    c.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_stale_relationships(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_stale_relationships(UUID, INT) TO authenticated;

-- =============================================
-- Update user stats to include reminders
-- =============================================
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
    'memos_this_week', (SELECT COUNT(*) FROM memos WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '7 days'),
    'total_contacts', (SELECT COUNT(*) FROM contacts WHERE user_id = p_user_id),
    'pending_reminders', (SELECT COUNT(*) FROM reminders WHERE user_id = p_user_id AND status = 'pending'),
    'overdue_reminders', (SELECT COUNT(*) FROM reminders WHERE user_id = p_user_id AND status = 'pending' AND due_date < NOW())
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
