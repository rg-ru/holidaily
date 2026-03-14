CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY,
  public_token_hash TEXT NOT NULL UNIQUE,
  customer_name TEXT,
  customer_email TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT NOT NULL,
  last_admin_reply_at TEXT,
  closed_at TEXT,
  ip_hash TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'admin')),
  sender_name TEXT NOT NULL,
  sender_email TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_status
  ON chat_conversations (status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at
  ON chat_conversations (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created_at
  ON chat_messages (conversation_id, created_at ASC);
