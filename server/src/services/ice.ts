import { config } from '../config.ts';
import { logger } from '../lib/logger.ts';

export interface IceServer { urls: string | string[]; username?: string; credential?: string }

const STUN: IceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

let cache: { servers: IceServer[]; expiresAt: number } | null = null;

/**
 * 브라우저가 WebRTC 연결에 쓸 ICE 서버 목록.
 * 같은 와이파이라면 STUN만으로 충분하지만, 서로 다른 네트워크(통신사·회사 방화벽 등)에서는
 * 중계용 TURN 서버가 있어야 안정적으로 연결된다. 아래 셋 중 설정된 것을 쓴다.
 *  1) Cloudflare Calls TURN (CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN) — 짧게 유효한 자격 증명 발급
 *  2) Metered TURN (METERED_DOMAIN + METERED_API_KEY)
 *  3) 직접 지정 (TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL)
 */
export async function getIceServers(): Promise<IceServer[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.servers;
  const t = config.turn;
  let turn: IceServer[] = [];
  let ttlMs = 60 * 60 * 1000;
  try {
    if (t.cloudflareKeyId && t.cloudflareApiToken) {
      const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${t.cloudflareKeyId}/credentials/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t.cloudflareApiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 86400 }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Cloudflare TURN 응답 ${res.status}`);
      const body = (await res.json()) as { iceServers: IceServer | IceServer[] };
      turn = Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers];
      ttlMs = 12 * 60 * 60 * 1000;
    } else if (t.meteredDomain && t.meteredApiKey) {
      const res = await fetch(`https://${t.meteredDomain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(t.meteredApiKey)}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Metered TURN 응답 ${res.status}`);
      turn = (await res.json()) as IceServer[];
    } else if (t.urls.length) {
      turn = [{ urls: t.urls, username: t.username, credential: t.credential }];
      ttlMs = 24 * 60 * 60 * 1000;
    }
  } catch (err) {
    logger.warn('TURN 서버 정보를 가져오지 못했어요. STUN만 사용합니다:', (err as Error).message);
    ttlMs = 60 * 1000;
  }
  const servers = [...STUN, ...turn];
  cache = { servers, expiresAt: Date.now() + ttlMs };
  return servers;
}

export const turnConfigured = () => {
  const t = config.turn;
  return !!((t.cloudflareKeyId && t.cloudflareApiToken) || (t.meteredDomain && t.meteredApiKey) || t.urls.length);
};
