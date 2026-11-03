import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.env.DB_FILE || join(here, '..', 'data', 'counter-talk.db');
mkdirSync(dirname(file), { recursive: true });

export const db = new DatabaseSync(file);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  goals TEXT NOT NULL DEFAULT '["food"]',
  daily_minutes INTEGER NOT NULL DEFAULT 5,
  active_path TEXT NOT NULL DEFAULT 'food',
  active_goal TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  day TEXT,
  complete INTEGER NOT NULL DEFAULT 0,
  log TEXT NOT NULL DEFAULT '[]',
  checklist TEXT NOT NULL DEFAULT '{}',
  turns INTEGER NOT NULL DEFAULT 0,
  hints_used INTEGER NOT NULL DEFAULT 0,
  report TEXT
);
CREATE INDEX IF NOT EXISTS attempts_user ON attempts(user_id, finished_at);

CREATE TABLE IF NOT EXISTS notebook (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,            -- expression | practice
  key TEXT NOT NULL,             -- normalized title, for de-duplication
  title TEXT NOT NULL,
  sub TEXT NOT NULL DEFAULT '',
  say TEXT NOT NULL DEFAULT '',
  mission_id TEXT,
  source TEXT NOT NULL DEFAULT 'mission',  -- mission | saved | goal
  seen INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',      -- new | improving | mastered
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, kind, key)
);
`);

/* Columns added after the first release; ALTER is skipped when they already exist. */
const cols = t => db.prepare('PRAGMA table_info(' + t + ')').all().map(c => c.name);
if (!cols('users').includes('hint_style')) db.exec("ALTER TABLE users ADD COLUMN hint_style TEXT NOT NULL DEFAULT 'steps'");
if (!cols('attempts').includes('drills')) db.exec("ALTER TABLE attempts ADD COLUMN drills TEXT NOT NULL DEFAULT '{}'");

export const json = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };
export const now = () => Date.now();
