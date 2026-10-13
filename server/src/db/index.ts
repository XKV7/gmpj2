import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrations } from './migrations.ts';
import { logger } from '../lib/logger.ts';

export type DB = Database.Database;

let instance: DB | null = null;

export function openDatabase(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  return db;
}

/** 아직 적용되지 않은 마이그레이션을 트랜잭션으로 적용한다. 적용한 개수를 돌려준다. */
export function migrate(db: DB): number {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)');
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').pluck().all() as number[]);
  let count = 0;
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, Date.now());
    })();
    logger.info(`마이그레이션 적용: v${m.version} ${m.name}`);
    count++;
  }
  return count;
}

export function initDb(file: string): DB {
  instance?.close();
  instance = openDatabase(file);
  migrate(instance);
  return instance;
}

export function db(): DB {
  if (!instance) throw new Error('데이터베이스가 초기화되지 않았습니다.');
  return instance;
}

export function closeDb() {
  instance?.close();
  instance = null;
}
