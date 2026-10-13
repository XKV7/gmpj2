import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** 인터넷에 배포된 경우의 공개 주소 (Render는 RENDER_EXTERNAL_URL을 자동으로 넣어 준다) */
const publicUrl = (process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL ?? '').replace(/\/$/, '');

const dataDir = path.resolve(process.env.MOYEO_DATA_DIR ?? path.join(serverRoot, 'data'));

export const config = {
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test' || process.env.VITEST === 'true',
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 3001),
  /** LAN 기기에서 통화(WebRTC)를 쓰려면 HTTPS가 필요하다 — 자체 서명 인증서로 여는 게이트웨이 포트 */
  httpsPort: Number(process.env.HTTPS_PORT ?? 5443),
  // 클라우드에서는 호스팅 서비스가 HTTPS를 맡으므로 자체 게이트웨이는 기본으로 끈다
  httpsEnabled: process.env.MOYEO_HTTPS ? process.env.MOYEO_HTTPS !== '0' : !publicUrl,
  publicUrl,
  clientDevPort: Number(process.env.CLIENT_PORT ?? 5173),
  dataDir,
  dbFile: process.env.MOYEO_DB ?? path.join(dataDir, 'moyeo.db'),
  uploadsDir: path.join(dataDir, 'uploads'),
  certDir: path.join(dataDir, 'certs'),
  clientDist: path.resolve(serverRoot, '../client/dist'),
  sessionCookie: 'moyeo_sid',
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
  /** 레이트 리밋을 끌 때(E2E 테스트용) */
  /** 다른 네트워크끼리 통화하기 위한 TURN 서버 설정 (선택) */
  turn: {
    urls: (process.env.TURN_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    username: process.env.TURN_USERNAME ?? '',
    credential: process.env.TURN_CREDENTIAL ?? '',
    meteredDomain: process.env.METERED_DOMAIN ?? '',
    meteredApiKey: process.env.METERED_API_KEY ?? '',
    cloudflareKeyId: process.env.CLOUDFLARE_TURN_KEY_ID ?? '',
    cloudflareApiToken: process.env.CLOUDFLARE_TURN_API_TOKEN ?? '',
  },
  relaxedLimits: process.env.MOYEO_RELAXED_LIMITS === '1',
};
