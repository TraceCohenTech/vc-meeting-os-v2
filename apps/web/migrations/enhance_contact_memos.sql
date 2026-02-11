-- Enhance contact_memos table to store per-meeting context
-- This captures what was discussed with each contact in each meeting

-- Add context column to store meeting-specific information
ALTER TABLE contact_memos
ADD COLUMN IF NOT EXISTS context JSONB DEFAULT '{}';

-- Add created_at for tracking when the link was made
ALTER TABLE contact_memos
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_contact_memos_context ON contact_memos USING gin(context);

-- Add relationship_type to contacts table
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS relationship_type TEXT CHECK (relationship_type IN ('founder', 'investor', 'advisor', 'executive', 'operator', 'other'));

-- Add meeting_count for quick access
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS meeting_count INTEGER DEFAULT 0;

-- Add first_met_date
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS first_met_date TIMESTAMPTZ;

-- Function to update meeting count
CREATE OR REPLACE FUNCTION update_contact_meeting_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE contacts
    SET
      meeting_count = (SELECT COUNT(*) FROM contact_memos WHERE contact_id = NEW.contact_id),
      first_met_date = COALESCE(first_met_date, NOW())
    WHERE id = NEW.contact_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE contacts
    SET meeting_count = (SELECT COUNT(*) FROM contact_memos WHERE contact_id = OLD.contact_id)
    WHERE id = OLD.contact_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if not exists
DROP TRIGGER IF EXISTS trigger_update_contact_meeting_count ON contact_memos;
CREATE TRIGGER trigger_update_contact_meeting_count
AFTER INSERT OR DELETE ON contact_memos
FOR EACH ROW EXECUTE FUNCTION update_contact_meeting_count();

-- Update existing contacts with meeting counts
UPDATE contacts c
SET
  meeting_count = (SELECT COUNT(*) FROM contact_memos cm WHERE cm.contact_id = c.id),
  first_met_date = COALESCE(c.first_met_date, c.created_at);

COMMENT ON COLUMN contact_memos.context IS 'Per-meeting context: their_interests, their_concerns, their_asks, key_quotes, follow_up_items, discussion_topics, sentiment, engagement_level';
