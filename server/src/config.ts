import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.MOYEO_DATA_DIR ?? path.join(serverRoot, 'data'));

export const config = {
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test' || process.env.VITEST === 'true',
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 3001),
  /** LAN 기기에서 통화(WebRTC)를 쓰려면 HTTPS가 필요하다 — 자체 서명 인증서로 여는 게이트웨이 포트 */
  httpsPort: Number(process.env.HTTPS_PORT ?? 5443),
  httpsEnabled: process.env.MOYEO_HTTPS !== '0',
  clientDevPort: Number(process.env.CLIENT_PORT ?? 5173),
  dataDir,
  dbFile: process.env.MOYEO_DB ?? path.join(dataDir, 'moyeo.db'),
  uploadsDir: path.join(dataDir, 'uploads'),
  certDir: path.join(dataDir, 'certs'),
  clientDist: path.resolve(serverRoot, '../client/dist'),
  sessionCookie: 'moyeo_sid',
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
  /** 레이트 리밋을 끌 때(E2E 테스트용) */
  relaxedLimits: process.env.MOYEO_RELAXED_LIMITS === '1',
};
