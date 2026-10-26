-- An agent claims a ticket by setting assignee_id; NULL means unassigned.
-- Existing tickets keep all their data and start unassigned.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assignee_id integer REFERENCES users(id);
