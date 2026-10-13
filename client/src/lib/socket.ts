import { io, type Socket } from 'socket.io-client';
import type { AckResult, ClientToServerEvents, ServerToClientEvents } from '@moyeo/shared';

export type MoyeoSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: MoyeoSocket = io({
  path: '/socket.io/',
  autoConnect: false,
  withCredentials: true,
  transports: ['websocket', 'polling'],
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

type AckEvents = {
  [K in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[K]> extends [unknown, (res: AckResult<infer T>) => void] ? K : never;
}[keyof ClientToServerEvents];

type AckData<K extends AckEvents> = Parameters<ClientToServerEvents[K]> extends [unknown, (res: AckResult<infer T>) => void] ? T : never;

/** ack 응답을 Promise로. 연결이 없거나 시간 초과면 reject */
export function emitAck<K extends AckEvents>(event: K, payload: unknown, timeoutMs = 10_000): Promise<AckData<K>> {
  return new Promise((resolve, reject) => {
    if (!socket.connected) {
      reject(Object.assign(new Error('서버와 연결이 끊겨 있어요. 다시 연결되면 시도해 주세요.'), { offline: true }));
      return;
    }
    // @ts-expect-error 제네릭 이벤트 이름으로 emit
    socket.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: AckResult<AckData<K>>) => {
      if (err) reject(Object.assign(new Error('응답이 늦어지고 있어요. 다시 시도해 주세요.'), { offline: true }));
      else if (res.ok) resolve(res.data);
      else reject(new Error(res.error));
    });
  });
}

// 개발 모드에서만: 자동 테스트(E2E)가 연결 끊김을 흉내 낼 수 있도록 노출
if (import.meta.env.DEV) (window as unknown as { __moyeo: unknown }).__moyeo = { socket };
