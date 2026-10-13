import { config } from '../config.ts';
import { tooMany } from './errors.ts';

/** 고정 윈도 카운터 기반의 메모리 레이트 리미터 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private limit: number, private windowMs: number, private message?: string) {
    setInterval(() => this.sweep(), Math.max(windowMs, 30_000)).unref();
  }

  /** 허용되면 true */
  try(key: string): boolean {
    if (config.relaxedLimits) return true;
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.limit;
  }

  consume(key: string) {
    if (!this.try(key)) throw tooMany(this.message);
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private sweep() {
    const now = Date.now();
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}

export const limits = {
  login: new RateLimiter(10, 5 * 60_000, '로그인 시도가 너무 많아요. 5분 뒤에 다시 시도해 주세요.'),
  register: new RateLimiter(10, 60 * 60_000, '가입 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'),
  message: new RateLimiter(12, 5_000, '메시지를 너무 빨리 보내고 있어요. 잠시만 천천히!'),
  upload: new RateLimiter(30, 60_000, '업로드가 너무 많아요. 1분 뒤에 다시 시도해 주세요.'),
  general: new RateLimiter(120, 10_000),
  friendRequest: new RateLimiter(20, 60_000, '친구 요청을 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요.'),
};
