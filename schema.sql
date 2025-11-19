CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed')),
  confirmation_token TEXT UNIQUE,
  confirmation_sent_at TEXT NOT NULL -- ISO 8601 UTC
);

CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers (status);
CREATE INDEX IF NOT EXISTS idx_subscribers_token ON subscribers (confirmation_token);
CREATE INDEX IF NOT EXISTS idx_subscribers_confirmation_sent_at ON subscribers (confirmation_sent_at);
