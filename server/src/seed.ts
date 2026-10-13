/* 체험용 데모 데이터: 계정 5개, 서버 2개, DM/그룹/채널 대화 기록 */
import fs from 'node:fs';
import { Perm } from '@moyeo/shared';
import { config } from './config.ts';
import { db, initDb } from './db/index.ts';
import { createUser } from './services/auth.ts';
import { acceptFriend, sendFriendRequest } from './services/relationships.ts';
import { createGroup, getOrCreateDm, markRead } from './services/conversations.ts';
import { getOrCreateThread, sendMessage, setPinned, toggleReaction } from './services/messages.ts';
import {
  createCategory, createInvite, createRole, createServer, insertChannel, joinByInvite, loadServerCtx, setMemberRoles,
} from './services/servers.ts';

const PASSWORD = 'moyeo1234';

async function main() {
  for (const f of [config.dbFile, `${config.dbFile}-wal`, `${config.dbFile}-shm`]) fs.rmSync(f, { force: true });
  initDb(config.dbFile);

  const people = [
    { username: 'minji', nickname: '민지', status: '오늘도 커피 세 잔째 ☕', color: '#F28C6B' },
    { username: 'junho', nickname: '준호', status: '주말엔 등산 🏔️', color: '#5DB7C9' },
    { username: 'seoyeon', nickname: '서연', status: '디자인 작업 중 🎨', color: '#A47CF2' },
    { username: 'dohyun', nickname: '도현', status: '코드 리뷰 환영', color: '#7CC68D' },
    { username: 'haeun', nickname: '하은', status: '', color: '#E879A6' },
  ];
  const ids: Record<string, number> = {};
  for (const p of people) {
    const u = await createUser(p.username, p.nickname, PASSWORD);
    db().prepare('UPDATE users SET status_message = ?, banner_color = ? WHERE id = ?').run(p.status, p.color, u.id);
    ids[p.username] = u.id;
  }
  const { minji, junho, seoyeon, dohyun, haeun } = ids as Record<string, number>;

  // 시간을 과거로 돌려 자연스러운 대화 기록을 만든다
  let clock = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const realNow = Date.now;
  Date.now = () => clock;
  const tick = (minutes: number) => { clock += minutes * 60 * 1000; };
  let n = 0;
  const say = (who: number, convId: number, content: string, extra: { replyToId?: number } = {}) => {
    tick(1 + Math.random() * 3);
    return sendMessage(who, { conversationId: convId, content, clientId: `seed-${++n}`, attachmentIds: [], replyToId: extra.replyToId }).message;
  };

  // 친구 관계: 민지는 모두와 친구, 나머지도 일부 친구. 하은 → 도현 요청은 대기 중
  const friends: [number, number, string][] = [
    [minji!, junho!, 'junho'], [minji!, seoyeon!, 'seoyeon'], [minji!, dohyun!, 'dohyun'], [minji!, haeun!, 'haeun'],
    [junho!, seoyeon!, 'seoyeon'], [junho!, dohyun!, 'dohyun'], [seoyeon!, haeun!, 'haeun'],
  ];
  for (const [a, b, bName] of friends) {
    sendFriendRequest(a, bName);
    acceptFriend(b, a);
  }
  sendFriendRequest(haeun!, 'dohyun');

  // DM: 민지 ↔ 준호
  const dm1 = getOrCreateDm(minji!, junho!).conv.id;
  say(junho!, dm1, '민지야 이번 주 토요일에 시간 돼?');
  say(minji!, dm1, '응 오후엔 괜찮아! 무슨 일이야?');
  const plan = say(junho!, dm1, '북한산 갈까 하는데 같이 가자 🏔️\n아침 9시에 **불광역** 어때?');
  say(minji!, dm1, '좋아! 근데 9시는 너무 이르다 ㅋㅋ', { replyToId: plan.id });
  say(junho!, dm1, '그럼 10시로 하자');
  const ok = say(minji!, dm1, '콜 👍 김밥은 내가 싸갈게');
  toggleReaction(junho!, ok.id, '❤️');
  say(junho!, dm1, '최고다 진짜 😆');
  markRead(minji!, dm1, 1e9);
  markRead(junho!, dm1, 1e9);
  tick(60 * 6);
  say(junho!, dm1, '참 등산화 있어? 없으면 내 거 빌려줄게');

  // DM: 민지 ↔ 서연
  const dm2 = getOrCreateDm(minji!, seoyeon!).conv.id;
  say(seoyeon!, dm2, '민지님 시안 2개 보내드렸어요! 확인 부탁드려요 🙏');
  say(minji!, dm2, '오 벌써요? 바로 볼게요');
  say(minji!, dm2, '두 번째 안 색감 너무 좋네요 ✨ 이걸로 가요!');
  say(seoyeon!, dm2, '넵! 그럼 그걸로 마무리할게요');
  markRead(minji!, dm2, 1e9);
  markRead(seoyeon!, dm2, 1e9);

  // DM: 민지 ↔ 도현 (코드 예시)
  const dm3 = getOrCreateDm(dohyun!, minji!).conv.id;
  say(dohyun!, dm3, '이 함수 리뷰 좀 해줄 수 있어?\n```ts\nexport function sum(list: number[]): number {\n  // 빈 배열이면 0\n  return list.reduce((a, b) => a + b, 0);\n}\n```');
  say(minji!, dm3, '깔끔한데? `reduce` 초기값 넣은 거 좋다 👍');
  markRead(minji!, dm3, 1e9);
  markRead(dohyun!, dm3, 1e9);

  // 그룹 채팅
  const group = createGroup(minji!, '주말 등산 모임 ⛰️', [junho!, seoyeon!, dohyun!]).id;
  say(minji!, group, '다들 토요일 10시 불광역 괜찮아?');
  say(junho!, group, '난 완전 좋아');
  say(seoyeon!, group, '저도 갈게요! 간식 챙겨갈게요 🍫');
  const notice = say(minji!, group, '~~9시~~ **10시** 불광역 2번 출구에서 만나요! 늦으면 커피 쏘기 ☕');
  setPinned(minji!, notice.id, true);
  say(dohyun!, group, `<@${minji}> 혹시 우비 필요할까? 비 소식 있던데`);
  say(minji!, group, '혹시 모르니까 챙기자!');
  markRead(minji!, group, 1e9);
  markRead(junho!, group, notice.id);

  // 서버 1: 개발자 모임
  const s1 = createServer(minji!, '퇴근 후 코딩 클럽');
  const ctx = () => loadServerCtx(s1, minji!);
  const inv1 = createInvite(ctx(), null, null);
  for (const u of [junho!, seoyeon!, dohyun!, haeun!]) { tick(5); joinByInvite(inv1.code, u); }
  const staff = createRole(ctx(), { name: '운영진', color: '#E5484D', permissions: Perm.MANAGE_CHANNELS | Perm.MANAGE_MESSAGES | Perm.KICK_MEMBERS | Perm.MANAGE_ROLES | Perm.CREATE_INVITE | Perm.MENTION_EVERYONE });
  const designer = createRole(ctx(), { name: '디자이너', color: '#6E56CF', permissions: 0 });
  const backend = createRole(ctx(), { name: '백엔드', color: '#12A594', permissions: 0 });
  setMemberRoles(ctx(), dohyun!, [staff, backend]);
  setMemberRoles(ctx(), seoyeon!, [designer]);
  setMemberRoles(ctx(), junho!, [backend]);
  const general = db().prepare(`SELECT id FROM conversations WHERE server_id = ? AND kind = 'text' ORDER BY id LIMIT 1`).pluck().get(s1) as number;
  const cat2 = createCategory(ctx(), '스터디');
  const ts = insertChannel(s1, '타입스크립트', 'text', cat2, 'TS 질문과 팁을 나눠요');
  const showcase = insertChannel(s1, '자랑하기', 'text', cat2, '만든 것을 자랑해 주세요 ✨');
  insertChannel(s1, '모각코', 'voice', cat2, '');
  say(minji!, general, '<@everyone> 퇴근 후 코딩 클럽에 오신 걸 환영해요! 🎉 자기소개 한 줄씩 부탁해요');
  say(junho!, general, '안녕하세요 백엔드 하는 준호입니다 🙋‍♂️');
  say(seoyeon!, general, '디자인하는 서연이에요. 프론트도 조금씩 공부 중!');
  say(dohyun!, general, '도현입니다. 코드 리뷰 언제든 환영해요');
  say(haeun!, general, '하은이에요! 이제 막 코딩 시작했어요 잘 부탁드려요 😊');
  const q = say(haeun!, ts, '`interface`랑 `type` 차이가 뭔가요?');
  getOrCreateThread(dohyun!, q.id);
  const thread = db().prepare('SELECT thread_id FROM messages WHERE id = ?').pluck().get(q.id) as number;
  say(dohyun!, thread, '대부분 비슷하게 쓸 수 있어요. `interface`는 선언 병합이 되고, `type`은 유니온 같은 걸 표현할 수 있어요.');
  say(minji!, thread, '팀에서 하나로 통일하는 게 제일 중요해요 ㅎㅎ');
  say(haeun!, thread, '아하 이해했어요 감사합니다! 🙇‍♀️');
  const show = say(seoyeon!, showcase, '주말에 만든 날씨 앱이에요 → https://example.com/weather-demo\n피드백 환영!');
  toggleReaction(minji!, show.id, '🔥');
  toggleReaction(junho!, show.id, '🔥');
  toggleReaction(dohyun!, show.id, '👏');
  for (const u of [minji!, junho!, seoyeon!, dohyun!]) markRead(u, general, 1e9);

  // 서버 2: 보드게임 동호회
  const s2 = createServer(junho!, '보드게임 동호회 🎲');
  const ctx2 = () => loadServerCtx(s2, junho!);
  const inv2 = createInvite(ctx2(), null, null);
  for (const u of [minji!, haeun!]) joinByInvite(inv2.code, u);
  const host = createRole(ctx2(), { name: '모임장', color: '#FFB224', permissions: Perm.MANAGE_MESSAGES | Perm.MENTION_EVERYONE });
  setMemberRoles(ctx2(), junho!, [host]);
  const g2 = db().prepare(`SELECT id FROM conversations WHERE server_id = ? AND kind = 'text' ORDER BY id LIMIT 1`).pluck().get(s2) as number;
  say(junho!, g2, '이번 달 정모는 금요일 저녁 7시! 🎲 장소는 강남역 보드게임카페');
  say(minji!, g2, '스플렌더 가져갈게요!');
  say(haeun!, g2, '저 처음 가는데 룰 몰라도 괜찮나요?');
  say(junho!, g2, '물론이죠! 다 알려드려요 😄');

  Date.now = realNow;
  console.log('\n✔ 데모 데이터를 만들었어요!\n');
  console.log('  아래 계정으로 로그인해 보세요 (비밀번호는 모두 \x1b[1m' + PASSWORD + '\x1b[0m):');
  for (const p of people) console.log(`   • ${p.username.padEnd(8)} ${p.nickname}`);
  console.log(`\n  초대 코드: ${inv1.code} (퇴근 후 코딩 클럽), ${inv2.code} (보드게임 동호회)\n`);
}

main().catch((err) => {
  console.error('데모 데이터 생성 실패:', err);
  process.exit(1);
});
