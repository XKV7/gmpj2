// E2E 전용 서버: 빈 데이터베이스로 API 서버 + Vite 개발 서버를 띄운다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'e2e', '.data');
fs.rmSync(dataDir, { recursive: true, force: true });

const env = {
  ...process.env,
  MOYEO_DATA_DIR: dataDir,
  MOYEO_RELAXED_LIMITS: '1',
  MOYEO_HTTPS: '0',
  PORT: '3101',
  CLIENT_PORT: '5174',
};
const procs = [
  spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.join(root, 'server'), env, stdio: 'inherit' }),
  spawn('npx', ['vite', '--port', '5174', '--strictPort'], { cwd: path.join(root, 'client'), env, stdio: 'inherit' }),
];
const stop = () => {
  for (const p of procs) p.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && stop());
