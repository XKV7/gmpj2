import { useEffect, useReducer } from 'react';
import { isRestrictionActive, type MemberRestriction, type Server } from '@moyeo/shared';

/** 서버에서 그 멤버에게 지금 걸린 활동 제한. 끝나는 시각이 되면 저절로 다시 그려진다. */
export function useRestriction(server: Server | undefined, userId: number): MemberRestriction | null {
  const r = server?.members.find((m) => m.userId === userId)?.restriction ?? null;
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const until = r?.until ?? null;
  useEffect(() => {
    if (until === null) return;
    const ms = until - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(tick, Math.min(ms + 50, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [until]);
  return isRestrictionActive(r) ? r : null;
}
