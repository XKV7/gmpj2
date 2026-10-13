import fs from 'node:fs';
import path from 'node:path';
import type { DocData, RemoteStore } from './store.ts';

/** 로컬 폴더를 원격 저장소처럼 쓰는 구현 (재시작 복원 동작을 직접 확인할 때) */
export class DirStore implements RemoteStore {
  readonly name: string;
  constructor(private root: string) {
    this.name = `로컬 폴더(${root})`;
    fs.mkdirSync(root, { recursive: true });
  }

  private file(p: string) {
    return path.join(this.root, ...p.split('/')) + '.json';
  }

  async get(p: string) {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file(p), 'utf8')) as Record<string, unknown>;
      for (const [k, v] of Object.entries(raw)) {
        if (v && typeof v === 'object' && '__b64' in v) raw[k] = Buffer.from((v as { __b64: string }).__b64, 'base64');
      }
      return raw;
    } catch {
      return null;
    }
  }

  async batch(ops: { path: string; data: DocData | null }[]) {
    for (const op of ops) {
      const f = this.file(op.path);
      if (!op.data) {
        fs.rmSync(f, { force: true });
        continue;
      }
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(op.data)) out[k] = Buffer.isBuffer(v) ? { __b64: v.toString('base64') } : v;
      fs.writeFileSync(f, JSON.stringify(out));
    }
  }

  async list(collectionPath: string) {
    const dir = path.join(this.root, ...collectionPath.split('/'));
    try {
      return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
    } catch {
      return [];
    }
  }
}
