import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { DocData, RemoteStore } from './store.ts';

/** FIREBASE_SERVICE_ACCOUNT: 서비스 계정 키 JSON 원문 또는 그 base64 */
export function parseServiceAccount(raw: string): Record<string, string> {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const json = JSON.parse(text) as Record<string, string>;
  if (!json.project_id || !json.client_email || !json.private_key) throw new Error('서비스 계정 키에 project_id/client_email/private_key가 없어요.');
  return json;
}

export class FirestoreStore implements RemoteStore {
  readonly name = 'Firebase Firestore';
  private db: Firestore;

  constructor(serviceAccountRaw: string) {
    const sa = parseServiceAccount(serviceAccountRaw);
    const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
    this.db = getFirestore(app);
  }

  async get(path: string) {
    const snap = await this.db.doc(path).get();
    return snap.exists ? (snap.data() as DocData) : null;
  }

  async batch(ops: { path: string; data: DocData | null }[]) {
    if (!ops.length) return;
    const b = this.db.batch();
    for (const op of ops) {
      const ref = this.db.doc(op.path);
      if (op.data) b.set(ref, op.data);
      else b.delete(ref);
    }
    await b.commit();
  }

  async list(collectionPath: string) {
    const refs = await this.db.collection(collectionPath).listDocuments();
    return refs.map((r) => r.id);
  }
}
