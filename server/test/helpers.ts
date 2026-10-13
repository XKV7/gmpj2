import { initDb } from '../src/db/index.ts';
import { createUser } from '../src/services/auth.ts';
import { acceptFriend, sendFriendRequest } from '../src/services/relationships.ts';

export function freshDb() {
  return initDb(':memory:');
}

export async function makeUsers(...names: string[]) {
  const out: Record<string, number> = {};
  for (const n of names) out[n] = (await createUser(n, n.toUpperCase(), 'password1')).id;
  return out;
}

export function befriend(a: number, b: number, bName: string) {
  sendFriendRequest(a, bName);
  acceptFriend(b, a);
}

let seq = 0;
export const cid = () => `test-client-${++seq}-${Date.now()}`;
