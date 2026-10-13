import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../db/index.ts';
import { config } from '../config.ts';
import { logger } from '../lib/logger.ts';
import { DirStore } from './dirStore.ts';
import { FirestoreStore } from './firestoreStore.ts';
import type { RemoteStore } from './store.ts';

/**
 * 무료 호스팅(Render 무료 플랜 등)은 서버가 잠들거나 재배포되면 디스크가 초기화된다.
 * 그래서 SQLite DB 전체와 업로드 파일을 원격 저장소(Firebase Firestore)에 백업하고,
 * 서버가 시작될 때 복원한다.
 *
 *  - DB: 변경이 있으면 최대 SNAPSHOT_INTERVAL마다 db.serialize() 결과를 900KB 조각으로 나눠 저장.
 *        조각은 "버전_번호"로 저장하고 마지막에 메타 문서가 새 버전을 가리키게 해, 저장 도중 꺼져도 이전 버전이 온전하다.
 *  - 업로드: 저장될 때 한 번 올리고, 삭제될 때 지운다.
 */
const CHUNK = 900_000;
const SNAPSHOT_INTERVAL = Number(process.env.MOYEO_BACKUP_INTERVAL_MS ?? 30_000);
const ROOT = (process.env.FIREBASE_COLLECTION ?? 'moyeo').replace(/[^\w-]/g, '') || 'moyeo';

let store: RemoteStore | null = null;
let lastChanges = -1;
let snapshotting: Promise<void> | null = null;
let timer: NodeJS.Timeout | null = null;

function makeStore(): RemoteStore | null {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) return new FirestoreStore(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (process.env.MOYEO_PERSIST_DIR) return new DirStore(path.resolve(process.env.MOYEO_PERSIST_DIR));
  } catch (err) {
    logger.error('백업 저장소 설정이 올바르지 않아요. 백업 없이 시작합니다:', (err as Error).message);
  }
  return null;
}

export const backupEnabled = () => !!store;
export const backupName = () => store?.name ?? null;

const split = (buf: Buffer) => {
  const parts: Buffer[] = [];
  for (let i = 0; i < buf.length; i += CHUNK) parts.push(buf.subarray(i, i + CHUNK));
  return parts.length ? parts : [Buffer.alloc(0)];
};

async function writeChunks(prefixPath: string, ids: string[], parts: Buffer[]) {
  // 요청 하나가 10MB를 넘지 않도록 나눠서 쓴다
  for (let i = 0; i < parts.length; i += 8) {
    await store!.batch(parts.slice(i, i + 8).map((p, j) => ({ path: `${prefixPath}/${ids[i + j]}`, data: { data: p } })));
  }
}

async function readChunks(prefixPath: string, ids: string[]): Promise<Buffer | null> {
  const parts: Buffer[] = [];
  for (const id of ids) {
    const doc = await store!.get(`${prefixPath}/${id}`);
    const data = doc?.data;
    if (!Buffer.isBuffer(data) && !(data instanceof Uint8Array)) return null;
    parts.push(Buffer.from(data as Uint8Array));
  }
  return Buffer.concat(parts);
}

/** 서버 시작 전: 원격 백업이 있으면 DB 파일과 업로드 파일을 되살린다 */
export async function restoreFromBackup(): Promise<void> {
  store = makeStore();
  if (!store) return;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await restoreOnce();
      return;
    } catch (err) {
      logger.warn(`백업 복원 실패 (${attempt}/4): ${(err as Error).message}`);
      if (attempt < 4) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  // 복원하지 못한 채로 백업을 계속하면 빈 DB가 기존 백업을 덮어쓸 수 있으므로, 이번 실행에서는 백업을 끈다
  logger.error('백업에서 복원하지 못했어요. 기존 백업을 보호하려고 이번 실행에서는 백업 저장을 하지 않아요. Firebase 설정을 확인해 주세요.');
  store = null;
}

