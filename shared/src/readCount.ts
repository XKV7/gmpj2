import type { ConversationMember } from './types.ts';

/**
 * 메시지 옆에 표시할 "아직 안 읽은 사람 수".
 * - 보낸 사람 본인은 제외
 * - 메시지가 올라온 뒤에 들어온 사람은 제외 (joinedAfterId >= messageId)
 * - lastReadId < messageId 인 사람만 센다
 */
export function unreadReaderCount(members: ConversationMember[], messageId: number, authorId: number): number {
  let count = 0;
  for (const m of members) {
    if (m.userId === authorId) continue;
    if (m.joinedAfterId >= messageId) continue;
    if (m.lastReadId < messageId) count++;
  }
  return count;
}
