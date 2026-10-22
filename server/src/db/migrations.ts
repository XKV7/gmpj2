/** 순서대로 한 번씩만 적용되는 마이그레이션 목록. 이미 배포된 항목은 고치지 말고 새 항목을 추가한다. */
export const migrations: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nickname TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar TEXT,
  status_message TEXT NOT NULL DEFAULT '',
  banner_color TEXT NOT NULL DEFAULT '#F28C6B',
  presence_pref TEXT NOT NULL DEFAULT 'online',
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE relationships (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  other_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('friend','incoming','outgoing','blocked')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, other_id)
);

CREATE TABLE servers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE server_members (
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (server_id, user_id)
);
CREATE INDEX server_members_user ON server_members(user_id);

CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  permissions INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX roles_server ON roles(server_id);

CREATE TABLE member_roles (
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX member_roles_server ON member_roles(server_id, user_id);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE conversations (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('dm','group','text','voice','thread')),
  name TEXT,
  icon TEXT,
  topic TEXT NOT NULL DEFAULT '',
  owner_id INTEGER REFERENCES users(id),
  server_id INTEGER REFERENCES servers(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  parent_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  parent_message_id INTEGER,
  dm_key TEXT UNIQUE,
  last_message_id INTEGER NOT NULL DEFAULT 0,
  last_activity_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX conversations_server ON conversations(server_id);
CREATE INDEX conversations_parent ON conversations(parent_id);

CREATE TABLE conversation_members (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_after_id INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user ON conversation_members(user_id);

CREATE TABLE read_states (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  last_read_id INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  muted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, conversation_id)
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  client_id TEXT,
  reply_to_id INTEGER,
  mentions_everyone INTEGER NOT NULL DEFAULT 0,
  thread_id INTEGER,
  pinned_at INTEGER,
  pinned_by INTEGER,
  edited_at INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX messages_conv ON messages(conversation_id, id);
CREATE INDEX messages_conv_updated ON messages(conversation_id, updated_at);
CREATE UNIQUE INDEX messages_client ON messages(author_id, client_id) WHERE client_id IS NOT NULL;

CREATE TABLE attachments (
  id INTEGER PRIMARY KEY,
  uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX attachments_message ON attachments(message_id);

CREATE TABLE reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE mentions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX mentions_user ON mentions(user_id, message_id);

CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0
);
`,
  },
  {
    version: 2,
    name: 'group invites (consent before joining)',
    sql: `
CREATE TABLE group_invites (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX group_invites_user ON group_invites(user_id);
`,
  },
  {
    version: 3,
    name: 'markdown flag on messages',
    sql: `ALTER TABLE messages ADD COLUMN markdown INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    version: 4,
    name: 'server ban list',
    sql: `
CREATE TABLE server_bans (
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (server_id, user_id)
);
`,
  },
  {
    version: 5,
    name: 'member activity restrictions (timeout)',
    sql: `
CREATE TABLE member_restrictions (
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text INTEGER NOT NULL,
  voice INTEGER NOT NULL,
  until INTEGER,
  reason TEXT NOT NULL DEFAULT '',
  restricted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (server_id, user_id)
);
`,
  },
  {
    version: 6,
    name: 'owner-only (announcement) text channels',
    sql: `ALTER TABLE conversations ADD COLUMN owner_only INTEGER NOT NULL DEFAULT 0;`,
  },
];
