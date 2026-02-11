-- Contacts table for Personal CRM
-- Run this in your Supabase SQL Editor

-- =============================================
-- CONTACTS (Personal CRM)
-- =============================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,

  -- Contact info
  name TEXT NOT NULL,
  email TEXT,
  title TEXT, -- Job title/role
  phone TEXT,
  linkedin_url TEXT,

  -- Relationship tracking
  notes TEXT,
  last_met_date TIMESTAMPTZ,
  met_via TEXT, -- How you met: 'meeting', 'intro', 'conference', etc.

  -- Additional metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_contacts_company_id ON contacts(company_id);
CREATE INDEX idx_contacts_email ON contacts(user_id, email) WHERE email IS NOT NULL;
CREATE INDEX idx_contacts_last_met ON contacts(user_id, last_met_date DESC);

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Contacts: users own their contacts
CREATE POLICY "Users can manage their own contacts"
  ON contacts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================
-- CONTACT-MEMO JUNCTION TABLE
-- Track which contacts were in which meetings
-- =============================================
CREATE TABLE IF NOT EXISTS contact_memos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  memo_id UUID NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contact_id, memo_id)
);

CREATE INDEX idx_contact_memos_contact_id ON contact_memos(contact_id);
CREATE INDEX idx_contact_memos_memo_id ON contact_memos(memo_id);

ALTER TABLE contact_memos ENABLE ROW LEVEL SECURITY;

-- Contact memos: users can access through contacts they own
CREATE POLICY "Users can manage their own contact memos"
  ON contact_memos FOR ALL
  USING (
    contact_id IN (
      SELECT id FROM contacts WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    contact_id IN (
      SELECT id FROM contacts WHERE user_id = auth.uid()
    )
  );

-- =============================================
-- HELPER FUNCTION: Get contacts with meeting info
-- =============================================
CREATE OR REPLACE FUNCTION get_contacts_with_stats(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  title TEXT,
  company_id UUID,
  company_name TEXT,
  notes TEXT,
  last_met_date TIMESTAMPTZ,
  meeting_count BIGINT
) AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.email,
    c.title,
    c.company_id,
    co.name AS company_name,
    c.notes,
    c.last_met_date,
    (SELECT COUNT(*) FROM contact_memos cm WHERE cm.contact_id = c.id) AS meeting_count
  FROM contacts c
  LEFT JOIN companies co ON c.company_id = co.id
  WHERE c.user_id = p_user_id
  ORDER BY c.last_met_date DESC NULLS LAST, c.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_contacts_with_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_contacts_with_stats(UUID) TO authenticated;