async function restoreOnce() {
  const s = store!;
  const meta = await s.get(`${ROOT}/db`);
  if (meta && typeof meta.version === 'string' && typeof meta.chunks === 'number') {
    const ids = Array.from({ length: meta.chunks }, (_, i) => `${meta.version}_${i}`);
    const buf = await readChunks(`${ROOT}/db/chunks`, ids);
    if (!buf || !buf.length) throw new Error('백업 조각이 비어 있거나 손상되었어요.');
    fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
    for (const f of [config.dbFile, `${config.dbFile}-wal`, `${config.dbFile}-shm`]) fs.rmSync(f, { force: true });
    fs.writeFileSync(config.dbFile, buf);
    logger.info(`백업에서 데이터베이스를 복원했어요 (${(buf.length / 1024).toFixed(0)}KB, ${s.name}).`);
  } else {
    logger.info(`${s.name}에 아직 백업이 없어요. 새로 시작합니다.`);
  }
  // 업로드 파일 복원 (실패해도 계정·대화 복원은 유지)
  try {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    const names = await s.list(`${ROOT}_files`);
    let restored = 0;
    for (const name of names) {
      const target = path.join(config.uploadsDir, path.basename(name));
      if (fs.existsSync(target)) continue;
      const m = await s.get(`${ROOT}_files/${name}`);
      if (!m || typeof m.chunks !== 'number') continue;
      const buf = await readChunks(`${ROOT}_files/${name}/chunks`, Array.from({ length: m.chunks }, (_, i) => String(i)));
      if (buf) {
        fs.writeFileSync(target, buf);
        restored++;
      }
    }
    if (restored) logger.info(`백업에서 업로드 파일 ${restored}개를 복원했어요.`);
  } catch (err) {
    logger.warn('업로드 파일 일부를 복원하지 못했어요:', (err as Error).message);
  }
}

const changesOf = (db: DB) => db.prepare('SELECT total_changes()').pluck().get() as number;

/** 지금 DB 전체를 백업한다 (바뀐 게 없으면 건너뜀) */
export function snapshotNow(db: DB, force = false): Promise<void> {
  if (!store) return Promise.resolve();
  if (snapshotting) return snapshotting;
  const changes = changesOf(db);
  if (!force && changes === lastChanges) return Promise.resolve();
  snapshotting = (async () => {
    try {
      const buf = db.serialize();
      const parts = split(buf);
      const version = Date.now().toString(36);
      const ids = parts.map((_, i) => `${version}_${i}`);
      await writeChunks(`${ROOT}/db/chunks`, ids, parts);
      await store!.batch([{ path: `${ROOT}/db`, data: { version, chunks: parts.length, size: buf.length, updatedAt: Date.now() } }]);
      lastChanges = changes;
      // 이전 버전 조각 정리
      const old = (await store!.list(`${ROOT}/db/chunks`)).filter((id) => !id.startsWith(`${version}_`));
      for (let i = 0; i < old.length; i += 400) {
        await store!.batch(old.slice(i, i + 400).map((id) => ({ path: `${ROOT}/db/chunks/${id}`, data: null })));
      }
    } catch (err) {
      logger.warn('백업 저장 실패 (다음에 다시 시도):', (err as Error).message);
    } finally {
      snapshotting = null;
    }
  })();
  return snapshotting;
}

export function startBackupLoop(db: DB) {
  if (!store) return;
  lastChanges = changesOf(db);
  // 처음 한 번은 꼭 저장 (빈 백업이었거나 마이그레이션이 적용됐을 수 있음)
  void snapshotNow(db, true);
  timer = setInterval(() => void snapshotNow(db), SNAPSHOT_INTERVAL);
  timer.unref();
}

/** 종료 직전: 남은 변경을 저장 */
export async function flushBackup(db: DB) {
  if (timer) clearInterval(timer);
  if (snapshotting) await snapshotting;
  await snapshotNow(db);
}

/** 업로드 파일 백업 (실패해도 서비스에는 영향 없음) */
export function backupFile(storedName: string, data: Buffer) {
  if (!store) return;
  const name = path.basename(storedName);
  const parts = split(data);
  void (async () => {
    try {
      await writeChunks(`${ROOT}_files/${name}/chunks`, parts.map((_, i) => String(i)), parts);
      await store!.batch([{ path: `${ROOT}_files/${name}`, data: { chunks: parts.length, size: data.length, createdAt: Date.now() } }]);
    } catch (err) {
      logger.warn('파일 백업 실패:', (err as Error).message);
    }
  })();
}

export function removeBackupFile(storedName: string) {
  if (!store) return;
  const name = path.basename(storedName);
  void (async () => {
    try {
      const ids = await store!.list(`${ROOT}_files/${name}/chunks`);
      await store!.batch([
        { path: `${ROOT}_files/${name}`, data: null },
        ...ids.map((id) => ({ path: `${ROOT}_files/${name}/chunks/${id}`, data: null })),
      ]);
    } catch (err) {
      logger.warn('파일 백업 삭제 실패:', (err as Error).message);
    }
  })();
}
